"use client";

import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  ClipboardPlus,
  Pill,
  RefreshCw,
  ShoppingCart,
  Stethoscope,
  UserRound,
  XCircle,
} from "lucide-react";
import {
  AnimatedModal,
  BubblyButton,
  EmptyState,
  StatusBadge,
} from "@/components/ui/MotionPrimitives";
import { useToast } from "@/components/providers/AppProviders";
import { formatAccurateDateTime } from "@/lib/datetime";
import type {
  CartItem,
  DoctorPrescriptionItemRecord,
  DoctorPrescriptionRecord,
  PharmacyBatchItem,
  PharmacyMedicineItem,
} from "./types";

interface ShortagePromptState {
  prescription: DoctorPrescriptionRecord;
  medicine: PharmacyMedicineItem;
  item: DoctorPrescriptionItemRecord;
  requestedUnits: number;
  availableUnits: number;
  remainingItems: DoctorPrescriptionItemRecord[];
  alreadyPreparedCartItems: CartItem[];
  skippedNames: string[];
}

function findMatchingMedicine(
  item: DoctorPrescriptionItemRecord,
  medicines: PharmacyMedicineItem[]
): PharmacyMedicineItem | null {
  if (item.pharmacyMedicineId) {
    const byId = medicines.find((m) => m.id === item.pharmacyMedicineId);
    if (byId) return byId;
  }
  const needle = item.medicineNameSnapshot.trim().toLowerCase();
  return medicines.find((m) => m.name.trim().toLowerCase() === needle) ?? null;
}

function getSortedValidBatches(med: PharmacyMedicineItem): PharmacyBatchItem[] {
  return [...med.batches]
    .filter((b) => !b.isExpired && b.quantityUnits > 0)
    .sort((a, b) =>
      a.expiryYear !== b.expiryYear
        ? a.expiryYear - b.expiryYear
        : a.expiryMonth !== b.expiryMonth
          ? a.expiryMonth - b.expiryMonth
          : a.batchNumber.localeCompare(b.batchNumber)
    );
}

function allocateFefoCartItems(
  med: PharmacyMedicineItem,
  unitsToAllocate: number,
  reservedByBatch: Map<string, number>
): { items: CartItem[]; allocated: number } {
  const validBatches = getSortedValidBatches(med);
  const created: CartItem[] = [];
  let remaining = unitsToAllocate;

  for (const batch of validBatches) {
    if (remaining <= 0) break;
    const alreadyReserved = reservedByBatch.get(batch.id) ?? 0;
    const freeUnits = Math.max(0, batch.quantityUnits - alreadyReserved);
    if (freeUnits <= 0) continue;

    const take = Math.min(remaining, freeUnits);
    reservedByBatch.set(batch.id, alreadyReserved + take);
    remaining -= take;

    created.push({
      key: `${med.id}::${batch.id}::UNIT`,
      medicineId: med.id,
      medicineName: med.name,
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      expiryLabel: batch.expiryLabel,
      hsnCode: med.hsnCode,
      placement: med.placement,
      prescriptionRequired: med.prescriptionRequired,
      packagingType: med.packagingType,
      unitsPerSheet: med.unitsPerSheet,
      sellMode: "UNIT",
      quantity: take,
      unitSellingPrice: med.unitSellingPrice,
      sheetSellingPrice: med.sheetSellingPrice,
      gstPercent: med.gstPercent,
      maxBatchUnits: batch.quantityUnits,
    });
  }

  return { items: created, allocated: unitsToAllocate - remaining };
}

