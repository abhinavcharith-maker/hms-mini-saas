"use client";

import React, { useEffect, useState } from "react";
import { Clock, Leaf, LogOut, RefreshCw, Wrench } from "lucide-react";
import type { MaintenanceState } from "@/lib/maintenance";
import { formatAccurateDateTime } from "@/lib/datetime";

function formatRemaining(endsAt: string | null): string | null {
  if (!endsAt) return null;
  const diffMs = new Date(endsAt).getTime() - Date.now();
  if (diffMs <= 0) return "Resuming momentarily...";
  const totalSec = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const hh = String(hours).padStart(2, "0");
  const mm = String(mins).padStart(2, "0");
  const ss = String(secs).padStart(2, "0");
  return days > 0 ? `${days}d ${hh}h ${mm}m ${ss}s` : `${hh}h ${mm}m ${ss}s`;
}

export function MaintenanceScreen({
  maintenance,
  user,
  hospitalName,
  onRecovered,
}: {
  maintenance: MaintenanceState;
  user?: { fullName: string; username: string; role: string } | null;
  hospitalName?: string | null;
  onRecovered?: () => void;
}) {
  const [remaining, setRemaining] = useState<string | null>(() =>
    formatRemaining(maintenance.endsAt)
  );
  const [checking, setChecking] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const tick = () => {
      const next = formatRemaining(maintenance.endsAt);
      setRemaining(next);
      if (
        maintenance.endsAt &&
        new Date(maintenance.endsAt).getTime() <= Date.now()
      ) {
        fetch("/api/maintenance/status")
          .then((r) => r.json())
          .then((d: MaintenanceState) => {
            if (!d.active) {
              if (onRecovered) onRecovered();
              else window.location.reload();
            }
          })
          .catch(() => {});
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [maintenance.endsAt, onRecovered]);

  const handleCheckNow = async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/maintenance/status");
      const d = (await res.json()) as MaintenanceState;
      if (!d.active) {
        if (onRecovered) onRecovered();
        else window.location.reload();
      }
    } finally {
      setChecking(false);
    }
  };

  const handleSignOut = async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/login";
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className="min-h-screen bg-nature-mesh flex items-center justify-center p-4">
      <div className="w-full max-w-xl rounded-3xl border border-amber-200 bg-white/95 p-7 sm:p-9 shadow-2xl shadow-emerald-950/10 backdrop-blur-xl space-y-6">
        <div className="flex items-center justify-between gap-3 border-b border-[#e4efe8] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#0d4a38] to-[#10b981] text-white">
              <Leaf className="h-4 w-4" />
            </div>
            <div>
              <p className="font-display text-sm font-bold text-[#0f241d]">
                HospitalPro
              </p>
              <p className="text-[11px] text-[#5b796b]">by Zeronnn Technologies</p>
            </div>
          </div>

          {hospitalName ? (
            <span className="rounded-full border border-[#cfe2d6] bg-[#f4faf6] px-3 py-1 text-xs font-semibold text-[#0d4a38]">
              {hospitalName}
            </span>
          ) : null}
        </div>

        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-800 border border-amber-200">
            <Wrench className="h-6 w-6" />
          </div>
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-900">
              Scheduled Maintenance Break
            </span>
            <h1 className="mt-2 font-display text-2xl font-extrabold text-[#0f241d]">
              Portal Temporarily Paused
            </h1>
            <p className="mt-1 text-sm text-[#466356]">
              Platform maintenance has been scheduled by the Super Administrator. Access will automatically resume once the maintenance window completes.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50/85 p-4 space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-900">
            Maintenance Reason
          </p>
          <p className="text-sm font-semibold text-amber-950 leading-relaxed">
            {maintenance.reason || "Scheduled platform maintenance is in progress."}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 text-xs">
          <div className="rounded-2xl border border-[#dcece2] bg-[#f7fbf8] p-3.5">
            <p className="text-[11px] font-semibold uppercase text-[#5b796b]">
              Time Remaining
            </p>
            <p className="mt-1 flex items-center gap-1.5 font-mono-id text-base font-bold text-[#0d4a38]">
              <Clock className="h-4 w-4 text-amber-600" />
              {remaining ?? "Until resumed"}
            </p>
          </div>
          <div className="rounded-2xl border border-[#dcece2] bg-[#f7fbf8] p-3.5">
            <p className="text-[11px] font-semibold uppercase text-[#5b796b]">
              Expected Resume Time
            </p>
            <p className="mt-1 font-semibold text-sm text-[#0f241d]">
              {maintenance.endsAt
                ? formatAccurateDateTime(maintenance.endsAt)
                : "To be announced"}
            </p>
          </div>
        </div>

        {user ? (
          <p className="text-xs text-[#5b796b]">
            Signed in account: <strong className="text-[#0f241d]">{user.fullName}</strong> (@
            {user.username}) · All data remains safely preserved.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <button
            type="button"
            onClick={handleCheckNow}
            disabled={checking}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#0d4a38] to-[#059669] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:opacity-95 cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} />
            {checking ? "Checking..." : "Check Availability Now"}
          </button>

          {user ? (
            <button
              type="button"
              onClick={handleSignOut}
              disabled={loggingOut}
              className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              {loggingOut ? "Signing out..." : "Sign Out"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
