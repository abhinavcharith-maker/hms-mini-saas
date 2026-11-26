"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Check,
  Eye,
  FlaskConical,
  KeyRound,
  Pencil,
  Plus,
  Search,
  Send,
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

interface LabTestItem {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
}

interface LabPartner {
  id: string;
  labName: string;
  contactPerson: string;
  phone: string;
  address: string | null;
  isActive: boolean;
  user: { id: string; username: string; isActive: boolean };
  _count: { referrals: number };
}

interface LabReferralRow {
  id: string;
  referralNumber: string;
  patientId: string;
  patientNameSnapshot: string;
  patientUhidSnapshot: string;
  patientPhoneSnapshot: string | null;
  labNameSnapshot: string;
  notes: string | null;
  totalAmount: number | null;
  status: "PENDING" | "COMPLETED" | "CANCELLED";
  referredAt: string;
  completedAt: string | null;
  completedByNameSnapshot: string | null;
  items: Array<{
    id: string;
    testNameSnapshot: string;
    descriptionSnapshot: string | null;
    unitPriceSnapshot: number | null;
  }>;
}

export default function HospitalLaboratoryManagementPage() {
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
  const [tests, setTests] = useState<LabTestItem[]>([]);
  const [labs, setLabs] = useState<LabPartner[]>([]);
  const [referrals, setReferrals] = useState<LabReferralRow[]>([]);

  const [patientSearch, setPatientSearch] = useState("");
  const [highlightedPatientIndex, setHighlightedPatientIndex] = useState(0);
  const [selectedPatient, setSelectedPatient] = useState<{
    id: string;
    uhid: string;
    fullName: string;
    phone: string;
  } | null>(null);
  const [selectedLabId, setSelectedLabId] = useState("");
  const [testSearch, setTestSearch] = useState("");
  const [testDropdownOpen, setTestDropdownOpen] = useState(false);
  const [highlightedTestIndex, setHighlightedTestIndex] = useState(0);
  const [creatingTest, setCreatingTest] = useState(false);
  const [catalogTestSearch, setCatalogTestSearch] = useState("");
  const referFormRef = useRef<HTMLFormElement | null>(null);
  const patientSearchRef = useRef<HTMLInputElement | null>(null);
  const labSelectRef = useRef<HTMLSelectElement | null>(null);
  const testContainerRef = useRef<HTMLDivElement | null>(null);
  const testInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedTests, setSelectedTests] = useState<
    Array<{ labTestCatalogId: string; name: string }>
  >([]);

  const [filterStatus, setFilterStatus] = useState("");
  const [filterLab, setFilterLab] = useState("");
  const [filterSearch, setFilterSearch] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [catalogPage, setCatalogPage] = useState(1);
  const [detailReferral, setDetailReferral] = useState<LabReferralRow | null>(null);

  const [testModalOpen, setTestModalOpen] = useState(false);
  const [editingTest, setEditingTest] = useState<LabTestItem | null>(null);
  const [testForm, setTestForm] = useState({ name: "" });

  const [partnerModalOpen, setPartnerModalOpen] = useState(false);
  const [partnerForm, setPartnerForm] = useState({
    organizationName: "",
    contactPerson: "",
    phone: "",
    address: "",
    username: "",
    password: "",
  });
  const [resetPartner, setResetPartner] = useState<LabPartner | null>(null);
  const [resetPw, setResetPw] = useState("");

  const isAdmin = role === ROLES.HOSPITAL_ADMIN;

  const loadAll = useCallback(async () => {
    try {
      const [meRes, pRes, tRes, lRes, rRes] = await Promise.all([
        fetch("/api/auth/me"),
        fetch("/api/hospital/patients?limit=100"),
        fetch("/api/hospital/lab-tests"),
        fetch("/api/hospital/labs"),
        fetch("/api/hospital/lab-referrals"),
      ]);
      const meData = await meRes.json();
      if (meData?.user?.role) setRole(meData.user.role);

      setPatients((await pRes.json()).patients ?? []);
      setTests((await tRes.json()).tests ?? []);
      setLabs((await lRes.json()).labs ?? []);
      setReferrals((await rRes.json()).referrals ?? []);
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
    if (!q) return;
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
        testContainerRef.current &&
        !testContainerRef.current.contains(e.target as Node)
      ) {
        setTestDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const activeLabs = labs.filter((l) => l.isActive);
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

  const trimmedTestSearch = testSearch.trim();
  const dropdownTests = trimmedTestSearch
    ? tests.filter((t) =>
        t.name.toLowerCase().includes(trimmedTestSearch.toLowerCase())
      )
    : tests;
  const hasExactTestMatch =
    trimmedTestSearch.length > 0 &&
    tests.some(
      (t) => t.name.toLowerCase() === trimmedTestSearch.toLowerCase()
    );
  const showCreateTestOption =
    trimmedTestSearch.length > 0 && !hasExactTestMatch;

  const catalogFilteredTests = catalogTestSearch.trim()
    ? tests.filter((t) =>
        t.name.toLowerCase().includes(catalogTestSearch.trim().toLowerCase())
      )
    : tests;

  const selectTestForReferral = (t: LabTestItem) => {
    setSelectedTests((prev) => {
      if (prev.some((x) => x.labTestCatalogId === t.id)) {
        return prev;
      }
      return [
        ...prev,
        {
          labTestCatalogId: t.id,
          name: t.name,
        },
      ];
    });
    setTestSearch("");
    setHighlightedTestIndex(0);
    setTestDropdownOpen(false);
    window.requestAnimationFrame(() => {
      testInputRef.current?.focus();
    });
  };

  const handleCreateAndUseTest = async (name: string) => {
    const cleanName = name.trim();
    if (!cleanName || creatingTest) return;
    setCreatingTest(true);
    try {
      const res = await fetch("/api/hospital/lab-tests", {
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
        toast({ type: "error", title: "Could not create test", message: d.error });
        return;
      }
      const createdTest: LabTestItem = d.test;
      setTests((prev) =>
        prev.some((t) => t.id === createdTest.id)
          ? prev
          : [...prev, createdTest].sort((a, b) => a.name.localeCompare(b.name))
      );
      toast({
        type: "success",
        title: "Test added to catalogue",
        message: `${createdTest.name} added and selected.`,
      });
      selectTestForReferral(createdTest);
    } finally {
      setCreatingTest(false);
    }
  };

  const handleCreateReferral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient || !selectedLabId || selectedTests.length === 0) {
      toast({
        type: "warning",
        title: "Missing details",
        message: "Select a registered patient, laboratory partner, and at least one test.",
      });
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/hospital/lab-referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: selectedPatient.id,
          labAccountId: selectedLabId,
          notes: null,
          overrideTotalAmount: null,
          items: selectedTests.map((i) => ({
            labTestCatalogId: i.labTestCatalogId,
            unitPriceOverride: null,
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
        title: `Lab Referral Created (${d.referral.referralNumber})`,
        message: `Assigned to ${d.referral.labNameSnapshot}.`,
      });
      setSelectedTests([]);
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
    const res = await fetch(`/api/hospital/lab-referrals/${id}/cancel`, {
      method: "POST",
    });
    if (res.ok) {
      toast({ type: "info", title: "Lab referral cancelled" });
      loadAll();
    }
  };

  const handleSaveTest = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const url = editingTest
        ? `/api/hospital/lab-tests/${editingTest.id}`
        : "/api/hospital/lab-tests";
      const method = editingTest ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: testForm.name,
          description: null,
          price: null,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast({ type: "error", title: "Save failed", message: d.error });
        return;
      }
      toast({ type: "success", title: editingTest ? "Test Updated" : "Test Added" });
      setTestModalOpen(false);
      setEditingTest(null);
      loadAll();
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteTest = async (t: LabTestItem) => {
    const res = await fetch(`/api/hospital/lab-tests/${t.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      toast({
        type: "info",
        title: "Test removed from catalogue",
        message: "Past referral records preserved via immutable snapshots.",
      });
      loadAll();
    }
  };

  const handleCreatePartner = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/hospital/labs", {
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
        title: "Laboratory Login Created",
        message: `${d.lab.labName} (@${d.lab.user.username}) is ready.`,
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

  const togglePartnerActive = async (l: LabPartner) => {
    const res = await fetch(`/api/hospital/labs/${l.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !l.isActive }),
    });
    if (res.ok) {
      toast({
        type: l.isActive ? "warning" : "success",
        title: l.isActive ? "Laboratory Deactivated" : "Laboratory Activated",
      });
      loadAll();
    }
  };

  const handleResetPartnerPw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPartner) return;
    const res = await fetch(`/api/hospital/labs/${resetPartner.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resetPassword: resetPw }),
    });
    if (res.ok) {
      toast({ type: "success", title: "Laboratory password reset" });
      setResetPartner(null);
      setResetPw("");
    }
  };

  const visibleReferrals = referrals.filter((r) => {
    if (filterStatus && r.status !== filterStatus) return false;
    if (
      filterLab &&
      !r.labNameSnapshot.toLowerCase().includes(filterLab.toLowerCase())
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
    Math.ceil(catalogFilteredTests.length / DEFAULT_PAGE_SIZE)
  );
  const safeCatalogPage = Math.min(catalogPage, totalCatalogPages);
  const paginatedCatalogTests = catalogFilteredTests.slice(
    (safeCatalogPage - 1) * DEFAULT_PAGE_SIZE,
    safeCatalogPage * DEFAULT_PAGE_SIZE
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-[#0f241d]">
          Laboratory Referrals
        </h1>
      </div>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-[#cfe2d6] bg-white p-1.5 w-fit">
        {[
          { id: "refer", label: "Refer Lab Tests" },
          { id: "history", label: `Referral History (${referrals.length})` },
          { id: "catalog", label: `Test Catalogue (${tests.length})` },
          ...(isAdmin
            ? [{ id: "logins", label: `Laboratory Logins (${labs.length})` }]
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
              Create Laboratory Referral
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
                              labSelectRef.current?.focus();
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
                                  labSelectRef.current?.focus();
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
                                  labSelectRef.current?.focus();
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
                  2. Select Referral Laboratory *
                </label>
                <select
                  ref={labSelectRef}
                  value={selectedLabId}
                  onChange={(e) => setSelectedLabId(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      testInputRef.current?.focus();
                    }
                  }}
                  className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2.5 text-sm"
                >
                  <option value="">Choose external lab...</option>
                  {activeLabs.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.labName} ({l.phone})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-3" ref={testContainerRef}>
              <label className="mb-1 block text-xs font-semibold">
                3. Search & Select Diagnostic Tests
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6c877a]" />
                <input
                  ref={testInputRef}
                  value={testSearch}
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    setTestSearch(nextVal);
                    setTestDropdownOpen(nextVal.trim().length > 0);
                    setHighlightedTestIndex(0);
                  }}
                  onKeyDown={(e) => {
                    if (!trimmedTestSearch) {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        focusNextFieldInContainer(
                          testInputRef.current,
                          referFormRef.current
                        );
                      }
                      return;
                    }
                    const totalOptions =
                      dropdownTests.length + (showCreateTestOption ? 1 : 0);
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setTestDropdownOpen(true);
                      if (totalOptions > 0) {
                        setHighlightedTestIndex((prev) =>
                          Math.min(totalOptions - 1, prev + 1)
                        );
                      }
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setTestDropdownOpen(true);
                      setHighlightedTestIndex((prev) => Math.max(0, prev - 1));
                    } else if (e.key === "Escape") {
                      setTestDropdownOpen(false);
                    } else if (e.key === "Enter") {
                      e.preventDefault();
                      e.stopPropagation();
                      if (totalOptions === 0) return;
                      const safeIndex = Math.min(
                        highlightedTestIndex,
                        totalOptions - 1
                      );
                      if (safeIndex < dropdownTests.length) {
                        selectTestForReferral(dropdownTests[safeIndex]);
                      } else if (showCreateTestOption) {
                        void handleCreateAndUseTest(trimmedTestSearch);
                      }
                    }
                  }}
                  placeholder="Search test name..."
                  className="w-full rounded-xl border border-[#cfe2d6] bg-white py-2.5 pl-9 pr-3 text-sm"
                />

                {testDropdownOpen && trimmedTestSearch.length > 0 ? (
                  <div className="absolute left-0 right-0 z-30 mt-1.5 max-h-60 overflow-y-auto rounded-xl border border-[#cfe2d6] bg-white shadow-xl divide-y divide-[#eaf4ee]">
                    {dropdownTests.length === 0 && !showCreateTestOption ? (
                      <div className="px-3.5 py-3 text-xs text-[#5b796b]">
                        No diagnostic tests found in catalogue.
                      </div>
                    ) : (
                      <>
                        {dropdownTests.map((t, idx) => {
                          const checked = selectedTests.some(
                            (s) => s.labTestCatalogId === t.id
                          );
                          const isHighlighted = highlightedTestIndex === idx;
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onMouseEnter={() => setHighlightedTestIndex(idx)}
                              onClick={() => selectTestForReferral(t)}
                              className={`flex w-full items-center justify-between px-3.5 py-2.5 text-left text-xs transition-colors cursor-pointer ${
                                isHighlighted
                                  ? "bg-[#dff4e8] text-[#0d4a38]"
                                  : "bg-white text-[#0f241d] hover:bg-emerald-50"
                              }`}
                            >
                              <span className="font-semibold">{t.name}</span>
                              {checked ? (
                                <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                                  <Check className="h-3 w-3" /> Selected
                                </span>
                              ) : isHighlighted ? (
                                <span className="text-[11px] font-semibold text-[#0d4a38]">
                                  Press Enter ↵
                                </span>
                              ) : null}
                            </button>
                          );
                        })}

                        {showCreateTestOption ? (
                          <button
                            type="button"
                            disabled={creatingTest}
                            onMouseEnter={() =>
                              setHighlightedTestIndex(dropdownTests.length)
                            }
                            onClick={() =>
                              void handleCreateAndUseTest(trimmedTestSearch)
                            }
                            className={`flex w-full items-center justify-between px-3.5 py-2.5 text-left text-xs font-semibold transition-colors cursor-pointer ${
                              highlightedTestIndex === dropdownTests.length
                                ? "bg-emerald-600 text-white"
                                : "bg-[#f4faf6] text-[#0d4a38] hover:bg-emerald-100"
                            }`}
                          >
                            <span className="inline-flex items-center gap-1.5">
                              <Plus className="h-3.5 w-3.5" />
                              {creatingTest
                                ? "Creating..."
                                : `Create "${trimmedTestSearch}" & Use`}
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
            </div>

            {selectedTests.length > 0 ? (
              <div className="space-y-2.5 rounded-2xl border border-[#dcece2] bg-[#f8fcfa] p-4">
                <p className="font-display text-sm font-bold text-[#0f241d]">
                  Selected Tests ({selectedTests.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {selectedTests.map((item, idx) => (
                    <span
                      key={item.labTestCatalogId}
                      className="inline-flex items-center gap-2 rounded-xl border border-[#cfe2d6] bg-white px-3 py-1.5 text-xs font-semibold text-[#0f241d]"
                    >
                      {item.name}
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedTests((prev) =>
                            prev.filter((_, i) => i !== idx)
                          )
                        }
                        className="text-rose-600 hover:underline cursor-pointer"
                      >
                        Remove
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex justify-end">
              <BubblyButton
                type="submit"
                disabled={busy || !selectedPatient || !selectedLabId || selectedTests.length === 0}
              >
                <Send className="h-4 w-4" />
                {busy ? "Confirming Referral..." : "Confirm & Send Lab Referral"}
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
              value={filterLab}
              onChange={(e) => {
                setFilterLab(e.target.value);
                setHistoryPage(1);
              }}
              className="rounded-xl border border-[#cfe2d6] px-3 py-2 text-xs"
            >
              <option value="">All Laboratories</option>
              {labs.map((l) => (
                <option key={l.id} value={l.labName}>
                  {l.labName}
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
                  <th className="py-3 px-3">Laboratory</th>
                  <th className="py-3 px-3">Tests Referred</th>
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
                      <p className="font-semibold">{r.patientNameSnapshot}</p>
                      <Link
                        href={`/hospital/patients/${encodeURIComponent(
                          r.patientUhidSnapshot
                        )}`}
                        className="font-mono-id text-[11px] text-emerald-700 hover:underline"
                      >
                        {r.patientUhidSnapshot}
                      </Link>
                    </td>
                    <td className="py-3 px-3">{r.labNameSnapshot}</td>
                    <td className="py-3 px-3 max-w-[220px] truncate">
                      {r.items.map((i) => i.testNameSnapshot).join(", ")}
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
            itemLabel="lab referral(s)"
          />
        </SpringCard>
      ) : tab === "catalog" ? (
        <SpringCard className="p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold text-[#0f241d]">
                Laboratory Test Catalogue
              </h2>
            </div>
            <BubblyButton
              onClick={() => {
                setEditingTest(null);
                setTestForm({ name: "" });
                setTestModalOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Add Lab Test
            </BubblyButton>
          </div>

          {tests.length === 0 ? (
            <EmptyState
              icon={<FlaskConical className="h-5 w-5" />}
              title="Lab Test Catalogue Empty"
              description="Add diagnostic tests to use in laboratory referrals."
            />
          ) : (
            <div className="space-y-4">
              <div className="relative max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6c877a]" />
                <input
                  value={catalogTestSearch}
                  onChange={(e) => {
                    setCatalogTestSearch(e.target.value);
                    setCatalogPage(1);
                  }}
                  placeholder="Search diagnostic test catalogue..."
                  className="w-full rounded-xl border border-[#cfe2d6] bg-white py-2 pl-9 pr-3 text-sm"
                />
              </div>

              {catalogFilteredTests.length === 0 ? (
                <p className="text-xs text-[#5b796b]">
                  No diagnostic tests matched your search.
                </p>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {paginatedCatalogTests.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-[#dcece2] bg-white p-4"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-[#0f241d]">{t.name}</p>
                        </div>
                        {isAdmin ? (
                          <div className="flex gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingTest(t);
                                setTestForm({ name: t.name });
                                setTestModalOpen(true);
                              }}
                              className="rounded-lg p-1.5 text-[#466356] hover:bg-emerald-50"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteTest(t)}
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
                    totalItems={catalogFilteredTests.length}
                    pageSize={DEFAULT_PAGE_SIZE}
                    currentPage={safeCatalogPage}
                    onPageChange={setCatalogPage}
                    itemLabel="lab test(s)"
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
                External Laboratory Logins
              </h2>
              <p className="text-xs text-[#466356]">
                Each external lab accesses only referrals assigned to it.
              </p>
            </div>
            {isAdmin ? (
              <BubblyButton onClick={() => setPartnerModalOpen(true)}>
                <UserPlus className="h-4 w-4" />
                Create Lab Login
              </BubblyButton>
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {labs.map((l) => (
              <div
                key={l.id}
                className="rounded-2xl border border-[#dcece2] bg-white p-4 flex flex-col justify-between gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-display font-bold text-[#0f241d]">{l.labName}</p>
                    <p className="text-xs text-[#466356]">
                      Contact: {l.contactPerson} · {l.phone}
                    </p>
                    <p className="mt-1 font-mono-id text-xs text-[#0d4a38]">
                      Username: @{l.user.username} · {l._count.referrals} referrals
                    </p>
                  </div>
                  <StatusBadge status={l.isActive ? "ACTIVE" : "INACTIVE"} />
                </div>

                {isAdmin ? (
                  <div className="flex gap-2">
                    <BubblyButton
                      variant="outline"
                      className="px-3 py-1.5 text-xs"
                      onClick={() => {
                        setResetPartner(l);
                        setResetPw("");
                      }}
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      Reset Password
                    </BubblyButton>
                    <BubblyButton
                      variant={l.isActive ? "danger" : "secondary"}
                      className="px-3 py-1.5 text-xs"
                      onClick={() => togglePartnerActive(l)}
                    >
                      {l.isActive ? "Deactivate" : "Activate"}
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
        title={`Lab Referral · ${detailReferral?.referralNumber ?? ""}`}
        subtitle={
          detailReferral
            ? `${detailReferral.patientNameSnapshot} (${detailReferral.patientUhidSnapshot}) → ${detailReferral.labNameSnapshot}`
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
                    <p className="font-semibold text-[#0f241d]">{i.testNameSnapshot}</p>
                    {i.descriptionSnapshot ? (
                      <p className="text-[#5b796b]">{i.descriptionSnapshot}</p>
                    ) : null}
                  </div>
                  <span className="font-mono-id font-semibold">
                    {i.unitPriceSnapshot !== null
                      ? `₹${i.unitPriceSnapshot.toFixed(2)}`
                      : "—"}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex justify-between rounded-xl bg-[#eef7f1] p-3 font-bold text-[#0d4a38]">
              <span>Entered Amount (Laboratory)</span>
              <span>
                {detailReferral.totalAmount !== null
                  ? `₹${detailReferral.totalAmount.toFixed(2)}`
                  : "Pending"}
              </span>
            </div>
            {detailReferral.completedAt ? (
              <p className="text-[#466356]">
                Completed at {formatAccurateDateTime(detailReferral.completedAt)} by{" "}
                {detailReferral.completedByNameSnapshot ?? "Laboratory"}
              </p>
            ) : null}
          </div>
        ) : null}
      </AnimatedModal>

      {/* Add/Edit Test Modal */}
      <AnimatedModal
        open={testModalOpen}
        onClose={() => setTestModalOpen(false)}
        title={editingTest ? "Edit Lab Test" : "Add Lab Test"}
      >
        <form onSubmit={handleSaveTest} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold">Test Name *</label>
            <input
              required
              value={testForm.name}
              onChange={(e) => setTestForm({ name: e.target.value })}
              placeholder="Enter diagnostic test name"
              className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2.5 text-sm"
            />
          </div>
          <div className="flex justify-end gap-3">
            <BubblyButton variant="outline" onClick={() => setTestModalOpen(false)}>
              Cancel
            </BubblyButton>
            <BubblyButton type="submit" disabled={busy}>
              Save Test
            </BubblyButton>
          </div>
        </form>
      </AnimatedModal>

      {/* Create Lab Partner Modal */}
      <AnimatedModal
        open={partnerModalOpen}
        onClose={() => setPartnerModalOpen(false)}
        title="Create External Laboratory Login"
      >
        <form onSubmit={handleCreatePartner} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold">Laboratory Name *</label>
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
              Create Lab Account
            </BubblyButton>
          </div>
        </form>
      </AnimatedModal>

      {/* Reset Lab Password Modal */}
      <AnimatedModal
        open={Boolean(resetPartner)}
        onClose={() => setResetPartner(null)}
        title={`Reset Password · ${resetPartner?.labName ?? ""}`}
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
