"use client";

import React, { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Barcode,
  Boxes,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Grid2X2,
  Hash,
  IndianRupee,
  Layers,
  Loader2,
  MapPin,
  Package,
  Pencil,
  Percent,
  Pill,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Tag,
  Trash2,
  Upload,
} from "lucide-react";
import {
  AnimatedModal,
  BubblyButton,
  EmptyState,
  SpringCard,
} from "@/components/ui/MotionPrimitives";
import { useToast } from "@/components/providers/AppProviders";
import { formatStockBreakdown } from "@/lib/pharmacy-utils";
import { ExpiryMonthYearInput } from "./ExpiryMonthYearInput";
import type {
  BillScanQuota,
  PackagingType,
  PharmacyBatchItem,
  PharmacyMedicineItem,
} from "./types";

export type StockFilter =
  | "all"
  | "low_stock"
  | "out_of_stock"
  | "expiring_soon"
  | "expired";

interface EditableBatchDraft {
  localKey: string;
  id?: string;
  batchNumber: string;
  quantityUnits: string;
  expiryMonth: string;
  expiryYear: string;
  deleted: boolean;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatPriceInput(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "";
  return String(round2(n));
}

const STOCK_PAGE_SIZE = 100;

const STOCK_FILTER_ORDER: StockFilter[] = [
  "all",
  "low_stock",
  "out_of_stock",
  "expiring_soon",
  "expired",
];

export function StockManagementSection({
  medicines,
  filter,
  onFilterChange,
  billQuota,
  uploadingBill,
  onUploadBillFile,
  onChanged,
  onJumpToAdd,
}: {
  medicines: PharmacyMedicineItem[];
  filter: StockFilter;
  onFilterChange: (next: StockFilter) => void;
  billQuota: BillScanQuota | null;
  uploadingBill: boolean;
  onUploadBillFile: (file: File) => Promise<void> | void;
  onChanged: () => Promise<void> | void;
  onJumpToAdd: () => void;
}) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [filterDirection, setFilterDirection] = useState<1 | -1>(1);
  const [busy, setBusy] = useState(false);

