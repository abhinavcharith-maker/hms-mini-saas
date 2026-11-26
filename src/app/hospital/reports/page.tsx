"use client";

import React, { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart3,
  BedDouble,
  Download,
  FlaskConical,
  IndianRupee,
  Info,
  Pill,
  Stethoscope,
} from "lucide-react";
import {
  BubblyButton,
  SkeletonBox,
  SpringCard,
  StatCard,
} from "@/components/ui/MotionPrimitives";
import { getLocalDateInputValue } from "@/lib/datetime";

interface ReportData {
  range: { from: string; to: string };
  pharmacyMode?: "REFERRALS" | "MANAGEMENT";
  opRegistrationsCount: number;
  ipAdmissionsCount: number;
  pharmacySalesCount?: number;
  activeAdmissionsCount: number;
  dischargedCount: number;
  bedOccupancy: {
    totalBeds: number;
    availableBeds: number;
    occupiedBeds: number;
    inactiveBeds: number;
    occupancyRate: number;
  };
  pharmacy: {
    total: number;
    pending: number;
    completed: number;
    cancelled: number;
    byPartner: Array<{
      name: string;
      total: number;
      pending: number;
      completed: number;
      cancelled: number;
      optionalEnteredAmountTotal: number | null;
      pricedReferralCount: number;
    }>;
  };
  laboratory: {
    total: number;
    pending: number;
    completed: number;
    cancelled: number;
    byPartner: Array<{
      name: string;
      total: number;
      pending: number;
      completed: number;
      cancelled: number;
      optionalEnteredAmountTotal: number | null;
      pricedReferralCount: number;
    }>;
  };
  opByDate: Array<{ date: string; count: number }>;
  opGrossAmount?: number;
  ipGrossAmount?: number;
  pharmacyGrossAmount?: number;
  totalGrossAmount?: number;
  paymentBreakdown?: {
    CASH: { op: number; ip: number; pharmacy?: number; total: number };
    UPI: { op: number; ip: number; pharmacy?: number; total: number };
    CARD: { op: number; ip: number; pharmacy?: number; total: number };
  };
  accountingDisclaimer: string;
}

