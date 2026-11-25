"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  FileText,
  Pencil,
  Printer,
  Receipt,
  Search,
  Stethoscope,
  UserCheck,
  UserPlus,
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
import { useToast } from "@/components/providers/AppProviders";
import { formatAccurateDate, getLocalDateInputValue } from "@/lib/datetime";
import { sanitizeMobileInput } from "@/lib/phone";
import { focusNextFieldInContainer } from "@/lib/keyboard";

interface Doctor {
  id: string;
  name: string;
  specialty: string | null;
  consultationFee: number | null;
  isActive: boolean;
}

interface PatientRow {
  id: string;
  uhid: string;
  fullName: string;
  age: number | null;
  dateOfBirth: string | null;
  gender: "MALE" | "FEMALE" | "OTHER";
  phone: string;
  address: string | null;
  bloodGroup: string | null;
  emergencyContact: string | null;
  registeredAt: string;
  _count: {
    opVisits: number;
    ipAdmissions: number;
    pharmacyReferrals: number;
    labReferrals: number;
  };
  opVisits: Array<{
    id: string;
    visitNumber: string;
    visitDate: string;
    doctorNameSnapshot: string;
    billingReceipts?: Array<{ id: string; receiptNumber: string }>;
  }>;
  billingReceipts?: Array<{ id: string; receiptNumber: string }>;
  ipAdmissions: Array<{
    id: string;
    admissionNumber: string;
    wardSnapshot: string;
    bedNumberSnapshot: string;
  }>;
}

interface CreatedOpResult {
  patient: { id: string; uhid: string; fullName: string };
  opVisit: { id: string; visitNumber: string; doctorNameSnapshot: string };
  receipt: { id: string; receiptNumber: string; totalAmount: number | null };
  isNewPatient: boolean;
}