  // Upload Bill input triggers parent workspace handler so upload survives tab switches!
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleBillFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    void onUploadBillFile(file);
  };

  // Quick Add Stock Modal state (for the "Add" button on each medicine strip)
  const [quickAddMed, setQuickAddMed] = useState<PharmacyMedicineItem | null>(null);
  const [quickSheets, setQuickSheets] = useState("0");
  const [quickUnits, setQuickUnits] = useState("0");
  const [quickBatch, setQuickBatch] = useState("");
  const [quickBatchDropdownOpen, setQuickBatchDropdownOpen] = useState(false);
  const [quickBatchHighlightIdx, setQuickBatchHighlightIdx] = useState(0);
  const [quickExpMonth, setQuickExpMonth] = useState("");
  const [quickExpYear, setQuickExpYear] = useState("");
  const quickFormRef = useRef<HTMLFormElement | null>(null);
  const quickSheetsRef = useRef<HTMLInputElement | null>(null);
  const quickUnitsRef = useRef<HTMLInputElement | null>(null);
  const quickBatchRef = useRef<HTMLInputElement | null>(null);
  const quickExpMonthRef = useRef<HTMLInputElement | null>(null);

  const quickFilteredBatches = useMemo(() => {
    if (!quickAddMed) return [];
    const q = quickBatch.trim().toLowerCase();
    const sorted = [...quickAddMed.batches].sort((a, b) =>
      a.expiryYear !== b.expiryYear
        ? a.expiryYear - b.expiryYear
        : a.expiryMonth !== b.expiryMonth
          ? a.expiryMonth - b.expiryMonth
          : a.batchNumber.localeCompare(b.batchNumber)
    );
    if (!q) return sorted;
    return sorted.filter(
      (b) =>
        b.batchNumber.toLowerCase().includes(q) ||
        b.expiryLabel.toLowerCase().includes(q)
    );
  }, [quickAddMed, quickBatch]);

  const quickMatchedExistingBatch = useMemo(() => {
    if (!quickAddMed) return null;
    const q = quickBatch.trim().toLowerCase();
    if (!q) return null;
    return (
      quickAddMed.batches.find(
        (b) => b.batchNumber.trim().toLowerCase() === q
      ) ?? null
    );
  }, [quickAddMed, quickBatch]);

  const selectQuickExistingBatch = (b: PharmacyBatchItem) => {
    setQuickBatch(b.batchNumber);
    setQuickExpMonth(String(b.expiryMonth).padStart(2, "0"));
    setQuickExpYear(String(b.expiryYear));
    setQuickBatchDropdownOpen(false);
    setQuickBatchHighlightIdx(0);
  };

  const handleQuickBatchInputChange = (raw: string) => {
    setQuickBatch(raw);
    setQuickBatchDropdownOpen(true);
    setQuickBatchHighlightIdx(0);
    if (!quickAddMed) return;
    const clean = raw.trim().toLowerCase();
    if (!clean) return;
    const exactMatch = quickAddMed.batches.find(
      (b) => b.batchNumber.trim().toLowerCase() === clean
    );
    if (exactMatch) {
      setQuickExpMonth(String(exactMatch.expiryMonth).padStart(2, "0"));
      setQuickExpYear(String(exactMatch.expiryYear));
    }
  };

  const openQuickAdd = (med: PharmacyMedicineItem) => {
    setQuickAddMed(med);
    setQuickSheets("0");
    setQuickUnits("0");
    setQuickBatch("");
    setQuickBatchDropdownOpen(false);
    setQuickBatchHighlightIdx(0);
    setQuickExpMonth("");
    setQuickExpYear("");
    window.requestAnimationFrame(() => {
      if (med.packagingType === "INDIVIDUAL") {
        quickUnitsRef.current?.focus();
        quickUnitsRef.current?.select();
      } else {
        quickSheetsRef.current?.focus();
        quickSheetsRef.current?.select();
      }
    });
  };

  const handleSaveQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickAddMed) return;

    const em = Number.parseInt(quickExpMonth, 10);
    const ey = Number.parseInt(quickExpYear, 10);
    if (
      !Number.isInteger(em) ||
      em < 1 ||
      em > 12 ||
      !Number.isInteger(ey) ||
      ey < 2000 ||
      ey > 2150
    ) {
      toast({
        type: "warning",
        title: "Invalid Expiry Date",
        message: "Enter a valid expiry month (01–12) and 4-digit year.",
      });
      return;
    }

    const isInd = quickAddMed.packagingType === "INDIVIDUAL";
    const sh = isInd ? 0 : Math.max(0, Number.parseInt(quickSheets, 10) || 0);
    const su = Math.max(0, Number.parseInt(quickUnits, 10) || 0);
    if (sh === 0 && su === 0) {
      toast({
        type: "warning",
        title: "Enter Quantity",
        message: "Enter sheets or single units to add to stock.",
      });
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/pharmacy-mgmt/medicines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          medicineId: quickAddMed.id,
          name: quickAddMed.name,
          packagingType: quickAddMed.packagingType,
          unitsPerSheet: quickAddMed.unitsPerSheet,
          minStock: quickAddMed.minStock,
          unitSellingPrice: quickAddMed.unitSellingPrice,
          sheetSellingPrice: quickAddMed.sheetSellingPrice,
          hsnCode: quickAddMed.hsnCode,
          gstPercent: quickAddMed.gstPercent,
          prescriptionRequired: quickAddMed.prescriptionRequired,
          placement: quickAddMed.placement,
          sheetsCount: sh,
          singleUnitsCount: su,
          batchNumber: quickMatchedExistingBatch
            ? quickMatchedExistingBatch.batchNumber
            : quickBatch.trim(),
          expiryMonth: em,
          expiryYear: ey,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast({
          type: "error",
          title: "Stock Add Failed",
          message: d.error || "Unable to add stock quantity.",
        });
        return;
      }
      toast({
        type: "success",
        title: "Quantity Added",
        message: `${quickAddMed.name} · Batch ${d.batch.batchNumber} (+${d.totalUnitsAdded} units)`,
      });
      setQuickAddMed(null);
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  // Edit modal state
  const [editingMed, setEditingMed] = useState<PharmacyMedicineItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editPackaging, setEditPackaging] = useState<PackagingType>("SHEET");
  const [editUnitsPerSheet, setEditUnitsPerSheet] = useState("10");
  const [editMinStock, setEditMinStock] = useState("25");
  const [editUnitPrice, setEditUnitPrice] = useState("");
  const [editSheetPrice, setEditSheetPrice] = useState("");
  const [editLastPrice, setEditLastPrice] = useState<"unit" | "sheet">("unit");
  const [editHsn, setEditHsn] = useState("");
  const [editGst, setEditGst] = useState("0");
  const [editRx, setEditRx] = useState(true);
  const [editPlacement, setEditPlacement] = useState("");
  const [editBatches, setEditBatches] = useState<EditableBatchDraft[]>([]);

  // Delete confirmation modal state (medicine profile vs single batch)
  const [deleteTarget, setDeleteTarget] = useState<PharmacyMedicineItem | null>(null);
  const [deleteBatchTarget, setDeleteBatchTarget] = useState<{
    medicine: PharmacyMedicineItem;
    batch: PharmacyBatchItem;
  } | null>(null);

  const expiringSoonBatches = useMemo(() => {
    const list: Array<{ medicine: PharmacyMedicineItem; batch: PharmacyBatchItem }> = [];
    for (const med of medicines) {
      for (const batch of med.batches) {
        if (batch.quantityUnits > 0 && !batch.isExpired && batch.isExpiringSoon) {
          list.push({ medicine: med, batch });
        }
      }
    }
    return list.sort((a, b) =>
      a.batch.expiryYear !== b.batch.expiryYear
        ? a.batch.expiryYear - b.batch.expiryYear
        : a.batch.expiryMonth !== b.batch.expiryMonth
          ? a.batch.expiryMonth - b.batch.expiryMonth
          : a.medicine.name.localeCompare(b.medicine.name)
    );
  }, [medicines]);

  const expiredBatches = useMemo(() => {
    const list: Array<{ medicine: PharmacyMedicineItem; batch: PharmacyBatchItem }> = [];
    for (const med of medicines) {
      for (const batch of med.batches) {
        if (
          batch.quantityUnits > 0 &&
          (batch.isExpired || batch.expiryBucket === "EXPIRED")
        ) {
          list.push({ medicine: med, batch });
        }
      }
    }
    return list.sort((a, b) =>
      a.batch.expiryYear !== b.batch.expiryYear
        ? a.batch.expiryYear - b.batch.expiryYear
        : a.batch.expiryMonth !== b.batch.expiryMonth
          ? a.batch.expiryMonth - b.batch.expiryMonth
          : a.medicine.name.localeCompare(b.medicine.name)
    );
  }, [medicines]);

  const filterCounts = useMemo(
    () => ({
      all: medicines.length,
      low_stock: medicines.filter((m) => m.isLowStock).length,
      out_of_stock: medicines.filter((m) => m.isOutOfStock).length,
      expiring_soon: expiringSoonBatches.length,
      expired: expiredBatches.length,
    }),
    [medicines, expiringSoonBatches.length, expiredBatches.length]
  );

  const isBatchOnlyView = filter === "expiring_soon" || filter === "expired";

  const visibleBatches = useMemo(() => {
    if (!isBatchOnlyView) return [];
    const source = filter === "expired" ? expiredBatches : expiringSoonBatches;
    const q = search.trim().toLowerCase();
    if (!q) return source;
    return source.filter(
      ({ medicine, batch }) =>
        medicine.name.toLowerCase().includes(q) ||
        batch.batchNumber.toLowerCase().includes(q) ||
        batch.expiryLabel.toLowerCase().includes(q)
    );
  }, [isBatchOnlyView, filter, expiredBatches, expiringSoonBatches, search]);

  const visibleMedicines = useMemo(() => {
    if (isBatchOnlyView) return [];
    const q = search.trim().toLowerCase();
    return medicines.filter((m) => {
      if (q) {
        const match =
          m.name.toLowerCase().includes(q) ||
          (m.placement ?? "").toLowerCase().includes(q) ||
          (m.hsnCode ?? "").toLowerCase().includes(q) ||
          m.batches.some((b) => b.batchNumber.toLowerCase().includes(q));
        if (!match) return false;
      }
      if (filter === "low_stock") return m.isLowStock;
      if (filter === "out_of_stock") return m.isOutOfStock;
      return true;
    });
  }, [isBatchOnlyView, medicines, search, filter]);

  const totalMatchingCount = isBatchOnlyView
    ? visibleBatches.length
    : visibleMedicines.length;
  const totalPages = Math.max(1, Math.ceil(totalMatchingCount / STOCK_PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const pageStartIndex = (currentPage - 1) * STOCK_PAGE_SIZE;
  const pageEndIndex = Math.min(pageStartIndex + STOCK_PAGE_SIZE, totalMatchingCount);

  const paginatedBatches = useMemo(
    () => visibleBatches.slice(pageStartIndex, pageStartIndex + STOCK_PAGE_SIZE),
    [visibleBatches, pageStartIndex]
  );

  const paginatedMedicines = useMemo(
    () => visibleMedicines.slice(pageStartIndex, pageStartIndex + STOCK_PAGE_SIZE),
    [visibleMedicines, pageStartIndex]
  );

  const openEditModal = (med: PharmacyMedicineItem) => {
    setEditingMed(med);
    setEditName(med.name);
    setEditPackaging(med.packagingType);
    setEditUnitsPerSheet(String(med.unitsPerSheet));
    setEditMinStock(String(med.minStock));
    setEditUnitPrice(formatPriceInput(med.unitSellingPrice));
    setEditSheetPrice(formatPriceInput(med.sheetSellingPrice));
    setEditLastPrice("unit");
    setEditHsn(med.hsnCode ?? "");
    setEditGst(String(med.gstPercent));
    setEditRx(med.prescriptionRequired);
    setEditPlacement(med.placement ?? "");
    setEditBatches(
      med.batches.map((b) => ({
        localKey: b.id,
        id: b.id,
        batchNumber: b.batchNumber,
        quantityUnits: String(b.quantityUnits),
        expiryMonth: String(b.expiryMonth).padStart(2, "0"),
        expiryYear: String(b.expiryYear),
        deleted: false,
      }))
    );
  };

  const editIsIndividual = editPackaging === "INDIVIDUAL";
  const editUps = editIsIndividual
    ? 1
    : Math.max(1, Number.parseInt(editUnitsPerSheet, 10) || 1);

  const handleEditPackagingChange = (next: PackagingType) => {
    setEditPackaging(next);
    if (next === "INDIVIDUAL") {
      setEditUnitsPerSheet("1");
      setEditSheetPrice(editUnitPrice);
    } else {
      const ups = Math.max(2, Number.parseInt(editUnitsPerSheet, 10) || 10);
      setEditUnitsPerSheet(String(ups));
      const uVal = Number(editUnitPrice);
      if (editUnitPrice !== "" && Number.isFinite(uVal) && uVal >= 0) {
        setEditSheetPrice(formatPriceInput(uVal * ups));
      }
    }
  };

  const handleEditUpsChange = (val: string) => {
    setEditUnitsPerSheet(val);
    const ups = Number.parseInt(val, 10);
    if (!Number.isInteger(ups) || ups < 1) return;
    if (editLastPrice === "sheet") {
      const sVal = Number(editSheetPrice);
      if (editSheetPrice !== "" && Number.isFinite(sVal) && sVal >= 0) {
        setEditUnitPrice(formatPriceInput(sVal / ups));
      }
    } else {
      const uVal = Number(editUnitPrice);
      if (editUnitPrice !== "" && Number.isFinite(uVal) && uVal >= 0) {
        setEditSheetPrice(formatPriceInput(uVal * ups));
      }
    }
  };

  const handleEditUnitPrice = (val: string) => {
    setEditUnitPrice(val);
    setEditLastPrice("unit");
    if (val === "") {
      setEditSheetPrice("");
      return;
    }
    const n = Number(val);
    if (Number.isFinite(n) && n >= 0) {
      setEditSheetPrice(formatPriceInput(n * editUps));
    }
  };

  const handleEditSheetPrice = (val: string) => {
    setEditSheetPrice(val);
    setEditLastPrice("sheet");
    if (val === "") {
      setEditUnitPrice("");
      return;
    }
    const n = Number(val);
    if (Number.isFinite(n) && n >= 0 && editUps > 0) {
      setEditUnitPrice(formatPriceInput(n / editUps));
    }
  };

  const addDraftBatchRow = () => {
    const now = new Date();
    setEditBatches((prev) => [
      ...prev,
      {
        localKey: `new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        batchNumber: "",
        quantityUnits: "0",
        expiryMonth: String(now.getMonth() + 1).padStart(2, "0"),
        expiryYear: String(now.getFullYear() + 1),
        deleted: false,
      },
    ]);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMed) return;

    const preparedBatches: Array<{
      id?: string;
      batchNumber: string;
      expiryMonth: number;
      expiryYear: number;
      quantityUnits: number;
      delete?: boolean;
    }> = [];

    for (const row of editBatches) {
      if (row.deleted) {
        if (row.id) {
          preparedBatches.push({
            id: row.id,
            batchNumber: row.batchNumber.trim() || "DELETED",
            expiryMonth: 1,
            expiryYear: 2030,
            quantityUnits: 0,
            delete: true,
          });
        }
        continue;
      }
      if (!row.batchNumber.trim()) {
        toast({
          type: "warning",
          title: "Batch Number Missing",
          message: "Every active batch must have a batch number.",
        });
        return;
      }
      const em = Number.parseInt(row.expiryMonth, 10);
      const ey = Number.parseInt(row.expiryYear, 10);
      if (
        !Number.isInteger(em) ||
        em < 1 ||
        em > 12 ||
        !Number.isInteger(ey) ||
        ey < 2000 ||
        ey > 2150
      ) {
        toast({
          type: "warning",
          title: "Invalid Batch Expiry",
          message: `Check expiry date for batch "${row.batchNumber}" (MM / YYYY).`,
        });
        return;
      }
      const qty = Math.max(0, Number.parseInt(row.quantityUnits, 10) || 0);
      preparedBatches.push({
        ...(row.id ? { id: row.id } : {}),
        batchNumber: row.batchNumber.trim(),
        expiryMonth: em,
        expiryYear: ey,
        quantityUnits: qty,
      });
    }

    const parsedUnit = Number(editUnitPrice);
    const parsedSheet = editIsIndividual ? parsedUnit : Number(editSheetPrice);
    if (editUnitPrice === "" || !Number.isFinite(parsedUnit) || parsedUnit < 0) {
      toast({
        type: "warning",
        title: "Invalid Selling Price",
        message: "Enter a valid unit selling price.",
      });
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/pharmacy-mgmt/medicines/${editingMed.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          packagingType: editPackaging,
          unitsPerSheet: editIsIndividual ? 1 : editUps,
          minStock: Math.max(0, Number.parseInt(editMinStock, 10) || 0),
          unitSellingPrice: round2(parsedUnit),
          sheetSellingPrice: round2(
            Number.isFinite(parsedSheet) ? parsedSheet : parsedUnit * editUps
          ),
          hsnCode: editHsn.trim() || null,
          gstPercent: Number(editGst) || 0,
          prescriptionRequired: editRx,
          placement: editPlacement.trim() || null,
          batches: preparedBatches,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast({
          type: "error",
          title: "Update Failed",
          message: d.error || "Unable to update medicine.",
        });
        return;
      }

      toast({
        type: "success",
        title: "Medicine Updated",
        message: `"${d.medicine.name}" credentials and batch stock saved.`,
      });
      setEditingMed(null);
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmDeleteBatch = async () => {
    if (!deleteBatchTarget) return;
    setBusy(true);
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
          message: d.error || "Could not delete batch.",
        });
        return;
      }
      toast({
        type: "success",
        title: "Batch Deleted",
        message: `Removed batch "${deleteBatchTarget.batch.batchNumber}" (${deleteBatchTarget.batch.quantityUnits} unit(s)) of ${deleteBatchTarget.medicine.name}.`,
      });
      setDeleteBatchTarget(null);
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/pharmacy-mgmt/medicines/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const d = await res.json();
      if (!res.ok) {
        toast({
          type: "error",
          title: "Delete Failed",
          message: d.error || "Could not delete medicine.",
        });
        return;
      }
      toast({
        type: "info",
        title: "Medicine Deleted",
        message: `"${deleteTarget.name}" removed from inventory. Past sales receipts remain intact.`,
      });
      setDeleteTarget(null);
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Search + Status Filter + Upload Bill Bar */}
      <SpringCard className="p-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 flex-1">
            <div className="relative flex-1 max-w-sm">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6c877a]" />
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search medicine..."
                className="w-full rounded-xl border border-[#cfe2d6] bg-white py-2 pl-10 pr-3.5 text-sm text-[#0f241d] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200/70"
              />
            </div>

            <div className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-[#dcece2] bg-[#f8fcfa] p-1">
              {(
                [
                  { id: "all", label: "All" },
                  { id: "low_stock", label: "Low Stock" },
                  { id: "out_of_stock", label: "Out of Stock" },
                  { id: "expiring_soon", label: "Expiring Soon" },
                  { id: "expired", label: "Expired" },
                ] as const
              ).map((f) => {
                const active = filter === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      const prevIdx = STOCK_FILTER_ORDER.indexOf(filter);
                      const nextIdx = STOCK_FILTER_ORDER.indexOf(f.id);
                      if (nextIdx !== prevIdx) {
                        setFilterDirection(nextIdx > prevIdx ? 1 : -1);
                      }
                      onFilterChange(f.id);
                      setPage(1);
                    }}
                    className={`relative inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                      active
                        ? "text-[#0d4a38]"
                        : "text-[#466356] hover:text-[#0f241d]"
                    }`}
                  >
                    {active ? (
                      <motion.span
                        layoutId="stock-filter-active-pill"
                        transition={{ type: "spring", stiffness: 520, damping: 38 }}
                        className="absolute inset-0 rounded-lg border border-emerald-400/80 bg-[#dff4e8] shadow-xs"
                      />
                    ) : null}
                    <span className="relative z-10 inline-flex items-center gap-1.5">
                      {f.label}
                      <span
                        className={`rounded-full px-1.5 py-0.5 font-mono-id text-[10px] font-bold ${
                          active
                            ? "bg-[#0d4a38] text-white"
                            : "bg-white text-[#314c40]"
                        }`}
                      >
                        {filterCounts[f.id]}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Upload Bill Action (4 requests / month via secure server Gemini 3.8 Flash) */}
          <div className="flex items-center gap-2 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={handleBillFileSelected}
              className="hidden"
            />
            <BubblyButton
              type="button"
              disabled={uploadingBill || (billQuota !== null && billQuota.remaining <= 0)}
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 text-xs"
            >
              {uploadingBill ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Analyzing Bill...
                </>
              ) : (
                <>
                  <Upload className="h-3.5 w-3.5" />
                  Upload Bill
                  {billQuota ? (
                    <span className="ml-1 rounded-full bg-white/20 px-2 py-0.5 font-mono-id text-[10px]">
                      {billQuota.remaining}/{billQuota.limit} left
                    </span>
                  ) : null}
                </>
              )}
            </BubblyButton>
          </div>
        </div>
      </SpringCard>

      {/* Minimal, Ultra-Clean Horizontal Medicine Strips with Fluid Directional Filter Transitions */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${filter}-p${currentPage}`}
          initial={{ opacity: 0, x: filterDirection * 18, y: 5 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          exit={{ opacity: 0, x: filterDirection * -14, y: -3 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          {medicines.length === 0 ? (
            <SpringCard className="p-6">
              <EmptyState
                icon={<Boxes className="h-5 w-5" />}
                title="No Medicines In Inventory"
                description="Add your first medicine profile or upload a supplier bill to populate stock."
                action={
                  <BubblyButton onClick={onJumpToAdd}>
                    <Plus className="h-4 w-4" />
                    Add Medicine
                  </BubblyButton>
                }
              />
            </SpringCard>
          ) : isBatchOnlyView ? (
            visibleBatches.length === 0 ? (
              <SpringCard className="p-6">
                <EmptyState
                  icon={<Search className="h-5 w-5" />}
                  title={
                    filter === "expired"
                      ? "No Expired Batches"
                      : "No Expiring Soon Batches"
                  }
                  description={
                    filter === "expired"
                      ? "None of your active medicine batches are expired."
                      : "No active batches are expiring within the 3-month watch window."
                  }
                />
              </SpringCard>
            ) : (
              <div className="space-y-2.5">
                {paginatedBatches.map(({ medicine: med, batch }) => {
              const isExp = filter === "expired";
              return (
                <div
                  key={batch.id}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border px-5 py-3.5 shadow-xs transition-all duration-150 ${
                    isExp
                      ? "border-rose-300 bg-rose-50/40 hover:border-rose-400"
                      : "border-amber-200 bg-amber-50/30 hover:border-amber-400"
                  }`}
                >
                  {/* Batch + Medicine Identity */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                        isExp ? "bg-rose-500" : "bg-amber-500"
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-display text-sm font-extrabold text-[#0f241d] truncate">
                          {med.name}
                        </h3>
                        <span className="inline-flex items-center gap-1 rounded-full border border-[#cfe2d6] bg-white px-2.5 py-0.5 font-mono-id text-[11px] font-bold text-[#0d4a38]">
                          <Barcode className="h-3 w-3" />
                          Batch {batch.batchNumber}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono-id text-[11px] font-bold ${
                            isExp
                              ? "bg-rose-100 text-rose-800"
                              : "bg-amber-100 text-amber-900"
                          }`}
                        >
                          <Calendar className="h-3 w-3" />
                          {isExp ? `Expired ${batch.expiryLabel}` : `Exp ${batch.expiryLabel}`}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Batch Quantity + Price + Actions */}
                  <div className="flex flex-wrap items-center justify-between sm:justify-end gap-4 shrink-0">
                    <div className="flex items-center gap-5">
                      <div className="text-right">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[#6c877a]">
                          Selling Price
                        </p>
                        <p className="font-mono-id text-sm font-extrabold text-[#0f241d]">
                          ₹{med.unitSellingPrice.toFixed(2)}
                          <span className="text-[10px] font-semibold text-[#6c877a]">
                            /u
                          </span>
                        </p>
                      </div>

                      <div className="text-right min-w-[100px]">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[#6c877a]">
                          Batch Quantity
                        </p>
                        <p
                          className={`font-mono-id text-sm font-extrabold ${
                            isExp ? "text-rose-700" : "text-amber-800"
                          }`}
                        >
                          {formatStockBreakdown(
                            batch.quantityUnits,
                            med.packagingType,
                            med.unitsPerSheet
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <BubblyButton
                        variant="outline"
                        className="px-3 py-1.5 text-xs"
                        onClick={() => openEditModal(med)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </BubblyButton>
                      <BubblyButton
                        variant="danger"
                        className="px-3 py-1.5 text-xs"
                        onClick={() => setDeleteBatchTarget({ medicine: med, batch })}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete Batch
                      </BubblyButton>
                    </div>
                  </div>
                </div>
              );
            })}
              </div>
            )
          ) : visibleMedicines.length === 0 ? (
            <SpringCard className="p-6">
              <EmptyState
                icon={<Search className="h-5 w-5" />}
                title="No Matching Medicines"
                description="Adjust your search keyword or status filter to view medicines."
              />
            </SpringCard>
          ) : (
            <div className="space-y-2.5">
              {paginatedMedicines.map((med) => (
            <div
              key={med.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-[#cfe2d6] bg-white px-5 py-3.5 shadow-xs transition-all duration-150 hover:border-emerald-400 hover:shadow-md hover:shadow-emerald-950/5"
            >
                {/* Medicine Name */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span
                    title={
                      med.prescriptionRequired
                        ? "Prescription Required"
                        : "Non-Prescription"
                    }
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                      med.prescriptionRequired
                        ? "bg-rose-500 ring-4 ring-rose-100"
                        : "bg-emerald-500 ring-4 ring-emerald-100"
                    }`}
                  />
                  <h3 className="font-display text-base font-extrabold text-[#0f241d] truncate">
                    {med.name}
                  </h3>
                </div>

                {/* Selling Price + Quantity + Add / Edit / Delete */}
                <div className="flex flex-wrap items-center justify-between sm:justify-end gap-4 shrink-0">
                  <div className="flex items-center gap-4">
                    <div className="text-left sm:text-right">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#5b796b]">
                        Selling Price
                      </p>
                      <p className="font-mono-id text-sm font-extrabold text-[#0f241d]">
                        ₹{med.unitSellingPrice.toFixed(2)}
                        <span className="text-[11px] font-medium text-[#5b796b]"> / unit</span>
                      </p>
                      {med.packagingType === "SHEET" ? (
                        <p className="font-mono-id text-[11px] font-semibold text-emerald-700">
                          ₹{med.sheetSellingPrice.toFixed(2)} / sheet
                        </p>
                      ) : null}
                    </div>

                    <div className="h-8 w-px bg-[#e3f0e8]" />

                    <div className="text-left sm:text-right min-w-[110px]">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#5b796b]">
                        Quantity
                      </p>
                      <p
                        className={`font-mono-id text-sm font-extrabold ${
                          med.isOutOfStock
                            ? "text-rose-600"
                            : med.isLowStock
                              ? "text-amber-700"
                              : "text-[#0d4a38]"
                        }`}
                      >
                        {formatStockBreakdown(
                          med.validUnits,
                          med.packagingType,
                          med.unitsPerSheet
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <BubblyButton
                      variant="secondary"
                      className="px-3 py-1.5 text-xs"
                      onClick={() => openQuickAdd(med)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add
                    </BubblyButton>
                    <BubblyButton
                      variant="outline"
                      className="px-3 py-1.5 text-xs"
                      onClick={() => openEditModal(med)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </BubblyButton>
                    <BubblyButton
                      variant="danger"
                      className="px-3 py-1.5 text-xs"
                      onClick={() => setDeleteTarget(med)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </BubblyButton>
                  </div>
                </div>
              </div>
              ))}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Stock Pagination Bar (100 items per page) */}
      {totalMatchingCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#dcece2] bg-white px-4 py-3 text-xs">
          <span className="text-[#466356]">
            Showing{" "}
            <strong className="font-mono-id text-[#0f241d]">
              {pageStartIndex + 1}–{pageEndIndex}
            </strong>{" "}
            of{" "}
            <strong className="font-mono-id text-[#0f241d]">
              {totalMatchingCount}
            </strong>{" "}
            {isBatchOnlyView ? "batch(es)" : "medicine(s)"}
            {totalPages > 1 ? (
              <>
                {" "}
                · Page{" "}
                <strong className="font-mono-id text-[#0d4a38]">
                  {currentPage}
                </strong>{" "}
                of{" "}
                <strong className="font-mono-id text-[#0d4a38]">
                  {totalPages}
                </strong>
              </>
            ) : null}
          </span>
          {totalPages > 1 ? (
            <div className="flex items-center gap-2">
              <BubblyButton
                type="button"
                variant="outline"
                disabled={currentPage <= 1}
                onClick={() => {
                  setPage(Math.max(1, currentPage - 1));
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="px-3 py-1.5 text-xs"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Previous
              </BubblyButton>
              <BubblyButton
                type="button"
                variant="outline"
                disabled={currentPage >= totalPages}
                onClick={() => {
                  setPage(Math.min(totalPages, currentPage + 1));
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="px-3 py-1.5 text-xs"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </BubblyButton>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Quick Add Quantity Modal */}
      <AnimatedModal
        open={Boolean(quickAddMed)}
        onClose={() => setQuickAddMed(null)}
        title={`Add Stock Quantity · ${quickAddMed?.name ?? ""}`}
        subtitle={
          quickAddMed
            ? quickAddMed.packagingType === "SHEET"
              ? `${quickAddMed.unitsPerSheet} units / sheet · Currently ${quickAddMed.validUnits} units in stock`
              : `Individual item · Currently ${quickAddMed.validUnits} units in stock`
            : undefined
        }
      >
        {quickAddMed ? (
          <form ref={quickFormRef} onSubmit={handleSaveQuickAdd} className="space-y-4">
            <div className="grid gap-3.5 sm:grid-cols-2">
              {quickAddMed.packagingType === "SHEET" ? (
                <div>
                  <label className="mb-1 flex items-center gap-1.5 text-xs font-bold text-[#0f241d]">
                    <Layers className="h-3.5 w-3.5 text-emerald-700" />
                    Number of Sheets
                  </label>
                  <input
                    ref={quickSheetsRef}
                    type="number"
                    min={0}
                    value={quickSheets}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => setQuickSheets(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        quickUnitsRef.current?.focus();
                        quickUnitsRef.current?.select();
                      }
                    }}
                    className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2.5 text-sm font-mono-id font-semibold"
                  />
                </div>
              ) : null}

              <div className={quickAddMed.packagingType === "INDIVIDUAL" ? "sm:col-span-2" : ""}>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-bold text-[#0f241d]">
                  <Package className="h-3.5 w-3.5 text-emerald-700" />
                  Number of Single Units
                </label>
                <input
                  ref={quickUnitsRef}
                  type="number"
                  min={0}
                  value={quickUnits}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => setQuickUnits(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      quickBatchRef.current?.focus();
                    }
                  }}
                  className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2.5 text-sm font-mono-id font-semibold"
                />
              </div>
            </div>

            <div className="grid gap-3.5 sm:grid-cols-2">
              <div className="relative">
                <label className="mb-1 flex items-center justify-between text-xs font-bold text-[#0f241d]">
                  <span className="inline-flex items-center gap-1.5">
                    <Barcode className="h-3.5 w-3.5 text-emerald-700" />
                    Batch Number *
                  </span>
                  {quickAddMed.batches.length > 0 ? (
                    <span className="text-[10px] font-semibold text-[#5b796b]">
                      {quickAddMed.batches.length} existing
                    </span>
                  ) : null}
                </label>
                <input
                  ref={quickBatchRef}
                  required
                  value={quickBatch}
                  placeholder="Select existing or enter new batch"
                  onFocus={() => setQuickBatchDropdownOpen(true)}
                  onBlur={() =>
                    window.setTimeout(() => setQuickBatchDropdownOpen(false), 160)
                  }
                  onChange={(e) => handleQuickBatchInputChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown" && quickFilteredBatches.length > 0) {
                      e.preventDefault();
                      setQuickBatchDropdownOpen(true);
                      setQuickBatchHighlightIdx((i) =>
                        Math.min(quickFilteredBatches.length - 1, i + 1)
                      );
                    } else if (e.key === "ArrowUp" && quickFilteredBatches.length > 0) {
                      e.preventDefault();
                      setQuickBatchHighlightIdx((i) => Math.max(0, i - 1));
                    } else if (e.key === "Escape") {
                      setQuickBatchDropdownOpen(false);
                    } else if (e.key === "Enter") {
                      e.preventDefault();
                      if (
                        quickBatchDropdownOpen &&
                        quickFilteredBatches.length > 0 &&
                        !quickMatchedExistingBatch &&
                        quickBatch.trim().length > 0
                      ) {
                        const picked =
                          quickFilteredBatches[quickBatchHighlightIdx] ??
                          quickFilteredBatches[0];
                        if (picked) {
                          selectQuickExistingBatch(picked);
                        }
                      }
                      setQuickBatchDropdownOpen(false);
                      quickExpMonthRef.current?.focus();
                    }
                  }}
                  className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2.5 text-sm font-mono-id font-semibold"
                />

                {/* Existing Batches Dropdown for This Medicine Profile */}
                {quickBatchDropdownOpen && quickAddMed.batches.length > 0 ? (
                  <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-48 overflow-y-auto rounded-2xl border border-[#cfe2d6] bg-white p-1.5 shadow-xl">
                    <p className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#5b796b]">
                      Available Batches for {quickAddMed.name}
                    </p>
                    {quickFilteredBatches.length === 0 ? (
                      <p className="px-2.5 py-2 text-[11px] text-[#5b796b]">
                        No matching existing batch — will create new batch &ldquo;{quickBatch.trim()}&rdquo;.
                      </p>
                    ) : (
                      quickFilteredBatches.map((b, idx) => {
                        const isSelected =
                          quickMatchedExistingBatch?.id === b.id;
                        const isHighlighted = idx === quickBatchHighlightIdx;
                        return (
                          <button
                            key={b.id}
                            type="button"
                            onMouseEnter={() => setQuickBatchHighlightIdx(idx)}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              selectQuickExistingBatch(b);
                              window.requestAnimationFrame(() =>
                                quickExpMonthRef.current?.focus()
                              );
                            }}
                            className={`flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-xs transition-colors cursor-pointer ${
                              isSelected
                                ? "bg-[#dff4e8] text-[#0d4a38]"
                                : isHighlighted
                                  ? "bg-[#f2f9f5] text-[#0f241d]"
                                  : "text-[#0f241d] hover:bg-[#f2f9f5]"
                            }`}
                          >
                            <div>
                              <p className="font-mono-id font-bold">
                                {b.batchNumber}
                              </p>
                              <p className="text-[10px] text-[#5b796b]">
                                Exp {b.expiryLabel}
                                {b.isExpired
                                  ? " (Expired)"
                                  : b.isExpiringSoon
                                    ? " (Expiring Soon)"
                                    : ""}
                              </p>
                            </div>
                            <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 font-mono-id text-[10px] font-bold text-emerald-800">
                              {b.quantityUnits} u
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                ) : null}
              </div>

              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-bold text-[#0f241d]">
                  <Calendar className="h-3.5 w-3.5 text-emerald-700" />
                  Expiry Date (MM / YYYY) *
                </label>
                <ExpiryMonthYearInput
                  month={quickExpMonth}
                  year={quickExpYear}
                  monthInputRef={quickExpMonthRef}
                  onChange={({ month, year }) => {
                    setQuickExpMonth(month);
                    setQuickExpYear(year);
                  }}
                  onEnterComplete={() => quickFormRef.current?.requestSubmit()}
                />
              </div>
            </div>

            {quickMatchedExistingBatch ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-3.5 py-2.5 text-[11px] text-[#0d4a38]">
                <strong>Existing Batch Matched ({quickMatchedExistingBatch.batchNumber}):</strong>{" "}
                Entered quantity will be added to this batch (currently{" "}
                <strong>{quickMatchedExistingBatch.quantityUnits} unit(s)</strong>, Exp{" "}
                <strong>{quickMatchedExistingBatch.expiryLabel}</strong>) — no duplicate batch will be created. Edit the expiry date above if you need to update it.
              </div>
            ) : null}

            <div className="flex justify-end gap-3 pt-2">
              <BubblyButton variant="outline" onClick={() => setQuickAddMed(null)}>
                Cancel
              </BubblyButton>
              <BubblyButton type="submit" disabled={busy}>
                <Plus className="h-4 w-4" />
                {busy ? "Adding..." : "Add Quantity"}
              </BubblyButton>
            </div>
          </form>
        ) : null}
      </AnimatedModal>

      {/* Edit Medicine & Batches Modal */}
      <AnimatedModal
        open={Boolean(editingMed)}
        onClose={() => setEditingMed(null)}
        title={`Edit Medicine · ${editingMed?.name ?? ""}`}
        subtitle="Update medicine credentials, selling prices, placement, and batch stock or expiry dates."
        maxWidth="max-w-3xl"
      >
        <form onSubmit={handleSaveEdit} className="space-y-5">
          <div className="grid gap-3.5 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="mb-1 flex items-center gap-1.5 text-xs font-bold text-[#0f241d]">
                <Pill className="h-3.5 w-3.5 text-emerald-700" />
                Medicine Name *
              </label>
              <input
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3 py-2 text-sm font-medium text-[#0f241d]"
              />
            </div>

            <div>
              <label className="mb-1 flex items-center gap-1.5 text-xs font-bold text-[#0f241d]">
                <MapPin className="h-3.5 w-3.5 text-emerald-700" />
                Placement
              </label>
              <input
                value={editPlacement}
                onChange={(e) => setEditPlacement(e.target.value)}
                className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3 py-2 text-sm text-[#0f241d]"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 flex items-center gap-1.5 text-xs font-bold text-[#0f241d]">
                <Layers className="h-3.5 w-3.5 text-emerald-700" />
                Packaging Type
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleEditPackagingChange("SHEET")}
                  className={`flex items-center justify-center gap-1.5 rounded-xl border-2 px-3 py-2 text-xs font-bold cursor-pointer ${
                    editPackaging === "SHEET"
                      ? "border-emerald-600 bg-[#dff4e8] text-[#0d4a38]"
                      : "border-[#dcece2] bg-[#f8fbf9] text-[#7b9689] opacity-65"
                  }`}
                >
                  <Layers className="h-3.5 w-3.5" />
                  Sheets
                </button>
                <button
                  type="button"
                  onClick={() => handleEditPackagingChange("INDIVIDUAL")}
                  className={`flex items-center justify-center gap-1.5 rounded-xl border-2 px-3 py-2 text-xs font-bold cursor-pointer ${
                    editPackaging === "INDIVIDUAL"
                      ? "border-emerald-600 bg-[#dff4e8] text-[#0d4a38]"
                      : "border-[#dcece2] bg-[#f8fbf9] text-[#7b9689] opacity-65"
                  }`}
                >
                  <Package className="h-3.5 w-3.5" />
                  Individual
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1 flex items-center gap-1.5 text-xs font-bold text-[#0f241d]">
                {editRx ? (
                  <ShieldAlert className="h-3.5 w-3.5 text-rose-600" />
                ) : (
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                )}
                Prescription Required
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setEditRx(false)}
                  className={`flex items-center justify-center gap-1.5 rounded-xl border-2 px-3 py-2 text-xs font-bold cursor-pointer ${
                    !editRx
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-[#dcece2] bg-white text-[#5b796b]"
                  }`}
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  No
                </button>
                <button
                  type="button"
                  onClick={() => setEditRx(true)}
                  className={`flex items-center justify-center gap-1.5 rounded-xl border-2 px-3 py-2 text-xs font-bold cursor-pointer ${
                    editRx
                      ? "border-rose-600 bg-rose-600 text-white"
                      : "border-[#dcece2] bg-white text-[#5b796b]"
                  }`}
                >
                  <ShieldAlert className="h-3.5 w-3.5" />
                  Yes
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <div className={editIsIndividual ? "opacity-50" : ""}>
              <label className="mb-1 flex items-center gap-1 text-xs font-bold text-[#0f241d]">
                <Grid2X2 className="h-3.5 w-3.5 text-emerald-700" />
                Units / Sheet
              </label>
              <input
                type="number"
                min={1}
                disabled={editIsIndividual}
                value={editIsIndividual ? "1" : editUnitsPerSheet}
                onChange={(e) => handleEditUpsChange(e.target.value)}
                className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3 py-2 text-sm font-mono-id font-semibold disabled:bg-[#f2f6f4]"
              />
            </div>

            <div>
              <label className="mb-1 flex items-center gap-1 text-xs font-bold text-[#0f241d]">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                Min Stock
              </label>
              <input
                type="number"
                min={0}
                value={editMinStock}
                onChange={(e) => setEditMinStock(e.target.value)}
                className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3 py-2 text-sm font-mono-id font-semibold"
              />
            </div>

            <div>
              <label className="mb-1 flex items-center gap-1 text-xs font-bold text-[#0f241d]">
                <IndianRupee className="h-3.5 w-3.5 text-emerald-700" />
                Unit Price (₹)
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                required
                value={editUnitPrice}
                onChange={(e) => handleEditUnitPrice(e.target.value)}
                className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3 py-2 text-sm font-mono-id font-semibold"
              />
            </div>

            <div className={editIsIndividual ? "opacity-50" : ""}>
              <label className="mb-1 flex items-center gap-1 text-xs font-bold text-[#0f241d]">
                <Tag className="h-3.5 w-3.5 text-emerald-700" />
                Sheet Price (₹)
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                disabled={editIsIndividual}
                value={editIsIndividual ? editUnitPrice : editSheetPrice}
                onChange={(e) => handleEditSheetPrice(e.target.value)}
                className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3 py-2 text-sm font-mono-id font-semibold disabled:bg-[#f2f6f4]"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 flex items-center gap-1.5 text-xs font-bold text-[#0f241d]">
                <Hash className="h-3.5 w-3.5 text-emerald-700" />
                HSN Code
              </label>
              <input
                value={editHsn}
                onChange={(e) => setEditHsn(e.target.value)}
                className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3 py-2 text-sm font-mono-id"
              />
            </div>
            <div>
              <label className="mb-1 flex items-center gap-1.5 text-xs font-bold text-[#0f241d]">
                <Percent className="h-3.5 w-3.5 text-emerald-700" />
                GST (%)
              </label>
              <input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={editGst}
                onChange={(e) => setEditGst(e.target.value)}
                className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3 py-2 text-sm font-mono-id font-semibold"
              />
            </div>
          </div>

          {/* Batches Editor Section */}
          <div className="rounded-2xl border border-[#d6e9de] bg-[#f7fbf9] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Barcode className="h-4 w-4 text-emerald-700" />
                <span className="text-xs font-extrabold uppercase tracking-wider text-[#0d4a38]">
                  Batches ({editBatches.filter((b) => !b.deleted).length})
                </span>
              </div>
              <BubblyButton
                type="button"
                variant="secondary"
                className="px-3 py-1.5 text-xs"
                onClick={addDraftBatchRow}
              >
                <Plus className="h-3.5 w-3.5" />
                Add Batch
              </BubblyButton>
            </div>

            {editBatches.length === 0 ? (
              <p className="text-xs text-[#5b796b]">
                No batches yet. Click &ldquo;Add Batch&rdquo; to attach stock.
              </p>
            ) : (
              <div className="space-y-2.5">
                {editBatches.map((row, idx) => {
                  const qtyNum = Math.max(0, Number.parseInt(row.quantityUnits, 10) || 0);
                  return (
                    <div
                      key={row.localKey}
                      className={`rounded-xl border p-3 transition-all ${
                        row.deleted
                          ? "border-rose-200 bg-rose-50/60 opacity-60"
                          : "border-[#dcece2] bg-white"
                      }`}
                    >
                      <div className="grid gap-3 sm:grid-cols-12 items-end">
                        <div className="sm:col-span-4">
                          <label className="mb-1 flex items-center gap-1 text-[11px] font-bold text-[#314c40]">
                            <Barcode className="h-3 w-3 text-emerald-700" />
                            Batch Number *
                          </label>
                          <input
                            disabled={row.deleted}
                            required={!row.deleted}
                            value={row.batchNumber}
                            onChange={(e) =>
                              setEditBatches((prev) =>
                                prev.map((r, i) =>
                                  i === idx ? { ...r, batchNumber: e.target.value } : r
                                )
                              )
                            }
                            className="w-full rounded-lg border border-[#cfe2d6] bg-white px-2.5 py-1.5 text-xs font-mono-id font-semibold"
                          />
                        </div>

                        <div className="sm:col-span-3">
                          <label className="mb-1 flex items-center justify-between text-[11px] font-bold text-[#314c40]">
                            <span>Qty (Units) *</span>
                            {!editIsIndividual && editUps > 1 ? (
                              <span className="font-mono-id text-[10px] font-medium text-emerald-700">
                                {Math.floor(qtyNum / editUps)}sh+{qtyNum % editUps}u
                              </span>
                            ) : null}
                          </label>
                          <input
                            type="number"
                            min={0}
                            disabled={row.deleted}
                            value={row.quantityUnits}
                            onChange={(e) =>
                              setEditBatches((prev) =>
                                prev.map((r, i) =>
                                  i === idx ? { ...r, quantityUnits: e.target.value } : r
                                )
                              )
                            }
                            className="w-full rounded-lg border border-[#cfe2d6] bg-white px-2.5 py-1.5 text-xs font-mono-id font-semibold"
                          />
                        </div>

                        <div className="sm:col-span-4">
                          <label className="mb-1 flex items-center gap-1 text-[11px] font-bold text-[#314c40]">
                            <Calendar className="h-3 w-3 text-emerald-700" />
                            Expiry (MM / YYYY) *
                          </label>
                          <ExpiryMonthYearInput
                            compact
                            disabled={row.deleted}
                            month={row.expiryMonth}
                            year={row.expiryYear}
                            onChange={({ month, year }) =>
                              setEditBatches((prev) =>
                                prev.map((r, i) =>
                                  i === idx
                                    ? { ...r, expiryMonth: month, expiryYear: year }
                                    : r
                                )
                              )
                            }
                          />
                        </div>

                        <div className="sm:col-span-1 flex justify-end">
                          <button
                            type="button"
                            title={row.deleted ? "Restore batch" : "Remove batch"}
                            onClick={() => {
                              if (!row.id) {
                                setEditBatches((prev) => prev.filter((_, i) => i !== idx));
                              } else {
                                setEditBatches((prev) =>
                                  prev.map((r, i) =>
                                    i === idx ? { ...r, deleted: !r.deleted } : r
                                  )
                                );
                              }
                            }}
                            className={`rounded-lg p-2 transition-colors cursor-pointer ${
                              row.deleted
                                ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                                : "bg-rose-50 text-rose-600 hover:bg-rose-100"
                            }`}
                          >
                            {row.deleted ? (
                              <RotateCcw className="h-3.5 w-3.5" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <BubblyButton variant="outline" onClick={() => setEditingMed(null)}>
              Cancel
            </BubblyButton>
            <BubblyButton type="submit" disabled={busy}>
              {busy ? "Saving Changes..." : "Save Changes"}
            </BubblyButton>
          </div>
        </form>
      </AnimatedModal>

      {/* Delete Confirmation Modal */}
      <AnimatedModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete Medicine Profile"
        subtitle={deleteTarget?.name}
      >
        {deleteTarget ? (
          <div className="space-y-4 text-sm">
            <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 text-xs text-rose-900 space-y-1">
              <p className="font-bold">
                Permanently remove &ldquo;{deleteTarget.name}&rdquo; and its{" "}
                {deleteTarget.batches.length} batch(es)?
              </p>
              <p>
                Historical pharmacy sales transactions and printable receipts remain preserved via snapshots.
              </p>
            </div>
            <div className="flex justify-end gap-3">
              <BubblyButton variant="outline" onClick={() => setDeleteTarget(null)}>
                Cancel
              </BubblyButton>
              <BubblyButton
                variant="danger"
                disabled={busy}
                onClick={handleConfirmDelete}
              >
                <Trash2 className="h-4 w-4" />
                {busy ? "Deleting..." : "Confirm Delete"}
              </BubblyButton>
            </div>
          </div>
        ) : null}
      </AnimatedModal>

      {/* Delete Single Batch Confirmation Modal */}
      <AnimatedModal
        open={Boolean(deleteBatchTarget)}
        onClose={() => setDeleteBatchTarget(null)}
        title="Delete Batch & Quantity"
        subtitle={deleteBatchTarget?.medicine.name}
        maxWidth="max-w-md"
      >
        {deleteBatchTarget ? (
          <div className="space-y-4 text-sm">
            <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 text-xs text-rose-900 space-y-1">
              <p className="font-bold">
                Permanently remove Batch &ldquo;{deleteBatchTarget.batch.batchNumber}&rdquo;
                (Exp {deleteBatchTarget.batch.expiryLabel})?
              </p>
              <p>
                All <strong>{deleteBatchTarget.batch.quantityUnits} unit(s)</strong>{" "}
                associated with this batch will be deleted. The medicine profile and other
                batches of <strong>{deleteBatchTarget.medicine.name}</strong> will remain
                intact.
              </p>
            </div>
            <div className="flex justify-end gap-3">
              <BubblyButton
                variant="outline"
                onClick={() => setDeleteBatchTarget(null)}
              >
                Cancel
              </BubblyButton>
              <BubblyButton
                variant="danger"
                disabled={busy}
                onClick={handleConfirmDeleteBatch}
              >
                <Trash2 className="h-4 w-4" />
                {busy ? "Deleting..." : "Delete Batch"}
              </BubblyButton>
            </div>
          </div>
        ) : null}
      </AnimatedModal>
    </div>
  );
}
