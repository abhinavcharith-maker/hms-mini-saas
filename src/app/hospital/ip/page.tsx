"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRightLeft,
  BedDouble,
  CalendarPlus,
  Clock,
  CreditCard,
  Eye,
  LogOut,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserPlus,
} from "lucide-react";
import {
  AnimatedModal,
  BubblyButton,
  EmptyState,
  SkeletonBox,
  SpringCard,
  StatusBadge,
} from "@/components/ui/MotionPrimitives";
import { useToast } from "@/components/providers/AppProviders";
import { ROLES } from "@/lib/constants";
import {
  formatAccurateDateTime,
  getLocalDateTimeInputValue,
} from "@/lib/datetime";

interface BedItem {
  id: string;
  bedNumber: string;
  ward: string;
  category: string | null;
  status: "AVAILABLE" | "OCCUPIED" | "INACTIVE";
  notes: string | null;
  ipAdmissions: Array<{
    id: string;
    admissionNumber: string;
    patient: { id: string; uhid: string; fullName: string; phone: string };
  }>;
}

interface AdmissionItem {
  id: string;
  admissionNumber: string;
  doctorNameSnapshot: string;
  wardSnapshot: string;
  bedNumberSnapshot: string;
  admittedAt: string;
  dischargedAt: string | null;
  status: "ADMITTED" | "DISCHARGED";
  chargeAmount: number | null;
  paymentMode?: string | null;
  stayDays?: number;
  expectedCheckoutAt?: string | null;
  isStayOverdue?: boolean;
  overdueHours?: number;
  admissionNotes: string | null;
  dischargeNotes: string | null;
  bedId: string | null;
  patient: { id: string; uhid: string; fullName: string; phone: string };
  bedTransfers: Array<{
    id: string;
    fromBedLabel: string | null;
    toBedLabel: string;
    reason: string | null;
    transferredAt: string;
  }>;
  stayExtensions?: Array<{
    id: string;
    additionalDays: number;
    amountCollected: number;
    paymentMode: string;
    reason: string;
    newCheckoutAt: string;
    extendedByNameSnapshot: string;
    createdAt: string;
  }>;
}

