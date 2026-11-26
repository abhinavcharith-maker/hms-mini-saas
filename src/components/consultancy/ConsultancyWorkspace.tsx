"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  FlaskConical,
  Pill,
  Plus,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Stethoscope,
  Trash2,
  UserCheck,
  UserRound,
  X,
} from "lucide-react";
import {
  AnimatedModal,
  BubblyButton,
  EmptyState,
  SkeletonBox,
  SpringCard,
  StatusBadge,
} from "@/components/ui/MotionPrimitives";
import { DEFAULT_PAGE_SIZE, PaginationBar } from "@/components/ui/PaginationBar";
import { useToast } from "@/components/providers/AppProviders";
import { PHARMACY_MODE, type PharmacyMode } from "@/lib/constants";
import { formatAccurateDateTime, getLocalDateInputValue } from "@/lib/datetime";

interface DoctorBrief {
  id: string;
  name: string;
  specialty: string | null;
  qualification: string | null;
}

interface PharmacyStockLite {
  id: string;
  name: string;
  packagingType: string;
  unitsPerSheet: number;
  validUnits: number;
}

interface CatalogLite {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
}

interface PharmacyAccountLite {
  id: string;
  pharmacyName: string;
  contactPerson: string;
  phone: string;
}

interface LabAccountLite {
  id: string;
  labName: string;
  contactPerson: string;
  phone: string;
}

interface ConsultationVisitRow {
  id: string;
  visitNumber: string;
  visitDate: string;
  consultancyCompletedAt: string | null;
  reasonForVisit: string | null;
  doctorId: string | null;
  doctorNameSnapshot: string;
  patient: {
    id: string;
    uhid: string;
    fullName: string;
    age: number | null;
    gender: string;
    phone: string;
  };
  doctor: DoctorBrief | null;
  doctorPrescriptions: Array<{
    id: string;
    status: string;
    prescribedAt: string;
    notes: string | null;
    items: Array<{
      id: string;
      medicineNameSnapshot: string;
      quantityUnits: number;
      dosageInstructions: string | null;
    }>;
  }>;
  pharmacyReferrals: Array<{
    id: string;
    referralNumber: string;
    pharmacyNameSnapshot: string;
    status: string;
    referredAt: string;
    items: Array<{
      id: string;
      medicineNameSnapshot: string;
      quantity: number;
      dosageInstructions: string | null;
    }>;
  }>;
  labReferrals: Array<{
    id: string;
    referralNumber: string;
    labNameSnapshot: string;
    status: string;
    referredAt: string;
    items: Array<{
      id: string;
      testNameSnapshot: string;
    }>;
  }>;
}

interface DraftMedicineItem {
  key: string;
  pharmacyMedicineId?: string | null;
  medicineCatalogId?: string | null;
  medicineName: string;
  quantityUnits: number;
  dosageSchedule: string;
  mealTiming: "AFTER_MEAL" | "BEFORE_MEAL";
  dosageInstructions: string;
  isNewCatalogEntry?: boolean;
}

interface DraftLabItem {
  key: string;
  labTestCatalogId?: string | null;
  testName: string;
  isNewCatalogEntry?: boolean;
}

type HistoryRange = "today" | "yesterday" | "3d" | "7d" | "custom";

