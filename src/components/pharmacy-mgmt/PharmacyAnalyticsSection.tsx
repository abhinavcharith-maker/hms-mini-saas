"use client";

import React, { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Boxes,
  Calendar,
  Clock,
  CreditCard,
  IndianRupee,
  PackageCheck,
  PackagePlus,
  Pill,
  ShoppingBag,
  XCircle,
} from "lucide-react";
import {
  EmptyState,
  SkeletonBox,
  SpringCard,
  StatCard,
} from "@/components/ui/MotionPrimitives";
import { getLocalDateInputValue } from "@/lib/datetime";
import type { PharmacyAnalyticsResponse } from "./types";

function getLocalDaysAgoDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return getLocalDateInputValue(d);
}

type TimeframePreset = "1d" | "7d" | "30d" | "1y" | "all" | "custom";

export function PharmacyAnalyticsSection({
  refreshKey,
}: {
  refreshKey: number;
}) {
  const [preset, setPreset] = useState<TimeframePreset>("30d");
  const [fromDate, setFromDate] = useState(() => getLocalDaysAgoDate(29));
  const [toDate, setToDate] = useState(() => getLocalDateInputValue());
  const [data, setData] = useState<PharmacyAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const applyPreset = (next: TimeframePreset) => {
    setPreset(next);
    const today = getLocalDateInputValue();
    if (next === "1d") {
      setFromDate(today);
      setToDate(today);
    } else if (next === "7d") {
      setFromDate(getLocalDaysAgoDate(6));
      setToDate(today);
    } else if (next === "30d") {
      setFromDate(getLocalDaysAgoDate(29));
      setToDate(today);
    } else if (next === "1y") {
      setFromDate(getLocalDaysAgoDate(364));
      setToDate(today);
    } else if (next === "all") {
      setFromDate("");
      setToDate("");
    }
  };

  const loadAnalytics = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (preset !== "all") {
        if (fromDate) qs.set("from", fromDate);
        if (toDate) qs.set("to", toDate);
      }
      qs.set("tzOffset", String(new Date().getTimezoneOffset()));
      const res = await fetch(`/api/pharmacy-mgmt/analytics?${qs.toString()}`);
      if (res.ok) {
        setData(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, [preset, fromDate, toDate]);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics, refreshKey]);

  const maxTopValue = Math.max(
    1,
    ...(data?.topMedicines.map((m) => m.grossValue) ?? [1])
  );

  return (
    <div className="space-y-6">
      {/* Timeframe Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 rounded-2xl border border-[#cfe2d6] bg-white p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#314c40] mr-1">
            <Calendar className="h-4 w-4 text-emerald-600" />
            Timeframe:
          </span>
          {(
            [
              { id: "1d", label: "1 Day" },
              { id: "7d", label: "7 Days" },
              { id: "30d", label: "30 Days" },
              { id: "1y", label: "1 Year" },
              { id: "all", label: "All Time" },
              { id: "custom", label: "Custom" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => applyPreset(item.id)}
              className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                preset === item.id
                  ? "border-emerald-500 bg-[#dff4e8] text-[#0d4a38]"
                  : "border-[#dcece2] bg-white text-[#466356] hover:bg-[#f6fbf8]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <input
            type="date"
            value={fromDate}
            onChange={(e) => {
              setPreset("custom");
              setFromDate(e.target.value);
            }}
            className="rounded-xl border border-[#cfe2d6] bg-white px-3 py-1.5 text-xs text-[#0f241d]"
          />
          <span className="text-[#5b796b]">to</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => {
              setPreset("custom");
              setToDate(e.target.value);
            }}
            className="rounded-xl border border-[#cfe2d6] bg-white px-3 py-1.5 text-xs text-[#0f241d]"
          />
        </div>
      </div>

      {loading || !data ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <SkeletonBox key={i} className="h-32" />
            ))}
          </div>
          <SkeletonBox className="h-64" />
        </div>
      ) : (
        <>
          {/* Primary KPI Cards (Strictly Zero Profit Metrics) */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Total Gross Value Sold"
              value={`₹${data.kpis.totalGrossValueSold.toLocaleString("en-IN", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}`}
              subtitle={`Across ${data.kpis.totalTransactions} invoice(s) · GST % noted on bill`}
              icon={<IndianRupee className="h-5 w-5" />}
              tone="forest"
              delay={0}
            />
            <StatCard
              title="Total Medicines Sold"
              value={data.kpis.totalMedicinesSoldUnits}
              subtitle={`Units across ${data.kpis.totalTransactions} transaction(s)`}
              icon={<ShoppingBag className="h-5 w-5" />}
              tone="emerald"
              delay={0.05}
            />
            <StatCard
              title="Total Medicines Bought"
              value={data.kpis.totalMedicinesBoughtUnits}
              subtitle={`Units stocked across ${data.kpis.stockInEntriesCount} stock entry(s)`}
              icon={<PackagePlus className="h-5 w-5" />}
              tone="teal"
              delay={0.1}
            />
            <StatCard
              title="Live Stock On Hand"
              value={data.inventory.totalUnitsInStock}
              subtitle={`${data.inventory.totalProfiles} medicine(s) · ${data.inventory.totalBatches} batch(es)`}
              icon={<Boxes className="h-5 w-5" />}
              tone="amber"
              delay={0.15}
            />
          </div>

          {/* Inventory Health Strip */}
          <SpringCard className="p-5">
            <h3 className="font-display text-sm font-extrabold uppercase tracking-wider text-[#0d4a38] mb-3">
              Inventory Health Snapshot
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-2xl border border-[#dcece2] bg-[#f8fcfa] p-3.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#466356]">
                  <PackageCheck className="h-4 w-4 text-emerald-700" />
                  Stock Gross Value
                </div>
                <p className="mt-1.5 font-mono-id text-lg font-extrabold text-[#0f241d]">
                  ₹{data.inventory.totalStockGrossValue.toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-800">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  Low Stock
                </div>
                <p className="mt-1.5 font-mono-id text-lg font-extrabold text-amber-900">
                  {data.inventory.lowStockCount}
                </p>
              </div>
              <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-3.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-rose-800">
                  <XCircle className="h-4 w-4 text-rose-600" />
                  Out of Stock
                </div>
                <p className="mt-1.5 font-mono-id text-lg font-extrabold text-rose-900">
                  {data.inventory.outOfStockCount}
                </p>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-3.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-800">
                  <Clock className="h-4 w-4 text-amber-600" />
                  Expiring Soon (3-Mo)
                </div>
                <p className="mt-1.5 font-mono-id text-lg font-extrabold text-amber-900">
                  {data.inventory.expiringSoonBatches} batch(es)
                </p>
                {data.inventory.expiringBreakdown ? (
                  <p className="mt-1 text-[10px] font-semibold text-amber-800">
                    M1: {data.inventory.expiringBreakdown.month1Batches} · M2:{" "}
                    {data.inventory.expiringBreakdown.month2Batches} · M3:{" "}
                    {data.inventory.expiringBreakdown.month3Batches}
                  </p>
                ) : null}
              </div>
              <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-3.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-rose-800">
                  <AlertTriangle className="h-4 w-4 text-rose-600" />
                  Expired Stock
                </div>
                <p className="mt-1.5 font-mono-id text-lg font-extrabold text-rose-900">
                  {data.inventory.expiredBatches} batch(es)
                </p>
              </div>
            </div>
          </SpringCard>

          {/* Top Selling Medicines & Payment Mode Breakdown */}
          <div className="grid gap-6 lg:grid-cols-3">
            <SpringCard className="p-6 lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-base font-extrabold text-[#0f241d] flex items-center gap-2">
                  <Pill className="h-4 w-4 text-emerald-700" />
                  Top Dispensed Medicines
                </h3>
                <span className="text-xs text-[#5b796b]">By Gross Sales Value</span>
              </div>

              {data.topMedicines.length === 0 ? (
                <EmptyState
                  icon={<Pill className="h-5 w-5" />}
                  title="No Sales In Selected Period"
                  description="Completed sales transactions will automatically appear here."
                />
              ) : (
                <div className="space-y-3">
                  {data.topMedicines.map((med, idx) => {
                    const pct = Math.max(4, Math.round((med.grossValue / maxTopValue) * 100));
                    return (
                      <div key={med.medicineName} className="space-y-1">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-semibold text-[#0f241d] truncate">
                            {idx + 1}. {med.medicineName}
                          </span>
                          <span className="shrink-0 font-mono-id text-[#0d4a38] font-bold">
                            {med.unitsSold} units · ₹{med.grossValue.toFixed(2)}
                          </span>
                        </div>
                        <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#ebf5ef]">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{
                              duration: 0.55,
                              delay: idx * 0.04,
                              ease: [0.22, 1, 0.36, 1],
                            }}
                            className="h-full rounded-full bg-gradient-to-r from-[#0d4a38] via-[#059669] to-[#34d399]"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </SpringCard>

            <SpringCard className="p-6 space-y-4">
              <h3 className="font-display text-base font-extrabold text-[#0f241d] flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-emerald-700" />
                Payment Mode Summary
              </h3>

              {data.paymentBreakdown.length === 0 ? (
                <p className="text-xs text-[#5b796b]">No transactions recorded yet.</p>
              ) : (
                <div className="space-y-2.5">
                  {data.paymentBreakdown.map((pm) => (
                    <div
                      key={pm.mode}
                      className="flex items-center justify-between rounded-2xl border border-[#dcece2] bg-[#f8fcfa] px-4 py-3"
                    >
                      <div>
                        <p className="font-display text-sm font-bold text-[#0f241d]">
                          {pm.mode}
                        </p>
                        <p className="text-[11px] text-[#5b796b]">
                          {pm.count} sale(s)
                        </p>
                      </div>
                      <span className="font-mono-id text-sm font-extrabold text-[#0d4a38]">
                        ₹{pm.grossValue.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </SpringCard>
          </div>

          {/* Daily Sales & Stock Movement Table */}
          <SpringCard className="p-6 space-y-4">
            <h3 className="font-display text-base font-extrabold text-[#0f241d]">
              Daily Sales & Stock Movement
            </h3>

            {data.dailySeries.length === 0 ? (
              <p className="text-xs text-[#5b796b]">
                No daily sales or stock activity in the chosen timeframe.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#dcece2] text-[11px] uppercase tracking-wider text-[#5b796b]">
                      <th className="py-2.5 pr-3">Date</th>
                      <th className="py-2.5 px-3 text-right">Transactions</th>
                      <th className="py-2.5 px-3 text-right">Medicines Sold (Units)</th>
                      <th className="py-2.5 px-3 text-right">Medicines Bought (Units)</th>
                      <th className="py-2.5 pl-3 text-right">Gross Value Sold</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#eaf4ee]">
                    {data.dailySeries.map((day) => (
                      <tr key={day.date} className="hover:bg-[#f7fbf8]">
                        <td className="py-2.5 pr-3 font-mono-id font-semibold text-[#0f241d]">
                          {day.date}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono-id">
                          {day.transactions}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono-id font-semibold text-emerald-700">
                          {day.unitsSold}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono-id font-semibold text-teal-700">
                          {day.unitsBought}
                        </td>
                        <td className="py-2.5 pl-3 text-right font-mono-id font-bold text-[#0d4a38]">
                          ₹{day.grossValue.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SpringCard>
        </>
      )}
    </div>
  );
}
