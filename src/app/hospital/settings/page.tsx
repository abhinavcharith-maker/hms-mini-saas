"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2,
  Save,
  UserCog,
} from "lucide-react";
import {
  BubblyButton,
  SkeletonBox,
  SpringCard,
} from "@/components/ui/MotionPrimitives";
import { ChangePasswordCard } from "@/components/ui/ChangePasswordCard";
import { useToast } from "@/components/providers/AppProviders";
import { ROLES } from "@/lib/constants";
import { sanitizeMobileInput } from "@/lib/phone";

export default function HospitalSettingsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<{
    user: {
      username: string;
      fullName: string;
      role: string;
      passwordChangedAt: string | null;
    };
    hospital: {
      name: string;
      code: string;
      address: string | null;
      phone: string | null;
      email: string | null;
      tagline: string | null;
      registrationNo: string | null;
      uhidPrefix: string;
      defaultConsultationFee: number | null;
      logoDataUrl: string | null;
    };
  } | null>(null);

  const [hospitalForm, setHospitalForm] = useState({
    name: "",
    address: "",
    phone: "",
    email: "",
    tagline: "",
    registrationNo: "",
    uhidPrefix: "",
    defaultConsultationFee: "",
  });

  const [busy, setBusy] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const meRes = await fetch("/api/auth/me");
      if (meRes.status === 401) {
        router.replace("/login");
        return;
      }
      if (!meRes.ok) return;
      const meData = await meRes.json();
      if (!meData?.user) return;
      setMe(meData);

      if (meData?.user?.role === ROLES.HOSPITAL_ADMIN) {
        const sRes = await fetch("/api/hospital/settings");
        if (sRes.ok) {
          const sData = await sRes.json();
          const h = sData.hospital;
          setHospitalForm({
            name: h.name ?? "",
            address: h.address ?? "",
            phone: h.phone ?? "",
            email: h.email ?? "",
            tagline: h.tagline ?? "",
            registrationNo: h.registrationNo ?? "",
            uhidPrefix: h.uhidPrefix ?? "UHID",
            defaultConsultationFee:
              h.defaultConsultationFee !== null &&
              h.defaultConsultationFee !== undefined
                ? String(h.defaultConsultationFee)
                : "",
          });
        }
      }
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleSaveHospital = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/hospital/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: hospitalForm.name,
          address: hospitalForm.address || null,
          phone: hospitalForm.phone || null,
          email: hospitalForm.email || null,
          tagline: hospitalForm.tagline || null,
          registrationNo: hospitalForm.registrationNo || null,
          uhidPrefix: hospitalForm.uhidPrefix,
          defaultConsultationFee:
            hospitalForm.defaultConsultationFee.trim() !== ""
              ? Number(hospitalForm.defaultConsultationFee)
              : null,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast({ type: "error", title: "Save failed", message: d.error });
        return;
      }
      toast({
        type: "success",
        title: "Hospital Settings Saved",
        message:
          "Updated hospital details will appear on new printed consultation sheets and receipts.",
      });
      loadAll();
    } finally {
      setBusy(false);
    }
  };

  if (loading || !me) {
    return <SkeletonBox className="h-80" />;
  }

  const isAdmin = me.user.role === ROLES.HOSPITAL_ADMIN;

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-[#0f241d]">
            Receptionist Settings
          </h1>
          <p className="mt-1 text-sm text-[#466356]">
            View your assigned account profile and securely update your password.
          </p>
        </div>

        <ChangePasswordCard
          user={me.user}
          extraInfo={[
            { label: "Hospital", value: `${me.hospital.name} (${me.hospital.code})` },
            { label: "Permissions", value: "Front-Desk Operations Only" },
          ]}
        />
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-[#0f241d]">
            Hospital Settings & Security
          </h1>
          <p className="mt-1 text-sm text-[#466356]">
            Maintain hospital branding for printed documents and manage your administrator password.
          </p>
        </div>

        <Link
          href="/hospital/management"
          className="inline-flex items-center gap-2 rounded-xl border border-[#cfe2d6] bg-white px-4 py-2.5 text-xs font-semibold text-[#0d4a38] hover:bg-emerald-50"
        >
          <UserCog className="h-4 w-4" />
          Open Staff, Doctors & Partners Management →
        </Link>
      </div>

      {/* Hospital Profile & Print Branding */}
      <SpringCard className="p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-[#0d4a38]">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-[#0f241d]">
              Hospital Information & Print Branding
            </h2>
            <p className="text-xs text-[#466356]">
              Details configured here automatically appear on Doctor Consultation Sheets and Billing Receipts.
            </p>
          </div>
        </div>

        <form onSubmit={handleSaveHospital} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold">
                Hospital Name *
              </label>
              <input
                required
                value={hospitalForm.name}
                onChange={(e) =>
                  setHospitalForm({ ...hospitalForm, name: e.target.value })
                }
                className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">Phone</label>
              <input
                type="tel"
                inputMode="numeric"
                maxLength={10}
                pattern="\d{10}"
                title="Enter exactly 10 digits"
                value={hospitalForm.phone}
                onChange={(e) =>
                  setHospitalForm({
                    ...hospitalForm,
                    phone: sanitizeMobileInput(e.target.value),
                  })
                }
                className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">Email</label>
              <input
                type="email"
                value={hospitalForm.email}
                onChange={(e) =>
                  setHospitalForm({ ...hospitalForm, email: e.target.value })
                }
                className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2.5 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold">Address</label>
              <input
                value={hospitalForm.address}
                onChange={(e) =>
                  setHospitalForm({ ...hospitalForm, address: e.target.value })
                }
                className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">
                Registration / License No.
              </label>
              <input
                value={hospitalForm.registrationNo}
                onChange={(e) =>
                  setHospitalForm({
                    ...hospitalForm,
                    registrationNo: e.target.value,
                  })
                }
                className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">UHID Prefix</label>
              <input
                required
                value={hospitalForm.uhidPrefix}
                onChange={(e) =>
                  setHospitalForm({
                    ...hospitalForm,
                    uhidPrefix: e.target.value.toUpperCase(),
                  })
                }
                className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2.5 text-sm font-mono-id"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">
                Tagline (for prints)
              </label>
              <input
                value={hospitalForm.tagline}
                onChange={(e) =>
                  setHospitalForm({ ...hospitalForm, tagline: e.target.value })
                }
                className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">
                Default OP Consultation Fee (Optional ₹)
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={hospitalForm.defaultConsultationFee}
                onChange={(e) =>
                  setHospitalForm({
                    ...hospitalForm,
                    defaultConsultationFee: e.target.value,
                  })
                }
                placeholder="Leave blank if unset"
                className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2.5 text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <BubblyButton type="submit" disabled={busy}>
              <Save className="h-4 w-4" />
              {busy ? "Saving..." : "Save Hospital Settings"}
            </BubblyButton>
          </div>
        </form>
      </SpringCard>

      {/* Admin Account Security */}
      <ChangePasswordCard
        user={me.user}
        extraInfo={[
          {
            label: "Hospital Tenant",
            value: `${me.hospital.name} (${me.hospital.code})`,
          },
          { label: "Account Control", value: "Managed by Platform Super Admin" },
        ]}
      />
    </div>
  );
}
