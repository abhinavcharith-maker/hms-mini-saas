"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock,
  Eye,
  Pill,
  Search,
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
import { DEFAULT_PAGE_SIZE, PaginationBar } from "@/components/ui/PaginationBar";
import { useToast } from "@/components/providers/AppProviders";
import { formatAccurateDateTime } from "@/lib/datetime";

interface PharmacyReferral {
  id: string;
  referralNumber: string;
  patientNameSnapshot: string;
  patientUhidSnapshot: string;
  patientPhoneSnapshot: string | null;
  notes: string | null;
  totalAmount: number | null;
  status: "PENDING" | "COMPLETED" | "CANCELLED";
  referredAt: string;
  completedAt: string | null;
  completedByNameSnapshot: string | null;
  items: Array<{
    id: string;
    medicineNameSnapshot: string;
    descriptionSnapshot: string | null;
    quantity: number;
    unitPriceSnapshot: number | null;
    lineTotal: number | null;
    dosageInstructions: string | null;
  }>;
}

export function PharmacyReferralsPortalView() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState({ total: 0, pending: 0, completed: 0 });
  const [referrals, setReferrals] = useState<PharmacyReferral[]>([]);
  const [hospitalName, setHospitalName] = useState("");
  const [pharmacyName, setPharmacyName] = useState("");
  const [statusFilter, setStatusFilter] = useState<"PENDING" | "COMPLETED">("PENDING");
  const [completedFrom, setCompletedFrom] = useState("");
  const [completedTo, setCompletedTo] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const [selected, setSelected] = useState<PharmacyReferral | null>(null);
  const [enteredAmount, setEnteredAmount] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      qs.set("status", statusFilter);
      if (q) qs.set("q", q);
      if (statusFilter === "COMPLETED") {
        if (completedFrom) qs.set("from", completedFrom);
        if (completedTo) qs.set("to", completedTo);
        qs.set("tzOffset", String(new Date().getTimezoneOffset()));
      }
      const res = await fetch(`/api/pharmacy/referrals?${qs.toString()}`);
      if (res.ok) {
        const d = await res.json();
        setKpis(d.kpis);
        setReferrals(d.referrals ?? []);
        setHospitalName(d.hospitalName ?? "");
        setPharmacyName(d.pharmacyAccount?.pharmacyName ?? "");
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter, q, completedFrom, completedTo]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleMarkCompleted = async () => {
    if (!selected) return;
    if (enteredAmount.trim() === "" || Number.isNaN(Number(enteredAmount)) || Number(enteredAmount) < 0) {
      toast({
        type: "warning",
        title: "Enter Amount",
        message: "Please enter a valid transaction amount before completing.",
      });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/pharmacy/referrals/${selected.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ totalAmount: Number(enteredAmount) }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast({ type: "error", title: "Action Failed", message: d.error });
        return;
      }
      toast({
        type: "success",
        title: "Referral Marked Completed",
        message: `${selected.referralNumber} fulfillment recorded and synced with hospital.`,
      });
      setConfirmOpen(false);
      setSelected(d.referral);
      load();
    } finally {
      setSubmitting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(referrals.length / DEFAULT_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedReferrals = referrals.slice(
    (safePage - 1) * DEFAULT_PAGE_SIZE,
    safePage * DEFAULT_PAGE_SIZE
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-[#0f241d]">
          {pharmacyName || "Pharmacy Referrals"}
        </h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          title="Total Referrals Received"
          value={kpis.total}
          icon={<Pill className="h-5 w-5" />}
          tone="forest"
        />
        <StatCard
          title="Pending Fulfilment"
          value={kpis.pending}
          icon={<Clock className="h-5 w-5" />}
          tone="amber"
        />
        <StatCard
          title="Completed Referrals"
          value={kpis.completed}
          icon={<CheckCircle2 className="h-5 w-5" />}
          tone="emerald"
        />
      </div>

      <SpringCard className="p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { val: "PENDING", label: "Pending" },
                { val: "COMPLETED", label: "Completed" },
              ] as const
            ).map((f) => (
              <button
                key={f.label}
                type="button"
                onClick={() => {
                  setStatusFilter(f.val);
                  setPage(1);
                }}
                className={`rounded-xl border px-3.5 py-2 text-xs font-semibold cursor-pointer ${
                  statusFilter === f.val
                    ? "border-emerald-500 bg-[#dff4e8] text-[#0d4a38]"
                    : "border-[#cfe2d6] bg-white text-[#466356]"
                }`}
              >
                {f.label}
              </button>
            ))}

            {statusFilter === "COMPLETED" ? (
              <div className="flex flex-wrap items-center gap-2 sm:ml-2">
                <label className="text-[11px] font-semibold text-[#466356]">
                  From Date
                  <input
                    type="date"
                    value={completedFrom}
                    onChange={(e) => {
                      setCompletedFrom(e.target.value);
                      setPage(1);
                    }}
                    className="ml-1.5 rounded-xl border border-[#cfe2d6] bg-white px-2.5 py-1.5 text-xs font-normal text-[#0f241d]"
                  />
                </label>
                <label className="text-[11px] font-semibold text-[#466356]">
                  To Date
                  <input
                    type="date"
                    value={completedTo}
                    onChange={(e) => {
                      setCompletedTo(e.target.value);
                      setPage(1);
                    }}
                    className="ml-1.5 rounded-xl border border-[#cfe2d6] bg-white px-2.5 py-1.5 text-xs font-normal text-[#0f241d]"
                  />
                </label>
                {(completedFrom || completedTo) ? (
                  <button
                    type="button"
                    onClick={() => {
                      setCompletedFrom("");
                      setCompletedTo("");
                      setPage(1);
                    }}
                    className="rounded-xl border border-[#cfe2d6] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#466356] hover:bg-emerald-50 cursor-pointer"
                  >
                    Clear Dates
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6c877a]" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Search referral ID or patient..."
              className="w-64 rounded-xl border border-[#cfe2d6] bg-white py-2 pl-9 pr-3 text-xs"
            />
          </div>
        </div>

        {loading ? (
          <SkeletonBox className="h-56" />
        ) : referrals.length === 0 ? (
          <EmptyState
            icon={<Pill className="h-5 w-5" />}
            title={
              statusFilter === "PENDING"
                ? "No Pending Referrals"
                : "No Completed Referrals"
            }
            description={
              statusFilter === "PENDING"
                ? "New medicine referrals routed by the hospital will appear here with the latest at the top."
                : "No completed referrals matched the selected timeframe."
            }
          />
        ) : (
          <div className="space-y-3">
            {paginatedReferrals.map((r) => (
              <div
                key={r.id}
                className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-2xl border border-[#dcece2] bg-white p-4 hover:border-emerald-300 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono-id rounded bg-[#eef7f1] px-2.5 py-0.5 text-xs font-bold text-[#0d4a38]">
                      {r.referralNumber}
                    </span>
                    <StatusBadge status={r.status} />
                    <span className="text-xs text-[#5b796b]">
                      Referred {formatAccurateDateTime(r.referredAt)}
                    </span>
                    {r.status === "COMPLETED" && r.completedAt ? (
                      <span className="text-xs font-medium text-emerald-700">
                        · Completed {formatAccurateDateTime(r.completedAt)}
                      </span>
                    ) : null}
                  </div>
                  <p className="font-display text-sm font-bold text-[#0f241d]">
                    {r.patientNameSnapshot} ·{" "}
                    <span className="font-mono-id text-xs font-medium text-[#466356]">
                      {r.patientUhidSnapshot}
                    </span>
                    {r.patientPhoneSnapshot ? ` · ${r.patientPhoneSnapshot}` : ""}
                  </p>
                  <p className="text-xs text-[#314c40]">
                    {r.items
                      .map((i) => `${i.medicineNameSnapshot} × ${i.quantity}`)
                      .join(", ")}
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {r.status === "COMPLETED" && r.totalAmount !== null ? (
                    <span className="font-mono-id text-sm font-bold text-[#0d4a38]">
                      ₹{r.totalAmount.toFixed(2)}
                    </span>
                  ) : null}
                  <BubblyButton
                    variant={r.status === "PENDING" ? "primary" : "outline"}
                    className="px-3.5 py-2 text-xs"
                    onClick={() => {
                      setSelected(r);
                      setEnteredAmount(
                        r.totalAmount !== null && r.totalAmount !== undefined
                          ? String(r.totalAmount)
                          : ""
                      );
                      setConfirmOpen(false);
                    }}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    {r.status === "PENDING" ? "Inspect & Fulfill" : "View Details"}
                  </BubblyButton>
                </div>
              </div>
            ))}

            <PaginationBar
              totalItems={referrals.length}
              pageSize={DEFAULT_PAGE_SIZE}
              currentPage={safePage}
              onPageChange={setPage}
              itemLabel="pharmacy referral(s)"
            />
          </div>
        )}
      </SpringCard>

      {/* Referral Detail & MARK AS COMPLETED Modal */}
      <AnimatedModal
        open={Boolean(selected)}
        onClose={() => {
          setSelected(null);
          setConfirmOpen(false);
        }}
        title={`Referral Details · ${selected?.referralNumber ?? ""}`}
        subtitle={
          selected
            ? `${selected.patientNameSnapshot} (${selected.patientUhidSnapshot})`
            : undefined
        }
      >
        {selected ? (
          <div className="space-y-4 text-xs">
            <div className="flex items-center justify-between rounded-xl border border-[#dcece2] bg-[#f8fcfa] p-3">
              <div>
                <p className="text-[#5b796b]">Patient Contact</p>
                <p className="font-semibold text-[#0f241d]">
                  {selected.patientPhoneSnapshot ?? "Not provided"}
                </p>
              </div>
              <StatusBadge status={selected.status} />
            </div>

            <div className="space-y-2">
              <p className="font-bold uppercase tracking-wider text-[11px] text-[#5b796b]">
                Referred Medicines
              </p>
              {selected.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start justify-between rounded-xl border border-[#e3efe7] bg-white p-3"
                >
                  <div>
                    <p className="font-semibold text-[#0f241d]">
                      {item.medicineNameSnapshot} × {item.quantity}
                    </p>
                    {item.dosageInstructions ? (
                      <p className="mt-0.5 text-[#466356]">
                        Instructions: {item.dosageInstructions}
                      </p>
                    ) : null}
                  </div>
                  <span className="font-mono-id font-semibold">
                    {item.lineTotal !== null ? `₹${item.lineTotal.toFixed(2)}` : "—"}
                  </span>
                </div>
              ))}
            </div>

            {selected.notes ? (
              <div className="rounded-xl border border-[#e3efe7] bg-[#f8fcfa] p-3">
                <p className="font-semibold text-[#0f241d]">Hospital Notes</p>
                <p className="mt-0.5 text-[#466356]">{selected.notes}</p>
              </div>
            ) : null}

            {selected.status === "PENDING" ? (
              <>
                <div className="rounded-xl border border-[#cfe2d6] bg-[#eef7f1] p-3.5 space-y-1.5">
                  <label className="block text-xs font-bold text-[#0d4a38]">
                    Enter Amount (₹) *
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    required
                    value={enteredAmount}
                    onChange={(e) => setEnteredAmount(e.target.value)}
                    placeholder="Enter pharmacy bill amount"
                    className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2 text-sm font-mono-id font-semibold text-[#0f241d]"
                  />
                </div>

                {!confirmOpen ? (
                  <BubblyButton
                    onClick={() => {
                      if (
                        enteredAmount.trim() === "" ||
                        Number.isNaN(Number(enteredAmount)) ||
                        Number(enteredAmount) < 0
                      ) {
                        toast({
                          type: "warning",
                          title: "Enter Amount",
                          message: "Please enter the transaction amount before completing.",
                        });
                        return;
                      }
                      setConfirmOpen(true);
                    }}
                    className="w-full py-3"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    MARK AS COMPLETED
                  </BubblyButton>
                ) : (
                  <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 space-y-3">
                    <p className="font-bold text-emerald-950">
                      Confirm Referral Completion (₹{Number(enteredAmount).toFixed(2)})?
                    </p>
                    <p className="text-emerald-900">
                      This records the entered amount and completion timestamp with{" "}
                      {hospitalName}. Completed referrals cannot be reverted.
                    </p>
                    <div className="flex justify-end gap-2">
                      <BubblyButton
                        variant="outline"
                        onClick={() => setConfirmOpen(false)}
                      >
                        Back
                      </BubblyButton>
                      <BubblyButton
                        disabled={submitting}
                        onClick={handleMarkCompleted}
                      >
                        {submitting ? "Completing..." : "Confirm Completion"}
                      </BubblyButton>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex justify-between rounded-xl bg-[#eef7f1] p-3 font-bold text-[#0d4a38]">
                  <span>Entered Amount</span>
                  <span>
                    {selected.totalAmount !== null
                      ? `₹${selected.totalAmount.toFixed(2)}`
                      : "—"}
                  </span>
                </div>
                <p className="text-center text-[#5b796b]">
                  {selected.completedAt
                    ? `Completed on ${formatAccurateDateTime(selected.completedAt)} by ${selected.completedByNameSnapshot ?? "Pharmacy"}`
                    : `Status: ${selected.status}`}
                </p>
              </>
            )}
          </div>
        ) : null}
      </AnimatedModal>
    </div>
  );
}
