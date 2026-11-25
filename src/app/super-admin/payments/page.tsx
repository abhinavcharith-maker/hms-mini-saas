"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CreditCard,
  IndianRupee,
  Power,
  ReceiptText,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import {
  AnimatedModal,
  BubblyButton,
  EmptyState,
  SkeletonBox,
  SpringCard,
  StatCard,
  StatusBadge,
} from "@/components/ui/MotionPrimitives";
import { useToast } from "@/components/providers/AppProviders";
import { formatAccurateDate, formatAccurateDateTime } from "@/lib/datetime";
import {
  computeNewSubscriptionExpiry,
  formatInrAmount,
  type PaymentStatus,
} from "@/lib/payments";
import { SUPER_ADMIN_ALERTS_REFRESH_EVENT } from "@/components/super-admin/SuperAdminAlertsBell";

interface HospitalPaymentEntry {
  id: string;
  durationValue: number;
  durationUnit: string;
  monthsAdded: number;
  amountCollected: number;
  previousExpiresAt: string | null;
  newExpiresAt: string;
  notes: string | null;
  recordedByUsername: string;
  paidAt: string;
}

interface PaymentHospitalItem {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  deactivatedAt: string | null;
  createdAt: string;
  subscriptionMonthsPaid: number;
  subscriptionExpiresAt: string | null;
  subscriptionTotalPaid: number;
  payments: HospitalPaymentEntry[];
  _count: {
    payments: number;
    patients: number;
    opVisits: number;
  };
  paymentState: {
    status: PaymentStatus;
    isOverdue: boolean;
    daysOverdue: number;
    daysRemaining: number | null;
  };
}

interface OverdueAlert {
  hospitalId: string;
  hospitalName: string;
  hospitalCode: string;
  isActive: boolean;
  subscriptionMonthsPaid: number;
  subscriptionExpiresAt: string;
  daysOverdue: number;
}

interface PaymentsResponse {
  summary: {
    totalGrossAmount: number;
    totalHospitals: number;
    activePaidCount: number;
    overdueCount: number;
    unsetCount: number;
    deactivatedCount: number;
    totalPaymentsCount: number;
  };
  overdueAlerts: OverdueAlert[];
  hospitals: PaymentHospitalItem[];
}

