"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Building2,
  Eye,
  FileDown,
  KeyRound,
  LayoutGrid,
  List,
  Pencil,
  Plus,
  Power,
  Search,
  ShieldAlert,
  Trash2,
  Users,
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
import { PHARMACY_MODE, ROLES, getRoleLabel, type PharmacyMode } from "@/lib/constants";
import { getLocalDateTimeInputValue } from "@/lib/datetime";
import { sanitizeMobileInput } from "@/lib/phone";

interface HospitalUser {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
  passwordChangedAt: string | null;
  createdAt: string;
}

interface HospitalItem {
  id: string;
  code: string;
  name: string;
  slug: string;
  uhidPrefix: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  tagline: string | null;
  registrationNo: string | null;
  dailyOpLimit?: number | null;
  pharmacyMode?: PharmacyMode;
  consultancyEnabled?: boolean;
  isActive: boolean;
  deactivatedAt: string | null;
  createdAt: string;
  dailyStats?: {
    todayPatients: number;
    todayOp: number;
    todayIp: number;
    monthPatients: number;
    monthOp: number;
    monthIp: number;
    opExceeded: boolean;
  };
  dailyBreakdown?: Array<{
    date: string;
    label: string;
    patients: number;
    opVisits: number;
    ipAdmissions: number;
  }>;
  users: HospitalUser[];
  pharmacyAccounts: Array<{
    id: string;
    pharmacyName: string;
    contactPerson: string;
    phone: string;
    isActive: boolean;
    user: { username: string; isActive: boolean; lastLoginAt: string | null };
  }>;
  labAccounts: Array<{
    id: string;
    labName: string;
    contactPerson: string;
    phone: string;
    isActive: boolean;
    user: { username: string; isActive: boolean; lastLoginAt: string | null };
  }>;
  _count: {
    patients: number;
    opVisits: number;
    ipAdmissions: number;
    beds: number;
    pharmacyReferrals: number;
    labReferrals: number;
  };
}

