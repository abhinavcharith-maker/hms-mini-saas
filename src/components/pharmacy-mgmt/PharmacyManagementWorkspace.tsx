"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart3,
  Boxes,
  FileScan,
  Loader2,
  PlusCircle,
  ShoppingCart,
} from "lucide-react";
import { SkeletonBox } from "@/components/ui/MotionPrimitives";
import { useToast } from "@/components/providers/AppProviders";
import type {
  BillScanQuota,
  BillScanSession,
  DoctorPrescriptionRecord,
  PharmacyBootstrapData,
  PharmacyMedicineItem,
} from "./types";
import {
  SellMedicineSection,
  type SellMedicineHandle,
} from "./SellMedicineSection";
import { StockManagementSection, type StockFilter } from "./StockManagementSection";
import { AddMedicineSection } from "./AddMedicineSection";
import { PharmacyAnalyticsSection } from "./PharmacyAnalyticsSection";
import { PharmacyReminderBell } from "./PharmacyReminderBell";
import { PharmacyPrescriptionsButton } from "./PharmacyPrescriptionsButton";
import { BillScanReviewPanel } from "./BillScanReviewPanel";

type PharmacyMgmtTab = "sell" | "add" | "stock" | "analytics" | "review_scan";

export function PharmacyManagementWorkspace() {
  const { toast } = useToast();
  const [tab, setTab] = useState<PharmacyMgmtTab>("sell");
  const [stockFilterOverride, setStockFilterOverride] = useState<StockFilter>("all");
  const [loading, setLoading] = useState(true);
  const [bootstrap, setBootstrap] = useState<PharmacyBootstrapData | null>(null);
  const [medicines, setMedicines] = useState<PharmacyMedicineItem[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  // Persistent Bill Scan state lifted to workspace so switching tabs NEVER cancels an in-flight upload or loses review state!
  const [billQuota, setBillQuota] = useState<BillScanQuota | null>(null);
  const [scanSession, setScanSession] = useState<BillScanSession | null>(null);
  const [uploadingBill, setUploadingBill] = useState(false);

  // Incoming Doctor Prescriptions queue + SellMedicine imperative bridge
  const [prescriptions, setPrescriptions] = useState<DoctorPrescriptionRecord[]>([]);
  const [pendingPrescriptionsCount, setPendingPrescriptionsCount] = useState(0);
  const sellActionRef = useRef<SellMedicineHandle | null>(null);

  const consultancyEnabled = bootstrap?.hospital.consultancyEnabled !== false;

  const loadPrescriptions = useCallback(async () => {
    try {
      const res = await fetch("/api/pharmacy-mgmt/prescriptions?status=PENDING", {
        cache: "no-store",
      });
      if (res.ok) {
        const pd = await res.json();
        setPrescriptions(pd.prescriptions ?? []);
        setPendingPrescriptionsCount(pd.pendingCount ?? 0);
      } else if (res.status === 403) {
        setPrescriptions([]);
        setPendingPrescriptionsCount(0);
      }
    } catch {
      // non-fatal
    }
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [bootRes, medRes, scanRes] = await Promise.all([
        fetch("/api/pharmacy-mgmt/bootstrap"),
        fetch("/api/pharmacy-mgmt/medicines"),
        fetch("/api/pharmacy-mgmt/bill-scans"),
      ]);
      let isConsultancyOn = true;
      if (bootRes.ok) {
        const bootData: PharmacyBootstrapData = await bootRes.json();
        setBootstrap(bootData);
        isConsultancyOn = bootData.hospital.consultancyEnabled !== false;
      }
      if (medRes.ok) {
        const d = await medRes.json();
        setMedicines(d.medicines ?? []);
      }
      if (scanRes.ok) {
        const sd = await scanRes.json();
        setBillQuota(sd.quota ?? null);
        setScanSession(sd.activeSession ?? null);
      }
      if (isConsultancyOn) {
        await loadPrescriptions();
      } else {
        setPrescriptions([]);
        setPendingPrescriptionsCount(0);
      }
    } finally {
      setLoading(false);
    }
  }, [loadPrescriptions]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Gently poll incoming doctor prescriptions ONLY when Consultancy is enabled
  useEffect(() => {
    if (!consultancyEnabled) return;
    const timer = window.setInterval(() => {
      void loadPrescriptions();
    }, 20_000);
    const onFocus = () => {
      void loadPrescriptions();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [consultancyEnabled, loadPrescriptions]);

  const handleInventoryMutated = useCallback(async () => {
    const medRes = await fetch("/api/pharmacy-mgmt/medicines");
    if (medRes.ok) {
      const d = await medRes.json();
      setMedicines(d.medicines ?? []);
    }
    if (consultancyEnabled) {
      await loadPrescriptions();
    }
    setRefreshKey((k) => k + 1);
  }, [consultancyEnabled, loadPrescriptions]);

  // Background-safe bill upload handler — runs cleanly even if user navigates to Sell Medicine / Add Medicine while processing!
  const handleUploadBillFile = useCallback(
    async (file: File) => {
      if (uploadingBill) return;
      setUploadingBill(true);
      setTab("review_scan");
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/pharmacy-mgmt/bill-scans", {
          method: "POST",
          body: formData,
        });
        const d = await res.json();
        if (!res.ok) {
          toast({
            type: "error",
            title:
              d.code === "MONTHLY_SCAN_QUOTA_EXCEEDED"
                ? "Monthly Scan Limit Reached"
                : d.code === "GEMINI_NOT_CONFIGURED"
                  ? "Gemini API Key Needed"
                  : "Bill Scan Failed",
            message: d.error || "Unable to analyze purchase bill.",
          });
          return;
        }
        setBillQuota(d.quota ?? null);
        setScanSession(d.session ?? null);
        toast({
          type: "success",
          title: "Purchase Bill Analyzed",
          message: `Extracted ${d.session.items.length} item(s) in Review Scanned Purchase.`,
        });
      } catch {
        toast({
          type: "error",
          title: "Upload Error",
          message: "Network error while analyzing purchase bill.",
        });
      } finally {
        setUploadingBill(false);
      }
    },
    [uploadingBill, toast]
  );

  // Ordered tabs: Sell Medicine -> Add Medicine -> Stock Management -> Analytics
  const tabs: Array<{
    id: Exclude<PharmacyMgmtTab, "review_scan">;
    label: string;
    icon: React.ReactNode;
    badge?: number;
  }> = [
    {
      id: "sell",
      label: "Sell Medicine",
      icon: <ShoppingCart className="h-4 w-4" />,
    },
    {
      id: "add",
      label: "Add Medicine",
      icon: <PlusCircle className="h-4 w-4" />,
    },
    {
      id: "stock",
      label: "Stock Management",
      icon: <Boxes className="h-4 w-4" />,
      badge: medicines.length,
    },
    {
      id: "analytics",
      label: "Analytics",
      icon: <BarChart3 className="h-4 w-4" />,
    },
  ];

  const pendingScanCount = scanSession
    ? scanSession.items.filter((i) => i.status !== "ADDED").length
    : 0;

  return (
    <div className="space-y-4">
      {/* Compact Top Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap gap-1.5 rounded-2xl border border-[#cfe2d6] bg-white p-1.5 shadow-xs">
          {tabs.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`relative inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-colors cursor-pointer ${
                  active
                    ? "text-white"
                    : "text-[#466356] hover:text-[#0f241d]"
                }`}
              >
                {active ? (
                  <motion.span
                    layoutId="pharmacy-mgmt-tab-pill"
                    transition={{ type: "spring", stiffness: 540, damping: 38 }}
                    className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#0d4a38] to-[#059669] shadow-md shadow-emerald-900/20"
                  />
                ) : null}
                <span className="relative z-10 inline-flex items-center gap-2">
                  {t.icon}
                  {t.label}
                  {typeof t.badge === "number" ? (
                    <span
                      className={`rounded-full px-1.5 py-0.5 font-mono-id text-[10px] font-bold ${
                        active
                          ? "bg-white/20 text-white"
                          : "bg-[#eef7f1] text-[#0d4a38]"
                      }`}
                    >
                      {t.badge}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>

        {/* Right Controls: Prescriptions (when Consultancy enabled) + Reminder Bell + Dedicated Review Scanned Purchase Section */}
        <div className="flex items-center gap-2">
          {consultancyEnabled ? (
            <PharmacyPrescriptionsButton
              prescriptions={prescriptions}
              pendingCount={pendingPrescriptionsCount}
              medicines={medicines}
              getCartBatchUsage={() =>
                sellActionRef.current?.getCartBatchUsage() ?? new Map<string, number>()
              }
              onRefresh={loadPrescriptions}
              onAddPrescriptionItemsToCart={(payload) => {
                sellActionRef.current?.addPrescriptionToCart(payload);
                setTab("sell");
              }}
            />
          ) : null}

          <PharmacyReminderBell
            medicines={medicines}
            onInventoryMutated={handleInventoryMutated}
            onJumpToStockFilter={(nextFilter) => {
              setStockFilterOverride(nextFilter);
              setTab("stock");
            }}
          />

          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => setTab("review_scan")}
            className={`inline-flex items-center gap-2 rounded-2xl border px-3.5 py-2.5 text-xs font-bold transition-all cursor-pointer ${
              tab === "review_scan"
                ? "border-emerald-600 bg-gradient-to-r from-[#0d4a38] to-[#059669] text-white shadow-md shadow-emerald-900/20"
                : pendingScanCount > 0 || uploadingBill
                  ? "border-emerald-400 bg-[#dff4e8] text-[#0d4a38] shadow-xs"
                  : "border-[#cfe2d6] bg-white text-[#0d4a38] hover:border-emerald-400 hover:bg-emerald-50/50"
            }`}
          >
            {uploadingBill ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileScan className="h-4 w-4" />
            )}
            <span>Review Scanned Purchase</span>
            {uploadingBill ? (
              <span className="rounded-full bg-emerald-700/20 px-2 py-0.5 text-[10px]">
                Analyzing...
              </span>
            ) : pendingScanCount > 0 ? (
              <span
                className={`rounded-full px-1.5 py-0.5 font-mono-id text-[10px] font-extrabold ${
                  tab === "review_scan"
                    ? "bg-white/20 text-white"
                    : "bg-[#0d4a38] text-white"
                }`}
              >
                {pendingScanCount}
              </span>
            ) : null}
          </motion.button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <SkeletonBox className="h-32" />
          <SkeletonBox className="h-80" />
        </div>
      ) : (
        /* Keep every operational section mounted (hidden when inactive) so cart items, forms, and in-progress bill reviews NEVER disappear when switching tabs! */
        <div>
          <div className={tab === "sell" ? "block" : "hidden"}>
            <SellMedicineSection
              medicines={medicines}
              doctors={bootstrap?.doctors ?? []}
              pharmacyName={bootstrap?.pharmacyName || "Pharmacy"}
              refreshKey={refreshKey}
              isActive={tab === "sell"}
              actionRef={sellActionRef}
              onSaleCompleted={handleInventoryMutated}
            />
          </div>

          <div className={tab === "add" ? "block" : "hidden"}>
            <AddMedicineSection
              existingMedicines={medicines}
              isActive={tab === "add"}
              onSaved={handleInventoryMutated}
            />
          </div>

          <div className={tab === "stock" ? "block" : "hidden"}>
            <StockManagementSection
              medicines={medicines}
              filter={stockFilterOverride}
              onFilterChange={setStockFilterOverride}
              billQuota={billQuota}
              uploadingBill={uploadingBill}
              onUploadBillFile={handleUploadBillFile}
              onChanged={handleInventoryMutated}
              onJumpToAdd={() => setTab("add")}
            />
          </div>

          <div className={tab === "analytics" ? "block" : "hidden"}>
            <PharmacyAnalyticsSection refreshKey={refreshKey} />
          </div>

          <div className={tab === "review_scan" ? "block" : "hidden"}>
            <BillScanReviewPanel
              session={scanSession}
              medicines={medicines}
              billQuota={billQuota}
              uploadingBill={uploadingBill}
              onUploadBillFile={handleUploadBillFile}
              onSessionChange={setScanSession}
              onInventoryMutated={handleInventoryMutated}
            />
          </div>
        </div>
      )}
    </div>
  );
}
