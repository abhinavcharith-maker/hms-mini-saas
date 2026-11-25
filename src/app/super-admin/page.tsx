"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  BedDouble,
  Building2,
  ClipboardList,
  CreditCard,
  DatabaseBackup,
  FlaskConical,
  IndianRupee,
  Pill,
  Users,
} from "lucide-react";
import {
  EmptyState,
  SkeletonBox,
  SpringCard,
  StatCard,
  StatusBadge,
} from "@/components/ui/MotionPrimitives";
import { formatAccurateDateTime } from "@/lib/datetime";
import { formatInrAmount } from "@/lib/payments";

interface DashboardData {
  kpis: {
    totalHospitals: number;
    activeHospitals: number;
    deactivatedHospitals: number;
    totalGrossAmount?: number;
    paymentOverdueCount?: number;
    totalPatients: number;
    totalOpVisits: number;
    totalIpAdmissions: number;
    activeIpAdmissions: number;
    todayPatientsTotal?: number;
    todayOpTotal?: number;
    todayIpTotal?: number;
    pharmacyReferrals: {
      total: number;
      pending: number;
      completed: number;
      cancelled: number;
      completionRate: number;
    };
    labReferrals: {
      total: number;
      pending: number;
      completed: number;
      cancelled: number;
      completionRate: number;
    };
  };
  limitAlerts?: Array<{
    hospitalId: string;
    hospitalName: string;
    todayOp: number;
    dailyOpLimit: number | null;
    opExceeded: boolean;
    todayIp: number;
    dailyIpLimit: number | null;
    ipExceeded: boolean;
  }>;
  hospitalStats: Array<{
    id: string;
    code: string;
    name: string;
    isActive: boolean;
    createdAt: string;
    patients: number;
    opVisits: number;
    ipAdmissions: number;
    pharmacyReferrals: number;
    pharmacyCompleted: number;
    labReferrals: number;
    labCompleted: number;
    totalUsers: number;
    dailyOpLimit?: number | null;
    dailyIpLimit?: number | null;
    todayPatients?: number;
    todayOp?: number;
    todayIp?: number;
    monthPatients?: number;
    opExceeded?: boolean;
    ipExceeded?: boolean;
  }>;
  recentActivity: Array<{
    id: string;
    eventId: string;
    actionType: string;
    actorUsername: string;
    actorRole: string;
    details: string;
    createdAt: string;
    hospital?: { name: string; code: string } | null;
  }>;
}