export default function OpRegistrationPage() {
  const { toast } = useToast();

  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [dirPage, setDirPage] = useState(1);
  const [dirPagination, setDirPagination] = useState({
    total: 0,
    page: 1,
    pageSize: 100,
    totalPages: 1,
  });
  const [dirRange, setDirRange] = useState<"all" | "1d" | "7d" | "custom">("all");
  const [dirFrom, setDirFrom] = useState(() => getLocalDateInputValue());
  const [dirTo, setDirTo] = useState(() => getLocalDateInputValue());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirmRegisterOpen, setConfirmRegisterOpen] = useState(false);
  const fullNameInputRef = useRef<HTMLInputElement | null>(null);
  const ageInputRef = useRef<HTMLInputElement | null>(null);
  const doctorSelectRef = useRef<HTMLSelectElement | null>(null);
  const nameAutocompleteRef = useRef<HTMLDivElement | null>(null);
  const hasInitialFocusedRef = useRef(false);

  // Returning-patient autocomplete state
  const [existingPatient, setExistingPatient] = useState<PatientRow | null>(null);
  const [nameSuggestions, setNameSuggestions] = useState<PatientRow[] | null>(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [highlightedSuggestionIdx, setHighlightedSuggestionIdx] = useState(0);

  // Registration form
  const [form, setForm] = useState(() => ({
    fullName: "",
    age: "",
    gender: "MALE" as "MALE" | "FEMALE" | "OTHER",
    phone: "",
    doctorId: "",
    doctorName: "",
    department: "",
    visitDate: getLocalDateInputValue(),
    consultationFee: "",
    paymentMode: "CASH",
  }));

  // Post-registration Print Modal
  const [printResult, setPrintResult] = useState<CreatedOpResult | null>(null);

  // Edit Patient Modal
  const [editTarget, setEditTarget] = useState<PatientRow | null>(null);
  const [editForm, setEditForm] = useState({
    fullName: "",
    age: "",
    gender: "MALE" as "MALE" | "FEMALE" | "OTHER",
    phone: "",
  });

  const loadData = useCallback(
    async (
      q = "",
      range: "all" | "1d" | "7d" | "custom" = dirRange,
      fromVal = dirFrom,
      toVal = dirTo,
      pageVal = dirPage
    ) => {
      try {
        const qs = new URLSearchParams();
        qs.set("page", String(pageVal));
        qs.set("limit", "100");
        if (q) qs.set("q", q);
        if (range !== "all") {
          const tzOffset = new Date().getTimezoneOffset();
          qs.set("tzOffset", String(tzOffset));
          if (range === "1d") {
            const today = getLocalDateInputValue();
            qs.set("from", today);
            qs.set("to", today);
          } else if (range === "7d") {
            qs.set(
              "from",
              getLocalDateInputValue(new Date(Date.now() - 6 * 86_400_000))
            );
            qs.set("to", getLocalDateInputValue());
          } else {
            if (fromVal) qs.set("from", fromVal);
            if (toVal) qs.set("to", toVal);
          }
        }
        const [pRes, dRes] = await Promise.all([
          fetch(`/api/hospital/patients?${qs.toString()}`),
          fetch("/api/hospital/doctors"),
        ]);
      const pData = await pRes.json();
      const dData = await dRes.json();
      const rows = pData.patients ?? [];
      setPatients(rows);
      setDirPagination(
        pData.pagination ?? {
          total: rows.length,
          page: pageVal,
          pageSize: 100,
          totalPages: 1,
        }
      );
      setDoctors((dData.doctors ?? []).filter((d: Doctor) => d.isActive));
    } finally {
      setLoading(false);
    }
  }, [dirRange, dirFrom, dirTo, dirPage]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!loading && !hasInitialFocusedRef.current) {
      hasInitialFocusedRef.current = true;
      window.requestAnimationFrame(() => {
        fullNameInputRef.current?.focus();
      });
    }
  }, [loading]);

  // Close returning-patient autocomplete dropdown when clicking outside
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        nameAutocompleteRef.current &&
        !nameAutocompleteRef.current.contains(event.target as Node)
      ) {
        setSuggestionsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  // Debounced live fetch of matching previously visited patients (latest-to-oldest)
  useEffect(() => {
    const q = form.fullName.trim();
    if (!q || existingPatient) {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/hospital/patients?q=${encodeURIComponent(q)}&limit=10`
        );
        if (!cancelled && res.ok) {
          const d = await res.json();
          setNameSuggestions(d.patients ?? []);
        }
      } catch {
        // fall back to locally loaded patients
      }
    }, 140);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [form.fullName, existingPatient]);

  const trimmedNameQuery = form.fullName.trim().toLowerCase();
  const displayedNameSuggestions =
    !existingPatient && trimmedNameQuery.length > 0
      ? (nameSuggestions ?? patients)
          .filter(
            (p) =>
              p.fullName.toLowerCase().includes(trimmedNameQuery) ||
              p.uhid.toLowerCase().includes(trimmedNameQuery) ||
              p.phone.toLowerCase().includes(trimmedNameQuery)
          )
          .slice(0, 8)
      : [];

  const selectReturningPatient = (p: PatientRow) => {
    setExistingPatient(p);
    setForm((prev) => ({
      ...prev,
      fullName: p.fullName,
      phone: p.phone,
      gender: p.gender,
      // Intentionally leave age blank so staff asks returning patient their current age
      age: "",
    }));
    setSuggestionsOpen(false);
    setNameSuggestions(null);
    setHighlightedSuggestionIdx(0);
    window.requestAnimationFrame(() => {
      ageInputRef.current?.focus();
    });
  };

  const clearReturningPatient = () => {
    setExistingPatient(null);
    setNameSuggestions(null);
    setSuggestionsOpen(false);
    setHighlightedSuggestionIdx(0);
    setForm((prev) => ({
      ...prev,
      fullName: "",
      phone: "",
      age: "",
      gender: "MALE",
    }));
    window.requestAnimationFrame(() => {
      fullNameInputRef.current?.focus();
    });
  };

  const handleDoctorSelect = (docId: string) => {
    const doc = doctors.find((d) => d.id === docId);
    setForm((prev) => ({
      ...prev,
      doctorId: docId,
      doctorName: doc ? doc.name : "",
      department: doc?.specialty ?? "",
      // Only auto-fill consultation fee if actually configured on the doctor!
      consultationFee:
        doc && doc.consultationFee !== null && doc.consultationFee !== undefined
          ? String(doc.consultationFee)
          : prev.consultationFee,
    }));
  };

  const resetFormFields = () => {
    setExistingPatient(null);
    setNameSuggestions(null);
    setSuggestionsOpen(false);
    setHighlightedSuggestionIdx(0);
    setForm((prev) => ({
      ...prev,
      fullName: "",
      age: "",
      gender: "MALE",
      phone: "",
      consultationFee: "",
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.doctorId) {
      toast({
        type: "error",
        title: "Consulting Doctor Required",
        message: "Please select a consulting doctor before registering a patient.",
      });
      doctorSelectRef.current?.focus();
      return;
    }
    setConfirmRegisterOpen(true);
  };

  const confirmAndSubmitRegistration = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/hospital/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          existingPatientId: existingPatient?.id ?? null,
          fullName: form.fullName,
          age: form.age !== "" ? Number(form.age) : null,
          gender: form.gender,
          phone: form.phone,
          doctorId: form.doctorId || null,
          doctorName: form.doctorName || null,
          department: form.department || null,
          visitDate: form.visitDate || null,
          tzOffsetMinutes: new Date().getTimezoneOffset(),
          consultationFee: form.consultationFee ? Number(form.consultationFee) : null,
          paymentMode: form.consultationFee ? form.paymentMode : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ type: "error", title: "Registration Failed", message: data.error });
        setConfirmRegisterOpen(false);
        return;
      }

      toast({
        type: "success",
        title: data.isNewPatient
          ? `Patient Registered (${data.patient.uhid})`
          : `Repeat OP Visit Recorded (${data.patient.uhid})`,
        message: data.isNewPatient
          ? "Consultation sheet and billing receipt are ready to print."
          : "Returning patient profile & age updated. Consultation sheet and receipt ready.",
      });
      setConfirmRegisterOpen(false);
      setPrintResult(data);
      resetFormFields();
      setDirPage(1);
      loadData(searchQuery, dirRange, dirFrom, dirTo, 1);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    const res = await fetch(`/api/hospital/patients/${editTarget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: editForm.fullName,
        age: editForm.age ? Number(editForm.age) : null,
        gender: editForm.gender,
        phone: editForm.phone,
      }),
    });
    const d = await res.json();
    if (!res.ok) {
      toast({ type: "error", title: "Update failed", message: d.error });
      return;
    }
    toast({ type: "success", title: "Patient profile updated" });
    setEditTarget(null);
    loadData(searchQuery);
  };

  return (
    <div className="space-y-7">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-[#0f241d]">
          OP Registration & Patient Directory
        </h1>
      </div>

      {/* Registration Form */}
      <SpringCard className="p-6">
        <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0d4a38] to-[#059669] text-white">
              <UserPlus className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-[#0f241d]">
                New Patient & OP Consultation Registration
              </h2>
            </div>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              (e.target instanceof HTMLInputElement ||
                e.target instanceof HTMLSelectElement)
            ) {
              e.preventDefault();
              focusNextFieldInContainer(e.target, e.currentTarget);
            }
          }}
          className="space-y-5"
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div ref={nameAutocompleteRef} className="relative sm:col-span-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <label className="block text-xs font-semibold text-[#314c40]">
                  Patient Full Name *
                </label>
                {existingPatient ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-[#0d4a38]">
                    <UserCheck className="h-3 w-3 text-emerald-700" />
                    Returning · {existingPatient.uhid}
                    <button
                      type="button"
                      onClick={clearReturningPatient}
                      className="ml-0.5 rounded-full p-0.5 hover:bg-emerald-200/70 cursor-pointer"
                      title="Clear returning patient and register new"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ) : null}
              </div>
              <input
                ref={fullNameInputRef}
                autoFocus
                required
                autoComplete="off"
                value={form.fullName}
                onFocus={() => {
                  if (!existingPatient && form.fullName.trim().length > 0) {
                    setSuggestionsOpen(true);
                  }
                }}
                onChange={(e) => {
                  const val = e.target.value;
                  if (existingPatient && val !== existingPatient.fullName) {
                    setExistingPatient(null);
                  }
                  setForm({ ...form, fullName: val });
                  if (val.trim().length > 0) {
                    setSuggestionsOpen(true);
                    setHighlightedSuggestionIdx(0);
                  } else {
                    setSuggestionsOpen(false);
                    setNameSuggestions(null);
                  }
                }}
                onKeyDown={(e) => {
                  if (suggestionsOpen && displayedNameSuggestions.length > 0) {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      e.stopPropagation();
                      setHighlightedSuggestionIdx((prev) =>
                        Math.min(displayedNameSuggestions.length - 1, prev + 1)
                      );
                      return;
                    }
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      e.stopPropagation();
                      setHighlightedSuggestionIdx((prev) => Math.max(0, prev - 1));
                      return;
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      e.stopPropagation();
                      setSuggestionsOpen(false);
                      return;
                    }
                    if (e.key === "Enter") {
                      e.preventDefault();
                      e.stopPropagation();
                      const picked =
                        displayedNameSuggestions[
                          Math.min(
                            highlightedSuggestionIdx,
                            displayedNameSuggestions.length - 1
                          )
                        ];
                      if (picked) {
                        selectReturningPatient(picked);
                      }
                      return;
                    }
                  }
                }}
                placeholder="Type patient name (shows previously visited options)..."
                className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />

              {suggestionsOpen && displayedNameSuggestions.length > 0 ? (
                <div className="absolute left-0 right-0 top-full z-40 mt-1.5 overflow-hidden rounded-2xl border border-[#bfe0cc] bg-white shadow-xl shadow-emerald-950/15">
                  <div className="flex items-center justify-between border-b border-[#e3efe7] bg-[#f4faf6] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#466356]">
                    <span>Previously Visited Patients (Latest First)</span>
                    <span className="text-emerald-700">Press Enter to Fill</span>
                  </div>
                  <div className="max-h-56 overflow-y-auto divide-y divide-[#edf6f0]">
                    {displayedNameSuggestions.map((p, idx) => {
                      const isHighlighted =
                        Math.min(
                          highlightedSuggestionIdx,
                          displayedNameSuggestions.length - 1
                        ) === idx;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onMouseEnter={() => setHighlightedSuggestionIdx(idx)}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            selectReturningPatient(p);
                          }}
                          className={`flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left text-xs transition-colors cursor-pointer ${
                            isHighlighted
                              ? "bg-[#dff4e8] text-[#0d4a38]"
                              : "bg-white text-[#0f241d] hover:bg-emerald-50/70"
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-bold text-[#0f241d]">
                                {p.fullName}
                              </span>
                              <span className="font-mono-id rounded bg-white/90 border border-[#cfe2d6] px-1.5 py-0.5 text-[10px] font-bold text-[#0d4a38]">
                                {p.uhid}
                              </span>
                              {idx === 0 ? (
                                <span className="rounded-full bg-emerald-600/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-800">
                                  Latest
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-0.5 text-[11px] text-[#466356]">
                              Mobile: <strong>{p.phone}</strong> · {p.gender} · Prev Age:{" "}
                              {p.age !== null ? `${p.age} yrs` : "Unset"} ·{" "}
                              {p._count.opVisits} OP visit(s)
                            </p>
                          </div>
                          {isHighlighted ? (
                            <span className="shrink-0 rounded-lg border border-emerald-300 bg-white px-2 py-0.5 text-[10px] font-bold text-[#0d4a38]">
                              Return ↵
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[#314c40]">
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
                value={form.phone}
                onChange={(e) =>
                  setForm({ ...form, phone: sanitizeMobileInput(e.target.value) })
                }
                className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2.5 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[#314c40]">
                Gender *
              </label>
              <select
                value={form.gender}
                onChange={(e) =>
                  setForm({
                    ...form,
                    gender: e.target.value as "MALE" | "FEMALE" | "OTHER",
                  })
                }
                className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2.5 text-sm"
              >
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[#314c40]">
                {existingPatient ? "Current Age (years) *" : "Age (years)"}
              </label>
              <input
                ref={ageInputRef}
                type="number"
                required={Boolean(existingPatient)}
                min={0}
                max={130}
                value={form.age}
                onChange={(e) => setForm({ ...form, age: e.target.value })}
                placeholder={
                  existingPatient
                    ? `Ask current age (prev: ${existingPatient.age ?? "N/A"})`
                    : "e.g. 42"
                }
                className={`w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm ${
                  existingPatient
                    ? "border-emerald-400 ring-2 ring-emerald-500/15"
                    : "border-[#cfe2d6]"
                }`}
              />
              {existingPatient ? (
                <p className="mt-1 text-[10px] font-medium text-emerald-800">
                  Prev recorded: {existingPatient.age !== null ? `${existingPatient.age} yrs` : "Unset"} · New age updates main patient profile automatically.
                </p>
              ) : null}
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[#314c40]">
                Registration / Visit Date *
              </label>
              <input
                type="date"
                required
                value={form.visitDate}
                onChange={(e) => setForm({ ...form, visitDate: e.target.value })}
                className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2.5 text-sm"
              />
            </div>
          </div>

          <div className="border-t border-[#dcece2] pt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#314c40]">
                Consulting Doctor *
              </label>
              <select
                ref={doctorSelectRef}
                required
                value={form.doctorId}
                onChange={(e) => handleDoctorSelect(e.target.value)}
                className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                <option value="">Select consulting doctor *</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} {d.specialty ? `(${d.specialty})` : ""}
                  </option>
                ))}
              </select>
              {doctors.length === 0 ? (
                <p className="mt-1 text-[11px] font-medium text-amber-800">
                  No active doctors configured. Add a consulting doctor in Management to register OP patients.
                </p>
              ) : null}
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[#314c40]">
                Selected Doctor Name
              </label>
              <input
                readOnly
                value={form.doctorName}
                placeholder="Auto-filled from Consulting Doctor"
                className="w-full rounded-xl border border-[#dcece2] bg-[#f7fbf8] px-3.5 py-2.5 text-sm text-[#314c40]"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[#314c40]">
                Department / Speciality
              </label>
              <input
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
                className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2.5 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[#314c40]">
                Payment Mode (if fee entered)
              </label>
              <select
                value={form.paymentMode}
                onChange={(e) => setForm({ ...form, paymentMode: e.target.value })}
                className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2.5 text-sm"
              >
                <option value="CASH">Cash</option>
                <option value="UPI">UPI</option>
                <option value="CARD">Card</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[#314c40]">
                Consultation Fee (Optional ₹)
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.consultationFee}
                onChange={(e) =>
                  setForm({ ...form, consultationFee: e.target.value })
                }
                className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2.5 text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <BubblyButton type="submit" disabled={submitting} className="px-6 py-3">
              <Stethoscope className="h-4 w-4" />
              {submitting
                ? "Saving Registration..."
                : "Register Patient & Generate UHID"}
            </BubblyButton>
          </div>
        </form>
      </SpringCard>

      {/* Search & Registered Patients Directory */}
      <SpringCard className="p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-bold text-[#0f241d]">
              Registered Patients Directory
            </h2>
            <p className="text-xs text-[#466356]">
              Click any UHID to inspect full patient timeline or print OP bill and receipt.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { id: "all", label: "All Time" },
                { id: "1d", label: "1 Day" },
                { id: "7d", label: "7 Days" },
                { id: "custom", label: "Custom" },
              ] as const
            ).map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  setDirRange(r.id);
                  setDirPage(1);
                  loadData(searchQuery, r.id, dirFrom, dirTo, 1);
                }}
                className={`rounded-xl border px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                  dirRange === r.id
                    ? "border-emerald-500 bg-[#dff4e8] text-[#0d4a38]"
                    : "border-[#cfe2d6] bg-white text-[#466356]"
                }`}
              >
                {r.label}
              </button>
            ))}

            {dirRange === "custom" ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={dirFrom}
                  onChange={(e) => {
                    setDirFrom(e.target.value);
                    setDirPage(1);
                    loadData(searchQuery, "custom", e.target.value, dirTo, 1);
                  }}
                  className="rounded-xl border border-[#cfe2d6] bg-white px-2.5 py-1.5 text-xs"
                />
                <span className="text-xs text-[#5b796b]">to</span>
                <input
                  type="date"
                  value={dirTo}
                  onChange={(e) => {
                    setDirTo(e.target.value);
                    setDirPage(1);
                    loadData(searchQuery, "custom", dirFrom, e.target.value, 1);
                  }}
                  className="rounded-xl border border-[#cfe2d6] bg-white px-2.5 py-1.5 text-xs"
                />
              </div>
            ) : null}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setDirPage(1);
                loadData(searchQuery, dirRange, dirFrom, dirTo, 1);
              }}
              className="flex gap-2"
            >
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6c877a]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setDirPage(1);
                    loadData(e.target.value, dirRange, dirFrom, dirTo, 1);
                  }}
                  placeholder="Search name, UHID or phone..."
                  className="w-60 rounded-xl border border-[#cfe2d6] bg-white py-2 pl-9 pr-3 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </form>
          </div>
        </div>

        {loading ? (
          <SkeletonBox className="h-44" />
        ) : patients.length === 0 ? (
          <EmptyState
            icon={<Search className="h-5 w-5" />}
            title="No matching patients found"
            description="Register a new patient above or broaden your UHID, name, or phone search."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#dcece2] text-[11px] uppercase tracking-wider text-[#5b796b]">
                  <th className="py-3 pr-3">UHID</th>
                  <th className="py-3 px-3">Patient</th>
                  <th className="py-3 px-3">Contact</th>
                  <th className="py-3 px-3">Activity</th>
                  <th className="py-3 px-3">Last Visit</th>
                  <th className="py-3 pl-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eaf4ee]">
                {patients.map((p) => (
                  <tr key={p.id} className="hover:bg-[#f7fbf8]">
                    <td className="py-3 pr-3">
                      <Link
                        href={`/hospital/patients/${encodeURIComponent(p.uhid)}`}
                        className="font-mono-id inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-[#0d4a38] border border-emerald-200 hover:bg-emerald-100"
                      >
                        {p.uhid}
                      </Link>
                    </td>
                    <td className="py-3 px-3">
                      <p className="font-semibold text-[#0f241d]">{p.fullName}</p>
                      <p className="text-xs text-[#5b796b]">
                        {p.age ? `${p.age} yrs · ` : ""}
                        {p.gender}
                        {p.bloodGroup ? ` · ${p.bloodGroup}` : ""}
                      </p>
                    </td>
                    <td className="py-3 px-3 text-xs">
                      <p className="font-medium text-[#0f241d]">{p.phone}</p>
                      <p className="truncate max-w-[180px] text-[#5b796b]">
                        {p.address ?? "—"}
                      </p>
                    </td>
                    <td className="py-3 px-3 text-xs">
                      <span>{p._count.opVisits} OP</span> ·{" "}
                      <span>{p._count.ipAdmissions} IP</span> ·{" "}
                      <span>
                        {p._count.pharmacyReferrals + p._count.labReferrals} Refs
                      </span>
                      {p.ipAdmissions.length > 0 ? (
                        <div className="mt-1">
                          <StatusBadge status="ADMITTED" label="Currently IP" />
                        </div>
                      ) : null}
                    </td>
                    <td className="py-3 px-3 text-xs text-[#5b796b]">
                      {p.opVisits[0] ? (
                        <>
                          <p className="font-medium text-[#0f241d]">
                            {p.opVisits[0].doctorNameSnapshot}
                          </p>
                          <p>
                            {formatAccurateDate(p.opVisits[0].visitDate)}
                          </p>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-3 pl-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {p.opVisits[0] ? (
                          <Link
                            href={`/print/op-consultation/${p.opVisits[0].id}`}
                            target="_blank"
                            className="inline-flex items-center gap-1 rounded-xl border border-[#cfe2d6] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#0d4a38] hover:bg-emerald-50"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            Consultancy Sheet
                          </Link>
                        ) : null}
                        {(p.opVisits[0]?.billingReceipts?.[0]?.id ?? p.billingReceipts?.[0]?.id) ? (
                          <Link
                            href={`/print/receipt/${
                              p.opVisits[0]?.billingReceipts?.[0]?.id ??
                              p.billingReceipts?.[0]?.id
                            }`}
                            target="_blank"
                            className="inline-flex items-center gap-1 rounded-xl bg-[#dff4e8] px-2.5 py-1.5 text-xs font-semibold text-[#0d4a38] hover:bg-emerald-200"
                          >
                            <Receipt className="h-3.5 w-3.5" />
                            Bill
                          </Link>
                        ) : null}
                        <BubblyButton
                          variant="outline"
                          className="px-2.5 py-1.5 text-xs"
                          onClick={() => {
                            setEditTarget(p);
                            setEditForm({
                              fullName: p.fullName,
                              age: p.age !== null ? String(p.age) : "",
                              gender: p.gender,
                              phone: p.phone,
                            });
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </BubblyButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-[#eaf4ee] pt-3 text-xs text-[#466356]">
              <span>
                Showing {(dirPagination.page - 1) * dirPagination.pageSize + 1}–
                {Math.min(
                  dirPagination.page * dirPagination.pageSize,
                  dirPagination.total
                )}{" "}
                of {dirPagination.total} patient(s) · Page {dirPagination.page} of{" "}
                {dirPagination.totalPages} (max 100 per page)
              </span>
              {dirPagination.totalPages > 1 ? (
                <div className="flex gap-2">
                  <BubblyButton
                    variant="outline"
                    className="px-3 py-1.5 text-xs"
                    disabled={dirPagination.page <= 1}
                    onClick={() => {
                      const nextPage = Math.max(1, dirPagination.page - 1);
                      setDirPage(nextPage);
                      loadData(searchQuery, dirRange, dirFrom, dirTo, nextPage);
                    }}
                  >
                    Previous
                  </BubblyButton>
                  <BubblyButton
                    variant="outline"
                    className="px-3 py-1.5 text-xs"
                    disabled={dirPagination.page >= dirPagination.totalPages}
                    onClick={() => {
                      const nextPage = Math.min(
                        dirPagination.totalPages,
                        dirPagination.page + 1
                      );
                      setDirPage(nextPage);
                      loadData(searchQuery, dirRange, dirFrom, dirTo, nextPage);
                    }}
                  >
                    Next
                  </BubblyButton>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </SpringCard>

      {/* Confirm OP Registration Modal */}
      <AnimatedModal
        open={confirmRegisterOpen}
        onClose={() => !submitting && setConfirmRegisterOpen(false)}
        title={
          existingPatient
            ? `Confirm Repeat OP Visit · ${existingPatient.uhid}`
            : "Confirm OP Registration & UHID"
        }
        subtitle={
          existingPatient
            ? "Existing patient profile will be updated with the entered age and linked to this new OP consultation."
            : "Please review patient details before generating a permanent UHID."
        }
      >
        <div className="space-y-4 text-xs">
          {existingPatient ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-3.5 py-2.5 text-emerald-900">
              <strong>Returning Patient ({existingPatient.uhid}):</strong> Main profile age will update{" "}
              {existingPatient.age !== null ? `from ${existingPatient.age} yrs ` : ""}
              to <strong>{form.age || "unchanged"} yrs</strong>.
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3 rounded-2xl border border-[#dcece2] bg-[#f8fcfa] p-4">
            <div>
              <p className="text-[#5b796b]">Patient Name</p>
              <p className="font-semibold text-[#0f241d]">{form.fullName}</p>
            </div>
            <div>
              <p className="text-[#5b796b]">Mobile Number</p>
              <p className="font-semibold text-[#0f241d]">{form.phone}</p>
            </div>
            <div>
              <p className="text-[#5b796b]">Gender / Age</p>
              <p className="font-semibold text-[#0f241d]">
                {form.gender} {form.age ? `· ${form.age} yrs` : ""}
              </p>
            </div>
            <div>
              <p className="text-[#5b796b]">Visit Date</p>
              <p className="font-semibold text-[#0f241d]">{form.visitDate}</p>
            </div>
            <div>
              <p className="text-[#5b796b]">Doctor / Department</p>
              <p className="font-semibold text-[#0f241d]">
                {form.doctorName || "General"} {form.department ? `(${form.department})` : ""}
              </p>
            </div>
            <div>
              <p className="text-[#5b796b]">Consultation Fee</p>
              <p className="font-semibold text-[#0f241d]">
                {form.consultationFee
                  ? `₹${Number(form.consultationFee).toFixed(2)} (${form.paymentMode})`
                  : "Not specified"}
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <BubblyButton
              variant="outline"
              disabled={submitting}
              onClick={() => setConfirmRegisterOpen(false)}
            >
              Back
            </BubblyButton>
            <BubblyButton
              type="button"
              disabled={submitting}
              onClick={confirmAndSubmitRegistration}
            >
              <Stethoscope className="h-4 w-4" />
              {submitting
                ? existingPatient
                  ? "Recording Visit..."
                  : "Generating UHID..."
                : existingPatient
                  ? "Confirm & Record Repeat Visit"
                  : "Confirm & Generate UHID"}
            </BubblyButton>
          </div>
        </div>
      </AnimatedModal>

      {/* Post-Registration Dual Print Modal */}
      <AnimatedModal
        open={Boolean(printResult)}
        onClose={() => setPrintResult(null)}
        title="OP Registration Completed"
        subtitle={
          printResult
            ? `UHID: ${printResult.patient.uhid} · Visit: ${printResult.opVisit.visitNumber}`
            : undefined
        }
      >
        {printResult ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-xs text-emerald-950">
              <p className="font-bold text-sm">
                {printResult.patient.fullName} ({printResult.patient.uhid})
              </p>
              <p className="mt-1">
                Consulting Doctor: {printResult.opVisit.doctorNameSnapshot} · Receipt:{" "}
                <span className="font-mono-id">{printResult.receipt.receiptNumber}</span>
                {printResult.receipt.totalAmount !== null
                  ? ` · Amount: ₹${printResult.receipt.totalAmount.toFixed(2)}`
                  : ""}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Link
                href={`/print/op-consultation/${printResult.opVisit.id}`}
                target="_blank"
                className="flex flex-col items-center gap-2 rounded-2xl border border-[#bfe3ce] bg-white p-5 text-center hover:border-emerald-500 hover:bg-emerald-50/40 transition-colors"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-[#0d4a38]">
                  <FileText className="h-5 w-5" />
                </div>
                <span className="font-display text-sm font-bold text-[#0f241d]">
                  Print Consultation Sheet
                </span>
                <span className="text-[11px] text-[#466356]">
                  Doctor Prescription & Physical Notes Form (A4)
                </span>
                <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                  <Printer className="h-3.5 w-3.5" /> Open Print View
                </span>
              </Link>

              <Link
                href={`/print/receipt/${printResult.receipt.id}`}
                target="_blank"
                className="flex flex-col items-center gap-2 rounded-2xl border border-[#bfe3ce] bg-white p-5 text-center hover:border-emerald-500 hover:bg-emerald-50/40 transition-colors"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#dff2e7] text-[#0d4a38]">
                  <Receipt className="h-5 w-5" />
                </div>
                <span className="font-display text-sm font-bold text-[#0f241d]">
                  Print Billing Receipt
                </span>
                <span className="text-[11px] text-[#466356]">
                  Official Hospital OP Receipt Snapshot
                </span>
                <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                  <Printer className="h-3.5 w-3.5" /> Open Print View
                </span>
              </Link>
            </div>

            <div className="flex items-center justify-between pt-2">
              <Link
                href={`/hospital/patients/${encodeURIComponent(printResult.patient.uhid)}`}
                className="text-xs font-semibold text-emerald-700 hover:underline"
              >
                Open Full Patient UHID Timeline →
              </Link>
              <BubblyButton
                variant="secondary"
                onClick={() => {
                  setPrintResult(null);
                  window.requestAnimationFrame(() => {
                    fullNameInputRef.current?.focus();
                  });
                }}
              >
                Done
              </BubblyButton>
            </div>
          </div>
        ) : null}
      </AnimatedModal>

      {/* Edit Patient Modal */}
      <AnimatedModal
        open={Boolean(editTarget)}
        onClose={() => setEditTarget(null)}
        title={`Edit Patient Profile · ${editTarget?.uhid ?? ""}`}
      >
        <form onSubmit={handleSaveEdit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold">Full Name</label>
            <input
              required
              value={editForm.fullName}
              onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
              className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold">Age</label>
              <input
                type="number"
                value={editForm.age}
                onChange={(e) => setEditForm({ ...editForm, age: e.target.value })}
                className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">Gender</label>
              <select
                value={editForm.gender}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    gender: e.target.value as "MALE" | "FEMALE" | "OTHER",
                  })
                }
                className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2 text-sm"
              >
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Phone *</label>
            <input
              required
              type="tel"
              inputMode="numeric"
              minLength={10}
              maxLength={10}
              pattern="\d{10}"
              title="Enter exactly 10 digits"
              value={editForm.phone}
              onChange={(e) =>
                setEditForm({
                  ...editForm,
                  phone: sanitizeMobileInput(e.target.value),
                })
              }
              className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-3">
            <BubblyButton variant="outline" onClick={() => setEditTarget(null)}>
              Cancel
            </BubblyButton>
            <BubblyButton type="submit">Save Profile</BubblyButton>
          </div>
        </form>
      </AnimatedModal>
    </div>
  );
}
