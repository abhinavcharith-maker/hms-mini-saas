"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  BedDouble,
  Calendar,
  FlaskConical,
  Pill,
  Stethoscope,
  Users,
} from "lucide-react";
import {
  SkeletonBox,
  SpringCard,
  StatCard,
  StatusBadge,
} from "@/components/ui/MotionPrimitives";
import { getLocalDateInputValue } from "@/lib/datetime";

function getLocalDaysAgoDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return getLocalDateInputValue(d);
}

interface DashboardResponse {
  range?: { from: string; to: string };
  kpis: {
    totalPatients: number;
    totalPatientsAllTime?: number;
    todaysOpCount: number;
    currentIpCount: number;
    availableBeds: number;
    occupiedBeds: number;
    inactiveBeds: number;
    pharmacy: { total: number; pending: number; completed: number };
    lab: { total: number; pending: number; completed: number };
    opGrossAmount: number;
    ipGrossAmount: number;
    totalGrossAmount: number;
  };
  trends: Array<{
    date: string;
    label: string;
    opVisits: number;
    pharmacy: number;
    lab: number;
  }>;
  recentPatients: Array<{
    id: string;
    uhid: string;
    fullName: string;
    age: number | null;
    gender: string;
    phone: string;
    registeredAt: string;
  }>;
  recentAdmissions: Array<{
    id: string;
    admissionNumber: string;
    wardSnapshot: string;
    bedNumberSnapshot: string;
    status: string;
    admittedAt: string;
    patient: { id: string; uhid: string; fullName: string };
  }>;
  recentPharmReferrals: Array<{
    id: string;
    referralNumber: string;
    patientNameSnapshot: string;
    patientUhidSnapshot: string;
    pharmacyNameSnapshot: string;
    status: string;
    referredAt: string;
  }>;
  recentLabReferrals: Array<{
    id: string;
    referralNumber: string;
    patientNameSnapshot: string;
    patientUhidSnapshot: string;
    labNameSnapshot: string;
    status: string;
    referredAt: string;
  }>;
  unreadNotifications: Array<{
    id: string;
    title: string;
    message: string;
    category: string;
    createdAt: string;
  }>;
}