export default function SuperAdminOverviewPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const tzOffset = new Date().getTimezoneOffset();
    fetch(`/api/super-admin/dashboard?tzOffset=${tzOffset}`)
      .then(async (r) => {
        if (r.status === 401) {
          router.replace("/login?portal=super-admin");
          return;
        }
        if (!r.ok) return;
        const d = await r.json();
        if (d?.kpis && Array.isArray(d?.hospitalStats)) {
          setData(d);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router]);

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

  const { kpis, hospitalStats, recentActivity } = data;
  // Rank hospitals by OP count (total OP visits primary, today OP secondary) to surface top-performing recommendations first
  const rankedHospitalsByOp = [...hospitalStats].sort((a, b) => {
    if (b.opVisits !== a.opVisits) return b.opVisits - a.opVisits;
    const todayDiff = (b.todayOp ?? 0) - (a.todayOp ?? 0);
    if (todayDiff !== 0) return todayDiff;
    return b.patients - a.patients;
  });
  const maxOpActivity = Math.max(
    1,
    ...rankedHospitalsByOp.map((h) => h.opVisits)
  );

  return (
    <div className="space-y-7">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-[#0f241d]">
            Platform Analytics & Governance
          </h1>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <Link
            href="/super-admin/hospitals"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#0d4a38] to-[#059669] px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:opacity-95"
          >
            <Building2 className="h-4 w-4" />
            Manage Hospitals
          </Link>
          <Link
            href="/super-admin/payments"
            className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50/90 px-4 py-2.5 text-sm font-semibold text-[#0d4a38] hover:bg-emerald-100"
          >
            <CreditCard className="h-4 w-4" />
            Payments
            {(kpis.paymentOverdueCount ?? 0) > 0 ? (
              <span className="rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {kpis.paymentOverdueCount}
              </span>
            ) : null}
          </Link>
          <Link
            href="/super-admin/backup"
            className="inline-flex items-center gap-2 rounded-xl border border-[#cfe2d6] bg-white px-4 py-2.5 text-sm font-semibold text-[#0d4a38] hover:bg-emerald-50"
          >
            <DatabaseBackup className="h-4 w-4" />
            Backup & Restore
          </Link>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          title="Registered Hospitals"
          value={kpis.totalHospitals}
          subtitle={`${kpis.activeHospitals} active · ${kpis.deactivatedHospitals} deactivated`}
          icon={<Building2 className="h-5 w-5" />}
          tone="forest"
          delay={0}
        />
        <StatCard
          title="Total Gross Amount"
          value={formatInrAmount(kpis.totalGrossAmount ?? 0)}
          subtitle={
            (kpis.paymentOverdueCount ?? 0) > 0
              ? `${kpis.paymentOverdueCount} hospital(s) crossed payment limit`
              : "Total collected across hospitals"
          }
          icon={<IndianRupee className="h-5 w-5" />}
          tone="emerald"
          delay={0.04}
        />
        <StatCard
          title="Total Patients"
          value={kpis.totalPatients}
          subtitle={`${kpis.totalOpVisits} OP visits · ${kpis.totalIpAdmissions} IP admissions`}
          icon={<Users className="h-5 w-5" />}
          tone="teal"
          delay={0.08}
        />
        <StatCard
          title="Pharmacy Referrals"
          value={kpis.pharmacyReferrals.total}
          subtitle={`${kpis.pharmacyReferrals.completed} completed (${kpis.pharmacyReferrals.completionRate}%) · ${kpis.pharmacyReferrals.pending} pending`}
          icon={<Pill className="h-5 w-5" />}
          tone="emerald"
          delay={0.12}
        />
        <StatCard
          title="Laboratory Referrals"
          value={kpis.labReferrals.total}
          subtitle={`${kpis.labReferrals.completed} completed (${kpis.labReferrals.completionRate}%) · ${kpis.labReferrals.pending} pending`}
          icon={<FlaskConical className="h-5 w-5" />}
          tone="amber"
          delay={0.16}
        />
      </div>

      {/* Referral Completion Analytics + Hospital Volume Bar Chart */}
      <div className="grid gap-6 lg:grid-cols-5">
        <SpringCard className="p-6 lg:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-[#0f241d]">
              Hospital-Wise Activity Comparison
            </h2>
            <ClipboardList className="h-5 w-5 text-emerald-600" />
          </div>

          {rankedHospitalsByOp.length === 0 ? (
            <EmptyState
              icon={<Building2 className="h-5 w-5" />}
              title="No hospitals provisioned yet"
              description="Create your first hospital tenant to start tracking platform-wide analytics."
            />
          ) : (
            <div className="max-h-[340px] space-y-4 overflow-y-auto pr-2">
              {rankedHospitalsByOp.map((h, i) => {
                const widthPct = Math.max(
                  6,
                  Math.round((h.opVisits / maxOpActivity) * 100)
                );
                const isTopRecommended = i < 3 && h.opVisits > 0;
                return (
                  <div key={h.id} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`font-mono-id rounded px-1.5 py-0.5 text-[11px] font-bold border ${
                            isTopRecommended
                              ? "bg-emerald-100 text-[#0d4a38] border-emerald-300"
                              : "bg-slate-50 text-[#466356] border-[#d7e7dd]"
                          }`}
                        >
                          #{i + 1}
                        </span>
                        <span className="truncate font-semibold text-[#0f241d]">
                          {h.name}
                        </span>
                        {isTopRecommended ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-200">
                            Top OP
                          </span>
                        ) : null}
                        <StatusBadge
                          status={h.isActive ? "ACTIVE" : "DEACTIVATED"}
                        />
                        {h.opExceeded ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900 border border-amber-300">
                            <AlertTriangle className="h-3 w-3" /> OP Limit Alert
                          </span>
                        ) : null}
                      </div>
                      <span className="shrink-0 text-[#466356] font-medium">
                        {h.opVisits} OP visits · Today: {h.todayOp ?? 0} OP
                      </span>
                    </div>
                    <div className="h-3 w-full overflow-hidden rounded-full bg-[#eaf4ee]">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${widthPct}%` }}
                        transition={{
                          type: "spring",
                          stiffness: 140,
                          damping: 20,
                          delay: Math.min(i * 0.03, 0.35),
                        }}
                        className="h-full rounded-full bg-gradient-to-r from-[#0d4a38] via-[#059669] to-[#34d399]"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SpringCard>

        <SpringCard delay={0.08} className="p-6 lg:col-span-2">
          <h2 className="font-display text-base font-bold text-[#0f241d]">
            Referral Fulfillment Health
          </h2>

          <div className="mt-5 space-y-5">
            <div className="rounded-2xl border border-[#dcece2] bg-[#f7fbf8] p-4">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="flex items-center gap-2 text-[#0f241d]">
                  <Pill className="h-4 w-4 text-emerald-600" />
                  Pharmacy Referrals
                </span>
                <span className="text-emerald-700">
                  {kpis.pharmacyReferrals.completionRate}% Completed
                </span>
              </div>
              <div className="mt-2.5 h-2.5 w-full overflow-hidden rounded-full bg-[#dcece2]">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${kpis.pharmacyReferrals.completionRate}%` }}
                  transition={{ duration: 0.7 }}
                  className="h-full rounded-full bg-emerald-600"
                />
              </div>
              <div className="mt-2 flex justify-between text-[11px] text-[#466356]">
                <span>Pending: {kpis.pharmacyReferrals.pending}</span>
                <span>Completed: {kpis.pharmacyReferrals.completed}</span>
                <span>Cancelled: {kpis.pharmacyReferrals.cancelled}</span>
              </div>
            </div>

            <div className="rounded-2xl border border-[#dcece2] bg-[#f7fbf8] p-4">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="flex items-center gap-2 text-[#0f241d]">
                  <FlaskConical className="h-4 w-4 text-teal-600" />
                  Laboratory Referrals
                </span>
                <span className="text-teal-700">
                  {kpis.labReferrals.completionRate}% Completed
                </span>
              </div>
              <div className="mt-2.5 h-2.5 w-full overflow-hidden rounded-full bg-[#dcece2]">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${kpis.labReferrals.completionRate}%` }}
                  transition={{ duration: 0.7, delay: 0.1 }}
                  className="h-full rounded-full bg-teal-600"
                />
              </div>
              <div className="mt-2 flex justify-between text-[11px] text-[#466356]">
                <span>Pending: {kpis.labReferrals.pending}</span>
                <span>Completed: {kpis.labReferrals.completed}</span>
                <span>Cancelled: {kpis.labReferrals.cancelled}</span>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-[#dcece2] bg-white p-4 text-xs">
              <span className="flex items-center gap-2 font-semibold text-[#0f241d]">
                <BedDouble className="h-4 w-4 text-amber-600" />
                Active Inpatients Across SaaS
              </span>
              <span className="font-display text-base font-bold text-[#0d4a38]">
                {kpis.activeIpAdmissions}
              </span>
            </div>
          </div>
        </SpringCard>
      </div>

      {/* Hospital-wise Statistics Table */}
      <SpringCard className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-base font-bold text-[#0f241d]">
            Hospital-Wise Patient & Referral Breakdown
          </h2>
          <Link
            href="/super-admin/hospitals"
            className="text-xs font-semibold text-emerald-700 hover:underline"
          >
            Inspect All Accounts →
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#dcece2] text-[11px] uppercase tracking-wider text-[#5b796b]">
                <th className="py-3 pr-4">Hospital</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Patients</th>
                <th className="py-3 px-3">OP Visits</th>
                <th className="py-3 px-3">IP Admissions</th>
                <th className="py-3 px-3">Pharmacy Refs</th>
                <th className="py-3 px-3">Lab Refs</th>
                <th className="py-3 pl-3">Users</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eaf4ee]">
              {hospitalStats.map((h) => (
                <tr key={h.id} className="hover:bg-[#f7fbf8]">
                  <td className="py-3 pr-4">
                    <p className="font-semibold text-[#0f241d]">{h.name}</p>
                    <p className="font-mono-id text-xs text-[#5b796b]">{h.code}</p>
                  </td>
                  <td className="py-3 px-3">
                    <StatusBadge status={h.isActive ? "ACTIVE" : "DEACTIVATED"} />
                  </td>
                  <td className="py-3 px-3 font-semibold">{h.patients}</td>
                  <td className="py-3 px-3">{h.opVisits}</td>
                  <td className="py-3 px-3">{h.ipAdmissions}</td>
                  <td className="py-3 px-3">
                    {h.pharmacyReferrals}{" "}
                    <span className="text-xs text-emerald-700">
                      ({h.pharmacyCompleted} done)
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    {h.labReferrals}{" "}
                    <span className="text-xs text-teal-700">
                      ({h.labCompleted} done)
                    </span>
                  </td>
                  <td className="py-3 pl-3">{h.totalUsers}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SpringCard>

      {/* Recent Platform Activity */}
      <SpringCard className="p-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-emerald-600" />
            <h2 className="font-display text-base font-bold text-[#0f241d]">
              Recent Platform & Hospital Activity
            </h2>
          </div>
          <span className="rounded-full bg-[#eef7f1] px-2.5 py-0.5 text-[11px] font-semibold text-[#0d4a38]">
            Latest {recentActivity.length} / 100
          </span>
        </div>

        <div className="space-y-2.5">
          {recentActivity.map((log) => (
            <div
              key={log.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-[#e3efe7] bg-white/80 px-4 py-3 text-xs"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono-id rounded bg-[#eef7f1] px-2 py-0.5 text-[11px] font-semibold text-[#0d4a38]">
                    {log.eventId}
                  </span>
                  <span className="font-semibold text-emerald-800">
                    {log.actionType.replace(/_/g, " ")}
                  </span>
                  {log.hospital ? (
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                      {log.hospital.code}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-[#314c40]">{log.details}</p>
              </div>
              <div className="shrink-0 text-right text-[11px] text-[#5b796b]">
                <p className="font-medium text-[#0f241d]">@{log.actorUsername}</p>
                <p>{formatAccurateDateTime(log.createdAt)}</p>
              </div>
            </div>
          ))}
        </div>
      </SpringCard>
    </div>
  );
}
