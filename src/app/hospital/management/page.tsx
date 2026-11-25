"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  FlaskConical,
  KeyRound,
  Pencil,
  Pill,
  Plus,
  Stethoscope,
  UserCheck,
  UserCog,
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
import { ROLES, getRoleLabel } from "@/lib/constants";
import { sanitizeMobileInput } from "@/lib/phone";

interface DoctorItem {
  id: string;
  name: string;
  specialty: string | null;
  qualification: string | null;
  phone: string | null;
  consultationFee: number | null;
  isActive: boolean;
  user?: {
    id: string;
    username: string;
    isActive: boolean;
    lastLoginAt: string | null;
  } | null;
}

interface StaffMember {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  role: string;
  isActive: boolean;
  passwordChangedAt: string | null;
  lastLoginAt: string | null;
}

interface PharmacyPartner {
  id: string;
  pharmacyName: string;
  contactPerson: string;
  phone: string;
  address: string | null;
  isActive: boolean;
  user: { id: string; username: string; isActive: boolean; lastLoginAt: string | null };
  _count: { referrals: number };
}

interface LabPartner {
  id: string;
  labName: string;
  contactPerson: string;
  phone: string;
  address: string | null;
  isActive: boolean;
  user: { id: string; username: string; isActive: boolean; lastLoginAt: string | null };
  _count: { referrals: number };
}

type ManagementTab =
  | "doctors"
  | "receptionists"
  | "pharmacies"
  | "labs";

