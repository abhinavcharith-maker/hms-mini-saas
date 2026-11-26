"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock,
  PowerOff,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import {
  BubblyButton,
  SkeletonBox,
  SpringCard,
  StatusBadge,
} from "@/components/ui/MotionPrimitives";
import { useToast } from "@/components/providers/AppProviders";
import type { MaintenanceState } from "@/lib/maintenance";
import {
  formatAccurateDateTime,
  getLocalDateTimeInputValue,
} from "@/lib/datetime";

interface AuditEntry {
  id: string;
  eventId: string;
  actionType: string;
  actorUsername: string;
  details: string;
  createdAt: string;
}

const DURATION_PRESETS = [
  { key: "30m", label: "30 Minutes", minutes: 30 },
  { key: "1h", label: "1 Hour", minutes: 60 },
  { key: "2h", label: "2 Hours", minutes: 120 },
  { key: "4h", label: "4 Hours", minutes: 240 },
  { key: "6h", label: "6 Hours", minutes: 360 },
  { key: "12h", label: "12 Hours", minutes: 720 },
  { key: "1d", label: "1 Day (24 Hours)", minutes: 1440 },
  { key: "2d", label: "2 Days (48 Hours)", minutes: 2880 },
] as const;

const REASON_PRESETS = [
  "Scheduled server maintenance & database optimization",
  "Security update & platform reliability upgrade",
  "Backup snapshot restoration & data verification",
  "Emergency bug fix & clinical workflow update",
] as const;

