"use client";

import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Bell,
  Clock,
  PackageX,
  Trash2,
  TrendingDown,
  XCircle,
} from "lucide-react";
import { AnimatedModal, BubblyButton } from "@/components/ui/MotionPrimitives";
import { useToast } from "@/components/providers/AppProviders";
import type { PharmacyBatchItem, PharmacyMedicineItem } from "./types";

type BellTab = "low_stock" | "out_of_stock" | "expiring_soon" | "expired";

interface BatchAlertEntry {
  medicine: PharmacyMedicineItem;
  batch: PharmacyBatchItem;
}

export function PharmacyReminderBell({
  medicines,
  onJumpToStockFilter,
  onInventoryMutated,
}: {
  medicines: PharmacyMedicineItem[];
  onJumpToStockFilter: (
    filter: "low_stock" | "out_of_stock" | "expiring_soon" | "expired"
  ) => void;
  onInventoryMutated?: () => Promise<void> | void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<BellTab>("expiring_soon");
  const [deleteBatchTarget, setDeleteBatchTarget] =
    useState<BatchAlertEntry | null>(null);
  const [deletingBatch, setDeletingBatch] = useState(false);

  const handleConfirmDeleteBatch = async () => {
    if (!deleteBatchTarget) return;
    setDeletingBatch(true);
    try {
      const res = await fetch(
        `/api/pharmacy-mgmt/batches/${encodeURIComponent(deleteBatchTarget.batch.id)}`,
        { method: "DELETE" }
      );
      const d = await res.json();
      if (!res.ok) {
        toast({
          type: "error",
          title: "Batch Delete Failed",
          message: d.error || "Unable to delete expired batch.",
        });
        return;
      }
      toast({
        type: "success",
        title: "Expired Batch Deleted",
        message: `Removed batch ${deleteBatchTarget.batch.batchNumber} of ${deleteBatchTarget.medicine.name} (${deleteBatchTarget.batch.quantityUnits} unit(s)).`,
      });
      setDeleteBatchTarget(null);
      if (onInventoryMutated) {
        await onInventoryMutated();
      }
    } finally {
      setDeletingBatch(false);
    }
  };

  const alerts = useMemo(() => {
    const lowStock = medicines.filter((m) => m.isLowStock);
    const outOfStock = medicines.filter((m) => m.isOutOfStock);

    const month1: BatchAlertEntry[] = []; // Expiring this month
    const month2: BatchAlertEntry[] = []; // Expiring next month
    const month3: BatchAlertEntry[] = []; // Expiring in 3rd month
    const expired: BatchAlertEntry[] = [];

    for (const med of medicines) {
      for (const batch of med.batches) {
        if (batch.quantityUnits <= 0) continue;
        if (batch.isExpired || batch.expiryBucket === "EXPIRED") {
          expired.push({ medicine: med, batch });
        } else if (batch.isExpiringSoon) {
          if (batch.expiryBucket === "MONTH_1") {
            month1.push({ medicine: med, batch });
          } else if (batch.expiryBucket === "MONTH_2") {
            month2.push({ medicine: med, batch });
          } else {
            month3.push({ medicine: med, batch });
          }
        }
      }
    }

    const expiringSoonTotal = month1.length + month2.length + month3.length;
    const totalCount =
      lowStock.length + outOfStock.length + expiringSoonTotal + expired.length;

    return {
      lowStock,
      outOfStock,
      month1,
      month2,
      month3,
      expiringSoonTotal,
      expired,
      totalCount,
    };
  }, [medicines]);

  const now = new Date();
  const monthLabel = (offset: number) =>
    new Date(now.getFullYear(), now.getMonth() + offset, 1).toLocaleString(
      "en-US",
      { month: "long", year: "numeric" }
    );

  return (
    <>
      <motion.button
        type="button"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.94 }}
        onClick={() => {
          // Automatically focus the most urgent non-empty tab when opening
          if (alerts.expired.length > 0) setTab("expired");
          else if (alerts.expiringSoonTotal > 0) setTab("expiring_soon");
          else if (alerts.outOfStock.length > 0) setTab("out_of_stock");
          else setTab("low_stock");
          setOpen(true);
        }}
        title="Pharmacy Inventory & Expiry Alerts"
        className={`relative inline-flex items-center gap-2 rounded-2xl border px-3.5 py-2.5 text-xs font-bold transition-colors cursor-pointer ${
          alerts.totalCount > 0
            ? "border-amber-300 bg-amber-50/90 text-amber-900 hover:bg-amber-100/80 shadow-xs"
            : "border-[#cfe2d6] bg-white text-[#0d4a38] hover:bg-emerald-50/60"
        }`}
      >
        <Bell
          className={`h-4 w-4 ${
            alerts.totalCount > 0 ? "text-amber-600" : "text-emerald-700"
          }`}
        />
        <span className="hidden sm:inline">Alerts</span>
        {alerts.totalCount > 0 ? (
          <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-rose-600 px-1.5 py-0.5 font-mono-id text-[10px] font-extrabold text-white shadow-xs">
            {alerts.totalCount}
          </span>
        ) : (
          <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 font-mono-id text-[10px] font-bold text-emerald-800">
            0
          </span>
        )}
      </motion.button>

      <AnimatedModal
        open={open}
        onClose={() => setOpen(false)}
        title="Pharmacy Alerts & 3-Month Expiry Watch"
        subtitle="Low stock, out of stock, 3-month expiring soon breakdown, and expired batches."
        maxWidth="max-w-3xl"
      >
        <div className="space-y-4">
          {/* 4 Category Tabs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(
              [
                {
                  id: "low_stock",
                  label: "Low Stock",
                  count: alerts.lowStock.length,
                  icon: <TrendingDown className="h-3.5 w-3.5" />,
                  activeCls: "border-amber-500 bg-amber-50 text-amber-900",
                },
                {
                  id: "out_of_stock",
                  label: "Out of Stock",
                  count: alerts.outOfStock.length,
                  icon: <PackageX className="h-3.5 w-3.5" />,
                  activeCls: "border-rose-500 bg-rose-50 text-rose-900",
                },
                {
                  id: "expiring_soon",
                  label: "Expiring Soon",
                  count: alerts.expiringSoonTotal,
                  icon: <Clock className="h-3.5 w-3.5" />,
                  activeCls: "border-amber-500 bg-amber-50 text-amber-900",
                },
                {
                  id: "expired",
                  label: "Expired",
                  count: alerts.expired.length,
                  icon: <XCircle className="h-3.5 w-3.5" />,
                  activeCls: "border-rose-600 bg-rose-50 text-rose-900",
                },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex items-center justify-between gap-2 rounded-xl border-2 px-3 py-2 text-xs font-bold transition-all cursor-pointer ${
                  tab === t.id
                    ? t.activeCls
                    : "border-[#dcece2] bg-white text-[#466356] hover:bg-[#f6fbf8]"
                }`}
              >
                <span className="inline-flex items-center gap-1.5 truncate">
                  {t.icon}
                  {t.label}
                </span>
                <span className="font-mono-id rounded-full bg-black/10 px-1.5 py-0.5 text-[10px]">
                  {t.count}
                </span>
              </button>
            ))}
          </div>

          {/* Tab Contents */}
          <div className="max-h-[55vh] overflow-y-auto space-y-3 pr-1">
            {tab === "low_stock" ? (
              alerts.lowStock.length === 0 ? (
                <p className="rounded-xl border border-[#dcece2] bg-[#f8fcfa] p-4 text-center text-xs text-[#5b796b]">
                  No medicines are currently below their minimum stock threshold.
                </p>
              ) : (
                alerts.lowStock.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-3 text-xs"
                  >
                    <div>
                      <p className="font-bold text-[#0f241d]">{m.name}</p>
                      <p className="text-[11px] text-amber-800">
                        Current stock: <strong className="font-mono-id">{m.validUnits}</strong> units · Minimum required: <strong className="font-mono-id">{m.minStock}</strong> units
                      </p>
                    </div>
                    <BubblyButton
                      variant="outline"
                      className="px-3 py-1.5 text-[11px]"
                      onClick={() => {
                        setOpen(false);
                        onJumpToStockFilter("low_stock");
                      }}
                    >
                      Restock
                    </BubblyButton>
                  </div>
                ))
              )
            ) : tab === "out_of_stock" ? (
              alerts.outOfStock.length === 0 ? (
                <p className="rounded-xl border border-[#dcece2] bg-[#f8fcfa] p-4 text-center text-xs text-[#5b796b]">
                  No medicines are out of stock.
                </p>
              ) : (
                alerts.outOfStock.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50/60 px-4 py-3 text-xs"
                  >
                    <div>
                      <p className="font-bold text-[#0f241d]">{m.name}</p>
                      <p className="text-[11px] font-semibold text-rose-700">
                        0 valid units remaining
                      </p>
                    </div>
                    <BubblyButton
                      variant="outline"
                      className="px-3 py-1.5 text-[11px]"
                      onClick={() => {
                        setOpen(false);
                        onJumpToStockFilter("out_of_stock");
                      }}
                    >
                      Add Stock
                    </BubblyButton>
                  </div>
                ))
              )
            ) : tab === "expiring_soon" ? (
              alerts.expiringSoonTotal === 0 ? (
                <p className="rounded-xl border border-[#dcece2] bg-[#f8fcfa] p-4 text-center text-xs text-[#5b796b]">
                  No active batches expiring within the 3-month window ({monthLabel(0)} – {monthLabel(2)}).
                </p>
              ) : (
                <div className="space-y-4">
                  {[
                    {
                      title: `Month 1 · Expiring This Month (${monthLabel(0)})`,
                      tone: "border-rose-200 bg-rose-50/60 text-rose-800",
                      entries: alerts.month1,
                    },
                    {
                      title: `Month 2 · Expiring Next Month (${monthLabel(1)})`,
                      tone: "border-amber-200 bg-amber-50/70 text-amber-900",
                      entries: alerts.month2,
                    },
                    {
                      title: `Month 3 · Expiring in 3rd Month (${monthLabel(2)})`,
                      tone: "border-amber-200 bg-amber-50/40 text-amber-800",
                      entries: alerts.month3,
                    },
                  ].map((group) => (
                    <div key={group.title} className="space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-extrabold uppercase tracking-wider text-[#314c40]">
                        <span>{group.title}</span>
                        <span className="font-mono-id">
                          {group.entries.length} batch(es)
                        </span>
                      </div>
                      {group.entries.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-[#dcece2] px-3 py-2 text-[11px] text-[#6c877a]">
                          None in this month.
                        </p>
                      ) : (
                        group.entries.map(({ medicine, batch }) => (
                          <div
                            key={batch.id}
                            className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-xs ${group.tone}`}
                          >
                            <div>
                              <p className="font-bold text-[#0f241d]">
                                {medicine.name}
                              </p>
                              <p className="font-mono-id text-[11px]">
                                Batch {batch.batchNumber} · Exp {batch.expiryLabel} · {batch.quantityUnits} unit(s)
                              </p>
                            </div>
                            <span className="font-mono-id text-[11px] font-bold">
                              {batch.daysToExpiry}d left
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  ))}
                </div>
              )
            ) : alerts.expired.length === 0 ? (
              <p className="rounded-xl border border-[#dcece2] bg-[#f8fcfa] p-4 text-center text-xs text-[#5b796b]">
                No expired batches with remaining stock.
              </p>
            ) : (
              alerts.expired.map(({ medicine, batch }) => (
                <div
                  key={batch.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-xs"
                >
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-[#0f241d]">{medicine.name}</p>
                      <p className="font-mono-id text-[11px] text-rose-700">
                        Batch {batch.batchNumber} · Expired {batch.expiryLabel} · {batch.quantityUnits} unit(s)
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <BubblyButton
                      variant="outline"
                      className="px-2.5 py-1.5 text-[11px]"
                      onClick={() => {
                        setOpen(false);
                        onJumpToStockFilter("expired");
                      }}
                    >
                      Manage
                    </BubblyButton>
                    <BubblyButton
                      variant="danger"
                      className="px-2.5 py-1.5 text-[11px]"
                      onClick={() => setDeleteBatchTarget({ medicine, batch })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete Batch
                    </BubblyButton>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex justify-end border-t border-[#e5f2ea] pt-3">
            <BubblyButton variant="outline" onClick={() => setOpen(false)}>
              Close
            </BubblyButton>
          </div>
        </div>
      </AnimatedModal>

      {/* Confirm Delete Expired Batch Modal */}
      <AnimatedModal
        open={Boolean(deleteBatchTarget)}
        onClose={() => setDeleteBatchTarget(null)}
        title="Delete Expired Batch?"
        subtitle={deleteBatchTarget?.medicine.name}
        maxWidth="max-w-md"
      >
        {deleteBatchTarget ? (
          <div className="space-y-4 text-xs">
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-900 space-y-1">
              <p className="font-bold">
                Batch {deleteBatchTarget.batch.batchNumber} · Expired{" "}
                {deleteBatchTarget.batch.expiryLabel}
              </p>
              <p>
                This will permanently remove this expired batch along with its{" "}
                <strong>{deleteBatchTarget.batch.quantityUnits} unit(s)</strong> from
                inventory. Other valid batches of{" "}
                <strong>{deleteBatchTarget.medicine.name}</strong> will remain untouched.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <BubblyButton
                variant="outline"
                onClick={() => setDeleteBatchTarget(null)}
              >
                Cancel
              </BubblyButton>
              <BubblyButton
                variant="danger"
                disabled={deletingBatch}
                onClick={handleConfirmDeleteBatch}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {deletingBatch ? "Deleting..." : "Delete Batch & Quantity"}
              </BubblyButton>
            </div>
          </div>
        ) : null}
      </AnimatedModal>
    </>
  );
}