export function PharmacyPrescriptionsButton({
  prescriptions,
  pendingCount,
  medicines,
  getCartBatchUsage,
  onRefresh,
  onAddPrescriptionItemsToCart,
}: {
  prescriptions: DoctorPrescriptionRecord[];
  pendingCount: number;
  medicines: PharmacyMedicineItem[];
  getCartBatchUsage: () => Map<string, number>;
  onRefresh: () => Promise<void> | void;
  onAddPrescriptionItemsToCart: (payload: {
    prescription: DoctorPrescriptionRecord;
    items: CartItem[];
  }) => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [selectedPrescriptionId, setSelectedPrescriptionId] = useState<string | null>(
    null
  );
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [shortagePrompt, setShortagePrompt] = useState<ShortagePromptState | null>(
    null
  );

  const selectedPrescription = useMemo(() => {
    if (prescriptions.length === 0) return null;
    if (selectedPrescriptionId) {
      const found = prescriptions.find((p) => p.id === selectedPrescriptionId);
      if (found) return found;
    }
    return prescriptions[0] ?? null;
  }, [prescriptions, selectedPrescriptionId]);

  const computeAvailableUnitsForMedicine = (
    med: PharmacyMedicineItem | null,
    extraReserved?: Map<string, number>
  ) => {
    if (!med) return 0;
    const baseUsage = getCartBatchUsage();
    return getSortedValidBatches(med).reduce((sum, b) => {
      const used = (baseUsage.get(b.id) ?? 0) + (extraReserved?.get(b.id) ?? 0);
      return sum + Math.max(0, b.quantityUnits - used);
    }, 0);
  };

  const finalizeCartBatchAdd = (
    prescription: DoctorPrescriptionRecord,
    preparedCartItems: CartItem[],
    skippedNames: string[]
  ) => {
    if (preparedCartItems.length > 0) {
      onAddPrescriptionItemsToCart({
        prescription,
        items: preparedCartItems,
      });
      setOpen(false);
      toast({
        type: "success",
        title: "Prescription Added to Cart",
        message: `Added ${preparedCartItems.length} earliest-expiry batch line(s) for ${prescription.patientNameSnapshot}.${skippedNames.length > 0 ? ` Unavailable/skipped: ${skippedNames.join(", ")}.` : ""}`,
      });
    } else if (skippedNames.length > 0) {
      toast({
        type: "warning",
        title: "No Stock Added",
        message: `Unable to add ${skippedNames.join(", ")} — no available non-expired stock.`,
      });
    }
  };

  const processItemQueue = (
    prescription: DoctorPrescriptionRecord,
    queue: DoctorPrescriptionItemRecord[],
    prepared: CartItem[],
    skippedNames: string[]
  ) => {
    // Build combined reservation map from existing cart + already prepared items
    const reserved = new Map<string, number>(getCartBatchUsage());
    for (const ci of prepared) {
      const units = ci.sellMode === "SHEET" ? ci.quantity * ci.unitsPerSheet : ci.quantity;
      reserved.set(ci.batchId, (reserved.get(ci.batchId) ?? 0) + units);
    }

    const nextPrepared = [...prepared];
    const nextSkipped = [...skippedNames];

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      const med = findMatchingMedicine(item, medicines);
      if (!med) {
        nextSkipped.push(`${item.medicineNameSnapshot} (not in stock)`);
        continue;
      }

      const availableUnits = getSortedValidBatches(med).reduce((sum, b) => {
        const used = reserved.get(b.id) ?? 0;
        return sum + Math.max(0, b.quantityUnits - used);
      }, 0);

      if (availableUnits <= 0) {
        nextSkipped.push(`${med.name} (out of stock)`);
        continue;
      }

      if (availableUnits < item.quantityUnits) {
        // Pause queue and ask the pharmacist whether the available quantity is enough!
        setShortagePrompt({
          prescription,
          medicine: med,
          item,
          requestedUnits: item.quantityUnits,
          availableUnits,
          remainingItems: queue.slice(i + 1),
          alreadyPreparedCartItems: nextPrepared,
          skippedNames: nextSkipped,
        });
        return;
      }

      const { items: allocatedItems } = allocateFefoCartItems(
        med,
        item.quantityUnits,
        reserved
      );
      nextPrepared.push(...allocatedItems);
    }

    finalizeCartBatchAdd(prescription, nextPrepared, nextSkipped);
  };

  const handleConfirmPartialAdd = () => {
    if (!shortagePrompt) return;
    const {
      prescription,
      medicine,
      availableUnits,
      remainingItems,
      alreadyPreparedCartItems,
      skippedNames,
    } = shortagePrompt;

    const reserved = new Map<string, number>(getCartBatchUsage());
    for (const ci of alreadyPreparedCartItems) {
      const units = ci.sellMode === "SHEET" ? ci.quantity * ci.unitsPerSheet : ci.quantity;
      reserved.set(ci.batchId, (reserved.get(ci.batchId) ?? 0) + units);
    }

    const { items: allocatedItems } = allocateFefoCartItems(
      medicine,
      availableUnits,
      reserved
    );
    const updatedPrepared = [...alreadyPreparedCartItems, ...allocatedItems];
    setShortagePrompt(null);
    processItemQueue(prescription, remainingItems, updatedPrepared, skippedNames);
  };

  const handleSkipPartialItem = () => {
    if (!shortagePrompt) return;
    const {
      prescription,
      medicine,
      remainingItems,
      alreadyPreparedCartItems,
      skippedNames,
    } = shortagePrompt;
    setShortagePrompt(null);
    processItemQueue(prescription, remainingItems, alreadyPreparedCartItems, [
      ...skippedNames,
      `${medicine.name} (skipped)`,
    ]);
  };

  const handleMarkStatus = async (
    prescriptionId: string,
    status: "DISPENSED" | "CANCELLED"
  ) => {
    setBusyId(prescriptionId);
    try {
      const res = await fetch(
        `/api/pharmacy-mgmt/prescriptions/${encodeURIComponent(prescriptionId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        }
      );
      if (res.ok) {
        toast({
          type: "success",
          title:
            status === "DISPENSED"
              ? "Prescription Marked Completed"
              : "Prescription Dismissed",
        });
        await onRefresh();
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <motion.button
        type="button"
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => {
          setOpen(true);
          void onRefresh();
        }}
        title="Doctor Prescriptions Queue"
        className={`relative inline-flex items-center gap-2 rounded-2xl border px-3.5 py-2.5 text-xs font-bold transition-colors cursor-pointer ${
          pendingCount > 0
            ? "border-emerald-400 bg-emerald-50 text-[#0d4a38] hover:bg-emerald-100 shadow-xs"
            : "border-[#cfe2d6] bg-white text-[#0d4a38] hover:bg-emerald-50/60"
        }`}
      >
        {pendingCount > 0 ? (
          <BellRing className="h-4 w-4 text-emerald-700 animate-pulse" />
        ) : (
          <ClipboardPlus className="h-4 w-4 text-emerald-700" />
        )}
        <span className="hidden sm:inline">Prescriptions</span>
        {pendingCount > 0 ? (
          <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-rose-600 px-1.5 py-0.5 font-mono-id text-[10px] font-extrabold text-white shadow-xs">
            {pendingCount}
          </span>
        ) : (
          <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 font-mono-id text-[10px] font-bold text-emerald-800">
            0
          </span>
        )}
      </motion.button>

      {/* Prescriptions Queue Modal */}
      <AnimatedModal
        open={open}
        onClose={() => setOpen(false)}
        title="Incoming Doctor Prescriptions"
        subtitle="Select a patient prescription and click Add to Cart — earliest expiry batch (FEFO) is picked automatically."
        maxWidth="max-w-4xl"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[#466356]">
              Pending Prescriptions:{" "}
              <strong className="font-mono-id text-[#0d4a38]">{pendingCount}</strong>
            </span>
            <BubblyButton
              type="button"
              variant="outline"
              disabled={refreshing}
              onClick={async () => {
                setRefreshing(true);
                try {
                  await onRefresh();
                } finally {
                  setRefreshing(false);
                }
              }}
              className="px-3 py-1.5 text-xs"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
              />
              Refresh
            </BubblyButton>
          </div>

          {prescriptions.length === 0 ? (
            <EmptyState
              icon={<ClipboardPlus className="h-6 w-6" />}
              title="No Pending Doctor Prescriptions"
              description="New prescriptions submitted by consulting doctors will appear here automatically with a live alert count."
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-12">
              {/* Patient Prescription List */}
              <div className="md:col-span-5 max-h-[60vh] overflow-y-auto space-y-2 pr-1">
                {prescriptions.map((rx) => {
                  const active = selectedPrescription?.id === rx.id;
                  return (
                    <button
                      key={rx.id}
                      type="button"
                      onClick={() => setSelectedPrescriptionId(rx.id)}
                      className={`w-full rounded-2xl border p-3.5 text-left transition-all cursor-pointer ${
                        active
                          ? "border-emerald-500 bg-[#eef7f1] shadow-xs"
                          : "border-[#dcece2] bg-white hover:border-emerald-300"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-display text-sm font-bold text-[#0f241d] truncate">
                            {rx.patientNameSnapshot}
                          </p>
                          <p className="mt-0.5 font-mono-id text-[11px] font-semibold text-[#0d4a38]">
                            {rx.patientUhidSnapshot} · {rx.patientPhoneSnapshot}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 font-mono-id text-[10px] font-bold text-emerald-800">
                          {rx.items.length} med(s)
                        </span>
                      </div>
                      <p className="mt-1.5 flex items-center gap-1 text-[11px] text-[#466356]">
                        <Stethoscope className="h-3 w-3 text-emerald-700" />
                        <span className="truncate font-semibold">
                          {rx.doctorNameSnapshot}
                        </span>
                      </p>
                      <p className="mt-0.5 text-[10px] text-[#6c877a]">
                        {formatAccurateDateTime(rx.prescribedAt)}
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* Selected Prescription Details + Add to Cart */}
              <div className="md:col-span-7">
                {selectedPrescription ? (
                  <div className="rounded-2xl border border-[#dcece2] bg-[#f8fcfa] p-4 space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[#dcece2] pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <UserRound className="h-4 w-4 text-[#0d4a38]" />
                          <h4 className="font-display text-base font-extrabold text-[#0f241d]">
                            {selectedPrescription.patientNameSnapshot}
                          </h4>
                          <StatusBadge status={selectedPrescription.status} />
                        </div>
                        <p className="mt-0.5 text-xs text-[#466356]">
                          UHID:{" "}
                          <strong className="font-mono-id">
                            {selectedPrescription.patientUhidSnapshot}
                          </strong>{" "}
                          · Mobile:{" "}
                          <strong className="font-mono-id">
                            {selectedPrescription.patientPhoneSnapshot}
                          </strong>
                        </p>
                        <p className="mt-0.5 text-xs text-[#5b796b]">
                          Prescribed by:{" "}
                          <strong className="text-[#0d4a38]">
                            {selectedPrescription.doctorNameSnapshot}
                          </strong>
                          {selectedPrescription.doctorQualificationSnapshot
                            ? ` (${selectedPrescription.doctorQualificationSnapshot})`
                            : ""}
                        </p>
                      </div>

                      <BubblyButton
                        type="button"
                        onClick={() =>
                          processItemQueue(
                            selectedPrescription,
                            selectedPrescription.items,
                            [],
                            []
                          )
                        }
                        className="px-4 py-2 text-xs"
                      >
                        <ShoppingCart className="h-3.5 w-3.5" />
                        Add All to Cart
                      </BubblyButton>
                    </div>

                    {selectedPrescription.notes ? (
                      <div className="rounded-xl border border-[#dcece2] bg-white px-3 py-2 text-xs text-[#314c40]">
                        <span className="font-bold text-[#0d4a38]">Doctor Notes:</span>{" "}
                        {selectedPrescription.notes}
                      </div>
                    ) : null}

                    {/* Prescribed Medicines List */}
                    <div className="space-y-2 max-h-[38vh] overflow-y-auto pr-1">
                      {selectedPrescription.items.map((item) => {
                        const matchedMed = findMatchingMedicine(item, medicines);
                        const avail = computeAvailableUnitsForMedicine(matchedMed);
                        const earliestBatch = matchedMed
                          ? getSortedValidBatches(matchedMed)[0] ?? null
                          : null;
                        const isShort = avail > 0 && avail < item.quantityUnits;
                        const isOut = avail <= 0;

                        return (
                          <div
                            key={item.id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#dcece2] bg-white p-3 text-xs"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <Pill className="h-3.5 w-3.5 text-emerald-700 shrink-0" />
                                <span className="font-bold text-[#0f241d]">
                                  {item.medicineNameSnapshot}
                                </span>
                                <span className="rounded-full bg-[#eef7f1] px-2 py-0.5 font-mono-id text-[11px] font-bold text-[#0d4a38]">
                                  Prescribed: {item.quantityUnits} unit(s)
                                </span>
                              </div>
                              {item.dosageInstructions ? (
                                <p className="mt-1 text-[11px] text-[#5b796b]">
                                  Dosage: {item.dosageInstructions}
                                </p>
                              ) : null}
                              <p className="mt-1 text-[11px]">
                                {isOut ? (
                                  <span className="font-semibold text-rose-600">
                                    Out of stock (0 available non-expired units)
                                  </span>
                                ) : isShort ? (
                                  <span className="font-semibold text-amber-700">
                                    Only {avail} unit(s) available (FEFO Batch{" "}
                                    {earliestBatch?.batchNumber}, Exp{" "}
                                    {earliestBatch?.expiryLabel})
                                  </span>
                                ) : (
                                  <span className="font-semibold text-emerald-700">
                                    In stock ({avail} avail) · Auto FEFO Batch{" "}
                                    {earliestBatch?.batchNumber} (Exp{" "}
                                    {earliestBatch?.expiryLabel})
                                  </span>
                                )}
                              </p>
                            </div>

                            <BubblyButton
                              type="button"
                              variant={isOut ? "outline" : "primary"}
                              disabled={isOut}
                              onClick={() =>
                                processItemQueue(selectedPrescription, [item], [], [])
                              }
                              className="px-3 py-1.5 text-[11px] shrink-0"
                            >
                              <ShoppingCart className="h-3.5 w-3.5" />
                              Add to Cart
                            </BubblyButton>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#dcece2] pt-3">
                      <BubblyButton
                        type="button"
                        variant="outline"
                        disabled={busyId === selectedPrescription.id}
                        onClick={() =>
                          handleMarkStatus(selectedPrescription.id, "CANCELLED")
                        }
                        className="px-3 py-1.5 text-xs text-rose-700 border-rose-200 hover:bg-rose-50"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Dismiss
                      </BubblyButton>
                      <BubblyButton
                        type="button"
                        variant="outline"
                        disabled={busyId === selectedPrescription.id}
                        onClick={() =>
                          handleMarkStatus(selectedPrescription.id, "DISPENSED")
                        }
                        className="px-3 py-1.5 text-xs"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Mark Completed
                      </BubblyButton>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </AnimatedModal>

      {/* Insufficient Quantity Confirmation Modal */}
      <AnimatedModal
        open={Boolean(shortagePrompt)}
        onClose={handleSkipPartialItem}
        title="Limited Stock Available"
        subtitle={shortagePrompt?.medicine.name}
        maxWidth="max-w-md"
      >
        {shortagePrompt ? (
          <div className="space-y-4 text-xs">
            <div className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-sm text-amber-900">
                  Only {shortagePrompt.availableUnits} unit(s) available in stock
                </p>
                <p className="text-amber-900/90 leading-relaxed">
                  Doctor prescribed{" "}
                  <strong>{shortagePrompt.requestedUnits} unit(s)</strong> of{" "}
                  <strong>{shortagePrompt.medicine.name}</strong>, but we currently only
                  have <strong>{shortagePrompt.availableUnits} unit(s)</strong> available.
                </p>
                <p className="font-semibold text-[#0d4a38] pt-1">
                  Is it enough to add the available {shortagePrompt.availableUnits} unit(s)
                  using the earliest expiry batch?
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2.5">
              <BubblyButton
                type="button"
                variant="outline"
                onClick={handleSkipPartialItem}
              >
                No, Skip
              </BubblyButton>
              <BubblyButton type="button" onClick={handleConfirmPartialAdd}>
                <ShoppingCart className="h-3.5 w-3.5" />
                Yes, Add {shortagePrompt.availableUnits} Unit(s)
              </BubblyButton>
            </div>
          </div>
        ) : null}
      </AnimatedModal>
    </>
  );
}
