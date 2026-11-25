"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Building2,
  Eye,
  EyeOff,
  FlaskConical,
  Leaf,
  Lock,
  Pill,
  ShieldCheck,
  Stethoscope,
  UserCheck,
  Wrench,
} from "lucide-react";
import { PORTAL_LOGIN_OPTIONS, ROLES } from "@/lib/constants";
import type { MaintenanceState } from "@/lib/maintenance";
import { formatAccurateDateTime } from "@/lib/datetime";
import { BubblyButton } from "@/components/ui/MotionPrimitives";
import {
  Portal3DTotem,
  SereneAmbientBackdrop,
  Tilt3DCard,
} from "@/components/auth/Interactive3DPrimitives";
import { useToast } from "@/components/providers/AppProviders";

function LoginFormContent() {
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const publicPortalOptions = PORTAL_LOGIN_OPTIONS.filter(
    (p) => p.role !== ROLES.SUPER_ADMIN
  );
  const superAdminPortal = PORTAL_LOGIN_OPTIONS.find(
    (p) => p.role === ROLES.SUPER_ADMIN
  )!;

  const initialPortalKey = searchParams.get("portal") ?? "hospital-admin";
  const initialSelected =
    publicPortalOptions.find((p) => p.key === initialPortalKey) ??
    publicPortalOptions[0];

  const [selectedPortalKey, setSelectedPortalKey] = useState<string>(
    initialSelected.key
  );
  const [brandClickCount, setBrandClickCount] = useState(0);
  const [superAdminUnlocked, setSuperAdminUnlocked] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [maintenance, setMaintenance] = useState<MaintenanceState | null>(null);
  const [formFocused, setFormFocused] = useState(false);

  useEffect(() => {
    fetch("/api/auth/setup")
      .then((r) => r.json())
      .then((d) => {
        if (d.needsSetup) setNeedsSetup(true);
      })
      .catch(() => {});

    const loadMaint = () => {
      fetch("/api/maintenance/status", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: MaintenanceState | null) => {
          if (d) setMaintenance(d);
        })
        .catch(() => {});
    };
    loadMaint();
    const timer = window.setInterval(loadMaint, 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const currentPortal =
    superAdminUnlocked && selectedPortalKey === superAdminPortal.key
      ? superAdminPortal
      : publicPortalOptions.find((p) => p.key === selectedPortalKey) ??
        publicPortalOptions[0];
  const isMaintenanceBlockingCurrentPortal =
    Boolean(maintenance?.active) && currentPortal.role !== ROLES.SUPER_ADMIN;

  const handleBrandEasterEggClick = () => {
    if (superAdminUnlocked) return;
    const next = brandClickCount + 1;
    if (next >= 15) {
      setBrandClickCount(0);
      setSuperAdminUnlocked(true);
      setSelectedPortalKey(superAdminPortal.key);
      setErrorMsg(null);
    } else {
      setBrandClickCount(next);
    }
  };

  const iconForPortal = (key: string, sizeClass = "h-4 w-4") => {
    switch (key) {
      case "hospital-admin":
        return <Building2 className={sizeClass} />;
      case "receptionist":
        return <UserCheck className={sizeClass} />;
      case "doctor":
        return <Stethoscope className={sizeClass} />;
      case "pharmacy":
        return <Pill className={sizeClass} />;
      case "laboratory":
        return <FlaskConical className={sizeClass} />;
      default:
        return <ShieldCheck className={sizeClass} />;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password,
          portalRole: currentPortal.role,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error ?? "Unable to sign in.");
        return;
      }

      toast({
        type: "success",
        title: `Welcome, ${data.user.fullName}`,
        message: `Signed into ${currentPortal.label}`,
      });
      // Hard navigation guarantees clean Next.js router cache & zero stale state from any prior account
      window.location.assign(data.redirectTo || currentPortal.homePath);
    } catch {
      setErrorMsg("Network error while authenticating. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 overflow-x-clip bg-nature-mesh">
      {/* Clean Serene Botanical Ambient Glow (Zero Obstructing Prisms/Dots) */}
      <SereneAmbientBackdrop />

      <div className="relative z-10 w-full max-w-5xl">
        {/* Top Brand & Back Bar */}
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl border border-[#cfe2d6] bg-white/85 px-3.5 py-2 text-xs font-semibold text-[#0d4a38] shadow-xs backdrop-blur-md hover:bg-white hover:border-emerald-300 transition-all"
          >
            <ArrowLeft className="h-4 w-4" />
            All Portals
          </Link>

          <div
            onClick={handleBrandEasterEggClick}
            className="select-none flex items-center gap-2.5 rounded-2xl border border-[#d7e7dd]/90 bg-white/80 px-3.5 py-2 shadow-xs backdrop-blur-md"
          >
            <motion.div
              whileHover={{ rotateY: 20, scale: 1.06 }}
              transition={{ type: "spring", stiffness: 320, damping: 18 }}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[#0d4a38] to-[#10b981] text-white shadow-sm"
            >
              <Leaf className="h-4 w-4" />
            </motion.div>
            <div className="leading-tight">
              <span className="block font-display text-sm font-bold text-[#0f241d]">
                HospitalPro
              </span>
              <span className="block text-[10px] font-medium text-[#5b796b]">
                by Zeronnn Technologies
              </span>
            </div>
          </div>
        </div>

        {needsSetup ? (
          <div className="mb-5 flex items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50/95 p-4 text-xs text-amber-900 shadow-sm backdrop-blur-md">
            <span>No Super Admin exists yet on this fresh instance.</span>
            <Link
              href="/setup"
              className="rounded-lg bg-amber-600 px-3 py-1.5 font-semibold text-white hover:bg-amber-700"
            >
              Run First-Time Setup
            </Link>
          </div>
        ) : null}

        {/* Interactive 3D Split Stage */}
        <div className="grid items-center gap-6 lg:grid-cols-12">
          {/* Left Interactive 3D Portal Totem */}
          <div className="hidden lg:block lg:col-span-5">
            <Portal3DTotem
              portalKey={currentPortal.key}
              label={currentPortal.label}
              description={currentPortal.description}
              icon={iconForPortal(currentPortal.key, "h-9 w-9")}
            />
          </div>

          {/* Right Interactive 3D Glass Authentication Card */}
          <div
            className="lg:col-span-7"
            onFocusCapture={() => setFormFocused(true)}
            onBlurCapture={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                setFormFocused(false);
              }
            }}
          >
            <Tilt3DCard
              maxTilt={3.5}
              disabled={formFocused}
              windowChrome
              ambientFloat={{
                amplitudeY: 4.5,
                wobbleRotate: 0.3,
                wobbleTiltX: 0.8,
                wobbleTiltY: 0.9,
                duration: 6.8,
              }}
              className="p-6 pt-7 sm:p-8 sm:pt-9"
            >
              <div className="mb-6">
                <h1 className="font-display text-2xl font-extrabold text-[#0f241d]">
                  Secure Portal Sign In
                </h1>
                <p className="mt-1 text-sm text-[#466356]">
                  Select your role portal and enter your assigned credentials.
                </p>
              </div>

              {/* Portal Selector Tabs (Super Admin hidden until 15-click Easter egg unlocked) */}
              {superAdminUnlocked && currentPortal.role === ROLES.SUPER_ADMIN ? (
                <div className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-emerald-400 bg-[#e4f6ec] px-4 py-3">
                  <div className="flex items-center gap-2.5 text-[#0d4a38]">
                    <ShieldCheck className="h-5 w-5 text-emerald-700" />
                    <span className="font-display text-sm font-extrabold">
                      Super Admin Portal
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSuperAdminUnlocked(false);
                      setBrandClickCount(0);
                      setSelectedPortalKey(publicPortalOptions[0].key);
                      setErrorMsg(null);
                    }}
                    className="rounded-xl border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-[#0d4a38] hover:bg-emerald-50 cursor-pointer"
                  >
                    Back to Portals
                  </button>
                </div>
              ) : (
                <div className="mb-6 grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {publicPortalOptions.map((opt, idx) => {
                    const active = opt.key === currentPortal.key;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => {
                          setSelectedPortalKey(opt.key);
                          setErrorMsg(null);
                        }}
                        className={`relative flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 text-center text-xs font-semibold transition-all cursor-pointer ${
                          idx === publicPortalOptions.length - 1
                            ? "col-span-2 sm:col-span-1"
                            : ""
                        } ${
                          active
                            ? "border-emerald-400 text-[#0d4a38] shadow-sm"
                            : "border-[#dcece2] bg-white/75 text-[#466356] hover:border-emerald-200 hover:bg-emerald-50/50"
                        }`}
                      >
                        {active ? (
                          <motion.span
                            layoutId="login-portal-pill"
                            transition={{
                              type: "tween",
                              duration: 0.22,
                              ease: [0.22, 1, 0.36, 1],
                            }}
                            className="absolute inset-0 rounded-2xl bg-[#e4f6ec] border border-emerald-300"
                          />
                        ) : null}
                        <span className="relative z-10 text-emerald-700">
                          {iconForPortal(opt.key)}
                        </span>
                        <span className="relative z-10 leading-tight">
                          {opt.shortLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {isMaintenanceBlockingCurrentPortal && maintenance ? (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-950 space-y-1.5"
                >
                  <p className="flex items-center gap-2 font-bold text-amber-900">
                    <Wrench className="h-4 w-4 text-amber-700" />
                    Scheduled Maintenance Break Active
                  </p>
                  <p className="font-semibold text-amber-950">
                    Reason: {maintenance.reason}
                  </p>
                  {maintenance.endsAt ? (
                    <p className="text-[11px] text-amber-800">
                      Expected resume: {formatAccurateDateTime(maintenance.endsAt)} (All non-Super Admin portals resume automatically).
                    </p>
                  ) : null}
                </motion.div>
              ) : null}

              {errorMsg ? (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-800"
                >
                  {errorMsg}
                </motion.div>
              ) : null}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[#314c40]">
                    Username
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter your assigned username"
                    className="w-full rounded-xl border border-[#cfe2d6] bg-white px-4 py-3 text-sm text-[#0f241d] placeholder:text-[#86a194] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[#314c40]">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full rounded-xl border border-[#cfe2d6] bg-white px-4 py-3 pr-11 text-sm text-[#0f241d] placeholder:text-[#86a194] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-[#6c877a] hover:bg-emerald-50 hover:text-[#0d4a38]"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <BubblyButton
                  type="submit"
                  disabled={submitting || isMaintenanceBlockingCurrentPortal}
                  className="w-full py-3"
                >
                  <Lock className="h-4 w-4" />
                  {isMaintenanceBlockingCurrentPortal
                    ? "Portal Paused During Maintenance"
                    : submitting
                      ? "Verifying Credentials..."
                      : `Sign In to ${currentPortal.label}`}
                </BubblyButton>
              </form>
            </Tilt3DCard>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-sm text-[#466356]">
          Loading portal authentication...
        </div>
      }
    >
      <LoginFormContent />
    </Suspense>
  );
}
