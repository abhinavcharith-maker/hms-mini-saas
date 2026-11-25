"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Barcode,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CornerDownLeft,
  CreditCard,
  Download,
  Eye,
  Hash,
  Layers,
  MapPin,
  Minus,
  Package,
  Phone,
  Pill,
  Plus,
  Printer,
  Receipt,
  Search,
  ShieldAlert,
  ShoppingCart,
  Stethoscope,
  Trash2,
  User,
  X,
} from "lucide-react";
import {
  AnimatedModal,
  BubblyButton,
  EmptyState,
  SkeletonBox,
  SpringCard,
} from "@/components/ui/MotionPrimitives";
import { useToast } from "@/components/providers/AppProviders";
import { formatAccurateDateTime } from "@/lib/datetime";
import { sanitizeMobileInput } from "@/lib/phone";
import {
  formatStockBreakdown,
  pickDefaultSellBatch,
} from "@/lib/pharmacy-utils";
import type {
  CartItem,
  DoctorOption,
  DoctorPrescriptionRecord,
  HospitalPatientMatch,
  PaymentMode,
  PharmacyBatchItem,
  PharmacyMedicineItem,
  PharmacySaleRecord,
  SellMode,
} from "./types";

export interface SellMedicineHandle {
  getCartBatchUsage: () => Map<string, number>;
  addPrescriptionToCart: (payload: {
    prescription: DoctorPrescriptionRecord;
    items: CartItem[];
  }) => void;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function SellMedicineSection({
  medicines,
  doctors,
  pharmacyName,
  refreshKey,
  isActive = true,
  actionRef,
  onSaleCompleted,
}: {
  medicines: PharmacyMedicineItem[];
  doctors: DoctorOption[];
  pharmacyName: string;
  refreshKey: number;
  isActive?: boolean;
  actionRef?: React.RefObject<SellMedicineHandle | null>;
  onSaleCompleted: () => Promise<void> | void;
}) {
  const { toast } = useToast();

  // Preferred search bar tracking (just like PharmacyApp copy 3)
  const activeSearchPriorityRef = useRef<"medicine" | "batch">("medicine");
  const medSearchRef = useRef<HTMLInputElement | null>(null);
  const batchSearchRef = useRef<HTMLInputElement | null>(null);
  const qtyInputRef = useRef<HTMLInputElement | null>(null);
  const patientNameInputRef = useRef<HTMLInputElement | null>(null);
  const medDropdownWrapRef = useRef<HTMLDivElement | null>(null);
  const batchDropdownWrapRef = useRef<HTMLDivElement | null>(null);

  // Dual search state
  const [medQuery, setMedQuery] = useState("");
  const [medDropdownOpen, setMedDropdownOpen] = useState(false);
  const [medHighlightIdx, setMedHighlightIdx] = useState(0);

  const [batchQuery, setBatchQuery] = useState("");
  const [batchDropdownOpen, setBatchDropdownOpen] = useState(false);
  const [batchHighlightIdx, setBatchHighlightIdx] = useState(0);

  // Active selected medicine & batch workspace
  const [selectedMedicineId, setSelectedMedicineId] = useState<string | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [sellMode, setSellMode] = useState<SellMode>("UNIT");
  const [qtyInput, setQtyInput] = useState("1");

  // Cart & checkout state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activePrescriptionId, setActivePrescriptionId] = useState<string | null>(null);
  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("CASH");

  // Hospital patient lookup (fetches registered patients + mobile + most recently visited doctor)
  const [patientSuggestions, setPatientSuggestions] = useState<HospitalPatientMatch[]>([]);
  const [patientDropdownOpen, setPatientDropdownOpen] = useState(false);
  const [patientHighlightIdx, setPatientHighlightIdx] = useState(0);
  const patientDropdownRef = useRef<HTMLDivElement | null>(null);

  // Modals: Sale overview confirmation, Post-sale receipt popup, History item detail
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submittingSale, setSubmittingSale] = useState(false);
  const [completedSale, setCompletedSale] = useState<PharmacySaleRecord | null>(null);
  const [inspectSale, setInspectSale] = useState<PharmacySaleRecord | null>(null);

  // Transaction History (paginated 100/page + search)
  const [sales, setSales] = useState<PharmacySaleRecord[]>([]);
  const [salesLoading, setSalesLoading] = useState(true);
  const [salesSearch, setSalesSearch] = useState("");
  const [debouncedSalesSearch, setDebouncedSalesSearch] = useState("");
  const [salesPage, setSalesPage] = useState(1);
  const [salesPagination, setSalesPagination] = useState({
    total: 0,
    page: 1,
    pageSize: 100,
    totalPages: 1,
  });

  // Focus preferred search input cleanly
  const focusPreferredSearch = useCallback(() => {
    window.requestAnimationFrame(() => {
      if (activeSearchPriorityRef.current === "batch") {
        batchSearchRef.current?.focus();
      } else {
        medSearchRef.current?.focus();
      }
    });
  }, []);

  // Auto-focus Medicine Search when Sell Medicine becomes active
  useEffect(() => {
    if (!isActive) return;
    window.requestAnimationFrame(() => {
      medSearchRef.current?.focus();
    });
  }, [isActive]);