export default function HospitalManagementPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [tab, setTab] = useState<ManagementTab>("doctors");
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [consultancyEnabled, setConsultancyEnabled] = useState<boolean>(true);
  const [busy, setBusy] = useState(false);

  const [doctors, setDoctors] = useState<DoctorItem[]>([]);
  const [staffUsers, setStaffUsers] = useState<StaffMember[]>([]);
  const [pharmacies, setPharmacies] = useState<PharmacyPartner[]>([]);
  const [labs, setLabs] = useState<LabPartner[]>([]);

  // Doctor modal state
  const [doctorModalOpen, setDoctorModalOpen] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState<DoctorItem | null>(null);
  const [doctorForm, setDoctorForm] = useState({
    name: "",
    specialty: "",
    qualification: "",
    phone: "",
    consultationFee: "",
    username: "",
    password: "",
    isActive: true,
  });

  // Receptionist / Staff modal state
  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [staffForm, setStaffForm] = useState({
    fullName: "",
    username: "",
    email: "",
    phone: "",
    role: ROLES.RECEPTIONIST as
      | typeof ROLES.RECEPTIONIST
      | typeof ROLES.HOSPITAL_ADMIN,
    password: "",
    isActive: true,
  });

  // Pharmacy owner/partner modal state
  const [pharmModalOpen, setPharmModalOpen] = useState(false);
  const [editingPharm, setEditingPharm] = useState<PharmacyPartner | null>(null);
  const [pharmForm, setPharmForm] = useState({
    pharmacyName: "",
    contactPerson: "",
    phone: "",
    address: "",
    username: "",
    password: "",
    isActive: true,
  });

  // Lab owner/partner modal state
  const [labModalOpen, setLabModalOpen] = useState(false);
  const [editingLab, setEditingLab] = useState<LabPartner | null>(null);
  const [labForm, setLabForm] = useState({
    labName: "",
    contactPerson: "",
    phone: "",
    address: "",
    username: "",
    password: "",
    isActive: true,
  });

  // Unified password reset modal
  const [resetTarget, setResetTarget] = useState<{
    kind: "doctor" | "staff" | "pharmacy" | "lab";
    id: string;
    label: string;
  } | null>(null);
  const [resetPw, setResetPw] = useState("");

  const loadAll = useCallback(async () => {
    try {
      const res = await fetch("/api/hospital/management");
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      if (res.ok) {
        const d = await res.json();
        setCurrentUserId(d.currentUserId ?? "");
        setConsultancyEnabled(d.consultancyEnabled !== false);
        setDoctors(d.doctors ?? []);
        setStaffUsers(d.staffUsers ?? []);
        setPharmacies(d.pharmacies ?? []);
        setLabs(d.labs ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Doctor Save (Add or Edit)
  const handleSaveDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const url = editingDoctor
        ? `/api/hospital/doctors/${editingDoctor.id}`
        : "/api/hospital/doctors";
      const method = editingDoctor ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: doctorForm.name,
          specialty: doctorForm.specialty || null,
          qualification: doctorForm.qualification || null,
          phone: doctorForm.phone || null,
          consultationFee:
            doctorForm.consultationFee.trim() !== ""
              ? Number(doctorForm.consultationFee)
              : null,
          ...(consultancyEnabled && doctorForm.username.trim()
            ? { username: doctorForm.username.trim() }
            : {}),
          ...(consultancyEnabled && doctorForm.password
            ? { password: doctorForm.password }
            : {}),
          ...(editingDoctor ? { isActive: doctorForm.isActive } : {}),
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast({ type: "error", title: "Doctor save failed", message: d.error });
        return;
      }
      toast({
        type: "success",
        title: editingDoctor ? "Doctor Updated" : "Doctor Added",
      });
      setDoctorModalOpen(false);
      setEditingDoctor(null);
      loadAll();
    } finally {
      setBusy(false);
    }
  };

  // Staff / Receptionist Save (Create or Edit details + username)
  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (editingStaff) {
        const res = await fetch(`/api/hospital/staff/${editingStaff.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fullName: staffForm.fullName,
            ...(editingStaff.id !== currentUserId
              ? {
                  username: staffForm.username,
                  role: staffForm.role,
                  isActive: staffForm.isActive,
                }
              : {}),
            email: staffForm.email || null,
            phone: staffForm.phone || null,
          }),
        });
        const d = await res.json();
        if (!res.ok) {
          toast({ type: "error", title: "Staff update failed", message: d.error });
          return;
        }
        toast({
          type: "success",
          title: "Staff Details Updated",
          message: `@${d.staff.username} saved.`,
        });
      } else {
        const res = await fetch("/api/hospital/staff", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fullName: staffForm.fullName,
            username: staffForm.username,
            email: staffForm.email || null,
            phone: staffForm.phone || null,
            password: staffForm.password,
            role: staffForm.role,
          }),
        });
        const d = await res.json();
        if (!res.ok) {
          toast({ type: "error", title: "Creation failed", message: d.error });
          return;
        }
        toast({
          type: "success",
          title: "Staff Login Created",
          message: `@${d.staff.username} is ready.`,
        });
      }
      setStaffModalOpen(false);
      setEditingStaff(null);
      loadAll();
    } finally {
      setBusy(false);
    }
  };

  // Pharmacy Owner Save (Create or Edit details + username)
  const handleSavePharm = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (editingPharm) {
        const res = await fetch(`/api/hospital/pharmacies/${editingPharm.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pharmacyName: pharmForm.pharmacyName,
            contactPerson: pharmForm.contactPerson,
            phone: pharmForm.phone,
            address: pharmForm.address || null,
            username: pharmForm.username,
            isActive: pharmForm.isActive,
          }),
        });
        const d = await res.json();
        if (!res.ok) {
          toast({ type: "error", title: "Pharmacy update failed", message: d.error });
          return;
        }
        toast({
          type: "success",
          title: "Pharmacy Partner Updated",
          message: `${d.pharmacy.pharmacyName} (@${d.pharmacy.user.username}) updated.`,
        });
      } else {
        const res = await fetch("/api/hospital/pharmacies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationName: pharmForm.pharmacyName,
            contactPerson: pharmForm.contactPerson,
            phone: pharmForm.phone,
            address: pharmForm.address || null,
            username: pharmForm.username,
            password: pharmForm.password,
          }),
        });
        const d = await res.json();
        if (!res.ok) {
          toast({ type: "error", title: "Creation failed", message: d.error });
          return;
        }
        toast({
          type: "success",
          title: "Pharmacy Account Created",
          message: `${d.pharmacy.pharmacyName} (@${d.pharmacy.user.username}) created.`,
        });
      }
      setPharmModalOpen(false);
      setEditingPharm(null);
      loadAll();
    } finally {
      setBusy(false);
    }
  };

  // Laboratory Owner Save (Create or Edit details + username)
  const handleSaveLab = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (editingLab) {
        const res = await fetch(`/api/hospital/labs/${editingLab.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            labName: labForm.labName,
            contactPerson: labForm.contactPerson,
            phone: labForm.phone,
            address: labForm.address || null,
            username: labForm.username,
            isActive: labForm.isActive,
          }),
        });
        const d = await res.json();
        if (!res.ok) {
          toast({ type: "error", title: "Lab update failed", message: d.error });
          return;
        }
        toast({
          type: "success",
          title: "Laboratory Partner Updated",
          message: `${d.lab.labName} (@${d.lab.user.username}) updated.`,
        });
      } else {
        const res = await fetch("/api/hospital/labs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationName: labForm.labName,
            contactPerson: labForm.contactPerson,
            phone: labForm.phone,
            address: labForm.address || null,
            username: labForm.username,
            password: labForm.password,
          }),
        });
        const d = await res.json();
        if (!res.ok) {
          toast({ type: "error", title: "Creation failed", message: d.error });
          return;
        }
        toast({
          type: "success",
          title: "Laboratory Account Created",
          message: `${d.lab.labName} (@${d.lab.user.username}) created.`,
        });
      }
      setLabModalOpen(false);
      setEditingLab(null);
      loadAll();
    } finally {
      setBusy(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    setBusy(true);
    try {
      const endpoint =
        resetTarget.kind === "doctor"
          ? `/api/hospital/doctors/${resetTarget.id}`
          : resetTarget.kind === "staff"
            ? `/api/hospital/staff/${resetTarget.id}`
            : resetTarget.kind === "pharmacy"
              ? `/api/hospital/pharmacies/${resetTarget.id}`
              : `/api/hospital/labs/${resetTarget.id}`;

      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetPassword: resetPw }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast({ type: "error", title: "Password reset failed", message: d.error });
        return;
      }
      toast({
        type: "success",
        title: "Password Reset",
        message: `Credentials updated for ${resetTarget.label}.`,
      });
      setResetTarget(null);
      setResetPw("");
    } finally {
      setBusy(false);
    }
  };

  if (forbidden) {
    return (
      <SpringCard className="p-8 text-center">
        <p className="font-display text-lg font-bold text-[#0f241d]">
          Hospital Admin Access Required
        </p>
        <p className="mt-1 text-sm text-[#466356]">
          Doctor, staff, and external partner management is restricted to Hospital Administrators.
        </p>
      </SpringCard>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-[#0f241d]">
            Management
          </h1>
          <p className="mt-1 text-sm text-[#466356]">
            Manage consulting doctors, receptionist accounts, pharmacy owners, and laboratory owners — including details and usernames.
          </p>
        </div>
      </div>

      {/* Management Sub-Tabs */}
      <div className="flex flex-wrap gap-2 rounded-2xl border border-[#cfe2d6] bg-white p-1.5 w-fit">
        {[
          {
            id: "doctors" as const,
            label: `Doctors (${doctors.length})`,
            icon: <Stethoscope className="h-3.5 w-3.5" />,
          },
          {
            id: "receptionists" as const,
            label: `Receptionists & Staff (${staffUsers.length})`,
            icon: <UserCheck className="h-3.5 w-3.5" />,
          },
          {
            id: "pharmacies" as const,
            label: `Pharmacy Owners (${pharmacies.length})`,
            icon: <Pill className="h-3.5 w-3.5" />,
          },
          {
            id: "labs" as const,
            label: `Laboratory Owners (${labs.length})`,
            icon: <FlaskConical className="h-3.5 w-3.5" />,
          },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-colors cursor-pointer ${
              tab === t.id
                ? "bg-[#dff4e8] text-[#0d4a38]"
                : "text-[#466356] hover:text-[#0f241d]"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <SkeletonBox className="h-72" />
      ) : tab === "doctors" ? (
        <SpringCard className="p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold text-[#0f241d]">
                Doctors Management
              </h2>
              <p className="text-xs text-[#466356]">
                Add or edit consulting doctors, specialities, contact numbers, and optional consultation fees.
              </p>
            </div>
            <BubblyButton
              onClick={() => {
                setEditingDoctor(null);
                setDoctorForm({
                  name: "",
                  specialty: "",
                  qualification: "",
                  phone: "",
                  consultationFee: "",
                  username: "",
                  password: "",
                  isActive: true,
                });
                setDoctorModalOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Add Doctor
            </BubblyButton>
          </div>

          {doctors.length === 0 ? (
            <EmptyState
              icon={<Stethoscope className="h-5 w-5" />}
              title="No Consulting Doctors Yet"
              description="Add your hospital's doctors with Doctor Portal login credentials to manage OP registrations and daily consultancy."
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {doctors.map((d) => (
                <div
                  key={d.id}
                  className="flex flex-col justify-between gap-3 rounded-2xl border border-[#dcece2] bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-display font-bold text-[#0f241d]">{d.name}</p>
                        <StatusBadge status={d.isActive ? "ACTIVE" : "INACTIVE"} />
                      </div>
                      <p className="mt-1 text-xs text-[#466356]">
                        {d.specialty ?? "General"}
                        {d.qualification ? ` · ${d.qualification}` : ""}
                      </p>
                      {consultancyEnabled ? (
                        <p className="mt-0.5 font-mono-id text-xs font-semibold text-[#0d4a38]">
                          {d.user ? `@${d.user.username} · Doctor Portal Enabled` : "No Doctor Portal login yet"}
                        </p>
                      ) : null}
                      <p className="mt-0.5 text-xs text-[#5b796b]">
                        {d.phone ? `Phone: ${d.phone}` : "No phone"}
                        {d.consultationFee !== null
                          ? ` · Fee: ₹${d.consultationFee.toFixed(2)}`
                          : " · Fee: Optional / Unset"}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <BubblyButton
                      variant="outline"
                      className="px-3 py-1.5 text-xs"
                      onClick={() => {
                        setEditingDoctor(d);
                        setDoctorForm({
                          name: d.name,
                          specialty: d.specialty ?? "",
                          qualification: d.qualification ?? "",
                          phone: d.phone ?? "",
                          consultationFee:
                            d.consultationFee !== null && d.consultationFee !== undefined
                              ? String(d.consultationFee)
                              : "",
                          username: d.user?.username ?? "",
                          password: "",
                          isActive: d.isActive,
                        });
                        setDoctorModalOpen(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      {consultancyEnabled
                        ? d.user
                          ? "Edit Details & Username"
                          : "Edit & Set Portal Login"
                        : "Edit Details"}
                    </BubblyButton>
                    {consultancyEnabled && d.user ? (
                      <BubblyButton
                        variant="outline"
                        className="px-3 py-1.5 text-xs"
                        onClick={() => {
                          setResetTarget({
                            kind: "doctor",
                            id: d.id,
                            label: `${d.name} (@${d.user!.username})`,
                          });
                          setResetPw("");
                        }}
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                        Reset Password
                      </BubblyButton>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SpringCard>
      ) : tab === "receptionists" ? (
        <SpringCard className="p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold text-[#0f241d]">
                Receptionists & Staff IDs
              </h2>
              <p className="text-xs text-[#466356]">
                Create accounts, edit names, contact details, usernames, active status, and reset passwords.
              </p>
            </div>
            <BubblyButton
              onClick={() => {
                setEditingStaff(null);
                setStaffForm({
                  fullName: "",
                  username: "",
                  email: "",
                  phone: "",
                  role: ROLES.RECEPTIONIST,
                  password: "",
                  isActive: true,
                });
                setStaffModalOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              New Receptionist
            </BubblyButton>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {staffUsers.map((s) => (
              <div
                key={s.id}
                className="flex flex-col justify-between gap-3 rounded-2xl border border-[#dcece2] bg-white p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-display font-bold text-[#0f241d]">
                      {s.fullName}
                    </p>
                    <p className="mt-0.5 font-mono-id text-xs font-semibold text-[#0d4a38]">
                      @{s.username} · {getRoleLabel(s.role)}
                    </p>
                    <p className="mt-1 text-xs text-[#5b796b]">
                      {[s.phone, s.email].filter(Boolean).join(" · ") || "No contact info"}
                    </p>
                  </div>
                  <StatusBadge status={s.isActive ? "ACTIVE" : "INACTIVE"} />
                </div>

                <div className="flex flex-wrap gap-2">
                  <BubblyButton
                    variant="outline"
                    className="px-3 py-1.5 text-xs"
                    onClick={() => {
                      setEditingStaff(s);
                      setStaffForm({
                        fullName: s.fullName,
                        username: s.username,
                        email: s.email ?? "",
                        phone: s.phone ?? "",
                        role:
                          s.role === ROLES.HOSPITAL_ADMIN
                            ? ROLES.HOSPITAL_ADMIN
                            : ROLES.RECEPTIONIST,
                        password: "",
                        isActive: s.isActive,
                      });
                      setStaffModalOpen(true);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit Details & Username
                  </BubblyButton>

                  {s.id !== currentUserId ? (
                    <BubblyButton
                      variant="outline"
                      className="px-3 py-1.5 text-xs"
                      onClick={() => {
                        setResetTarget({
                          kind: "staff",
                          id: s.id,
                          label: `@${s.username}`,
                        });
                        setResetPw("");
                      }}
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      Reset Password
                    </BubblyButton>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </SpringCard>
      ) : tab === "pharmacies" ? (
        <SpringCard className="p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold text-[#0f241d]">
                Pharmacy Owners & Partner Accounts
              </h2>
              <p className="text-xs text-[#466356]">
                Edit pharmacy name, owner/contact person, phone, address, login username, and account status.
              </p>
            </div>
            <BubblyButton
              onClick={() => {
                setEditingPharm(null);
                setPharmForm({
                  pharmacyName: "",
                  contactPerson: "",
                  phone: "",
                  address: "",
                  username: "",
                  password: "",
                  isActive: true,
                });
                setPharmModalOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Add Pharmacy Owner
            </BubblyButton>
          </div>

          {pharmacies.length === 0 ? (
            <EmptyState
              icon={<Pill className="h-5 w-5" />}
              title="No Pharmacy Accounts Yet"
              description="Add a pharmacy owner login so they can access Pharmacy Management or Pharmacy Referrals."
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {pharmacies.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-col justify-between gap-3 rounded-2xl border border-[#dcece2] bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-display font-bold text-[#0f241d]">
                        {p.pharmacyName}
                      </p>
                      <p className="mt-0.5 text-xs text-[#466356]">
                        Owner / Contact: <strong>{p.contactPerson}</strong> · {p.phone}
                      </p>
                      <p className="mt-1 font-mono-id text-xs font-semibold text-[#0d4a38]">
                        @{p.user.username} · {p._count.referrals} referrals
                      </p>
                      {p.address ? (
                        <p className="mt-0.5 text-xs text-[#5b796b]">{p.address}</p>
                      ) : null}
                    </div>
                    <StatusBadge status={p.isActive ? "ACTIVE" : "INACTIVE"} />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <BubblyButton
                      variant="outline"
                      className="px-3 py-1.5 text-xs"
                      onClick={() => {
                        setEditingPharm(p);
                        setPharmForm({
                          pharmacyName: p.pharmacyName,
                          contactPerson: p.contactPerson,
                          phone: p.phone,
                          address: p.address ?? "",
                          username: p.user.username,
                          password: "",
                          isActive: p.isActive,
                        });
                        setPharmModalOpen(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit Details & Username
                    </BubblyButton>
                    <BubblyButton
                      variant="outline"
                      className="px-3 py-1.5 text-xs"
                      onClick={() => {
                        setResetTarget({
                          kind: "pharmacy",
                          id: p.id,
                          label: `${p.pharmacyName} (@${p.user.username})`,
                        });
                        setResetPw("");
                      }}
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      Reset Password
                    </BubblyButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SpringCard>
      ) : (
        <SpringCard className="p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold text-[#0f241d]">
                Laboratory Owners & Partner Accounts
              </h2>
              <p className="text-xs text-[#466356]">
                Edit laboratory name, owner/contact person, phone, address, login username, and account status.
              </p>
            </div>
            <BubblyButton
              onClick={() => {
                setEditingLab(null);
                setLabForm({
                  labName: "",
                  contactPerson: "",
                  phone: "",
                  address: "",
                  username: "",
                  password: "",
                  isActive: true,
                });
                setLabModalOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Add Laboratory Owner
            </BubblyButton>
          </div>

          {labs.length === 0 ? (
            <EmptyState
              icon={<UserCog className="h-5 w-5" />}
              title="No Laboratory Partners Yet"
              description="Add an external laboratory partner to route diagnostic referrals."
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {labs.map((l) => (
                <div
                  key={l.id}
                  className="flex flex-col justify-between gap-3 rounded-2xl border border-[#dcece2] bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-display font-bold text-[#0f241d]">
                        {l.labName}
                      </p>
                      <p className="mt-0.5 text-xs text-[#466356]">
                        Owner / Contact: <strong>{l.contactPerson}</strong> · {l.phone}
                      </p>
                      <p className="mt-1 font-mono-id text-xs font-semibold text-[#0d4a38]">
                        @{l.user.username} · {l._count.referrals} referrals
                      </p>
                      {l.address ? (
                        <p className="mt-0.5 text-xs text-[#5b796b]">{l.address}</p>
                      ) : null}
                    </div>
                    <StatusBadge status={l.isActive ? "ACTIVE" : "INACTIVE"} />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <BubblyButton
                      variant="outline"
                      className="px-3 py-1.5 text-xs"
                      onClick={() => {
                        setEditingLab(l);
                        setLabForm({
                          labName: l.labName,
                          contactPerson: l.contactPerson,
                          phone: l.phone,
                          address: l.address ?? "",
                          username: l.user.username,
                          password: "",
                          isActive: l.isActive,
                        });
                        setLabModalOpen(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit Details & Username
                    </BubblyButton>
                    <BubblyButton
                      variant="outline"
                      className="px-3 py-1.5 text-xs"
                      onClick={() => {
                        setResetTarget({
                          kind: "lab",
                          id: l.id,
                          label: `${l.labName} (@${l.user.username})`,
                        });
                        setResetPw("");
                      }}
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      Reset Password
                    </BubblyButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SpringCard>
      )}

      {/* Doctor Add / Edit Modal */}
      <AnimatedModal
        open={doctorModalOpen}
        onClose={() => setDoctorModalOpen(false)}
        title={editingDoctor ? `Edit Doctor · ${editingDoctor.name}` : "Add Consulting Doctor"}
      >
        <form onSubmit={handleSaveDoctor} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold">Doctor Name *</label>
            <input
              required
              value={doctorForm.name}
              onChange={(e) => setDoctorForm({ ...doctorForm, name: e.target.value })}
              className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold">Speciality</label>
              <input
                value={doctorForm.specialty}
                onChange={(e) =>
                  setDoctorForm({ ...doctorForm, specialty: e.target.value })
                }
                className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">Qualification</label>
              <input
                value={doctorForm.qualification}
                onChange={(e) =>
                  setDoctorForm({ ...doctorForm, qualification: e.target.value })
                }
                className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold">Phone</label>
              <input
                type="tel"
                inputMode="numeric"
                maxLength={10}
                pattern="\d{10}"
                title="Enter exactly 10 digits"
                value={doctorForm.phone}
                onChange={(e) =>
                  setDoctorForm({
                    ...doctorForm,
                    phone: sanitizeMobileInput(e.target.value),
                  })
                }
                className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">
                Consultation Fee (Optional ₹)
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={doctorForm.consultationFee}
                onChange={(e) =>
                  setDoctorForm({ ...doctorForm, consultationFee: e.target.value })
                }
                className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2 text-sm"
              />
            </div>
          </div>
          {consultancyEnabled ? (
            <div className="rounded-2xl border border-[#dcece2] bg-[#f8fcfa] p-3.5 space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#0d4a38]">
                Doctor Portal Login Credentials
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold">
                    Username {!editingDoctor ? "*" : ""}
                  </label>
                  <input
                    required={!editingDoctor}
                    value={doctorForm.username}
                    onChange={(e) =>
                      setDoctorForm({ ...doctorForm, username: e.target.value })
                    }
                    placeholder="e.g. dr.ananya"
                    className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2 text-sm font-mono-id"
                  />
                </div>
                {!editingDoctor || !editingDoctor.user ? (
                  <div>
                    <label className="mb-1 block text-xs font-semibold">
                      Password {!editingDoctor ? "*" : "(to enable login)"}
                    </label>
                    <input
                      type="password"
                      required={!editingDoctor || Boolean(doctorForm.username.trim())}
                      minLength={8}
                      value={doctorForm.password}
                      onChange={(e) =>
                        setDoctorForm({ ...doctorForm, password: e.target.value })
                      }
                      placeholder="Min 8 characters"
                      className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2 text-sm"
                    />
                  </div>
                ) : (
                  <div className="flex items-end pb-1.5 text-[11px] text-[#5b796b]">
                    Use &ldquo;Reset Password&rdquo; on the doctor card to change their password.
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {editingDoctor ? (
            <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={doctorForm.isActive}
                onChange={(e) =>
                  setDoctorForm({ ...doctorForm, isActive: e.target.checked })
                }
              />
              Doctor is Active for OP / IP selection &amp; Doctor Portal sign-in
            </label>
          ) : null}
          <div className="flex justify-end gap-3">
            <BubblyButton variant="outline" onClick={() => setDoctorModalOpen(false)}>
              Cancel
            </BubblyButton>
            <BubblyButton type="submit" disabled={busy}>
              {busy ? "Saving..." : "Save Doctor"}
            </BubblyButton>
          </div>
        </form>
      </AnimatedModal>

      {/* Receptionist / Staff Create or Edit Modal */}
      <AnimatedModal
        open={staffModalOpen}
        onClose={() => setStaffModalOpen(false)}
        title={
          editingStaff
            ? `Edit Staff Details · @${editingStaff.username}`
            : "Create Receptionist / Staff Login"
        }
      >
        <form onSubmit={handleSaveStaff} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold">Full Name *</label>
            <input
              required
              value={staffForm.fullName}
              onChange={(e) =>
                setStaffForm({ ...staffForm, fullName: e.target.value })
              }
              className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold">Username *</label>
              <input
                required
                disabled={Boolean(editingStaff && editingStaff.id === currentUserId)}
                value={staffForm.username}
                onChange={(e) =>
                  setStaffForm({ ...staffForm, username: e.target.value })
                }
                className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2 text-sm font-mono-id disabled:bg-slate-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">Role</label>
              <select
                disabled={Boolean(editingStaff && editingStaff.id === currentUserId)}
                value={staffForm.role}
                onChange={(e) =>
                  setStaffForm({
                    ...staffForm,
                    role: e.target.value as typeof staffForm.role,
                  })
                }
                className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2 text-sm disabled:bg-slate-100"
              >
                <option value={ROLES.RECEPTIONIST}>Receptionist</option>
                <option value={ROLES.HOSPITAL_ADMIN}>Co-Hospital Admin</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold">Phone</label>
              <input
                type="tel"
                inputMode="numeric"
                maxLength={10}
                pattern="\d{10}"
                title="Enter exactly 10 digits"
                value={staffForm.phone}
                onChange={(e) =>
                  setStaffForm({
                    ...staffForm,
                    phone: sanitizeMobileInput(e.target.value),
                  })
                }
                className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">Email</label>
              <input
                type="email"
                value={staffForm.email}
                onChange={(e) =>
                  setStaffForm({ ...staffForm, email: e.target.value })
                }
                className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2 text-sm"
              />
            </div>
          </div>
          {!editingStaff ? (
            <div>
              <label className="mb-1 block text-xs font-semibold">
                Password (min 8) *
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={staffForm.password}
                onChange={(e) =>
                  setStaffForm({ ...staffForm, password: e.target.value })
                }
                className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2 text-sm"
              />
            </div>
          ) : editingStaff.id !== currentUserId ? (
            <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={staffForm.isActive}
                onChange={(e) =>
                  setStaffForm({ ...staffForm, isActive: e.target.checked })
                }
              />
              Account Active
            </label>
          ) : null}
          <div className="flex justify-end gap-3">
            <BubblyButton variant="outline" onClick={() => setStaffModalOpen(false)}>
              Cancel
            </BubblyButton>
            <BubblyButton type="submit" disabled={busy}>
              {busy ? "Saving..." : editingStaff ? "Save Changes" : "Create Account"}
            </BubblyButton>
          </div>
        </form>
      </AnimatedModal>

      {/* Pharmacy Owner Create / Edit Modal */}
      <AnimatedModal
        open={pharmModalOpen}
        onClose={() => setPharmModalOpen(false)}
        title={
          editingPharm
            ? `Edit Pharmacy Owner · ${editingPharm.pharmacyName}`
            : "Add Pharmacy Owner Account"
        }
      >
        <form onSubmit={handleSavePharm} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold">
              Pharmacy Name *
            </label>
            <input
              required
              value={pharmForm.pharmacyName}
              onChange={(e) =>
                setPharmForm({ ...pharmForm, pharmacyName: e.target.value })
              }
              className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold">
                Owner / Contact Person *
              </label>
              <input
                required
                value={pharmForm.contactPerson}
                onChange={(e) =>
                  setPharmForm({ ...pharmForm, contactPerson: e.target.value })
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
                value={pharmForm.phone}
                onChange={(e) =>
                  setPharmForm({
                    ...pharmForm,
                    phone: sanitizeMobileInput(e.target.value),
                  })
                }
                className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Address</label>
            <input
              value={pharmForm.address}
              onChange={(e) =>
                setPharmForm({ ...pharmForm, address: e.target.value })
              }
              className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold">
                Login Username *
              </label>
              <input
                required
                value={pharmForm.username}
                onChange={(e) =>
                  setPharmForm({ ...pharmForm, username: e.target.value })
                }
                className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2 text-sm font-mono-id"
              />
            </div>
            {!editingPharm ? (
              <div>
                <label className="mb-1 block text-xs font-semibold">
                  Password (min 8) *
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={pharmForm.password}
                  onChange={(e) =>
                    setPharmForm({ ...pharmForm, password: e.target.value })
                  }
                  className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2 text-sm"
                />
              </div>
            ) : (
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pharmForm.isActive}
                    onChange={(e) =>
                      setPharmForm({ ...pharmForm, isActive: e.target.checked })
                    }
                  />
                  Account Active
                </label>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3">
            <BubblyButton variant="outline" onClick={() => setPharmModalOpen(false)}>
              Cancel
            </BubblyButton>
            <BubblyButton type="submit" disabled={busy}>
              {busy ? "Saving..." : editingPharm ? "Save Changes" : "Create Pharmacy Login"}
            </BubblyButton>
          </div>
        </form>
      </AnimatedModal>

      {/* Lab Owner Create / Edit Modal */}
      <AnimatedModal
        open={labModalOpen}
        onClose={() => setLabModalOpen(false)}
        title={
          editingLab
            ? `Edit Laboratory Owner · ${editingLab.labName}`
            : "Add Laboratory Owner Account"
        }
      >
        <form onSubmit={handleSaveLab} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold">
              Laboratory Name *
            </label>
            <input
              required
              value={labForm.labName}
              onChange={(e) => setLabForm({ ...labForm, labName: e.target.value })}
              className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold">
                Owner / Contact Person *
              </label>
              <input
                required
                value={labForm.contactPerson}
                onChange={(e) =>
                  setLabForm({ ...labForm, contactPerson: e.target.value })
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
                value={labForm.phone}
                onChange={(e) =>
                  setLabForm({
                    ...labForm,
                    phone: sanitizeMobileInput(e.target.value),
                  })
                }
                className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Address</label>
            <input
              value={labForm.address}
              onChange={(e) => setLabForm({ ...labForm, address: e.target.value })}
              className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold">
                Login Username *
              </label>
              <input
                required
                value={labForm.username}
                onChange={(e) =>
                  setLabForm({ ...labForm, username: e.target.value })
                }
                className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2 text-sm font-mono-id"
              />
            </div>
            {!editingLab ? (
              <div>
                <label className="mb-1 block text-xs font-semibold">
                  Password (min 8) *
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={labForm.password}
                  onChange={(e) =>
                    setLabForm({ ...labForm, password: e.target.value })
                  }
                  className="w-full rounded-xl border border-[#cfe2d6] px-3.5 py-2 text-sm"
                />
              </div>
            ) : (
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={labForm.isActive}
                    onChange={(e) =>
                      setLabForm({ ...labForm, isActive: e.target.checked })
                    }
                  />
                  Account Active
                </label>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3">
            <BubblyButton variant="outline" onClick={() => setLabModalOpen(false)}>
              Cancel
            </BubblyButton>
            <BubblyButton type="submit" disabled={busy}>
              {busy ? "Saving..." : editingLab ? "Save Changes" : "Create Lab Login"}
            </BubblyButton>
          </div>
        </form>
      </AnimatedModal>

      {/* Unified Reset Password Modal */}
      <AnimatedModal
        open={Boolean(resetTarget)}
        onClose={() => setResetTarget(null)}
        title={`Reset Password · ${resetTarget?.label ?? ""}`}
      >
        <form onSubmit={handleResetPassword} className="space-y-4">
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
            <BubblyButton variant="outline" onClick={() => setResetTarget(null)}>
              Cancel
            </BubblyButton>
            <BubblyButton type="submit" disabled={busy}>
              {busy ? "Resetting..." : "Reset Password"}
            </BubblyButton>
          </div>
        </form>
      </AnimatedModal>
    </div>
  );
}