export default function HospitalReportsPage() {
  const [from, setFrom] = useState(() =>
    getLocalDateInputValue(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000))
  );
  const [to, setTo] = useState(() => getLocalDateInputValue());
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    try {
      const tzOffset = new Date().getTimezoneOffset();
      const res = await fetch(
        `/api/hospital/reports?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&tzOffset=${tzOffset}`
      );
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      if (res.ok) {
        setData(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  if (forbidden) {
    return (
      <SpringCard className="p-8 text-center">
        <p className="font-display text-lg font-bold text-[#0f241d]">
          Hospital Admin Access Required
        </p>
        <p className="mt-1 text-sm text-[#466356]">
          Operational analytics and exports are restricted to Hospital Administrators.
        </p>
      </SpringCard>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-[#0f241d]">
            Hospital Reports & Analytics
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-xl border border-[#cfe2d6] bg-white px-3 py-2 text-xs"
          />
          <span className="text-xs text-[#5b796b]">to</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-xl border border-[#cfe2d6] bg-white px-3 py-2 text-xs"
          />
          <BubblyButton
            type="button"
            onClick={() => {
              const tzOffset = new Date().getTimezoneOffset();
              const link = document.createElement("a");
              link.href = `/api/hospital/reports?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&tzOffset=${tzOffset}&format=csv`;
              link.download = `hospital-report-${from}-to-${to}.csv`;
              document.body.appendChild(link);
              link.click();
              link.remove();
            }}
            className="px-4 py-2 text-xs"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </BubblyButton>
        </div>
      </div>

      {loading ? (
        <SkeletonBox className="h-72" />
      ) : data ? (
        <>
          <div className="rounded-2xl border border-teal-200 bg-teal-50/70 p-4 text-xs text-teal-950 flex items-start gap-2.5">
            <Info className="h-4 w-4 text-teal-700 shrink-0 mt-0.5" />
            <p>{data.accountingDisclaimer}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="OP Registrations"
              value={data.opRegistrationsCount}
              subtitle="Within selected date range"
              icon={<Stethoscope className="h-5 w-5" />}
              tone="forest"
            />
            <StatCard
              title="IP & Bed Occupancy"
              value={`${data.bedOccupancy.occupancyRate}%`}
              subtitle={`${data.bedOccupancy.occupiedBeds} occupied / ${data.bedOccupancy.totalBeds} beds · ${data.ipAdmissionsCount} admissions`}
              icon={<BedDouble className="h-5 w-5" />}
              tone="amber"
            />
            {data.pharmacyMode === "MANAGEMENT" ? (
              <StatCard
                title="Pharmacy Sales"
                value={data.pharmacySalesCount ?? 0}
                subtitle={`₹${(data.pharmacyGrossAmount ?? 0).toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })} collected`}
                icon={<Pill className="h-5 w-5" />}
                tone="emerald"
              />
            ) : (
              <StatCard
                title="Pharmacy Referrals"
                value={data.pharmacy.total}
                subtitle={`${data.pharmacy.completed} completed · ${data.pharmacy.pending} pending`}
                icon={<Pill className="h-5 w-5" />}
                tone="emerald"
              />
            )}
            <StatCard
              title="Lab Referrals"
              value={data.laboratory.total}
              subtitle={`${data.laboratory.completed} completed · ${data.laboratory.pending} pending`}
              icon={<FlaskConical className="h-5 w-5" />}
              tone="teal"
            />
          </div>

          <SpringCard className="p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-[#0d4a38]">
                  <IndianRupee className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#5b796b]">
                    {data.pharmacyMode === "MANAGEMENT"
                      ? "Total Gross Amount (OP + IP + Pharmacy)"
                      : "Total Gross Amount (OP + IP Charges)"}
                  </p>
                  <p className="font-display text-2xl font-extrabold text-[#0d4a38]">
                    ₹{(data.totalGrossAmount ?? 0).toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <div className="rounded-xl border border-[#dcece2] bg-[#f8fcfa] px-3.5 py-2">
                  <span className="text-[#5b796b]">OP Collections: </span>
                  <span className="font-mono-id font-bold text-[#0f241d]">
                    ₹{(data.opGrossAmount ?? 0).toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
                <div className="rounded-xl border border-[#dcece2] bg-[#f8fcfa] px-3.5 py-2">
                  <span className="text-[#5b796b]">IP Admissions Charged: </span>
                  <span className="font-mono-id font-bold text-[#0f241d]">
                    ₹{(data.ipGrossAmount ?? 0).toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
                {data.pharmacyMode === "MANAGEMENT" ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3.5 py-2">
                    <span className="text-emerald-800">Pharmacy Sales: </span>
                    <span className="font-mono-id font-bold text-[#0d4a38]">
                      ₹{(data.pharmacyGrossAmount ?? 0).toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>

            {data.paymentBreakdown ? (
              <div className="mt-4 grid gap-3 border-t border-[#e5f2ea] pt-4 sm:grid-cols-3">
                {(
                  [
                    {
                      key: "CASH",
                      label: "Cash Collected",
                      tone: "border-emerald-200 bg-emerald-50/70 text-[#0d4a38]",
                    },
                    {
                      key: "UPI",
                      label: "UPI Collected",
                      tone: "border-teal-200 bg-teal-50/70 text-teal-900",
                    },
                    {
                      key: "CARD",
                      label: "Card Collected",
                      tone: "border-amber-200 bg-amber-50/70 text-amber-900",
                    },
                  ] as const
                ).map((pm) => {
                  const row = data.paymentBreakdown![pm.key];
                  return (
                    <div
                      key={pm.key}
                      className={`rounded-2xl border p-4 ${pm.tone}`}
                    >
                      <p className="text-[11px] font-bold uppercase tracking-wider opacity-80">
                        {pm.label}
                      </p>
                      <p className="mt-1 font-mono-id text-xl font-extrabold">
                        ₹{row.total.toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </p>
                      <p className="mt-1 text-[11px] opacity-80">
                        OP: ₹{row.op.toLocaleString("en-IN", { minimumFractionDigits: 2 })} · IP: ₹
                        {row.ip.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        {data.pharmacyMode === "MANAGEMENT"
                          ? ` · Pharm: ₹${(row.pharmacy ?? 0).toLocaleString("en-IN", {
                              minimumFractionDigits: 2,
                            })}`
                          : ""}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </SpringCard>

          {/* OP by Date Chart */}
          <SpringCard className="p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-emerald-600" />
                <h2 className="font-display text-base font-bold text-[#0f241d]">
                  OP Registrations by Date
                </h2>
              </div>
              <span className="rounded-full bg-[#eef7f1] px-2.5 py-0.5 text-[11px] font-semibold text-[#0d4a38]">
                Recent 30 days only
              </span>
            </div>
            {data.opByDate.length === 0 ? (
              <p className="text-xs text-[#5b796b]">
                No OP visits in the recent 30 days for the selected range.
              </p>
            ) : (
              <div className="space-y-2.5">
                {data.opByDate.map((row) => {
                  const max = Math.max(1, ...data.opByDate.map((r) => r.count));
                  const pct = Math.max(8, Math.round((row.count / max) * 100));
                  return (
                    <div key={row.date} className="flex items-center gap-3 text-xs">
                      <span className="w-24 font-mono-id text-[#466356]">{row.date}</span>
                      <div className="h-3 flex-1 overflow-hidden rounded-full bg-[#eaf4ee]">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          className="h-full rounded-full bg-emerald-600"
                        />
                      </div>
                      <span className="w-10 text-right font-bold text-[#0d4a38]">
                        {row.count}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </SpringCard>

          <div className="grid gap-6 lg:grid-cols-2">
            <SpringCard className="p-6">
              <h2 className="mb-4 font-display text-base font-bold text-[#0f241d]">
                Pharmacy-Wise Referral Statistics
              </h2>
              {data.pharmacy.byPartner.length === 0 ? (
                <p className="text-xs text-[#5b796b]">No pharmacy referrals in range.</p>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#dcece2] text-[11px] uppercase text-[#5b796b]">
                      <th className="py-2 pr-2">Pharmacy</th>
                      <th className="py-2 px-2">Total</th>
                      <th className="py-2 px-2">Done</th>
                      <th className="py-2 pl-2">Optional Entered Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#eaf4ee]">
                    {data.pharmacy.byPartner.map((p) => (
                      <tr key={p.name}>
                        <td className="py-2.5 pr-2 font-semibold">{p.name}</td>
                        <td className="py-2.5 px-2">{p.total}</td>
                        <td className="py-2.5 px-2 text-emerald-700 font-semibold">
                          {p.completed}
                        </td>
                        <td className="py-2.5 pl-2 font-mono-id">
                          {p.optionalEnteredAmountTotal !== null
                            ? `₹${p.optionalEnteredAmountTotal.toFixed(2)} (${p.pricedReferralCount} refs)`
                            : "Not entered"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </SpringCard>

            <SpringCard delay={0.05} className="p-6">
              <h2 className="mb-4 font-display text-base font-bold text-[#0f241d]">
                Laboratory-Wise Referral Statistics
              </h2>
              {data.laboratory.byPartner.length === 0 ? (
                <p className="text-xs text-[#5b796b]">No lab referrals in range.</p>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#dcece2] text-[11px] uppercase text-[#5b796b]">
                      <th className="py-2 pr-2">Laboratory</th>
                      <th className="py-2 px-2">Total</th>
                      <th className="py-2 px-2">Done</th>
                      <th className="py-2 pl-2">Optional Entered Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#eaf4ee]">
                    {data.laboratory.byPartner.map((l) => (
                      <tr key={l.name}>
                        <td className="py-2.5 pr-2 font-semibold">{l.name}</td>
                        <td className="py-2.5 px-2">{l.total}</td>
                        <td className="py-2.5 px-2 text-teal-700 font-semibold">
                          {l.completed}
                        </td>
                        <td className="py-2.5 pl-2 font-mono-id">
                          {l.optionalEnteredAmountTotal !== null
                            ? `₹${l.optionalEnteredAmountTotal.toFixed(2)} (${l.pricedReferralCount} refs)`
                            : "Not entered"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </SpringCard>
          </div>
        </>
      ) : null}
    </div>
  );
}