  // Outside click closes dropdowns
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (
        medDropdownWrapRef.current &&
        !medDropdownWrapRef.current.contains(e.target as Node)
      ) {
        setMedDropdownOpen(false);
      }
      if (
        batchDropdownWrapRef.current &&
        !batchDropdownWrapRef.current.contains(e.target as Node)
      ) {
        setBatchDropdownOpen(false);
      }
      if (
        patientDropdownRef.current &&
        !patientDropdownRef.current.contains(e.target as Node)
      ) {
        setPatientDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  // Fetch matching registered patients from hospital Admin/Receptionist database ONLY after user types at least 1 letter
  useEffect(() => {
    const q = patientName.trim();
    if (!patientDropdownOpen || q.length === 0) return;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/pharmacy-mgmt/patients?q=${encodeURIComponent(q)}&limit=12`
        );
        if (res.ok) {
          const d = await res.json();
          setPatientSuggestions(d.patients ?? []);
          setPatientHighlightIdx(0);
        }
      } catch {
        // non-fatal
      }
    }, 140);
    return () => clearTimeout(t);
  }, [patientName, patientDropdownOpen]);

  const applyHospitalPatient = (pt: HospitalPatientMatch) => {
    setPatientName(pt.fullName);
    setPatientPhone(sanitizeMobileInput(pt.phone));
    if (pt.recentDoctorId && doctors.some((d) => d.id === pt.recentDoctorId)) {
      setDoctorId(pt.recentDoctorId);
    } else if (pt.recentDoctorName) {
      const byName = doctors.find(
        (d) => d.name.trim().toLowerCase() === pt.recentDoctorName!.trim().toLowerCase()
      );
      if (byName) setDoctorId(byName.id);
    }
    setPatientDropdownOpen(false);
  };

  // Debounce history search
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSalesSearch(salesSearch.trim());
      setSalesPage(1);
    }, 220);
    return () => clearTimeout(t);
  }, [salesSearch]);

  // Fetch paginated transaction history (100/page)
  const loadSalesHistory = useCallback(async () => {
    try {
      const qs = new URLSearchParams({
        page: String(salesPage),
        limit: "100",
      });
      if (debouncedSalesSearch) qs.set("q", debouncedSalesSearch);
      const res = await fetch(`/api/pharmacy-mgmt/sales?${qs.toString()}`);
      if (res.ok) {
        const d = await res.json();
        setSales(d.sales ?? []);
        if (d.pagination) setSalesPagination(d.pagination);
      }
    } finally {
      setSalesLoading(false);
    }
  }, [salesPage, debouncedSalesSearch]);

  useEffect(() => {
    void loadSalesHistory();
  }, [loadSalesHistory, refreshKey]);

  // Map units already reserved in cart per batchId
  const cartReservedByBatch = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of cart) {
      const units =
        item.sellMode === "SHEET"
          ? item.quantity * item.unitsPerSheet
          : item.quantity;
      map.set(item.batchId, (map.get(item.batchId) ?? 0) + units);
    }
    return map;
  }, [cart]);

  // Medicine search matches (available & matching query)
  const medMatches = useMemo(() => {
    const q = medQuery.trim().toLowerCase();
    const list = q
      ? medicines.filter(
          (m) =>
            m.name.toLowerCase().includes(q) ||
            (m.placement ?? "").toLowerCase().includes(q) ||
            (m.hsnCode ?? "").toLowerCase().includes(q)
        )
      : medicines;
    return [...list]
      .sort((a, b) => {
        if (q) {
          const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
          const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
          if (aStarts !== bStarts) return aStarts - bStarts;
        }
        // In-stock medicines first
        const aStock = a.validUnits > 0 ? 0 : 1;
        const bStock = b.validUnits > 0 ? 0 : 1;
        if (aStock !== bStock) return aStock - bStock;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 15);
  }, [medicines, medQuery]);

  // Direct batch search matches
  const batchMatches = useMemo(() => {
    const q = batchQuery.trim().toLowerCase();
    if (!q) return [];
    const results: Array<{ medicine: PharmacyMedicineItem; batch: PharmacyBatchItem }> = [];
    for (const med of medicines) {
      for (const batch of med.batches) {
        if (
          batch.batchNumber.toLowerCase().includes(q) ||
          med.name.toLowerCase().includes(q)
        ) {
          results.push({ medicine: med, batch });
        }
      }
    }
    return results
      .sort((a, b) => {
        const aStarts = a.batch.batchNumber.toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts = b.batch.batchNumber.toLowerCase().startsWith(q) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return a.batch.expiryDate.localeCompare(b.batch.expiryDate);
      })
      .slice(0, 15);
  }, [medicines, batchQuery]);

  // Currently selected medicine & batch objects
  const selectedMedicine = useMemo(
    () => medicines.find((m) => m.id === selectedMedicineId) ?? null,
    [medicines, selectedMedicineId]
  );

  const selectedBatch = useMemo(() => {
    if (!selectedMedicine) return null;
    if (selectedBatchId) {
      const exact = selectedMedicine.batches.find((b) => b.id === selectedBatchId);
      if (exact) return exact;
    }
    return pickDefaultSellBatch(selectedMedicine.batches);
  }, [selectedMedicine, selectedBatchId]);

  const focusQuantityBox = () => {
    window.requestAnimationFrame(() => {
      qtyInputRef.current?.focus();
      qtyInputRef.current?.select();
    });
  };

  const selectMedicine = (
    med: PharmacyMedicineItem,
    explicitBatchId?: string | null
  ) => {
    const chosenBatch = pickDefaultSellBatch(med.batches, explicitBatchId);
    setSelectedMedicineId(med.id);
    setSelectedBatchId(chosenBatch?.id ?? null);
    setSellMode("UNIT");
    setQtyInput("1");
    setMedQuery("");
    setBatchQuery("");
    setMedDropdownOpen(false);
    setBatchDropdownOpen(false);
    setMedHighlightIdx(0);
    setBatchHighlightIdx(0);
    focusQuantityBox();
  };

  const clearSelection = () => {
    setSelectedMedicineId(null);
    setSelectedBatchId(null);
    setQtyInput("1");
    setSellMode("UNIT");
    focusPreferredSearch();
  };

  const selectedBatchRemainingUnits = selectedBatch
    ? Math.max(
        0,
        selectedBatch.quantityUnits - (cartReservedByBatch.get(selectedBatch.id) ?? 0)
      )
    : 0;

  const handleAddToCart = () => {
    if (!selectedMedicine || !selectedBatch) return;

    if (selectedBatch.isExpired) {
      toast({
        type: "error",
        title: "Expired Batch Blocked",
        message: `Batch ${selectedBatch.batchNumber} expired on ${selectedBatch.expiryLabel} and cannot be sold.`,
      });
      return;
    }

    const qty = Number.parseInt(qtyInput, 10);
    if (!Number.isInteger(qty) || qty < 1) {
      toast({
        type: "warning",
        title: "Invalid Quantity",
        message: "Enter a whole quantity of at least 1.",
      });
      focusQuantityBox();
      return;
    }

    const effectiveMode: SellMode =
      selectedMedicine.packagingType === "INDIVIDUAL" ? "UNIT" : sellMode;
    const ups =
      selectedMedicine.packagingType === "SHEET"
        ? Math.max(1, selectedMedicine.unitsPerSheet)
        : 1;
    const unitsNeeded = effectiveMode === "SHEET" ? qty * ups : qty;

    if (unitsNeeded > selectedBatchRemainingUnits) {
      toast({
        type: "warning",
        title: "Insufficient Batch Stock",
        message: `Only ${selectedBatchRemainingUnits} unit(s) remaining in batch ${selectedBatch.batchNumber}.`,
      });
      focusQuantityBox();
      return;
    }

    const key = `${selectedMedicine.id}::${selectedBatch.id}::${effectiveMode}`;
    setCart((prev) => {
      const existing = prev.find((c) => c.key === key);
      if (existing) {
        return prev.map((c) =>
          c.key === key ? { ...c, quantity: c.quantity + qty } : c
        );
      }
      return [
        ...prev,
        {
          key,
          medicineId: selectedMedicine.id,
          medicineName: selectedMedicine.name,
          batchId: selectedBatch.id,
          batchNumber: selectedBatch.batchNumber,
          expiryLabel: selectedBatch.expiryLabel,
          hsnCode: selectedMedicine.hsnCode,
          placement: selectedMedicine.placement,
          prescriptionRequired: selectedMedicine.prescriptionRequired,
          packagingType: selectedMedicine.packagingType,
          unitsPerSheet: ups,
          sellMode: effectiveMode,
          quantity: qty,
          unitSellingPrice: selectedMedicine.unitSellingPrice,
          sheetSellingPrice: selectedMedicine.sheetSellingPrice,
          gstPercent: selectedMedicine.gstPercent,
          maxBatchUnits: selectedBatch.quantityUnits,
        },
      ];
    });

    // Clear selection and immediately return cursor to whichever search bar user was using!
    setSelectedMedicineId(null);
    setSelectedBatchId(null);
    setQtyInput("1");
    setSellMode("UNIT");
    focusPreferredSearch();
  };

  // Cart item quantity adjustment
  const updateCartItemQty = (itemKey: string, delta: number) => {
    setCart((prev) => {
      const target = prev.find((c) => c.key === itemKey);
      if (!target) return prev;
      const nextQty = target.quantity + delta;
      if (nextQty <= 0) {
        return prev.filter((c) => c.key !== itemKey);
      }
      // Compute total units used across OTHER cart rows sharing the same batchId
      const otherUnitsInBatch = prev
        .filter((c) => c.batchId === target.batchId && c.key !== itemKey)
        .reduce(
          (sum, c) =>
            sum + (c.sellMode === "SHEET" ? c.quantity * c.unitsPerSheet : c.quantity),
          0
        );
      const nextUnits =
        target.sellMode === "SHEET" ? nextQty * target.unitsPerSheet : nextQty;
      if (otherUnitsInBatch + nextUnits > target.maxBatchUnits) {
        toast({
          type: "warning",
          title: "Stock Limit Reached",
          message: `Batch ${target.batchNumber} has ${target.maxBatchUnits} unit(s) available.`,
        });
        return prev;
      }
      return prev.map((c) => (c.key === itemKey ? { ...c, quantity: nextQty } : c));
    });
  };

  const removeCartItem = (itemKey: string) => {
    setCart((prev) => prev.filter((c) => c.key !== itemKey));
  };

  // Cart live totals (GST % is recorded strictly for invoice display on the printed receipt — not added on top of selling price)
  const cartSummary = useMemo(() => {
    const rows = cart.map((item) => {
      const basicUnits =
        item.sellMode === "SHEET" ? item.quantity * item.unitsPerSheet : item.quantity;
      const lineSubtotal = round2(basicUnits * item.unitSellingPrice);
      const lineGst = 0;
      const lineTotal = lineSubtotal;
      return { ...item, basicUnits, lineSubtotal, lineGst, lineTotal };
    });
    const subtotal = round2(rows.reduce((sum, r) => sum + r.lineSubtotal, 0));
    const gst = 0;
    const totalUnits = rows.reduce((sum, r) => sum + r.basicUnits, 0);
    const hasRx = rows.some((r) => r.prescriptionRequired);
    return {
      rows,
      subtotal,
      gst,
      grandTotal: subtotal,
      totalUnits,
      hasRx,
    };
  }, [cart]);

  const selectedDoctor = useMemo(
    () => doctors.find((d) => d.id === doctorId) ?? null,
    [doctors, doctorId]
  );

  const handleOpenOverview = (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) {
      toast({
        type: "warning",
        title: "Cart Is Empty",
        message: "Add at least one medicine before completing a sale.",
      });
      focusPreferredSearch();
      return;
    }
    if (patientName.trim().length < 2) {
      toast({
        type: "warning",
        title: "Patient Name Required",
        message: "Enter the patient's full name.",
      });
      return;
    }
    if (!/^\d{10}$/.test(patientPhone)) {
      toast({
        type: "warning",
        title: "Valid Mobile Required",
        message: "Enter a 10-digit patient mobile number.",
      });
      return;
    }
    if (!selectedDoctor) {
      toast({
        type: "warning",
        title: "Reference Doctor Required",
        message: "Select a reference doctor from the hospital's doctors list.",
      });
      return;
    }
    setConfirmOpen(true);
  };

  // Expose imperative prescription cart helpers to PharmacyManagementWorkspace
  useEffect(() => {
    if (!actionRef) return;
    actionRef.current = {
      getCartBatchUsage: () => {
        const map = new Map<string, number>();
        for (const item of cart) {
          const units =
            item.sellMode === "SHEET"
              ? item.quantity * item.unitsPerSheet
              : item.quantity;
          map.set(item.batchId, (map.get(item.batchId) ?? 0) + units);
        }
        return map;
      },
      addPrescriptionToCart: ({ prescription, items }) => {
        setCart((prev) => {
          const next = [...prev];
          for (const incoming of items) {
            const idx = next.findIndex((c) => c.key === incoming.key);
            if (idx >= 0) {
              next[idx] = {
                ...next[idx],
                quantity: Math.min(
                  next[idx].maxBatchUnits,
                  next[idx].quantity + incoming.quantity
                ),
              };
            } else {
              next.push(incoming);
            }
          }
          return next;
        });

        setActivePrescriptionId(prescription.id);
        setPatientName(prescription.patientNameSnapshot);
        setPatientPhone(sanitizeMobileInput(prescription.patientPhoneSnapshot));
        setPatientDropdownOpen(false);

        if (
          prescription.doctorId &&
          doctors.some((d) => d.id === prescription.doctorId)
        ) {
          setDoctorId(prescription.doctorId);
        } else {
          const byName = doctors.find(
            (d) =>
              d.name.trim().toLowerCase() ===
              prescription.doctorNameSnapshot.trim().toLowerCase()
          );
          if (byName) setDoctorId(byName.id);
        }
      },
    };
  }, [actionRef, cart, doctors]);

  const handleConfirmSale = useCallback(async () => {
    if (!selectedDoctor || cart.length === 0 || submittingSale) return;
    setSubmittingSale(true);
    try {
      const res = await fetch("/api/pharmacy-mgmt/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientName: patientName.trim(),
          patientPhone,
          doctorId: selectedDoctor.id,
          doctorName: selectedDoctor.name,
          paymentMode,
          prescriptionId: activePrescriptionId,
          items: cart.map((c) => ({
            medicineId: c.medicineId,
            batchId: c.batchId,
            sellMode: c.sellMode,
            quantity: c.quantity,
          })),
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast({
          type: "error",
          title: "Sale Failed",
          message: d.error || "Could not complete pharmacy sale.",
        });
        return;
      }

      const saleRecord: PharmacySaleRecord = d.sale;
      toast({
        type: "success",
        title: `Sale Completed (${saleRecord.saleNumber})`,
        message: `₹${saleRecord.totalAmount.toFixed(2)} billed to ${saleRecord.patientName}.`,
      });
      setConfirmOpen(false);
      setCart([]);
      setActivePrescriptionId(null);
      setPatientName("");
      setPatientPhone("");
      setDoctorId("");
      setPaymentMode("CASH");
      setCompletedSale(saleRecord);
      await onSaleCompleted();
      await loadSalesHistory();
    } finally {
      setSubmittingSale(false);
    }
  }, [
    selectedDoctor,
    cart,
    submittingSale,
    patientName,
    patientPhone,
    paymentMode,
    activePrescriptionId,
    toast,
    onSaleCompleted,
    loadSalesHistory,
  ]);

  // Allow pressing Return/Enter inside the Sale Overview & Confirmation modal to confirm the sale immediately
  useEffect(() => {
    if (!confirmOpen || submittingSale) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        void handleConfirmSale();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmOpen, submittingSale, handleConfirmSale]);

  const handleDownloadEntireReport = () => {
    const tzOffset = new Date().getTimezoneOffset();
    window.open(
      `/api/pharmacy-mgmt/sales/export-pdf?tzOffset=${encodeURIComponent(String(tzOffset))}`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  return (
    <div className="space-y-6">
      {/* POS Top Panel: Dual Search Bars + Active Medicine/Batch Workspace */}
      <SpringCard className="p-5 space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          {/* Search Bar 1: Search Medicine */}
          <div ref={medDropdownWrapRef} className="relative">
            <label className="mb-1.5 flex items-center justify-between text-xs font-bold text-[#0f241d]">
              <span className="inline-flex items-center gap-1.5">
                <Pill className="h-3.5 w-3.5 text-emerald-700" />
                Search Medicine
              </span>
              <span className="text-[10px] font-semibold text-emerald-700">
                Auto-selects earliest expiry (FEFO)
              </span>
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6c877a]" />
              <input
                ref={medSearchRef}
                value={medQuery}
                onFocus={() => {
                  activeSearchPriorityRef.current = "medicine";
                  if (medQuery.trim().length > 0) setMedDropdownOpen(true);
                  setBatchDropdownOpen(false);
                }}
                onClick={() => {
                  activeSearchPriorityRef.current = "medicine";
                  if (medQuery.trim().length > 0) setMedDropdownOpen(true);
                }}
                onChange={(e) => {
                  activeSearchPriorityRef.current = "medicine";
                  const val = e.target.value;
                  setMedQuery(val);
                  setMedDropdownOpen(val.trim().length > 0);
                  setMedHighlightIdx(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    if (!medQuery.trim()) return;
                    e.preventDefault();
                    setMedDropdownOpen(true);
                    if (medMatches.length > 0) {
                      setMedHighlightIdx((prev) =>
                        Math.min(medMatches.length - 1, prev + 1)
                      );
                    }
                  } else if (e.key === "ArrowUp") {
                    if (!medQuery.trim()) return;
                    e.preventDefault();
                    setMedDropdownOpen(true);
                    setMedHighlightIdx((prev) => Math.max(0, prev - 1));
                  } else if (e.key === "Escape") {
                    setMedDropdownOpen(false);
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    // Empty search bar + Return: NEVER auto-select first medicine; jump to Patient Name when cart has items!
                    if (!medQuery.trim()) {
                      if (cart.length > 0) {
                        patientNameInputRef.current?.focus();
                      }
                      return;
                    }
                    if (medMatches.length > 0) {
                      const picked =
                        medMatches[Math.min(medHighlightIdx, medMatches.length - 1)];
                      if (picked) selectMedicine(picked);
                    }
                  }
                }}
                placeholder="Type medicine name..."
                className="w-full rounded-xl border border-[#cfe2d6] bg-white py-2.5 pl-10 pr-3.5 text-sm font-medium text-[#0f241d] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200/70"
              />
            </div>

            <AnimatePresence>
              {medDropdownOpen && medQuery.trim().length > 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="absolute left-0 right-0 z-30 mt-1.5 max-h-64 overflow-y-auto rounded-2xl border border-[#cfe2d6] bg-white shadow-xl divide-y divide-[#ebf4ee]"
                >
                  {medMatches.length === 0 ? (
                    <div className="px-4 py-3 text-xs text-[#5b796b]">
                      No medicines matched &ldquo;{medQuery.trim()}&rdquo;.
                    </div>
                  ) : (
                    medMatches.map((med, idx) => {
                      const active = idx === medHighlightIdx;
                      const firstBatch = pickDefaultSellBatch(med.batches);
                      return (
                        <button
                          key={med.id}
                          type="button"
                          onMouseEnter={() => setMedHighlightIdx(idx)}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            selectMedicine(med);
                          }}
                          className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-xs transition-colors cursor-pointer ${
                            active
                              ? "bg-[#dff4e8] text-[#0d4a38]"
                              : "bg-white text-[#0f241d] hover:bg-emerald-50/70"
                          }`}
                        >
                          <div className="min-w-0 flex items-center gap-2">
                            <span
                              className={`h-2 w-2 shrink-0 rounded-full ${
                                med.prescriptionRequired
                                  ? "bg-rose-500"
                                  : "bg-emerald-500"
                              }`}
                            />
                            <div className="min-w-0">
                              <p className="font-bold truncate">{med.name}</p>
                              <p className="text-[11px] text-[#5b796b] truncate">
                                {firstBatch
                                  ? `Next Batch: ${firstBatch.batchNumber} · Exp ${firstBatch.expiryLabel}`
                                  : "No batches"}
                                {med.placement ? ` · ${med.placement}` : ""}
                              </p>
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="font-mono-id font-bold text-[#0d4a38]">
                              ₹{med.unitSellingPrice.toFixed(2)}/u
                            </p>
                            <p
                              className={`text-[10px] font-semibold ${
                                med.validUnits <= 0
                                  ? "text-rose-600"
                                  : "text-emerald-700"
                              }`}
                            >
                              {med.validUnits} avail
                            </p>
                          </div>
                        </button>
                      );
                    })
                  )}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          {/* Search Bar 2: Search Batch Directly */}
          <div ref={batchDropdownWrapRef} className="relative">
            <label className="mb-1.5 flex items-center justify-between text-xs font-bold text-[#0f241d]">
              <span className="inline-flex items-center gap-1.5">
                <Barcode className="h-3.5 w-3.5 text-emerald-700" />
                Search Batch
              </span>
              <span className="text-[10px] font-semibold text-[#5b796b]">
                Select an exact batch number directly
              </span>
            </label>
            <div className="relative">
              <Barcode className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6c877a]" />
              <input
                ref={batchSearchRef}
                value={batchQuery}
                onFocus={() => {
                  activeSearchPriorityRef.current = "batch";
                  setBatchDropdownOpen(true);
                  setMedDropdownOpen(false);
                }}
                onClick={() => {
                  activeSearchPriorityRef.current = "batch";
                  setBatchDropdownOpen(true);
                }}
                onChange={(e) => {
                  activeSearchPriorityRef.current = "batch";
                  setBatchQuery(e.target.value);
                  setBatchDropdownOpen(true);
                  setBatchHighlightIdx(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setBatchDropdownOpen(true);
                    if (batchMatches.length > 0) {
                      setBatchHighlightIdx((prev) =>
                        Math.min(batchMatches.length - 1, prev + 1)
                      );
                    }
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setBatchDropdownOpen(true);
                    setBatchHighlightIdx((prev) => Math.max(0, prev - 1));
                  } else if (e.key === "Escape") {
                    setBatchDropdownOpen(false);
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    if (!batchQuery.trim()) {
                      if (cart.length > 0) {
                        patientNameInputRef.current?.focus();
                      }
                      return;
                    }
                    if (batchMatches.length > 0) {
                      const picked =
                        batchMatches[
                          Math.min(batchHighlightIdx, batchMatches.length - 1)
                        ];
                      if (picked) {
                        selectMedicine(picked.medicine, picked.batch.id);
                      }
                    }
                  }
                }}
                placeholder="Type batch number..."
                className="w-full rounded-xl border border-[#cfe2d6] bg-white py-2.5 pl-10 pr-3.5 text-sm font-mono-id font-medium text-[#0f241d] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200/70"
              />
            </div>

            <AnimatePresence>
              {batchDropdownOpen && batchQuery.trim().length > 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="absolute left-0 right-0 z-30 mt-1.5 max-h-64 overflow-y-auto rounded-2xl border border-[#cfe2d6] bg-white shadow-xl divide-y divide-[#ebf4ee]"
                >
                  {batchMatches.length === 0 ? (
                    <div className="px-4 py-3 text-xs text-[#5b796b]">
                      No batches matched &ldquo;{batchQuery.trim()}&rdquo;.
                    </div>
                  ) : (
                    batchMatches.map((entry, idx) => {
                      const active = idx === batchHighlightIdx;
                      return (
                        <button
                          key={entry.batch.id}
                          type="button"
                          onMouseEnter={() => setBatchHighlightIdx(idx)}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            selectMedicine(entry.medicine, entry.batch.id);
                          }}
                          className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-xs transition-colors cursor-pointer ${
                            active
                              ? "bg-[#dff4e8] text-[#0d4a38]"
                              : "bg-white text-[#0f241d] hover:bg-emerald-50/70"
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="font-mono-id font-bold text-[#0d4a38]">
                              {entry.batch.batchNumber}{" "}
                              <span className="font-sans font-semibold text-[#0f241d]">
                                · {entry.medicine.name}
                              </span>
                            </p>
                            <p className="text-[11px] text-[#5b796b]">
                              Exp {entry.batch.expiryLabel}
                              {entry.medicine.placement
                                ? ` · ${entry.medicine.placement}`
                                : ""}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <span
                              className={`inline-block rounded-full px-2 py-0.5 font-mono-id text-[10px] font-bold ${
                                entry.batch.isExpired
                                  ? "bg-rose-100 text-rose-700"
                                  : entry.batch.quantityUnits <= 0
                                    ? "bg-slate-100 text-slate-600"
                                    : "bg-emerald-100 text-emerald-800"
                              }`}
                            >
                              {entry.batch.isExpired
                                ? "EXPIRED"
                                : `${entry.batch.quantityUnits} u`}
                            </span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </div>

        {/* Unified Selected Medicine & Batch Workspace (Fast snappy transitions) */}
        <AnimatePresence>
          {selectedMedicine ? (
            <motion.div
              key={selectedMedicine.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.1 }}
              className="rounded-2xl border-2 border-emerald-400/80 bg-gradient-to-b from-[#f3fbf6] to-white p-4 sm:p-5 space-y-4 shadow-sm"
            >
              {/* Selected Medicine Header */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span
                    title={
                      selectedMedicine.prescriptionRequired
                        ? "Prescription Required"
                        : "OTC / Non-Prescription"
                    }
                    className={`h-3 w-3 rounded-full ${
                      selectedMedicine.prescriptionRequired
                        ? "bg-rose-500 ring-4 ring-rose-100"
                        : "bg-emerald-500 ring-4 ring-emerald-100"
                    }`}
                  />
                  <h3 className="font-display text-lg font-extrabold text-[#0f241d]">
                    {selectedMedicine.name}
                  </h3>
                  {selectedMedicine.prescriptionRequired ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 border border-rose-200 px-2.5 py-0.5 text-[11px] font-bold text-rose-700">
                      <ShieldAlert className="h-3 w-3" />
                      Rx Required
                    </span>
                  ) : null}
                  {selectedMedicine.placement ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 border border-teal-200 px-2.5 py-0.5 text-[11px] font-bold text-teal-800">
                      <MapPin className="h-3 w-3" />
                      {selectedMedicine.placement}
                    </span>
                  ) : null}
                  {selectedMedicine.hsnCode ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white border border-[#dcece2] px-2.5 py-0.5 font-mono-id text-[11px] text-[#466356]">
                      <Hash className="h-3 w-3" />
                      {selectedMedicine.hsnCode}
                    </span>
                  ) : null}
                  <span className="rounded-full bg-white border border-[#dcece2] px-2.5 py-0.5 font-mono-id text-[11px] font-semibold text-[#314c40]">
                    GST {selectedMedicine.gstPercent}%
                  </span>
                </div>

                <button
                  type="button"
                  onClick={clearSelection}
                  className="rounded-xl p-1.5 text-[#5b796b] hover:bg-emerald-100/70 hover:text-[#0f241d] cursor-pointer"
                  aria-label="Clear medicine selection"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Quantity Entry + Unit/Sheet Toggle + Add to Cart */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 rounded-2xl border border-[#d6e9de] bg-white p-3.5">
                {/* Unit / Sheet Switcher */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSellMode("UNIT");
                      focusQuantityBox();
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-xl border-2 px-3.5 py-2 text-xs font-bold transition-all cursor-pointer ${
                      sellMode === "UNIT"
                        ? "border-emerald-600 bg-[#dff4e8] text-[#0d4a38]"
                        : "border-[#dcece2] bg-white text-[#466356] hover:bg-[#f6fbf8]"
                    }`}
                  >
                    <Package className="h-3.5 w-3.5" />
                    Unit · ₹{selectedMedicine.unitSellingPrice.toFixed(2)}
                  </button>

                  <button
                    type="button"
                    disabled={selectedMedicine.packagingType === "INDIVIDUAL"}
                    onClick={() => {
                      if (selectedMedicine.packagingType === "SHEET") {
                        setSellMode("SHEET");
                        focusQuantityBox();
                      }
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-xl border-2 px-3.5 py-2 text-xs font-bold transition-all ${
                      selectedMedicine.packagingType === "INDIVIDUAL"
                        ? "border-[#e6eee9] bg-[#f4f7f5] text-[#9eb2a7] cursor-not-allowed opacity-60"
                        : sellMode === "SHEET"
                          ? "border-emerald-600 bg-[#dff4e8] text-[#0d4a38] cursor-pointer"
                          : "border-[#dcece2] bg-white text-[#466356] hover:bg-[#f6fbf8] cursor-pointer"
                    }`}
                  >
                    <Layers className="h-3.5 w-3.5" />
                    Sheet ({selectedMedicine.unitsPerSheet}u) · ₹
                    {selectedMedicine.sheetSellingPrice.toFixed(2)}
                  </button>
                </div>

                {/* Quantity Stepper + Add to Cart Button */}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="inline-flex items-center rounded-xl border-2 border-emerald-500/70 bg-[#f8fcfa] overflow-hidden">
                    <button
                      type="button"
                      onClick={() => {
                        const cur = Math.max(1, Number.parseInt(qtyInput, 10) || 1);
                        setQtyInput(String(Math.max(1, cur - 1)));
                        focusQuantityBox();
                      }}
                      className="px-2.5 py-2 text-[#0d4a38] hover:bg-emerald-100 cursor-pointer"
                      aria-label="Decrease quantity"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <input
                      ref={qtyInputRef}
                      type="number"
                      min={1}
                      value={qtyInput}
                      onChange={(e) => setQtyInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          e.stopPropagation();
                          handleAddToCart();
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          clearSelection();
                        }
                      }}
                      className="w-20 bg-white py-2 text-center font-mono-id text-sm font-extrabold text-[#0f241d] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const cur = Math.max(0, Number.parseInt(qtyInput, 10) || 0);
                        setQtyInput(String(cur + 1));
                        focusQuantityBox();
                      }}
                      className="px-2.5 py-2 text-[#0d4a38] hover:bg-emerald-100 cursor-pointer"
                      aria-label="Increase quantity"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>

                  <BubblyButton
                    type="button"
                    disabled={
                      !selectedBatch ||
                      selectedBatch.isExpired ||
                      selectedBatchRemainingUnits <= 0
                    }
                    onClick={handleAddToCart}
                    className="px-4 py-2.5 text-xs"
                  >
                    <ShoppingCart className="h-4 w-4" />
                    Add to Cart
                    <CornerDownLeft className="h-3.5 w-3.5 opacity-80" />
                  </BubblyButton>
                </div>
              </div>

              {/* Expired Batch Warning Banner */}
              {selectedBatch?.isExpired ? (
                <div className="flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-2.5 text-xs font-bold text-rose-700">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Batch {selectedBatch.batchNumber} expired ({selectedBatch.expiryLabel}) — dispensing is blocked. Select a non-expired batch below.
                </div>
              ) : null}

              {/* Available Batches Train (Expiry Priority) + Right-Side Total Stock Card */}
              <div className="flex flex-col md:flex-row items-stretch gap-3">
                <div className="flex-1 min-w-0 space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#466356]">
                    Available Batches (Expiry Priority · Earliest First)
                  </p>
                  {selectedMedicine.batches.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[#cfe2d6] bg-white px-4 py-3 text-xs text-rose-600 font-semibold">
                      No batches available for this medicine.
                    </div>
                  ) : (
                    <div className="flex gap-2.5 overflow-x-auto pb-1">
                      {selectedMedicine.batches.map((b, bIdx) => {
                        const isPicked = selectedBatch?.id === b.id;
                        const remaining = Math.max(
                          0,
                          b.quantityUnits - (cartReservedByBatch.get(b.id) ?? 0)
                        );
                        return (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => {
                              setSelectedBatchId(b.id);
                              focusQuantityBox();
                            }}
                            className={`shrink-0 min-w-[168px] rounded-xl border-2 p-3 text-left transition-all cursor-pointer ${
                              isPicked
                                ? b.isExpired
                                  ? "border-rose-500 bg-rose-50 shadow-sm"
                                  : "border-emerald-600 bg-[#dff4e8] shadow-sm"
                                : b.isExpired
                                  ? "border-rose-200 bg-rose-50/40 opacity-75 hover:opacity-100"
                                  : "border-[#dcece2] bg-white hover:border-emerald-300"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono-id text-xs font-extrabold text-[#0f241d]">
                                {b.batchNumber}
                              </span>
                              {b.isExpired ? (
                                <span className="rounded bg-rose-600 px-1.5 py-0.5 text-[9px] font-bold text-white">
                                  EXPIRED
                                </span>
                              ) : b.isExpiringSoon ? (
                                <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
                                  EXP SOON
                                </span>
                              ) : bIdx === 0 && !b.isExpired && remaining > 0 ? (
                                <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[9px] font-bold text-white">
                                  FEFO
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-1 font-mono-id text-[11px] font-semibold text-[#466356]">
                              Exp: {b.expiryLabel}
                            </p>
                            <p
                              className={`mt-1 font-mono-id text-xs font-bold ${
                                remaining <= 0 ? "text-rose-600" : "text-[#0d4a38]"
                              }`}
                            >
                              {formatStockBreakdown(
                                remaining,
                                selectedMedicine.packagingType,
                                selectedMedicine.unitsPerSheet
                              )}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Fixed Right-Side Total Quantity Card */}
                <div className="md:w-48 shrink-0 rounded-2xl border border-[#b7dcc6] bg-gradient-to-br from-[#0d4a38] to-[#059669] p-4 text-white flex flex-col justify-center">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-100">
                    Total Valid Stock
                  </p>
                  <p className="mt-1 font-mono-id text-2xl font-extrabold">
                    {selectedMedicine.validUnits}
                    <span className="ml-1 text-xs font-semibold text-emerald-100">
                      units
                    </span>
                  </p>
                  <p className="mt-1 text-[11px] text-emerald-100/90">
                    {formatStockBreakdown(
                      selectedMedicine.validUnits,
                      selectedMedicine.packagingType,
                      selectedMedicine.unitsPerSheet
                    )}
                  </p>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </SpringCard>

      {/* Cart + Mandatory Patient & Reference Doctor Checkout Panel */}
      <SpringCard className="p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#dff4e8] text-[#0d4a38]">
              <ShoppingCart className="h-4 w-4" />
            </div>
            <div>
              <h2 className="font-display text-base font-extrabold text-[#0f241d]">
                Dispensing Cart ({cart.length})
              </h2>
              <p className="text-[11px] text-[#5b796b]">
                {cartSummary.totalUnits} total unit(s) ready to dispense
              </p>
            </div>
          </div>

          {cart.length > 0 ? (
            <button
              type="button"
              onClick={() => setCart([])}
              className="text-xs font-semibold text-rose-600 hover:underline cursor-pointer"
            >
              Clear Cart
            </button>
          ) : null}
        </div>

        {cart.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#cfe2d6] bg-[#f8fcfa] px-5 py-8 text-center text-xs text-[#5b796b]">
            Search a medicine or batch above, enter quantity, and press <strong>Return ↵</strong> to add items to the cart.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-[#dcece2]">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#dcece2] bg-[#f4faf6] text-[10px] uppercase tracking-wider text-[#466356]">
                  <th className="py-2.5 px-3">Medicine</th>
                  <th className="py-2.5 px-3">Batch / Exp</th>
                  <th className="py-2.5 px-3">Mode</th>
                  <th className="py-2.5 px-3 text-center">Qty</th>
                  <th className="py-2.5 px-3 text-right">Rate</th>
                  <th className="py-2.5 px-3 text-right">GST</th>
                  <th className="py-2.5 px-3 text-right">Total</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ebf4ee] bg-white">
                <AnimatePresence initial={false}>
                  {cartSummary.rows.map((item) => (
                    <motion.tr
                      key={item.key}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.09 }}
                      className="hover:bg-[#f8fcfa]"
                    >
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-2 w-2 shrink-0 rounded-full ${
                              item.prescriptionRequired
                                ? "bg-rose-500"
                                : "bg-emerald-500"
                            }`}
                          />
                          <div>
                            <p className="font-bold text-[#0f241d]">
                              {item.medicineName}
                            </p>
                            {item.placement ? (
                              <p className="text-[10px] text-teal-700">
                                {item.placement}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono-id">
                        <p className="font-semibold text-[#0f241d]">
                          {item.batchNumber}
                        </p>
                        <p className="text-[10px] text-[#5b796b]">
                          Exp {item.expiryLabel}
                        </p>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="rounded-lg bg-[#eef7f1] px-2 py-0.5 text-[10px] font-bold text-[#0d4a38]">
                          {item.sellMode === "SHEET"
                            ? `Sheet (${item.unitsPerSheet}u)`
                            : "Unit"}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => updateCartItemQty(item.key, -1)}
                            className="rounded-lg border border-[#cfe2d6] p-1 text-[#0d4a38] hover:bg-emerald-50 cursor-pointer"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-8 text-center font-mono-id font-bold text-[#0f241d]">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateCartItemQty(item.key, 1)}
                            className="rounded-lg border border-[#cfe2d6] p-1 text-[#0d4a38] hover:bg-emerald-50 cursor-pointer"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                        <p className="mt-0.5 text-center text-[10px] text-[#5b796b]">
                          ({item.basicUnits} u)
                        </p>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-id">
                        ₹
                        {(item.sellMode === "SHEET"
                          ? item.sheetSellingPrice
                          : item.unitSellingPrice
                        ).toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-id text-[#466356]">
                        {item.gstPercent}%
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-id font-extrabold text-[#0d4a38]">
                        ₹{item.lineTotal.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => removeCartItem(item.key)}
                          className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 cursor-pointer"
                          aria-label="Remove item"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}

        {/* Totals Strip */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#d6e9de] bg-[#f4faf6] px-5 py-3 text-xs">
          <span className="text-[11px] text-[#5b796b]">
            GST % is mentioned on the printed invoice only (not added on top of selling price).
          </span>
          <div className="text-base">
            <span className="font-bold text-[#0d4a38]">Grand Total: </span>
            <strong className="font-display font-mono-id text-lg font-extrabold text-[#0d4a38]">
              ₹{cartSummary.grandTotal.toFixed(2)}
            </strong>
          </div>
        </div>

        {/* Mandatory Patient Details (auto-fetched from Admin/Receptionist patients) & Reference Doctor Form */}
        <form onSubmit={handleOpenOverview} className="space-y-4 border-t border-[#e5f2ea] pt-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div ref={patientDropdownRef} className="relative">
              <label className="mb-1.5 flex items-center justify-between text-xs font-bold text-[#0f241d]">
                <span className="inline-flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-emerald-700" />
                  Patient Name *
                </span>
                <span className="text-[10px] font-medium text-emerald-700">
                  Auto-fills mobile & doctor
                </span>
              </label>
              <input
                ref={patientNameInputRef}
                required
                value={patientName}
                onFocus={() => {
                  if (patientName.trim().length > 0) {
                    setPatientDropdownOpen(true);
                  }
                }}
                onChange={(e) => {
                  const val = e.target.value;
                  setPatientName(val);
                  if (val.trim().length > 0) {
                    setPatientDropdownOpen(true);
                  } else {
                    setPatientDropdownOpen(false);
                    setPatientSuggestions([]);
                  }
                }}
                onKeyDown={(e) => {
                  if (
                    !patientDropdownOpen ||
                    patientName.trim().length === 0 ||
                    patientSuggestions.length === 0
                  ) {
                    return;
                  }
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setPatientHighlightIdx((p) =>
                      Math.min(patientSuggestions.length - 1, p + 1)
                    );
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setPatientHighlightIdx((p) => Math.max(0, p - 1));
                  } else if (e.key === "Escape") {
                    setPatientDropdownOpen(false);
                  } else if (e.key === "Enter" && patientName.trim().length > 0) {
                    const picked =
                      patientSuggestions[
                        Math.min(patientHighlightIdx, patientSuggestions.length - 1)
                      ];
                    if (picked) {
                      e.preventDefault();
                      applyHospitalPatient(picked);
                    }
                  }
                }}
                className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2.5 text-sm font-medium text-[#0f241d] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200/70"
              />

              <AnimatePresence>
                {patientDropdownOpen &&
                patientName.trim().length > 0 &&
                patientSuggestions.length > 0 ? (
                  <motion.div
                    initial={{ opacity: 0, y: -3 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -3 }}
                    transition={{ duration: 0.1 }}
                    className="absolute left-0 right-0 z-30 mt-1.5 max-h-56 overflow-y-auto rounded-2xl border border-[#cfe2d6] bg-white shadow-xl divide-y divide-[#ebf4ee]"
                  >
                    {patientSuggestions.map((pt, idx) => {
                      const active = idx === patientHighlightIdx;
                      return (
                        <button
                          key={pt.id}
                          type="button"
                          onMouseEnter={() => setPatientHighlightIdx(idx)}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            applyHospitalPatient(pt);
                          }}
                          className={`flex w-full items-center justify-between gap-2 px-3.5 py-2 text-left text-xs transition-colors cursor-pointer ${
                            active
                              ? "bg-[#dff4e8] text-[#0d4a38]"
                              : "bg-white text-[#0f241d] hover:bg-emerald-50/70"
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="font-bold truncate">{pt.fullName}</p>
                            <p className="text-[10px] text-[#5b796b] truncate">
                              {pt.uhid}
                              {pt.recentDoctorName
                                ? ` · Recent: ${pt.recentDoctorName}`
                                : ""}
                            </p>
                          </div>
                          <span className="shrink-0 font-mono-id text-[11px] font-semibold text-[#0d4a38]">
                            {pt.phone}
                          </span>
                        </button>
                      );
                    })}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>

            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[#0f241d]">
                <Phone className="h-3.5 w-3.5 text-emerald-700" />
                Mobile Number *
              </label>
              <input
                required
                type="tel"
                inputMode="numeric"
                minLength={10}
                maxLength={10}
                pattern="\d{10}"
                title="Enter exactly 10 digits"
                value={patientPhone}
                onChange={(e) => setPatientPhone(sanitizeMobileInput(e.target.value))}
                className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2.5 text-sm font-mono-id font-medium text-[#0f241d] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200/70"
              />
            </div>

            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[#0f241d]">
                <Stethoscope className="h-3.5 w-3.5 text-emerald-700" />
                Reference Doctor *
              </label>
              <select
                required
                value={doctorId}
                onChange={(e) => setDoctorId(e.target.value)}
                className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2.5 text-sm font-medium text-[#0f241d] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200/70"
              >
                <option value="">Select reference doctor...</option>
                {doctors.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.name}
                    {doc.qualification ? ` · ${doc.qualification}` : ""}
                    {doc.specialty ? ` (${doc.specialty})` : ""}
                  </option>
                ))}
              </select>
              {doctors.length === 0 ? (
                <p className="mt-1 text-[11px] font-semibold text-amber-700">
                  No active doctors configured yet. Add doctors in Hospital Admin → Management.
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#466356]">
                <CreditCard className="h-3.5 w-3.5 text-emerald-700" />
                Payment Mode:
              </span>
              {(["CASH", "UPI", "CARD"] as const).map((pm) => (
                <button
                  key={pm}
                  type="button"
                  onClick={() => setPaymentMode(pm)}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                    paymentMode === pm
                      ? "border-emerald-600 bg-[#dff4e8] text-[#0d4a38]"
                      : "border-[#dcece2] bg-white text-[#466356] hover:bg-[#f6fbf8]"
                  }`}
                >
                  {pm}
                </button>
              ))}
            </div>

            <BubblyButton
              type="submit"
              disabled={cart.length === 0 || doctors.length === 0}
              className="px-6 py-3"
            >
              <CheckCircle2 className="h-4 w-4" />
              Complete Sale
            </BubblyButton>
          </div>
        </form>
      </SpringCard>

      {/* Transaction History Panel (Paginated 100 per page + Search + Download Entire PDF Report) */}
      <SpringCard className="p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#eef7f1] text-[#0d4a38]">
              <Receipt className="h-4 w-4" />
            </div>
            <div>
              <h2 className="font-display text-base font-extrabold text-[#0f241d]">
                Transaction History ({salesPagination.total})
              </h2>
              <p className="text-[11px] text-[#5b796b]">
                Showing up to 100 transactions per page · Latest first
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6c877a]" />
              <input
                value={salesSearch}
                onChange={(e) => setSalesSearch(e.target.value)}
                placeholder="Search mobile, patient, doctor, invoice..."
                className="w-72 max-w-full rounded-xl border border-[#cfe2d6] bg-white py-2 pl-9 pr-3 text-xs text-[#0f241d] focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <BubblyButton
              type="button"
              variant="secondary"
              onClick={handleDownloadEntireReport}
              className="px-3.5 py-2 text-xs"
            >
              <Download className="h-3.5 w-3.5" />
              Download Entire Report
            </BubblyButton>
          </div>
        </div>

        {salesLoading ? (
          <SkeletonBox className="h-48" />
        ) : sales.length === 0 ? (
          <EmptyState
            icon={<Receipt className="h-5 w-5" />}
            title="No Transactions Found"
            description={
              debouncedSalesSearch
                ? "No sales matched your search query."
                : "Completed pharmacy sales will appear here immediately."
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#dcece2] text-[10px] uppercase tracking-wider text-[#5b796b]">
                    <th className="py-2.5 pr-3">Invoice & Date</th>
                    <th className="py-2.5 px-3">Patient & Mobile</th>
                    <th className="py-2.5 px-3">Reference Doctor</th>
                    <th className="py-2.5 px-3">Items</th>
                    <th className="py-2.5 px-3">Payment</th>
                    <th className="py-2.5 px-3 text-right">Total</th>
                    <th className="py-2.5 pl-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ebf4ee]">
                  {sales.map((s) => (
                    <tr key={s.id} className="hover:bg-[#f7fbf8]">
                      <td className="py-2.5 pr-3">
                        <p className="font-mono-id font-bold text-[#0d4a38]">
                          {s.saleNumber}
                        </p>
                        <p className="text-[10px] text-[#5b796b]">
                          {formatAccurateDateTime(s.soldAt)}
                        </p>
                      </td>
                      <td className="py-2.5 px-3">
                        <p className="font-semibold text-[#0f241d]">{s.patientName}</p>
                        <p className="font-mono-id text-[11px] text-[#5b796b]">
                          {s.patientPhone}
                        </p>
                      </td>
                      <td className="py-2.5 px-3 font-medium text-[#314c40]">
                        {s.doctorName}
                      </td>
                      <td className="py-2.5 px-3 max-w-[220px] truncate text-[#466356]">
                        {s.items
                          .map(
                            (it) =>
                              `${it.medicineNameSnapshot} ×${it.enteredQuantity}${
                                it.sellMode === "SHEET" ? "sh" : "u"
                              }`
                          )
                          .join(", ")}
                        <span className="block text-[10px] text-[#6c877a]">
                          {s.totalUnitsSold} unit(s) total
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="rounded-full border border-[#d6e9de] bg-[#f4faf6] px-2 py-0.5 text-[10px] font-bold text-[#0d4a38]">
                          {s.paymentMode}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-id font-extrabold text-[#0f241d]">
                        ₹{s.totalAmount.toFixed(2)}
                      </td>
                      <td className="py-2.5 pl-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <BubblyButton
                            variant="outline"
                            className="px-2.5 py-1 text-[11px]"
                            onClick={() => setInspectSale(s)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            View
                          </BubblyButton>
                          <a
                            href={`/print/pharmacy-sale/${encodeURIComponent(s.id)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-xl border border-[#cfe2d6] bg-[#eef7f1] px-2.5 py-1.5 text-[11px] font-semibold text-[#0d4a38] hover:bg-[#dff4e8]"
                          >
                            <Printer className="h-3.5 w-3.5" />
                            Receipt
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {salesPagination.totalPages > 1 ? (
              <div className="flex items-center justify-between border-t border-[#e5f2ea] pt-3 text-xs">
                <span className="text-[#5b796b]">
                  Page <strong>{salesPagination.page}</strong> of{" "}
                  <strong>{salesPagination.totalPages}</strong> ({salesPagination.total}{" "}
                  transactions)
                </span>
                <div className="flex items-center gap-2">
                  <BubblyButton
                    variant="outline"
                    disabled={salesPage <= 1}
                    onClick={() => setSalesPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-1.5 text-xs"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Previous
                  </BubblyButton>
                  <BubblyButton
                    variant="outline"
                    disabled={salesPage >= salesPagination.totalPages}
                    onClick={() =>
                      setSalesPage((p) => Math.min(salesPagination.totalPages, p + 1))
                    }
                    className="px-3 py-1.5 text-xs"
                  >
                    Next
                    <ChevronRight className="h-3.5 w-3.5" />
                  </BubblyButton>
                </div>
              </div>
            ) : null}
          </>
        )}
      </SpringCard>

      {/* Sale Overview & Confirmation Modal */}
      <AnimatedModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Sale Overview & Confirmation"
        subtitle={`${pharmacyName} · Review itemized details before confirming`}
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4 text-xs">
          {cartSummary.hasRx ? (
            <div className="flex items-start gap-2.5 rounded-2xl border border-rose-300 bg-rose-50 p-3.5 text-rose-800">
              <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
              <div>
                <p className="font-bold">Prescription Verification Reminder</p>
                <p className="mt-0.5">
                  One or more medicines in this order require a valid prescription from{" "}
                  <strong>{selectedDoctor?.name}</strong>.
                </p>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-3 gap-3 rounded-2xl border border-[#dcece2] bg-[#f8fcfa] p-3.5">
            <div>
              <p className="text-[10px] font-bold uppercase text-[#5b796b]">Patient</p>
              <p className="mt-0.5 font-bold text-[#0f241d]">{patientName}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-[#5b796b]">Mobile</p>
              <p className="mt-0.5 font-mono-id font-bold text-[#0f241d]">
                {patientPhone}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-[#5b796b]">
                Reference Doctor
              </p>
              <p className="mt-0.5 font-bold text-[#0f241d]">
                {selectedDoctor?.name ?? "—"}
              </p>
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto rounded-2xl border border-[#dcece2] divide-y divide-[#ebf4ee]">
            {cartSummary.rows.map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between gap-3 bg-white px-3.5 py-2.5"
              >
                <div>
                  <p className="font-bold text-[#0f241d]">{item.medicineName}</p>
                  <p className="text-[11px] text-[#5b796b]">
                    Batch {item.batchNumber} · Exp {item.expiryLabel} · {item.quantity}{" "}
                    {item.sellMode === "SHEET" ? "sheet(s)" : "unit(s)"} ({item.basicUnits}{" "}
                    units)
                  </p>
                </div>
                <span className="font-mono-id font-bold text-[#0d4a38]">
                  ₹{item.lineTotal.toFixed(2)}
                </span>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-[#cfe2d6] bg-[#eef7f1] p-4 space-y-1.5">
            <div className="flex justify-between text-[#466356]">
              <span>Total Items ({cartSummary.totalUnits} units)</span>
              <span className="text-[11px] font-semibold text-[#0d4a38]">
                GST % mentioned on invoice
              </span>
            </div>
            <div className="flex justify-between border-t border-[#c4e2d0] pt-2 font-display text-base font-extrabold text-[#0d4a38]">
              <span>Grand Total ({paymentMode})</span>
              <span className="font-mono-id">₹{cartSummary.grandTotal.toFixed(2)}</span>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <BubblyButton variant="outline" onClick={() => setConfirmOpen(false)}>
              Back
            </BubblyButton>
            <BubblyButton
              disabled={submittingSale}
              onClick={handleConfirmSale}
            >
              <CheckCircle2 className="h-4 w-4" />
              {submittingSale ? "Completing Sale..." : "Confirm Sale ↵"}
            </BubblyButton>
          </div>
        </div>
      </AnimatedModal>

      {/* Post-Sale Print Receipt Pop-up */}
      <AnimatedModal
        open={Boolean(completedSale)}
        onClose={() => {
          setCompletedSale(null);
          focusPreferredSearch();
        }}
        title="Sale Completed Successfully"
        subtitle={completedSale ? `Invoice ${completedSale.saleNumber}` : undefined}
      >
        {completedSale ? (
          <div className="space-y-5 text-center">
            <motion.div
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 380, damping: 20 }}
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"
            >
              <CheckCircle2 className="h-9 w-9" />
            </motion.div>

            <div className="space-y-1">
              <p className="font-display text-2xl font-extrabold font-mono-id text-[#0d4a38]">
                ₹{completedSale.totalAmount.toFixed(2)}
              </p>
              <p className="text-xs text-[#466356]">
                {completedSale.patientName} ({completedSale.patientPhone}) · Ref Dr:{" "}
                <strong>{completedSale.doctorName}</strong>
              </p>
              <p className="text-[11px] text-[#5b796b]">
                {completedSale.totalUnitsSold} unit(s) dispensed · {completedSale.paymentMode}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <a
                href={`/print/pharmacy-sale/${encodeURIComponent(completedSale.id)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#0d4a38] to-[#059669] px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:opacity-95"
              >
                <Printer className="h-4 w-4" />
                Print Receipt
              </a>
              <BubblyButton
                variant="outline"
                onClick={() => {
                  setCompletedSale(null);
                  focusPreferredSearch();
                }}
              >
                New Sale
              </BubblyButton>
            </div>
          </div>
        ) : null}
      </AnimatedModal>

      {/* Inspect Historical Sale Modal */}
      <AnimatedModal
        open={Boolean(inspectSale)}
        onClose={() => setInspectSale(null)}
        title={`Sale Receipt · ${inspectSale?.saleNumber ?? ""}`}
        subtitle={
          inspectSale
            ? `${inspectSale.patientName} (${inspectSale.patientPhone}) · Ref Dr: ${inspectSale.doctorName}`
            : undefined
        }
        maxWidth="max-w-2xl"
      >
        {inspectSale ? (
          <div className="space-y-4 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[#5b796b]">
              <span>Date: {formatAccurateDateTime(inspectSale.soldAt)}</span>
              <span>
                Dispensed by: <strong className="text-[#0f241d]">{inspectSale.soldByNameSnapshot}</strong> · {inspectSale.paymentMode}
              </span>
            </div>

            <div className="space-y-2">
              {inspectSale.items.map((it) => (
                <div
                  key={it.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[#e3efe7] bg-[#f8fcfa] p-3"
                >
                  <div>
                    <p className="font-bold text-[#0f241d]">
                      {it.medicineNameSnapshot}
                    </p>
                    <p className="text-[11px] text-[#5b796b]">
                      Batch {it.batchNumberSnapshot} · Exp {it.expiryDateSnapshot} ·{" "}
                      {it.enteredQuantity} {it.sellMode === "SHEET" ? "sh" : "u"} (
                      {it.basicUnitsDeducted} units) · GST {it.gstPercentSnapshot}%
                    </p>
                  </div>
                  <span className="font-mono-id font-bold text-[#0d4a38]">
                    ₹{it.lineTotal.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between rounded-xl bg-[#eef7f1] p-3.5 font-bold text-[#0d4a38]">
              <span>Grand Total (GST % mentioned on invoice)</span>
              <span className="font-mono-id text-base">
                ₹{inspectSale.totalAmount.toFixed(2)}
              </span>
            </div>

            <div className="flex justify-end gap-2">
              <BubblyButton variant="outline" onClick={() => setInspectSale(null)}>
                Close
              </BubblyButton>
              <a
                href={`/print/pharmacy-sale/${encodeURIComponent(inspectSale.id)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#0d4a38] to-[#059669] px-4 py-2 text-xs font-semibold text-white"
              >
                <Printer className="h-3.5 w-3.5" />
                Print Receipt
              </a>
            </div>
          </div>
        ) : null}
      </AnimatedModal>
    </div>
  );
}
