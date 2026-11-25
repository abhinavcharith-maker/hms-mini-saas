"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Calendar, Download, FileDown, Search, Sparkles, Users } from "lucide-react";
import {
  AnimatedModal,
  BubblyButton,
  EmptyState,
  SkeletonBox,
  SpringCard,
} from "@/components/ui/MotionPrimitives";
import { useToast } from "@/components/providers/AppProviders";
import {
  formatAccurateDateTime,
  getLocalDateInputValue,
  getLocalDateTimeInputValue,
} from "@/lib/datetime";

interface PatientSearchRow {
  id: string;
  uhid: string;
  fullName: string;
  age: number | null;
  gender: string;
  phone: string;
  registeredAt: string;
  _count: {
    opVisits: number;
    ipAdmissions: number;
    pharmacyReferrals: number;
    labReferrals: number;
  };
}

function getLocalStartDateTimeDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${getLocalDateInputValue(d)}T00:00`;
}

export default function HospitalPatientHistoryPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportPreset, setExportPreset] = useState<
    "all" | "1d" | "7d" | "30d" | "month" | "custom"
  >("all");
  const [exportFrom, setExportFrom] = useState(() =>
    getLocalStartDateTimeDaysAgo(0)
  );
  const [exportTo, setExportTo] = useState(() => getLocalDateTimeInputValue());
  const [exportingAllPdf, setExportingAllPdf] = useState(false);
  const [patientQuery, setPatientQuery] = useState("");
  const [preset, setPreset] = useState<"all" | "1d" | "7d" | "30d" | "custom">("all");
  const [fromDateTime, setFromDateTime] = useState(() =>
    getLocalStartDateTimeDaysAgo(0)
  );
  const [toDateTime, setToDateTime] = useState(() =>
    getLocalDateTimeInputValue()
  );
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    pageSize: 100,
    totalPages: 1,
  });
  const [patients, setPatients] = useState<PatientSearchRow[]>([]);

  const applyPreset = (next: "all" | "1d" | "7d" | "30d" | "custom") => {
    setRefreshing(true);
    setPage(1);
    setPreset(next);
    const nowStr = getLocalDateTimeInputValue();
    if (next === "1d") {
      setFromDateTime(getLocalStartDateTimeDaysAgo(0));
      setToDateTime(nowStr);
    } else if (next === "7d") {
      setFromDateTime(getLocalStartDateTimeDaysAgo(6));
      setToDateTime(nowStr);
    } else if (next === "30d") {
      setFromDateTime(getLocalStartDateTimeDaysAgo(29));
      setToDateTime(nowStr);
    }
  };

  const loadPatients = useCallback(async () => {
    try {
      const qs = new URLSearchParams({
        page: String(page),
        limit: "100",
      });
      if (patientQuery.trim()) qs.set("q", patientQuery.trim());
      if (preset !== "all") {
        if (fromDateTime) qs.set("from", fromDateTime);
        if (toDateTime) qs.set("to", toDateTime);
        qs.set("tzOffset", String(new Date().getTimezoneOffset()));
      }
      const res = await fetch(`/api/hospital/patients?${qs.toString()}`);
      if (res.ok) {
        const d = await res.json();
        setPatients(d.patients ?? []);
        if (d.pagination) {
          setPagination(d.pagination);
        }
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [patientQuery, preset, fromDateTime, toDateTime, page]);

  useEffect(() => {
    void loadPatients();
  }, [loadPatients]);

  const handleDownloadPatientPdf = async (p: PatientSearchRow) => {
    setPdfBusyId(p.id);
    try {
      const tzOffset = new Date().getTimezoneOffset();
      const res = await fetch(
        `/api/hospital/patients/${encodeURIComponent(p.id)}/export-pdf?tzOffset=${tzOffset}`
      );
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        toast({
          type: "error",
          title: "PDF Download Failed",
          message: errData?.error ?? "Unable to generate patient audit report.",
        });
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? `patient-audit-${p.uhid}.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({
        type: "success",
        title: "Patient Audit Report Downloaded",
        message: `Complete history PDF saved for ${p.fullName} (${p.uhid}).`,
      });
    } finally {
      setPdfBusyId(null);
    }
  };

  const openExportAllModal = () => {
    setExportPreset(preset);
    setExportFrom(fromDateTime);
    setExportTo(getLocalDateTimeInputValue());
    setExportModalOpen(true);
  };

  const applyExportPreset = (
    next: "all" | "1d" | "7d" | "30d" | "month" | "custom"
  ) => {
    setExportPreset(next);
    const nowStr = getLocalDateTimeInputValue();
    if (next === "1d") {
      setExportFrom(getLocalStartDateTimeDaysAgo(0));
      setExportTo(nowStr);
    } else if (next === "7d") {
      setExportFrom(getLocalStartDateTimeDaysAgo(6));
      setExportTo(nowStr);
    } else if (next === "30d") {
      setExportFrom(getLocalStartDateTimeDaysAgo(29));
      setExportTo(nowStr);
    } else if (next === "month") {
      const now = new Date();
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      setExportFrom(`${getLocalDateInputValue(firstOfMonth)}T00:00`);
      setExportTo(nowStr);
    }
  };

  const handleDownloadAllPatientsPdf = async () => {
    setExportingAllPdf(true);
    try {
      const qs = new URLSearchParams({
        tzOffset: String(new Date().getTimezoneOffset()),
      });
      if (exportPreset !== "all") {
        if (exportFrom) qs.set("from", exportFrom);
        if (exportTo) qs.set("to", exportTo);
      }
      const res = await fetch(`/api/hospital/patients/export-pdf?${qs.toString()}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        toast({
          type: "error",
          title: "Export Failed",
          message: errData?.error ?? "Unable to generate all-patients history PDF.",
        });
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? "all-patients-history.pdf";
      const countHeader = res.headers.get("X-Export-Patients-Count");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setExportModalOpen(false);
      toast({
        type: "success",
        title: "All Patients Data Downloaded",
        message: countHeader
          ? `Exported complete individual history PDF for ${countHeader} patient(s).`
          : "Complete multi-patient history PDF downloaded.",
      });
    } finally {
      setExportingAllPdf(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-[#0f241d]">
            Patient History
          </h1>
          <p className="mt-1 text-sm text-[#466356]">
            Filter by patient or timeline date &amp; time range and inspect full medical and referral records.
          </p>
        </div>

        <motion.button
          type="button"
          whileHover={{ scale: 1.03, y: -1 }}
          whileTap={{ scale: 0.97 }}
          onClick={openExportAllModal}
          className="group relative inline-flex items-center gap-2.5 self-start sm:self-auto overflow-hidden rounded-2xl bg-gradient-to-r from-[#0d4a38] via-[#059669] to-[#0f766e] px-5 py-3 text-xs font-extrabold text-white shadow-lg shadow-emerald-900/25 ring-1 ring-emerald-400/40 transition-all hover:shadow-xl hover:shadow-emerald-900/30 cursor-pointer"
        >
          <span className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-white/0 via-white/15 to-white/0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-white/15 backdrop-blur-xs">
            <Download className="h-4 w-4" />
          </span>
          <span className="flex flex-col text-left leading-tight">
            <span className="inline-flex items-center gap-1 text-xs font-extrabold tracking-tight">
              Download Every Patient Data
              <Sparkles className="h-3 w-3 text-emerald-200" />
            </span>
            <span className="text-[10px] font-medium text-emerald-100/90">
              Complete timeline PDF archive
            </span>
          </span>
        </motion.button>
      </div>

      <SpringCard className="p-6 space-y-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6c877a]" />
            <input
              autoFocus
              value={patientQuery}
              onChange={(e) => {
                setRefreshing(true);
                setPage(1);
                setPatientQuery(e.target.value);
              }}
              placeholder="Search patient by UHID, name, or phone..."
              className="w-full rounded-xl border border-[#cfe2d6] bg-white py-2.5 pl-10 pr-4 text-sm"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#314c40]">
              <Calendar className="h-3.5 w-3.5 text-emerald-600" />
              Timeline:
            </span>
            {(
              [
                { id: "all", label: "All Time" },
                { id: "1d", label: "1 Day" },
                { id: "7d", label: "7 Days" },
                { id: "30d", label: "30 Days" },
                { id: "custom", label: "Date & Time" },
              ] as const
            ).map((opt) => {
              const active = preset === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => applyPreset(opt.id)}
                  className={`relative rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors duration-200 cursor-pointer ${
                    active
                      ? "border-emerald-500 text-[#0d4a38]"
                      : "border-[#cfe2d6] bg-white text-[#466356] hover:bg-emerald-50/40"
                  }`}
                >
                  {active ? (
                    <motion.span
                      layoutId="patient-history-timeframe-pill"
                      transition={{ type: "spring", stiffness: 380, damping: 28 }}
                      className="absolute inset-0 rounded-xl bg-[#dff4e8]"
                    />
                  ) : null}
                  <span className="relative z-10">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <AnimatePresence initial={false}>
          {preset !== "all" ? (
            <motion.div
              key="patient-history-datetime-bar"
              initial={{ opacity: 0, height: 0, y: -6 }}
              animate={{ opacity: 1, height: "auto", y: 0 }}
              exit={{ opacity: 0, height: 0, y: -6 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#dcece2] bg-[#f8fcfa] p-3 text-xs">
                <label className="font-semibold text-[#314c40]">
                  From Date & Time
                  <input
                    type="datetime-local"
                    value={fromDateTime}
                    onChange={(e) => {
                      setRefreshing(true);
                      setPage(1);
                      setPreset("custom");
                      setFromDateTime(e.target.value);
                    }}
                    className="ml-2 rounded-xl border border-[#cfe2d6] bg-white px-2.5 py-1.5 text-xs font-normal text-[#0f241d]"
                  />
                </label>
                <label className="font-semibold text-[#314c40]">
                  To Date & Time
                  <input
                    type="datetime-local"
                    value={toDateTime}
                    onChange={(e) => {
                      setRefreshing(true);
                      setPage(1);
                      setPreset("custom");
                      setToDateTime(e.target.value);
                    }}
                    className="ml-2 rounded-xl border border-[#cfe2d6] bg-white px-2.5 py-1.5 text-xs font-normal text-[#0f241d]"
                  />
                </label>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {loading ? (
          <SkeletonBox className="h-48" />
        ) : (
          <motion.div
            key={`${preset}-${page}`}
            initial={{ opacity: 0.72, y: 4 }}
            animate={{ opacity: refreshing ? 0.65 : 1, y: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="space-y-4"
          >
            {patients.length === 0 ? (
              <EmptyState
                icon={<Users className="h-5 w-5" />}
                title="No Patients Found"
                description="No registered patient matched your search or selected timeline date and time range."
              />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#dcece2] text-[11px] uppercase text-[#5b796b]">
                        <th className="py-3 pr-3">UHID</th>
                        <th className="py-3 px-3">Patient Name</th>
                        <th className="py-3 px-3">Phone</th>
                        <th className="py-3 px-3">Registered At</th>
                        <th className="py-3 px-3">OP / IP / Referrals</th>
                        <th className="py-3 pl-3 text-right">Timeline</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#eaf4ee]">
                      {patients.map((p) => (
                        <tr key={p.id} className="hover:bg-[#f7fbf8] transition-colors">
                          <td className="py-3 pr-3">
                            <Link
                              href={`/hospital/patients/${encodeURIComponent(p.uhid)}`}
                              className="font-mono-id rounded-lg bg-emerald-50 px-2.5 py-1 font-bold text-[#0d4a38] border border-emerald-200 hover:bg-emerald-100"
                            >
                              {p.uhid}
                            </Link>
                          </td>
                          <td className="py-3 px-3 font-semibold text-[#0f241d]">
                            {p.fullName}
                          </td>
                          <td className="py-3 px-3">{p.phone}</td>
                          <td className="py-3 px-3 text-[#5b796b]">
                            {formatAccurateDateTime(p.registeredAt)}
                          </td>
                          <td className="py-3 px-3">
                            {p._count.opVisits} OP · {p._count.ipAdmissions} IP ·{" "}
                            {p._count.pharmacyReferrals + p._count.labReferrals} Refs
                          </td>
                          <td className="py-3 pl-3 text-right">
                            <div className="inline-flex flex-wrap items-center justify-end gap-2">
                              <button
                                type="button"
                                disabled={Boolean(pdfBusyId)}
                                onClick={() => void handleDownloadPatientPdf(p)}
                                className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50/80 px-2.5 py-1 text-[11px] font-semibold text-[#0d4a38] hover:bg-emerald-100 disabled:opacity-50 transition-colors cursor-pointer"
                                title="Download complete patient history PDF for audit"
                              >
                                <FileDown className="h-3.5 w-3.5" />
                                {pdfBusyId === p.id ? "Generating..." : "Download Entire Data"}
                              </button>
                              <Link
                                href={`/hospital/patients/${encodeURIComponent(p.uhid)}`}
                                className="font-semibold text-emerald-700 hover:underline whitespace-nowrap"
                              >
                                Open History →
                              </Link>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-[#eaf4ee] pt-3 text-xs text-[#466356]">
                  <span>
                    Showing {(pagination.page - 1) * pagination.pageSize + 1}–
                    {Math.min(
                      pagination.page * pagination.pageSize,
                      pagination.total
                    )}{" "}
                    of {pagination.total} patient(s) · Page {pagination.page} of{" "}
                    {pagination.totalPages} (max 100 per page)
                  </span>
                  {pagination.totalPages > 1 ? (
                    <div className="flex gap-2">
                      <BubblyButton
                        variant="outline"
                        className="px-3 py-1.5 text-xs"
                        disabled={pagination.page <= 1}
                        onClick={() => {
                          setRefreshing(true);
                          setPage((prev) => Math.max(1, prev - 1));
                        }}
                      >
                        Previous
                      </BubblyButton>
                      <BubblyButton
                        variant="outline"
                        className="px-3 py-1.5 text-xs"
                        disabled={pagination.page >= pagination.totalPages}
                        onClick={() => {
                          setRefreshing(true);
                          setPage((prev) =>
                            Math.min(pagination.totalPages, prev + 1)
                          );
                        }}
                      >
                        Next
                      </BubblyButton>
                    </div>
                  ) : null}
                </div>
              </>
            )}
          </motion.div>
        )}
      </SpringCard>

      {/* Download Every Patient Data (Timeline Selection Modal) */}
      <AnimatedModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        title="Download Every Patient's Complete History"
        subtitle="Generates a comprehensive PDF with every patient's individual OP visits, IP stays, prescriptions, lab referrals & billing receipts."
        maxWidth="max-w-xl"
      >
        <div className="space-y-4 text-xs">
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-[#0f241d]">
              <Calendar className="h-3.5 w-3.5 text-emerald-700" />
              Select Download Timeline
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {(
                [
                  { id: "all", label: "All Time" },
                  { id: "1d", label: "Today (1 Day)" },
                  { id: "7d", label: "Last 7 Days" },
                  { id: "30d", label: "Last 30 Days" },
                  { id: "month", label: "This Month" },
                  { id: "custom", label: "Custom Range" },
                ] as const
              ).map((opt) => {
                const active = exportPreset === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => applyExportPreset(opt.id)}
                    className={`rounded-xl border px-3 py-2.5 text-xs font-bold transition-all cursor-pointer ${
                      active
                        ? "border-emerald-500 bg-[#dff4e8] text-[#0d4a38] shadow-xs"
                        : "border-[#cfe2d6] bg-white text-[#466356] hover:bg-emerald-50/50"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {exportPreset !== "all" ? (
            <div className="grid gap-3 sm:grid-cols-2 rounded-2xl border border-[#dcece2] bg-[#f8fcfa] p-3.5">
              <label className="block font-semibold text-[#314c40]">
                From Date &amp; Time
                <input
                  type="datetime-local"
                  value={exportFrom}
                  onChange={(e) => {
                    setExportPreset("custom");
                    setExportFrom(e.target.value);
                  }}
                  className="mt-1.5 w-full rounded-xl border border-[#cfe2d6] bg-white px-3 py-2 text-xs font-normal text-[#0f241d]"
                />
              </label>
              <label className="block font-semibold text-[#314c40]">
                To Date &amp; Time
                <input
                  type="datetime-local"
                  value={exportTo}
                  onChange={(e) => {
                    setExportPreset("custom");
                    setExportTo(e.target.value);
                  }}
                  className="mt-1.5 w-full rounded-xl border border-[#cfe2d6] bg-white px-3 py-2 text-xs font-normal text-[#0f241d]"
                />
              </label>
            </div>
          ) : (
            <div className="rounded-2xl border border-[#dcece2] bg-[#f8fcfa] px-4 py-3 text-[#466356]">
              Exports <strong>every patient</strong> in your hospital along with their complete individual OP, IP, Pharmacy, Laboratory, and Billing histories.
            </div>
          )}

          <div className="flex justify-end gap-2.5 pt-2">
            <BubblyButton
              type="button"
              variant="outline"
              onClick={() => setExportModalOpen(false)}
            >
              Cancel
            </BubblyButton>
            <BubblyButton
              type="button"
              disabled={exportingAllPdf}
              onClick={handleDownloadAllPatientsPdf}
            >
              <FileDown className="h-4 w-4" />
              {exportingAllPdf ? "Generating Complete PDF..." : "Download Complete PDF"}
            </BubblyButton>
          </div>
        </div>
      </AnimatedModal>
    </div>
  );
}
