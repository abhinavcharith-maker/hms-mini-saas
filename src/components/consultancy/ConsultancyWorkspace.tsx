"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ClipboardList,
  FlaskConical,
  Pill,
  Plus,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Stethoscope,
  Trash2,
  UserRound,
} from "lucide-react";
import {
  BubblyButton,
  EmptyState,
  SkeletonBox,
  SpringCard,
  StatusBadge,
} from "@/components/ui/MotionPrimitives";
import { useToast } from "@/components/providers/AppProviders";
import { PHARMACY_MODE, type PharmacyMode } from "@/lib/constants";
import { formatAccurateDateTime } from "@/lib/datetime";

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

interface TodayVisitRow {
  id: string;
  visitNumber: string;
  visitDate: string;
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
  dosageInstructions: string;
  isNewCatalogEntry?: boolean;
}

interface DraftLabItem {
  key: string;
  labTestCatalogId?: string | null;
  testName: string;
  isNewCatalogEntry?: boolean;
}

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
  const [currentDoctor, setCurrentDoctor] = useState<DoctorBrief | null>(null);
  const [doctors, setDoctors] = useState<DoctorBrief[]>([]);
  const [selectedDoctorFilter, setSelectedDoctorFilter] = useState<string>("ALL");
  const [todayVisits, setTodayVisits] = useState<TodayVisitRow[]>([]);
  const [pharmacyMedicines, setPharmacyMedicines] = useState<PharmacyStockLite[]>([]);
  const [medicineCatalog, setMedicineCatalog] = useState<CatalogLite[]>([]);
  const [pharmacyAccounts, setPharmacyAccounts] = useState<PharmacyAccountLite[]>([]);
  const [labTestCatalog, setLabTestCatalog] = useState<CatalogLite[]>([]);
  const [labAccounts, setLabAccounts] = useState<LabAccountLite[]>([]);

  const [patientSearch, setPatientSearch] = useState("");
  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(null);

  // Medicine prescription composer state
  const [selectedPharmacyAccountId, setSelectedPharmacyAccountId] = useState("");
  const [medQuery, setMedQuery] = useState("");
  const [medDropdownOpen, setMedDropdownOpen] = useState(false);
  const [pickedStockMed, setPickedStockMed] = useState<PharmacyStockLite | null>(null);
  const [pickedCatalogMed, setPickedCatalogMed] = useState<CatalogLite | null>(null);
  const [medQty, setMedQty] = useState("1");
  const [medDosage, setMedDosage] = useState("");
  const [medNotes, setMedNotes] = useState("");
  const [draftMeds, setDraftMeds] = useState<DraftMedicineItem[]>([]);
  const [submittingMeds, setSubmittingMeds] = useState(false);

  // Laboratory referral composer state
  const [selectedLabAccountId, setSelectedLabAccountId] = useState("");
  const [labQuery, setLabQuery] = useState("");
  const [labDropdownOpen, setLabDropdownOpen] = useState(false);
  const [pickedLabTest, setPickedLabTest] = useState<CatalogLite | null>(null);
  const [labNotes, setLabNotes] = useState("");
  const [draftLabs, setDraftLabs] = useState<DraftLabItem[]>([]);
  const [submittingLabs, setSubmittingLabs] = useState(false);

  const loadTodayData = useCallback(async () => {
    try {
      const tzOffset = new Date().getTimezoneOffset();
      const params = new URLSearchParams({ tzOffset: String(tzOffset) });
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
      setCurrentDoctor(d.currentDoctor ?? null);
      setDoctors(d.doctors ?? []);
      const visits: TodayVisitRow[] = d.todayVisits ?? [];
      setTodayVisits(visits);
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

      setSelectedVisitId((prev) => {
        if (prev && visits.some((v) => v.id === prev)) return prev;
        return visits[0]?.id ?? null;
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [viewerMode, selectedDoctorFilter]);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await loadTodayData();
  };

  useEffect(() => {
    let active = true;
    const tzOffset = new Date().getTimezoneOffset();
    const params = new URLSearchParams({ tzOffset: String(tzOffset) });
    if (viewerMode === "ADMIN" && selectedDoctorFilter !== "ALL") {
      params.set("doctorId", selectedDoctorFilter);
    }
    fetch(`/api/consultancy/today?${params.toString()}`, { cache: "no-store" })
      .then(async (res) => {
        if (!active) return;
        if (res.status === 403) {
          setForbidden(true);
          return;
        }
        if (!res.ok) return;
        const d = await res.json();
        if (!active) return;
        setPharmacyMode(d.pharmacyMode ?? PHARMACY_MODE.REFERRALS);
        setCurrentDoctor(d.currentDoctor ?? null);
        setDoctors(d.doctors ?? []);
        const visits: TodayVisitRow[] = d.todayVisits ?? [];
        setTodayVisits(visits);
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
        setSelectedVisitId((prev) => {
          if (prev && visits.some((v) => v.id === prev)) return prev;
          return visits[0]?.id ?? null;
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [viewerMode, selectedDoctorFilter]);

  const filteredVisits = useMemo(() => {
    const q = patientSearch.trim().toLowerCase();
    if (!q) return todayVisits;
    return todayVisits.filter(
      (v) =>
        v.patient.fullName.toLowerCase().includes(q) ||
        v.patient.uhid.toLowerCase().includes(q) ||
        v.patient.phone.includes(q) ||
        v.visitNumber.toLowerCase().includes(q) ||
        v.doctorNameSnapshot.toLowerCase().includes(q)
    );
  }, [todayVisits, patientSearch]);

  const selectedVisit = useMemo(
    () => todayVisits.find((v) => v.id === selectedVisitId) ?? null,
    [todayVisits, selectedVisitId]
  );

  const filteredStockMeds = useMemo(() => {
    const q = medQuery.trim().toLowerCase();
    if (!q) return pharmacyMedicines.slice(0, 12);
    return pharmacyMedicines
      .filter((m) => m.name.toLowerCase().includes(q))
      .slice(0, 12);
  }, [pharmacyMedicines, medQuery]);

  const filteredCatalogMeds = useMemo(() => {
    const q = medQuery.trim().toLowerCase();
    if (!q) return medicineCatalog.slice(0, 12);
    return medicineCatalog
      .filter((m) => m.name.toLowerCase().includes(q))
      .slice(0, 12);
  }, [medicineCatalog, medQuery]);

  const filteredLabTests = useMemo(() => {
    const q = labQuery.trim().toLowerCase();
    if (!q) return labTestCatalog.slice(0, 12);
    return labTestCatalog
      .filter((t) => t.name.toLowerCase().includes(q))
      .slice(0, 12);
  }, [labTestCatalog, labQuery]);

  const handleSelectVisit = (visitId: string) => {
    if (visitId === selectedVisitId) return;
    setSelectedVisitId(visitId);
    setDraftMeds([]);
    setDraftLabs([]);
    setMedNotes("");
    setLabNotes("");
    setMedQuery("");
    setLabQuery("");
    setPickedStockMed(null);
    setPickedCatalogMed(null);
    setPickedLabTest(null);
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
      return;
    }

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
          dosageInstructions: medDosage.trim(),
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
          dosageInstructions: medDosage.trim(),
          isNewCatalogEntry: !matched,
        },
      ]);
    }

    setMedQuery("");
    setPickedStockMed(null);
    setPickedCatalogMed(null);
    setMedQty("1");
    setMedDosage("");
    setMedDropdownOpen(false);
  };

  const handleSubmitPrescription = async () => {
    if (!selectedVisit || draftMeds.length === 0) return;
    if (
      pharmacyMode === PHARMACY_MODE.REFERRALS &&
      !selectedPharmacyAccountId
    ) {
      toast({
        type: "error",
        title: "Select Pharmacy Supplier",
        message: "Please choose a pharmacy supplier before sending the referral.",
      });
      return;
    }

    setSubmittingMeds(true);
    try {
      const res = await fetch("/api/consultancy/prescribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opVisitId: selectedVisit.id,
          pharmacyAccountId:
            pharmacyMode === PHARMACY_MODE.REFERRALS
              ? selectedPharmacyAccountId
              : null,
          notes: medNotes.trim() || null,
          items: draftMeds.map((m) => ({
            pharmacyMedicineId: m.pharmacyMedicineId ?? null,
            medicineCatalogId: m.medicineCatalogId ?? null,
            medicineName: m.medicineName,
            quantityUnits: m.quantityUnits,
            dosageInstructions: m.dosageInstructions || null,
          })),
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast({
          type: "error",
          title: "Prescription Failed",
          message: d.error || "Unable to submit prescription.",
        });
        return;
      }

      if (d.mode === PHARMACY_MODE.MANAGEMENT) {
        toast({
          type: "success",
          title: "Prescription Sent to Pharmacy",
          message: `${draftMeds.length} medicine(s) queued in Pharmacy Management Prescriptions for ${selectedVisit.patient.fullName}.`,
        });
      } else {
        const addedNote =
          d.createdCatalogNames?.length > 0
            ? ` Added to catalog: ${d.createdCatalogNames.join(", ")}.`
            : "";
        toast({
          type: "success",
          title: "Pharmacy Referral Created",
          message: `Referral ${d.referral?.referralNumber ?? ""} sent successfully.${addedNote}`,
        });
      }

      setDraftMeds([]);
      setMedNotes("");
      await loadTodayData();
    } finally {
      setSubmittingMeds(false);
    }
  };

  const handleAddLabRow = () => {
    const cleanName = labQuery.trim();
    if (!cleanName) {
      toast({
        type: "error",
        title: "Enter Lab Test Name",
        message: "Select or type a laboratory test name first.",
      });
      return;
    }

    const matched =
      pickedLabTest &&
      pickedLabTest.name.toLowerCase() === cleanName.toLowerCase()
        ? pickedLabTest
        : labTestCatalog.find(
            (t) => t.name.trim().toLowerCase() === cleanName.toLowerCase()
          ) ?? null;

    if (
      draftLabs.some(
        (d) => d.testName.trim().toLowerCase() === (matched?.name ?? cleanName).toLowerCase()
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
    setLabDropdownOpen(false);
  };

  const handleSubmitLabReferral = async () => {
    if (!selectedVisit || draftLabs.length === 0) return;
    if (!selectedLabAccountId) {
      toast({
        type: "error",
        title: "Select Laboratory Partner",
        message: "Please choose a laboratory partner before sending the referral.",
      });
      return;
    }

    setSubmittingLabs(true);
    try {
      const res = await fetch("/api/consultancy/lab-refer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opVisitId: selectedVisit.id,
          labAccountId: selectedLabAccountId,
          notes: labNotes.trim() || null,
          items: draftLabs.map((l) => ({
            labTestCatalogId: l.labTestCatalogId ?? null,
            testName: l.testName,
          })),
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast({
          type: "error",
          title: "Lab Referral Failed",
          message: d.error || "Unable to submit laboratory referral.",
        });
        return;
      }

      const addedNote =
        d.createdCatalogNames?.length > 0
          ? ` Added to lab catalog: ${d.createdCatalogNames.join(", ")}.`
          : "";
      toast({
        type: "success",
        title: "Laboratory Referral Sent",
        message: `Referral ${d.referral?.referralNumber ?? ""} created for ${selectedVisit.patient.fullName}.${addedNote}`,
      });

      setDraftLabs([]);
      setLabNotes("");
      await loadTodayData();
    } finally {
      setSubmittingLabs(false);
    }
  };

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
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-extrabold text-[#0f241d]">
              {viewerMode === "DOCTOR" ? "Doctor Consultancy" : "Consultancy Desk"}
            </h1>
            <span className="rounded-full border border-emerald-200 bg-[#eef7f1] px-2.5 py-0.5 text-[11px] font-bold text-[#0d4a38]">
              Today Only
            </span>
          </div>
          <p className="mt-1 text-xs text-[#466356]">
            {viewerMode === "DOCTOR" && currentDoctor
              ? `${currentDoctor.name}${currentDoctor.qualification ? ` · ${currentDoctor.qualification}` : ""} — View your patients registered today, prescribe medicines & refer lab tests.`
              : "Review today's doctor-assigned OP consultations, prescribe medicines, and refer laboratory tests."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {viewerMode === "ADMIN" ? (
            <select
              value={selectedDoctorFilter}
              onChange={(e) => setSelectedDoctorFilter(e.target.value)}
              className="rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2 text-xs font-semibold text-[#0f241d] focus:border-emerald-500 focus:outline-none"
            >
              <option value="ALL">All Consulting Doctors (Today)</option>
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
            Refresh Today
          </BubblyButton>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-5 lg:grid-cols-12">
          <SkeletonBox className="h-96 lg:col-span-4" />
          <SkeletonBox className="h-96 lg:col-span-8" />
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-12 items-start">
          {/* Left Column: Today's Patient Referrals Queue */}
          <SpringCard className="lg:col-span-4 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-[#0d4a38]" />
                <h2 className="font-display text-sm font-extrabold text-[#0f241d]">
                  Today&apos;s Patients ({filteredVisits.length})
                </h2>
              </div>
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#6c877a]" />
              <input
                type="text"
                value={patientSearch}
                onChange={(e) => setPatientSearch(e.target.value)}
                placeholder="Search patient name, UHID, mobile..."
                className="w-full rounded-xl border border-[#cfe2d6] bg-[#f8fcfa] py-2 pl-9 pr-3 text-xs text-[#0f241d] focus:border-emerald-500 focus:bg-white focus:outline-none"
              />
            </div>

            {filteredVisits.length === 0 ? (
              <EmptyState
                icon={<Stethoscope className="h-5 w-5" />}
                title="No Consultations Today"
                description={
                  viewerMode === "DOCTOR"
                    ? "Patients registered under your name today will appear here automatically."
                    : "No OP patients have been registered for the selected doctor filter today."
                }
              />
            ) : (
              <div className="max-h-[68vh] overflow-y-auto space-y-2 pr-1">
                {filteredVisits.map((v) => {
                  const active = v.id === selectedVisitId;
                  const rxCount =
                    v.doctorPrescriptions.length + v.pharmacyReferrals.length;
                  const labCount = v.labReferrals.length;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => handleSelectVisit(v.id)}
                      className={`w-full rounded-2xl border p-3.5 text-left transition-all cursor-pointer ${
                        active
                          ? "border-emerald-500 bg-[#eef7f1] shadow-sm"
                          : "border-[#e2efe7] bg-white hover:border-emerald-300 hover:bg-[#f8fcfa]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-display text-sm font-bold text-[#0f241d] truncate">
                            {v.patient.fullName}
                          </p>
                          <p className="mt-0.5 font-mono-id text-[11px] font-semibold text-[#0d4a38]">
                            {v.patient.uhid} · {v.visitNumber}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-white border border-[#d6e9de] px-2 py-0.5 text-[10px] font-bold text-[#466356]">
                          {v.patient.age !== null ? `${v.patient.age}y` : "—"} /{" "}
                          {v.patient.gender.charAt(0)}
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center justify-between gap-1 text-[11px] text-[#5b796b]">
                        <span>{v.patient.phone}</span>
                        {viewerMode === "ADMIN" ? (
                          <span className="font-semibold text-[#0d4a38] truncate max-w-[140px]">
                            {v.doctor?.name ?? v.doctorNameSnapshot}
                          </span>
                        ) : null}
                      </div>

                      {(rxCount > 0 || labCount > 0) ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {rxCount > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                              <Pill className="h-3 w-3" />
                              {rxCount} Rx
                            </span>
                          ) : null}
                          {labCount > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-bold text-cyan-800">
                              <FlaskConical className="h-3 w-3" />
                              {labCount} Lab
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </SpringCard>

          {/* Right Column: Consultation Actions for Selected Patient */}
          <div className="lg:col-span-8 space-y-5">
            {!selectedVisit ? (
              <SpringCard className="p-10">
                <EmptyState
                  icon={<UserRound className="h-6 w-6" />}
                  title="Select a Patient from Today's Queue"
                  description="Pick any patient registered today on the left to prescribe medicines or refer laboratory tests."
                />
              </SpringCard>
            ) : (
              <>
                {/* Selected Patient Header Card */}
                <SpringCard className="p-5 bg-gradient-to-r from-[#eef7f1] via-white to-[#f6fbf8]">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-display text-lg font-extrabold text-[#0f241d]">
                          {selectedVisit.patient.fullName}
                        </h2>
                        <span className="rounded-full bg-[#0d4a38] px-2.5 py-0.5 font-mono-id text-[11px] font-bold text-white">
                          {selectedVisit.patient.uhid}
                        </span>
                        <span className="rounded-full border border-[#cfe2d6] bg-white px-2.5 py-0.5 font-mono-id text-[11px] font-bold text-[#0d4a38]">
                          {selectedVisit.visitNumber}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-[#466356]">
                        {selectedVisit.patient.age !== null
                          ? `${selectedVisit.patient.age} yrs`
                          : "Age N/A"}{" "}
                        · {selectedVisit.patient.gender} · Mobile:{" "}
                        <strong className="font-mono-id">
                          {selectedVisit.patient.phone}
                        </strong>{" "}
                        · Doctor:{" "}
                        <strong>
                          {selectedVisit.doctor?.name ??
                            selectedVisit.doctorNameSnapshot}
                        </strong>
                      </p>
                      {selectedVisit.reasonForVisit ? (
                        <p className="mt-1 text-xs text-[#5b796b]">
                          Chief Complaint / Reason:{" "}
                          <span className="font-semibold text-[#0f241d]">
                            {selectedVisit.reasonForVisit}
                          </span>
                        </p>
                      ) : null}
                    </div>
                    <span className="text-[11px] font-semibold text-[#5b796b]">
                      Registered: {formatAccurateDateTime(selectedVisit.visitDate)}
                    </span>
                  </div>
                </SpringCard>

                {/* Section 1: Prescribe Medicines */}
                <SpringCard className="p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#dff4e8] text-[#0d4a38]">
                        <Pill className="h-4 w-4" />
                      </span>
                      <div>
                        <h3 className="font-display text-base font-extrabold text-[#0f241d]">
                          Prescribe Medicines
                        </h3>
                        <p className="text-xs text-[#5b796b]">
                          {pharmacyMode === PHARMACY_MODE.MANAGEMENT
                            ? "Select medicines from hospital pharmacy stock & enter quantity in units (pharmacy auto-picks earliest expiry batch)."
                            : "Choose pharmacy supplier & pick medicines from catalog — new medicine names are automatically saved to the catalog."}
                        </p>
                      </div>
                    </div>
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">
                      {pharmacyMode === PHARMACY_MODE.MANAGEMENT
                        ? "Direct to Pharmacy Queue"
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
                          No active pharmacy suppliers configured yet. Ask Hospital Admin to add a Pharmacy Partner in Management.
                        </p>
                      ) : (
                        <select
                          value={selectedPharmacyAccountId}
                          onChange={(e) => setSelectedPharmacyAccountId(e.target.value)}
                          className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2 text-sm text-[#0f241d] focus:border-emerald-500 focus:outline-none"
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

                  {/* Medicine Input Bar */}
                  <div className="grid gap-3 sm:grid-cols-12 items-end">
                    <div className="sm:col-span-5 relative">
                      <label className="mb-1 block text-xs font-semibold text-[#314c40]">
                        Medicine Name *
                      </label>
                      <input
                        type="text"
                        value={medQuery}
                        onFocus={() => setMedDropdownOpen(true)}
                        onBlur={() => setTimeout(() => setMedDropdownOpen(false), 160)}
                        onChange={(e) => {
                          setMedQuery(e.target.value);
                          setPickedStockMed(null);
                          setPickedCatalogMed(null);
                          setMedDropdownOpen(true);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddMedicineRow();
                          }
                        }}
                        placeholder={
                          pharmacyMode === PHARMACY_MODE.MANAGEMENT
                            ? "Search pharmacy stock medicine..."
                            : "Search catalog or type new medicine..."
                        }
                        className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2 text-sm text-[#0f241d] focus:border-emerald-500 focus:outline-none"
                      />

                      {medDropdownOpen ? (
                        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-2xl border border-[#cfe2d6] bg-white p-1.5 shadow-xl">
                          {pharmacyMode === PHARMACY_MODE.MANAGEMENT ? (
                            filteredStockMeds.length === 0 ? (
                              <p className="px-3 py-2 text-xs text-[#5b796b]">
                                {medQuery.trim()
                                  ? `No exact stock match for "${medQuery.trim()}". You can still add it by name.`
                                  : "No medicines in pharmacy stock yet."}
                              </p>
                            ) : (
                              filteredStockMeds.map((m) => (
                                <button
                                  key={m.id}
                                  type="button"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    setPickedStockMed(m);
                                    setMedQuery(m.name);
                                    setMedDropdownOpen(false);
                                  }}
                                  className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs hover:bg-[#eef7f1] cursor-pointer"
                                >
                                  <span className="font-semibold text-[#0f241d]">
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
                                      ? `${m.validUnits} units avail`
                                      : "Out of stock"}
                                  </span>
                                </button>
                              ))
                            )
                          ) : filteredCatalogMeds.length === 0 ? (
                            <p className="flex items-center gap-1.5 px-3 py-2 text-xs text-emerald-800">
                              <Sparkles className="h-3.5 w-3.5" />
                              {medQuery.trim()
                                ? `"${medQuery.trim()}" will be created in Medicine Catalog automatically.`
                                : "Type a medicine name to search or add to catalog."}
                            </p>
                          ) : (
                            filteredCatalogMeds.map((m) => (
                              <button
                                key={m.id}
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  setPickedCatalogMed(m);
                                  setMedQuery(m.name);
                                  setMedDropdownOpen(false);
                                }}
                                className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs hover:bg-[#eef7f1] cursor-pointer"
                              >
                                <span className="font-semibold text-[#0f241d]">
                                  {m.name}
                                </span>
                                <span className="text-[10px] text-[#5b796b]">
                                  In Catalog
                                </span>
                              </button>
                            ))
                          )}
                        </div>
                      ) : null}
                    </div>

                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-xs font-semibold text-[#314c40]">
                        Qty (Units) *
                      </label>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={medQty}
                        onChange={(e) => setMedQty(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddMedicineRow();
                          }
                        }}
                        className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3 py-2 font-mono-id text-sm font-bold text-[#0f241d] focus:border-emerald-500 focus:outline-none"
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <label className="mb-1 block text-xs font-semibold text-[#314c40]">
                        Dosage / Notes
                      </label>
                      <input
                        type="text"
                        value={medDosage}
                        onChange={(e) => setMedDosage(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddMedicineRow();
                          }
                        }}
                        placeholder="e.g. 1-0-1 after food"
                        className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3 py-2 text-sm text-[#0f241d] focus:border-emerald-500 focus:outline-none"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <BubblyButton
                        type="button"
                        variant="outline"
                        onClick={handleAddMedicineRow}
                        className="w-full justify-center py-2 text-xs"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add
                      </BubblyButton>
                    </div>
                  </div>

                  {/* Draft Prescribed Medicines List */}
                  {draftMeds.length > 0 ? (
                    <div className="space-y-2 rounded-2xl border border-[#dcece2] bg-[#f8fcfa] p-3.5">
                      {draftMeds.map((item) => (
                        <div
                          key={item.key}
                          className="flex items-center justify-between gap-2 rounded-xl border border-[#e3efe7] bg-white px-3.5 py-2.5 text-xs"
                        >
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-[#0f241d]">
                                {item.medicineName}
                              </span>
                              <span className="rounded-full bg-[#eef7f1] px-2 py-0.5 font-mono-id text-[11px] font-bold text-[#0d4a38]">
                                {item.quantityUnits} unit(s)
                              </span>
                              {item.isNewCatalogEntry ? (
                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                                  New → Auto-add to Catalog
                                </span>
                              ) : null}
                            </div>
                            {item.dosageInstructions ? (
                              <p className="mt-0.5 text-[11px] text-[#5b796b]">
                                {item.dosageInstructions}
                              </p>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setDraftMeds((prev) =>
                                prev.filter((x) => x.key !== item.key)
                              )
                            }
                            className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 cursor-pointer"
                            aria-label="Remove medicine"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}

                      <div className="pt-2 flex flex-col sm:flex-row gap-2 sm:items-center justify-between">
                        <input
                          type="text"
                          value={medNotes}
                          onChange={(e) => setMedNotes(e.target.value)}
                          placeholder="Optional clinical instructions for pharmacy..."
                          className="flex-1 rounded-xl border border-[#cfe2d6] bg-white px-3 py-2 text-xs text-[#0f241d] focus:border-emerald-500 focus:outline-none"
                        />
                        <BubblyButton
                          type="button"
                          disabled={submittingMeds}
                          onClick={handleSubmitPrescription}
                          className="px-4 py-2 text-xs shrink-0"
                        >
                          <Send className="h-3.5 w-3.5" />
                          {submittingMeds
                            ? "Sending..."
                            : pharmacyMode === PHARMACY_MODE.MANAGEMENT
                              ? "Send Prescription to Pharmacy"
                              : "Send Pharmacy Referral"}
                        </BubblyButton>
                      </div>
                    </div>
                  ) : null}
                </SpringCard>

                {/* Section 2: Refer Laboratory Test */}
                <SpringCard className="p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-50 text-teal-800">
                        <FlaskConical className="h-4 w-4" />
                      </span>
                      <div>
                        <h3 className="font-display text-base font-extrabold text-[#0f241d]">
                          Refer Laboratory Test
                        </h3>
                        <p className="text-xs text-[#5b796b]">
                          Pick tests from your laboratory catalog or type a new test name to create &amp; refer it immediately.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-12 items-end">
                    <div className="sm:col-span-4">
                      <label className="mb-1 block text-xs font-semibold text-[#314c40]">
                        Laboratory Partner *
                      </label>
                      {labAccounts.length === 0 ? (
                        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                          No active labs configured yet.
                        </p>
                      ) : (
                        <select
                          value={selectedLabAccountId}
                          onChange={(e) => setSelectedLabAccountId(e.target.value)}
                          className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3 py-2 text-sm text-[#0f241d] focus:border-emerald-500 focus:outline-none"
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

                    <div className="sm:col-span-6 relative">
                      <label className="mb-1 block text-xs font-semibold text-[#314c40]">
                        Lab Test Name *
                      </label>
                      <input
                        type="text"
                        value={labQuery}
                        onFocus={() => setLabDropdownOpen(true)}
                        onBlur={() => setTimeout(() => setLabDropdownOpen(false), 160)}
                        onChange={(e) => {
                          setLabQuery(e.target.value);
                          setPickedLabTest(null);
                          setLabDropdownOpen(true);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddLabRow();
                          }
                        }}
                        placeholder="Search lab test catalog or type a new test..."
                        className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2 text-sm text-[#0f241d] focus:border-emerald-500 focus:outline-none"
                      />

                      {labDropdownOpen ? (
                        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-52 overflow-y-auto rounded-2xl border border-[#cfe2d6] bg-white p-1.5 shadow-xl">
                          {filteredLabTests.length === 0 ? (
                            <p className="flex items-center gap-1.5 px-3 py-2 text-xs text-teal-800">
                              <Sparkles className="h-3.5 w-3.5" />
                              {labQuery.trim()
                                ? `"${labQuery.trim()}" will be created in Lab Test Catalog automatically.`
                                : "Type a test name to search or create."}
                            </p>
                          ) : (
                            filteredLabTests.map((t) => (
                              <button
                                key={t.id}
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  setPickedLabTest(t);
                                  setLabQuery(t.name);
                                  setLabDropdownOpen(false);
                                }}
                                className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs hover:bg-cyan-50/70 cursor-pointer"
                              >
                                <span className="font-semibold text-[#0f241d]">
                                  {t.name}
                                </span>
                                <span className="text-[10px] text-[#5b796b]">
                                  In Catalog
                                </span>
                              </button>
                            ))
                          )}
                        </div>
                      ) : null}
                    </div>

                    <div className="sm:col-span-2">
                      <BubblyButton
                        type="button"
                        variant="outline"
                        onClick={handleAddLabRow}
                        className="w-full justify-center py-2 text-xs"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add
                      </BubblyButton>
                    </div>
                  </div>

                  {draftLabs.length > 0 ? (
                    <div className="space-y-2 rounded-2xl border border-[#dcece2] bg-[#f8fcfa] p-3.5">
                      <div className="flex flex-wrap gap-2">
                        {draftLabs.map((item) => (
                          <span
                            key={item.key}
                            className="inline-flex items-center gap-2 rounded-xl border border-cyan-200 bg-white px-3 py-1.5 text-xs font-bold text-[#0f241d]"
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
                          </span>
                        ))}
                      </div>

                      <div className="pt-2 flex flex-col sm:flex-row gap-2 sm:items-center justify-between">
                        <input
                          type="text"
                          value={labNotes}
                          onChange={(e) => setLabNotes(e.target.value)}
                          placeholder="Optional clinical notes for lab..."
                          className="flex-1 rounded-xl border border-[#cfe2d6] bg-white px-3 py-2 text-xs text-[#0f241d] focus:border-emerald-500 focus:outline-none"
                        />
                        <BubblyButton
                          type="button"
                          disabled={submittingLabs || labAccounts.length === 0}
                          onClick={handleSubmitLabReferral}
                          className="px-4 py-2 text-xs shrink-0"
                        >
                          <Send className="h-3.5 w-3.5" />
                          {submittingLabs ? "Sending..." : "Send Lab Referral"}
                        </BubblyButton>
                      </div>
                    </div>
                  ) : null}
                </SpringCard>

                {/* Today's Submitted Prescriptions & Lab Referrals for Selected Patient */}
                {(selectedVisit.doctorPrescriptions.length > 0 ||
                  selectedVisit.pharmacyReferrals.length > 0 ||
                  selectedVisit.labReferrals.length > 0) ? (
                  <SpringCard className="p-5 space-y-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                      <h3 className="font-display text-sm font-extrabold text-[#0f241d]">
                        Today&apos;s Submitted Orders for {selectedVisit.patient.fullName}
                      </h3>
                    </div>

                    <div className="space-y-2 text-xs">
                      {selectedVisit.doctorPrescriptions.map((rx) => (
                        <div
                          key={rx.id}
                          className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-[#0d4a38]">
                              Pharmacy Prescription ({rx.items.length} medicine(s))
                            </span>
                            <StatusBadge status={rx.status} />
                          </div>
                          <p className="mt-1 text-[#314c40]">
                            {rx.items
                              .map(
                                (it) =>
                                  `${it.medicineNameSnapshot} × ${it.quantityUnits} unit(s)${it.dosageInstructions ? ` (${it.dosageInstructions})` : ""}`
                              )
                              .join(" · ")}
                          </p>
                        </div>
                      ))}

                      {selectedVisit.pharmacyReferrals.map((ref) => (
                        <div
                          key={ref.id}
                          className="rounded-xl border border-[#d6e9de] bg-[#f8fcfa] p-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-[#0d4a38]">
                              Pharmacy Referral {ref.referralNumber} → {ref.pharmacyNameSnapshot}
                            </span>
                            <StatusBadge status={ref.status} />
                          </div>
                          <p className="mt-1 text-[#314c40]">
                            {ref.items
                              .map(
                                (it) =>
                                  `${it.medicineNameSnapshot} × ${it.quantity}${it.dosageInstructions ? ` (${it.dosageInstructions})` : ""}`
                              )
                              .join(" · ")}
                          </p>
                        </div>
                      ))}

                      {selectedVisit.labReferrals.map((ref) => (
                        <div
                          key={ref.id}
                          className="rounded-xl border border-cyan-200 bg-cyan-50/40 p-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-teal-900">
                              Lab Referral {ref.referralNumber} → {ref.labNameSnapshot}
                            </span>
                            <StatusBadge status={ref.status} />
                          </div>
                          <p className="mt-1 text-[#314c40]">
                            {ref.items.map((it) => it.testNameSnapshot).join(", ")}
                          </p>
                        </div>
                      ))}
                    </div>
                  </SpringCard>
                ) : null}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