export default function HospitalDashboardPage() {
  const [preset, setPreset] = useState<"1d" | "7d" | "30d" | "custom">("7d");
  const [fromDate, setFromDate] = useState(() => getLocalDaysAgoDate(6));
  const [toDate, setToDate] = useState(() => getLocalDateInputValue());
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const applyPreset = (nextPreset: "1d" | "7d" | "30d" | "custom") => {
    setPreset(nextPreset);
    const today = getLocalDateInputValue();
    if (nextPreset === "1d") {
      setFromDate(today);
      setToDate(today);
    } else if (nextPreset === "7d") {
      setFromDate(getLocalDaysAgoDate(6));
      setToDate(today);
    } else if (nextPreset === "30d") {
      setFromDate(getLocalDaysAgoDate(29));
      setToDate(today);
    }
  };

  const load = useCallback(async () => {
    try {
      const tzOffset = new Date().getTimezoneOffset();
      const qs = new URLSearchParams({
        from: fromDate,
        to: toDate,
        tzOffset: String(tzOffset),
      });
      const res = await fetch(`/api/hospital/dashboard?${qs.toString()}`);
      if (res.ok) {
        setData(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <SkeletonBox key={i} className="h-32" />
          ))}
        </div>
        <SkeletonBox className="h-72" />
      </div>
    );
  }

  if (!data) return null;

  const { kpis, trends } = data;
  const maxTrend = Math.max(
    1,
    ...trends.map((t) => Math.max(t.opVisits, t.pharmacy, t.lab))
  );

  return (
    <div className="space-y-7">
      {/* Header + Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-[#0f241d]">
            Hospital Command Dashboard
          </h1>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Link
            href="/hospital/op"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#0d4a38] to-[#059669] px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:opacity-95"
          >
            <Stethoscope className="h-4 w-4" />
            New OP Registration
          </Link>
          <Link
            href="/hospital/ip"
            className="inline-flex items-center gap-2 rounded-xl border border-[#cfe2d6] bg-white px-4 py-2.5 text-sm font-semibold text-[#0d4a38] hover:bg-emerald-50"
          >
            <BedDouble className="h-4 w-4" />
            Manage Beds & IP
          </Link>
        </div>
      </div>

      {/* Time Frame Selector */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 rounded-2xl border border-[#cfe2d6] bg-white p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#314c40] mr-1">
            <Calendar className="h-4 w-4 text-emerald-600" />
            Time Frame:
          </span>
          {(
            [
              { id: "1d", label: "1 Day (Today)" },
              { id: "7d", label: "7 Days" },
              { id: "30d", label: "30 Days" },
              { id: "custom", label: "Custom" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => applyPreset(item.id)}
              className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                preset === item.id
                  ? "border-emerald-500 bg-[#dff4e8] text-[#0d4a38]"
                  : "border-[#dcece2] bg-white text-[#466356] hover:bg-[#f6fbf8]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <input
            type="date"
            value={fromDate}
            onChange={(e) => {
              setPreset("custom");
              setFromDate(e.target.value);
            }}
            className="rounded-xl border border-[#cfe2d6] bg-white px-3 py-1.5 text-xs text-[#0f241d]"
          />
          <span className="text-[#5b796b]">to</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => {
              setPreset("custom");
              setToDate(e.target.value);
            }}
            className="rounded-xl border border-[#cfe2d6] bg-white px-3 py-1.5 text-xs text-[#0f241d]"
          />
        </div>
      </div>

      {/* Top KPI Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Patients (Selected Period)"
          value={kpis.totalPatients}
          subtitle={`${kpis.todaysOpCount} OP registration(s) · ${kpis.totalPatientsAllTime ?? kpis.totalPatients} total`}
          icon={<Users className="h-5 w-5" />}
          tone="forest"
          delay={0}
        />
        <StatCard
          title="Current IP & Beds"
          value={kpis.currentIpCount}
          subtitle={`${kpis.availableBeds} available · ${kpis.occupiedBeds} occupied beds`}
          icon={<BedDouble className="h-5 w-5" />}
          tone="amber"
          delay={0.04}
        />
        <StatCard
          title="Pharmacy Referrals"
          value={kpis.pharmacy.total}
          subtitle={`${kpis.pharmacy.pending} pending · ${kpis.pharmacy.completed} completed`}
          icon={<Pill className="h-5 w-5" />}
          tone="emerald"
          delay={0.08}
        />
        <StatCard
          title="Laboratory Referrals"
          value={kpis.lab.total}
          subtitle={`${kpis.lab.pending} pending · ${kpis.lab.completed} completed`}
          icon={<FlaskConical className="h-5 w-5" />}
          tone="teal"
          delay={0.12}
        />
      </div>

      {/* Activity Chart + Bed Snapshot */}
      <div className="grid gap-6 lg:grid-cols-3">
        <SpringCard className="p-6 lg:col-span-2">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-bold text-[#0f241d]">
                Care & Referral Pulse
              </h2>
              <p className="text-xs text-[#466356]">
                Daily OP consultations, pharmacy referrals & laboratory referrals ({fromDate} to {toDate})
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-semibold">
              <span className="flex items-center gap-1.5 text-[#0d4a38]">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#0d4a38]" /> OP
              </span>
              <span className="flex items-center gap-1.5 text-emerald-700">
                <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Pharmacy
              </span>
              <span className="flex items-center gap-1.5 text-teal-700">
                <span className="h-2.5 w-2.5 rounded-sm bg-teal-400" /> Lab
              </span>
            </div>
          </div>

          <div
            className="grid gap-3 items-end h-44 pt-4"
            style={{
              gridTemplateColumns: `repeat(${Math.max(1, trends.length)}, minmax(0, 1fr))`,
            }}
          >
            {trends.map((day, idx) => (
              <div key={day.date} className="flex flex-col items-center gap-2 h-full justify-end">
                <div className="flex items-end gap-1 h-32 w-full justify-center">
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{
                      height: `${Math.max(8, Math.round((day.opVisits / maxTrend) * 100))}%`,
                    }}
                    transition={{ type: "spring", stiffness: 180, damping: 20, delay: idx * 0.04 }}
                    title={`OP Visits: ${day.opVisits}`}
                    className="w-2.5 rounded-t-md bg-[#0d4a38]"
                  />
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{
                      height: `${Math.max(8, Math.round((day.pharmacy / maxTrend) * 100))}%`,
                    }}
                    transition={{ type: "spring", stiffness: 180, damping: 20, delay: idx * 0.04 + 0.05 }}
                    title={`Pharmacy Referrals: ${day.pharmacy}`}
                    className="w-2.5 rounded-t-md bg-emerald-500"
                  />
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{
                      height: `${Math.max(8, Math.round((day.lab / maxTrend) * 100))}%`,
                    }}
                    transition={{ type: "spring", stiffness: 180, damping: 20, delay: idx * 0.04 + 0.1 }}
                    title={`Lab Referrals: ${day.lab}`}
                    className="w-2.5 rounded-t-md bg-teal-400"
                  />
                </div>
                <span className="text-[11px] font-semibold text-[#5b796b]">
                  {day.label}
                </span>
              </div>
            ))}
          </div>
        </SpringCard>

        <SpringCard delay={0.08} className="p-6 flex flex-col justify-between">
          <div>
            <h2 className="font-display text-base font-bold text-[#0f241d]">
              Ward & Bed Capacity
            </h2>
            <p className="text-xs text-[#466356]">
              Real-time inpatient occupancy
            </p>

            <div className="mt-5 space-y-3 text-xs">
              <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/80 p-3.5">
                <span className="font-semibold text-emerald-900">Available Beds</span>
                <span className="font-display text-lg font-bold text-emerald-700">
                  {kpis.availableBeds}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/80 p-3.5">
                <span className="font-semibold text-amber-900">Occupied Beds</span>
                <span className="font-display text-lg font-bold text-amber-700">
                  {kpis.occupiedBeds}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                <span className="font-semibold text-slate-700">Inactive / Maint.</span>
                <span className="font-display text-lg font-bold text-slate-600">
                  {kpis.inactiveBeds}
                </span>
              </div>
            </div>
          </div>

          <Link
            href="/hospital/ip"
            className="mt-4 block rounded-xl bg-[#eef7f1] py-2.5 text-center text-xs font-semibold text-[#0d4a38] hover:bg-[#dff1e6]"
          >
            Open Interactive Bed Map →
          </Link>
        </SpringCard>
      </div>

      {/* Recent Activity Grids */}
      <div className="grid gap-6 lg:grid-cols-2">
        <SpringCard className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-[#0f241d]">
              Recent Patient Registrations
            </h2>
            <Link href="/hospital/op" className="text-xs font-semibold text-emerald-700 hover:underline">
              View OP Desk →
            </Link>
          </div>
          <div className="space-y-2.5">
            {data.recentPatients.length === 0 ? (
              <p className="text-xs text-[#5b796b]">No patients registered yet.</p>
            ) : (
              data.recentPatients.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[#e3efe7] bg-white px-3.5 py-2.5 text-xs"
                >
                  <div>
                    <p className="font-semibold text-[#0f241d]">{p.fullName}</p>
                    <p className="text-[#5b796b]">
                      {p.age ? `${p.age}y · ` : ""}
                      {p.gender} · {p.phone}
                    </p>
                  </div>
                  <Link
                    href={`/hospital/patients/${encodeURIComponent(p.uhid)}`}
                    className="font-mono-id rounded-lg bg-emerald-50 px-2.5 py-1 font-semibold text-[#0d4a38] border border-emerald-200 hover:bg-emerald-100"
                  >
                    {p.uhid}
                  </Link>
                </div>
              ))
            )}
          </div>
        </SpringCard>

        <SpringCard delay={0.05} className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-[#0f241d]">
              Recent IP Admissions
            </h2>
            <Link href="/hospital/ip" className="text-xs font-semibold text-emerald-700 hover:underline">
              View IP Ward →
            </Link>
          </div>
          <div className="space-y-2.5">
            {data.recentAdmissions.length === 0 ? (
              <p className="text-xs text-[#5b796b]">No inpatient admissions recorded yet.</p>
            ) : (
              data.recentAdmissions.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[#e3efe7] bg-white px-3.5 py-2.5 text-xs"
                >
                  <div>
                    <p className="font-semibold text-[#0f241d]">
                      {a.patient.fullName}{" "}
                      <Link
                        href={`/hospital/patients/${encodeURIComponent(a.patient.uhid)}`}
                        className="font-mono-id text-emerald-700 hover:underline"
                      >
                        ({a.patient.uhid})
                      </Link>
                    </p>
                    <p className="text-[#5b796b]">
                      {a.wardSnapshot} · Bed {a.bedNumberSnapshot}
                    </p>
                  </div>
                  <StatusBadge status={a.status} />
                </div>
              ))
            )}
          </div>
        </SpringCard>

        <SpringCard delay={0.08} className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-[#0f241d]">
              Recent Pharmacy Referrals
            </h2>
            <Link href="/hospital/pharmacy" className="text-xs font-semibold text-emerald-700 hover:underline">
              Open Pharmacy →
            </Link>
          </div>
          <div className="space-y-2.5">
            {data.recentPharmReferrals.length === 0 ? (
              <p className="text-xs text-[#5b796b]">No pharmacy referrals created yet.</p>
            ) : (
              data.recentPharmReferrals.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[#e3efe7] bg-white px-3.5 py-2.5 text-xs"
                >
                  <div>
                    <p className="font-semibold text-[#0f241d]">
                      <span className="font-mono-id text-[#0d4a38]">{r.referralNumber}</span>{" "}
                      · {r.patientNameSnapshot}
                    </p>
                    <p className="text-[#5b796b]">
                      {r.pharmacyNameSnapshot} ·{" "}
                      <Link
                        href={`/hospital/patients/${encodeURIComponent(r.patientUhidSnapshot)}`}
                        className="font-mono-id text-emerald-700 hover:underline"
                      >
                        {r.patientUhidSnapshot}
                      </Link>
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
              ))
            )}
          </div>
        </SpringCard>

        <SpringCard delay={0.12} className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-[#0f241d]">
              Recent Laboratory Referrals
            </h2>
            <Link href="/hospital/laboratory" className="text-xs font-semibold text-emerald-700 hover:underline">
              Open Laboratory →
            </Link>
          </div>
          <div className="space-y-2.5">
            {data.recentLabReferrals.length === 0 ? (
              <p className="text-xs text-[#5b796b]">No laboratory referrals created yet.</p>
            ) : (
              data.recentLabReferrals.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[#e3efe7] bg-white px-3.5 py-2.5 text-xs"
                >
                  <div>
                    <p className="font-semibold text-[#0f241d]">
                      <span className="font-mono-id text-[#0d4a38]">{r.referralNumber}</span>{" "}
                      · {r.patientNameSnapshot}
                    </p>
                    <p className="text-[#5b796b]">
                      {r.labNameSnapshot} ·{" "}
                      <Link
                        href={`/hospital/patients/${encodeURIComponent(r.patientUhidSnapshot)}`}
                        className="font-mono-id text-emerald-700 hover:underline"
                      >
                        {r.patientUhidSnapshot}
                      </Link>
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
              ))
            )}
          </div>
        </SpringCard>
      </div>
    </div>
  );
}
