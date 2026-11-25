"use client";

import React, { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Barcode,
  Calendar,
  CheckCircle2,
  FileScan,
  Grid2X2,
  Hash,
  IndianRupee,
  Layers,
  Link2,
  Loader2,
  MapPin,
  Package,
  Percent,
  Pill,
  PlusCircle,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  AnimatedModal,
  BubblyButton,
  EmptyState,
  SpringCard,
} from "@/components/ui/MotionPrimitives";
import { useToast } from "@/components/providers/AppProviders";
import { ExpiryMonthYearInput } from "./ExpiryMonthYearInput";
import type {
  BillScanItem,
  BillScanQuota,
  BillScanSession,
  PackagingType,
  PharmacyMedicineItem,
} from "./types";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function BillScanReviewPanel({
  session,
  medicines,
  billQuota,
  uploadingBill,
  onUploadBillFile,
  onSessionChange,
  onInventoryMutated,
}: {
  session: BillScanSession | null;
  medicines: PharmacyMedicineItem[];
  billQuota: BillScanQuota | null;
  uploadingBill: boolean;
  onUploadBillFile: (file: File) => Promise<void> | void;
  onSessionChange: (next: BillScanSession | null) => void;
  onInventoryMutated: () => Promise<void> | void;
}) {
  const { toast } = useToast();
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  // Match-to-existing search modal state
  const [matchTargetItemId, setMatchTargetItemId] = useState<string | null>(null);
  const [matchSearch, setMatchSearch] = useState("");

  // Exact duplicate warning pop-up when clicking Create New Medicine Profile on an already-existing exact name
  const [duplicateAlert, setDuplicateAlert] = useState<{
    item: BillScanItem;
    existingMed: PharmacyMedicineItem;
  } | null>(null);

  // Create New Medicine Profile modal state (selling prices ALWAYS default to 0 — never bill purchase price!)
  const [createForItem, setCreateForItem] = useState<BillScanItem | null>(null);
  const [newName, setNewName] = useState("");
  const [newPlacement, setNewPlacement] = useState("");
  const [newPackaging, setNewPackaging] = useState<PackagingType>("SHEET");
  const [newUnitsPerSheet, setNewUnitsPerSheet] = useState("0");
  const [newMinStock, setNewMinStock] = useState("25");
  const [newUnitPrice, setNewUnitPrice] = useState("0");
  const [newSheetPrice, setNewSheetPrice] = useState("0");
  const [newHsn, setNewHsn] = useState("");
  const [newGst, setNewGst] = useState("0");
  const [newRx, setNewRx] = useState(true);
  const [newSheets, setNewSheets] = useState("0");
  const [newSingleUnits, setNewSingleUnits] = useState("0");
  const [newBatch, setNewBatch] = useState("");
  const [newExpMonth, setNewExpMonth] = useState("");
  const [newExpYear, setNewExpYear] = useState("");
  const [creatingProfile, setCreatingProfile] = useState(false);

  const findExactMedicineByName = (candidate: string) => {
    const target = candidate.trim().toLowerCase();
    if (!target) return null;
    return (
      medicines.find((m) => m.name.trim().toLowerCase() === target) ?? null
    );
  };

  const persistSessionItems = async (
    nextItems: BillScanItem[],
    nextStatus?: "IN_PROGRESS" | "COMPLETED" | "DISCARDED"
  ) => {
    if (!session) return;
    const res = await fetch(`/api/pharmacy-mgmt/bill-scans/${session.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: nextItems,
        ...(nextStatus ? { status: nextStatus } : {}),
      }),
    });
    if (res.ok) {
      const d = await res.json();
      onSessionChange(d.session);
    }
  };

  const updateLocalItem = (
    itemId: string,
    patch: Partial<BillScanItem>,
    persistNow = false
  ) => {
    if (!session) return;
    const nextItems = session.items.map((it) =>
      it.itemId === itemId ? { ...it, ...patch } : it
    );
    onSessionChange({ ...session, items: nextItems });
    if (persistNow) {
      void persistSessionItems(nextItems);
    }
  };

  const handleRemoveScannedItem = async (itemId: string) => {
    if (!session) return;
    const nextItems = session.items.filter((it) => it.itemId !== itemId);
    onSessionChange({ ...session, items: nextItems });
    await persistSessionItems(
      nextItems,
      nextItems.length === 0 ? "COMPLETED" : undefined
    );
    toast({ type: "info", title: "Item removed from scanned purchase" });
  };

  const handleAssignExistingMatch = (med: PharmacyMedicineItem) => {
    if (!matchTargetItemId || !session) return;
    const target = session.items.find((i) => i.itemId === matchTargetItemId);
    if (!target) return;

    // Dynamically adjust drafted sheets/units to match the chosen existing medicine's packaging!
    let nextSheets = target.sheetsCount ?? 0;
    let nextUnits = target.unitsCount ?? 0;
    if (med.packagingType === "INDIVIDUAL") {
      nextUnits = nextUnits > 0 ? nextUnits : Math.max(1, nextSheets);
      nextSheets = 0;
    } else if (nextSheets === 0 && nextUnits > 0 && med.unitsPerSheet > 1) {
      // Auto-calculate relevant sheets & loose units if units were drafted on a SHEET item
      nextSheets = Math.floor(nextUnits / med.unitsPerSheet);
      nextUnits = nextUnits % med.unitsPerSheet;
    }

    updateLocalItem(
      matchTargetItemId,
      {
        matchedMedicineId: med.id,
        matchedMedicineName: med.name,
        matchConfidence: 1,
        sheetsCount: nextSheets,
        unitsCount: nextUnits,
      },
      true
    );
    setMatchTargetItemId(null);
    setMatchSearch("");
    toast({
      type: "success",
      title: "Matched Medicine",
      message: `Mapped to "${med.name}".`,
    });
  };

  const handleAddMatchedStock = async (
    item: BillScanItem,
    explicitMed?: PharmacyMedicineItem
  ) => {
    if (!session) return;
    const targetMed =
      explicitMed ?? medicines.find((m) => m.id === item.matchedMedicineId);
    if (!targetMed) {
      toast({
        type: "warning",
        title: "Select Matching Medicine First",
        message: "Use 'Match to Existing Medicine' or 'Create New Medicine Profile'.",
      });
      return;
    }
    if (!item.batchNumber.trim()) {
      toast({
        type: "warning",
        title: "Batch Number Required",
        message: "Enter the batch number for this item before adding.",
      });
      return;
    }

    const isInd = targetMed.packagingType === "INDIVIDUAL";
    const sh = isInd ? 0 : Math.max(0, item.sheetsCount ?? 0);
    const su = isInd
      ? Math.max(0, (item.unitsCount ?? 0) > 0 ? (item.unitsCount ?? 0) : item.sheetsCount ?? 0)
      : Math.max(0, item.unitsCount ?? 0);

    if (sh === 0 && su === 0) {
      toast({
        type: "warning",
        title: "Enter Quantity",
        message: "Enter sheet or unit quantity greater than 0.",
      });
      return;
    }

    setSavingId(item.itemId);
    try {
      const res = await fetch("/api/pharmacy-mgmt/medicines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          medicineId: targetMed.id,
          name: targetMed.name,
          packagingType: targetMed.packagingType,
          unitsPerSheet: targetMed.unitsPerSheet,
          minStock: targetMed.minStock,
          unitSellingPrice: targetMed.unitSellingPrice,
          sheetSellingPrice: targetMed.sheetSellingPrice,
          hsnCode: targetMed.hsnCode,
          gstPercent: targetMed.gstPercent,
          prescriptionRequired: targetMed.prescriptionRequired,
          placement: targetMed.placement,
          sheetsCount: sh,
          singleUnitsCount: su,
          batchNumber: item.batchNumber.trim(),
          expiryMonth: item.expiryMonth,
          expiryYear: item.expiryYear,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast({
          type: "error",
          title: "Add Stock Failed",
          message: d.error || "Could not add stock batch.",
        });
        return;
      }

      const nextItems = session.items.map((it) =>
        it.itemId === item.itemId
          ? {
              ...it,
              matchedMedicineId: targetMed.id,
              matchedMedicineName: targetMed.name,
              status: "ADDED" as const,
              addedMedicineId: targetMed.id,
              addedMedicineName: targetMed.name,
            }
          : it
      );
      await persistSessionItems(nextItems);
      await onInventoryMutated();
      toast({
        type: "success",
        title: "Stock Added",
        message: `${targetMed.name} · Batch ${item.batchNumber} (+${d.totalUnitsAdded} units)`,
      });
    } finally {
      setSavingId(null);
    }
  };

  const openCreateNewModal = (item: BillScanItem) => {
    // Check exact letter-by-letter match first! Never allow creating a duplicate profile if exact name exists.
    const exactMatch = findExactMedicineByName(item.rawName);
    if (exactMatch) {
      setDuplicateAlert({ item, existingMed: exactMatch });
      return;
    }

    const aiGuess: PackagingType =
      item.packagingGuess === "INDIVIDUAL" ? "INDIVIDUAL" : "SHEET";

    setCreateForItem(item);
    setNewName(item.rawName);
    setNewPlacement("");
    setNewPackaging(aiGuess);
    setNewUnitsPerSheet(aiGuess === "INDIVIDUAL" ? "1" : "0");
    setNewMinStock("25");
    // Selling price ALWAYS defaults to 0 — never pre-filled from purchase bill!
    setNewUnitPrice("0");
    setNewSheetPrice("0");
    setNewHsn(item.hsnCode ?? "");
    setNewGst(item.gstPercent !== null ? String(item.gstPercent) : "0");
    setNewRx(true);
    if (aiGuess === "INDIVIDUAL") {
      setNewSheets("0");
      setNewSingleUnits(
        String(
          (item.unitsCount ?? 0) > 0
            ? item.unitsCount
            : Math.max(1, item.sheetsCount || 1)
        )
      );
    } else {
      setNewSheets(String(Math.max(0, item.sheetsCount ?? 0)));
      setNewSingleUnits(String(Math.max(0, item.unitsCount ?? 0)));
    }
    setNewBatch(item.batchNumber);
    setNewExpMonth(String(item.expiryMonth).padStart(2, "0"));
    setNewExpYear(String(item.expiryYear));
  };

  const handleCreateNewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForItem || !session) return;

    // Also guard if the user typed/edited the name inside the modal to an already-existing exact medicine name!
    const exactMatch = findExactMedicineByName(newName);
    if (exactMatch) {
      const updatedDraft: BillScanItem = {
        ...createForItem,
        rawName: newName.trim(),
        batchNumber: newBatch.trim(),
        sheetsCount: Math.max(0, Number.parseInt(newSheets, 10) || 0),
        unitsCount: Math.max(0, Number.parseInt(newSingleUnits, 10) || 0),
        expiryMonth: Number.parseInt(newExpMonth, 10) || createForItem.expiryMonth,
        expiryYear: Number.parseInt(newExpYear, 10) || createForItem.expiryYear,
      };
      setCreateForItem(null);
      setDuplicateAlert({ item: updatedDraft, existingMed: exactMatch });
      return;
    }

    const isInd = newPackaging === "INDIVIDUAL";
    const ups = isInd ? 1 : Number.parseInt(newUnitsPerSheet, 10);
    if (!isInd && (!Number.isInteger(ups) || ups < 1)) {
      toast({
        type: "warning",
        title: "Units per Sheet Required",
        message: "Enter a whole number greater than 0 for Units per Sheet.",
      });
      return;
    }

    const em = Number.parseInt(newExpMonth, 10);
    const ey = Number.parseInt(newExpYear, 10);
    if (!Number.isInteger(em) || em < 1 || em > 12 || !Number.isInteger(ey) || ey < 2000) {
      toast({
        type: "warning",
        title: "Invalid Expiry Date",
        message: "Enter a valid expiry month (01–12) and 4-digit year.",
      });
      return;
    }

    const uPrice = Number(newUnitPrice || 0);
    const sPrice = isInd ? uPrice : Number(newSheetPrice || 0);
    if (!Number.isFinite(uPrice) || uPrice < 0) {
      toast({
        type: "warning",
        title: "Invalid Selling Price",
        message: "Enter a valid non-negative selling price.",
      });
      return;
    }

    setCreatingProfile(true);
    try {
      const res = await fetch("/api/pharmacy-mgmt/medicines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          packagingType: newPackaging,
          unitsPerSheet: ups,
          minStock: Math.max(0, Number.parseInt(newMinStock, 10) || 0),
          unitSellingPrice: round2(uPrice),
          sheetSellingPrice: round2(Number.isFinite(sPrice) ? sPrice : uPrice * ups),
          hsnCode: newHsn.trim() || null,
          gstPercent: Number(newGst) || 0,
          prescriptionRequired: newRx,
          placement: newPlacement.trim() || null,
          sheetsCount: isInd ? 0 : Math.max(0, Number.parseInt(newSheets, 10) || 0),
          singleUnitsCount: Math.max(0, Number.parseInt(newSingleUnits, 10) || 0),
          batchNumber: newBatch.trim(),
          expiryMonth: em,
          expiryYear: ey,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast({
          type: "error",
          title: "Creation Failed",
          message: d.error || "Unable to create medicine profile.",
        });
        return;
      }

      const nextItems = session.items.map((it) =>
        it.itemId === createForItem.itemId
          ? {
              ...it,
              rawName: newName.trim(),
              batchNumber: newBatch.trim(),
              packagingGuess: newPackaging,
              sheetsCount: isInd ? 0 : Math.max(0, Number.parseInt(newSheets, 10) || 0),
              unitsCount: Math.max(0, Number.parseInt(newSingleUnits, 10) || 0),
              expiryMonth: em,
              expiryYear: ey,
              status: "ADDED" as const,
              matchedMedicineId: d.medicine.id,
              matchedMedicineName: d.medicine.name,
              addedMedicineId: d.medicine.id,
              addedMedicineName: d.medicine.name,
            }
          : it
      );
      await persistSessionItems(nextItems);
      await onInventoryMutated();
      setCreateForItem(null);
      toast({
        type: "success",
        title: "New Medicine Created & Stock Added",
        message: `${d.medicine.name} · Batch ${d.batch.batchNumber} (+${d.totalUnitsAdded} units)`,
      });
    } finally {
      setCreatingProfile(false);
    }
  };

  const handleConfirmDiscard = async () => {
    if (!session) return;
    setDiscarding(true);
    try {
      await fetch(`/api/pharmacy-mgmt/bill-scans/${session.id}`, {
        method: "DELETE",
      });
      onSessionChange(null);
      setDiscardConfirmOpen(false);
      toast({ type: "info", title: "Scanned purchase session discarded" });
    } finally {
      setDiscarding(false);
    }
  };

  const filteredCatalog = useMemo(() => {
    const q = matchSearch.trim().toLowerCase();
    if (!q) return medicines.slice(0, 25);
    return medicines
      .filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          (m.placement ?? "").toLowerCase().includes(q)
      )
      .slice(0, 25);
  }, [medicines, matchSearch]);

  const newIsInd = newPackaging === "INDIVIDUAL";
  const newUpsNum = newIsInd
    ? 1
    : Math.max(0, Number.parseInt(newUnitsPerSheet, 10) || 0);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    void onUploadBillFile(file);
  };

  // Uploading / Analyzing state
  if (uploadingBill) {
    return (
      <SpringCard className="p-8 text-center space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#dff4e8] text-[#0d4a38]">
          <Loader2 className="h-7 w-7 animate-spin" />
        </div>
        <div>
          <h3 className="font-display text-lg font-extrabold text-[#0f241d]">
            Analyzing Purchase Bill with Gemini 3.8 Flash...
          </h3>
          <p className="mt-1 text-xs text-[#466356]">
            Extracting medicine names, batch numbers, sheet/unit quantities & expiry dates. You can switch sections freely — processing continues in the background.
          </p>
        </div>
      </SpringCard>
    );
  }

  // Empty state when no active scanned session exists
  if (!session) {
    return (
      <SpringCard className="p-6">
        <input
          ref={uploadInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={handleFileInputChange}
          className="hidden"
        />
        <EmptyState
          icon={<FileScan className="h-6 w-6" />}
          title="No Active Scanned Purchase Session"
          description="Upload a supplier purchase bill (JPG, PNG, WEBP, or PDF) to smartly extract medicines, batches, quantities, and expiry dates."
          action={
            <BubblyButton
              disabled={billQuota !== null && billQuota.remaining <= 0}
              onClick={() => uploadInputRef.current?.click()}
            >
              <Upload className="h-4 w-4" />
              Upload Bill
              {billQuota ? (
                <span className="ml-1 rounded-full bg-white/20 px-2 py-0.5 font-mono-id text-[10px]">
                  {billQuota.remaining}/{billQuota.limit} left this month
                </span>
              ) : null}
            </BubblyButton>
          }
        />
      </SpringCard>
    );
  }

  const addedCount = session.items.filter((i) => i.status === "ADDED").length;
  const totalCount = session.items.length;
  const allCompleted = totalCount > 0 && addedCount === totalCount;

  return (
    <SpringCard className="p-5 border-2 border-emerald-400/80 bg-gradient-to-b from-[#f2fbf6] to-white space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d6e9de] pb-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0d4a38] to-[#059669] text-white shadow-sm">
            <FileScan className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-base font-extrabold text-[#0f241d]">
                Review Scanned Purchase
              </h3>
              <span className="rounded-full bg-[#dff4e8] px-2.5 py-0.5 font-mono-id text-[11px] font-bold text-[#0d4a38]">
                {addedCount} / {totalCount} Added
              </span>
              {billQuota ? (
                <span className="rounded-full border border-[#cfe2d6] bg-white px-2.5 py-0.5 font-mono-id text-[10px] font-semibold text-[#466356]">
                  {billQuota.remaining}/{billQuota.limit} scans left this month
                </span>
              ) : null}
            </div>
            <p className="text-[11px] text-[#466356]">
              File: <strong>{session.fileName}</strong> · Saved automatically until all items are completed.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {allCompleted ? (
            <BubblyButton
              type="button"
              onClick={() => onSessionChange(null)}
              className="px-4 py-2 text-xs"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Finish & Close
            </BubblyButton>
          ) : (
            <BubblyButton
              type="button"
              variant="outline"
              onClick={() => setDiscardConfirmOpen(true)}
              className="px-3 py-1.5 text-xs text-rose-700 border-rose-200 hover:bg-rose-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Discard Session
            </BubblyButton>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-[#e3f2e9]">
        <motion.div
          animate={{
            width: `${totalCount > 0 ? Math.round((addedCount / totalCount) * 100) : 0}%`,
          }}
          transition={{ duration: 0.2 }}
          className="h-full rounded-full bg-gradient-to-r from-[#0d4a38] to-[#10b981]"
        />
      </div>

      {/* Extracted Items List */}
      <div className="space-y-3">
        {session.items.map((item) => {
          const isAdded = item.status === "ADDED";
          const matchedMed = item.matchedMedicineId
            ? medicines.find((m) => m.id === item.matchedMedicineId) ?? null
            : null;
          const exactNameExists = findExactMedicineByName(item.rawName);
          const effectiveMatchedMed = matchedMed;
          const matchedIsIndividual =
            effectiveMatchedMed?.packagingType === "INDIVIDUAL";

          const sheetQtyVal = matchedIsIndividual ? 0 : (item.sheetsCount ?? 0);
          const unitQtyVal = item.unitsCount ?? 0;

          // Only show computed total units AFTER matching to an existing medicine!
          const matchedTotalUnits = effectiveMatchedMed
            ? matchedIsIndividual
              ? unitQtyVal
              : sheetQtyVal * Math.max(1, effectiveMatchedMed.unitsPerSheet) + unitQtyVal
            : null;

          return (
            <div
              key={item.itemId}
              className={`relative rounded-2xl border p-4 transition-all ${
                isAdded
                  ? "border-emerald-300 bg-emerald-50/60 opacity-85"
                  : "border-[#cfe2d6] bg-white shadow-xs"
              }`}
            >
              {/* Top-Right Corner Delete Button for every scanned item */}
              {!isAdded ? (
                <button
                  type="button"
                  title="Remove this medicine from scanned list"
                  onClick={() => void handleRemoveScannedItem(item.itemId)}
                  className="absolute right-3 top-3 rounded-lg p-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-700 transition-colors cursor-pointer"
                  aria-label="Delete scanned medicine item"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}

              <div className="grid gap-3 md:grid-cols-12 items-end pr-7">
                <div className="md:col-span-3">
                  <label className="mb-1 flex items-center gap-1 text-[11px] font-bold text-[#314c40]">
                    <Pill className="h-3 w-3 text-emerald-700" />
                    Bill Medicine Name
                  </label>
                  <input
                    disabled={isAdded}
                    value={item.rawName}
                    onChange={(e) =>
                      updateLocalItem(item.itemId, { rawName: e.target.value })
                    }
                    onBlur={() => void persistSessionItems(session.items)}
                    className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3 py-2 text-xs font-bold text-[#0f241d] disabled:bg-[#f2f7f4]"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-1 flex items-center gap-1 text-[11px] font-bold text-[#314c40]">
                    <Barcode className="h-3 w-3 text-emerald-700" />
                    Batch Number
                  </label>
                  <input
                    disabled={isAdded}
                    value={item.batchNumber}
                    onChange={(e) =>
                      updateLocalItem(item.itemId, { batchNumber: e.target.value })
                    }
                    onBlur={() => void persistSessionItems(session.items)}
                    className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3 py-2 text-xs font-mono-id font-semibold text-[#0f241d] disabled:bg-[#f2f7f4]"
                  />
                </div>

                <div className={`md:col-span-2 ${matchedIsIndividual ? "opacity-45" : ""}`}>
                  <label className="mb-1 flex items-center gap-1 text-[11px] font-bold text-[#314c40]">
                    <Layers className="h-3 w-3 text-emerald-700" />
                    Sheet Qty
                  </label>
                  <input
                    type="number"
                    min={0}
                    disabled={isAdded || matchedIsIndividual}
                    value={sheetQtyVal}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) =>
                      updateLocalItem(item.itemId, {
                        sheetsCount: Math.max(0, Number.parseInt(e.target.value, 10) || 0),
                      })
                    }
                    onBlur={() => void persistSessionItems(session.items)}
                    className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3 py-2 text-xs font-mono-id font-bold text-[#0f241d] disabled:bg-[#f2f7f4] disabled:cursor-not-allowed"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-1 flex items-center gap-1 text-[11px] font-bold text-[#314c40]">
                    <Package className="h-3 w-3 text-emerald-700" />
                    Unit Qty
                  </label>
                  <input
                    type="number"
                    min={0}
                    disabled={isAdded}
                    value={unitQtyVal}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) =>
                      updateLocalItem(item.itemId, {
                        unitsCount: Math.max(0, Number.parseInt(e.target.value, 10) || 0),
                      })
                    }
                    onBlur={() => void persistSessionItems(session.items)}
                    className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3 py-2 text-xs font-mono-id font-bold text-[#0f241d] disabled:bg-[#f2f7f4]"
                  />
                </div>

                <div className="md:col-span-3">
                  <label className="mb-1 flex items-center gap-1 text-[11px] font-bold text-[#314c40]">
                    <Calendar className="h-3 w-3 text-emerald-700" />
                    Expiry (MM / YYYY)
                  </label>
                  <ExpiryMonthYearInput
                    compact
                    disabled={isAdded}
                    month={String(item.expiryMonth).padStart(2, "0")}
                    year={String(item.expiryYear)}
                    onChange={({ month, year }) => {
                      const em = Number.parseInt(month, 10);
                      const ey = Number.parseInt(year, 10);
                      if (
                        Number.isInteger(em) &&
                        em >= 1 &&
                        em <= 12 &&
                        Number.isInteger(ey) &&
                        ey >= 2000 &&
                        ey <= 2150
                      ) {
                        updateLocalItem(
                          item.itemId,
                          { expiryMonth: em, expiryYear: ey },
                          true
                        );
                      }
                    }}
                  />
                </div>
              </div>

              {/* Match Status & Dual Action Row */}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#ebf4ee] pt-3">
                {isAdded ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" />
                    Added to inventory → {item.addedMedicineName || item.rawName}
                  </span>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {effectiveMatchedMed ? (
                        <>
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 font-semibold text-[#0d4a38]">
                            <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                            Matched: <strong>{effectiveMatchedMed.name}</strong> (
                            {effectiveMatchedMed.packagingType === "SHEET"
                              ? `${effectiveMatchedMed.unitsPerSheet}u/sh`
                              : "Individual"}
                            )
                          </span>
                          {matchedTotalUnits !== null ? (
                            <span className="rounded-full bg-[#0d4a38] px-2.5 py-1 font-mono-id text-[11px] font-bold text-white">
                              Total: +{matchedTotalUnits} units
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 font-semibold text-amber-800">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          AI Draft ({item.packagingGuess === "INDIVIDUAL" ? "Individual" : "Sheets"}) — match or create profile
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <BubblyButton
                        type="button"
                        variant="outline"
                        className="px-3 py-1.5 text-xs"
                        onClick={() => {
                          setMatchTargetItemId(item.itemId);
                          setMatchSearch("");
                        }}
                      >
                        <Link2 className="h-3.5 w-3.5" />
                        Match to Existing Medicine
                      </BubblyButton>

                      {effectiveMatchedMed ? (
                        <BubblyButton
                          type="button"
                          disabled={savingId === item.itemId}
                          onClick={() => void handleAddMatchedStock(item)}
                          className="px-3.5 py-1.5 text-xs"
                        >
                          <PlusCircle className="h-3.5 w-3.5" />
                          {savingId === item.itemId ? "Adding..." : "Add Stock"}
                        </BubblyButton>
                      ) : null}

                      {!exactNameExists ? (
                        <BubblyButton
                          type="button"
                          variant="secondary"
                          className="px-3 py-1.5 text-xs"
                          onClick={() => openCreateNewModal(item)}
                        >
                          <PlusCircle className="h-3.5 w-3.5" />
                          Create New Medicine Profile
                        </BubblyButton>
                      ) : (
                        <BubblyButton
                          type="button"
                          variant="secondary"
                          className="px-3 py-1.5 text-xs"
                          onClick={() =>
                            setDuplicateAlert({ item, existingMed: exactNameExists })
                          }
                        >
                          <PlusCircle className="h-3.5 w-3.5" />
                          Create New Medicine Profile
                        </BubblyButton>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Discard Session Confirmation Modal */}
      <AnimatedModal
        open={discardConfirmOpen}
        onClose={() => setDiscardConfirmOpen(false)}
        title="Discard Scanned Purchase Session?"
        subtitle={session.fileName}
      >
        <div className="space-y-4 text-xs">
          <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 text-rose-900 space-y-1">
            <p className="font-bold">
              Are you sure you want to discard this scanned bill session?
            </p>
            <p>
              Items already added to stock remain safely saved in your inventory, while any remaining unadded draft items will be cleared.
            </p>
          </div>
          <div className="flex justify-end gap-3">
            <BubblyButton
              variant="outline"
              onClick={() => setDiscardConfirmOpen(false)}
            >
              Cancel
            </BubblyButton>
            <BubblyButton
              variant="danger"
              disabled={discarding}
              onClick={handleConfirmDiscard}
            >
              <Trash2 className="h-4 w-4" />
              {discarding ? "Discarding..." : "Yes, Discard Session"}
            </BubblyButton>
          </div>
        </div>
      </AnimatedModal>

      {/* Exact Duplicate Name Guard Pop-up */}
      <AnimatedModal
        open={Boolean(duplicateAlert)}
        onClose={() => setDuplicateAlert(null)}
        title="Medicine Already Exists in Stock"
        subtitle={duplicateAlert?.existingMed.name}
      >
        {duplicateAlert ? (
          <div className="space-y-4 text-xs">
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 space-y-1">
              <p className="font-bold">
                &ldquo;{duplicateAlert.existingMed.name}&rdquo; already exists in your stock.
              </p>
              <p>
                Creating a duplicate profile is not allowed. Do you want to add this quantity directly to{" "}
                <strong>{duplicateAlert.existingMed.name}</strong> instead?
              </p>
            </div>
            <div className="flex justify-end gap-3">
              <BubblyButton
                variant="outline"
                onClick={() => setDuplicateAlert(null)}
              >
                Cancel
              </BubblyButton>
              <BubblyButton
                disabled={savingId === duplicateAlert.item.itemId}
                onClick={async () => {
                  const { item, existingMed } = duplicateAlert;
                  setDuplicateAlert(null);
                  await handleAddMatchedStock(item, existingMed);
                }}
              >
                <PlusCircle className="h-4 w-4" />
                Add Stock to Existing
              </BubblyButton>
            </div>
          </div>
        ) : null}
      </AnimatedModal>

      {/* Match to Existing Medicine Search Modal */}
      <AnimatedModal
        open={Boolean(matchTargetItemId)}
        onClose={() => setMatchTargetItemId(null)}
        title="Match to Existing Medicine"
        subtitle="Search your existing pharmacy inventory and link this scanned bill item."
      >
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6c877a]" />
            <input
              autoFocus
              value={matchSearch}
              onChange={(e) => setMatchSearch(e.target.value)}
              placeholder="Search existing medicine name..."
              className="w-full rounded-xl border border-[#cfe2d6] bg-white py-2.5 pl-10 pr-3.5 text-sm"
            />
          </div>

          <div className="max-h-72 overflow-y-auto rounded-xl border border-[#dcece2] divide-y divide-[#ebf4ee]">
            {filteredCatalog.length === 0 ? (
              <p className="p-4 text-center text-xs text-[#5b796b]">
                No existing medicine matched your search.
              </p>
            ) : (
              filteredCatalog.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleAssignExistingMatch(m)}
                  className="flex w-full items-center justify-between px-4 py-2.5 text-left text-xs hover:bg-[#dff4e8] transition-colors cursor-pointer"
                >
                  <div>
                    <p className="font-bold text-[#0f241d]">{m.name}</p>
                    <p className="text-[11px] text-[#5b796b]">
                      {m.packagingType === "SHEET"
                        ? `Sheets (${m.unitsPerSheet}/sh)`
                        : "Individual"}{" "}
                      · ₹{m.unitSellingPrice.toFixed(2)}/unit
                    </p>
                  </div>
                  <span className="font-semibold text-[#0d4a38]">Select →</span>
                </button>
              ))
            )}
          </div>
        </div>
      </AnimatedModal>

      {/* Create New Medicine Profile Pop-up (Selling Price defaults to 0 — never purchase price!) */}
      <AnimatedModal
        open={Boolean(createForItem)}
        onClose={() => setCreateForItem(null)}
        title="Create New Medicine Profile"
        subtitle="Selling price defaults to ₹0 — enter your selling price, units per sheet & placement."
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleCreateNewSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="mb-1 flex items-center gap-1.5 text-xs font-bold text-[#0f241d]">
                <Pill className="h-3.5 w-3.5 text-emerald-700" />
                Medicine Name *
              </label>
              <input
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full rounded-xl border border-[#cfe2d6] px-3 py-2 text-sm font-semibold"
              />
            </div>
            <div>
              <label className="mb-1 flex items-center gap-1.5 text-xs font-bold text-[#0f241d]">
                <MapPin className="h-3.5 w-3.5 text-emerald-700" />
                Placement
              </label>
              <input
                value={newPlacement}
                onChange={(e) => setNewPlacement(e.target.value)}
                className="w-full rounded-xl border border-[#cfe2d6] px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 flex items-center gap-1.5 text-xs font-bold text-[#0f241d]">
                <Layers className="h-3.5 w-3.5 text-emerald-700" />
                Packaging Type
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setNewPackaging("SHEET");
                    if (newUnitsPerSheet === "1") setNewUnitsPerSheet("0");
                  }}
                  className={`flex items-center justify-center gap-1.5 rounded-xl border-2 px-3 py-2 text-xs font-bold cursor-pointer ${
                    newPackaging === "SHEET"
                      ? "border-emerald-600 bg-[#dff4e8] text-[#0d4a38]"
                      : "border-[#dcece2] bg-[#f8fbf9] text-[#7b9689] opacity-65"
                  }`}
                >
                  <Layers className="h-3.5 w-3.5" />
                  Sheets
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNewPackaging("INDIVIDUAL");
                    setNewUnitsPerSheet("1");
                    setNewSheetPrice(newUnitPrice);
                    // Individual items take units only — move drafted sheet qty into single units if needed
                    const curU = Number.parseInt(newSingleUnits, 10) || 0;
                    const curS = Number.parseInt(newSheets, 10) || 0;
                    if (curU === 0 && curS > 0) {
                      setNewSingleUnits(String(curS));
                    }
                    setNewSheets("0");
                  }}
                  className={`flex items-center justify-center gap-1.5 rounded-xl border-2 px-3 py-2 text-xs font-bold cursor-pointer ${
                    newPackaging === "INDIVIDUAL"
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
                {newRx ? (
                  <ShieldAlert className="h-3.5 w-3.5 text-rose-600" />
                ) : (
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                )}
                Prescription Required
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setNewRx(false)}
                  className={`flex items-center justify-center gap-1.5 rounded-xl border-2 px-3 py-2 text-xs font-bold cursor-pointer ${
                    !newRx
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-[#dcece2] bg-white text-[#5b796b]"
                  }`}
                >
                  No
                </button>
                <button
                  type="button"
                  onClick={() => setNewRx(true)}
                  className={`flex items-center justify-center gap-1.5 rounded-xl border-2 px-3 py-2 text-xs font-bold cursor-pointer ${
                    newRx
                      ? "border-rose-600 bg-rose-600 text-white"
                      : "border-[#dcece2] bg-white text-[#5b796b]"
                  }`}
                >
                  Yes
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <div className={newIsInd ? "opacity-50" : ""}>
              <label className="mb-1 flex items-center gap-1 text-xs font-bold text-[#0f241d]">
                <Grid2X2 className="h-3.5 w-3.5 text-emerald-700" />
                Units / Sheet *
              </label>
              <input
                type="number"
                min={newIsInd ? 1 : 0}
                disabled={newIsInd}
                value={newIsInd ? "1" : newUnitsPerSheet}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => {
                  const val = e.target.value;
                  setNewUnitsPerSheet(val);
                  const ups = Number.parseInt(val, 10);
                  if (Number.isInteger(ups) && ups > 0) {
                    const u = Number(newUnitPrice);
                    if (newUnitPrice !== "" && Number.isFinite(u) && u >= 0) {
                      setNewSheetPrice(String(round2(u * ups)));
                    }
                  }
                }}
                className="w-full rounded-xl border border-[#cfe2d6] px-3 py-2 text-sm font-mono-id font-semibold disabled:bg-[#f2f6f4]"
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
                value={newMinStock}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setNewMinStock(e.target.value)}
                className="w-full rounded-xl border border-[#cfe2d6] px-3 py-2 text-sm font-mono-id font-semibold"
              />
            </div>

            <div>
              <label className="mb-1 flex items-center gap-1 text-xs font-bold text-[#0f241d]">
                <IndianRupee className="h-3.5 w-3.5 text-emerald-700" />
                Unit Price (₹) *
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                required
                value={newUnitPrice}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => {
                  const v = e.target.value;
                  setNewUnitPrice(v);
                  const n = Number(v);
                  if (v !== "" && Number.isFinite(n) && n >= 0 && newUpsNum > 0) {
                    setNewSheetPrice(String(round2(n * newUpsNum)));
                  }
                }}
                className="w-full rounded-xl border border-[#cfe2d6] px-3 py-2 text-sm font-mono-id font-semibold"
              />
            </div>

            <div className={newIsInd ? "opacity-50" : ""}>
              <label className="mb-1 flex items-center gap-1 text-xs font-bold text-[#0f241d]">
                <Tag className="h-3.5 w-3.5 text-emerald-700" />
                Sheet Price (₹)
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                disabled={newIsInd}
                value={newIsInd ? newUnitPrice : newSheetPrice}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => {
                  const v = e.target.value;
                  setNewSheetPrice(v);
                  const n = Number(v);
                  if (v !== "" && Number.isFinite(n) && n >= 0 && newUpsNum > 0) {
                    setNewUnitPrice(String(round2(n / newUpsNum)));
                  }
                }}
                className="w-full rounded-xl border border-[#cfe2d6] px-3 py-2 text-sm font-mono-id font-semibold disabled:bg-[#f2f6f4]"
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
                value={newHsn}
                onChange={(e) => setNewHsn(e.target.value)}
                className="w-full rounded-xl border border-[#cfe2d6] px-3 py-2 text-sm font-mono-id"
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
                value={newGst}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setNewGst(e.target.value)}
                className="w-full rounded-xl border border-[#cfe2d6] px-3 py-2 text-sm font-mono-id font-semibold"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-4 rounded-xl border border-[#dcece2] bg-[#f7fbf9] p-3">
            {!newIsInd ? (
              <div>
                <label className="mb-1 block text-[11px] font-bold text-[#314c40]">
                  Sheets
                </label>
                <input
                  type="number"
                  min={0}
                  value={newSheets}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => setNewSheets(e.target.value)}
                  className="w-full rounded-lg border border-[#cfe2d6] bg-white px-2.5 py-1.5 text-xs font-mono-id font-semibold"
                />
              </div>
            ) : null}
            <div className={newIsInd ? "sm:col-span-2" : ""}>
              <label className="mb-1 block text-[11px] font-bold text-[#314c40]">
                {newIsInd ? "Units (Individual)" : "Single Units"}
              </label>
              <input
                type="number"
                min={0}
                value={newSingleUnits}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setNewSingleUnits(e.target.value)}
                className="w-full rounded-lg border border-[#cfe2d6] bg-white px-2.5 py-1.5 text-xs font-mono-id font-semibold"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-bold text-[#314c40]">
                Batch No *
              </label>
              <input
                required
                value={newBatch}
                onChange={(e) => setNewBatch(e.target.value)}
                className="w-full rounded-lg border border-[#cfe2d6] bg-white px-2.5 py-1.5 text-xs font-mono-id font-semibold"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-bold text-[#314c40]">
                Expiry *
              </label>
              <ExpiryMonthYearInput
                compact
                month={newExpMonth}
                year={newExpYear}
                onChange={({ month, year }) => {
                  setNewExpMonth(month);
                  setNewExpYear(year);
                }}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <BubblyButton variant="outline" onClick={() => setCreateForItem(null)}>
              Cancel
            </BubblyButton>
            <BubblyButton type="submit" disabled={creatingProfile}>
              {creatingProfile ? "Creating..." : "Create & Add Stock"}
            </BubblyButton>
          </div>
        </form>
      </AnimatedModal>
    </SpringCard>
  );
}