export default function SuperAdminPaymentsPage() {
  const { toast } = useToast();
  const [data, setData] = useState<PaymentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState<
    "ALL" | "OVERDUE" | "ACTIVE" | "UNSET" | "DEACTIVATED"
  >("ALL");
  const [expandedHistoryIds, setExpandedHistoryIds] = useState<Record<string, boolean>>({});

  // Extend timeline two-step modal (Step 1: Duration Months/Years -> Enter -> Step 2: Amount Collected)
  const [extendTarget, setExtendTarget] = useState<PaymentHospitalItem | null>(null);
  const [extendStep, setExtendStep] = useState<1 | 2>(1);
  const [durationUnit, setDurationUnit] = useState<"MONTHS" | "YEARS">("MONTHS");
  const [durationValue, setDurationValue] = useState("1");
  const [amountCollected, setAmountCollected] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [submittingExtend, setSubmittingExtend] = useState(false);
  const durationInputRef = useRef<HTMLInputElement | null>(null);
  const amountInputRef = useRef<HTMLInputElement | null>(null);

  // Deactivate / Reactivate modal right inside Payments section
  const [statusTarget, setStatusTarget] = useState<PaymentHospitalItem | null>(null);
  const [statusReason, setStatusReason] = useState("");
  const [busyStatus, setBusyStatus] = useState(false);

  const loadPayments = useCallback(async () => {
    try {
      const res = await fetch("/api/super-admin/payments", { cache: "no-store" });
      const d = (await res.json()) as PaymentsResponse & { error?: string };
      if (res.ok) {
        setData(d);
        window.dispatchEvent(new Event(SUPER_ADMIN_ALERTS_REFRESH_EVENT));
      } else {
        toast({
          type: "error",
          title: "Unable to load payments",
          message: d.error ?? "Please try refreshing.",
        });
      }
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadPayments();
  }, [loadPayments]);

  useEffect(() => {
    if (!extendTarget) return;
    const t = window.setTimeout(() => {
      if (extendStep === 1) {
        durationInputRef.current?.focus();
        durationInputRef.current?.select();
      } else {
        amountInputRef.current?.focus();
        amountInputRef.current?.select();
      }
    }, 60);
    return () => window.clearTimeout(t);
  }, [extendTarget, extendStep]);

  const openExtendModal = (h: PaymentHospitalItem) => {
    setExtendTarget(h);
    setExtendStep(1);
    setDurationUnit("MONTHS");
    setDurationValue("1");
    setAmountCollected("");
    setPaymentNotes("");
  };

  const parsedDurationNum = useMemo(() => {
    const n = Number(durationValue);
    return Number.isInteger(n) && n >= 1 && n <= 120 ? n : null;
  }, [durationValue]);

  const monthsToAdd = useMemo(() => {
    if (!parsedDurationNum) return 0;
    return durationUnit === "YEARS" ? parsedDurationNum * 12 : parsedDurationNum;
  }, [parsedDurationNum, durationUnit]);

  const previewNewExpiry = useMemo(() => {
    if (!extendTarget || monthsToAdd <= 0) return null;
    const currentExpiry = extendTarget.subscriptionExpiresAt
      ? new Date(extendTarget.subscriptionExpiresAt)
      : null;
    return computeNewSubscriptionExpiry(currentExpiry, monthsToAdd);
  }, [extendTarget, monthsToAdd]);

  const handleStep1Continue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsedDurationNum) {
      toast({
        type: "error",
        title: "Invalid duration",
        message: "Enter a whole number between 1 and 120.",
      });
      return;
    }
    setExtendStep(2);
  };

  const handleConfirmExtend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extendTarget || !parsedDurationNum) return;

    const amt = Number(amountCollected);
    if (amountCollected.trim() === "" || !Number.isFinite(amt) || amt < 0) {
      toast({
        type: "error",
        title: "Amount required",
        message: "Enter the collected amount (0 or greater).",
      });
      amountInputRef.current?.focus();
      return;
    }

    setSubmittingExtend(true);
    try {
      const res = await fetch("/api/super-admin/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hospitalId: extendTarget.id,
          durationValue: parsedDurationNum,
          durationUnit,
          amountCollected: amt,
          notes: paymentNotes.trim() || null,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast({
          type: "error",
          title: "Extension failed",
          message: d.error ?? "Unable to record payment.",
        });
        return;
      }

      toast({
        type: "success",
        title: "Timeline extended & payment recorded",
        message: `${extendTarget.name} extended by ${parsedDurationNum} ${
          durationUnit === "YEARS" ? "year(s)" : "month(s)"
        } · Collected ${formatInrAmount(amt)}.`,
      });
      setExtendTarget(null);
      void loadPayments();
    } finally {
      setSubmittingExtend(false);
    }
  };

  const handleToggleHospitalStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusTarget) return;
    setBusyStatus(true);
    try {
      const res = await fetch(
        `/api/super-admin/hospitals/${statusTarget.id}/status`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            isActive: !statusTarget.isActive,
            reason: statusReason.trim() || null,
          }),
        }
      );
      const d = await res.json();
      if (!res.ok) {
        toast({
          type: "error",
          title: "Status update failed",
          message: d.error ?? "Could not change hospital status.",
        });
        return;
      }

      toast({
        type: "success",
        title: statusTarget.isActive
          ? "Hospital deactivated"
          : "Hospital reactivated",
        message: statusTarget.isActive
          ? `${statusTarget.name} has been manually deactivated.`
          : `${statusTarget.name} is active again.`,
      });
      setStatusTarget(null);
      setStatusReason("");
      void loadPayments();
    } finally {
      setBusyStatus(false);
    }
  };

  const filteredHospitals = useMemo(() => {
    const list = data?.hospitals ?? [];
    const q = searchQuery.trim().toLowerCase();
    return list.filter((h) => {
      if (filterMode === "OVERDUE" && !h.paymentState.isOverdue) return false;
      if (
        filterMode === "ACTIVE" &&
        h.paymentState.status !== "ACTIVE" &&
        h.paymentState.status !== "EXPIRING_SOON"
      ) {
        return false;
      }
      if (filterMode === "UNSET" && h.paymentState.status !== "UNSET") return false;
      if (filterMode === "DEACTIVATED" && h.isActive) return false;
      if (!q) return true;
      return (
        h.name.toLowerCase().includes(q) ||
        h.code.toLowerCase().includes(q) ||
        (h.email ?? "").toLowerCase().includes(q) ||
        (h.phone ?? "").toLowerCase().includes(q)
      );
    });
  }, [data, filterMode, searchQuery]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <SkeletonBox key={i} className="h-32" />
          ))}
        </div>
        <SkeletonBox className="h-80" />
      </div>
    );
  }

  const summary = data?.summary ?? {
    totalGrossAmount: 0,
    totalHospitals: 0,
    activePaidCount: 0,
    overdueCount: 0,
    unsetCount: 0,
    deactivatedCount: 0,
    totalPaymentsCount: 0,
  };
  const overdueAlerts = data?.overdueAlerts ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-[#0f241d]">
            Hospital Payments & Subscriptions
          </h1>
          <p className="mt-1 text-sm text-[#466356]">
            Monitor paid hospital timelines, receive payment-limit-crossed alerts without auto-blocking hospitals, extend timelines with collected amounts, and manually deactivate when needed.
          </p>
        </div>

        <BubblyButton
          variant="outline"
          onClick={() => void loadPayments()}
          className="shrink-0"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh Payments
        </BubblyButton>
      </div>

      {/* KPI Strip */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Gross Amount"
          value={formatInrAmount(summary.totalGrossAmount)}
          subtitle={`${summary.totalPaymentsCount} payment record(s) collected`}
          icon={<IndianRupee className="h-5 w-5" />}
          tone="forest"
          delay={0}
        />
        <StatCard
          title="Payment Limit Crossed"
          value={summary.overdueCount}
          subtitle={
            summary.overdueCount > 0
              ? "Alert only — hospitals remain unblocked"
              : "All tracked hospitals within timeline"
          }
          icon={<AlertTriangle className="h-5 w-5" />}
          tone={summary.overdueCount > 0 ? "rose" : "emerald"}
          delay={0.04}
        />
        <StatCard
          title="Active Paid Plans"
          value={summary.activePaidCount}
          subtitle={`${summary.unsetCount} hospital(s) without timeline set`}
          icon={<CheckCircle2 className="h-5 w-5" />}
          tone="emerald"
          delay={0.08}
        />
        <StatCard
          title="Total Hospitals"
          value={summary.totalHospitals}
          subtitle={`${summary.deactivatedCount} manually deactivated`}
          icon={<CreditCard className="h-5 w-5" />}
          tone="teal"
          delay={0.12}
        />
      </div>

      {/* Payment Limit Crossed Alerts Banner */}
      {overdueAlerts.length > 0 ? (
        <SpringCard className="border-rose-200 bg-gradient-to-br from-rose-50/90 via-white to-amber-50/70 p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700 border border-rose-200">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-display text-base font-bold text-rose-950">
                  Payment Limit Crossed Alerts ({overdueAlerts.length})
                </h2>
                <p className="text-xs text-rose-800">
                  These hospitals have crossed their paid subscription timeline. Access is{" "}
                  <strong>not auto-blocked</strong> — you may extend their timeline or manually deactivate them below.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {overdueAlerts.map((al) => {
              const targetHospital = data?.hospitals.find(
                (h) => h.id === al.hospitalId
              );
              return (
                <div
                  key={al.hospitalId}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-white/95 p-3.5 shadow-xs"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-display text-sm font-bold text-[#0f241d]">
                        {al.hospitalName}
                      </span>
                      <span className="font-mono-id rounded bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-800 border border-rose-200">
                        {al.hospitalCode}
                      </span>
                      {!al.isActive ? (
                        <StatusBadge status="DEACTIVATED" />
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs font-semibold text-rose-700">
                      Crossed payment limit by {al.daysOverdue} day
                      {al.daysOverdue === 1 ? "" : "s"} (Expired{" "}
                      {formatAccurateDate(al.subscriptionExpiresAt)})
                    </p>
                  </div>

                  {targetHospital ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <BubblyButton
                        className="px-3 py-1.5 text-xs"
                        onClick={() => openExtendModal(targetHospital)}
                      >
                        <CalendarClock className="h-3.5 w-3.5" />
                        Extend
                      </BubblyButton>
                      <BubblyButton
                        variant={targetHospital.isActive ? "danger" : "outline"}
                        className="px-3 py-1.5 text-xs"
                        onClick={() => {
                          setStatusTarget(targetHospital);
                          setStatusReason("");
                        }}
                      >
                        <Power className="h-3.5 w-3.5" />
                        {targetHospital.isActive ? "Deactivate" : "Reactivate"}
                      </BubblyButton>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </SpringCard>
      ) : null}

      {/* Search & Filter Controls */}
      <SpringCard className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6c877a]" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search hospital by name, code, phone, or email..."
            className="w-full rounded-xl border border-[#cfe2d6] bg-white pl-10 pr-4 py-2.5 text-sm text-[#0f241d] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {[
            { id: "ALL" as const, label: `All (${summary.totalHospitals})` },
            { id: "OVERDUE" as const, label: `Limit Crossed (${summary.overdueCount})` },
            { id: "ACTIVE" as const, label: `Active Paid (${summary.activePaidCount})` },
            { id: "UNSET" as const, label: `Not Set (${summary.unsetCount})` },
            { id: "DEACTIVATED" as const, label: `Deactivated (${summary.deactivatedCount})` },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilterMode(f.id)}
              className={`rounded-xl px-3 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                filterMode === f.id
                  ? f.id === "OVERDUE"
                    ? "bg-rose-600 text-white"
                    : "bg-[#0d4a38] text-white"
                  : "border border-[#d7e7dd] bg-white text-[#466356] hover:bg-emerald-50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </SpringCard>

      {/* Hospital Payment Ledger Cards */}
      {filteredHospitals.length === 0 ? (
        <EmptyState
          icon={<CreditCard className="h-6 w-6" />}
          title="No hospitals match this filter"
          description="Try clearing your search query or switching to All hospitals."
        />
      ) : (
        <div className="space-y-4">
          {filteredHospitals.map((h) => {
            const ps = h.paymentState;
            const historyExpanded = Boolean(expandedHistoryIds[h.id]);

            return (
              <SpringCard
                key={h.id}
                className={`p-5 space-y-4 ${
                  ps.isOverdue
                    ? "border-rose-300 bg-gradient-to-r from-rose-50/35 via-white to-white"
                    : ""
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-lg font-bold text-[#0f241d]">
                        {h.name}
                      </h3>
                      <span className="font-mono-id rounded-md border border-[#d7e7dd] bg-[#f4faf6] px-2 py-0.5 text-xs font-semibold text-[#0d4a38]">
                        {h.code}
                      </span>
                      <StatusBadge status={h.isActive ? "ACTIVE" : "DEACTIVATED"} />
                      {ps.status === "OVERDUE" ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-rose-300 bg-rose-100 px-2.5 py-0.5 text-[11px] font-bold text-rose-800">
                          <AlertTriangle className="h-3 w-3" />
                          Crossed Payment Limit ({ps.daysOverdue}d overdue)
                        </span>
                      ) : ps.status === "EXPIRING_SOON" ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-900">
                          <CalendarClock className="h-3 w-3" />
                          Expiring in {ps.daysRemaining}d
                        </span>
                      ) : ps.status === "ACTIVE" ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                          <CheckCircle2 className="h-3 w-3" />
                          Active ({ps.daysRemaining}d left)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">
                          No Paid Timeline Set
                        </span>
                      )}
                    </div>

                    <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4 text-xs">
                      <div className="rounded-xl border border-[#e3efe7] bg-[#f8fcfa] px-3 py-2">
                        <p className="text-[11px] text-[#5b796b]">Total Months Paid</p>
                        <p className="mt-0.5 font-display text-sm font-bold text-[#0f241d]">
                          {h.subscriptionMonthsPaid} month
                          {h.subscriptionMonthsPaid === 1 ? "" : "s"}
                        </p>
                      </div>
                      <div className="rounded-xl border border-[#e3efe7] bg-[#f8fcfa] px-3 py-2">
                        <p className="text-[11px] text-[#5b796b]">Paid Valid Until</p>
                        <p
                          className={`mt-0.5 font-display text-sm font-bold ${
                            ps.isOverdue ? "text-rose-700" : "text-[#0f241d]"
                          }`}
                        >
                          {h.subscriptionExpiresAt
                            ? formatAccurateDate(h.subscriptionExpiresAt)
                            : "Not set yet"}
                        </p>
                      </div>
                      <div className="rounded-xl border border-[#e3efe7] bg-[#f8fcfa] px-3 py-2">
                        <p className="text-[11px] text-[#5b796b]">Total Collected</p>
                        <p className="mt-0.5 font-display text-sm font-bold text-[#0d4a38]">
                          {formatInrAmount(h.subscriptionTotalPaid)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-[#e3efe7] bg-[#f8fcfa] px-3 py-2">
                        <p className="text-[11px] text-[#5b796b]">Payment Entries</p>
                        <p className="mt-0.5 font-display text-sm font-bold text-[#0f241d]">
                          {h._count.payments} recorded
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <BubblyButton
                      className="px-3.5 py-2 text-xs"
                      onClick={() => openExtendModal(h)}
                    >
                      <CalendarClock className="h-3.5 w-3.5" />
                      Extend Timeline
                    </BubblyButton>

                    <BubblyButton
                      variant={h.isActive ? "danger" : "secondary"}
                      className="px-3.5 py-2 text-xs"
                      onClick={() => {
                        setStatusTarget(h);
                        setStatusReason("");
                      }}
                    >
                      <Power className="h-3.5 w-3.5" />
                      {h.isActive ? "Deactivate" : "Reactivate"}
                    </BubblyButton>

                    {h.payments.length > 0 ? (
                      <BubblyButton
                        variant="outline"
                        className="px-3 py-2 text-xs"
                        onClick={() =>
                          setExpandedHistoryIds((prev) => ({
                            ...prev,
                            [h.id]: !prev[h.id],
                          }))
                        }
                      >
                        <ReceiptText className="h-3.5 w-3.5" />
                        History ({h._count.payments})
                        {historyExpanded ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                      </BubblyButton>
                    ) : null}
                  </div>
                </div>

                {/* Expandable Payment History */}
                {historyExpanded && h.payments.length > 0 ? (
                  <div className="border-t border-[#e3efe7] pt-3">
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#5b796b]">
                      Recent Payment & Timeline Extensions
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-[#e3efe7] text-[11px] text-[#5b796b]">
                            <th className="py-2 pr-3">Recorded On</th>
                            <th className="py-2 px-3">Extension Added</th>
                            <th className="py-2 px-3">Amount Collected</th>
                            <th className="py-2 px-3">New Valid Until</th>
                            <th className="py-2 px-3">Notes</th>
                            <th className="py-2 pl-3">By</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#eef6f1]">
                          {h.payments.map((p) => (
                            <tr key={p.id}>
                              <td className="py-2 pr-3 whitespace-nowrap text-[#466356]">
                                {formatAccurateDateTime(p.paidAt)}
                              </td>
                              <td className="py-2 px-3 font-semibold text-[#0f241d]">
                                +{p.durationValue}{" "}
                                {p.durationUnit === "YEARS"
                                  ? `Year${p.durationValue === 1 ? "" : "s"} (${p.monthsAdded} mo)`
                                  : `Month${p.durationValue === 1 ? "" : "s"}`}
                              </td>
                              <td className="py-2 px-3 font-bold text-[#0d4a38]">
                                {formatInrAmount(p.amountCollected)}
                              </td>
                              <td className="py-2 px-3 whitespace-nowrap">
                                {formatAccurateDate(p.newExpiresAt)}
                              </td>
                              <td className="py-2 px-3 text-[#466356]">
                                {p.notes || "—"}
                              </td>
                              <td className="py-2 pl-3 font-mono-id text-[#5b796b]">
                                @{p.recordedByUsername}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </SpringCard>
            );
          })}
        </div>
      )}

      {/* Two-Step Extend Timeline & Collect Amount Modal */}
      <AnimatedModal
        open={Boolean(extendTarget)}
        onClose={() => setExtendTarget(null)}
        title={`Extend Payment Timeline · ${extendTarget?.name ?? ""}`}
        subtitle={
          extendStep === 1
            ? "Step 1 of 2: Enter the number of months or years to extend, then press Enter."
            : "Step 2 of 2: Enter the amount collected to add to the platform total gross amount."
        }
        maxWidth="max-w-lg"
      >
        {extendTarget ? (
          extendStep === 1 ? (
            <form onSubmit={handleStep1Continue} className="space-y-4">
              <div className="rounded-xl border border-[#dcece2] bg-[#f7fbf8] p-3.5 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-[#5b796b]">Current Valid Until:</span>
                  <span
                    className={`font-semibold ${
                      extendTarget.paymentState.isOverdue
                        ? "text-rose-700"
                        : "text-[#0f241d]"
                    }`}
                  >
                    {extendTarget.subscriptionExpiresAt
                      ? formatAccurateDate(extendTarget.subscriptionExpiresAt)
                      : "Not configured yet"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#5b796b]">Total Collected So Far:</span>
                  <span className="font-bold text-[#0d4a38]">
                    {formatInrAmount(extendTarget.subscriptionTotalPaid)}
                  </span>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#314c40]">
                  Extension Unit
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(["MONTHS", "YEARS"] as const).map((unit) => (
                    <button
                      key={unit}
                      type="button"
                      onClick={() => setDurationUnit(unit)}
                      className={`rounded-xl border px-4 py-2.5 text-xs font-bold transition-all cursor-pointer ${
                        durationUnit === unit
                          ? "border-emerald-500 bg-[#dff4e8] text-[#0d4a38]"
                          : "border-[#cfe2d6] bg-white text-[#466356] hover:bg-emerald-50/50"
                      }`}
                    >
                      {unit === "MONTHS" ? "Extend by Months" : "Extend by Years"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[#314c40]">
                  Number of {durationUnit === "YEARS" ? "Years" : "Months"} *
                </label>
                <input
                  ref={durationInputRef}
                  type="number"
                  required
                  min={1}
                  max={durationUnit === "YEARS" ? 10 : 120}
                  step={1}
                  value={durationValue}
                  onChange={(e) => setDurationValue(e.target.value)}
                  placeholder={durationUnit === "YEARS" ? "e.g. 1" : "e.g. 6"}
                  className="w-full rounded-xl border border-[#cfe2d6] bg-white px-4 py-2.5 text-sm font-semibold text-[#0f241d] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(durationUnit === "YEARS" ? [1, 2, 3] : [1, 3, 6, 12]).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setDurationValue(String(preset))}
                      className="rounded-lg border border-[#d7e7dd] bg-[#f7fbf8] px-2.5 py-1 text-[11px] font-semibold text-[#0d4a38] hover:bg-emerald-50 cursor-pointer"
                    >
                      +{preset} {durationUnit === "YEARS" ? (preset === 1 ? "Year" : "Years") : (preset === 1 ? "Month" : "Months")}
                    </button>
                  ))}
                </div>
              </div>

              {previewNewExpiry ? (
                <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/75 px-3.5 py-2.5 text-xs">
                  <span className="flex items-center gap-1.5 font-medium text-[#0d4a38]">
                    <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                    New Paid Valid Until (+{monthsToAdd} mo):
                  </span>
                  <span className="font-display font-bold text-[#0d4a38]">
                    {formatAccurateDate(previewNewExpiry)}
                  </span>
                </div>
              ) : null}

              <div className="flex justify-end gap-2.5 pt-2">
                <BubblyButton
                  variant="outline"
                  onClick={() => setExtendTarget(null)}
                >
                  Cancel
                </BubblyButton>
                <BubblyButton type="submit">
                  Enter Amount Collected
                  <ArrowRight className="h-4 w-4" />
                </BubblyButton>
              </div>
            </form>
          ) : (
            <form onSubmit={handleConfirmExtend} className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/80 px-3.5 py-3 text-xs">
                <div>
                  <p className="font-bold text-[#0d4a38]">
                    Extending by +{parsedDurationNum}{" "}
                    {durationUnit === "YEARS"
                      ? `Year${parsedDurationNum === 1 ? "" : "s"} (${monthsToAdd} months)`
                      : `Month${parsedDurationNum === 1 ? "" : "s"}`}
                  </p>
                  {previewNewExpiry ? (
                    <p className="mt-0.5 text-[#314c40]">
                      New valid until:{" "}
                      <strong>{formatAccurateDate(previewNewExpiry)}</strong>
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setExtendStep(1)}
                  className="text-xs font-semibold text-emerald-800 underline cursor-pointer"
                >
                  Change
                </button>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[#314c40]">
                  Amount Collected (₹) *
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-[#466356]">
                    ₹
                  </span>
                  <input
                    ref={amountInputRef}
                    type="number"
                    required
                    min={0}
                    step="0.01"
                    value={amountCollected}
                    onChange={(e) => setAmountCollected(e.target.value)}
                    placeholder="Enter amount collected from hospital"
                    className="w-full rounded-xl border border-[#cfe2d6] bg-white pl-8 pr-4 py-2.5 text-sm font-bold text-[#0f241d] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
                <p className="mt-1 text-[11px] text-[#5b796b]">
                  This collected amount is automatically added to the hospital total and the Super Admin Platform Overview Total Gross Amount.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[#314c40]">
                  Payment Reference / Notes (Optional)
                </label>
                <input
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="e.g. UPI Ref #12345 / Bank Transfer / Annual Plan"
                  className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2.5 text-sm"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <BubblyButton
                  variant="outline"
                  onClick={() => setExtendStep(1)}
                >
                  Back
                </BubblyButton>
                <BubblyButton type="submit" disabled={submittingExtend}>
                  <CheckCircle2 className="h-4 w-4" />
                  {submittingExtend
                    ? "Recording Payment..."
                    : "Confirm & Add Payment"}
                </BubblyButton>
              </div>
            </form>
          )
        ) : null}
      </AnimatedModal>

      {/* Manual Deactivate / Reactivate Modal right inside Payments */}
      <AnimatedModal
        open={Boolean(statusTarget)}
        onClose={() => setStatusTarget(null)}
        title={
          statusTarget?.isActive
            ? `Deactivate ${statusTarget.name}?`
            : `Reactivate ${statusTarget?.name ?? ""}?`
        }
        subtitle={
          statusTarget?.isActive
            ? "Overdue hospitals are never auto-blocked. Confirm below only if you want to manually deactivate this hospital account now."
            : "Restore login and clinical operations access for this hospital."
        }
      >
        <form onSubmit={handleToggleHospitalStatus} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-[#314c40]">
              Reason (Optional — Logged to Audit Trail)
            </label>
            <input
              value={statusReason}
              onChange={(e) => setStatusReason(e.target.value)}
              placeholder={
                statusTarget?.isActive
                  ? "e.g. Subscription overdue — manual deactivation"
                  : "e.g. Payment renewed — account reactivated"
              }
              className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2.5 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2.5 pt-2">
            <BubblyButton
              variant="outline"
              onClick={() => setStatusTarget(null)}
            >
              Cancel
            </BubblyButton>
            <BubblyButton
              type="submit"
              variant={statusTarget?.isActive ? "danger" : "primary"}
              disabled={busyStatus}
            >
              <Power className="h-4 w-4" />
              {busyStatus
                ? "Updating..."
                : statusTarget?.isActive
                  ? "Confirm Deactivate"
                  : "Confirm Reactivate"}
            </BubblyButton>
          </div>
        </form>
      </AnimatedModal>
    </div>
  );
}
