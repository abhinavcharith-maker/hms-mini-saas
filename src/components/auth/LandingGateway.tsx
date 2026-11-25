"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BedDouble,
  Building2,
  ClipboardCheck,
  FlaskConical,
  Leaf,
  Pill,
  Printer,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  UserCheck,
  Wrench,
} from "lucide-react";
import {
  Hero3DEcosystem,
  SereneAmbientBackdrop,
  Tilt3DCard,
} from "@/components/auth/Interactive3DPrimitives";
import { getHomePathForRole, getRoleLabel } from "@/lib/constants";
import type { MaintenanceState } from "@/lib/maintenance";
import { formatAccurateDateTime } from "@/lib/datetime";

const PORTAL_CARDS = [
  {
    key: "hospital-admin",
    title: "Hospital Admin",
    roleTag: "Primary Operations",
    description:
      "Full command over OP registrations, IP beds, pharmacy & lab referrals, printable receipts, audit logs & hospital settings.",
    href: "/login?portal=hospital-admin",
    icon: <Building2 className="h-6 w-6" />,
    accent: "from-[#0d4a38] to-[#059669]",
    softBg: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  {
    key: "receptionist",
    title: "Receptionist Desk",
    roleTag: "Front-Desk Care",
    description:
      "Fast UHID patient registration, repeat OP visits, bed admissions/discharges, referral creation & consultation prints.",
    href: "/login?portal=receptionist",
    icon: <UserCheck className="h-6 w-6" />,
    accent: "from-[#135a45] to-[#10b981]",
    softBg: "bg-teal-50 text-teal-700 border-teal-200",
  },
  {
    key: "doctor",
    title: "Doctor Portal",
    roleTag: "Daily Consultancy",
    description:
      "View today's assigned patient consultations, prescribe medicines directly to pharmacy, and refer laboratory tests.",
    href: "/login?portal=doctor",
    icon: <Stethoscope className="h-6 w-6" />,
    accent: "from-[#065f46] to-[#10b981]",
    softBg: "bg-emerald-50 text-emerald-800 border-emerald-200",
  },
  {
    key: "pharmacy",
    title: "Pharmacy Portal",
    roleTag: "External Referral Partner",
    description:
      "Lightweight fulfilment workspace. Review medicines referred by your partner hospital and mark referrals completed.",
    href: "/login?portal=pharmacy",
    icon: <Pill className="h-6 w-6" />,
    accent: "from-[#047857] to-[#34d399]",
    softBg: "bg-[#e9f8ef] text-[#047857] border-[#b7e4c7]",
  },
  {
    key: "laboratory",
    title: "Laboratory Portal",
    roleTag: "External Diagnostics Partner",
    description:
      "Focused diagnostic referral queue. Track patient lab test referrals and confirm completion in one click.",
    href: "/login?portal=laboratory",
    icon: <FlaskConical className="h-6 w-6" />,
    accent: "from-[#0f766e] to-[#14b8a6]",
    softBg: "bg-cyan-50 text-teal-800 border-teal-200",
  },
];

export function LandingGateway({
  needsSetup,
  maintenance,
  activeUser,
}: {
  needsSetup: boolean;
  maintenance?: MaintenanceState;
  activeUser: { fullName: string; role: string } | null;
}) {
  return (
    <div className="relative min-h-screen overflow-x-clip bg-nature-mesh">
      {/* Clean Serene Botanical Ambient Glow (Zero Obstructing Prisms/Dots) */}
      <SereneAmbientBackdrop />

      {/* Top Glass Header */}
      <header className="sticky top-0 z-30 border-b border-[#d7e7dd]/90 bg-white/95 shadow-xs">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0d4a38] to-[#10b981] text-white shadow-md shadow-emerald-900/20 transition-transform duration-200 hover:scale-105">
              <Leaf className="h-5 w-5" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="font-display text-lg font-extrabold tracking-tight text-[#0f241d]">
                HospitalPro
              </span>
              <span className="text-[11px] font-medium text-[#5b796b]">
                by Zeronnn Technologies
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {needsSetup ? (
              <Link
                href="/setup"
                className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-md hover:bg-amber-700 transition-colors"
              >
                <Sparkles className="h-4 w-4" />
                Initialize Platform
              </Link>
            ) : activeUser ? (
              <Link
                href={getHomePathForRole(activeUser.role)}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#0d4a38] to-[#059669] px-4 py-2 text-sm font-semibold text-white shadow-md shadow-emerald-900/20 hover:opacity-95 transition-opacity"
              >
                Continue as {activeUser.fullName} ({getRoleLabel(activeUser.role)})
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#0d4a38] to-[#059669] px-4 py-2 text-sm font-semibold text-white shadow-md shadow-emerald-900/20 hover:shadow-lg hover:shadow-emerald-900/25 transition-all"
              >
                Portal Sign In
                <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        {maintenance?.active ? (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl border border-amber-300 bg-amber-50/95 p-5 shadow-md backdrop-blur-md"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-200/80 text-amber-900">
                <Wrench className="h-5 w-5" />
              </div>
              <div>
                <p className="font-display text-sm font-bold text-amber-950">
                  Scheduled Maintenance Break Active Across All Portals
                  {maintenance.endsAt
                    ? ` (Until ${formatAccurateDateTime(maintenance.endsAt)})`
                    : ""}
                </p>
                <p className="mt-1 text-xs font-medium text-amber-900">
                  Reason: {maintenance.reason}
                </p>
              </div>
            </div>
          </motion.div>
        ) : null}

        {needsSetup ? (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50/90 p-5 shadow-md backdrop-blur-md"
          >
            <div>
              <p className="font-display text-sm font-bold text-amber-900">
                Fresh Installation Detected — First-Time Platform Setup Required
              </p>
              <p className="mt-1 text-xs text-amber-800">
                No Super Admin account exists yet. Create the initial Super Admin to begin provisioning hospitals.
              </p>
            </div>
            <Link
              href="/setup"
              className="shrink-0 inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700"
            >
              Launch Setup Wizard
              <ArrowRight className="h-4 w-4" />
            </Link>
          </motion.div>
        ) : null}

        {/* Interactive 3D Split Hero Section */}
        <div className="grid items-center gap-10 lg:grid-cols-12">
          <div className="text-center lg:col-span-7 lg:text-left">
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 24 }}
              className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-200/90 bg-white/85 px-4 py-1.5 text-xs font-semibold text-[#0d4a38] shadow-sm backdrop-blur-md"
            >
              <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
              Lightweight Multi-Tenant Healthcare & External Referral SaaS
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 24, delay: 0.05 }}
              className="font-display text-4xl font-extrabold tracking-tight text-[#0f241d] sm:text-5xl lg:text-[54px] lg:leading-[1.08]"
            >
              Calm, Precision Care for{" "}
              <span className="bg-gradient-to-r from-[#0d4a38] via-[#059669] to-[#14b8a6] bg-clip-text text-transparent">
                Modern Hospitals
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 24, delay: 0.1 }}
              className="mt-5 max-w-2xl mx-auto lg:mx-0 text-base leading-relaxed text-[#466356] sm:text-lg"
            >
              Designed specifically for small and medium hospitals — unified UHID patient
              timelines, transaction-safe IP bed management, print-ready OP consultation sheets,
              and focused Pharmacy & Laboratory referral portals without enterprise bloat.
            </motion.p>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 220, damping: 22, delay: 0.12 }}
            className="lg:col-span-5"
          >
            <Hero3DEcosystem />
          </motion.div>
        </div>

        {/* 5 Interactive 3D Portal Access Cards (Balanced 3 + 2 Centered Grid; Super Admin hidden) */}
        <section className="mt-14">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="font-display text-xl font-bold text-[#0f241d]">
                Choose Your Portal
              </h2>
              <p className="text-sm text-[#466356]">
                Dedicated role-isolated workspaces for every team and external partner.
              </p>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-6">
            {PORTAL_CARDS.map((card, idx) => {
              const gridPlacement =
                idx === 3
                  ? "lg:col-span-2 lg:col-start-2"
                  : idx === 4
                    ? "md:col-span-2 md:mx-auto md:w-full md:max-w-md lg:col-span-2 lg:col-start-4 lg:max-w-none lg:mx-0"
                    : "lg:col-span-2";
              return (
              <div key={card.key} className={`h-full ${gridPlacement}`}>
              <Tilt3DCard
                delay={0.05 * idx}
                maxTilt={7}
                windowChrome
                ambientFloat={{
                  amplitudeY: 6.5 + (idx % 3) * 1.1,
                  wobbleRotate: idx % 2 === 0 ? 0.55 : -0.5,
                  wobbleTiltX: 1.4,
                  wobbleTiltY: idx % 2 === 0 ? 1.6 : -1.5,
                  duration: 5.8 + (idx % 3) * 0.75,
                  phaseDelay: idx * 0.45,
                }}
                className="group p-6 pt-7"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${card.accent} text-white shadow-md shadow-emerald-950/20 transition-transform duration-200 group-hover:scale-105`}
                    >
                      {card.icon}
                    </div>
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${card.softBg}`}
                    >
                      {card.roleTag}
                    </span>
                  </div>

                  <h3 className="mt-5 font-display text-lg font-bold text-[#0f241d]">
                    {card.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#466356]">
                    {card.description}
                  </p>
                </div>

                <Link
                  href={card.href}
                  className="mt-6 inline-flex items-center justify-between rounded-xl border border-[#d7e7dd] bg-[#f7fbf8]/95 px-4 py-2.5 text-sm font-semibold text-[#0d4a38] shadow-xs transition-all group-hover:border-emerald-400 group-hover:bg-emerald-50 group-hover:shadow-md"
                >
                  <span>Sign in to {card.title}</span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </Tilt3DCard>
              </div>
              );
            })}
          </div>
        </section>

        {/* Core Capabilities 3D Strip */}
        <section className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: <ClipboardCheck className="h-5 w-5 text-emerald-600" />,
              title: "Permanent UHID Timelines",
              desc: "Clickable UHIDs connect OP visits, IP stays, referrals & immutable receipts.",
            },
            {
              icon: <BedDouble className="h-5 w-5 text-emerald-600" />,
              title: "Transaction-Safe Beds",
              desc: "Zero double-booking across wards with atomic bed transfer & release.",
            },
            {
              icon: <Printer className="h-5 w-5 text-emerald-600" />,
              title: "A4 Print Ready",
              desc: "Branded Doctor Consultation Sheets & snapshot Billing Receipts.",
            },
            {
              icon: <ShieldCheck className="h-5 w-5 text-emerald-600" />,
              title: "Strict Tenant Isolation",
              desc: "Server-verified RBAC, append-only audit trails & checksummed JSON backups.",
            },
          ].map((feat, i) => (
            <Tilt3DCard
              key={feat.title}
              delay={0.1 + i * 0.04}
              maxTilt={5}
              ambientFloat={{
                amplitudeY: 4.2,
                wobbleRotate: i % 2 === 0 ? 0.35 : -0.35,
                wobbleTiltX: 0.9,
                wobbleTiltY: 1.0,
                duration: 6.2 + (i % 2) * 0.8,
                phaseDelay: i * 0.5,
              }}
              className="p-5"
            >
              <div>
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 border border-emerald-200/70 shadow-xs">
                  {feat.icon}
                </div>
                <h4 className="font-display text-sm font-bold text-[#0f241d]">
                  {feat.title}
                </h4>
                <p className="mt-1 text-xs leading-relaxed text-[#466356]">
                  {feat.desc}
                </p>
              </div>
            </Tilt3DCard>
          ))}
        </section>
      </main>
    </div>
  );
}
