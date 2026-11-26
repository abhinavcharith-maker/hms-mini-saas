"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Barcode,
  Calendar,
  CheckCircle2,
  Grid2X2,
  Hash,
  IndianRupee,
  Layers,
  Loader2,
  MapPin,
  Package,
  Percent,
  Pill,
  PlusCircle,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Tag,
  Upload,
} from "lucide-react";
import { BubblyButton, SpringCard } from "@/components/ui/MotionPrimitives";
import { useToast } from "@/components/providers/AppProviders";
import { ExpiryMonthYearInput } from "./ExpiryMonthYearInput";
import type { BillScanQuota, PackagingType, PharmacyMedicineItem } from "./types";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatPriceInput(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "";
  return String(round2(n));
}

export function AddMedicineSection({
  existingMedicines,
  isActive = true,
  billQuota = null,
  uploadingBill = false,
  onUploadBillFile,
  onSaved,
}: {
  existingMedicines: PharmacyMedicineItem[];
  isActive?: boolean;
  billQuota?: BillScanQuota | null;
  uploadingBill?: boolean;
  onUploadBillFile?: (file: File) => Promise<void> | void;
  onSaved: () => Promise<void> | void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const billFileInputRef = useRef<HTMLInputElement | null>(null);

  const handleBillFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !onUploadBillFile) return;
    void onUploadBillFile(file);
  };

  const [selectedExistingId, setSelectedExistingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [nameDropdownOpen, setNameDropdownOpen] = useState(false);

  const [packagingType, setPackagingType] = useState<PackagingType>("SHEET");
  // Defaults per spec: Units/Sheet = 0, Min Stock = 25, Prescription Required = Yes
  const [unitsPerSheet, setUnitsPerSheet] = useState("0");
  const [minStock, setMinStock] = useState("25");
  const [unitPrice, setUnitPrice] = useState("");
  const [sheetPrice, setSheetPrice] = useState("");
  const [lastPriceEdited, setLastPriceEdited] = useState<"unit" | "sheet">("unit");

  const [hsnCode, setHsnCode] = useState("");
  const [gstPercent, setGstPercent] = useState("0");
  const [prescriptionRequired, setPrescriptionRequired] = useState(true);
  const [placement, setPlacement] = useState("");

  const [sheetsCount, setSheetsCount] = useState("0");
  const [singleUnitsCount, setSingleUnitsCount] = useState("0");
  const [batchNumber, setBatchNumber] = useState("");
  const [expiryMonth, setExpiryMonth] = useState("");
  const [expiryYear, setExpiryYear] = useState("");

  // Ordered refs for seamless Return-key navigation across all fields
  const formRef = useRef<HTMLFormElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const placementRef = useRef<HTMLInputElement | null>(null);
  const unitsPerSheetRef = useRef<HTMLInputElement | null>(null);
  const minStockRef = useRef<HTMLInputElement | null>(null);
  const unitPriceRef = useRef<HTMLInputElement | null>(null);
  const sheetPriceRef = useRef<HTMLInputElement | null>(null);
  const hsnRef = useRef<HTMLInputElement | null>(null);
  const gstRef = useRef<HTMLInputElement | null>(null);
  const sheetsCountRef = useRef<HTMLInputElement | null>(null);
  const singleUnitsRef = useRef<HTMLInputElement | null>(null);
  const batchNumberRef = useRef<HTMLInputElement | null>(null);
  const expiryMonthRef = useRef<HTMLInputElement | null>(null);

  // Immediately place cursor on Medicine Name whenever entering Add Medicine
  useEffect(() => {
    if (!isActive) return;
    window.requestAnimationFrame(() => {
      nameRef.current?.focus();
    });
  }, [isActive]);

  const isIndividual = packagingType === "INDIVIDUAL";
  const parsedUnitsPerSheet = isIndividual
    ? 1
    : Math.max(0, Number.parseInt(unitsPerSheet, 10) || 0);

  const totalUnitsToAdd = useMemo(() => {
    const sh = isIndividual ? 0 : Math.max(0, Number.parseInt(sheetsCount, 10) || 0);
    const single = Math.max(0, Number.parseInt(singleUnitsCount, 10) || 0);
    return sh * Math.max(1, parsedUnitsPerSheet) + single;
  }, [isIndividual, sheetsCount, singleUnitsCount, parsedUnitsPerSheet]);

  const matchingExisting = useMemo(() => {
    const q = name.trim().toLowerCase();
    if (!q) return [];
    return existingMedicines
      .filter((m) => m.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [name, existingMedicines]);

  const focusRef = (ref: React.RefObject<HTMLInputElement | null>) => {
    window.requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.select();
    });
  };

  const handleEnterMove = (
    e: React.KeyboardEvent<HTMLInputElement>,
    nextRef: React.RefObject<HTMLInputElement | null>
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      focusRef(nextRef);
    }
  };

  const handleSelectPackaging = (next: PackagingType) => {
    setPackagingType(next);
    if (next === "INDIVIDUAL") {
      setUnitsPerSheet("1");
      setSheetsCount("0");
      setSheetPrice(unitPrice);
    } else {
      const ups = Number.parseInt(unitsPerSheet, 10) || 0;
      setUnitsPerSheet(String(ups));
      const uVal = Number(unitPrice);
      if (unitPrice !== "" && Number.isFinite(uVal) && uVal >= 0 && ups > 0) {
        setSheetPrice(formatPriceInput(uVal * ups));
      }
    }
  };

  const handleUnitsPerSheetChange = (val: string) => {
    setUnitsPerSheet(val);
    const ups = Number.parseInt(val, 10);
    if (!Number.isInteger(ups) || ups < 1) return;
    if (lastPriceEdited === "sheet") {
      const sVal = Number(sheetPrice);
      if (sheetPrice !== "" && Number.isFinite(sVal) && sVal >= 0) {
        setUnitPrice(formatPriceInput(sVal / ups));
      }
    } else {
      const uVal = Number(unitPrice);
      if (unitPrice !== "" && Number.isFinite(uVal) && uVal >= 0) {
        setSheetPrice(formatPriceInput(uVal * ups));
      }
    }
  };

  const handleUnitPriceChange = (val: string) => {
    setUnitPrice(val);
    setLastPriceEdited("unit");
    if (val === "") {
      setSheetPrice("");
      return;
    }
    const num = Number(val);
    if (Number.isFinite(num) && num >= 0 && parsedUnitsPerSheet > 0) {
      setSheetPrice(formatPriceInput(num * parsedUnitsPerSheet));
    }
  };

  const handleSheetPriceChange = (val: string) => {
    setSheetPrice(val);
    setLastPriceEdited("sheet");
    if (val === "") {
      setUnitPrice("");
      return;
    }
    const num = Number(val);
    if (Number.isFinite(num) && num >= 0 && parsedUnitsPerSheet > 0) {
      setUnitPrice(formatPriceInput(num / parsedUnitsPerSheet));
    }
  };

  const applyExistingProfile = (med: PharmacyMedicineItem) => {
    setSelectedExistingId(med.id);
    setName(med.name);
    setPackagingType(med.packagingType);
    setUnitsPerSheet(String(med.unitsPerSheet));
    setMinStock(String(med.minStock));
    setUnitPrice(formatPriceInput(med.unitSellingPrice));
    setSheetPrice(formatPriceInput(med.sheetSellingPrice));
    setHsnCode(med.hsnCode ?? "");
    setGstPercent(String(med.gstPercent));
    setPrescriptionRequired(med.prescriptionRequired);
    setPlacement(med.placement ?? "");
    setNameDropdownOpen(false);
    focusRef(placementRef);
  };

  const resetForm = () => {
    setSelectedExistingId(null);
    setName("");
    setPackagingType("SHEET");
    setUnitsPerSheet("0");
    setMinStock("25");
    setUnitPrice("");
    setSheetPrice("");
    setLastPriceEdited("unit");
    setHsnCode("");
    setGstPercent("0");
    setPrescriptionRequired(true);
    setPlacement("");
    setSheetsCount("0");
    setSingleUnitsCount("0");
    setBatchNumber("");
    setExpiryMonth("");
    setExpiryYear("");
    window.requestAnimationFrame(() => {
      nameRef.current?.focus();
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isIndividual && (!Number.isInteger(parsedUnitsPerSheet) || parsedUnitsPerSheet < 1)) {
      toast({
        type: "warning",
        title: "Units per Sheet Required",
        message: "Enter a whole number greater than 0 for Units per Sheet.",
      });
      focusRef(unitsPerSheetRef);
      return;
    }

    const em = Number.parseInt(expiryMonth, 10);
    const ey = Number.parseInt(expiryYear, 10);
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
      focusRef(expiryMonthRef);
      return;
    }

    const parsedUnit = Number(unitPrice);
    const parsedSheet = isIndividual ? parsedUnit : Number(sheetPrice);
    if (unitPrice === "" || !Number.isFinite(parsedUnit) || parsedUnit < 0) {
      toast({
        type: "warning",
        title: "Selling Price Required",
        message: "Enter a valid unit or sheet selling price.",
      });
      focusRef(unitPriceRef);
      return;
    }

    setBusy(true);
    try {
      const upsFinal = isIndividual ? 1 : parsedUnitsPerSheet;
      const res = await fetch("/api/pharmacy-mgmt/medicines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          medicineId: selectedExistingId,
          name: name.trim(),
          packagingType,
          unitsPerSheet: upsFinal,
          minStock: Math.max(0, Number.parseInt(minStock, 10) || 0),
          unitSellingPrice: round2(parsedUnit),
          sheetSellingPrice: round2(
            Number.isFinite(parsedSheet) ? parsedSheet : parsedUnit * upsFinal
          ),
          hsnCode: hsnCode.trim() || null,
          gstPercent: Number(gstPercent) || 0,
          prescriptionRequired,
          placement: placement.trim() || null,
          sheetsCount: isIndividual
            ? 0
            : Math.max(0, Number.parseInt(sheetsCount, 10) || 0),
          singleUnitsCount: Math.max(0, Number.parseInt(singleUnitsCount, 10) || 0),
          batchNumber: batchNumber.trim(),
          expiryMonth: em,
          expiryYear: ey,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast({
          type: "error",
          title: "Save Failed",
          message: d.error || "Unable to save medicine.",
        });
        return;
      }

      toast({
        type: "success",
        title: d.isNewProfile ? "Medicine Added" : "Stock Batch Added",
        message: `${d.medicine.name} · Batch ${d.batch.batchNumber} (+${d.totalUnitsAdded} units)`,
      });
      resetForm();
      await onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <SpringCard className="p-6">
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e2f0e8] pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#0d4a38] to-[#059669] text-white shadow-sm">
              <PlusCircle className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="font-display text-base font-extrabold text-[#0f241d]">
                Add Medicine & Batch Stock
              </h2>
              {selectedExistingId ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Restocking existing medicine profile
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onUploadBillFile ? (
              <>
                <input
                  ref={billFileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={handleBillFileSelected}
                  className="hidden"
                />
                <BubblyButton
                  type="button"
                  disabled={
                    uploadingBill ||
                    (billQuota !== null && billQuota.remaining <= 0)
                  }
                  onClick={() => billFileInputRef.current?.click()}
                  className="px-3.5 py-1.5 text-xs"
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
              </>
            ) : null}

            <BubblyButton
              type="button"
              variant="outline"
              onClick={resetForm}
              className="px-3 py-1.5 text-xs"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </BubblyButton>
          </div>
        </div>

        {/* Row 1: Medicine Name -> Placement */}
        <div className="grid gap-4 md:grid-cols-3">
          <div className="relative md:col-span-2">
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[#0f241d]">
              <Pill className="h-3.5 w-3.5 text-emerald-700" />
              Medicine Name *
            </label>
            <input
              ref={nameRef}
              required
              value={name}
              onFocus={() => setNameDropdownOpen(true)}
              onBlur={() => setTimeout(() => setNameDropdownOpen(false), 160)}
              onChange={(e) => {
                setName(e.target.value);
                setSelectedExistingId(null);
                setNameDropdownOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  setNameDropdownOpen(false);
                  focusRef(placementRef);
                }
              }}
              className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2.5 text-sm font-medium text-[#0f241d] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200/70"
            />
            <AnimatePresence>
              {nameDropdownOpen && matchingExisting.length > 0 && !selectedExistingId ? (
                <motion.div
                  initial={{ opacity: 0, y: -3 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -3 }}
                  transition={{ duration: 0.1 }}
                  className="absolute left-0 right-0 z-20 mt-1.5 max-h-48 overflow-y-auto rounded-xl border border-[#cfe2d6] bg-white shadow-xl divide-y divide-[#ebf4ee]"
                >
                  {matchingExisting.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        applyExistingProfile(m);
                      }}
                      className="flex w-full items-center justify-between px-3.5 py-2 text-left text-xs hover:bg-[#eef9f2] cursor-pointer"
                    >
                      <span className="font-semibold text-[#0f241d]">{m.name}</span>
                      <span className="text-[11px] font-medium text-emerald-700">
                        Restock · {m.validUnits} in stock
                      </span>
                    </button>
                  ))}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[#0f241d]">
              <MapPin className="h-3.5 w-3.5 text-emerald-700" />
              Medicine Placement
            </label>
            <input
              ref={placementRef}
              value={placement}
              onChange={(e) => setPlacement(e.target.value)}
              onKeyDown={(e) =>
                handleEnterMove(e, isIndividual ? minStockRef : unitsPerSheetRef)
              }
              className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2.5 text-sm text-[#0f241d] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200/70"
            />
          </div>
        </div>

        {/* Row 2: Packaging Type (Sheets vs Individual) + Prescription Required (Yes default Red / No Green) */}
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[#0f241d]">
              <Layers className="h-3.5 w-3.5 text-emerald-700" />
              Packaging Type *
            </label>
            <div className="grid grid-cols-2 gap-3">
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => handleSelectPackaging("SHEET")}
                className={`flex items-center justify-center gap-2 rounded-xl border-2 px-4 py-2.5 text-sm font-bold transition-all cursor-pointer ${
                  packagingType === "SHEET"
                    ? "border-emerald-600 bg-[#dff4e8] text-[#0d4a38] shadow-sm"
                    : "border-[#dcece2] bg-[#f8fbf9] text-[#7b9689] opacity-65 hover:opacity-95"
                }`}
              >
                <Layers className="h-4 w-4" />
                Sheets
              </motion.button>
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => handleSelectPackaging("INDIVIDUAL")}
                className={`flex items-center justify-center gap-2 rounded-xl border-2 px-4 py-2.5 text-sm font-bold transition-all cursor-pointer ${
                  packagingType === "INDIVIDUAL"
                    ? "border-emerald-600 bg-[#dff4e8] text-[#0d4a38] shadow-sm"
                    : "border-[#dcece2] bg-[#f8fbf9] text-[#7b9689] opacity-65 hover:opacity-95"
                }`}
              >
                <Package className="h-4 w-4" />
                Individual Items
              </motion.button>
            </div>
          </div>

          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[#0f241d]">
              {prescriptionRequired ? (
                <ShieldAlert className="h-3.5 w-3.5 text-rose-600" />
              ) : (
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              )}
              Prescription Required *
            </label>
            <div className="grid grid-cols-2 gap-3">
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => setPrescriptionRequired(false)}
                className={`flex items-center justify-center gap-2 rounded-xl border-2 px-4 py-2.5 text-sm font-bold transition-all cursor-pointer ${
                  !prescriptionRequired
                    ? "border-emerald-600 bg-emerald-600 text-white shadow-md shadow-emerald-600/25"
                    : "border-[#dcece2] bg-white text-[#5b796b] hover:border-emerald-300"
                }`}
              >
                <ShieldCheck className="h-4 w-4" />
                No
              </motion.button>
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => setPrescriptionRequired(true)}
                className={`flex items-center justify-center gap-2 rounded-xl border-2 px-4 py-2.5 text-sm font-bold transition-all cursor-pointer ${
                  prescriptionRequired
                    ? "border-rose-600 bg-rose-600 text-white shadow-md shadow-rose-600/25"
                    : "border-[#dcece2] bg-white text-[#5b796b] hover:border-rose-300"
                }`}
              >
                <ShieldAlert className="h-4 w-4" />
                Yes
              </motion.button>
            </div>
          </div>
        </div>

        {/* Row 3: Units per Sheet (default 0) -> Minimum Stock (default 25) -> Unit Selling Price -> Sheet Selling Price */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className={isIndividual ? "opacity-50" : ""}>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[#0f241d]">
              <Grid2X2 className="h-3.5 w-3.5 text-emerald-700" />
              Units per Sheet *
            </label>
            <input
              ref={unitsPerSheetRef}
              type="number"
              min={0}
              max={1000}
              required={!isIndividual}
              disabled={isIndividual}
              value={isIndividual ? "1" : unitsPerSheet}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => handleUnitsPerSheetChange(e.target.value)}
              onKeyDown={(e) => handleEnterMove(e, minStockRef)}
              className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2.5 text-sm font-mono-id font-semibold text-[#0f241d] disabled:bg-[#f2f6f4] disabled:cursor-not-allowed"
            />
          </div>

          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[#0f241d]">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
              Minimum Stock (Units)
            </label>
            <input
              ref={minStockRef}
              type="number"
              min={0}
              value={minStock}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => setMinStock(e.target.value)}
              onKeyDown={(e) => handleEnterMove(e, unitPriceRef)}
              className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2.5 text-sm font-mono-id font-semibold text-[#0f241d]"
            />
          </div>

          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[#0f241d]">
              <IndianRupee className="h-3.5 w-3.5 text-emerald-700" />
              Unit Selling Price (₹) *
            </label>
            <input
              ref={unitPriceRef}
              type="number"
              min={0}
              step="0.01"
              required
              value={unitPrice}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => handleUnitPriceChange(e.target.value)}
              onKeyDown={(e) =>
                handleEnterMove(e, isIndividual ? hsnRef : sheetPriceRef)
              }
              className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2.5 text-sm font-mono-id font-semibold text-[#0f241d]"
            />
          </div>

          <div className={isIndividual ? "opacity-50" : ""}>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[#0f241d]">
              <Tag className="h-3.5 w-3.5 text-emerald-700" />
              Sheet Selling Price (₹)
            </label>
            <input
              ref={sheetPriceRef}
              type="number"
              min={0}
              step="0.01"
              disabled={isIndividual}
              value={isIndividual ? unitPrice : sheetPrice}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => handleSheetPriceChange(e.target.value)}
              onKeyDown={(e) => handleEnterMove(e, hsnRef)}
              className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2.5 text-sm font-mono-id font-semibold text-[#0f241d] disabled:bg-[#f2f6f4] disabled:cursor-not-allowed"
            />
          </div>
        </div>

        {/* Row 4: HSN Code -> GST % */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[#0f241d]">
              <Hash className="h-3.5 w-3.5 text-emerald-700" />
              HSN Code
            </label>
            <input
              ref={hsnRef}
              value={hsnCode}
              onChange={(e) => setHsnCode(e.target.value)}
              onKeyDown={(e) => handleEnterMove(e, gstRef)}
              className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2.5 text-sm font-mono-id text-[#0f241d]"
            />
          </div>

          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[#0f241d]">
              <Percent className="h-3.5 w-3.5 text-emerald-700" />
              GST (%)
            </label>
            <input
              ref={gstRef}
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={gstPercent}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => setGstPercent(e.target.value)}
              onKeyDown={(e) =>
                handleEnterMove(e, isIndividual ? singleUnitsRef : sheetsCountRef)
              }
              className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2.5 text-sm font-mono-id font-semibold text-[#0f241d]"
            />
          </div>
        </div>

        {/* Row 5: Batch & Stock Entry (Sheets -> Single Units -> Batch Number -> Expiry MM/YYYY) */}
        <div className="rounded-2xl border border-[#d6e9de] bg-[#f6fbf8] p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#0d4a38]">
              Batch & Stock Entry
            </span>
            <span className="rounded-full border border-emerald-300 bg-emerald-100/80 px-3 py-0.5 font-mono-id text-xs font-bold text-[#0d4a38]">
              Total Stock: {totalUnitsToAdd} units
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className={isIndividual ? "opacity-50" : ""}>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[#0f241d]">
                <Layers className="h-3.5 w-3.5 text-emerald-700" />
                Number of Sheets
              </label>
              <input
                ref={sheetsCountRef}
                type="number"
                min={0}
                disabled={isIndividual}
                value={isIndividual ? "0" : sheetsCount}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setSheetsCount(e.target.value)}
                onKeyDown={(e) => handleEnterMove(e, singleUnitsRef)}
                className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2.5 text-sm font-mono-id font-semibold text-[#0f241d] disabled:bg-[#eef4f0] disabled:cursor-not-allowed"
              />
            </div>

            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[#0f241d]">
                <Package className="h-3.5 w-3.5 text-emerald-700" />
                Number of Single Units
              </label>
              <input
                ref={singleUnitsRef}
                type="number"
                min={0}
                value={singleUnitsCount}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setSingleUnitsCount(e.target.value)}
                onKeyDown={(e) => handleEnterMove(e, batchNumberRef)}
                className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2.5 text-sm font-mono-id font-semibold text-[#0f241d]"
              />
            </div>

            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[#0f241d]">
                <Barcode className="h-3.5 w-3.5 text-emerald-700" />
                Batch Number *
              </label>
              <input
                ref={batchNumberRef}
                required
                value={batchNumber}
                onChange={(e) => setBatchNumber(e.target.value)}
                onKeyDown={(e) => handleEnterMove(e, expiryMonthRef)}
                className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2.5 text-sm font-mono-id font-semibold text-[#0f241d]"
              />
            </div>

            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[#0f241d]">
                <Calendar className="h-3.5 w-3.5 text-emerald-700" />
                Expiry Date (MM / YYYY) *
              </label>
              <ExpiryMonthYearInput
                month={expiryMonth}
                year={expiryYear}
                monthInputRef={expiryMonthRef}
                onChange={({ month, year }) => {
                  setExpiryMonth(month);
                  setExpiryYear(year);
                }}
                onEnterComplete={() => formRef.current?.requestSubmit()}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <BubblyButton type="submit" disabled={busy} className="px-6 py-3">
            <PlusCircle className="h-4 w-4" />
            {busy
              ? "Saving..."
              : selectedExistingId
                ? "Add Stock Batch"
                : "Add Medicine"}
          </BubblyButton>
        </div>
      </form>
    </SpringCard>
  );
}