export default function SuperAdminHospitalsPage() {
  const { toast } = useToast();
  const [hospitals, setHospitals] = useState<HospitalItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"blocks" | "strips">("blocks");
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [inspectHospital, setInspectHospital] = useState<HospitalItem | null>(
    null
  );
  const [inspectActivity, setInspectActivity] = useState<
    Array<{ id: string; eventId: string; actionType: string; details: string; createdAt: string; actorUsername: string }>
  >([]);
  const [editTarget, setEditTarget] = useState<HospitalItem | null>(null);
  const [resetTarget, setResetTarget] = useState<HospitalItem | null>(null);
  const [statusTarget, setStatusTarget] = useState<HospitalItem | null>(null);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [purgeHospitalId, setPurgeHospitalId] = useState("");
  const [purgeSearchQuery, setPurgeSearchQuery] = useState("");
  const [purgeHighlightIdx, setPurgeHighlightIdx] = useState(0);
  const [purgeFrom, setPurgeFrom] = useState("");
  const [purgeTo, setPurgeTo] = useState("");
  const [purgePreviewLoading, setPurgePreviewLoading] = useState(false);
  const [purgeConfirm, setPurgeConfirm] = useState(false);
  const [purgePreviewError, setPurgePreviewError] = useState<string | null>(null);
  const [purgePreview, setPurgePreview] = useState<{
    patientsToDelete: number;
    patientsPreserved: number;
    opVisits: number;
    ipAdmissions: number;
    activeBedsToFree: number;
    bedTransfers: number;
    pharmacyReferrals: number;
    labReferrals: number;
    billingReceipts: number;
    notifications: number;
    auditLogs: number;
    totalRecords: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null);

  // Create form state
  const [newHospital, setNewHospital] = useState({
    name: "",
    address: "",
    phone: "",
    email: "",
    registrationNo: "",
    dailyOpLimit: "",
    paidMonths: "",
    initialPaymentAmount: "",
    pharmacyMode: PHARMACY_MODE.REFERRALS as PharmacyMode,
    consultancyEnabled: true,
    adminFullName: "",
    adminUsername: "",
    adminEmail: "",
    adminPhone: "",
    adminPassword: "",
  });

  // Edit form state
  const [editForm, setEditForm] = useState({
    name: "",
    uhidPrefix: "",
    address: "",
    phone: "",
    email: "",
    tagline: "",
    registrationNo: "",
    dailyOpLimit: "",
    pharmacyMode: PHARMACY_MODE.REFERRALS as PharmacyMode,
    consultancyEnabled: true,
  });

  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [statusReason, setStatusReason] = useState("");

  const loadHospitals = useCallback(async () => {
    try {
      const tzOffset = new Date().getTimezoneOffset();
      const res = await fetch(`/api/super-admin/hospitals?tzOffset=${tzOffset}`);
      const d = await res.json();
      if (res.ok) {
        setHospitals(d.hospitals ?? []);
        window.dispatchEvent(new Event("verdant:super-admin-alerts-refresh"));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHospitals();
  }, [loadHospitals]);

  const openInspect = async (h: HospitalItem) => {
    setInspectHospital(h);
    setInspectActivity([]);
    const tzOffset = new Date().getTimezoneOffset();
    const res = await fetch(`/api/super-admin/hospitals/${h.id}?tzOffset=${tzOffset}`);
    if (res.ok) {
      const d = await res.json();
      setInspectHospital(d.hospital);
      setInspectActivity(d.hospital.auditLogs ?? []);
    }
  };

  const applyPurgePreset = (preset: "today" | "7d" | "30d" | "older30d") => {
    const now = new Date();
    if (preset === "today") {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      setPurgeFrom(getLocalDateTimeInputValue(start));
      setPurgeTo(getLocalDateTimeInputValue(now));
    } else if (preset === "7d") {
      const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      setPurgeFrom(getLocalDateTimeInputValue(start));
      setPurgeTo(getLocalDateTimeInputValue(now));
    } else if (preset === "30d") {
      const start = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      setPurgeFrom(getLocalDateTimeInputValue(start));
      setPurgeTo(getLocalDateTimeInputValue(now));
    } else {
      const oldest = new Date(2020, 0, 1, 0, 0, 0, 0);
      const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      cutoff.setHours(23, 59, 0, 0);
      setPurgeFrom(getLocalDateTimeInputValue(oldest));
      setPurgeTo(getLocalDateTimeInputValue(cutoff));
    }
    setPurgeConfirm(false);
  };

  const openPurgeModal = (hospital?: HospitalItem) => {
    setPurgeHospitalId(hospital?.id ?? "");
    setPurgeSearchQuery("");
    setPurgeHighlightIdx(0);
    setPurgeConfirm(false);
    setPurgePreview(null);
    setPurgePreviewError(null);
    applyPurgePreset("30d");
    setPurgeOpen(true);
  };

  useEffect(() => {
    if (!purgeOpen || !purgeHospitalId || !purgeFrom || !purgeTo) return;
    let cancelled = false;
    const loadPreview = async () => {
      setPurgePreviewLoading(true);
      setPurgePreviewError(null);
      try {
        const tzOffset = new Date().getTimezoneOffset();
        const res = await fetch(
          `/api/super-admin/hospitals/${encodeURIComponent(purgeHospitalId)}/purge?from=${encodeURIComponent(purgeFrom)}&to=${encodeURIComponent(purgeTo)}&tzOffset=${tzOffset}`
        );
        const d = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setPurgePreview(null);
          setPurgePreviewError(d.error ?? "Unable to preview timeframe records.");
        } else {
          setPurgePreview(d.preview ?? null);
        }
      } catch {
        if (!cancelled) {
          setPurgePreviewError("Network error while previewing timeframe.");
        }
      } finally {
        if (!cancelled) {
          setPurgePreviewLoading(false);
        }
      }
    };
    void loadPreview();
    return () => {
      cancelled = true;
    };
  }, [purgeOpen, purgeHospitalId, purgeFrom, purgeTo]);

  const handlePurgeTimeframe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!purgeHospitalId || !purgeFrom || !purgeTo || !purgeConfirm) return;
    setBusy(true);
    try {
      const tzOffset = new Date().getTimezoneOffset();
      const res = await fetch(
        `/api/super-admin/hospitals/${encodeURIComponent(purgeHospitalId)}/purge`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            from: purgeFrom,
            to: purgeTo,
            tzOffsetMinutes: tzOffset,
            confirmPurge: purgeConfirm,
          }),
        }
      );
      const d = await res.json();
      if (!res.ok) {
        toast({ type: "error", title: "Delete failed", message: d.error });
        return;
      }
      const c = d.deletedCounts ?? {};
      toast({
        type: "success",
        title: `Timeframe data deleted (${d.hospital?.name ?? "Hospital"})`,
        message: `Removed ${c.patients ?? 0} patients, ${c.opVisits ?? 0} OP visits, ${c.ipAdmissions ?? 0} IP admissions, ${c.pharmacyReferrals ?? 0} pharmacy & ${c.labReferrals ?? 0} lab referrals.`,
      });
      setPurgeOpen(false);
      setPurgeConfirm(false);
      void loadHospitals();
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedPaidMonths = Number(newHospital.paidMonths);
    if (
      newHospital.paidMonths.trim() === "" ||
      !Number.isInteger(parsedPaidMonths) ||
      parsedPaidMonths < 1 ||
      parsedPaidMonths > 120
    ) {
      toast({
        type: "error",
        title: "Paid Months Required",
        message: "Please enter a valid number of paid subscription months (1 to 120).",
      });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/super-admin/hospitals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newHospital,
          dailyOpLimit:
            newHospital.dailyOpLimit.trim() !== ""
              ? Number(newHospital.dailyOpLimit)
              : null,
          paidMonths: parsedPaidMonths,
          initialPaymentAmount:
            newHospital.initialPaymentAmount.trim() !== ""
              ? Number(newHospital.initialPaymentAmount)
              : null,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast({ type: "error", title: "Creation failed", message: d.error });
        return;
      }
      toast({
        type: "success",
        title: "Hospital provisioned",
        message: `${d.hospital.name} is live.`,
      });
      setCreateOpen(false);
      setNewHospital({
        name: "",
        address: "",
        phone: "",
        email: "",
        registrationNo: "",
        dailyOpLimit: "",
        paidMonths: "",
        initialPaymentAmount: "",
        pharmacyMode: PHARMACY_MODE.REFERRALS,
        consultancyEnabled: true,
        adminFullName: "",
        adminUsername: "",
        adminEmail: "",
        adminPhone: "",
        adminPassword: "",
      });
      loadHospitals();
    } finally {
      setBusy(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/super-admin/hospitals/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editForm,
          dailyOpLimit:
            editForm.dailyOpLimit.trim() !== ""
              ? Number(editForm.dailyOpLimit)
              : null,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast({ type: "error", title: "Update failed", message: d.error });
        return;
      }
      toast({ type: "success", title: "Hospital updated" });
      setEditTarget(null);
      loadHospitals();
    } finally {
      setBusy(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/super-admin/hospitals/${resetTarget.id}/reset-admin-password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newPassword: newAdminPassword }),
        }
      );
      const d = await res.json();
      if (!res.ok) {
        toast({ type: "error", title: "Reset failed", message: d.error });
        return;
      }
      toast({
        type: "success",
        title: "Admin password reset",
        message: d.message,
      });
      setResetTarget(null);
      setNewAdminPassword("");
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadDataPdf = async (h: HospitalItem) => {
    if (pdfBusyId) return;
    setPdfBusyId(h.id);
    toast({
      type: "info",
      title: "Preparing Hospital Data PDF",
      message: `Compiling OPD, IP, Pharmacy, and Lab records for ${h.name}...`,
    });
    try {
      const tzOffset = new Date().getTimezoneOffset();
      const res = await fetch(
        `/api/super-admin/hospitals/${h.id}/export-pdf?tzOffset=${tzOffset}`
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        toast({
          type: "error",
          title: "PDF export failed",
          message: err?.error ?? "Unable to generate hospital PDF.",
        });
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      const match = cd.match(/filename="([^"]+)"/i);
      const filename =
        match?.[1] ??
        `${h.code.toLowerCase()}-complete-data-${new Date().toISOString().slice(0, 10)}.pdf`;

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
        title: "Hospital Data PDF downloaded",
        message: `${filename} saved with segregated OPD, IP, Pharmacy & Lab sections.`,
      });
    } catch {
      toast({
        type: "error",
        title: "PDF export failed",
        message: "Network error while generating the hospital data PDF.",
      });
    } finally {
      setPdfBusyId(null);
    }
  };

  const handleToggleStatus = async () => {
    if (!statusTarget) return;
    setBusy(true);
    try {
      const nextActive = !statusTarget.isActive;
      const res = await fetch(
        `/api/super-admin/hospitals/${statusTarget.id}/status`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            isActive: nextActive,
            reason: statusReason || undefined,
          }),
        }
      );
      const d = await res.json();
      if (!res.ok) {
        toast({ type: "error", title: "Status update failed", message: d.error });
        return;
      }
      toast({
        type: nextActive ? "success" : "warning",
        title: nextActive ? "Hospital Reactivated" : "Hospital Deactivated",
        message: nextActive
          ? `${statusTarget.name} portals are accessible again.`
          : `${statusTarget.name} deactivated. All active sessions have been terminated immediately.`,
      });
      setStatusTarget(null);
      setStatusReason("");
      loadHospitals();
    } finally {
      setBusy(false);
    }
  };

  const filteredHospitals = hospitals.filter((h) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    const adminUser = h.users.find((u) => u.role === ROLES.HOSPITAL_ADMIN);
    return (
      h.name.toLowerCase().includes(q) ||
      (h.phone ?? "").toLowerCase().includes(q) ||
      (h.email ?? "").toLowerCase().includes(q) ||
      (adminUser?.username ?? "").toLowerCase().includes(q) ||
      (adminUser?.fullName ?? "").toLowerCase().includes(q)
    );
  });

  const openEditForHospital = (h: HospitalItem) => {
    setEditTarget(h);
    setEditForm({
      name: h.name,
      uhidPrefix: h.uhidPrefix,
      address: h.address ?? "",
      phone: h.phone ?? "",
      email: h.email ?? "",
      tagline: h.tagline ?? "",
      registrationNo: h.registrationNo ?? "",
      dailyOpLimit:
        h.dailyOpLimit !== null && h.dailyOpLimit !== undefined
          ? String(h.dailyOpLimit)
          : "",
      pharmacyMode:
        h.pharmacyMode === PHARMACY_MODE.MANAGEMENT
          ? PHARMACY_MODE.MANAGEMENT
          : PHARMACY_MODE.REFERRALS,
      consultancyEnabled: h.consultancyEnabled !== false,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-[#0f241d]">
            Hospital Accounts & Tenants
          </h1>
        </div>

        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 shrink-0">
          {hospitals.length > 0 ? (
            <BubblyButton
              variant="outline"
              onClick={() => openPurgeModal()}
              className="whitespace-nowrap border-rose-200 text-rose-700 hover:bg-rose-50"
            >
              <Trash2 className="h-4 w-4" />
              Delete Data by Timeframe
            </BubblyButton>
          ) : null}
          <BubblyButton
            onClick={() => setCreateOpen(true)}
            className="whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            New Hospital Account
          </BubblyButton>
        </div>
      </div>

      {/* Search Bar & Blocks / Strips Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6c877a]" />
          <input
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search hospitals by name, admin, phone, or email..."
            className="w-full rounded-xl border border-[#cfe2d6] bg-white py-2.5 pl-10 pr-4 text-sm"
          />
        </div>

        <div className="inline-flex rounded-2xl border border-[#cfe2d6] bg-white p-1 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setViewMode("blocks")}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold cursor-pointer transition-colors ${
              viewMode === "blocks"
                ? "bg-[#dff4e8] text-[#0d4a38]"
                : "text-[#466356] hover:text-[#0f241d]"
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Blocks
          </button>
          <button
            type="button"
            onClick={() => setViewMode("strips")}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold cursor-pointer transition-colors ${
              viewMode === "strips"
                ? "bg-[#dff4e8] text-[#0d4a38]"
                : "text-[#466356] hover:text-[#0f241d]"
            }`}
          >
            <List className="h-3.5 w-3.5" />
            Strips
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <SkeletonBox className="h-56" />
          <SkeletonBox className="h-56" />
        </div>
      ) : hospitals.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-6 w-6" />}
          title="No Hospitals Registered"
          description="Create your first hospital account to issue initial admin credentials and isolate tenant operations."
          action={
            <BubblyButton onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Create First Hospital
            </BubblyButton>
          }
        />
      ) : filteredHospitals.length === 0 ? (
        <EmptyState
          icon={<Search className="h-5 w-5" />}
          title="No Matching Hospitals"
          description="No hospital account matched your search query."
        />
      ) : viewMode === "blocks" ? (
        <div className="grid gap-5 lg:grid-cols-2">
          {filteredHospitals.map((h, i) => {
            const adminUser = h.users.find((u) => u.role === ROLES.HOSPITAL_ADMIN);
            const receptionists = h.users.filter(
              (u) => u.role === ROLES.RECEPTIONIST
            );
            const ds = h.dailyStats;
            const hasAlert = Boolean(ds?.opExceeded);

            return (
              <SpringCard key={h.id} delay={i * 0.04} className="p-6">
                <div
                  onClick={() => openInspect(h)}
                  className="flex items-start justify-between gap-3 cursor-pointer"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={h.isActive ? "ACTIVE" : "DEACTIVATED"} />
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${
                          h.pharmacyMode === PHARMACY_MODE.MANAGEMENT
                            ? "bg-emerald-100 text-[#0d4a38] border-emerald-300"
                            : "bg-slate-50 text-[#466356] border-[#d7e7dd]"
                        }`}
                      >
                        {h.pharmacyMode === PHARMACY_MODE.MANAGEMENT
                          ? "Pharmacy Management"
                          : "Pharmacy Referrals"}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${
                          h.consultancyEnabled !== false
                            ? "bg-teal-50 text-teal-800 border-teal-200"
                            : "bg-slate-100 text-slate-500 border-slate-200"
                        }`}
                      >
                        {h.consultancyEnabled !== false
                          ? "Consultancy ON"
                          : "Consultancy OFF"}
                      </span>
                      {hasAlert ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-900 border border-amber-300">
                          <AlertTriangle className="h-3 w-3" /> OP Limit Alert
                        </span>
                      ) : null}
                    </div>
                    <h2 className="mt-2 font-display text-lg font-bold text-[#0f241d] hover:text-[#0d4a38]">
                      {h.name}
                    </h2>
                    <p className="text-xs text-[#466356]">
                      Created {new Date(h.createdAt).toLocaleDateString()} · Today:{" "}
                      <span className={ds?.opExceeded ? "font-bold text-amber-800" : "font-semibold"}>
                        {ds?.todayOp ?? 0} OP{h.dailyOpLimit ? `/${h.dailyOpLimit}` : ""}
                      </span>{" "}
                      · Month: <strong>{ds?.monthPatients ?? 0} pts</strong>
                    </p>
                  </div>
                </div>

                {/* Admin & Associated Portal Accounts Summary */}
                <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl border border-[#dcece2] bg-[#f7fbf8] p-3.5 text-xs">
                  <div>
                    <p className="text-[#5b796b]">Admin Username</p>
                    <p className="mt-0.5 font-mono-id font-semibold text-[#0f241d]">
                      {adminUser ? `@${adminUser.username}` : "Not assigned"}
                    </p>
                    {adminUser ? (
                      <span className="text-[11px] text-emerald-700">
                        {adminUser.isActive ? "Admin Active" : "Admin Inactive"}
                      </span>
                    ) : null}
                  </div>
                  <div>
                    <p className="text-[#5b796b]">Linked Portal Accounts</p>
                    <p className="mt-0.5 font-semibold text-[#0f241d]">
                      {receptionists.length} Reception · {h.pharmacyAccounts.length} Pharmacy ·{" "}
                      {h.labAccounts.length} Lab
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs">
                  <div className="rounded-xl bg-white border border-[#e3efe7] p-2">
                    <p className="font-display text-base font-bold text-[#0d4a38]">
                      {h._count.patients}
                    </p>
                    <p className="text-[11px] text-[#5b796b]">Total Pts</p>
                  </div>
                  <div className="rounded-xl bg-white border border-[#e3efe7] p-2">
                    <p className="font-display text-base font-bold text-[#0d4a38]">
                      {ds?.todayPatients ?? 0}
                    </p>
                    <p className="text-[11px] text-[#5b796b]">Today Pts</p>
                  </div>
                  <div className="rounded-xl bg-white border border-[#e3efe7] p-2">
                    <p className="font-display text-base font-bold text-[#0d4a38]">
                      {ds?.monthPatients ?? 0}
                    </p>
                    <p className="text-[11px] text-[#5b796b]">Month Pts</p>
                  </div>
                  <div className="rounded-xl bg-white border border-[#e3efe7] p-2">
                    <p className="font-display text-base font-bold text-[#0d4a38]">
                      {h._count.pharmacyReferrals + h._count.labReferrals}
                    </p>
                    <p className="text-[11px] text-[#5b796b]">Referrals</p>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  <BubblyButton
                    variant="secondary"
                    className="px-3 py-2 text-xs"
                    onClick={() => openInspect(h)}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Inspect Profile & Daily Stats
                  </BubblyButton>
                  <BubblyButton
                    variant="outline"
                    className="px-3 py-2 text-xs"
                    onClick={() => openEditForHospital(h)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </BubblyButton>
                  <BubblyButton
                    variant="outline"
                    className="px-3 py-2 text-xs"
                    onClick={() => {
                      setResetTarget(h);
                      setNewAdminPassword("");
                    }}
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    Reset Admin Password
                  </BubblyButton>
                  <BubblyButton
                    variant={h.isActive ? "danger" : "primary"}
                    className="px-3 py-2 text-xs"
                    onClick={() => {
                      setStatusTarget(h);
                      setStatusReason("");
                    }}
                  >
                    <Power className="h-3.5 w-3.5" />
                    {h.isActive ? "Deactivate" : "Reactivate"}
                  </BubblyButton>
                  <BubblyButton
                    variant="outline"
                    className="px-3 py-2 text-xs border-emerald-300 text-[#0d4a38] hover:bg-emerald-50"
                    disabled={Boolean(pdfBusyId)}
                    onClick={() => handleDownloadDataPdf(h)}
                  >
                    <FileDown className="h-3.5 w-3.5" />
                    {pdfBusyId === h.id ? "Generating PDF..." : "Download Data PDF"}
                  </BubblyButton>
                  <BubblyButton
                    variant="outline"
                    className="px-3 py-2 text-xs border-rose-200 text-rose-700 hover:bg-rose-50"
                    onClick={() => openPurgeModal(h)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete Data
                  </BubblyButton>
                </div>
              </SpringCard>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredHospitals.map((h) => {
            const adminUser = h.users.find((u) => u.role === ROLES.HOSPITAL_ADMIN);
            const ds = h.dailyStats;
            const hasAlert = Boolean(ds?.opExceeded);

            return (
              <SpringCard
                key={h.id}
                className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:border-emerald-300 transition-colors"
              >
                <div
                  onClick={() => openInspect(h)}
                  className="min-w-0 flex-1 space-y-1 cursor-pointer"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-base font-bold text-[#0f241d]">
                      {h.name}
                    </span>
                    <StatusBadge status={h.isActive ? "ACTIVE" : "DEACTIVATED"} />
                    {hasAlert ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900 border border-amber-300">
                        <AlertTriangle className="h-3 w-3" /> OP Limit Alert
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#466356]">
                    <span>
                      Admin:{" "}
                      <span className="font-mono-id font-semibold text-[#0f241d]">
                        {adminUser ? `@${adminUser.username}` : "Unassigned"}
                      </span>
                    </span>
                    <span>
                      Today OP:{" "}
                      <strong className={ds?.opExceeded ? "text-amber-800" : "text-[#0f241d]"}>
                        {ds?.todayOp ?? 0}
                        {h.dailyOpLimit ? ` / ${h.dailyOpLimit}` : ""}
                      </strong>
                    </span>
                    <span>
                      Month Patients: <strong className="text-[#0d4a38]">{ds?.monthPatients ?? 0}</strong>
                    </span>
                    <span>
                      Total Patients: <strong>{h._count.patients}</strong>
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <BubblyButton
                    variant="secondary"
                    className="px-3 py-1.5 text-xs"
                    onClick={() => openInspect(h)}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Inspect
                  </BubblyButton>
                  <BubblyButton
                    variant="outline"
                    className="px-3 py-1.5 text-xs"
                    onClick={() => openEditForHospital(h)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </BubblyButton>
                  <BubblyButton
                    variant="outline"
                    className="px-3 py-1.5 text-xs"
                    onClick={() => {
                      setResetTarget(h);
                      setNewAdminPassword("");
                    }}
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    Reset PW
                  </BubblyButton>
                  <BubblyButton
                    variant={h.isActive ? "danger" : "primary"}
                    className="px-3 py-1.5 text-xs"
                    onClick={() => {
                      setStatusTarget(h);
                      setStatusReason("");
                    }}
                  >
                    <Power className="h-3.5 w-3.5" />
                    {h.isActive ? "Deactivate" : "Reactivate"}
                  </BubblyButton>
                  <BubblyButton
                    variant="outline"
                    className="px-3 py-1.5 text-xs border-emerald-300 text-[#0d4a38] hover:bg-emerald-50"
                    disabled={Boolean(pdfBusyId)}
                    onClick={() => handleDownloadDataPdf(h)}
                  >
                    <FileDown className="h-3.5 w-3.5" />
                    {pdfBusyId === h.id ? "Generating..." : "Data PDF"}
                  </BubblyButton>
                  <BubblyButton
                    variant="outline"
                    className="px-3 py-1.5 text-xs border-rose-200 text-rose-700 hover:bg-rose-50"
                    onClick={() => openPurgeModal(h)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete Data
                  </BubblyButton>
                </div>
              </SpringCard>
            );
          })}
        </div>
      )}

      {/* Create Hospital Modal */}
      <AnimatedModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Provision New Hospital Tenant"
        subtitle="Creates an isolated hospital workspace with initial Hospital Admin login."
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleCreate} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-[#314c40]">
                Hospital Name *
              </label>
              <input
                required
                value={newHospital.name}
                onChange={(e) =>
                  setNewHospital({ ...newHospital, name: e.target.value })
                }
                placeholder="e.g. Emerald Valley Medical Center"
                className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#314c40]">
                Hospital Phone
              </label>
              <input
                type="tel"
                inputMode="numeric"
                maxLength={10}
                pattern="\d{10}"
                title="Enter exactly 10 digits"
                value={newHospital.phone}
                onChange={(e) =>
                  setNewHospital({
                    ...newHospital,
                    phone: sanitizeMobileInput(e.target.value),
                  })
                }
                className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#314c40]">
                Hospital Email
              </label>
              <input
                type="email"
                value={newHospital.email}
                onChange={(e) =>
                  setNewHospital({ ...newHospital, email: e.target.value })
                }
                className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2.5 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-[#314c40]">
                Address
              </label>
              <input
                value={newHospital.address}
                onChange={(e) =>
                  setNewHospital({ ...newHospital, address: e.target.value })
                }
                className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2.5 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-[#314c40]">
                Daily OP Limit (Alert Threshold — Optional)
              </label>
              <input
                type="number"
                min={1}
                step={1}
                value={newHospital.dailyOpLimit}
                onChange={(e) =>
                  setNewHospital({ ...newHospital, dailyOpLimit: e.target.value })
                }
                placeholder="e.g. 100"
                className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2.5 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[#314c40]">
                Paid Subscription Months *
              </label>
              <input
                type="number"
                required
                min={1}
                max={120}
                step={1}
                value={newHospital.paidMonths}
                onChange={(e) =>
                  setNewHospital({ ...newHospital, paidMonths: e.target.value })
                }
                placeholder="e.g. 6 (months paid)"
                className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2.5 text-sm"
              />
              <p className="mt-1 text-[10px] text-[#5b796b]">
                Required — calculates the paid expiry date for payment-limit alerts.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[#314c40]">
                Initial Amount Collected (₹) (Optional)
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={newHospital.initialPaymentAmount}
                onChange={(e) =>
                  setNewHospital({
                    ...newHospital,
                    initialPaymentAmount: e.target.value,
                  })
                }
                placeholder="e.g. 15000"
                className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2.5 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold text-[#314c40]">
                Pharmacy Module Access *
              </label>
              <div className="grid gap-2.5 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() =>
                    setNewHospital({
                      ...newHospital,
                      pharmacyMode: PHARMACY_MODE.REFERRALS,
                    })
                  }
                  className={`rounded-xl border p-3 text-left transition-all cursor-pointer ${
                    newHospital.pharmacyMode === PHARMACY_MODE.REFERRALS
                      ? "border-emerald-500 bg-[#e6f6ed] ring-2 ring-emerald-500/20"
                      : "border-[#cfe2d6] bg-white hover:bg-emerald-50/40"
                  }`}
                >
                  <p className="font-display text-xs font-bold text-[#0f241d]">
                    Give Pharmacy Referrals
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#466356]">
                    Standard external pharmacy referral routing &amp; fulfilment (Admin, Receptionist &amp; Pharmacy Login).
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setNewHospital({
                      ...newHospital,
                      pharmacyMode: PHARMACY_MODE.MANAGEMENT,
                    })
                  }
                  className={`rounded-xl border p-3 text-left transition-all cursor-pointer ${
                    newHospital.pharmacyMode === PHARMACY_MODE.MANAGEMENT
                      ? "border-emerald-500 bg-[#e6f6ed] ring-2 ring-emerald-500/20"
                      : "border-[#cfe2d6] bg-white hover:bg-emerald-50/40"
                  }`}
                >
                  <p className="font-display text-xs font-bold text-[#0f241d]">
                    Give Pharmacy Management
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#466356]">
                    Full POS Sell Medicine, Stock Management, Add Medicine &amp; Analytics (Admin &amp; Pharmacy Login only; hidden from Receptionist).
                  </p>
                </button>
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold text-[#314c40]">
                Consultancy &amp; Doctor Portal Access *
              </label>
              <div className="grid gap-2.5 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() =>
                    setNewHospital({
                      ...newHospital,
                      consultancyEnabled: true,
                    })
                  }
                  className={`rounded-xl border p-3 text-left transition-all cursor-pointer ${
                    newHospital.consultancyEnabled
                      ? "border-emerald-500 bg-[#e6f6ed] ring-2 ring-emerald-500/20"
                      : "border-[#cfe2d6] bg-white hover:bg-emerald-50/40"
                  }`}
                >
                  <p className="font-display text-xs font-bold text-[#0f241d]">
                    Enable Consultancy
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#466356]">
                    Unlocks Doctor Portal login, daily Consultancy page, direct prescriptions &amp; lab referrals.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setNewHospital({
                      ...newHospital,
                      consultancyEnabled: false,
                    })
                  }
                  className={`rounded-xl border p-3 text-left transition-all cursor-pointer ${
                    !newHospital.consultancyEnabled
                      ? "border-emerald-500 bg-[#e6f6ed] ring-2 ring-emerald-500/20"
                      : "border-[#cfe2d6] bg-white hover:bg-emerald-50/40"
                  }`}
                >
                  <p className="font-display text-xs font-bold text-[#0f241d]">
                    Disable Consultancy
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#466356]">
                    Hides Consultancy page, Doctor Portal access &amp; Pharmacy prescriptions queue.
                  </p>
                </button>
              </div>
            </div>
          </div>

          <div className="border-t border-[#dcece2] pt-4">
            <h4 className="mb-3 font-display text-sm font-bold text-[#0d4a38]">
              Initial Hospital Admin Credentials
            </h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#314c40]">
                  Admin Full Name *
                </label>
                <input
                  required
                  value={newHospital.adminFullName}
                  onChange={(e) =>
                    setNewHospital({ ...newHospital, adminFullName: e.target.value })
                  }
                  className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#314c40]">
                  Admin Username *
                </label>
                <input
                  required
                  value={newHospital.adminUsername}
                  onChange={(e) =>
                    setNewHospital({ ...newHospital, adminUsername: e.target.value })
                  }
                  placeholder="e.g. evmc_admin"
                  className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#314c40]">
                  Admin Email
                </label>
                <input
                  type="email"
                  value={newHospital.adminEmail}
                  onChange={(e) =>
                    setNewHospital({ ...newHospital, adminEmail: e.target.value })
                  }
                  className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#314c40]">
                  Initial Password (min 8 chars) *
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newHospital.adminPassword}
                  onChange={(e) =>
                    setNewHospital({ ...newHospital, adminPassword: e.target.value })
                  }
                  className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2.5 text-sm"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <BubblyButton variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </BubblyButton>
            <BubblyButton type="submit" disabled={busy}>
              {busy ? "Provisioning..." : "Create Hospital Account"}
            </BubblyButton>
          </div>
        </form>
      </AnimatedModal>

      {/* Edit Hospital Modal */}
      <AnimatedModal
        open={Boolean(editTarget)}
        onClose={() => setEditTarget(null)}
        title={`Edit Hospital · ${editTarget?.name ?? ""}`}
      >
        <form onSubmit={handleEdit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold">Hospital Name</label>
              <input
                required
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">Reg. Number</label>
              <input
                value={editForm.registrationNo}
                onChange={(e) =>
                  setEditForm({ ...editForm, registrationNo: e.target.value })
                }
                className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2.5 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold">Phone</label>
              <input
                type="tel"
                inputMode="numeric"
                maxLength={10}
                pattern="\d{10}"
                title="Enter exactly 10 digits"
                value={editForm.phone}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    phone: sanitizeMobileInput(e.target.value),
                  })
                }
                className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">Email</label>
              <input
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2.5 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Address</label>
            <input
              value={editForm.address}
              onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
              className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">
              Daily OP Limit (Optional)
            </label>
            <input
              type="number"
              min={1}
              step={1}
              value={editForm.dailyOpLimit}
              onChange={(e) =>
                setEditForm({ ...editForm, dailyOpLimit: e.target.value })
              }
              placeholder="No limit"
              className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold">
              Pharmacy Module Access
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() =>
                  setEditForm({
                    ...editForm,
                    pharmacyMode: PHARMACY_MODE.REFERRALS,
                  })
                }
                className={`rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-all cursor-pointer ${
                  editForm.pharmacyMode === PHARMACY_MODE.REFERRALS
                    ? "border-emerald-500 bg-[#e6f6ed] text-[#0d4a38]"
                    : "border-[#cfe2d6] bg-white text-[#466356]"
                }`}
              >
                Give Pharmacy Referrals
              </button>
              <button
                type="button"
                onClick={() =>
                  setEditForm({
                    ...editForm,
                    pharmacyMode: PHARMACY_MODE.MANAGEMENT,
                  })
                }
                className={`rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-all cursor-pointer ${
                  editForm.pharmacyMode === PHARMACY_MODE.MANAGEMENT
                    ? "border-emerald-500 bg-[#e6f6ed] text-[#0d4a38]"
                    : "border-[#cfe2d6] bg-white text-[#466356]"
                }`}
              >
                Give Pharmacy Management
              </button>
            </div>
            {editTarget &&
            editForm.pharmacyMode !==
              (editTarget.pharmacyMode ?? PHARMACY_MODE.REFERRALS) ? (
              <p className="mt-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-900">
                Switching pharmacy segment will clear the previous pharmacy module&apos;s data for this hospital. Export a manual backup first if needed.
              </p>
            ) : null}
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold">
              Consultancy &amp; Doctor Portal Access
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() =>
                  setEditForm({
                    ...editForm,
                    consultancyEnabled: true,
                  })
                }
                className={`rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-all cursor-pointer ${
                  editForm.consultancyEnabled
                    ? "border-emerald-500 bg-[#e6f6ed] text-[#0d4a38]"
                    : "border-[#cfe2d6] bg-white text-[#466356]"
                }`}
              >
                Enable Consultancy
              </button>
              <button
                type="button"
                onClick={() =>
                  setEditForm({
                    ...editForm,
                    consultancyEnabled: false,
                  })
                }
                className={`rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-all cursor-pointer ${
                  !editForm.consultancyEnabled
                    ? "border-emerald-500 bg-[#e6f6ed] text-[#0d4a38]"
                    : "border-[#cfe2d6] bg-white text-[#466356]"
                }`}
              >
                Disable Consultancy
              </button>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <BubblyButton variant="outline" onClick={() => setEditTarget(null)}>
              Cancel
            </BubblyButton>
            <BubblyButton type="submit" disabled={busy}>
              {busy ? "Saving..." : "Save Changes"}
            </BubblyButton>
          </div>
        </form>
      </AnimatedModal>

      {/* Reset Hospital Admin Password Modal */}
      <AnimatedModal
        open={Boolean(resetTarget)}
        onClose={() => setResetTarget(null)}
        title={`Reset Hospital Admin Password · ${resetTarget?.name ?? ""}`}
        subtitle="Sets a new hashed password and revokes existing Hospital Admin sessions."
      >
        <form onSubmit={handleResetPassword} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-[#314c40]">
              New Admin Password (min 8 characters)
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={newAdminPassword}
              onChange={(e) => setNewAdminPassword(e.target.value)}
              className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2.5 text-sm"
            />
          </div>
          <div className="flex justify-end gap-3">
            <BubblyButton variant="outline" onClick={() => setResetTarget(null)}>
              Cancel
            </BubblyButton>
            <BubblyButton type="submit" disabled={busy}>
              {busy ? "Resetting..." : "Confirm Password Reset"}
            </BubblyButton>
          </div>
        </form>
      </AnimatedModal>

      {/* Activate / Deactivate Confirmation Modal */}
      <AnimatedModal
        open={Boolean(statusTarget)}
        onClose={() => setStatusTarget(null)}
        title={
          statusTarget?.isActive
            ? `Deactivate ${statusTarget?.name}?`
            : `Reactivate ${statusTarget?.name}?`
        }
      >
        <div className="space-y-4 text-sm text-[#314c40]">
          {statusTarget?.isActive ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-900 space-y-1.5">
              <p className="flex items-center gap-2 font-bold">
                <ShieldAlert className="h-4 w-4 text-rose-600" />
                Immediate Multi-Portal Access Revocation
              </p>
              <p>
                Deactivating this hospital immediately blocks logins and revokes active
                sessions for its Hospital Admin, Receptionists, Pharmacy partners, and
                Laboratory partners. All existing patient, billing, and referral records
                are safely preserved.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-900">
              Reactivating restores portal sign-in access for all active accounts under{" "}
              <strong>{statusTarget?.name}</strong>.
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold">
              Audit Reason (optional)
            </label>
            <input
              value={statusReason}
              onChange={(e) => setStatusReason(e.target.value)}
              placeholder="e.g. Subscription suspended / Maintenance / Reactivated"
              className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2.5 text-sm"
            />
          </div>

          <div className="flex justify-end gap-3">
            <BubblyButton variant="outline" onClick={() => setStatusTarget(null)}>
              Cancel
            </BubblyButton>
            <BubblyButton
              variant={statusTarget?.isActive ? "danger" : "primary"}
              disabled={busy}
              onClick={handleToggleStatus}
            >
              {busy
                ? "Updating..."
                : statusTarget?.isActive
                  ? "Deactivate Hospital Immediately"
                  : "Reactivate Hospital"}
            </BubblyButton>
          </div>
        </div>
      </AnimatedModal>

      {/* Inspect Hospital Accounts & Activity Modal */}
      <AnimatedModal
        open={Boolean(inspectHospital)}
        onClose={() => setInspectHospital(null)}
        title={`Tenant Inspection · ${inspectHospital?.name ?? ""}`}
        subtitle="Daily & Monthly Patient Monitoring, Associated Portal Accounts & Audit Events"
        maxWidth="max-w-3xl"
      >
        {inspectHospital ? (
          <div className="space-y-6">
            {/* Daily & Monthly Patient Summary */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#5b796b]">
                  Daily & Monthly Patient Monitoring
                </h4>
                <BubblyButton
                  variant="outline"
                  className="px-3 py-1.5 text-xs border-emerald-300 text-[#0d4a38] hover:bg-emerald-50"
                  disabled={Boolean(pdfBusyId)}
                  onClick={() => handleDownloadDataPdf(inspectHospital)}
                >
                  <FileDown className="h-3.5 w-3.5" />
                  {pdfBusyId === inspectHospital.id
                    ? "Generating Data PDF..."
                    : "Download Data PDF"}
                </BubblyButton>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div className="rounded-xl border border-[#dcece2] bg-[#f8fcfa] p-3">
                  <p className="text-[#5b796b]">Today&apos;s New Patients</p>
                  <p className="mt-1 font-display text-xl font-extrabold text-[#0d4a38]">
                    {inspectHospital.dailyStats?.todayPatients ?? 0}
                  </p>
                </div>
                <div
                  className={`rounded-xl border p-3 ${
                    inspectHospital.dailyStats?.opExceeded
                      ? "border-amber-300 bg-amber-50"
                      : "border-[#dcece2] bg-[#f8fcfa]"
                  }`}
                >
                  <p className="text-[#5b796b]">Today&apos;s OP Visits</p>
                  <p className="mt-1 font-display text-xl font-extrabold text-[#0d4a38]">
                    {inspectHospital.dailyStats?.todayOp ?? 0}
                    {inspectHospital.dailyOpLimit ? (
                      <span className="ml-1 text-xs font-semibold text-[#466356]">
                        / {inspectHospital.dailyOpLimit}
                      </span>
                    ) : null}
                  </p>
                  {inspectHospital.dailyStats?.opExceeded ? (
                    <span className="text-[10px] font-bold text-amber-800">
                      Daily OP limit exceeded
                    </span>
                  ) : null}
                </div>
                <div className="rounded-xl border border-[#dcece2] bg-[#f8fcfa] p-3">
                  <p className="text-[#5b796b]">Today&apos;s IP Admissions</p>
                  <p className="mt-1 font-display text-xl font-extrabold text-[#0d4a38]">
                    {inspectHospital.dailyStats?.todayIp ?? 0}
                  </p>
                </div>
                <div className="rounded-xl border border-[#dcece2] bg-white p-3">
                  <p className="text-[#5b796b]">Monthly New Patients</p>
                  <p className="mt-1 font-display text-xl font-extrabold text-[#0f241d]">
                    {inspectHospital.dailyStats?.monthPatients ?? 0}
                  </p>
                </div>
                <div className="rounded-xl border border-[#dcece2] bg-white p-3">
                  <p className="text-[#5b796b]">Monthly OP Visits</p>
                  <p className="mt-1 font-display text-xl font-extrabold text-[#0f241d]">
                    {inspectHospital.dailyStats?.monthOp ?? 0}
                  </p>
                </div>
                <div className="rounded-xl border border-[#dcece2] bg-white p-3">
                  <p className="text-[#5b796b]">Monthly IP Admissions</p>
                  <p className="mt-1 font-display text-xl font-extrabold text-[#0f241d]">
                    {inspectHospital.dailyStats?.monthIp ?? 0}
                  </p>
                </div>
              </div>

              {inspectHospital.dailyBreakdown && inspectHospital.dailyBreakdown.length > 0 ? (
                <div className="max-h-44 overflow-y-auto rounded-2xl border border-[#dcece2]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#f4faf6] text-[#466356] sticky top-0">
                      <tr>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">New Patients</th>
                        <th className="px-3 py-2">OP Visits</th>
                        <th className="px-3 py-2">IP Admissions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#eaf4ee]">
                      {inspectHospital.dailyBreakdown.map((day) => (
                        <tr key={day.date}>
                          <td className="px-3 py-2 font-mono-id text-[#0f241d]">
                            {day.label} ({day.date})
                          </td>
                          <td className="px-3 py-2 font-semibold">{day.patients}</td>
                          <td className="px-3 py-2 font-semibold">{day.opVisits}</td>
                          <td className="px-3 py-2 font-semibold">{day.ipAdmissions}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
            <div>
              <h4 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#5b796b]">
                <Users className="h-4 w-4 text-emerald-600" />
                Associated User Accounts (Passwords Never Exposed)
              </h4>
              <div className="overflow-x-auto rounded-2xl border border-[#dcece2]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#f4faf6] text-[#466356]">
                    <tr>
                      <th className="p-3">Role</th>
                      <th className="p-3">Name / Partner</th>
                      <th className="p-3">Username</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Last Login</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#eaf4ee]">
                    {inspectHospital.users.map((u) => {
                      const pharm = inspectHospital.pharmacyAccounts.find(
                        (p) => p.user.username === u.username
                      );
                      const lab = inspectHospital.labAccounts.find(
                        (l) => l.user.username === u.username
                      );
                      return (
                        <tr key={u.id}>
                          <td className="p-3 font-semibold text-[#0d4a38]">
                            {getRoleLabel(u.role)}
                          </td>
                          <td className="p-3">
                            <p className="font-medium text-[#0f241d]">{u.fullName}</p>
                            {pharm ? (
                              <p className="text-[11px] text-[#5b796b]">
                                Pharmacy: {pharm.pharmacyName}
                              </p>
                            ) : null}
                            {lab ? (
                              <p className="text-[11px] text-[#5b796b]">
                                Lab: {lab.labName}
                              </p>
                            ) : null}
                          </td>
                          <td className="p-3 font-mono-id">@{u.username}</td>
                          <td className="p-3">
                            <StatusBadge status={u.isActive ? "ACTIVE" : "INACTIVE"} />
                          </td>
                          <td className="p-3 text-[#5b796b]">
                            {u.lastLoginAt
                              ? new Date(u.lastLoginAt).toLocaleString()
                              : "Never"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-[#5b796b]">
                Recent Tenant Audit Activity
              </h4>
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {inspectActivity.length === 0 ? (
                  <p className="text-xs text-[#5b796b]">
                    No audit activity recorded yet.
                  </p>
                ) : (
                  inspectActivity.map((a) => (
                    <div
                      key={a.id}
                      className="rounded-xl border border-[#e3efe7] bg-[#f8fcfa] p-3 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[#0d4a38]">
                          {a.actionType.replace(/_/g, " ")}
                        </span>
                        <span className="text-[11px] text-[#5b796b]">
                          {new Date(a.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="mt-1 text-[#314c40]">{a.details}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : null}
      </AnimatedModal>

      {/* Delete Hospital Admin Data by Timeframe Modal */}
      <AnimatedModal
        open={purgeOpen}
        onClose={() => setPurgeOpen(false)}
        title="Delete Hospital Data by Timeframe"
        subtitle="Select a Hospital Admin tenant and date/time window to permanently remove operational records."
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handlePurgeTimeframe} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-[#314c40]">
              Search & Select Hospital (Name, Owner/Admin Name, or Mobile Number) *
            </label>
            {(() => {
              const selectedPurgeHospital = hospitals.find(
                (h) => h.id === purgeHospitalId
              );
              if (selectedPurgeHospital) {
                const adm = selectedPurgeHospital.users.find(
                  (u) => u.role === ROLES.HOSPITAL_ADMIN
                );
                return (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2.5 text-xs">
                    <div className="min-w-0">
                      <p className="truncate font-bold text-[#0f241d]">
                        {selectedPurgeHospital.name}
                      </p>
                      <p className="mt-0.5 truncate text-[#466356]">
                        {adm ? `Owner/Admin: ${adm.fullName} (@${adm.username})` : "No admin assigned"}
                        {selectedPurgeHospital.phone || adm?.phone
                          ? ` · ${selectedPurgeHospital.phone ?? adm?.phone}`
                          : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setPurgeHospitalId("");
                        setPurgeSearchQuery("");
                        setPurgeHighlightIdx(0);
                        setPurgePreview(null);
                        setPurgePreviewError(null);
                        setPurgeConfirm(false);
                      }}
                      className="shrink-0 font-semibold text-rose-700 hover:underline cursor-pointer"
                    >
                      Change
                    </button>
                  </div>
                );
              }

              const q = purgeSearchQuery.trim().toLowerCase();
              const matchingHospitals = q
                ? hospitals.filter((h) => {
                    const adm = h.users.find((u) => u.role === ROLES.HOSPITAL_ADMIN);
                    return (
                      h.name.toLowerCase().includes(q) ||
                      (h.phone ?? "").toLowerCase().includes(q) ||
                      (adm?.fullName ?? "").toLowerCase().includes(q) ||
                      (adm?.username ?? "").toLowerCase().includes(q) ||
                      (adm?.phone ?? "").toLowerCase().includes(q)
                    );
                  })
                : [];

              return (
                <div>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6c877a]" />
                    <input
                      type="text"
                      value={purgeSearchQuery}
                      onChange={(e) => {
                        setPurgeSearchQuery(e.target.value);
                        setPurgeHighlightIdx(0);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          if (matchingHospitals.length > 0) {
                            setPurgeHighlightIdx((prev) =>
                              Math.min(matchingHospitals.length - 1, prev + 1)
                            );
                          }
                        } else if (e.key === "ArrowUp") {
                          e.preventDefault();
                          setPurgeHighlightIdx((prev) => Math.max(0, prev - 1));
                        } else if (e.key === "Enter") {
                          e.preventDefault();
                          if (matchingHospitals.length > 0) {
                            const picked =
                              matchingHospitals[
                                Math.min(purgeHighlightIdx, matchingHospitals.length - 1)
                              ];
                            setPurgeHospitalId(picked.id);
                            setPurgeSearchQuery("");
                            setPurgeConfirm(false);
                          }
                        }
                      }}
                      placeholder="Type hospital name, owner/admin name, or mobile number..."
                      className="w-full rounded-xl border border-[#cfe2d6] bg-white py-2.5 pl-9 pr-3 text-sm"
                    />
                  </div>
                  {q ? (
                    <div className="mt-2 max-h-44 space-y-1 overflow-y-auto rounded-xl border border-[#dcece2] bg-white p-1.5">
                      {matchingHospitals.length === 0 ? (
                        <p className="p-2 text-xs text-[#5b796b]">
                          No hospitals matched your search.
                        </p>
                      ) : (
                        matchingHospitals.map((h, idx) => {
                          const adm = h.users.find(
                            (u) => u.role === ROLES.HOSPITAL_ADMIN
                          );
                          const activeIdx = Math.min(
                            purgeHighlightIdx,
                            matchingHospitals.length - 1
                          );
                          const isHighlighted = idx === activeIdx;
                          return (
                            <button
                              key={h.id}
                              type="button"
                              onClick={() => {
                                setPurgeHospitalId(h.id);
                                setPurgeSearchQuery("");
                                setPurgeConfirm(false);
                              }}
                              className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition-colors cursor-pointer ${
                                isHighlighted
                                  ? "bg-emerald-100 text-[#0d4a38]"
                                  : "hover:bg-emerald-50"
                              }`}
                            >
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-[#0f241d]">
                                  {h.name}
                                </p>
                                <p className="truncate text-[11px] text-[#5b796b]">
                                  {adm
                                    ? `${adm.fullName} (@${adm.username})`
                                    : "Unassigned"}
                                </p>
                              </div>
                              <span className="shrink-0 font-mono-id text-[11px] text-[#466356]">
                                {h.phone ?? adm?.phone ?? "No phone"}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })()}
          </div>

          <div className="space-y-2">
            <span className="block text-xs font-semibold text-[#314c40]">
              Quick Timeframe Presets
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => applyPurgePreset("today")}
                className="rounded-lg border border-[#cfe2d6] bg-[#f8fcfa] px-2.5 py-1.5 text-xs font-medium text-[#0d4a38] hover:bg-emerald-50 cursor-pointer"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => applyPurgePreset("7d")}
                className="rounded-lg border border-[#cfe2d6] bg-[#f8fcfa] px-2.5 py-1.5 text-xs font-medium text-[#0d4a38] hover:bg-emerald-50 cursor-pointer"
              >
                Last 7 Days
              </button>
              <button
                type="button"
                onClick={() => applyPurgePreset("30d")}
                className="rounded-lg border border-[#cfe2d6] bg-[#f8fcfa] px-2.5 py-1.5 text-xs font-medium text-[#0d4a38] hover:bg-emerald-50 cursor-pointer"
              >
                Last 30 Days
              </button>
              <button
                type="button"
                onClick={() => applyPurgePreset("older30d")}
                className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100 cursor-pointer"
              >
                Older than 30 Days
              </button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#314c40]">
                From Date & Time *
              </label>
              <input
                type="datetime-local"
                required
                value={purgeFrom}
                onChange={(e) => {
                  setPurgeFrom(e.target.value);
                  setPurgeConfirm(false);
                }}
                className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#314c40]">
                To Date & Time *
              </label>
              <input
                type="datetime-local"
                required
                value={purgeTo}
                onChange={(e) => {
                  setPurgeTo(e.target.value);
                  setPurgeConfirm(false);
                }}
                className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2.5 text-sm"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-[#dcece2] bg-[#f8fcfa] p-4">
            <p className="mb-2.5 text-xs font-bold uppercase tracking-wider text-[#466356]">
              Records Scheduled for Deletion in Timeframe
            </p>
            {purgePreviewLoading ? (
              <p className="text-xs text-[#5b796b]">Calculating matching records...</p>
            ) : purgePreviewError ? (
              <p className="text-xs font-medium text-rose-700">{purgePreviewError}</p>
            ) : purgePreview ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                  <div className="rounded-xl border border-[#e3efe7] bg-white p-2.5">
                    <p className="text-[#5b796b]">Patients</p>
                    <p className="mt-0.5 font-display text-lg font-bold text-[#0f241d]">
                      {purgePreview.patientsToDelete}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[#e3efe7] bg-white p-2.5">
                    <p className="text-[#5b796b]">OP Visits</p>
                    <p className="mt-0.5 font-display text-lg font-bold text-[#0f241d]">
                      {purgePreview.opVisits}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[#e3efe7] bg-white p-2.5">
                    <p className="text-[#5b796b]">IP Admissions</p>
                    <p className="mt-0.5 font-display text-lg font-bold text-[#0f241d]">
                      {purgePreview.ipAdmissions}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[#e3efe7] bg-white p-2.5">
                    <p className="text-[#5b796b]">Pharmacy Refs</p>
                    <p className="mt-0.5 font-display text-lg font-bold text-[#0f241d]">
                      {purgePreview.pharmacyReferrals}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[#e3efe7] bg-white p-2.5">
                    <p className="text-[#5b796b]">Lab Refs</p>
                    <p className="mt-0.5 font-display text-lg font-bold text-[#0f241d]">
                      {purgePreview.labReferrals}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[#e3efe7] bg-white p-2.5">
                    <p className="text-[#5b796b]">Billing Receipts</p>
                    <p className="mt-0.5 font-display text-lg font-bold text-[#0f241d]">
                      {purgePreview.billingReceipts}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[#e3efe7] bg-white p-2.5">
                    <p className="text-[#5b796b]">Audit Logs</p>
                    <p className="mt-0.5 font-display text-lg font-bold text-[#0f241d]">
                      {purgePreview.auditLogs}
                    </p>
                  </div>
                  <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-2.5">
                    <p className="text-rose-800">Total Records</p>
                    <p className="mt-0.5 font-display text-lg font-bold text-rose-900">
                      {purgePreview.totalRecords}
                    </p>
                  </div>
                </div>

                {purgePreview.activeBedsToFree > 0 ? (
                  <p className="text-[11px] font-medium text-amber-800">
                    • {purgePreview.activeBedsToFree} occupied bed(s) from active IP admissions in this window will be automatically released back to Available.
                  </p>
                ) : null}

                {purgePreview.patientsPreserved > 0 ? (
                  <p className="text-[11px] text-[#466356]">
                    • {purgePreview.patientsPreserved} patient profile(s) registered in this window have visits/admissions outside this range and will remain preserved so newer history stays intact.
                  </p>
                ) : null}

                <p className="text-[11px] text-[#5b796b]">
                  Hospital Admin accounts, staff logins, beds, doctors, and medicine/lab test catalogues are never removed.
                </p>
              </div>
            ) : null}
          </div>

          <label className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50/70 p-3 text-xs text-rose-950 cursor-pointer">
            <input
              type="checkbox"
              checked={purgeConfirm}
              onChange={(e) => setPurgeConfirm(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-rose-300 text-rose-600"
            />
            <span>
              I confirm that I want to permanently delete the matching timeframe data for{" "}
              <strong>
                {hospitals.find((h) => h.id === purgeHospitalId)?.name ??
                  "this hospital"}
              </strong>
              . This action cannot be undone.
            </span>
          </label>

          <div className="flex justify-end gap-3 pt-1">
            <BubblyButton variant="outline" onClick={() => setPurgeOpen(false)}>
              Cancel
            </BubblyButton>
            <BubblyButton
              type="submit"
              variant="danger"
              disabled={
                busy ||
                purgePreviewLoading ||
                !purgeConfirm ||
                !purgePreview ||
                purgePreview.totalRecords === 0
              }
            >
              <Trash2 className="h-4 w-4" />
              {busy ? "Deleting Data..." : "Permanently Delete Timeframe Data"}
            </BubblyButton>
          </div>
        </form>
      </AnimatedModal>
    </div>
  );
}