export function ConsultancyWorkspace({
  viewerMode,
}: {
  viewerMode: "ADMIN" | "DOCTOR";
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [pharmacyMode, setPharmacyMode] = useState<PharmacyMode>(
    PHARMACY_MODE.REFERRALS
  );
  const [doctors, setDoctors] = useState<DoctorBrief[]>([]);
  const [selectedDoctorFilter, setSelectedDoctorFilter] = useState<string>("ALL");
  const [pendingVisits, setPendingVisits] = useState<ConsultationVisitRow[]>([]);
  const [submittedVisits, setSubmittedVisits] = useState<ConsultationVisitRow[]>([]);
  const [pharmacyMedicines, setPharmacyMedicines] = useState<PharmacyStockLite[]>([]);
  const [medicineCatalog, setMedicineCatalog] = useState<CatalogLite[]>([]);
  const [pharmacyAccounts, setPharmacyAccounts] = useState<PharmacyAccountLite[]>([]);
  const [labTestCatalog, setLabTestCatalog] = useState<CatalogLite[]>([]);
  const [labAccounts, setLabAccounts] = useState<LabAccountLite[]>([]);

  // Top Patient Search + Selection Bar state (only uncompleted today visits!)
  const [patientSearch, setPatientSearch] = useState("");
  const [patientDropdownOpen, setPatientDropdownOpen] = useState(false);
  const [patientHighlightIdx, setPatientHighlightIdx] = useState(0);
  const [patientPickerOpen, setPatientPickerOpen] = useState(false);
  const [selectedVisitId, setSelectedVisitId] = useState<string>("");
  const patientWrapRef = useRef<HTMLDivElement | null>(null);
  const patientPickerWrapRef = useRef<HTMLDivElement | null>(null);
  const patientSearchRef = useRef<HTMLInputElement | null>(null);

  // Medicine prescription composer state
  const [selectedPharmacyAccountId, setSelectedPharmacyAccountId] = useState("");
  const [medQuery, setMedQuery] = useState("");
  const [medDropdownOpen, setMedDropdownOpen] = useState(false);
  const [medHighlightIdx, setMedHighlightIdx] = useState(0);
  const [pickedStockMed, setPickedStockMed] = useState<PharmacyStockLite | null>(null);
  const [pickedCatalogMed, setPickedCatalogMed] = useState<CatalogLite | null>(null);
  const [medQty, setMedQty] = useState("1");
  const [doseMorning, setDoseMorning] = useState("0");
  const [doseAfternoon, setDoseAfternoon] = useState("0");
  const [doseEvening, setDoseEvening] = useState("0");
  const [mealTiming, setMealTiming] = useState<"AFTER_MEAL" | "BEFORE_MEAL">(
    "AFTER_MEAL"
  );
  const medNameRef = useRef<HTMLInputElement | null>(null);
  const medQtyRef = useRef<HTMLInputElement | null>(null);
  const morningRef = useRef<HTMLInputElement | null>(null);
  const afternoonRef = useRef<HTMLInputElement | null>(null);
  const eveningRef = useRef<HTMLInputElement | null>(null);
  const [medNotes, setMedNotes] = useState("");
  const [draftMeds, setDraftMeds] = useState<DraftMedicineItem[]>([]);

  // Laboratory referral composer state
  const [selectedLabAccountId, setSelectedLabAccountId] = useState("");
  const [labQuery, setLabQuery] = useState("");
  const [labDropdownOpen, setLabDropdownOpen] = useState(false);
  const [labHighlightIdx, setLabHighlightIdx] = useState(0);
  const [pickedLabTest, setPickedLabTest] = useState<CatalogLite | null>(null);
  const labNameRef = useRef<HTMLInputElement | null>(null);
  const [labNotes, setLabNotes] = useState("");
  const [draftLabs, setDraftLabs] = useState<DraftLabItem[]>([]);

  // Unified Consultation Confirmation Modal state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submittingAll, setSubmittingAll] = useState(false);

  // Bottom Submitted Consultations History state (default: Today, with past-days selector & 100/page pagination)
  const [historyRange, setHistoryRange] = useState<HistoryRange>("today");
  const [historyDate, setHistoryDate] = useState<string>(() =>
    getLocalDateInputValue()
  );
  const [historySearch, setHistorySearch] = useState("");
  const [historyPage, setHistoryPage] = useState(1);

  const loadWorkspaceData = useCallback(async () => {
    try {
      const tzOffset = new Date().getTimezoneOffset();
      const params = new URLSearchParams({
        tzOffset: String(tzOffset),
        historyRange,
      });
      if (historyRange === "custom" && historyDate) {
        params.set("historyDate", historyDate);
      }
      if (viewerMode === "ADMIN" && selectedDoctorFilter !== "ALL") {
        params.set("doctorId", selectedDoctorFilter);
      }

      const res = await fetch(`/api/consultancy/today?${params.toString()}`, {
        cache: "no-store",
      });
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      if (!res.ok) return;
      const d = await res.json();

      setPharmacyMode(d.pharmacyMode ?? PHARMACY_MODE.REFERRALS);
      setDoctors(d.doctors ?? []);
      const pending: ConsultationVisitRow[] = d.pendingVisits ?? [];
      setPendingVisits(pending);
      setSubmittedVisits(d.submittedVisits ?? []);
      setPharmacyMedicines(d.pharmacyMedicines ?? []);
      setMedicineCatalog(d.medicineCatalog ?? []);

      const pharms: PharmacyAccountLite[] = d.pharmacyAccounts ?? [];
      setPharmacyAccounts(pharms);
      if (pharms.length === 1) {
        setSelectedPharmacyAccountId((prev) => prev || pharms[0].id);
      }

      setLabTestCatalog(d.labTestCatalog ?? []);
      const labs: LabAccountLite[] = d.labAccounts ?? [];
      setLabAccounts(labs);
      if (labs.length === 1) {
        setSelectedLabAccountId((prev) => prev || labs[0].id);
      }

      // If currently selected patient was completed or is no longer in pending queue, clear selection
      setSelectedVisitId((prev) =>
        prev && pending.some((v) => v.id === prev) ? prev : ""
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [viewerMode, selectedDoctorFilter, historyRange, historyDate]);

  useEffect(() => {
    void loadWorkspaceData();
  }, [loadWorkspaceData]);

  // Outside click closes Patient Search dropdown & Custom Patient Picker
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (
        patientWrapRef.current &&
        !patientWrapRef.current.contains(e.target as Node)
      ) {
        setPatientDropdownOpen(false);
      }
      if (
        patientPickerWrapRef.current &&
        !patientPickerWrapRef.current.contains(e.target as Node)
      ) {
        setPatientPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  // Immediately place cursor directly in Medicine Name right after selecting a patient
  useEffect(() => {
    if (!selectedVisitId) return;
    const raf = window.requestAnimationFrame(() => {
      medNameRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [selectedVisitId]);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await loadWorkspaceData();
  };

  const selectedVisit = useMemo(
    () => pendingVisits.find((v) => v.id === selectedVisitId) ?? null,
    [pendingVisits, selectedVisitId]
  );

  const matchingPendingVisits = useMemo(() => {
    const q = patientSearch.trim().toLowerCase();
    if (!q) return pendingVisits.slice(0, 15);
    return pendingVisits
      .filter(
        (v) =>
          v.patient.fullName.toLowerCase().includes(q) ||
          v.patient.uhid.toLowerCase().includes(q) ||
          v.patient.phone.includes(q) ||
          v.visitNumber.toLowerCase().includes(q) ||
          (v.doctor?.name ?? v.doctorNameSnapshot).toLowerCase().includes(q)
      )
      .sort((a, b) => {
        const aStarts = a.patient.fullName.toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts = b.patient.fullName.toLowerCase().startsWith(q) ? 0 : 1;
        return aStarts - bStarts;
      })
      .slice(0, 15);
  }, [pendingVisits, patientSearch]);

  const filteredStockMeds = useMemo(() => {
    const q = medQuery.trim().toLowerCase();
    if (!q) return pharmacyMedicines.slice(0, 12);
    return pharmacyMedicines
      .filter((m) => m.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        const aStock = a.validUnits > 0 ? 0 : 1;
        const bStock = b.validUnits > 0 ? 0 : 1;
        if (aStock !== bStock) return aStock - bStock;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 12);
  }, [pharmacyMedicines, medQuery]);

  const filteredCatalogMeds = useMemo(() => {
    const q = medQuery.trim().toLowerCase();
    if (!q) return medicineCatalog.slice(0, 12);
    return medicineCatalog
      .filter((m) => m.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 12);
  }, [medicineCatalog, medQuery]);

  const filteredLabTests = useMemo(() => {
    const q = labQuery.trim().toLowerCase();
    if (!q) return labTestCatalog.slice(0, 12);
    return labTestCatalog
      .filter((t) => t.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 12);
  }, [labTestCatalog, labQuery]);

  const resetComposer = () => {
    setDraftMeds([]);
    setDraftLabs([]);
    setConfirmOpen(false);
    setMedNotes("");
    setLabNotes("");
    setMedQuery("");
    setLabQuery("");
    setMedQty("1");
    setDoseMorning("0");
    setDoseAfternoon("0");
    setDoseEvening("0");
    setMealTiming("AFTER_MEAL");
    setMedHighlightIdx(0);
    setLabHighlightIdx(0);
    setPickedStockMed(null);
    setPickedCatalogMed(null);
    setPickedLabTest(null);
  };

  const handleSelectVisit = (visitId: string) => {
    setPatientSearch("");
    setPatientDropdownOpen(false);
    setPatientPickerOpen(false);
    setPatientHighlightIdx(0);
    if (visitId === selectedVisitId) {
      if (visitId) {
        window.requestAnimationFrame(() => {
          medNameRef.current?.focus();
        });
      }
      return;
    }
    setSelectedVisitId(visitId);
    resetComposer();
  };

  const focusMedQty = () => {
    window.requestAnimationFrame(() => {
      medQtyRef.current?.focus();
      medQtyRef.current?.select();
    });
  };

  const selectStockMed = (m: PharmacyStockLite) => {
    setPickedStockMed(m);
    setMedQuery(m.name);
    setMedDropdownOpen(false);
    setMedHighlightIdx(0);
    focusMedQty();
  };

  const selectCatalogMed = (m: CatalogLite) => {
    setPickedCatalogMed(m);
    setMedQuery(m.name);
    setMedDropdownOpen(false);
    setMedHighlightIdx(0);
    focusMedQty();
  };

  const handleAddMedicineRow = () => {
    const cleanName = medQuery.trim();
    if (!cleanName) {
      toast({
        type: "error",
        title: "Enter Medicine Name",
        message: "Select or type a medicine name first.",
      });
      return;
    }
    const qtyNum = Number.parseInt(medQty, 10);
    if (!Number.isInteger(qtyNum) || qtyNum < 1) {
      toast({
        type: "error",
        title: "Invalid Quantity",
        message: "Quantity must be a whole number of at least 1 unit.",
      });
      focusMedQty();
      return;
    }

    const mNum = Number.parseInt(doseMorning.trim() || "0", 10) || 0;
    const aNum = Number.parseInt(doseAfternoon.trim() || "0", 10) || 0;
    const eNum = Number.parseInt(doseEvening.trim() || "0", 10) || 0;
    if (mNum <= 0 && aNum <= 0 && eNum <= 0) {
      toast({
        type: "warning",
        title: "Specify Medicine Timing",
        message:
          "Enter at least one non-zero dose in Morning, Afternoon, or Night timing (0 | 0 | 0 is not accepted).",
      });
      window.requestAnimationFrame(() => {
        morningRef.current?.focus();
        morningRef.current?.select();
      });
      return;
    }

    const dosageSchedule = `${mNum}-${aNum}-${eNum}`;
    const mealLabel =
      mealTiming === "BEFORE_MEAL" ? "Before Meal" : "After Meal";
    const combinedDosage = `${dosageSchedule} · ${mealLabel}`;

    if (pharmacyMode === PHARMACY_MODE.MANAGEMENT) {
      const matched =
        pickedStockMed &&
        pickedStockMed.name.toLowerCase() === cleanName.toLowerCase()
          ? pickedStockMed
          : pharmacyMedicines.find(
              (m) => m.name.trim().toLowerCase() === cleanName.toLowerCase()
            ) ?? null;

      setDraftMeds((prev) => [
        ...prev,
        {
          key: `${Date.now()}-${Math.random()}`,
          pharmacyMedicineId: matched?.id ?? null,
          medicineName: matched?.name ?? cleanName,
          quantityUnits: qtyNum,
          dosageSchedule,
          mealTiming,
          dosageInstructions: combinedDosage,
        },
      ]);
    } else {
      const matched =
        pickedCatalogMed &&
        pickedCatalogMed.name.toLowerCase() === cleanName.toLowerCase()
          ? pickedCatalogMed
          : medicineCatalog.find(
              (m) => m.name.trim().toLowerCase() === cleanName.toLowerCase()
            ) ?? null;

      setDraftMeds((prev) => [
        ...prev,
        {
          key: `${Date.now()}-${Math.random()}`,
          medicineCatalogId: matched?.id ?? null,
          medicineName: matched?.name ?? cleanName,
          quantityUnits: qtyNum,
          dosageSchedule,
          mealTiming,
          dosageInstructions: combinedDosage,
          isNewCatalogEntry: !matched,
        },
      ]);
    }

    setMedQuery("");
    setPickedStockMed(null);
    setPickedCatalogMed(null);
    setMedQty("1");
    setDoseMorning("0");
    setDoseAfternoon("0");
    setDoseEvening("0");
    setMealTiming("AFTER_MEAL");
    setMedHighlightIdx(0);
    setMedDropdownOpen(false);
    window.requestAnimationFrame(() => {
      medNameRef.current?.focus();
    });
  };

  const handleAddLabRow = (explicitTest?: CatalogLite) => {
    const cleanName = (explicitTest?.name ?? labQuery).trim();
    if (!cleanName) {
      toast({
        type: "error",
        title: "Enter Lab Test Name",
        message: "Select or type a laboratory test name first.",
      });
      return;
    }

    const matched =
      explicitTest ??
      (pickedLabTest &&
      pickedLabTest.name.toLowerCase() === cleanName.toLowerCase()
        ? pickedLabTest
        : labTestCatalog.find(
            (t) => t.name.trim().toLowerCase() === cleanName.toLowerCase()
          ) ?? null);

    if (
      draftLabs.some(
        (d) =>
          d.testName.trim().toLowerCase() ===
          (matched?.name ?? cleanName).toLowerCase()
      )
    ) {
      toast({
        type: "info",
        title: "Already Added",
        message: `"${matched?.name ?? cleanName}" is already in the test list.`,
      });
      return;
    }

    setDraftLabs((prev) => [
      ...prev,
      {
        key: `${Date.now()}-${Math.random()}`,
        labTestCatalogId: matched?.id ?? null,
        testName: matched?.name ?? cleanName,
        isNewCatalogEntry: !matched,
      },
    ]);
    setLabQuery("");
    setPickedLabTest(null);
    setLabHighlightIdx(0);
    setLabDropdownOpen(false);
    window.requestAnimationFrame(() => {
      labNameRef.current?.focus();
    });
  };

  // Mouse-clicked unified Confirm button (accepts both, either, or neither!)
  const handleOpenUnifiedConfirm = () => {
    if (!selectedVisit) return;
    if (
      draftMeds.length > 0 &&
      pharmacyMode === PHARMACY_MODE.REFERRALS &&
      !selectedPharmacyAccountId
    ) {
      toast({
        type: "error",
        title: "Select Pharmacy Supplier",
        message: "Please choose a pharmacy supplier for the prescribed medicines.",
      });
      return;
    }
    if (draftLabs.length > 0 && !selectedLabAccountId) {
      toast({
        type: "error",
        title: "Select Laboratory Partner",
        message: "Please choose a laboratory partner for the referred tests.",
      });
      return;
    }
    setConfirmOpen(true);
  };

  const handleConfirmCompleteConsultation = useCallback(async () => {
    if (!selectedVisit || submittingAll) return;

    setSubmittingAll(true);
    try {
      const res = await fetch("/api/consultancy/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opVisitId: selectedVisit.id,
          pharmacyAccountId:
            draftMeds.length > 0 && pharmacyMode === PHARMACY_MODE.REFERRALS
              ? selectedPharmacyAccountId
              : null,
          medNotes: draftMeds.length > 0 ? medNotes.trim() || null : null,
          medicines: draftMeds.map((m) => ({
            pharmacyMedicineId: m.pharmacyMedicineId ?? null,
            medicineCatalogId: m.medicineCatalogId ?? null,
            medicineName: m.medicineName,
            quantityUnits: m.quantityUnits,
            dosageSchedule: m.dosageSchedule,
            mealTiming: m.mealTiming,
            dosageInstructions: m.dosageInstructions || null,
          })),
          labAccountId: draftLabs.length > 0 ? selectedLabAccountId : null,
          labNotes: draftLabs.length > 0 ? labNotes.trim() || null : null,
          labTests: draftLabs.map((l) => ({
            labTestCatalogId: l.labTestCatalogId ?? null,
            testName: l.testName,
          })),
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast({
          type: "error",
          title: "Consultation Completion Failed",
          message: d.error || "Unable to complete consultation.",
        });
        return;
      }

      const parts: string[] = [];
      if (draftMeds.length > 0) parts.push(`${draftMeds.length} medicine(s)`);
      if (draftLabs.length > 0) parts.push(`${draftLabs.length} lab test(s)`);
      const detailText =
        parts.length > 0
          ? `Submitted ${parts.join(" & ")} for ${selectedVisit.patient.fullName}.`
          : `Completed consultation (advice/checkup only) for ${selectedVisit.patient.fullName}.`;

      toast({
        type: "success",
        title: "Consultation Completed",
        message: detailText,
      });

      setConfirmOpen(false);
      setSelectedVisitId("");
      resetComposer();
      await loadWorkspaceData();
      window.requestAnimationFrame(() => {
        patientSearchRef.current?.focus();
      });
    } finally {
      setSubmittingAll(false);
    }
  }, [
    selectedVisit,
    submittingAll,
    draftMeds,
    pharmacyMode,
    selectedPharmacyAccountId,
    medNotes,
    draftLabs,
    selectedLabAccountId,
    labNotes,
    toast,
    loadWorkspaceData,
  ]);

  // Press Return/Enter inside the Unified Confirmation Modal to confirm & complete immediately
  useEffect(() => {
    if (!confirmOpen || submittingAll) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        void handleConfirmCompleteConsultation();
      } else if (e.key === "Escape") {
        e.preventDefault();
        setConfirmOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmOpen, submittingAll, handleConfirmCompleteConsultation]);

  // Filter & paginate bottom Submitted Consultations list (100/page)
  const filteredSubmittedVisits = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return submittedVisits;
    return submittedVisits.filter((v) => {
      const medText = [
        ...v.doctorPrescriptions.flatMap((rx) =>
          rx.items.map((i) => i.medicineNameSnapshot)
        ),
        ...v.pharmacyReferrals.flatMap((ref) =>
          ref.items.map((i) => i.medicineNameSnapshot)
        ),
      ]
        .join(" ")
        .toLowerCase();
      const labText = v.labReferrals
        .flatMap((ref) => ref.items.map((i) => i.testNameSnapshot))
        .join(" ")
        .toLowerCase();
      return (
        v.patient.fullName.toLowerCase().includes(q) ||
        v.patient.uhid.toLowerCase().includes(q) ||
        v.patient.phone.includes(q) ||
        v.visitNumber.toLowerCase().includes(q) ||
        (v.doctor?.name ?? v.doctorNameSnapshot).toLowerCase().includes(q) ||
        medText.includes(q) ||
        labText.includes(q)
      );
    });
  }, [submittedVisits, historySearch]);

  const totalHistoryPages = Math.max(
    1,
    Math.ceil(filteredSubmittedVisits.length / DEFAULT_PAGE_SIZE)
  );
  const safeHistoryPage = Math.min(historyPage, totalHistoryPages);
  const paginatedSubmittedVisits = filteredSubmittedVisits.slice(
    (safeHistoryPage - 1) * DEFAULT_PAGE_SIZE,
    safeHistoryPage * DEFAULT_PAGE_SIZE
  );

  if (forbidden) {
    return (
      <SpringCard className="p-8 text-center">
        <p className="font-display text-lg font-bold text-[#0f241d]">
          Consultancy Access Restricted
        </p>
        <p className="mt-1 text-sm text-[#466356]">
          The Consultancy workspace is available exclusively to Consulting Doctors and Hospital Administrators.
        </p>
      </SpringCard>
    );
  }

  return (
    <div className="space-y-6">
      {/* Clean Page Header (Heading Only) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h1 className="font-display text-2xl font-extrabold text-[#0f241d]">
            {viewerMode === "DOCTOR" ? "Doctor Consultancy" : "Consultancy Desk"}
          </h1>
          <span className="rounded-full border border-[#cde4d6] bg-[#eef7f1] px-2.5 py-0.5 text-[11px] font-bold text-[#0d4a38]">
            {pendingVisits.length} Pending Today
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {viewerMode === "ADMIN" ? (
            <select
              value={selectedDoctorFilter}
              onChange={(e) => {
                setSelectedDoctorFilter(e.target.value);
                setHistoryPage(1);
              }}
              className="rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2 text-xs font-semibold text-[#0f241d] focus:border-emerald-500 focus:outline-none"
            >
              <option value="ALL">All Consulting Doctors</option>
              {doctors.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.name}
                  {doc.specialty ? ` (${doc.specialty})` : ""}
                </option>
              ))}
            </select>
          ) : null}

          <BubblyButton
            variant="outline"
            onClick={() => void handleManualRefresh()}
            disabled={refreshing}
            className="px-3.5 py-2 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </BubblyButton>
        </div>
      </div>

      {loading ? (
        <div className="space-y-5">
          <SkeletonBox className="h-[460px]" />
          <SkeletonBox className="h-64" />
        </div>
      ) : (
        <>
          {/* ===================================================================== */}
          {/* HUGE UNIFIED CONSULTATION WORKBENCH BOX (Sell-Medicine Inspired)      */}
          {/* ===================================================================== */}
          <SpringCard className="p-5 sm:p-6 space-y-5 bg-gradient-to-b from-white via-[#fcfefd] to-[#f8fcfa] border-[#d3e6db]">
            {/* Top Bar inside Huge Box: Patient Search Bar + Patient Selection Bar */}
            <div className="rounded-2xl border border-[#dcece2] bg-[#f4faf6]/90 p-4 space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#dff4e8] text-[#0d4a38]">
                    <UserRound className="h-4 w-4" />
                  </span>
                  <span className="font-display text-sm font-extrabold text-[#0f241d]">
                    Select Today&apos;s Patient
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-[#5b796b]">
                  {pendingVisits.length === 0
                    ? "All consultations completed for today"
                    : `${pendingVisits.length} patient(s) waiting for consultation`}
                </span>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {/* Search Bar for Patient (shows suggestions ONLY when typing) */}
                <div ref={patientWrapRef} className="relative">
                  <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#466356]">
                    Search Patient
                  </label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6c877a]" />
                    <input
                      ref={patientSearchRef}
                      type="text"
                      value={patientSearch}
                      onFocus={() => {
                        if (patientSearch.trim().length > 0) {
                          setPatientDropdownOpen(true);
                        }
                        setPatientHighlightIdx(0);
                      }}
                      onChange={(e) => {
                        const val = e.target.value;
                        setPatientSearch(val);
                        setPatientDropdownOpen(val.trim().length > 0);
                        setPatientHighlightIdx(0);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowDown") {
                          if (!patientSearch.trim()) return;
                          e.preventDefault();
                          setPatientDropdownOpen(true);
                          if (matchingPendingVisits.length > 0) {
                            setPatientHighlightIdx((prev) =>
                              Math.min(matchingPendingVisits.length - 1, prev + 1)
                            );
                          }
                        } else if (e.key === "ArrowUp") {
                          if (!patientSearch.trim()) return;
                          e.preventDefault();
                          setPatientDropdownOpen(true);
                          setPatientHighlightIdx((prev) => Math.max(0, prev - 1));
                        } else if (e.key === "Escape") {
                          setPatientDropdownOpen(false);
                        } else if (e.key === "Enter") {
                          e.preventDefault();
                          if (!patientSearch.trim()) return;
                          if (matchingPendingVisits.length > 0) {
                            const picked =
                              matchingPendingVisits[
                                Math.min(
                                  patientHighlightIdx,
                                  matchingPendingVisits.length - 1
                                )
                              ];
                            if (picked) handleSelectVisit(picked.id);
                          }
                        }
                      }}
                      placeholder="Type patient name, UHID, mobile, or OP number..."
                      className="w-full rounded-xl border border-[#cfe2d6] bg-white py-2.5 pl-10 pr-3.5 text-sm text-[#0f241d] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200/70 transition-shadow"
                    />
                  </div>

                  <AnimatePresence>
                    {patientDropdownOpen &&
                    patientSearch.trim().length > 0 &&
                    pendingVisits.length > 0 ? (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.14 }}
                        className="absolute left-0 right-0 top-full z-40 mt-1.5 max-h-64 overflow-y-auto rounded-2xl border border-[#cfe2d6] bg-white p-1.5 shadow-xl divide-y divide-[#eef5f0]"
                      >
                        {matchingPendingVisits.length === 0 ? (
                          <p className="px-3.5 py-2.5 text-xs text-[#5b796b]">
                            No pending patient matched &ldquo;{patientSearch.trim()}&rdquo;.
                          </p>
                        ) : (
                          matchingPendingVisits.map((v, idx) => {
                            const active = idx === patientHighlightIdx;
                            return (
                              <button
                                key={v.id}
                                type="button"
                                onMouseEnter={() => setPatientHighlightIdx(idx)}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  handleSelectVisit(v.id);
                                }}
                                className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-xs transition-colors cursor-pointer ${
                                  active
                                    ? "bg-[#dff4e8] text-[#0d4a38]"
                                    : "bg-white text-[#0f241d] hover:bg-[#f2faf5]"
                                }`}
                              >
                                <div className="min-w-0">
                                  <p className="font-bold truncate">
                                    {v.patient.fullName}
                                  </p>
                                  <p className="mt-0.5 font-mono-id text-[11px] text-[#466356]">
                                    {v.patient.uhid} · {v.visitNumber} · {v.patient.phone}
                                  </p>
                                </div>
                                <span className="shrink-0 rounded-full border border-[#d6e9de] bg-white px-2 py-0.5 text-[10px] font-bold text-[#466356]">
                                  {v.patient.age !== null ? `${v.patient.age}y` : "—"} /{" "}
                                  {v.patient.gender.charAt(0)}
                                </span>
                              </button>
                            );
                          })
                        )}
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>

                {/* Clean Custom Patient Selection Picker */}
                <div ref={patientPickerWrapRef} className="relative">
                  <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#466356]">
                    Select Patient
                  </label>
                  <button
                    type="button"
                    disabled={pendingVisits.length === 0}
                    onClick={() => setPatientPickerOpen((o) => !o)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setPatientPickerOpen(false);
                    }}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left text-sm transition-all cursor-pointer disabled:cursor-not-allowed disabled:bg-[#f1f6f3] disabled:text-[#7c9489] ${
                      patientPickerOpen
                        ? "border-emerald-500 bg-white ring-2 ring-emerald-200/70"
                        : "border-[#cfe2d6] bg-white hover:border-emerald-400"
                    }`}
                  >
                    {selectedVisit ? (
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#dff4e8] text-[11px] font-extrabold text-[#0d4a38]">
                          {selectedVisit.patient.fullName.charAt(0).toUpperCase()}
                        </span>
                        <span className="font-bold text-[#0f241d] truncate">
                          {selectedVisit.patient.fullName}
                        </span>
                        <span className="shrink-0 rounded-full bg-[#eef7f1] px-2 py-0.5 font-mono-id text-[10px] font-bold text-[#0d4a38]">
                          {selectedVisit.patient.uhid}
                        </span>
                      </div>
                    ) : (
                      <span className="font-medium text-[#5b796b] truncate">
                        {pendingVisits.length === 0
                          ? "No pending patients left today"
                          : `Choose from today's queue (${pendingVisits.length})...`}
                      </span>
                    )}
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-[#5b796b] transition-transform duration-200 ${
                        patientPickerOpen ? "rotate-180 text-[#0d4a38]" : ""
                      }`}
                    />
                  </button>

                  <AnimatePresence>
                    {patientPickerOpen && pendingVisits.length > 0 ? (
                      <motion.div
                        initial={{ opacity: 0, y: -6, scale: 0.99 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.99 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className="absolute left-0 right-0 top-full z-40 mt-1.5 max-h-72 overflow-y-auto rounded-2xl border border-[#cfe2d6] bg-white p-1.5 shadow-xl space-y-1"
                      >
                        {pendingVisits.map((v) => {
                          const isSelected = v.id === selectedVisitId;
                          return (
                            <button
                              key={v.id}
                              type="button"
                              onClick={() => handleSelectVisit(v.id)}
                              className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-all cursor-pointer ${
                                isSelected
                                  ? "bg-[#dff4e8] text-[#0d4a38] ring-1 ring-emerald-300/80"
                                  : "bg-white text-[#0f241d] hover:bg-[#f2faf5]"
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span
                                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${
                                    isSelected
                                      ? "bg-[#0d4a38] text-white"
                                      : "bg-[#eef7f1] text-[#0d4a38]"
                                  }`}
                                >
                                  {v.patient.fullName.charAt(0).toUpperCase()}
                                </span>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-bold text-xs truncate">
                                      {v.patient.fullName}
                                    </span>
                                    <span className="shrink-0 rounded-full border border-[#d6e9de] bg-white px-1.5 py-0.5 text-[10px] font-bold text-[#466356]">
                                      {v.patient.age !== null ? `${v.patient.age}y` : "—"} /{" "}
                                      {v.patient.gender.charAt(0)}
                                    </span>
                                  </div>
                                  <p className="mt-0.5 font-mono-id text-[11px] text-[#5b796b] truncate">
                                    {v.patient.uhid} · {v.visitNumber} · {v.patient.phone}
                                    {viewerMode === "ADMIN"
                                      ? ` · ${v.doctor?.name ?? v.doctorNameSnapshot}`
                                      : ""}
                                  </p>
                                </div>
                              </div>

                              {isSelected ? (
                                <Check className="h-4 w-4 shrink-0 text-[#0d4a38]" />
                              ) : null}
                            </button>
                          );
                        })}
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              </div>

              {/* Active Selected Patient Info Strip */}
              <AnimatePresence mode="wait">
                {selectedVisit ? (
                  <motion.div
                    key={selectedVisit.id}
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ type: "spring", stiffness: 420, damping: 32 }}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#bde0cc] bg-white px-4 py-3 shadow-2xs"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <UserCheck className="h-4 w-4 text-[#0d4a38] shrink-0" />
                        <span className="font-display text-sm sm:text-base font-extrabold text-[#0f241d]">
                          {selectedVisit.patient.fullName}
                        </span>
                        <span className="rounded-full bg-[#0d4a38] px-2.5 py-0.5 font-mono-id text-[10px] font-bold text-white">
                          {selectedVisit.patient.uhid}
                        </span>
                        <span className="rounded-full border border-[#cfe2d6] bg-[#f4faf6] px-2.5 py-0.5 font-mono-id text-[10px] font-bold text-[#0d4a38]">
                          {selectedVisit.visitNumber}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-[#466356]">
                        {selectedVisit.patient.age !== null
                          ? `${selectedVisit.patient.age} yrs`
                          : "Age N/A"}{" "}
                        · {selectedVisit.patient.gender} · Mobile:{" "}
                        <strong className="font-mono-id text-[#0f241d]">
                          {selectedVisit.patient.phone}
                        </strong>{" "}
                        · Doctor:{" "}
                        <strong className="text-[#0f241d]">
                          {selectedVisit.doctor?.name ??
                            selectedVisit.doctorNameSnapshot}
                        </strong>
                        {selectedVisit.reasonForVisit ? (
                          <>
                            {" "}
                            · Complaint:{" "}
                            <span className="font-semibold text-[#0f241d]">
                              {selectedVisit.reasonForVisit}
                            </span>
                          </>
                        ) : null}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[11px] font-medium text-[#5b796b]">
                        {formatAccurateDateTime(selectedVisit.visitDate)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleSelectVisit("")}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#d6e9de] bg-[#f8fcfa] px-2.5 py-1 text-[11px] font-semibold text-[#466356] hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 transition-colors cursor-pointer"
                      >
                        <X className="h-3 w-3" />
                        Change
                      </button>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>

            {/* Main Consultation Stage inside the Huge Box */}
            {!selectedVisit ? (
              <motion.div
                key="empty-stage"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.16 }}
                className="rounded-2xl border border-dashed border-[#cfe2d6] bg-[#fafdfb] py-12 px-6"
              >
                <EmptyState
                  icon={<Stethoscope className="h-6 w-6" />}
                  title={
                    pendingVisits.length === 0
                      ? "All Today's Consultations Completed"
                      : "Select a Patient Above to Begin Consultation"
                  }
                  description={
                    pendingVisits.length === 0
                      ? "New OP patients registered today will automatically appear in the search & selection bar above."
                      : "Search by name, UHID, or mobile — or pick directly from the selection bar to prescribe medicines and refer laboratory tests."
                  }
                />
              </motion.div>
            ) : (
              <motion.div
                key={`stage-${selectedVisit.id}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
                className="space-y-5"
              >
                  {/* Side-by-Side Subsections inside the Huge Box */}
                  <div className="grid gap-5 lg:grid-cols-2 items-start">
                    {/* Subsection A: Prescribe Medicines */}
                    <div className="rounded-2xl border border-[#d8eae0] bg-white p-4 sm:p-5 space-y-4 shadow-2xs">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#eaf4ee] pb-3">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#dff4e8] text-[#0d4a38]">
                            <Pill className="h-4 w-4" />
                          </span>
                          <h2 className="font-display text-sm sm:text-base font-extrabold text-[#0f241d]">
                            Prescribe Medicines
                          </h2>
                        </div>
                        <span className="rounded-full border border-[#cde4d6] bg-[#f4faf6] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#0d4a38]">
                          {pharmacyMode === PHARMACY_MODE.MANAGEMENT
                            ? "Pharmacy Queue"
                            : "Pharmacy Referral"}
                        </span>
                      </div>

                      {pharmacyMode === PHARMACY_MODE.REFERRALS ? (
                        <div>
                          <label className="mb-1 block text-xs font-semibold text-[#314c40]">
                            Pharmacy Supplier *
                          </label>
                          {pharmacyAccounts.length === 0 ? (
                            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                              No active pharmacy suppliers configured yet.
                            </p>
                          ) : (
                            <select
                              value={selectedPharmacyAccountId}
                              onChange={(e) =>
                                setSelectedPharmacyAccountId(e.target.value)
                              }
                              className="w-full rounded-xl border border-[#cfe2d6] bg-[#fafdfb] px-3 py-2 text-xs font-medium text-[#0f241d] focus:border-emerald-500 focus:bg-white focus:outline-none"
                            >
                              <option value="">Select pharmacy supplier...</option>
                              {pharmacyAccounts.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.pharmacyName} ({p.contactPerson} · {p.phone})
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      ) : null}

                      {/* Medicine Search + Qty + Timing + Meal Timing */}
                      <div className="space-y-3">
                        <div className="relative">
                          <label className="mb-1 block text-xs font-semibold text-[#314c40]">
                            Medicine Name
                          </label>
                          <input
                            ref={medNameRef}
                            type="text"
                            value={medQuery}
                            onFocus={() => {
                              if (medQuery.trim().length > 0) {
                                setMedDropdownOpen(true);
                              }
                              setMedHighlightIdx(0);
                            }}
                            onBlur={() =>
                              setTimeout(() => setMedDropdownOpen(false), 160)
                            }
                            onChange={(e) => {
                              const val = e.target.value;
                              setMedQuery(val);
                              setPickedStockMed(null);
                              setPickedCatalogMed(null);
                              setMedHighlightIdx(0);
                              setMedDropdownOpen(val.trim().length > 0);
                            }}
                            onKeyDown={(e) => {
                              const activeList =
                                pharmacyMode === PHARMACY_MODE.MANAGEMENT
                                  ? filteredStockMeds
                                  : filteredCatalogMeds;

                              if (e.key === "ArrowDown") {
                                if (!medQuery.trim()) return;
                                e.preventDefault();
                                setMedDropdownOpen(true);
                                if (activeList.length > 0) {
                                  setMedHighlightIdx((prev) =>
                                    Math.min(activeList.length - 1, prev + 1)
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
                                // Empty Medicine Name + Return: do NOTHING (must click Confirm with mouse)
                                if (!medQuery.trim()) return;
                                if (medDropdownOpen && activeList.length > 0) {
                                  const safeIdx = Math.min(
                                    medHighlightIdx,
                                    activeList.length - 1
                                  );
                                  if (pharmacyMode === PHARMACY_MODE.MANAGEMENT) {
                                    const picked = filteredStockMeds[safeIdx];
                                    if (picked) {
                                      selectStockMed(picked);
                                      return;
                                    }
                                  } else {
                                    const picked = filteredCatalogMeds[safeIdx];
                                    if (picked) {
                                      selectCatalogMed(picked);
                                      return;
                                    }
                                  }
                                }
                                setMedDropdownOpen(false);
                                focusMedQty();
                              }
                            }}
                            placeholder={
                              pharmacyMode === PHARMACY_MODE.MANAGEMENT
                                ? "Type medicine name to search stock..."
                                : "Type medicine name to search or add..."
                            }
                            className="w-full rounded-xl border border-[#cfe2d6] bg-[#fafdfb] px-3.5 py-2.5 text-sm text-[#0f241d] focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200/70 transition-all"
                          />

                          <AnimatePresence>
                            {medDropdownOpen && medQuery.trim().length > 0 ? (
                              <motion.div
                                initial={{ opacity: 0, y: -4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -4 }}
                                transition={{ duration: 0.12 }}
                                className="absolute left-0 right-0 top-full z-30 mt-1 max-h-52 overflow-y-auto rounded-2xl border border-[#cfe2d6] bg-white p-1.5 shadow-xl"
                              >
                                {pharmacyMode === PHARMACY_MODE.MANAGEMENT ? (
                                  filteredStockMeds.length === 0 ? (
                                    <p className="px-3 py-2 text-xs text-[#5b796b]">
                                      {medQuery.trim()
                                        ? `No exact stock match for "${medQuery.trim()}". Press Return to set qty & add by name.`
                                        : "No medicines in pharmacy stock yet."}
                                    </p>
                                  ) : (
                                    filteredStockMeds.map((m, idx) => {
                                      const active = idx === medHighlightIdx;
                                      return (
                                        <button
                                          key={m.id}
                                          type="button"
                                          onMouseEnter={() => setMedHighlightIdx(idx)}
                                          onMouseDown={(e) => {
                                            e.preventDefault();
                                            selectStockMed(m);
                                          }}
                                          className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs transition-colors cursor-pointer ${
                                            active
                                              ? "bg-[#dff4e8] text-[#0d4a38] ring-1 ring-emerald-300/80"
                                              : "bg-white text-[#0f241d] hover:bg-[#eef7f1]"
                                          }`}
                                        >
                                          <span className="font-semibold truncate">
                                            {m.name}
                                          </span>
                                          <span
                                            className={`shrink-0 rounded-full px-2 py-0.5 font-mono-id text-[10px] font-bold ${
                                              m.validUnits > 0
                                                ? "bg-emerald-100 text-emerald-800"
                                                : "bg-rose-100 text-rose-700"
                                            }`}
                                          >
                                            {m.validUnits > 0
                                              ? `${m.validUnits} avail`
                                              : "Out of stock"}
                                          </span>
                                        </button>
                                      );
                                    })
                                  )
                                ) : filteredCatalogMeds.length === 0 ? (
                                  <p className="flex items-center gap-1.5 px-3 py-2 text-xs text-emerald-800">
                                    <Sparkles className="h-3.5 w-3.5 shrink-0" />
                                    {medQuery.trim()
                                      ? `"${medQuery.trim()}" will be added to Medicine Catalog automatically.`
                                      : "Type a medicine name to search or add to catalog."}
                                  </p>
                                ) : (
                                  filteredCatalogMeds.map((m, idx) => {
                                    const active = idx === medHighlightIdx;
                                    return (
                                      <button
                                        key={m.id}
                                        type="button"
                                        onMouseEnter={() => setMedHighlightIdx(idx)}
                                        onMouseDown={(e) => {
                                          e.preventDefault();
                                          selectCatalogMed(m);
                                        }}
                                        className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs transition-colors cursor-pointer ${
                                          active
                                            ? "bg-[#dff4e8] text-[#0d4a38] ring-1 ring-emerald-300/80"
                                            : "bg-white text-[#0f241d] hover:bg-[#eef7f1]"
                                        }`}
                                      >
                                        <span className="font-semibold truncate">
                                          {m.name}
                                        </span>
                                        <span className="shrink-0 text-[10px] text-[#5b796b]">
                                          In Catalog
                                        </span>
                                      </button>
                                    );
                                  })
                                )}
                              </motion.div>
                            ) : null}
                          </AnimatePresence>
                        </div>

                        <div className="grid gap-3 grid-cols-12 items-end">
                          <div className="col-span-4">
                            <label className="mb-1 block text-xs font-semibold text-[#314c40]">
                              Qty (Units)
                            </label>
                            <input
                              ref={medQtyRef}
                              type="number"
                              min={1}
                              step={1}
                              value={medQty}
                              onFocus={(e) => e.currentTarget.select()}
                              onChange={(e) => setMedQty(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  morningRef.current?.focus();
                                  morningRef.current?.select();
                                }
                              }}
                              className="w-full rounded-xl border border-[#cfe2d6] bg-[#fafdfb] px-3 py-2 font-mono-id text-sm font-bold text-[#0f241d] focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200/70"
                            />
                          </div>

                          {/* M | A | E Timing Box (Default 0 | 0 | 0) */}
                          <div className="col-span-8">
                            <label className="mb-1 flex items-center justify-between text-xs font-semibold text-[#314c40]">
                              <span>Timing (M | A | E)</span>
                              <span className="text-[10px] font-medium text-[#5b796b]">
                                Morn | Aft | Night
                              </span>
                            </label>
                            <div className="flex items-center rounded-xl border border-[#cfe2d6] bg-[#fafdfb] px-2 py-1 focus-within:border-emerald-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-emerald-200/70">
                              <input
                                ref={morningRef}
                                type="text"
                                inputMode="numeric"
                                maxLength={1}
                                aria-label="Morning dose"
                                value={doseMorning}
                                onFocus={(e) => e.currentTarget.select()}
                                onChange={(e) => {
                                  const d = e.target.value
                                    .replace(/\D/g, "")
                                    .slice(0, 1);
                                  setDoseMorning(d);
                                  if (d.length === 1) {
                                    afternoonRef.current?.focus();
                                    afternoonRef.current?.select();
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "ArrowRight" || e.key === "Enter") {
                                    e.preventDefault();
                                    afternoonRef.current?.focus();
                                    afternoonRef.current?.select();
                                  }
                                }}
                                placeholder="0"
                                className="w-full bg-transparent py-1 text-center font-mono-id text-sm font-extrabold text-[#0f241d] focus:outline-none"
                              />
                              <span className="select-none px-1 font-mono-id text-base font-extrabold text-emerald-700">
                                |
                              </span>
                              <input
                                ref={afternoonRef}
                                type="text"
                                inputMode="numeric"
                                maxLength={1}
                                aria-label="Afternoon dose"
                                value={doseAfternoon}
                                onFocus={(e) => e.currentTarget.select()}
                                onChange={(e) => {
                                  const d = e.target.value
                                    .replace(/\D/g, "")
                                    .slice(0, 1);
                                  setDoseAfternoon(d);
                                  if (d.length === 1) {
                                    eveningRef.current?.focus();
                                    eveningRef.current?.select();
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Backspace" && !doseAfternoon) {
                                    morningRef.current?.focus();
                                    morningRef.current?.select();
                                  } else if (e.key === "ArrowLeft") {
                                    e.preventDefault();
                                    morningRef.current?.focus();
                                    morningRef.current?.select();
                                  } else if (
                                    e.key === "ArrowRight" ||
                                    e.key === "Enter"
                                  ) {
                                    e.preventDefault();
                                    eveningRef.current?.focus();
                                    eveningRef.current?.select();
                                  }
                                }}
                                placeholder="0"
                                className="w-full bg-transparent py-1 text-center font-mono-id text-sm font-extrabold text-[#0f241d] focus:outline-none"
                              />
                              <span className="select-none px-1 font-mono-id text-base font-extrabold text-emerald-700">
                                |
                              </span>
                              <input
                                ref={eveningRef}
                                type="text"
                                inputMode="numeric"
                                maxLength={1}
                                aria-label="Evening dose"
                                value={doseEvening}
                                onFocus={(e) => e.currentTarget.select()}
                                onChange={(e) => {
                                  const d = e.target.value
                                    .replace(/\D/g, "")
                                    .slice(0, 1);
                                  setDoseEvening(d);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Backspace" && !doseEvening) {
                                    afternoonRef.current?.focus();
                                    afternoonRef.current?.select();
                                  } else if (e.key === "ArrowLeft") {
                                    e.preventDefault();
                                    afternoonRef.current?.focus();
                                    afternoonRef.current?.select();
                                  } else if (e.key === "Enter") {
                                    e.preventDefault();
                                    handleAddMedicineRow();
                                  }
                                }}
                                placeholder="0"
                                className="w-full bg-transparent py-1 text-center font-mono-id text-sm font-extrabold text-[#0f241d] focus:outline-none"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Meal Timing (Default: After Meal) + Add Medicine */}
                        <div className="flex flex-wrap items-center justify-between gap-2.5">
                          <div className="inline-flex rounded-xl border border-[#cfe2d6] bg-[#f4faf6] p-1">
                            <button
                              type="button"
                              onClick={() => setMealTiming("AFTER_MEAL")}
                              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                                mealTiming === "AFTER_MEAL"
                                  ? "bg-[#0d4a38] text-white shadow-xs"
                                  : "text-[#466356] hover:text-[#0f241d]"
                              }`}
                            >
                              After Meal
                            </button>
                            <button
                              type="button"
                              onClick={() => setMealTiming("BEFORE_MEAL")}
                              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                                mealTiming === "BEFORE_MEAL"
                                  ? "bg-[#0d4a38] text-white shadow-xs"
                                  : "text-[#466356] hover:text-[#0f241d]"
                              }`}
                            >
                              Before Meal
                            </button>
                          </div>

                          <BubblyButton
                            type="button"
                            variant="secondary"
                            onClick={handleAddMedicineRow}
                            className="px-4 py-2 text-xs"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Add Medicine
                          </BubblyButton>
                        </div>
                      </div>

                      {/* Added Medicines Cart */}
                      <AnimatePresence>
                        {draftMeds.length > 0 ? (
                          <motion.div
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            className="space-y-2 rounded-2xl border border-[#dcece2] bg-[#f7fbf9] p-3"
                          >
                            <div className="flex items-center justify-between text-[11px] font-bold text-[#466356] px-1">
                              <span>Medicine Cart ({draftMeds.length})</span>
                            </div>
                            <div className="space-y-1.5 max-h-52 overflow-y-auto pr-0.5">
                              {draftMeds.map((item) => (
                                <motion.div
                                  layout
                                  key={item.key}
                                  initial={{ opacity: 0, scale: 0.98 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  exit={{ opacity: 0, scale: 0.96 }}
                                  className="flex items-center justify-between gap-2 rounded-xl border border-[#e3efe7] bg-white px-3 py-2 text-xs"
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <span className="font-bold text-[#0f241d] truncate">
                                        {item.medicineName}
                                      </span>
                                      {item.isNewCatalogEntry ? (
                                        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                                          New
                                        </span>
                                      ) : null}
                                    </div>
                                    {item.dosageInstructions ? (
                                      <p className="mt-0.5 text-[11px] text-[#5b796b]">
                                        {item.dosageInstructions}
                                      </p>
                                    ) : null}
                                  </div>

                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <input
                                      type="number"
                                      min={1}
                                      step={1}
                                      aria-label={`Quantity for ${item.medicineName}`}
                                      value={item.quantityUnits}
                                      onFocus={(e) => e.currentTarget.select()}
                                      onChange={(e) => {
                                        const nextQty = Number.parseInt(
                                          e.target.value,
                                          10
                                        );
                                        if (!Number.isNaN(nextQty) && nextQty >= 1) {
                                          setDraftMeds((prev) =>
                                            prev.map((x) =>
                                              x.key === item.key
                                                ? { ...x, quantityUnits: nextQty }
                                                : x
                                            )
                                          );
                                        }
                                      }}
                                      className="w-14 rounded-lg border border-[#cfe2d6] bg-[#f8fcfa] px-2 py-1 text-center font-mono-id text-xs font-bold text-[#0d4a38] focus:border-emerald-500 focus:bg-white focus:outline-none"
                                    />
                                    <span className="text-[10px] font-semibold text-[#5b796b]">
                                      u
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setDraftMeds((prev) =>
                                          prev.filter((x) => x.key !== item.key)
                                        )
                                      }
                                      className="rounded-lg p-1 text-rose-600 hover:bg-rose-50 cursor-pointer"
                                      aria-label="Remove medicine"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </motion.div>
                              ))}
                            </div>

                            <input
                              type="text"
                              value={medNotes}
                              onChange={(e) => setMedNotes(e.target.value)}
                              placeholder="Optional pharmacy instructions..."
                              className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3 py-2 text-xs text-[#0f241d] focus:border-emerald-500 focus:outline-none"
                            />
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </div>

                    {/* Subsection B: Laboratory & Laboratory Tests */}
                    <div className="rounded-2xl border border-[#d6eae9] bg-white p-4 sm:p-5 space-y-4 shadow-2xs">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e8f3f2] pb-3">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#e3f5f4] text-teal-800">
                            <FlaskConical className="h-4 w-4" />
                          </span>
                          <h2 className="font-display text-sm sm:text-base font-extrabold text-[#0f241d]">
                            Laboratory &amp; Lab Tests
                          </h2>
                        </div>
                        <span className="rounded-full border border-teal-200/80 bg-[#f0faf9] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-teal-800">
                          Optional Referral
                        </span>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <label className="mb-1 block text-xs font-semibold text-[#314c40]">
                            Laboratory Partner
                          </label>
                          {labAccounts.length === 0 ? (
                            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                              No active labs configured yet.
                            </p>
                          ) : (
                            <select
                              value={selectedLabAccountId}
                              onChange={(e) =>
                                setSelectedLabAccountId(e.target.value)
                              }
                              className="w-full rounded-xl border border-[#cfe2d6] bg-[#fafdfb] px-3 py-2.5 text-xs font-medium text-[#0f241d] focus:border-teal-500 focus:bg-white focus:outline-none"
                            >
                              <option value="">Select lab partner...</option>
                              {labAccounts.map((l) => (
                                <option key={l.id} value={l.id}>
                                  {l.labName}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>

                        <div className="flex gap-2 items-end">
                          <div className="flex-1 relative">
                            <label className="mb-1 block text-xs font-semibold text-[#314c40]">
                              Laboratory Test Name
                            </label>
                            <input
                              ref={labNameRef}
                              type="text"
                              value={labQuery}
                              onFocus={() => {
                                if (labQuery.trim().length > 0) {
                                  setLabDropdownOpen(true);
                                }
                                setLabHighlightIdx(0);
                              }}
                              onBlur={() =>
                                setTimeout(() => setLabDropdownOpen(false), 160)
                              }
                              onChange={(e) => {
                                const val = e.target.value;
                                setLabQuery(val);
                                setPickedLabTest(null);
                                setLabHighlightIdx(0);
                                setLabDropdownOpen(val.trim().length > 0);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "ArrowDown") {
                                  if (!labQuery.trim()) return;
                                  e.preventDefault();
                                  setLabDropdownOpen(true);
                                  if (filteredLabTests.length > 0) {
                                    setLabHighlightIdx((prev) =>
                                      Math.min(filteredLabTests.length - 1, prev + 1)
                                    );
                                  }
                                } else if (e.key === "ArrowUp") {
                                  if (!labQuery.trim()) return;
                                  e.preventDefault();
                                  setLabDropdownOpen(true);
                                  setLabHighlightIdx((prev) =>
                                    Math.max(0, prev - 1)
                                  );
                                } else if (e.key === "Escape") {
                                  setLabDropdownOpen(false);
                                } else if (e.key === "Enter") {
                                  e.preventDefault();
                                  if (!labQuery.trim()) return;
                                  if (
                                    labDropdownOpen &&
                                    filteredLabTests.length > 0
                                  ) {
                                    const picked =
                                      filteredLabTests[
                                        Math.min(
                                          labHighlightIdx,
                                          filteredLabTests.length - 1
                                        )
                                      ];
                                    if (picked) {
                                      handleAddLabRow(picked);
                                      return;
                                    }
                                  }
                                  handleAddLabRow();
                                }
                              }}
                              placeholder="Type test name to search or add..."
                              className="w-full rounded-xl border border-[#cfe2d6] bg-[#fafdfb] px-3.5 py-2.5 text-sm text-[#0f241d] focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-200/60 transition-all"
                            />

                            <AnimatePresence>
                              {labDropdownOpen && labQuery.trim().length > 0 ? (
                                <motion.div
                                  initial={{ opacity: 0, y: -4 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0, y: -4 }}
                                  transition={{ duration: 0.12 }}
                                  className="absolute left-0 right-0 top-full z-30 mt-1 max-h-52 overflow-y-auto rounded-2xl border border-[#cfe2d6] bg-white p-1.5 shadow-xl"
                                >
                                  {filteredLabTests.length === 0 ? (
                                    <p className="flex items-center gap-1.5 px-3 py-2 text-xs text-teal-800">
                                      <Sparkles className="h-3.5 w-3.5 shrink-0" />
                                      {labQuery.trim()
                                        ? `"${labQuery.trim()}" will be added to Lab Test Catalog automatically.`
                                        : "Type a test name to search or create."}
                                    </p>
                                  ) : (
                                    filteredLabTests.map((t, idx) => {
                                      const active = idx === labHighlightIdx;
                                      return (
                                        <button
                                          key={t.id}
                                          type="button"
                                          onMouseEnter={() =>
                                            setLabHighlightIdx(idx)
                                          }
                                          onMouseDown={(e) => {
                                            e.preventDefault();
                                            handleAddLabRow(t);
                                          }}
                                          className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs transition-colors cursor-pointer ${
                                            active
                                              ? "bg-[#e3f5f4] text-teal-900 ring-1 ring-teal-300/70"
                                              : "bg-white text-[#0f241d] hover:bg-[#f0faf9]"
                                          }`}
                                        >
                                          <span className="font-semibold truncate">
                                            {t.name}
                                          </span>
                                          <span className="shrink-0 text-[10px] text-[#5b796b]">
                                            In Catalog
                                          </span>
                                        </button>
                                      );
                                    })
                                  )}
                                </motion.div>
                              ) : null}
                            </AnimatePresence>
                          </div>

                          <BubblyButton
                            type="button"
                            variant="outline"
                            onClick={() => handleAddLabRow()}
                            className="shrink-0 px-4 py-2.5 text-xs"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Add
                          </BubblyButton>
                        </div>
                      </div>

                      {/* Added Lab Tests */}
                      <AnimatePresence>
                        {draftLabs.length > 0 ? (
                          <motion.div
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            className="space-y-2.5 rounded-2xl border border-[#d8eceb] bg-[#f7fcfc] p-3"
                          >
                            <div className="text-[11px] font-bold text-teal-800 px-1">
                              Selected Lab Tests ({draftLabs.length})
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {draftLabs.map((item) => (
                                <motion.span
                                  layout
                                  key={item.key}
                                  initial={{ opacity: 0, scale: 0.94 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  exit={{ opacity: 0, scale: 0.9 }}
                                  className="inline-flex items-center gap-2 rounded-xl border border-teal-200/80 bg-white px-3 py-1.5 text-xs font-bold text-[#0f241d]"
                                >
                                  {item.testName}
                                  {item.isNewCatalogEntry ? (
                                    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                                      New
                                    </span>
                                  ) : null}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setDraftLabs((prev) =>
                                        prev.filter((x) => x.key !== item.key)
                                      )
                                    }
                                    className="text-rose-500 hover:text-rose-700 cursor-pointer"
                                    aria-label="Remove test"
                                  >
                                    ×
                                  </button>
                                </motion.span>
                              ))}
                            </div>

                            <input
                              type="text"
                              value={labNotes}
                              onChange={(e) => setLabNotes(e.target.value)}
                              placeholder="Optional clinical notes for lab..."
                              className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3 py-2 text-xs text-[#0f241d] focus:border-teal-500 focus:outline-none"
                            />
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </div>
                  </div>

                  {/* Unified Bottom Confirm & Complete Bar inside the Huge Box */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-[#cfe2d6] bg-[#eef7f1]/75 px-4 py-3.5">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-white px-3 py-1 font-bold text-[#0d4a38]">
                        <Pill className="h-3.5 w-3.5" />
                        {draftMeds.length} Medicine{draftMeds.length === 1 ? "" : "s"}
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-white px-3 py-1 font-bold text-teal-800">
                        <FlaskConical className="h-3.5 w-3.5" />
                        {draftLabs.length} Lab Test{draftLabs.length === 1 ? "" : "s"}
                      </span>
                      {draftMeds.length === 0 && draftLabs.length === 0 ? (
                        <span className="text-[11px] font-medium text-[#5b796b]">
                          No medicines or lab tests added — can still confirm as consultation only
                        </span>
                      ) : null}
                    </div>

                    <BubblyButton
                      type="button"
                      disabled={submittingAll}
                      onClick={handleOpenUnifiedConfirm}
                      className="px-5 py-2.5 text-xs sm:text-sm shrink-0"
                    >
                      <ClipboardCheck className="h-4 w-4" />
                      {submittingAll
                        ? "Completing..."
                        : "Confirm & Complete Consultation"}
                    </BubblyButton>
                  </div>
                </motion.div>
              )}
          </SpringCard>

          {/* ===================================================================== */}
          {/* BOTTOM SECTION: SUBMITTED CONSULTATIONS & ORDERS (Paginated, By Day) */}
          {/* ===================================================================== */}
          <SpringCard className="p-5 sm:p-6 space-y-4">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#eef7f1] text-[#0d4a38]">
                  <CheckCircle2 className="h-4 w-4" />
                </span>
                <h2 className="font-display text-base font-extrabold text-[#0f241d]">
                  Submitted Consultations &amp; Orders
                </h2>
                <span className="rounded-full border border-[#d6e9de] bg-[#f4faf6] px-2.5 py-0.5 font-mono-id text-[11px] font-bold text-[#0d4a38]">
                  {filteredSubmittedVisits.length}
                </span>
              </div>

              {/* Eye-soothing Day / Past-Few-Days Selector + Search */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-[#dcece2] bg-[#f6fbf8] p-1">
                  {(
                    [
                      { id: "today", label: "Today" },
                      { id: "yesterday", label: "Yesterday" },
                      { id: "3d", label: "Last 3 Days" },
                      { id: "7d", label: "Last 7 Days" },
                    ] as const
                  ).map((opt) => {
                    const active = historyRange === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setHistoryRange(opt.id);
                          setHistoryPage(1);
                        }}
                        className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                          active
                            ? "bg-[#0d4a38] text-white shadow-xs"
                            : "text-[#466356] hover:text-[#0f241d]"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>

                <label className="inline-flex items-center gap-1.5 rounded-xl border border-[#dcece2] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#466356]">
                  <CalendarDays className="h-3.5 w-3.5 text-[#0d4a38]" />
                  <input
                    type="date"
                    value={historyDate}
                    max={getLocalDateInputValue()}
                    onChange={(e) => {
                      const val = e.target.value;
                      setHistoryDate(val);
                      setHistoryRange(val ? "custom" : "today");
                      setHistoryPage(1);
                    }}
                    className="bg-transparent text-xs font-semibold text-[#0f241d] focus:outline-none cursor-pointer"
                  />
                </label>

                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#6c877a]" />
                  <input
                    type="text"
                    value={historySearch}
                    onChange={(e) => {
                      setHistorySearch(e.target.value);
                      setHistoryPage(1);
                    }}
                    placeholder="Search submitted orders..."
                    className="w-52 rounded-xl border border-[#cfe2d6] bg-[#fafdfb] py-1.5 pl-8 pr-3 text-xs text-[#0f241d] focus:border-emerald-500 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {filteredSubmittedVisits.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#dcece2] bg-[#fafdfb] py-8 px-4">
                <EmptyState
                  icon={<ClipboardCheck className="h-5 w-5" />}
                  title="No Submitted Consultations"
                  description={
                    historyRange === "today"
                      ? "Completed consultations for today will appear here automatically."
                      : "No completed consultations found for the selected timeframe."
                  }
                />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-2.5">
                  {paginatedSubmittedVisits.map((v) => {
                    const hasMeds =
                      v.doctorPrescriptions.length > 0 ||
                      v.pharmacyReferrals.length > 0;
                    const hasLabs = v.labReferrals.length > 0;
                    return (
                      <motion.div
                        key={v.id}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.14 }}
                        className="rounded-2xl border border-[#dfede5] bg-[#fbfefd] p-4 space-y-2.5 hover:border-[#bfdccc] transition-colors"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-display text-sm font-extrabold text-[#0f241d]">
                              {v.patient.fullName}
                            </span>
                            <span className="rounded-full bg-[#eef7f1] px-2 py-0.5 font-mono-id text-[10px] font-bold text-[#0d4a38]">
                              {v.patient.uhid}
                            </span>
                            <span className="rounded-full border border-[#d6e9de] bg-white px-2 py-0.5 font-mono-id text-[10px] font-bold text-[#466356]">
                              {v.visitNumber}
                            </span>
                            <span className="text-[11px] text-[#5b796b]">
                              · {v.patient.phone} ·{" "}
                              <strong className="text-[#314c40]">
                                {v.doctor?.name ?? v.doctorNameSnapshot}
                              </strong>
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            {!hasMeds && !hasLabs ? (
                              <span className="rounded-full border border-[#d6e9de] bg-[#f4faf6] px-2.5 py-0.5 text-[10px] font-bold text-[#466356]">
                                Consultation Only
                              </span>
                            ) : null}
                            <span className="text-[11px] font-medium text-[#5b796b]">
                              {formatAccurateDateTime(
                                v.consultancyCompletedAt ?? v.visitDate
                              )}
                            </span>
                          </div>
                        </div>

                        {(hasMeds || hasLabs) ? (
                          <div className="grid gap-2 md:grid-cols-2 text-xs">
                            {v.doctorPrescriptions.map((rx) => (
                              <div
                                key={rx.id}
                                className="rounded-xl border border-emerald-200/80 bg-[#f3faf6] px-3 py-2.5"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="inline-flex items-center gap-1.5 font-bold text-[#0d4a38]">
                                    <Pill className="h-3.5 w-3.5" />
                                    Prescription ({rx.items.length})
                                  </span>
                                  <StatusBadge status={rx.status} />
                                </div>
                                <p className="mt-1 text-[11px] text-[#314c40] leading-relaxed">
                                  {rx.items
                                    .map(
                                      (it) =>
                                        `${it.medicineNameSnapshot} × ${it.quantityUnits}${it.dosageInstructions ? ` (${it.dosageInstructions})` : ""}`
                                    )
                                    .join(" · ")}
                                </p>
                              </div>
                            ))}

                            {v.pharmacyReferrals.map((ref) => (
                              <div
                                key={ref.id}
                                className="rounded-xl border border-[#d6e9de] bg-[#f6fbf8] px-3 py-2.5"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="inline-flex items-center gap-1.5 font-bold text-[#0d4a38]">
                                    <Pill className="h-3.5 w-3.5" />
                                    {ref.referralNumber} → {ref.pharmacyNameSnapshot}
                                  </span>
                                  <StatusBadge status={ref.status} />
                                </div>
                                <p className="mt-1 text-[11px] text-[#314c40] leading-relaxed">
                                  {ref.items
                                    .map(
                                      (it) =>
                                        `${it.medicineNameSnapshot} × ${it.quantity}${it.dosageInstructions ? ` (${it.dosageInstructions})` : ""}`
                                    )
                                    .join(" · ")}
                                </p>
                              </div>
                            ))}

                            {v.labReferrals.map((ref) => (
                              <div
                                key={ref.id}
                                className="rounded-xl border border-teal-200/80 bg-[#f2fafa] px-3 py-2.5"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="inline-flex items-center gap-1.5 font-bold text-teal-900">
                                    <FlaskConical className="h-3.5 w-3.5" />
                                    {ref.referralNumber} → {ref.labNameSnapshot}
                                  </span>
                                  <StatusBadge status={ref.status} />
                                </div>
                                <p className="mt-1 text-[11px] text-[#314c40] leading-relaxed">
                                  {ref.items.map((it) => it.testNameSnapshot).join(", ")}
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </motion.div>
                    );
                  })}
                </div>

                <PaginationBar
                  totalItems={filteredSubmittedVisits.length}
                  pageSize={DEFAULT_PAGE_SIZE}
                  currentPage={safeHistoryPage}
                  onPageChange={setHistoryPage}
                  itemLabel="consultation(s)"
                />
              </div>
            )}
          </SpringCard>
        </>
      )}

      {/* Unified Consultation Confirmation Modal — Press Return/Enter to confirm & complete */}
      <AnimatedModal
        open={confirmOpen}
        onClose={() => {
          if (!submittingAll) setConfirmOpen(false);
        }}
        title="Confirm & Complete Consultation"
        subtitle={
          selectedVisit
            ? `${selectedVisit.patient.fullName} (${selectedVisit.patient.uhid} · ${selectedVisit.visitNumber})`
            : undefined
        }
        maxWidth="max-w-xl"
      >
        <div className="space-y-4">
          {/* Medicines Summary */}
          <div className="rounded-2xl border border-[#dcece2] bg-[#f8fcfa] p-3.5 space-y-2">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 font-bold text-[#0d4a38]">
                <Pill className="h-3.5 w-3.5" />
                Prescribed Medicines ({draftMeds.length})
              </span>
              {draftMeds.length > 0 ? (
                <span className="text-[11px] font-semibold text-[#5b796b]">
                  {pharmacyMode === PHARMACY_MODE.MANAGEMENT
                    ? "Hospital Pharmacy Queue"
                    : pharmacyAccounts.find(
                        (p) => p.id === selectedPharmacyAccountId
                      )?.pharmacyName ?? "Pharmacy Supplier"}
                </span>
              ) : null}
            </div>

            {draftMeds.length === 0 ? (
              <p className="text-xs text-[#5b796b]">
                No medicines prescribed for this consultation.
              </p>
            ) : (
              <div className="max-h-44 overflow-y-auto rounded-xl border border-[#e3efe7] bg-white divide-y divide-[#eef5f0]">
                {draftMeds.map((item, idx) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-[#0f241d]">
                        {idx + 1}. {item.medicineName}
                      </p>
                      <p className="text-[11px] text-[#5b796b]">
                        Timing:{" "}
                        <span className="font-mono-id font-bold text-[#0d4a38]">
                          {item.dosageSchedule}
                        </span>{" "}
                        ·{" "}
                        {item.mealTiming === "BEFORE_MEAL"
                          ? "Before Meal"
                          : "After Meal"}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-[#eef7f1] px-2.5 py-0.5 font-mono-id text-[11px] font-extrabold text-[#0d4a38]">
                      {item.quantityUnits} unit{item.quantityUnits > 1 ? "s" : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {draftMeds.length > 0 && medNotes.trim() ? (
              <p className="text-[11px] text-[#466356]">
                <strong>Pharmacy Notes:</strong> {medNotes.trim()}
              </p>
            ) : null}
          </div>

          {/* Laboratory Tests Summary */}
          <div className="rounded-2xl border border-[#d6ebe9] bg-[#f7fcfc] p-3.5 space-y-2">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 font-bold text-teal-900">
                <FlaskConical className="h-3.5 w-3.5" />
                Laboratory Tests ({draftLabs.length})
              </span>
              {draftLabs.length > 0 ? (
                <span className="text-[11px] font-semibold text-[#5b796b]">
                  {labAccounts.find((l) => l.id === selectedLabAccountId)
                    ?.labName ?? "Selected Lab"}
                </span>
              ) : null}
            </div>

            {draftLabs.length === 0 ? (
              <p className="text-xs text-[#5b796b]">
                No laboratory tests referred for this consultation.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {draftLabs.map((l) => (
                  <span
                    key={l.key}
                    className="rounded-lg border border-teal-200 bg-white px-2.5 py-1 text-xs font-bold text-teal-900"
                  >
                    {l.testName}
                  </span>
                ))}
              </div>
            )}
            {draftLabs.length > 0 && labNotes.trim() ? (
              <p className="text-[11px] text-[#466356]">
                <strong>Lab Notes:</strong> {labNotes.trim()}
              </p>
            ) : null}
          </div>

          <p className="rounded-xl border border-emerald-200/70 bg-emerald-50/50 px-3.5 py-2 text-[11px] font-medium text-[#314c40]">
            Confirming will finalize this consultation and move the patient to{" "}
            <strong>Submitted Consultations &amp; Orders</strong> (they cannot be selected again).
          </p>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <span className="text-[11px] font-semibold text-[#5b796b]">
              Press{" "}
              <kbd className="rounded border border-[#cfe2d6] bg-[#f4faf6] px-1.5 py-0.5 font-mono-id text-[10px] font-bold text-[#0d4a38]">
                Return
              </kbd>{" "}
              to confirm &amp; complete
            </span>
            <div className="flex items-center gap-2">
              <BubblyButton
                type="button"
                variant="outline"
                disabled={submittingAll}
                onClick={() => setConfirmOpen(false)}
                className="px-4 py-2 text-xs"
              >
                Cancel
              </BubblyButton>
              <BubblyButton
                type="button"
                disabled={submittingAll}
                onClick={() => void handleConfirmCompleteConsultation()}
                className="px-4 py-2 text-xs"
              >
                <Send className="h-3.5 w-3.5" />
                {submittingAll ? "Completing..." : "Confirm & Complete"}
              </BubblyButton>
            </div>
          </div>
        </div>
      </AnimatedModal>
    </div>
  );
}
