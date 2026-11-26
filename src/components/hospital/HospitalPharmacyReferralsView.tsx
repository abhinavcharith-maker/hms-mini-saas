"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Eye,
  KeyRound,
  Pencil,
  Pill,
  Plus,
  Search,
  Send,
  ShoppingCart,
  Trash2,
  UserPlus,
  XCircle,
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
import { ROLES } from "@/lib/constants";
import { sanitizeMobileInput } from "@/lib/phone";
import { focusNextFieldInContainer } from "@/lib/keyboard";
import {
  formatAccurateDate,
  formatAccurateDateTime,
  getLocalDateInputValue,
} from "@/lib/datetime";

interface MedicineItem {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
}

interface PharmacyPartner {
  id: string;
  pharmacyName: string;
  contactPerson: string;
  phone: string;
  address: string | null;
  isActive: boolean;
  user: { id: string; username: string; isActive: boolean };
  _count: { referrals: number };
}

interface PharmacyReferralRow {
  id: string;
  referralNumber: string;
  patientId: string;
  patientNameSnapshot: string;
  patientUhidSnapshot: string;
  patientPhoneSnapshot: string | null;
  pharmacyNameSnapshot: string;
  notes: string | null;
  totalAmount: number | null;
  status: "PENDING" | "COMPLETED" | "CANCELLED";
  referredAt: string;
  completedAt: string | null;
  completedByNameSnapshot: string | null;
  items: Array<{
    id: string;
    medicineNameSnapshot: string;
    descriptionSnapshot: string | null;
    quantity: number;
    unitPriceSnapshot: number | null;
    lineTotal: number | null;
    dosageInstructions: string | null;
  }>;
}

