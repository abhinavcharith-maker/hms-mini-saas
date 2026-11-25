"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  BedDouble,
  FileDown,
  FileText,
  FlaskConical,
  Pill,
  Printer,
  Receipt,
  Stethoscope,
  User,
} from "lucide-react";
import {
  BubblyButton,
  EmptyState,
  SkeletonBox,
  SpringCard,
  StatusBadge,
} from "@/components/ui/MotionPrimitives";
import { useToast } from "@/components/providers/AppProviders";
import { formatAccurateDateTime } from "@/lib/datetime";

interface PatientHistoryResponse {
  patient: {
    id: string;
    uhid: string;
    fullName: string;
    age: number | null;
    dateOfBirth: string | null;
    gender: string;
    phone: string;
    address: string | null;
    bloodGroup: string | null;
    emergencyContact: string | null;
    registeredAt: string;
    opVisits: Array<{
      id: string;
      visitNumber: string;
      doctorNameSnapshot: string;
      departmentSnapshot: string | null;
      visitDate: string;
      reasonForVisit: string | null;
      notes: string | null;
      totalAmount: number | null;
      paymentStatus: string | null;
      billingReceipts: Array<{
        id: string;
        receiptNumber: string;
        totalAmount: number | null;
        paymentMode: string | null;
        paymentStatus: string | null;
        issuedAt: string;
      }>;
    }>;
    ipAdmissions: Array<{
      id: string;
      admissionNumber: string;
      doctorNameSnapshot: string;
      wardSnapshot: string;
      bedNumberSnapshot: string;
      admittedAt: string;
      dischargedAt: string | null;
      status: string;
      admissionNotes: string | null;
      dischargeNotes: string | null;
      bedTransfers: Array<{
        id: string;
        fromBedLabel: string | null;
        toBedLabel: string;
        reason: string | null;
        transferredAt: string;
      }>;
    }>;
    pharmacyReferrals: Array<{
      id: string;
      referralNumber: string;
      pharmacyNameSnapshot: string;
      status: string;
      totalAmount: number | null;
      referredAt: string;
      completedAt: string | null;
      completedByNameSnapshot: string | null;
      notes: string | null;
      items: Array<{
        id: string;
        medicineNameSnapshot: string;
        quantity: number;
        unitPriceSnapshot: number | null;
        lineTotal: number | null;
        dosageInstructions: string | null;
      }>;
    }>;
    labReferrals: Array<{
      id: string;
      referralNumber: string;
      labNameSnapshot: string;
      status: string;
      totalAmount: number | null;
      referredAt: string;
      completedAt: string | null;
      completedByNameSnapshot: string | null;
      notes: string | null;
      items: Array<{
        id: string;
        testNameSnapshot: string;
        unitPriceSnapshot: number | null;
      }>;
    }>;
    billingReceipts: Array<{
      id: string;
      receiptNumber: string;
      visitSummarySnapshot: string;
      totalAmount: number | null;
      paymentMode: string | null;
      paymentStatus: string | null;
      issuedAt: string;
      issuedByNameSnapshot: string;
    }>;
  };
}

type FilterKind = "ALL" | "OP" | "IP" | "PHARMACY" | "LAB" | "BILLING";