function formatCountdown(endsAt: string | null): string {
  if (!endsAt) return "—";
  const diff = new Date(endsAt).getTime() - Date.now();
  if (diff <= 0) return "Expired / Resuming";
  const totalSec = Math.floor(diff / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const hh = String(hours).padStart(2, "0");
  const mm = String(mins).padStart(2, "0");
  const ss = String(secs).padStart(2, "0");
  return days > 0 ? `${days}d ${hh}h ${mm}m ${ss}s` : `${hh}h ${mm}m ${ss}s`;
}

export default function SuperAdminMaintenancePage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ending, setEnding] = useState(false);

  const [maintenance, setMaintenance] = useState<MaintenanceState | null>(null);
  const [history, setHistory] = useState<AuditEntry[]>([]);
  const [countdown, setCountdown] = useState<string>("—");

  const [durationMode, setDurationMode] = useState<string>("1h");
  const [customHours, setCustomHours] = useState("1");
  const [customMinutes, setCustomMinutes] = useState("0");
  const [customEndAt, setCustomEndAt] = useState(() =>
    getLocalDateTimeInputValue(new Date(Date.now() + 60 * 60_000))
  );
  const [reason, setReason] = useState<string>(REASON_PRESETS[0]);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/super-admin/maintenance", { cache: "no-store" });
      if (res.ok) {
        const d = (await res.json()) as {
          maintenance: MaintenanceState;
          history: AuditEntry[];
        };
        setMaintenance(d.maintenance);
        setHistory(d.history ?? []);
        if (d.maintenance?.active && d.maintenance.reason) {
          setReason(d.maintenance.reason);
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!maintenance?.active || !maintenance.endsAt) {
      return;
    }
    const tick = () => setCountdown(formatCountdown(maintenance.endsAt));
    const raf = window.requestAnimationFrame(tick);
    const id = window.setInterval(tick, 1000);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearInterval(id);
    };
  }, [maintenance?.active, maintenance?.endsAt]);

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 3) {
      toast({
        type: "warning",
        title: "Reason Required",
        message: "Please enter or click a reason to display across all portals.",
      });
      return;
    }

    const payload: {
      reason: string;
      durationMinutes?: number;
      endsAt?: string;
    } = { reason: reason.trim() };

    if (durationMode === "custom-duration") {
      const mins = Math.max(0, Number(customHours || 0)) * 60 + Math.max(0, Number(customMinutes || 0));
      if (!Number.isFinite(mins) || mins < 1) {
        toast({
          type: "warning",
          title: "Invalid Duration",
          message: "Specify at least 1 minute for a custom maintenance break.",
        });
        return;
      }
      payload.durationMinutes = Math.round(mins);
    } else if (durationMode === "custom-end") {
      if (!customEndAt) {
        toast({
          type: "warning",
          title: "End Time Required",
          message: "Pick a valid end date & time.",
        });
        return;
      }
      payload.endsAt = new Date(customEndAt).toISOString();
    } else {
      const preset = DURATION_PRESETS.find((p) => p.key === durationMode);
      payload.durationMinutes = preset?.minutes ?? 60;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/super-admin/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (!res.ok) {
        toast({
          type: "error",
          title: "Unable to Schedule Maintenance",
          message: d.error ?? "Please verify duration & reason.",
        });
        return;
      }
      setMaintenance(d.maintenance);
      window.dispatchEvent(new Event("verdant:maintenance-refresh"));
      toast({
        type: "success",
        title: "Maintenance Break Activated",
        message: "All Hospital, Receptionist, Pharmacy, and Lab portals now display the maintenance reason.",
      });
      void loadData();
    } finally {
      setSaving(false);
    }
  };

  const handleEndEarly = async () => {
    setEnding(true);
    try {
      const res = await fetch("/api/super-admin/maintenance", {
        method: "DELETE",
      });
      const d = await res.json();
      if (!res.ok) {
        toast({
          type: "error",
          title: "Error",
          message: d.error ?? "Could not end maintenance.",
        });
        return;
      }
      setMaintenance(d.maintenance);
      window.dispatchEvent(new Event("verdant:maintenance-refresh"));
      toast({
        type: "success",
        title: "Platform Resumed",
        message: "Maintenance break ended; all portals are accessible again.",
      });
      void loadData();
    } finally {
      setEnding(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-[#0f241d]">
          Platform Maintenance Control
        </h1>
      </div>

      {loading ? (
        <SkeletonBox className="h-44" />
      ) : (
        <SpringCard
          className={`p-6 border ${
            maintenance?.active
              ? "border-amber-300 bg-amber-50/75"
              : "border-emerald-200 bg-emerald-50/60"
          }`}
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
                  maintenance?.active
                    ? "bg-amber-200 text-amber-900"
                    : "bg-emerald-200/80 text-[#0d4a38]"
                }`}
              >
                {maintenance?.active ? (
                  <Wrench className="h-6 w-6" />
                ) : (
                  <CheckCircle2 className="h-6 w-6" />
                )}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge
                    status={maintenance?.active ? "PENDING" : "ACTIVE"}
                    label={
                      maintenance?.active
                        ? "Maintenance Break Active"
                        : "All Portals Operational"
                    }
                  />
                  {maintenance?.active && maintenance.endsAt ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-0.5 font-mono-id text-xs font-bold text-amber-950 border border-amber-200">
                      <Clock className="h-3.5 w-3.5 text-amber-600" />
                      {maintenance?.active && maintenance.endsAt
                        ? countdown === "—"
                          ? formatCountdown(maintenance.endsAt)
                          : countdown
                        : "—"}
                    </span>
                  ) : null}
                </div>
                {maintenance?.active ? (
                  <div className="mt-2 space-y-1 text-xs text-amber-950">
                    <p className="text-sm font-bold">
                      Broadcast Reason: {maintenance.reason}
                    </p>
                    <p className="text-amber-800">
                      Scheduled resume:{" "}
                      <strong>
                        {maintenance.endsAt
                          ? formatAccurateDateTime(maintenance.endsAt)
                          : "Until manually ended"}
                      </strong>{" "}
                      · Super Admin login & workspace remain fully accessible.
                    </p>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-[#314c40]">
                    Hospital Admins, Receptionists, Pharmacy Partners, and Laboratory Partners currently have normal portal access.
                  </p>
                )}
              </div>
            </div>

            {maintenance?.active ? (
              <BubblyButton
                type="button"
                variant="danger"
                onClick={handleEndEarly}
                disabled={ending}
                className="shrink-0"
              >
                <PowerOff className="h-4 w-4" />
                {ending ? "Resuming..." : "End Maintenance Now"}
              </BubblyButton>
            ) : null}
          </div>
        </SpringCard>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Schedule / Update Form */}
        <SpringCard className="p-6 lg:col-span-7">
          <div className="flex items-center gap-3 mb-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
              <Wrench className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-[#0f241d]">
                {maintenance?.active
                  ? "Update Active Maintenance Break"
                  : "Start Maintenance Break"}
              </h2>
              <p className="text-xs text-[#466356]">
                Choose any duration (1 hour, 2 hours, 1 day, or custom) and select or write a reason.
              </p>
            </div>
          </div>

          <form onSubmit={handleActivate} className="space-y-5">
            <div>
              <label className="mb-2 block text-xs font-semibold text-[#314c40]">
                1. Select Maintenance Duration
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {DURATION_PRESETS.map((p) => {
                  const selected = durationMode === p.key;
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setDurationMode(p.key)}
                      className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-all cursor-pointer ${
                        selected
                          ? "border-emerald-500 bg-[#dff4e8] text-[#0d4a38]"
                          : "border-[#cfe2d6] bg-white text-[#466356] hover:bg-emerald-50/50"
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setDurationMode("custom-duration")}
                  className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-all cursor-pointer sm:col-span-2 ${
                    durationMode === "custom-duration"
                      ? "border-emerald-500 bg-[#dff4e8] text-[#0d4a38]"
                      : "border-[#cfe2d6] bg-white text-[#466356] hover:bg-emerald-50/50"
                  }`}
                >
                  Custom Duration (Hrs / Mins)
                </button>
                <button
                  type="button"
                  onClick={() => setDurationMode("custom-end")}
                  className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-all cursor-pointer sm:col-span-2 ${
                    durationMode === "custom-end"
                      ? "border-emerald-500 bg-[#dff4e8] text-[#0d4a38]"
                      : "border-[#cfe2d6] bg-white text-[#466356] hover:bg-emerald-50/50"
                  }`}
                >
                  Exact End Date & Time
                </button>
              </div>

              {durationMode === "custom-duration" ? (
                <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl border border-[#dcece2] bg-[#f7fbf8] p-3">
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-[#314c40]">
                      Hours
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={720}
                      value={customHours}
                      onChange={(e) => setCustomHours(e.target.value)}
                      className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-[#314c40]">
                      Minutes
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={59}
                      value={customMinutes}
                      onChange={(e) => setCustomMinutes(e.target.value)}
                      className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              ) : null}

              {durationMode === "custom-end" ? (
                <div className="mt-3 rounded-xl border border-[#dcece2] bg-[#f7fbf8] p-3">
                  <label className="mb-1 block text-[11px] font-semibold text-[#314c40]">
                    End Maintenance At (Local Time)
                  </label>
                  <input
                    type="datetime-local"
                    value={customEndAt}
                    onChange={(e) => setCustomEndAt(e.target.value)}
                    className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3 py-2 text-sm"
                  />
                </div>
              ) : null}
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold text-[#314c40]">
                2. Click a Reason or Type Custom Notice *
              </label>
              <div className="mb-2.5 flex flex-wrap gap-1.5">
                {REASON_PRESETS.map((presetReason) => {
                  const active = reason === presetReason;
                  return (
                    <button
                      key={presetReason}
                      type="button"
                      onClick={() => setReason(presetReason)}
                      className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors cursor-pointer ${
                        active
                          ? "border-amber-400 bg-amber-100 text-amber-950 font-semibold"
                          : "border-[#dcece2] bg-[#f7fbf8] text-[#466356] hover:bg-emerald-50"
                      }`}
                    >
                      {presetReason}
                    </button>
                  );
                })}
              </div>
              <textarea
                required
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Enter exact maintenance reason displayed to all non-Super-Admin logins..."
                className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 text-xs text-emerald-950 flex items-start gap-2.5">
              <ShieldCheck className="h-4 w-4 text-emerald-700 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Super Admin Exemption Active</p>
                <p className="mt-0.5">
                  All Hospital Admin, Receptionist, Pharmacy, and Laboratory logins immediately display the maintenance reason above and pause until the break ends. Super Admin remains completely accessible.
                </p>
              </div>
            </div>

            <BubblyButton type="submit" disabled={saving} className="w-full py-3">
              <Wrench className="h-4 w-4" />
              {saving
                ? "Activating Maintenance..."
                : maintenance?.active
                  ? "Update Active Maintenance Break"
                  : "Activate Maintenance Break"}
            </BubblyButton>
          </form>
        </SpringCard>

        {/* Broadcast Preview & Audit History */}
        <div className="lg:col-span-5 space-y-6">
          <SpringCard className="p-6 space-y-3">
            <h2 className="font-display text-base font-bold text-[#0f241d]">
              Portal Notice Preview
            </h2>
            <p className="text-xs text-[#466356]">
              Shown across Login, Landing Gateway, Hospital Admin, Receptionist, Pharmacy & Laboratory portals:
            </p>
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-950 space-y-1.5">
              <p className="font-bold text-amber-900 uppercase tracking-wide text-[10px]">
                Scheduled Maintenance Break
              </p>
              <p className="font-semibold text-sm text-amber-950">
                {reason.trim() || "Enter a reason to preview"}
              </p>
              <p className="text-[11px] text-amber-800">
                All non-Super-Admin access pauses automatically until maintenance concludes.
              </p>
            </div>
          </SpringCard>

          <SpringCard className="p-6">
            <h2 className="mb-3 font-display text-base font-bold text-[#0f241d]">
              Maintenance Log
            </h2>
            {history.length === 0 ? (
              <p className="text-xs text-[#5b796b]">
                No maintenance breaks recorded yet.
              </p>
            ) : (
              <div className="max-h-72 overflow-y-auto divide-y divide-[#eaf4ee] pr-1">
                {history.map((h) => (
                  <div key={h.id} className="py-2.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <StatusBadge
                        status={
                          h.actionType === "MAINTENANCE_ENDED" ? "ACTIVE" : "PENDING"
                        }
                        label={h.actionType.replace(/_/g, " ")}
                      />
                      <span className="text-[11px] text-[#5b796b]">
                        {formatAccurateDateTime(h.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-[#314c40]">{h.details}</p>
                  </div>
                ))}
              </div>
            )}
          </SpringCard>
        </div>
      </div>
    </div>
  );
}