export function HospitalPharmacyReferralsView() {
  const { toast } = useToast();
  const [role, setRole] = useState<string>(ROLES.RECEPTIONIST);
  const [tab, setTab] = useState<"refer" | "history" | "catalog" | "logins">("refer");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [patients, setPatients] = useState<
    Array<{ id: string; uhid: string; fullName: string; phone: string }>
  >([]);
  const [searchedPatients, setSearchedPatients] = useState<
    Array<{ id: string; uhid: string; fullName: string; phone: string }> | null
  >(null);
  const [medicines, setMedicines] = useState<MedicineItem[]>([]);
  const [pharmacies, setPharmacies] = useState<PharmacyPartner[]>([]);
  const [referrals, setReferrals] = useState<PharmacyReferralRow[]>([]);

  // Refer Medicine state
  const [patientSearch, setPatientSearch] = useState("");
  const [highlightedPatientIndex, setHighlightedPatientIndex] = useState(0);
  const [selectedPatient, setSelectedPatient] = useState<{
    id: string;
    uhid: string;
    fullName: string;
    phone: string;
  } | null>(null);
  const [selectedPharmacyId, setSelectedPharmacyId] = useState("");
  const [medSearch, setMedSearch] = useState("");
  const [medDropdownOpen, setMedDropdownOpen] = useState(false);
  const [highlightedMedIndex, setHighlightedMedIndex] = useState(0);
  const [creatingMed, setCreatingMed] = useState(false);
  const [catalogMedSearch, setCatalogMedSearch] = useState("");
  const [pendingMed, setPendingMed] = useState<MedicineItem | null>(null);
  const [pendingQty, setPendingQty] = useState("1");
  const referFormRef = useRef<HTMLFormElement | null>(null);
  const patientSearchRef = useRef<HTMLInputElement | null>(null);
  const pharmacySelectRef = useRef<HTMLSelectElement | null>(null);
  const medContainerRef = useRef<HTMLDivElement | null>(null);
  const medInputRef = useRef<HTMLInputElement | null>(null);
  const qtyInputRef = useRef<HTMLInputElement | null>(null);
  const [referralItems, setReferralItems] = useState<
    Array<{
      medicineCatalogId: string;
      name: string;
      quantity: number;
    }>
  >([]);

  // History filters
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPharmacy, setFilterPharmacy] = useState("");
  const [filterSearch, setFilterSearch] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [catalogPage, setCatalogPage] = useState(1);
  const [detailReferral, setDetailReferral] = useState<PharmacyReferralRow | null>(null);

  // Admin Modals: Medicine Catalog
  const [medModalOpen, setMedModalOpen] = useState(false);
  const [editingMed, setEditingMed] = useState<MedicineItem | null>(null);
  const [medForm, setMedForm] = useState({ name: "" });

  // Admin Modals: Pharmacy Account
  const [partnerModalOpen, setPartnerModalOpen] = useState(false);
  const [partnerForm, setPartnerForm] = useState({
    organizationName: "",
    contactPerson: "",
    phone: "",
    address: "",
    username: "",
    password: "",
  });
  const [resetPartner, setResetPartner] = useState<PharmacyPartner | null>(null);
  const [resetPw, setResetPw] = useState("");

  const isAdmin = role === ROLES.HOSPITAL_ADMIN;

  const loadAll = useCallback(async () => {
    try {
      const [meRes, pRes, mRes, phRes, rRes] = await Promise.all([
        fetch("/api/auth/me"),
        fetch("/api/hospital/patients?limit=100"),
        fetch("/api/hospital/medicines"),
        fetch("/api/hospital/pharmacies"),
        fetch("/api/hospital/pharmacy-referrals"),
      ]);
      const meData = await meRes.json();
      if (meData?.user?.role) setRole(meData.user.role);

      const pData = await pRes.json();
      const mData = await mRes.json();
      const phData = await phRes.json();
      const rData = await rRes.json();

      setPatients(pData.patients ?? []);
      setMedicines(mData.medicines ?? []);
      setPharmacies(phData.pharmacies ?? []);
      setReferrals(rData.referrals ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!loading && tab === "refer" && !selectedPatient) {
      window.requestAnimationFrame(() => {
        patientSearchRef.current?.focus();
      });
    }
  }, [loading, tab, selectedPatient]);

  useEffect(() => {
    const q = patientSearch.trim();
    if (!q) {
      return;
    }
    const timer = setTimeout(async () => {
      const res = await fetch(
        `/api/hospital/patients?q=${encodeURIComponent(q)}&limit=30`
      );
      if (res.ok) {
        const d = await res.json();
        setSearchedPatients(d.patients ?? []);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [patientSearch]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (
        medContainerRef.current &&
        !medContainerRef.current.contains(e.target as Node)
      ) {
        setMedDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const activePharmacies = pharmacies.filter((p) => p.isActive);
  const matchingPatients = patientSearch.trim()
    ? (searchedPatients ?? patients).filter((p) => {
        const q = patientSearch.trim().toLowerCase();
        return (
          p.uhid.toLowerCase().includes(q) ||
          p.fullName.toLowerCase().includes(q) ||
          p.phone.toLowerCase().includes(q)
        );
      })
    : [];

  const trimmedMedSearch = medSearch.trim();
  const dropdownMedicines = trimmedMedSearch
    ? medicines.filter((m) =>
        m.name.toLowerCase().includes(trimmedMedSearch.toLowerCase())
      )
    : medicines;
  const hasExactMedMatch =
    trimmedMedSearch.length > 0 &&
    medicines.some(
      (m) => m.name.toLowerCase() === trimmedMedSearch.toLowerCase()
    );
  const showCreateMedOption =
    trimmedMedSearch.length > 0 && !hasExactMedMatch;

  const catalogFilteredMedicines = catalogMedSearch.trim()
    ? medicines.filter((m) =>
        m.name.toLowerCase().includes(catalogMedSearch.trim().toLowerCase())
      )
    : medicines;

  const selectMedicineForQuantity = (med: MedicineItem) => {
    setPendingMed(med);
    setPendingQty("1");
    setMedDropdownOpen(false);
    setMedSearch("");
    setHighlightedMedIndex(0);
    window.requestAnimationFrame(() => {
      qtyInputRef.current?.focus();
      qtyInputRef.current?.select();
    });
  };

  const handleCreateAndUseMedicine = async (name: string) => {
    const cleanName = name.trim();
    if (!cleanName || creatingMed) return;
    setCreatingMed(true);
    try {
      const res = await fetch("/api/hospital/medicines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: cleanName,
          description: null,
          price: null,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast({ type: "error", title: "Could not create medicine", message: d.error });
        return;
      }
      const createdMed: MedicineItem = d.medicine;
      setMedicines((prev) =>
        prev.some((m) => m.id === createdMed.id)
          ? prev
          : [...prev, createdMed].sort((a, b) => a.name.localeCompare(b.name))
      );
      toast({
        type: "success",
        title: "Medicine added to catalogue",
        message: `${createdMed.name} is ready for quantity entry.`,
      });
      selectMedicineForQuantity(createdMed);
    } finally {
      setCreatingMed(false);
    }
  };

  const handleAddPendingToCart = () => {
    if (!pendingMed) return;
    const qty = Math.max(1, Number.parseInt(pendingQty, 10) || 1);
    setReferralItems((prev) => {
      const existing = prev.find((i) => i.medicineCatalogId === pendingMed.id);
      if (existing) {
        return prev.map((i) =>
          i.medicineCatalogId === pendingMed.id
            ? { ...i, quantity: i.quantity + qty }
            : i
        );
      }
      return [
        ...prev,
        {
          medicineCatalogId: pendingMed.id,
          name: pendingMed.name,
          quantity: qty,
        },
      ];
    });
    setPendingMed(null);
    setPendingQty("1");
    window.requestAnimationFrame(() => {
      medInputRef.current?.focus();
    });
  };

  const handleCreateReferral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient || !selectedPharmacyId || referralItems.length === 0) {
      toast({
        type: "warning",
        title: "Missing details",
        message: "Select a registered patient, pharmacy partner, and add at least one medicine to the cart.",
      });
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/hospital/pharmacy-referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: selectedPatient.id,
          pharmacyAccountId: selectedPharmacyId,
          notes: null,
          overrideTotalAmount: null,
          items: referralItems.map((i) => ({
            medicineCatalogId: i.medicineCatalogId,
            quantity: i.quantity,
            unitPriceOverride: null,
            dosageInstructions: null,
          })),
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast({ type: "error", title: "Referral Failed", message: d.error });
        return;
      }
      toast({
        type: "success",
        title: `Pharmacy Referral Created (${d.referral.referralNumber})`,
        message: `Assigned to ${d.referral.pharmacyNameSnapshot}.`,
      });
      setReferralItems([]);
      setPendingMed(null);
      setPendingQty("1");
      setSelectedPatient(null);
      setPatientSearch("");
      setSearchedPatients(null);
      loadAll();
      setTab("history");
    } finally {
      setBusy(false);
    }
  };

  const handleCancelReferral = async (id: string) => {
    const res = await fetch(`/api/hospital/pharmacy-referrals/${id}/cancel`, {
      method: "POST",
    });
    const d = await res.json();
    if (!res.ok) {
      toast({ type: "error", title: "Cancel failed", message: d.error });
      return;
    }
    toast({ type: "info", title: "Referral cancelled" });
    loadAll();
  };

  const handleSaveMedicine = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const url = editingMed
        ? `/api/hospital/medicines/${editingMed.id}`
        : "/api/hospital/medicines";
      const method = editingMed ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: medForm.name,
          description: null,
          price: null,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast({ type: "error", title: "Save failed", message: d.error });
        return;
      }
      toast({
        type: "success",
        title: editingMed ? "Medicine Updated" : "Medicine Added",
      });
      setMedModalOpen(false);
      setEditingMed(null);
      loadAll();
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteMedicine = async (med: MedicineItem) => {
    const res = await fetch(`/api/hospital/medicines/${med.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const d = await res.json();
      toast({ type: "error", title: "Delete failed", message: d.error });
      return;
    }
    toast({
      type: "info",
      title: "Medicine removed from catalogue",
      message: "Existing referral history remains preserved via snapshots.",
    });
    loadAll();
  };

  const handleCreatePartner = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/hospital/pharmacies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partnerForm),
      });
      const d = await res.json();
      if (!res.ok) {
        toast({ type: "error", title: "Creation failed", message: d.error });
        return;
      }
      toast({
        type: "success",
        title: "Pharmacy Login Created",
        message: `${d.pharmacy.pharmacyName} (@${d.pharmacy.user.username}) is ready.`,
      });
      setPartnerModalOpen(false);
      setPartnerForm({
        organizationName: "",
        contactPerson: "",
        phone: "",
        address: "",
        username: "",
        password: "",
      });
      loadAll();
    } finally {
      setBusy(false);
    }
  };

  const togglePartnerActive = async (p: PharmacyPartner) => {
    const res = await fetch(`/api/hospital/pharmacies/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !p.isActive }),
    });
    if (res.ok) {
      toast({
        type: p.isActive ? "warning" : "success",
        title: p.isActive ? "Pharmacy Deactivated" : "Pharmacy Activated",
      });
      loadAll();
    }
  };

  const handleResetPartnerPw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPartner) return;
    const res = await fetch(`/api/hospital/pharmacies/${resetPartner.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resetPassword: resetPw }),
    });
    const d = await res.json();
    if (!res.ok) {
      toast({ type: "error", title: "Reset failed", message: d.error });
      return;
    }
    toast({ type: "success", title: "Pharmacy password reset" });
    setResetPartner(null);
    setResetPw("");
  };

  const visibleReferrals = referrals.filter((r) => {
    if (filterStatus && r.status !== filterStatus) return false;
    if (
      filterPharmacy &&
      !r.pharmacyNameSnapshot
        .toLowerCase()
        .includes(filterPharmacy.toLowerCase())
    ) {
      return false;
    }
    const refLocalDate = getLocalDateInputValue(new Date(r.referredAt));
    if (filterFrom && refLocalDate < filterFrom) return false;
    if (filterTo && refLocalDate > filterTo) return false;
    if (filterSearch) {
      const q = filterSearch.toLowerCase();
      if (
        !r.referralNumber.toLowerCase().includes(q) &&
        !r.patientNameSnapshot.toLowerCase().includes(q) &&
        !r.patientUhidSnapshot.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    return true;
  });

  const totalHistoryPages = Math.max(
    1,
    Math.ceil(visibleReferrals.length / DEFAULT_PAGE_SIZE)
  );
  const safeHistoryPage = Math.min(historyPage, totalHistoryPages);
  const paginatedReferrals = visibleReferrals.slice(
    (safeHistoryPage - 1) * DEFAULT_PAGE_SIZE,
    safeHistoryPage * DEFAULT_PAGE_SIZE
  );

  const totalCatalogPages = Math.max(
    1,
    Math.ceil(catalogFilteredMedicines.length / DEFAULT_PAGE_SIZE)
  );
  const safeCatalogPage = Math.min(catalogPage, totalCatalogPages);
  const paginatedCatalogMedicines = catalogFilteredMedicines.slice(
    (safeCatalogPage - 1) * DEFAULT_PAGE_SIZE,
    safeCatalogPage * DEFAULT_PAGE_SIZE
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-[#0f241d]">
            Pharmacy Referrals
          </h1>
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap gap-2 rounded-2xl border border-[#cfe2d6] bg-white p-1.5 w-fit">
        {[
          { id: "refer", label: "Refer Medicines" },
          { id: "history", label: `Referral History (${referrals.length})` },
          { id: "catalog", label: `Medicine Catalogue (${medicines.length})` },
          ...(isAdmin
            ? [{ id: "logins", label: `Pharmacy Logins (${pharmacies.length})` }]
            : []),
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id as typeof tab)}
            className={`rounded-xl px-4 py-2 text-xs font-semibold transition-colors cursor-pointer ${
              tab === t.id
                ? "bg-[#dff4e8] text-[#0d4a38]"
                : "text-[#466356] hover:text-[#0f241d]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <SkeletonBox className="h-72" />
      ) : tab === "refer" ? (
        <SpringCard className="p-6 space-y-6">
          <form ref={referFormRef} onSubmit={handleCreateReferral} className="space-y-6">
            <h2 className="font-display text-lg font-bold text-[#0f241d]">
              Create Medicine Referral
            </h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="mb-1 block text-xs font-semibold">
                  1. Search Registered Patient (UHID, Name, or Mobile) *
                </label>
                {selectedPatient ? (
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-300 bg-emerald-50/70 px-3.5 py-2.5 text-xs text-[#0f241d]">
                    <div>
                      <span className="font-semibold">{selectedPatient.fullName}</span>{" "}
                      · <span className="font-mono-id">{selectedPatient.uhid}</span> ·{" "}
                      {selectedPatient.phone}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPatient(null);
                        setPatientSearch("");
                      }}
                      className="font-semibold text-emerald-800 hover:underline cursor-pointer"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6c877a]" />
                      <input
                        ref={patientSearchRef}
                        autoFocus
                        value={patientSearch}
                        onChange={(e) => {
                          setPatientSearch(e.target.value);
                          if (!e.target.value.trim()) {
                            setSearchedPatients(null);
                          }
                          setHighlightedPatientIndex(0);
                        }}
                        onKeyDown={(e) => {
                          if (!patientSearch.trim()) {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              pharmacySelectRef.current?.focus();
                            }
                            return;
                          }
                          if (e.key === "ArrowDown") {
                            e.preventDefault();
                            if (matchingPatients.length > 0) {
                              setHighlightedPatientIndex((prev) =>
                                Math.min(matchingPatients.length - 1, prev + 1)
                              );
                            }
                          } else if (e.key === "ArrowUp") {
                            e.preventDefault();
                            setHighlightedPatientIndex((prev) =>
                              Math.max(0, prev - 1)
                            );
                          } else if (e.key === "Enter") {
                            e.preventDefault();
                            e.stopPropagation();
                            if (matchingPatients.length > 0) {
                              const picked =
                                matchingPatients[
                                  Math.min(
                                    highlightedPatientIndex,
                                    matchingPatients.length - 1
                                  )
                                ];
                              if (picked) {
                                setSelectedPatient(picked);
                                setPatientSearch("");
                                setHighlightedPatientIndex(0);
                                window.requestAnimationFrame(() => {
                                  pharmacySelectRef.current?.focus();
                                });
                              }
                            }
                          }
                        }}
                        placeholder="Search by UHID, name, or mobile..."
                        className="w-full rounded-xl border border-[#cfe2d6] bg-white py-2.5 pl-9 pr-3 text-sm"
                      />
                    </div>
                    {!patientSearch.trim() ? null : matchingPatients.length > 0 ? (
                      <div className="max-h-40 overflow-y-auto rounded-xl border border-[#dcece2] bg-[#f8fcfa] divide-y divide-[#e7f1eb]">
                        {matchingPatients.map((p, idx) => {
                          const isHighlighted = highlightedPatientIndex === idx;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onMouseEnter={() => setHighlightedPatientIndex(idx)}
                              onClick={() => {
                                setSelectedPatient(p);
                                setPatientSearch("");
                                setHighlightedPatientIndex(0);
                                window.requestAnimationFrame(() => {
                                  pharmacySelectRef.current?.focus();
                                });
                              }}
                              className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs transition-colors cursor-pointer ${
                                isHighlighted
                                  ? "bg-[#dff4e8] text-[#0d4a38]"
                                  : "hover:bg-emerald-50"
                              }`}
                            >
                              <span className="font-semibold text-[#0f241d]">
                                {p.fullName}
                              </span>
                              <span className="font-mono-id text-[11px] text-[#466356]">
                                {p.uhid} · {p.phone}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-[11px] text-[#5b796b]">
                        No registered patient matched.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold">
                  2. Select Referral Pharmacy *
                </label>
                <select
                  ref={pharmacySelectRef}
                  value={selectedPharmacyId}
                  onChange={(e) => setSelectedPharmacyId(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      medInputRef.current?.focus();
                    }
                  }}
                  className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2.5 text-sm"
                >
                  <option value="">Choose external pharmacy...</option>
                  {activePharmacies.map((ph) => (
                    <option key={ph.id} value={ph.id}>
                      {ph.pharmacyName} ({ph.phone})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-3" ref={medContainerRef}>
              <label className="mb-1 block text-xs font-semibold">
                3. Search Medicines from Catalogue
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6c877a]" />
                <input
                  ref={medInputRef}
                  value={medSearch}
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    setMedSearch(nextVal);
                    setMedDropdownOpen(nextVal.trim().length > 0);
                    setHighlightedMedIndex(0);
                  }}
                  onKeyDown={(e) => {
                    if (!trimmedMedSearch) {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        focusNextFieldInContainer(
                          medInputRef.current,
                          referFormRef.current
                        );
                      }
                      return;
                    }
                    const totalOptions =
                      dropdownMedicines.length + (showCreateMedOption ? 1 : 0);
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setMedDropdownOpen(true);
                      if (totalOptions > 0) {
                        setHighlightedMedIndex((prev) =>
                          Math.min(totalOptions - 1, prev + 1)
                        );
                      }
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setMedDropdownOpen(true);
                      setHighlightedMedIndex((prev) => Math.max(0, prev - 1));
                    } else if (e.key === "Escape") {
                      setMedDropdownOpen(false);
                    } else if (e.key === "Enter") {
                      e.preventDefault();
                      e.stopPropagation();
                      if (totalOptions === 0) return;
                      const safeIndex = Math.min(highlightedMedIndex, totalOptions - 1);
                      if (safeIndex < dropdownMedicines.length) {
                        selectMedicineForQuantity(dropdownMedicines[safeIndex]);
                      } else if (showCreateMedOption) {
                        void handleCreateAndUseMedicine(trimmedMedSearch);
                      }
                    }
                  }}
                  placeholder="Search medicine name..."
                  className="w-full rounded-xl border border-[#cfe2d6] bg-white py-2.5 pl-9 pr-3 text-sm"
                />

                {medDropdownOpen && trimmedMedSearch.length > 0 ? (
                  <div className="absolute left-0 right-0 z-30 mt-1.5 max-h-60 overflow-y-auto rounded-xl border border-[#cfe2d6] bg-white shadow-xl divide-y divide-[#eaf4ee]">
                    {dropdownMedicines.length === 0 && !showCreateMedOption ? (
                      <div className="px-3.5 py-3 text-xs text-[#5b796b]">
                        No medicines found in catalogue.
                      </div>
                    ) : (
                      <>
                        {dropdownMedicines.map((m, idx) => {
                          const inCart = referralItems.find(
                            (i) => i.medicineCatalogId === m.id
                          );
                          const isHighlighted = highlightedMedIndex === idx;
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onMouseEnter={() => setHighlightedMedIndex(idx)}
                              onClick={() => selectMedicineForQuantity(m)}
                              className={`flex w-full items-center justify-between px-3.5 py-2.5 text-left text-xs transition-colors cursor-pointer ${
                                isHighlighted
                                  ? "bg-[#dff4e8] text-[#0d4a38]"
                                  : "bg-white text-[#0f241d] hover:bg-emerald-50"
                              }`}
                            >
                              <span className="font-semibold">{m.name}</span>
                              {inCart ? (
                                <span className="font-mono-id text-[11px] font-semibold text-emerald-700">
                                  In cart: × {inCart.quantity}
                                </span>
                              ) : isHighlighted ? (
                                <span className="text-[11px] font-semibold text-[#0d4a38]">
                                  Press Enter ↵
                                </span>
                              ) : null}
                            </button>
                          );
                        })}

                        {showCreateMedOption ? (
                          <button
                            type="button"
                            disabled={creatingMed}
                            onMouseEnter={() =>
                              setHighlightedMedIndex(dropdownMedicines.length)
                            }
                            onClick={() =>
                              void handleCreateAndUseMedicine(trimmedMedSearch)
                            }
                            className={`flex w-full items-center justify-between px-3.5 py-2.5 text-left text-xs font-semibold transition-colors cursor-pointer ${
                              highlightedMedIndex === dropdownMedicines.length
                                ? "bg-emerald-600 text-white"
                                : "bg-[#f4faf6] text-[#0d4a38] hover:bg-emerald-100"
                            }`}
                          >
                            <span className="inline-flex items-center gap-1.5">
                              <Plus className="h-3.5 w-3.5" />
                              {creatingMed
                                ? "Creating..."
                                : `Create "${trimmedMedSearch}" & Use`}
                            </span>
                            <span className="text-[11px] opacity-85">
                              Add to catalogue
                            </span>
                          </button>
                        ) : null}
                      </>
                    )}
                  </div>
                ) : null}
              </div>

              {pendingMed ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-emerald-400 bg-emerald-50/80 p-3.5 text-xs">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-800">
                      Selected Medicine
                    </p>
                    <p className="font-display text-sm font-bold text-[#0f241d]">
                      {pendingMed.name}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="text-xs font-semibold text-[#314c40]">
                      Quantity *
                      <input
                        ref={qtyInputRef}
                        type="number"
                        min={1}
                        value={pendingQty}
                        onChange={(e) => setPendingQty(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            e.stopPropagation();
                            handleAddPendingToCart();
                          }
                        }}
                        className="ml-2 w-24 rounded-xl border border-[#cfe2d6] bg-white px-3 py-1.5 text-sm font-semibold"
                      />
                    </label>
                    <BubblyButton
                      type="button"
                      onClick={handleAddPendingToCart}
                      className="px-3.5 py-2 text-xs"
                    >
                      <ShoppingCart className="h-3.5 w-3.5" />
                      Add to Cart
                    </BubblyButton>
                    <BubblyButton
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setPendingMed(null);
                        setPendingQty("1");
                      }}
                      className="px-3 py-2 text-xs"
                    >
                      Cancel
                    </BubblyButton>
                  </div>
                </div>
              ) : null}
            </div>

            {referralItems.length > 0 ? (
              <div className="space-y-2.5 rounded-2xl border border-[#dcece2] bg-[#f8fcfa] p-4">
                <p className="font-display text-sm font-bold text-[#0f241d]">
                  Cart ({referralItems.length} item(s))
                </p>
                <div className="space-y-2">
                  {referralItems.map((item, idx) => (
                    <div
                      key={item.medicineCatalogId}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#dcece2] bg-white px-3.5 py-2.5 text-xs"
                    >
                      <span className="font-semibold text-[#0f241d]">
                        {item.name}
                      </span>
                      <div className="flex items-center gap-3">
                        <label className="text-[11px] text-[#5b796b]">
                          Qty
                          <input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(e) =>
                              setReferralItems((prev) =>
                                prev.map((r, i) =>
                                  i === idx
                                    ? {
                                        ...r,
                                        quantity: Math.max(
                                          1,
                                          Number(e.target.value) || 1
                                        ),
                                      }
                                    : r
                                )
                              )
                            }
                            className="ml-1.5 w-16 rounded-lg border border-[#cfe2d6] bg-white px-2 py-1 text-xs font-semibold text-[#0f241d]"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setReferralItems((prev) =>
                              prev.filter((_, i) => i !== idx)
                            )
                          }
                          className="font-semibold text-rose-600 hover:underline cursor-pointer"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex justify-end">
              <BubblyButton
                type="submit"
                disabled={busy || !selectedPatient || !selectedPharmacyId || referralItems.length === 0}
              >
                <Send className="h-4 w-4" />
                {busy ? "Confirming Referral..." : "Confirm Pharmacy Referral"}
              </BubblyButton>
            </div>
          </form>
        </SpringCard>
      ) : tab === "history" ? (
        <SpringCard className="p-6 space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <input
              value={filterSearch}
              onChange={(e) => {
                setFilterSearch(e.target.value);
                setHistoryPage(1);
              }}
              placeholder="Search ref ID, patient, UHID..."
              className="rounded-xl border border-[#cfe2d6] px-3 py-2 text-xs"
            />
            <select
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value);
                setHistoryPage(1);
              }}
              className="rounded-xl border border-[#cfe2d6] px-3 py-2 text-xs"
            >
              <option value="">All Statuses</option>
              <option value="PENDING">Pending</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
            <select
              value={filterPharmacy}
              onChange={(e) => {
                setFilterPharmacy(e.target.value);
                setHistoryPage(1);
              }}
              className="rounded-xl border border-[#cfe2d6] px-3 py-2 text-xs"
            >
              <option value="">All Pharmacies</option>
              {pharmacies.map((p) => (
                <option key={p.id} value={p.pharmacyName}>
                  {p.pharmacyName}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={filterFrom}
              onChange={(e) => {
                setFilterFrom(e.target.value);
                setHistoryPage(1);
              }}
              className="rounded-xl border border-[#cfe2d6] px-3 py-2 text-xs"
            />
            <input
              type="date"
              value={filterTo}
              onChange={(e) => {
                setFilterTo(e.target.value);
                setHistoryPage(1);
              }}
              className="rounded-xl border border-[#cfe2d6] px-3 py-2 text-xs"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#dcece2] text-[11px] uppercase text-[#5b796b]">
                  <th className="py-3 pr-3">Referral ID</th>
                  <th className="py-3 px-3">Patient & UHID</th>
                  <th className="py-3 px-3">Pharmacy</th>
                  <th className="py-3 px-3">Medicines</th>
                  <th className="py-3 px-3">Amount</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 pl-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eaf4ee]">
                {paginatedReferrals.map((r) => (
                  <tr key={r.id} className="hover:bg-[#f7fbf8]">
                    <td className="py-3 pr-3">
                      <p className="font-mono-id font-bold text-[#0d4a38]">
                        {r.referralNumber}
                      </p>
                      <p className="text-[11px] text-[#5b796b]">
                        {formatAccurateDate(r.referredAt)}
                      </p>
                    </td>
                    <td className="py-3 px-3">
                      <p className="font-semibold text-[#0f241d]">
                        {r.patientNameSnapshot}
                      </p>
                      <Link
                        href={`/hospital/patients/${encodeURIComponent(
                          r.patientUhidSnapshot
                        )}`}
                        className="font-mono-id text-[11px] text-emerald-700 hover:underline"
                      >
                        {r.patientUhidSnapshot}
                      </Link>
                    </td>
                    <td className="py-3 px-3">{r.pharmacyNameSnapshot}</td>
                    <td className="py-3 px-3 max-w-[220px] truncate">
                      {r.items
                        .map((i) => `${i.medicineNameSnapshot} ×${i.quantity}`)
                        .join(", ")}
                    </td>
                    <td className="py-3 px-3 font-mono-id">
                      {r.totalAmount !== null ? `₹${r.totalAmount.toFixed(2)}` : "—"}
                    </td>
                    <td className="py-3 px-3">
                      <StatusBadge status={r.status} />
                      {r.completedAt ? (
                        <p className="mt-0.5 text-[10px] text-[#5b796b]">
                          {formatAccurateDate(r.completedAt)}
                        </p>
                      ) : null}
                    </td>
                    <td className="py-3 pl-3 text-right">
                      <div className="inline-flex gap-1.5">
                        <BubblyButton
                          variant="outline"
                          className="px-2.5 py-1 text-[11px]"
                          onClick={() => setDetailReferral(r)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View
                        </BubblyButton>
                        {r.status === "PENDING" ? (
                          <BubblyButton
                            variant="danger"
                            className="px-2.5 py-1 text-[11px]"
                            onClick={() => handleCancelReferral(r.id)}
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Cancel
                          </BubblyButton>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <PaginationBar
            totalItems={visibleReferrals.length}
            pageSize={DEFAULT_PAGE_SIZE}
            currentPage={safeHistoryPage}
            onPageChange={setHistoryPage}
            itemLabel="pharmacy referral(s)"
          />
        </SpringCard>
      ) : tab === "catalog" ? (
        <SpringCard className="p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold text-[#0f241d]">
                Hospital Medicine Catalogue
              </h2>
            </div>
            <BubblyButton
              onClick={() => {
                setEditingMed(null);
                setMedForm({ name: "" });
                setMedModalOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Add Medicine
            </BubblyButton>
          </div>

          {medicines.length === 0 ? (
            <EmptyState
              icon={<Pill className="h-5 w-5" />}
              title="Medicine Catalogue Empty"
              description="Add medicine entries for quick referral selection."
            />
          ) : (
            <div className="space-y-4">
              <div className="relative max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6c877a]" />
                <input
                  value={catalogMedSearch}
                  onChange={(e) => {
                    setCatalogMedSearch(e.target.value);
                    setCatalogPage(1);
                  }}
                  placeholder="Search medicine catalogue..."
                  className="w-full rounded-xl border border-[#cfe2d6] bg-white py-2 pl-9 pr-3 text-sm"
                />
              </div>

              {catalogFilteredMedicines.length === 0 ? (
                <p className="text-xs text-[#5b796b]">
                  No medicines matched your search.
                </p>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {paginatedCatalogMedicines.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-[#dcece2] bg-white p-4"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-[#0f241d]">{m.name}</p>
                        </div>
                        {isAdmin ? (
                          <div className="flex gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingMed(m);
                                setMedForm({ name: m.name });
                                setMedModalOpen(true);
                              }}
                              className="rounded-lg p-1.5 text-[#466356] hover:bg-emerald-50"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteMedicine(m)}
                              className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  <PaginationBar
                    totalItems={catalogFilteredMedicines.length}
                    pageSize={DEFAULT_PAGE_SIZE}
                    currentPage={safeCatalogPage}
                    onPageChange={setCatalogPage}
                    itemLabel="medicine(s)"
                  />
                </>
              )}
            </div>
          )}
        </SpringCard>
      ) : (
        <SpringCard className="p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold text-[#0f241d]">
                External Referral Pharmacy Logins
              </h2>
              <p className="text-xs text-[#466356]">
                Each external pharmacy receives isolated access to referrals assigned to it.
              </p>
            </div>
            {isAdmin ? (
              <BubblyButton onClick={() => setPartnerModalOpen(true)}>
                <UserPlus className="h-4 w-4" />
                Create Pharmacy Login
              </BubblyButton>
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {pharmacies.map((p) => (
              <div
                key={p.id}
                className="rounded-2xl border border-[#dcece2] bg-white p-4 flex flex-col justify-between gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-display font-bold text-[#0f241d]">
                      {p.pharmacyName}
                    </p>
                    <p className="text-xs text-[#466356]">
                      Contact: {p.contactPerson} · {p.phone}
                    </p>
                    <p className="mt-1 font-mono-id text-xs text-[#0d4a38]">
                      Username: @{p.user.username} · {p._count.referrals} referrals
                    </p>
                  </div>
                  <StatusBadge status={p.isActive ? "ACTIVE" : "INACTIVE"} />
                </div>

                {isAdmin ? (
                  <div className="flex gap-2">
                    <BubblyButton
                      variant="outline"
                      className="px-3 py-1.5 text-xs"
                      onClick={() => {
                        setResetPartner(p);
                        setResetPw("");
                      }}
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      Reset Password
                    </BubblyButton>
                    <BubblyButton
                      variant={p.isActive ? "danger" : "secondary"}
                      className="px-3 py-1.5 text-xs"
                      onClick={() => togglePartnerActive(p)}
                    >
                      {p.isActive ? "Deactivate" : "Activate"}
                    </BubblyButton>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </SpringCard>
      )}

      {/* Referral Details Modal */}
      <AnimatedModal
        open={Boolean(detailReferral)}
        onClose={() => setDetailReferral(null)}
        title={`Pharmacy Referral · ${detailReferral?.referralNumber ?? ""}`}
        subtitle={
          detailReferral
            ? `${detailReferral.patientNameSnapshot} (${detailReferral.patientUhidSnapshot}) → ${detailReferral.pharmacyNameSnapshot}`
            : undefined
        }
      >
        {detailReferral ? (
          <div className="space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <StatusBadge status={detailReferral.status} />
              <span className="text-[#5b796b]">
                Referred {formatAccurateDateTime(detailReferral.referredAt)}
              </span>
            </div>
            <div className="space-y-2">
              {detailReferral.items.map((i) => (
                <div
                  key={i.id}
                  className="flex justify-between rounded-xl border border-[#e3efe7] bg-[#f8fcfa] p-3"
                >
                  <div>
                    <p className="font-semibold text-[#0f241d]">
                      {i.medicineNameSnapshot} × {i.quantity}
                    </p>
                    {i.dosageInstructions ? (
                      <p className="text-[#5b796b]">Dosage: {i.dosageInstructions}</p>
                    ) : null}
                  </div>
                  <span className="font-mono-id font-semibold">
                    {i.lineTotal !== null ? `₹${i.lineTotal.toFixed(2)}` : "—"}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex justify-between rounded-xl bg-[#eef7f1] p-3 font-bold text-[#0d4a38]">
              <span>Entered Amount (Pharmacy)</span>
              <span>
                {detailReferral.totalAmount !== null
                  ? `₹${detailReferral.totalAmount.toFixed(2)}`
                  : "Pending"}
              </span>
            </div>
            {detailReferral.completedAt ? (
              <p className="text-[#466356]">
                Completed at {formatAccurateDateTime(detailReferral.completedAt)} by{" "}
                {detailReferral.completedByNameSnapshot ?? "Pharmacy"}
              </p>
            ) : null}
          </div>
        ) : null}
      </AnimatedModal>

      {/* Add/Edit Medicine Modal */}
      <AnimatedModal
        open={medModalOpen}
        onClose={() => setMedModalOpen(false)}
        title={editingMed ? "Edit Medicine" : "Add Medicine"}
      >
        <form onSubmit={handleSaveMedicine} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold">Medicine Name *</label>
            <input
              required
              value={medForm.name}
              onChange={(e) => setMedForm({ name: e.target.value })}
              placeholder="Enter medicine name"
              className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2.5 text-sm"
            />
          </div>
          <div className="flex justify-end gap-3">
            <BubblyButton variant="outline" onClick={() => setMedModalOpen(false)}>
              Cancel
            </BubblyButton>
            <BubblyButton type="submit" disabled={busy}>
              Save Medicine
            </BubblyButton>
          </div>
        </form>
      </AnimatedModal>

      {/* Create Pharmacy Partner Modal */}
      <AnimatedModal
        open={partnerModalOpen}
        onClose={() => setPartnerModalOpen(false)}
        title="Create External Pharmacy Login"
      >
        <form onSubmit={handleCreatePartner} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold">Pharmacy Name *</label>
            <input
              required
              value={partnerForm.organizationName}
              onChange={(e) =>
                setPartnerForm({ ...partnerForm, organizationName: e.target.value })
              }
              className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold">Contact Person *</label>
              <input
                required
                value={partnerForm.contactPerson}
                onChange={(e) =>
                  setPartnerForm({ ...partnerForm, contactPerson: e.target.value })
                }
                className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2 text-sm"
              />
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
                value={partnerForm.phone}
                onChange={(e) =>
                  setPartnerForm({
                    ...partnerForm,
                    phone: sanitizeMobileInput(e.target.value),
                  })
                }
                className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold">Username *</label>
              <input
                required
                value={partnerForm.username}
                onChange={(e) =>
                  setPartnerForm({ ...partnerForm, username: e.target.value })
                }
                className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">Password (min 8) *</label>
              <input
                type="password"
                required
                minLength={8}
                value={partnerForm.password}
                onChange={(e) =>
                  setPartnerForm({ ...partnerForm, password: e.target.value })
                }
                className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <BubblyButton variant="outline" onClick={() => setPartnerModalOpen(false)}>
              Cancel
            </BubblyButton>
            <BubblyButton type="submit" disabled={busy}>
              Create Pharmacy Account
            </BubblyButton>
          </div>
        </form>
      </AnimatedModal>

      {/* Reset Pharmacy Password Modal */}
      <AnimatedModal
        open={Boolean(resetPartner)}
        onClose={() => setResetPartner(null)}
        title={`Reset Password · ${resetPartner?.pharmacyName ?? ""}`}
      >
        <form onSubmit={handleResetPartnerPw} className="space-y-4">
          <input
            type="password"
            required
            minLength={8}
            placeholder="New password (min 8 characters)"
            value={resetPw}
            onChange={(e) => setResetPw(e.target.value)}
            className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2.5 text-sm"
          />
          <div className="flex justify-end gap-3">
            <BubblyButton variant="outline" onClick={() => setResetPartner(null)}>
              Cancel
            </BubblyButton>
            <BubblyButton type="submit">Reset Password</BubblyButton>
          </div>
        </form>
      </AnimatedModal>
    </div>
  );
}