export default function PatientHistoryPage() {
  const params = useParams<{ id: string }>();
  const { toast } = useToast();
  const [data, setData] = useState<PatientHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKind>("ALL");
  const [fromTime, setFromTime] = useState("");
  const [toTime, setToTime] = useState("");
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/hospital/patients/${encodeURIComponent(params.id)}`
      );
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Patient record not found.");
        return;
      }
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const timelineEvents = useMemo(() => {
    if (!data) return [];
    const p = data.patient;
    const events: Array<{
      id: string;
      kind: Exclude<FilterKind, "ALL">;
      date: string;
      title: string;
      reference: string;
      status?: string;
      details: string;
      extra?: React.ReactNode;
    }> = [];

    for (const op of p.opVisits) {
      const receipt = op.billingReceipts[0];
      events.push({
        id: `op-${op.id}`,
        kind: "OP",
        date: op.visitDate,
        title: `OP Consultation · ${op.doctorNameSnapshot}`,
        reference: op.visitNumber,
        status: op.paymentStatus ?? undefined,
        details: `${op.departmentSnapshot ? `${op.departmentSnapshot} · ` : ""}${op.reasonForVisit ?? "OP Consultation"}${op.notes ? ` — Notes: ${op.notes}` : ""}`,
        extra: (
          <div className="mt-2 flex flex-wrap gap-2">
            <Link
              href={`/print/op-consultation/${op.id}`}
              target="_blank"
              className="inline-flex items-center gap-1 rounded-lg border border-[#cfe2d6] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#0d4a38] hover:bg-emerald-50"
            >
              <FileText className="h-3 w-3" /> Reprint Consultation Sheet
            </Link>
            {receipt ? (
              <Link
                href={`/print/receipt/${receipt.id}`}
                target="_blank"
                className="inline-flex items-center gap-1 rounded-lg border border-[#cfe2d6] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#0d4a38] hover:bg-emerald-50"
              >
                <Receipt className="h-3 w-3" /> Reprint Receipt ({receipt.receiptNumber})
              </Link>
            ) : null}
          </div>
        ),
      });
    }

    for (const ip of p.ipAdmissions) {
      events.push({
        id: `ip-${ip.id}`,
        kind: "IP",
        date: ip.admittedAt,
        title: `IP Admission · ${ip.wardSnapshot} (${ip.bedNumberSnapshot})`,
        reference: ip.admissionNumber,
        status: ip.status,
        details: `Attending: ${ip.doctorNameSnapshot}${ip.dischargedAt ? ` · Discharged: ${new Date(ip.dischargedAt).toLocaleString()}` : " · Currently Admitted"}${ip.admissionNotes ? ` — ${ip.admissionNotes}` : ""}`,
        extra:
          ip.bedTransfers.length > 0 ? (
            <div className="mt-2 space-y-1 text-[11px] text-[#466356]">
              {ip.bedTransfers.map((t) => (
                <p key={t.id}>
                  • {new Date(t.transferredAt).toLocaleString()}:{" "}
                  {t.fromBedLabel ? `${t.fromBedLabel} → ` : "Assigned "}
                  <strong>{t.toBedLabel}</strong>
                  {t.reason ? ` (${t.reason})` : ""}
                </p>
              ))}
            </div>
          ) : null,
      });
    }

    for (const pr of p.pharmacyReferrals) {
      events.push({
        id: `phr-${pr.id}`,
        kind: "PHARMACY",
        date: pr.referredAt,
        title: `Pharmacy Referral · ${pr.pharmacyNameSnapshot}`,
        reference: pr.referralNumber,
        status: pr.status,
        details: pr.items
          .map(
            (i) =>
              `${i.medicineNameSnapshot} × ${i.quantity}${i.lineTotal !== null ? ` (₹${i.lineTotal.toFixed(2)})` : ""}`
          )
          .join(", "),
        extra: (
          <div className="mt-1 text-[11px] text-[#466356]">
            {pr.totalAmount !== null ? (
              <span>Total: ₹{pr.totalAmount.toFixed(2)} · </span>
            ) : (
              <span>Amount: Optional / Not Entered · </span>
            )}
            {pr.completedAt
              ? `Completed ${new Date(pr.completedAt).toLocaleString()} by ${pr.completedByNameSnapshot ?? "Pharmacy"}`
              : "Awaiting pharmacy confirmation"}
          </div>
        ),
      });
    }

    for (const lr of p.labReferrals) {
      events.push({
        id: `lab-${lr.id}`,
        kind: "LAB",
        date: lr.referredAt,
        title: `Laboratory Referral · ${lr.labNameSnapshot}`,
        reference: lr.referralNumber,
        status: lr.status,
        details: lr.items.map((i) => i.testNameSnapshot).join(", "),
        extra: (
          <div className="mt-1 text-[11px] text-[#466356]">
            {lr.totalAmount !== null ? (
              <span>Total: ₹{lr.totalAmount.toFixed(2)} · </span>
            ) : (
              <span>Amount: Optional / Not Entered · </span>
            )}
            {lr.completedAt
              ? `Completed ${new Date(lr.completedAt).toLocaleString()} by ${lr.completedByNameSnapshot ?? "Laboratory"}`
              : "Awaiting laboratory confirmation"}
          </div>
        ),
      });
    }

    for (const rc of p.billingReceipts) {
      events.push({
        id: `rcp-${rc.id}`,
        kind: "BILLING",
        date: rc.issuedAt,
        title: `Billing Receipt · ${rc.visitSummarySnapshot}`,
        reference: rc.receiptNumber,
        status: rc.paymentStatus ?? undefined,
        details:
          rc.totalAmount !== null
            ? `Amount: ₹${rc.totalAmount.toFixed(2)} (${rc.paymentMode ?? "N/A"}) · Issued by ${rc.issuedByNameSnapshot}`
            : `No fee configured · Recorded by ${rc.issuedByNameSnapshot}`,
        extra: (
          <div className="mt-2">
            <Link
              href={`/print/receipt/${rc.id}`}
              target="_blank"
              className="inline-flex items-center gap-1 rounded-lg border border-[#cfe2d6] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#0d4a38] hover:bg-emerald-50"
            >
              <Printer className="h-3 w-3" /> Reprint Historical Receipt
            </Link>
          </div>
        ),
      });
    }

    const fromMs = fromTime ? new Date(fromTime).getTime() : null;
    const toMs = toTime ? new Date(toTime).getTime() + 59_999 : null;

    return events
      .filter((e) => filter === "ALL" || e.kind === filter)
      .filter((e) => {
        const ts = new Date(e.date).getTime();
        if (fromMs !== null && !Number.isNaN(fromMs) && ts < fromMs) return false;
        if (toMs !== null && !Number.isNaN(toMs) && ts > toMs) return false;
        return true;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [data, filter, fromTime, toTime]);

  if (loading) {
    return (
      <div className="space-y-4">
        <SkeletonBox className="h-40" />
        <SkeletonBox className="h-80" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <EmptyState
        icon={<User className="h-6 w-6" />}
        title="Patient History Unavailable"
        description={error ?? "Could not locate patient record."}
        action={
          <Link
            href="/hospital/op"
            className="rounded-xl bg-[#0d4a38] px-4 py-2 text-xs font-semibold text-white"
          >
            Back to Patient Directory
          </Link>
        }
      />
    );
  }

  const p = data.patient;

  const handleDownloadEntireDataPdf = async () => {
    setDownloadingPdf(true);
    try {
      const tzOffset = new Date().getTimezoneOffset();
      const res = await fetch(
        `/api/hospital/patients/${encodeURIComponent(p.id)}/export-pdf?tzOffset=${tzOffset}`
      );
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        toast({
          type: "error",
          title: "Download Failed",
          message: errData?.error ?? "Unable to generate patient audit PDF.",
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
        title: "Complete Patient History Downloaded",
        message: `Audit-ready PDF saved for ${p.fullName} (${p.uhid}).`,
      });
    } finally {
      setDownloadingPdf(false);
    }
  };

  const iconForKind = (kind: Exclude<FilterKind, "ALL">) => {
    switch (kind) {
      case "OP":
        return <Stethoscope className="h-4 w-4 text-emerald-700" />;
      case "IP":
        return <BedDouble className="h-4 w-4 text-amber-700" />;
      case "PHARMACY":
        return <Pill className="h-4 w-4 text-emerald-600" />;
      case "LAB":
        return <FlaskConical className="h-4 w-4 text-teal-700" />;
      case "BILLING":
        return <Receipt className="h-4 w-4 text-[#0d4a38]" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/hospital/patient-history"
          className="inline-flex items-center gap-2 rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2 text-xs font-semibold text-[#0d4a38] hover:bg-emerald-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Patient History
        </Link>
        <div className="flex flex-wrap items-center gap-2.5">
          <BubblyButton
            disabled={downloadingPdf}
            onClick={() => void handleDownloadEntireDataPdf()}
            className="px-4 py-2 text-xs"
          >
            <FileDown className="h-4 w-4" />
            {downloadingPdf
              ? "Generating Audit PDF..."
              : "Download Entire Data (Audit PDF)"}
          </BubblyButton>
          <span className="font-mono-id rounded-full bg-emerald-100 px-3.5 py-1.5 text-xs font-bold text-[#0d4a38] border border-emerald-300">
            UHID: {p.uhid}
          </span>
        </div>
      </div>

      {/* Patient Profile Card */}
      <SpringCard className="p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0d4a38] to-[#059669] font-display text-xl font-extrabold text-white">
              {p.fullName.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="font-display text-2xl font-extrabold text-[#0f241d]">
                {p.fullName}
              </h1>
              <p className="mt-1 text-sm text-[#466356]">
                {p.age ? `${p.age} yrs` : "Age N/A"} · {p.gender}
                {p.bloodGroup ? ` · Blood Group: ${p.bloodGroup}` : ""} · Phone:{" "}
                <strong>{p.phone}</strong>
              </p>
              <p className="mt-0.5 text-xs text-[#5b796b]">
                {p.address ?? "No address recorded"} · Registered:{" "}
                {new Date(p.registeredAt).toLocaleString()}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            <div className="rounded-xl bg-[#f4faf6] border border-[#dcece2] px-3 py-2">
              <p className="font-display text-lg font-bold text-[#0d4a38]">
                {p.opVisits.length}
              </p>
              <p className="text-[11px] text-[#5b796b]">OP Visits</p>
            </div>
            <div className="rounded-xl bg-[#f4faf6] border border-[#dcece2] px-3 py-2">
              <p className="font-display text-lg font-bold text-[#0d4a38]">
                {p.ipAdmissions.length}
              </p>
              <p className="text-[11px] text-[#5b796b]">IP Stays</p>
            </div>
            <div className="rounded-xl bg-[#f4faf6] border border-[#dcece2] px-3 py-2">
              <p className="font-display text-lg font-bold text-[#0d4a38]">
                {p.pharmacyReferrals.length}
              </p>
              <p className="text-[11px] text-[#5b796b]">Rx Refs</p>
            </div>
            <div className="rounded-xl bg-[#f4faf6] border border-[#dcece2] px-3 py-2">
              <p className="font-display text-lg font-bold text-[#0d4a38]">
                {p.labReferrals.length}
              </p>
              <p className="text-[11px] text-[#5b796b]">Lab Refs</p>
            </div>
          </div>
        </div>
      </SpringCard>

      {/* Filter Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {(
            [
              { key: "ALL", label: "All Timeline Events" },
              { key: "OP", label: `OP History (${p.opVisits.length})` },
              { key: "IP", label: `IP History (${p.ipAdmissions.length})` },
              { key: "PHARMACY", label: `Pharmacy (${p.pharmacyReferrals.length})` },
              { key: "LAB", label: `Laboratory (${p.labReferrals.length})` },
              { key: "BILLING", label: `Billing & Receipts (${p.billingReceipts.length})` },
            ] as Array<{ key: FilterKind; label: string }>
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilter(tab.key)}
              className={`rounded-xl border px-3.5 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                filter === tab.key
                  ? "border-emerald-500 bg-[#dff4e8] text-[#0d4a38]"
                  : "border-[#cfe2d6] bg-white text-[#466356] hover:bg-emerald-50/40"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="font-semibold text-[#466356]">
            From
            <input
              type="datetime-local"
              value={fromTime}
              onChange={(e) => setFromTime(e.target.value)}
              className="ml-1.5 rounded-xl border border-[#cfe2d6] bg-white px-2.5 py-1.5 text-xs font-normal text-[#0f241d]"
            />
          </label>
          <label className="font-semibold text-[#466356]">
            To
            <input
              type="datetime-local"
              value={toTime}
              onChange={(e) => setToTime(e.target.value)}
              className="ml-1.5 rounded-xl border border-[#cfe2d6] bg-white px-2.5 py-1.5 text-xs font-normal text-[#0f241d]"
            />
          </label>
          {fromTime || toTime ? (
            <button
              type="button"
              onClick={() => {
                setFromTime("");
                setToTime("");
              }}
              className="rounded-xl border border-[#cfe2d6] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#466356] hover:bg-emerald-50 cursor-pointer"
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>

      {/* Chronological Timeline */}
      <SpringCard className="p-6">
        <h2 className="mb-5 font-display text-base font-bold text-[#0f241d]">
          Chronological Medical & Transaction Timeline
        </h2>

        {timelineEvents.length === 0 ? (
          <p className="text-xs text-[#5b796b]">
            No records in this timeline category yet.
          </p>
        ) : (
          <div className="relative space-y-4 before:absolute before:left-5 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#dcece2]">
            {timelineEvents.map((ev) => (
              <div key={ev.id} className="relative pl-12">
                <div className="absolute left-1.5 top-2 flex h-7 w-7 items-center justify-center rounded-full border border-[#bfe3ce] bg-white shadow-sm">
                  {iconForKind(ev.kind)}
                </div>
                <div className="rounded-2xl border border-[#e3efe7] bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono-id rounded bg-[#eef7f1] px-2 py-0.5 text-[11px] font-bold text-[#0d4a38]">
                        {ev.reference}
                      </span>
                      <span className="font-display text-sm font-bold text-[#0f241d]">
                        {ev.title}
                      </span>
                      {ev.status ? <StatusBadge status={ev.status} /> : null}
                    </div>
                    <span className="text-xs text-[#5b796b]">
                      {formatAccurateDateTime(ev.date)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-[#314c40]">{ev.details}</p>
                  {ev.extra}
                </div>
              </div>
            ))}
          </div>
        )}
      </SpringCard>
    </div>
  );
}