export default function IpManagementPage() {
  const { toast } = useToast();
  const [role, setRole] = useState<string>(ROLES.RECEPTIONIST);
  const [beds, setBeds] = useState<BedItem[]>([]);
  const [admissions, setAdmissions] = useState<AdmissionItem[]>([]);
  const [patients, setPatients] = useState<
    Array<{ id: string; uhid: string; fullName: string; phone: string }>
  >([]);
  const [doctors, setDoctors] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"beds" | "active" | "history">("beds");

  // Modals
  const [bedModalOpen, setBedModalOpen] = useState(false);
  const [editBed, setEditBed] = useState<BedItem | null>(null);
  const [deleteBedTarget, setDeleteBedTarget] = useState<BedItem | null>(null);
  const [admitOpen, setAdmitOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState<AdmissionItem | null>(null);
  const [extendTarget, setExtendTarget] = useState<AdmissionItem | null>(null);
  const [dischargeTarget, setDischargeTarget] = useState<AdmissionItem | null>(null);
  const [archiveDetail, setArchiveDetail] = useState<AdmissionItem | null>(null);
  const [activeSearch, setActiveSearch] = useState("");
  const [archiveSearch, setArchiveSearch] = useState("");
  const [busy, setBusy] = useState(false);

  const [extendForm, setExtendForm] = useState({
    additionalDays: "1",
    amountCollected: "",
    paymentMode: "CASH" as "CASH" | "UPI" | "CARD",
    reason: "",
  });

  const [bedForm, setBedForm] = useState({
    bedNumber: "",
    ward: "",
    category: "General",
    status: "AVAILABLE" as "AVAILABLE" | "INACTIVE",
  });

  const [admitPatientSearch, setAdmitPatientSearch] = useState("");
  const [searchedAdmitPatients, setSearchedAdmitPatients] = useState<
    Array<{ id: string; uhid: string; fullName: string; phone: string }> | null
  >(null);
  const [selectedAdmitPatient, setSelectedAdmitPatient] = useState<{
    id: string;
    uhid: string;
    fullName: string;
    phone: string;
  } | null>(null);
  const [highlightedAdmitIdx, setHighlightedAdmitIdx] = useState(0);
  const [admitForm, setAdmitForm] = useState(() => ({
    patientId: "",
    bedId: "",
    doctorId: "",
    doctorName: "",
    admittedAt: getLocalDateTimeInputValue(),
    stayDays: "1",
    chargeAmount: "",
    paymentMode: "CASH" as "CASH" | "UPI" | "CARD",
    admissionNotes: "",
  }));

  const [transferForm, setTransferForm] = useState({ toBedId: "", reason: "" });
  const [dischargeNotes, setDischargeNotes] = useState("");

  const loadAll = useCallback(async () => {
    try {
      const [meRes, bRes, aRes, pRes, dRes] = await Promise.all([
        fetch("/api/auth/me"),
        fetch("/api/hospital/beds"),
        fetch("/api/hospital/admissions"),
        fetch("/api/hospital/patients?limit=100"),
        fetch("/api/hospital/doctors"),
      ]);
      const meData = await meRes.json();
      if (meData?.user?.role) setRole(meData.user.role);
      const bData = await bRes.json();
      const aData = await aRes.json();
      const pData = await pRes.json();
      const dData = await dRes.json();

      setBeds(bData.beds ?? []);
      setAdmissions(aData.admissions ?? []);
      setPatients(pData.patients ?? []);
      setDoctors(dData.doctors ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    const q = admitPatientSearch.trim();
    if (!admitOpen || !q) {
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/hospital/patients?q=${encodeURIComponent(q)}&limit=30`
        );
        if (res.ok) {
          const d = await res.json();
          setSearchedAdmitPatients(d.patients ?? []);
        }
      } catch {
        // fallback to loaded patients
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [admitOpen, admitPatientSearch]);

  const isAdmin = role === ROLES.HOSPITAL_ADMIN;
  const availableBeds = beds.filter((b) => b.status === "AVAILABLE");
  const activeAdmissions = admissions.filter((a) => a.status === "ADMITTED");
  const overdueAdmissions = activeAdmissions.filter((a) => a.isStayOverdue);
  const dischargedAdmissions = admissions.filter((a) => a.status === "DISCHARGED");

  // Group beds by ward
  const bedsByWard = beds.reduce<Record<string, BedItem[]>>((acc, b) => {
    acc[b.ward] = acc[b.ward] ?? [];
    acc[b.ward].push(b);
    return acc;
  }, {});

  const handleSaveBed = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const url = editBed
        ? `/api/hospital/beds/${editBed.id}`
        : "/api/hospital/beds";
      const method = editBed ? "PATCH" : "POST";
      const payload = editBed && editBed.status === "OCCUPIED"
        ? {
            bedNumber: bedForm.bedNumber,
            ward: bedForm.ward,
            category: bedForm.category || null,
          }
        : bedForm;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (!res.ok) {
        toast({ type: "error", title: "Bed Save Failed", message: d.error });
        return;
      }
      toast({
        type: "success",
        title: editBed ? "Bed Updated" : "Bed Added",
      });
      setBedModalOpen(false);
      setEditBed(null);
      loadAll();
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteBed = async () => {
    if (!deleteBedTarget) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/hospital/beds/${deleteBedTarget.id}`, {
        method: "DELETE",
      });
      const d = await res.json();
      if (!res.ok) {
        toast({ type: "error", title: "Delete Failed", message: d.error });
        return;
      }
      toast({
        type: "success",
        title: "Bed Deleted",
        message: `${deleteBedTarget.bedNumber} removed from registry.`,
      });
      setDeleteBedTarget(null);
      loadAll();
    } finally {
      setBusy(false);
    }
  };

  const handleAdmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!admitForm.patientId) {
      toast({
        type: "warning",
        title: "Select a patient",
        message: "Search by UHID, name, or mobile number and select a patient.",
      });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/hospital/admissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: admitForm.patientId,
          bedId: admitForm.bedId,
          doctorId: admitForm.doctorId || null,
          doctorName: admitForm.doctorName || null,
          admittedAt: admitForm.admittedAt
            ? new Date(admitForm.admittedAt).toISOString()
            : null,
          stayDays: Math.max(1, Number.parseInt(admitForm.stayDays, 10) || 1),
          chargeAmount:
            admitForm.chargeAmount.trim() !== ""
              ? Number(admitForm.chargeAmount)
              : null,
          paymentMode: admitForm.paymentMode,
          admissionNotes: admitForm.admissionNotes || null,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast({ type: "error", title: "Admission Failed", message: d.error });
        return;
      }
      toast({
        type: "success",
        title: `Patient Admitted (${d.admission.admissionNumber})`,
        message: "Bed status updated transactionally.",
      });
      setAdmitOpen(false);
      loadAll();
    } finally {
      setBusy(false);
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferTarget) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/hospital/admissions/${transferTarget.id}/transfer`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(transferForm),
        }
      );
      const d = await res.json();
      if (!res.ok) {
        toast({ type: "error", title: "Transfer Failed", message: d.error });
        return;
      }
      toast({
        type: "success",
        title: "Bed Transfer Completed",
        message: "Previous bed released and new bed assigned.",
      });
      setTransferTarget(null);
      loadAll();
    } finally {
      setBusy(false);
    }
  };

  const handleExtendStay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extendTarget) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/hospital/admissions/${extendTarget.id}/extend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          additionalDays: Math.max(
            1,
            Number.parseInt(extendForm.additionalDays, 10) || 1
          ),
          amountCollected: Number(extendForm.amountCollected || 0),
          paymentMode: extendForm.paymentMode,
          reason: extendForm.reason.trim(),
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast({ type: "error", title: "Extension Failed", message: d.error });
        return;
      }
      toast({
        type: "success",
        title: "IP Stay Extended",
        message: `Extended ${extendTarget.patient.fullName} by +${extendForm.additionalDays} day(s) (${extendForm.paymentMode}).`,
      });
      setExtendTarget(null);
      loadAll();
    } finally {
      setBusy(false);
    }
  };

  const handleDischarge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dischargeTarget) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/hospital/admissions/${dischargeTarget.id}/discharge`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dischargeNotes }),
        }
      );
      const d = await res.json();
      if (!res.ok) {
        toast({ type: "error", title: "Discharge Failed", message: d.error });
        return;
      }
      toast({
        type: "success",
        title: "Patient Discharged",
        message: "Bed automatically released to Available.",
      });
      setDischargeTarget(null);
      setDischargeNotes("");
      loadAll();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-[#0f241d]">
            IP Admissions & Bed Management
          </h1>
          <p className="mt-1 text-sm text-[#466356]">
            Transaction-safe bed occupancy, ward transfers & automatic bed release upon discharge.
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          {isAdmin ? (
            <BubblyButton
              variant="outline"
              onClick={() => {
                setEditBed(null);
                setBedForm({
                  bedNumber: "",
                  ward: "",
                  category: "General",
                  status: "AVAILABLE",
                });
                setBedModalOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Add Bed
            </BubblyButton>
          ) : null}
          <BubblyButton
            disabled={availableBeds.length === 0 || patients.length === 0}
            onClick={() => {
              setAdmitPatientSearch("");
              setSelectedAdmitPatient(null);
              setSearchedAdmitPatients(null);
              setAdmitForm({
                patientId: "",
                bedId: availableBeds[0]?.id ?? "",
                doctorId: "",
                doctorName: "",
                admittedAt: getLocalDateTimeInputValue(),
                stayDays: "1",
                chargeAmount: "",
                paymentMode: "CASH",
                admissionNotes: "",
              });
              setAdmitOpen(true);
            }}
          >
            <UserPlus className="h-4 w-4" />
            Admit Patient
          </BubblyButton>
        </div>
      </div>

      {/* Stay Duration Passed Alert Banner */}
      {overdueAdmissions.length > 0 ? (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-xs text-rose-900">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">
                {overdueAdmissions.length} Inpatient{overdueAdmissions.length === 1 ? "" : "s"} Passed Scheduled Stay Duration
              </p>
              <p className="mt-0.5 text-rose-800">
                {overdueAdmissions
                  .slice(0, 3)
                  .map((a) => `${a.patient.fullName} (${a.wardSnapshot} · ${a.bedNumberSnapshot})`)
                  .join(", ")}
                {overdueAdmissions.length > 3 ? ` +${overdueAdmissions.length - 3} more` : ""}
              </p>
            </div>
          </div>
          {tab !== "active" ? (
            <BubblyButton
              variant="danger"
              className="px-3 py-1.5 text-xs shrink-0"
              onClick={() => setTab("active")}
            >
              Review & Extend Stay
            </BubblyButton>
          ) : null}
        </div>
      ) : null}

      {/* Bed Status Legend & Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="inline-flex rounded-2xl border border-[#cfe2d6] bg-white p-1">
          {[
            { id: "beds", label: `Bed Map (${beds.length})` },
            { id: "active", label: `Current Inpatients (${activeAdmissions.length})` },
            { id: "history", label: `Discharge Archive (${dischargedAdmissions.length})` },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id as "beds" | "active" | "history")}
              className={`rounded-xl px-4 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                tab === t.id
                  ? "bg-[#dff4e8] text-[#0d4a38]"
                  : "text-[#466356] hover:text-[#0f241d]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
          <span className="flex items-center gap-1.5 text-emerald-700">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            Available ({availableBeds.length})
          </span>
          <span className="flex items-center gap-1.5 text-amber-700">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
            Occupied ({beds.filter((b) => b.status === "OCCUPIED").length})
          </span>
          <span className="flex items-center gap-1.5 text-slate-600">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-400" />
            Under Maintenance ({beds.filter((b) => b.status === "INACTIVE").length})
          </span>
        </div>
      </div>

      {loading ? (
        <SkeletonBox className="h-72" />
      ) : tab === "beds" ? (
        beds.length === 0 ? (
          <EmptyState
            icon={<BedDouble className="h-6 w-6" />}
            title="No Beds Configured Yet"
            description={
              isAdmin
                ? "Add hospital wards and beds to start admitting inpatients."
                : "Ask your Hospital Admin to configure beds in IP Management."
            }
          />
        ) : (
          <div className="space-y-6">
            {Object.entries(bedsByWard).map(([ward, wardBeds]) => (
              <SpringCard key={ward} className="p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="font-display text-base font-bold text-[#0f241d]">
                    {ward}
                  </h2>
                  <span className="text-xs text-[#5b796b]">
                    {wardBeds.filter((b) => b.status === "AVAILABLE").length} of{" "}
                    {wardBeds.length} available
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {wardBeds.map((b) => {
                    const activeOcc = b.ipAdmissions[0];
                    const tone =
                      b.status === "AVAILABLE"
                        ? "border-emerald-200 bg-emerald-50/70"
                        : b.status === "OCCUPIED"
                          ? "border-amber-200 bg-amber-50/70"
                          : "border-slate-200 bg-slate-50 opacity-80";

                    return (
                      <div
                        key={b.id}
                        className={`rounded-2xl border p-4 flex flex-col justify-between ${tone}`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-mono-id text-sm font-bold text-[#0f241d]">
                                {b.bedNumber}
                              </p>
                              <p className="text-[11px] text-[#5b796b]">
                                {b.category ?? "Standard"}
                              </p>
                            </div>
                            <StatusBadge status={b.status} />
                          </div>

                          {activeOcc ? (
                            <div className="mt-3 rounded-xl bg-white/90 p-2.5 text-xs border border-amber-200/80">
                              <p className="font-semibold text-[#0f241d]">
                                {activeOcc.patient.fullName}
                              </p>
                              <Link
                                href={`/hospital/patients/${encodeURIComponent(
                                  activeOcc.patient.uhid
                                )}`}
                                className="font-mono-id text-[11px] font-semibold text-emerald-700 hover:underline"
                              >
                                {activeOcc.patient.uhid}
                              </Link>
                            </div>
                          ) : null}
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-2 pt-2">
                          {b.status === "AVAILABLE" ? (
                            <button
                              type="button"
                              onClick={() => {
                                setAdmitPatientSearch("");
                                setAdmitPatientSearch("");
                                setSelectedAdmitPatient(null);
                                setSearchedAdmitPatients(null);
                                setAdmitForm({
                                  patientId: "",
                                  bedId: b.id,
                                  doctorId: "",
                                  doctorName: "",
                                  admittedAt: getLocalDateTimeInputValue(),
                                  stayDays: "1",
                                  chargeAmount: "",
                                  paymentMode: "CASH",
                                  admissionNotes: "",
                                });
                                setAdmitOpen(true);
                              }}
                              className="text-xs font-semibold text-[#0d4a38] hover:underline cursor-pointer"
                            >
                              Admit to Bed →
                            </button>
                          ) : (
                            <span />
                          )}
                          {isAdmin ? (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditBed(b);
                                  setBedForm({
                                    bedNumber: b.bedNumber,
                                    ward: b.ward,
                                    category: b.category ?? "General",
                                    status:
                                      b.status === "INACTIVE"
                                        ? "INACTIVE"
                                        : "AVAILABLE",
                                  });
                                  setBedModalOpen(true);
                                }}
                                className="rounded-lg p-1.5 text-[#466356] hover:bg-white cursor-pointer"
                                title="Edit Bed"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              {b.status !== "OCCUPIED" ? (
                                <button
                                  type="button"
                                  onClick={() => setDeleteBedTarget(b)}
                                  className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 cursor-pointer"
                                  title="Delete Bed"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </SpringCard>
            ))}
          </div>
        )
      ) : tab === "active" ? (
        <SpringCard className="p-6 space-y-4">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6c877a]" />
            <input
              value={activeSearch}
              onChange={(e) => setActiveSearch(e.target.value)}
              placeholder="Search current inpatients by UHID, name, or mobile..."
              className="w-full rounded-xl border border-[#cfe2d6] bg-white py-2 pl-10 pr-4 text-sm"
            />
          </div>

          {activeAdmissions.length === 0 ? (
            <EmptyState
              icon={<BedDouble className="h-5 w-5" />}
              title="No Active Inpatients"
              description="Admit a registered patient to an available bed to begin inpatient care."
            />
          ) : (
            <div className="space-y-3">
              {activeAdmissions
                .filter((a) => {
                  const q = activeSearch.trim().toLowerCase();
                  if (!q) return true;
                  return (
                    a.patient.uhid.toLowerCase().includes(q) ||
                    a.patient.fullName.toLowerCase().includes(q) ||
                    a.patient.phone.toLowerCase().includes(q)
                  );
                })
                .map((a) => (
                <div
                  key={a.id}
                  className={`flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-2xl border p-4 ${
                    a.isStayOverdue
                      ? "border-rose-300 bg-rose-50/40"
                      : "border-[#dcece2] bg-white"
                  }`}
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono-id rounded bg-[#eef7f1] px-2 py-0.5 text-xs font-bold text-[#0d4a38]">
                        {a.admissionNumber}
                      </span>
                      <Link
                        href={`/hospital/patients/${encodeURIComponent(
                          a.patient.uhid
                        )}`}
                        className="font-mono-id rounded bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 border border-emerald-200 hover:bg-emerald-100"
                      >
                        {a.patient.uhid}
                      </Link>
                      <span className="font-display font-bold text-[#0f241d]">
                        {a.patient.fullName}
                      </span>
                      {a.paymentMode ? (
                        <span className="rounded-full border border-[#cfe2d6] bg-[#f4faf6] px-2 py-0.5 text-[10px] font-bold text-[#0d4a38]">
                          {a.paymentMode}
                        </span>
                      ) : null}
                      {a.isStayOverdue ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-2.5 py-0.5 text-[10px] font-bold text-white">
                          <Clock className="h-3 w-3" />
                          Stay Passed ({a.overdueHours ?? 1}h overdue)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                          <Clock className="h-3 w-3" />
                          {a.stayDays ?? 1} day{(a.stayDays ?? 1) === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-[#466356]">
                      {a.wardSnapshot} · Bed{" "}
                      <strong className="font-mono-id">{a.bedNumberSnapshot}</strong>{" "}
                      · Doctor: {a.doctorNameSnapshot} · Admitted:{" "}
                      {formatAccurateDateTime(a.admittedAt)}
                      {a.expectedCheckoutAt
                        ? ` · Due Checkout: ${formatAccurateDateTime(a.expectedCheckoutAt)}`
                        : ""}
                      {a.chargeAmount !== null
                        ? ` · Charged: ₹${a.chargeAmount.toFixed(2)}`
                        : ""}
                    </p>
                    {a.stayExtensions && a.stayExtensions.length > 0 ? (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {a.stayExtensions.map((ext) => (
                          <span
                            key={ext.id}
                            className="inline-flex items-center gap-1 rounded-lg border border-teal-200 bg-teal-50/70 px-2 py-0.5 text-[10px] font-semibold text-teal-900"
                          >
                            +{ext.additionalDays}d · ₹{ext.amountCollected.toFixed(2)} ({ext.paymentMode}) · {ext.reason}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {a.admissionNotes ? (
                      <p className="mt-1 text-xs text-[#5b796b]">
                        Notes: {a.admissionNotes}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2 shrink-0">
                    <BubblyButton
                      variant={a.isStayOverdue ? "danger" : "secondary"}
                      className="px-3 py-2 text-xs"
                      onClick={() => {
                        setExtendTarget(a);
                        setExtendForm({
                          additionalDays: "1",
                          amountCollected: "",
                          paymentMode: "CASH",
                          reason: "",
                        });
                      }}
                    >
                      <CalendarPlus className="h-3.5 w-3.5" />
                      Extend Stay
                    </BubblyButton>
                    <BubblyButton
                      variant="outline"
                      className="px-3 py-2 text-xs"
                      disabled={availableBeds.length === 0}
                      onClick={() => {
                        setTransferTarget(a);
                        setTransferForm({
                          toBedId: availableBeds[0]?.id ?? "",
                          reason: "",
                        });
                      }}
                    >
                      <ArrowRightLeft className="h-3.5 w-3.5" />
                      Transfer Bed
                    </BubblyButton>
                    <BubblyButton
                      variant="primary"
                      className="px-3 py-2 text-xs"
                      onClick={() => {
                        setDischargeTarget(a);
                        setDischargeNotes("");
                      }}
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Discharge
                    </BubblyButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SpringCard>
      ) : (
        <SpringCard className="p-6 space-y-4">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6c877a]" />
            <input
              value={archiveSearch}
              onChange={(e) => setArchiveSearch(e.target.value)}
              placeholder="Search discharge archive by UHID, name, or mobile..."
              className="w-full rounded-xl border border-[#cfe2d6] bg-white py-2 pl-10 pr-4 text-sm"
            />
          </div>

          {dischargedAdmissions.length === 0 ? (
            <p className="text-xs text-[#5b796b]">No discharged admissions yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#dcece2] text-[11px] uppercase text-[#5b796b]">
                    <th className="py-3 pr-3">Admission ID</th>
                    <th className="py-3 px-3">Patient</th>
                    <th className="py-3 px-3">Room / Bed</th>
                    <th className="py-3 px-3">Admitted</th>
                    <th className="py-3 px-3">Discharged</th>
                    <th className="py-3 pl-3 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eaf4ee]">
                  {dischargedAdmissions
                    .filter((a) => {
                      const q = archiveSearch.trim().toLowerCase();
                      if (!q) return true;
                      return (
                        a.patient.uhid.toLowerCase().includes(q) ||
                        a.patient.fullName.toLowerCase().includes(q) ||
                        a.patient.phone.toLowerCase().includes(q)
                      );
                    })
                    .map((a) => (
                      <tr
                        key={a.id}
                        onClick={() => setArchiveDetail(a)}
                        className="cursor-pointer hover:bg-[#f4faf6] transition-colors"
                      >
                        <td className="py-3 pr-3 font-mono-id font-semibold text-[#0d4a38]">
                          {a.admissionNumber}
                        </td>
                        <td className="py-3 px-3">
                          <span className="font-semibold text-[#0f241d]">{a.patient.fullName}</span>{" "}
                          <span className="font-mono-id text-emerald-700">
                            ({a.patient.uhid})
                          </span>
                          <p className="text-[11px] text-[#5b796b]">{a.patient.phone}</p>
                        </td>
                        <td className="py-3 px-3">
                          {a.wardSnapshot} · {a.bedNumberSnapshot}
                        </td>
                        <td className="py-3 px-3">
                          {formatAccurateDateTime(a.admittedAt)}
                        </td>
                        <td className="py-3 px-3">
                          {a.dischargedAt
                            ? formatAccurateDateTime(a.dischargedAt)
                            : "—"}
                        </td>
                        <td className="py-3 pl-3 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setArchiveDetail(a);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-[#cfe2d6] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#0d4a38] hover:bg-emerald-50 cursor-pointer"
                          >
                            <Eye className="h-3 w-3" />
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </SpringCard>
      )}

      {/* Add/Edit Bed Modal */}
      <AnimatedModal
        open={bedModalOpen}
        onClose={() => setBedModalOpen(false)}
        title={editBed ? `Edit Bed ${editBed.bedNumber}` : "Add New Hospital Bed"}
      >
        <form onSubmit={handleSaveBed} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold">Bed Number *</label>
              <input
                required
                value={bedForm.bedNumber}
                onChange={(e) => setBedForm({ ...bedForm, bedNumber: e.target.value })}
                placeholder="e.g. GW-105"
                className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2.5 text-sm font-mono-id"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">Room Number *</label>
              <input
                required
                value={bedForm.ward}
                onChange={(e) => setBedForm({ ...bedForm, ward: e.target.value })}
                placeholder="e.g. Room 102 / General Ward"
                className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2.5 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold">Category</label>
              <input
                value={bedForm.category}
                onChange={(e) => setBedForm({ ...bedForm, category: e.target.value })}
                placeholder="General / Semi-Private / ICU"
                className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2.5 text-sm"
              />
            </div>
            {!editBed || editBed.status !== "OCCUPIED" ? (
              <div>
                <label className="mb-1 block text-xs font-semibold">Status</label>
                <select
                  value={bedForm.status}
                  onChange={(e) =>
                    setBedForm({
                      ...bedForm,
                      status: e.target.value as "AVAILABLE" | "INACTIVE",
                    })
                  }
                  className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2.5 text-sm"
                >
                  <option value="AVAILABLE">Available</option>
                  <option value="INACTIVE">Under Maintenance</option>
                </select>
              </div>
            ) : null}
          </div>
          <div className="flex justify-end gap-3">
            <BubblyButton variant="outline" onClick={() => setBedModalOpen(false)}>
              Cancel
            </BubblyButton>
            <BubblyButton type="submit" disabled={busy}>
              {busy ? "Saving..." : "Save Bed"}
            </BubblyButton>
          </div>
        </form>
      </AnimatedModal>

      {/* Admit Patient Modal */}
      <AnimatedModal
        open={admitOpen}
        onClose={() => setAdmitOpen(false)}
        title="Admit Registered Patient (IP)"
      >
        <form onSubmit={handleAdmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold">
              Search Patient (UHID, Name, or Mobile Number) *
            </label>
            {admitForm.patientId ? (
              (() => {
                const chosen =
                  selectedAdmitPatient?.id === admitForm.patientId
                    ? selectedAdmitPatient
                    : patients.find((p) => p.id === admitForm.patientId);
                return chosen ? (
                  <div className="flex items-center justify-between rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-xs">
                    <span>
                      Selected: <strong className="font-mono-id">{chosen.uhid}</strong> —{" "}
                      <strong>{chosen.fullName}</strong> ({chosen.phone})
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setAdmitForm({ ...admitForm, patientId: "" });
                        setSelectedAdmitPatient(null);
                        setAdmitPatientSearch("");
                        setHighlightedAdmitIdx(0);
                      }}
                      className="font-semibold text-rose-600 hover:underline cursor-pointer"
                    >
                      Change
                    </button>
                  </div>
                ) : null;
              })()
            ) : (
              (() => {
                const q = admitPatientSearch.trim().toLowerCase();
                const matchingAdmitPatients = q
                  ? (searchedAdmitPatients ?? patients)
                      .filter(
                        (p) =>
                          p.uhid.toLowerCase().includes(q) ||
                          p.fullName.toLowerCase().includes(q) ||
                          p.phone.toLowerCase().includes(q)
                      )
                      .slice(0, 20)
                  : [];

                return (
                  <div>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6c877a]" />
                      <input
                        type="text"
                        value={admitPatientSearch}
                        onChange={(e) => {
                          setAdmitPatientSearch(e.target.value);
                          if (!e.target.value.trim()) {
                            setSearchedAdmitPatients(null);
                          }
                          setHighlightedAdmitIdx(0);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "ArrowDown") {
                            e.preventDefault();
                            if (matchingAdmitPatients.length > 0) {
                              setHighlightedAdmitIdx((prev) =>
                                Math.min(matchingAdmitPatients.length - 1, prev + 1)
                              );
                            }
                          } else if (e.key === "ArrowUp") {
                            e.preventDefault();
                            setHighlightedAdmitIdx((prev) => Math.max(0, prev - 1));
                          } else if (e.key === "Enter") {
                            e.preventDefault();
                            e.stopPropagation();
                            if (matchingAdmitPatients.length > 0) {
                              const picked =
                                matchingAdmitPatients[
                                  Math.min(highlightedAdmitIdx, matchingAdmitPatients.length - 1)
                                ];
                              if (picked) {
                                setAdmitForm({ ...admitForm, patientId: picked.id });
                                setSelectedAdmitPatient(picked);
                                setAdmitPatientSearch("");
                                setHighlightedAdmitIdx(0);
                              }
                            }
                          }
                        }}
                        placeholder="Type UHID, patient name, or mobile..."
                        className="w-full rounded-xl border border-[#cfe2d6] bg-white py-2.5 pl-9 pr-3 text-sm"
                      />
                    </div>

                    {q ? (
                      matchingAdmitPatients.length > 0 ? (
                        <div className="mt-1.5 max-h-36 overflow-y-auto rounded-xl border border-[#cfe2d6] divide-y divide-[#eaf4ee] bg-white shadow-md">
                          {matchingAdmitPatients.map((p, idx) => {
                            const isHighlighted = highlightedAdmitIdx === idx;
                            return (
                              <button
                                key={p.id}
                                type="button"
                                onMouseEnter={() => setHighlightedAdmitIdx(idx)}
                                onClick={() => {
                                  setAdmitForm({ ...admitForm, patientId: p.id });
                                  setSelectedAdmitPatient(p);
                                  setAdmitPatientSearch("");
                                  setHighlightedAdmitIdx(0);
                                }}
                                className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs transition-colors cursor-pointer ${
                                  isHighlighted
                                    ? "bg-[#dff4e8] text-[#0d4a38]"
                                    : "bg-white text-[#0f241d] hover:bg-emerald-50/70"
                                }`}
                              >
                                <span>
                                  <strong className="font-mono-id text-[#0d4a38]">
                                    {p.uhid}
                                  </strong>{" "}
                                  · {p.fullName}
                                </span>
                                <span className="text-[#5b796b]">{p.phone}</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="mt-1.5 text-[11px] text-[#5b796b]">
                          No matching patient found.
                        </p>
                      )
                    ) : null}
                  </div>
                );
              })()
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold">
              Select Available Bed *
            </label>
            <select
              required
              value={admitForm.bedId}
              onChange={(e) => setAdmitForm({ ...admitForm, bedId: e.target.value })}
              className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2.5 text-sm"
            >
              <option value="">Choose available bed...</option>
              {availableBeds.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.ward} · {b.bedNumber} {b.category ? `(${b.category})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold">
                Referring / Attending Doctor
              </label>
              <select
                value={admitForm.doctorId}
                onChange={(e) => {
                  const doc = doctors.find((d) => d.id === e.target.value);
                  setAdmitForm({
                    ...admitForm,
                    doctorId: e.target.value,
                    doctorName: doc ? doc.name : admitForm.doctorName,
                  });
                }}
                className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2.5 text-sm"
              >
                <option value="">Select or type below</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">
                Admission Date & Time
              </label>
              <input
                type="datetime-local"
                value={admitForm.admittedAt}
                onChange={(e) =>
                  setAdmitForm({ ...admitForm, admittedAt: e.target.value })
                }
                className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2.5 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold">
                Stay Duration (Days) *
              </label>
              <input
                type="number"
                min={1}
                max={365}
                required
                value={admitForm.stayDays}
                onChange={(e) =>
                  setAdmitForm({ ...admitForm, stayDays: e.target.value })
                }
                className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2.5 text-sm font-mono-id font-semibold"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">
                Payment Mode *
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(["CASH", "UPI", "CARD"] as const).map((pm) => (
                  <button
                    key={pm}
                    type="button"
                    onClick={() => setAdmitForm({ ...admitForm, paymentMode: pm })}
                    className={`rounded-xl border py-2.5 text-xs font-bold transition-colors cursor-pointer ${
                      admitForm.paymentMode === pm
                        ? "border-emerald-600 bg-[#dff4e8] text-[#0d4a38]"
                        : "border-[#cfe2d6] bg-white text-[#466356] hover:bg-[#f6fbf8]"
                    }`}
                  >
                    {pm}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold">
                Doctor Name (if manual)
              </label>
              <input
                value={admitForm.doctorName}
                onChange={(e) =>
                  setAdmitForm({ ...admitForm, doctorName: e.target.value })
                }
                placeholder="Attending physician"
                className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">
                Total Cost Charged (Optional ₹)
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={admitForm.chargeAmount}
                onChange={(e) =>
                  setAdmitForm({ ...admitForm, chargeAmount: e.target.value })
                }
                placeholder="Adds to Total Gross Amount"
                className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2.5 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold">Admission Notes</label>
            <textarea
              rows={2}
              value={admitForm.admissionNotes}
              onChange={(e) =>
                setAdmitForm({ ...admitForm, admissionNotes: e.target.value })
              }
              className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2 text-sm"
            />
          </div>

          <div className="flex justify-end gap-3">
            <BubblyButton variant="outline" onClick={() => setAdmitOpen(false)}>
              Cancel
            </BubblyButton>
            <BubblyButton type="submit" disabled={busy}>
              {busy ? "Admitting..." : "Confirm Admission"}
            </BubblyButton>
          </div>
        </form>
      </AnimatedModal>

      {/* Extend IP Stay Modal */}
      <AnimatedModal
        open={Boolean(extendTarget)}
        onClose={() => setExtendTarget(null)}
        title={`Extend IP Stay · ${extendTarget?.patient.fullName ?? ""}`}
        subtitle={
          extendTarget
            ? `${extendTarget.wardSnapshot} · Bed ${extendTarget.bedNumberSnapshot} · Current stay: ${extendTarget.stayDays ?? 1} day(s)`
            : undefined
        }
      >
        <form onSubmit={handleExtendStay} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold">
                Extend By (Days) *
              </label>
              <input
                type="number"
                min={1}
                max={365}
                required
                value={extendForm.additionalDays}
                onChange={(e) =>
                  setExtendForm({ ...extendForm, additionalDays: e.target.value })
                }
                className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2.5 text-sm font-mono-id font-semibold"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">
                Amount Collected (₹) *
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                required
                value={extendForm.amountCollected}
                onChange={(e) =>
                  setExtendForm({ ...extendForm, amountCollected: e.target.value })
                }
                className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2.5 text-sm font-mono-id font-semibold"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold">
              <CreditCard className="h-3.5 w-3.5 text-emerald-700" />
              Payment Mode *
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(["CASH", "UPI", "CARD"] as const).map((pm) => (
                <button
                  key={pm}
                  type="button"
                  onClick={() => setExtendForm({ ...extendForm, paymentMode: pm })}
                  className={`rounded-xl border py-2 text-xs font-bold transition-colors cursor-pointer ${
                    extendForm.paymentMode === pm
                      ? "border-emerald-600 bg-[#dff4e8] text-[#0d4a38]"
                      : "border-[#cfe2d6] bg-white text-[#466356] hover:bg-[#f6fbf8]"
                  }`}
                >
                  {pm}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold">
              Reason for Extension *
            </label>
            <textarea
              rows={2}
              required
              minLength={2}
              value={extendForm.reason}
              onChange={(e) =>
                setExtendForm({ ...extendForm, reason: e.target.value })
              }
              className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2 text-sm"
            />
          </div>

          <div className="flex justify-end gap-3">
            <BubblyButton variant="outline" onClick={() => setExtendTarget(null)}>
              Cancel
            </BubblyButton>
            <BubblyButton type="submit" disabled={busy}>
              <CalendarPlus className="h-4 w-4" />
              {busy ? "Extending..." : "Confirm Stay Extension"}
            </BubblyButton>
          </div>
        </form>
      </AnimatedModal>

      {/* Transfer Bed Modal */}
      <AnimatedModal
        open={Boolean(transferTarget)}
        onClose={() => setTransferTarget(null)}
        title={`Transfer Bed · ${transferTarget?.patient.fullName ?? ""}`}
        subtitle={`Current: ${transferTarget?.wardSnapshot ?? ""} · ${transferTarget?.bedNumberSnapshot ?? ""}`}
      >
        <form onSubmit={handleTransfer} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold">
              Target Available Bed *
            </label>
            <select
              required
              value={transferForm.toBedId}
              onChange={(e) =>
                setTransferForm({ ...transferForm, toBedId: e.target.value })
              }
              className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2.5 text-sm"
            >
              {availableBeds.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.ward} · {b.bedNumber}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Transfer Reason</label>
            <input
              value={transferForm.reason}
              onChange={(e) =>
                setTransferForm({ ...transferForm, reason: e.target.value })
              }
              placeholder="e.g. Upgraded to Semi-Private suite"
              className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2.5 text-sm"
            />
          </div>
          <div className="flex justify-end gap-3">
            <BubblyButton variant="outline" onClick={() => setTransferTarget(null)}>
              Cancel
            </BubblyButton>
            <BubblyButton type="submit" disabled={busy}>
              {busy ? "Transferring..." : "Confirm Bed Transfer"}
            </BubblyButton>
          </div>
        </form>
      </AnimatedModal>

      {/* Discharge Modal */}
      <AnimatedModal
        open={Boolean(dischargeTarget)}
        onClose={() => setDischargeTarget(null)}
        title={`Discharge Patient · ${dischargeTarget?.patient.fullName ?? ""}`}
        subtitle="Discharging automatically releases the assigned bed back to Available."
      >
        <form onSubmit={handleDischarge} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold">
              Discharge Summary / Notes (optional)
            </label>
            <textarea
              rows={3}
              value={dischargeNotes}
              onChange={(e) => setDischargeNotes(e.target.value)}
              placeholder="Condition at discharge and follow-up guidance"
              className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-3">
            <BubblyButton variant="outline" onClick={() => setDischargeTarget(null)}>
              Cancel
            </BubblyButton>
            <BubblyButton type="submit" disabled={busy}>
              {busy ? "Discharging..." : "Confirm Discharge & Release Bed"}
            </BubblyButton>
          </div>
        </form>
      </AnimatedModal>

      {/* Discharge Archive Description Modal */}
      <AnimatedModal
        open={Boolean(archiveDetail)}
        onClose={() => setArchiveDetail(null)}
        title={`Discharge Record · ${archiveDetail?.admissionNumber ?? ""}`}
        subtitle={
          archiveDetail
            ? `${archiveDetail.patient.fullName} (${archiveDetail.patient.uhid}) · ${archiveDetail.patient.phone}`
            : undefined
        }
      >
        {archiveDetail ? (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-[#dcece2] bg-[#f8fcfa] p-3.5">
              <div>
                <p className="text-[#5b796b]">Room / Bed</p>
                <p className="font-semibold text-[#0f241d]">
                  {archiveDetail.wardSnapshot} · {archiveDetail.bedNumberSnapshot}
                </p>
              </div>
              <div>
                <p className="text-[#5b796b]">Doctor</p>
                <p className="font-semibold text-[#0f241d]">
                  {archiveDetail.doctorNameSnapshot}
                </p>
              </div>
              <div>
                <p className="text-[#5b796b]">Admitted</p>
                <p className="font-semibold text-[#0f241d]">
                  {formatAccurateDateTime(archiveDetail.admittedAt)}
                </p>
              </div>
              <div>
                <p className="text-[#5b796b]">Discharged</p>
                <p className="font-semibold text-[#0f241d]">
                  {archiveDetail.dischargedAt
                    ? formatAccurateDateTime(archiveDetail.dischargedAt)
                    : "—"}
                </p>
              </div>
              {archiveDetail.chargeAmount !== null ? (
                <div className="col-span-2">
                  <p className="text-[#5b796b]">Total Cost Charged</p>
                  <p className="font-mono-id font-bold text-[#0d4a38]">
                    ₹{archiveDetail.chargeAmount.toFixed(2)}
                  </p>
                </div>
              ) : null}
            </div>

            <div className="rounded-xl border border-[#dcece2] bg-white p-3.5 space-y-1">
              <p className="font-semibold text-[#0f241d]">Discharge Description / Notes</p>
              <p className="text-[#314c40] whitespace-pre-wrap">
                {archiveDetail.dischargeNotes || "No discharge description entered."}
              </p>
            </div>

            {archiveDetail.admissionNotes ? (
              <div className="rounded-xl border border-[#dcece2] bg-white p-3.5 space-y-1">
                <p className="font-semibold text-[#0f241d]">Admission Notes</p>
                <p className="text-[#314c40] whitespace-pre-wrap">
                  {archiveDetail.admissionNotes}
                </p>
              </div>
            ) : null}

            {archiveDetail.bedTransfers.length > 0 ? (
              <div className="rounded-xl border border-[#dcece2] bg-white p-3.5 space-y-2">
                <p className="font-semibold text-[#0f241d]">Bed Transfer Timeline</p>
                <div className="space-y-1.5">
                  {archiveDetail.bedTransfers.map((tr) => (
                    <p key={tr.id} className="text-[#466356]">
                      • {formatAccurateDateTime(tr.transferredAt)} —{" "}
                      {tr.fromBedLabel ?? "Initial"} → {tr.toBedLabel}
                      {tr.reason ? ` (${tr.reason})` : ""}
                    </p>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex items-center justify-between pt-1">
              <Link
                href={`/hospital/patients/${encodeURIComponent(archiveDetail.patient.uhid)}`}
                className="font-semibold text-emerald-700 hover:underline"
              >
                Open Full Patient Timeline →
              </Link>
              <BubblyButton variant="outline" onClick={() => setArchiveDetail(null)}>
                Close
              </BubblyButton>
            </div>
          </div>
        ) : null}
      </AnimatedModal>

      {/* Delete Registered Bed Confirmation Modal */}
      <AnimatedModal
        open={Boolean(deleteBedTarget)}
        onClose={() => setDeleteBedTarget(null)}
        title={`Delete Bed · ${deleteBedTarget?.bedNumber ?? ""}?`}
        subtitle={
          deleteBedTarget
            ? `${deleteBedTarget.ward} · ${deleteBedTarget.category ?? "General"}`
            : undefined
        }
      >
        <div className="space-y-4 text-xs text-[#314c40]">
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-rose-900">
            This removes bed <strong>{deleteBedTarget?.bedNumber}</strong> from the
            hospital bed map. Past discharged admission history will remain preserved.
          </div>
          <div className="flex justify-end gap-3">
            <BubblyButton
              variant="outline"
              onClick={() => setDeleteBedTarget(null)}
            >
              Cancel
            </BubblyButton>
            <BubblyButton
              variant="danger"
              disabled={busy}
              onClick={handleDeleteBed}
            >
              <Trash2 className="h-4 w-4" />
              {busy ? "Deleting..." : "Delete Bed"}
            </BubblyButton>
          </div>
        </div>
      </AnimatedModal>
    </div>
  );
}
