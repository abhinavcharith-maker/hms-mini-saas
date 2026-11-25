"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  DatabaseBackup,
  Download,
  FileJson,
  ShieldCheck,
  Upload,
} from "lucide-react";
import {
  BubblyButton,
  SkeletonBox,
  SpringCard,
  StatusBadge,
} from "@/components/ui/MotionPrimitives";
import { useToast } from "@/components/providers/AppProviders";

interface ValidationResult {
  valid: boolean;
  checksumValid: boolean;
  errors: string[];
  warnings: string[];
  summary: {
    scope: string;
    schemaVersion: string;
    exportedAt: string;
    exportedBy: { username: string; fullName: string };
    includesCredentialHashes?: boolean;
    hasSuperAdmin?: boolean;
    hospitals: Array<{
      id: string;
      code: string;
      name: string;
      patients: number;
      opVisits: number;
      ipAdmissions: number;
      pharmacyReferrals: number;
      labReferrals: number;
    }>;
    totals: Record<string, number>;
  } | null;
  conflicts: {
    existingHospitals: Array<{ id: string; code: string; name: string }>;
    existingUsers: Array<{ username: string; role: string }>;
  } | null;
}

interface RestoreResult {
  mode: "RESTORE_PLATFORM" | "RESTORE_EXISTING" | "IMPORT_NEW";
  hospitalCode: string;
  hospitalName: string;
  requiresRelogin?: boolean;
  restoredCounts: Record<string, number>;
  generatedCredentials: Array<{
    username: string;
    role: string;
    temporaryPassword: string;
  }>;
}

export default function SuperAdminBackupPage() {
  const { toast } = useToast();
  const [hospitals, setHospitals] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [exportHospitalId, setExportHospitalId] = useState<string>("");
  const [history, setHistory] = useState<
    Array<{
      id: string;
      operation: string;
      scope: string;
      backupVersion: string;
      checksum: string;
      summaryJson: string;
      performedByUsername: string;
      createdAt: string;
      hospital?: { code: string; name: string } | null;
    }>
  >([]);
  const [loading, setLoading] = useState(true);

  // Restore flow state
  const [rawBackup, setRawBackup] = useState<unknown>(null);
  const [fileName, setFileName] = useState<string>("");
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [sourceHospitalId, setSourceHospitalId] = useState<string>("");
  const [restoreMode, setRestoreMode] = useState<
    "RESTORE_PLATFORM" | "RESTORE_EXISTING" | "IMPORT_NEW"
  >("RESTORE_PLATFORM");
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [newHospitalName, setNewHospitalName] = useState("");
  const [newHospitalCode, setNewHospitalCode] = useState("");
  const [usernamePrefix, setUsernamePrefix] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<RestoreResult | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [hRes, bRes] = await Promise.all([
        fetch("/api/super-admin/hospitals"),
        fetch("/api/super-admin/backup/history"),
      ]);
      const hData = await hRes.json();
      const bData = await bRes.json();
      setHospitals(hData.hospitals ?? []);
      setHistory(bData.records ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleExport = (hospitalId?: string) => {
    const url = hospitalId
      ? `/api/super-admin/backup/export?hospitalId=${encodeURIComponent(hospitalId)}`
      : "/api/super-admin/backup/export";
    window.location.href = url;
    toast({
      type: "success",
      title: "Full Backup Export Started",
      message: "Downloading checksummed JSON snapshot with all records & login password hashes.",
    });
    setTimeout(loadData, 1200);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoreResult(null);
    setValidation(null);
    setConfirmOverwrite(false);
    setFileName(file.name);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      setRawBackup(parsed);
      setValidating(true);

      const res = await fetch("/api/super-admin/backup/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backup: parsed }),
      });
      const data: ValidationResult = await res.json();
      setValidation(data);

      if (data.valid && data.summary) {
        if (data.summary.hospitals.length > 0) {
          const firstH = data.summary.hospitals[0];
          setSourceHospitalId(firstH.id);
          setNewHospitalName(`${firstH.name} (Restored)`);
          setNewHospitalCode(`${firstH.code}2`);
          setUsernamePrefix(`${firstH.code.toLowerCase()}_rest_`);
          if (data.summary.scope === "PLATFORM") {
            setRestoreMode("RESTORE_PLATFORM");
          } else {
            const exists = hospitals.some((h) => h.id === firstH.id);
            setRestoreMode(exists ? "RESTORE_EXISTING" : "IMPORT_NEW");
          }
        } else {
          setSourceHospitalId("");
          setRestoreMode("RESTORE_PLATFORM");
        }
      }
    } catch {
      toast({
        type: "error",
        title: "Invalid JSON File",
        message: "Selected file could not be parsed as valid JSON.",
      });
    } finally {
      setValidating(false);
    }
  };

  const handleRestore = async () => {
    if (!rawBackup) return;
    if (restoreMode !== "RESTORE_PLATFORM" && !sourceHospitalId) return;
    setRestoring(true);
    try {
      const res = await fetch("/api/super-admin/backup/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          backup: rawBackup,
          mode: restoreMode,
          sourceHospitalId:
            restoreMode === "RESTORE_PLATFORM" ? undefined : sourceHospitalId,
          targetHospitalId:
            restoreMode === "RESTORE_EXISTING" ? sourceHospitalId : undefined,
          newHospitalName: restoreMode === "IMPORT_NEW" ? newHospitalName : undefined,
          newHospitalCode: restoreMode === "IMPORT_NEW" ? newHospitalCode : undefined,
          usernamePrefix: restoreMode === "IMPORT_NEW" ? usernamePrefix : undefined,
          confirmOverwrite,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          type: "error",
          title: "Restore Rejected",
          message: data.error ?? "Transactional restore failed; database unchanged.",
        });
        return;
      }
      setRestoreResult(data);
      window.dispatchEvent(new Event("verdant:super-admin-alerts-refresh"));
      window.dispatchEvent(new Event("verdant:maintenance-refresh"));
      if (data.requiresRelogin) {
        toast({
          type: "info",
          title: "Platform Snapshot Restored — Sign In Required",
          message: "Super Admin credentials reverted to the backup snapshot. Redirecting to login...",
        });
        setTimeout(() => {
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.href = "/login?portal=super-admin";
        }, 1200);
        return;
      }
      toast({
        type: "success",
        title:
          restoreMode === "RESTORE_PLATFORM"
            ? "Entire Platform Restored Atomically"
            : "Backup Restored Atomically",
        message: `${data.hospitalName} (${data.hospitalCode}) restored inside a database transaction.`,
      });
      loadData();
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-[#0f241d]">
          Backup & Restore Center
        </h1>
        <p className="mt-1 text-sm text-[#466356]">
          Download verified JSON backups and execute transaction-safe hospital restores or tenant imports.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 1. EXPORT BACKUP */}
        <SpringCard className="p-6 flex flex-col justify-between min-w-0 overflow-hidden">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-[#0d4a38]">
                <Download className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="font-display text-lg font-bold text-[#0f241d]">
                  1. Export JSON Backup
                </h2>
                <p className="text-xs text-[#466356]">
                  SHA-256 checksummed snapshot of hospitals, patients, OP/IP, referrals & audit logs.
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-xs text-emerald-950 space-y-1.5">
              <p className="flex items-center gap-1.5 font-bold">
                <ShieldCheck className="h-4 w-4 text-emerald-700" />
                Complete State & Credential Hash Snapshot
              </p>
              <p>
                Captures every hospital, account, salted bcrypt password hash (never plaintext),
                OP/IP record, bed, pharmacy/lab referral, receipt, payment, limit, audit log, and maintenance state
                so restoring rewinds the entire platform cleanly to that exact moment.
              </p>
            </div>

            <div className="mt-5 space-y-3 min-w-0">
              <BubblyButton onClick={() => handleExport()} className="w-full py-3">
                <FileJson className="h-4 w-4 shrink-0" />
                Export Full Platform Backup (All Hospitals)
              </BubblyButton>

              <div className="border-t border-[#dcece2] pt-4 min-w-0">
                <label className="mb-1.5 block text-xs font-semibold text-[#314c40]">
                  Or Export Single Hospital Backup
                </label>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 min-w-0">
                  <select
                    value={exportHospitalId}
                    onChange={(e) => setExportHospitalId(e.target.value)}
                    className="min-w-0 w-full flex-1 truncate rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2.5 text-sm"
                  >
                    <option value="">Select a hospital...</option>
                    {hospitals.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name} ({h.code})
                      </option>
                    ))}
                  </select>
                  <BubblyButton
                    variant="secondary"
                    disabled={!exportHospitalId}
                    onClick={() => handleExport(exportHospitalId)}
                    className="shrink-0 whitespace-nowrap"
                  >
                    <Download className="h-4 w-4 shrink-0" />
                    Export Selected
                  </BubblyButton>
                </div>
              </div>
            </div>
          </div>
        </SpringCard>

        {/* 2. RESTORE BACKUP */}
        <SpringCard delay={0.05} className="p-6 min-w-0 overflow-hidden">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#dff2e7] text-[#0d4a38]">
              <Upload className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-[#0f241d]">
                2. Validate & Restore Backup
              </h2>
              <p className="text-xs text-[#466356]">
                Verifies schema, SHA-256 checksum, foreign keys & conflicts before atomic restoration.
              </p>
            </div>
          </div>

          <div className="mt-5">
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#badbc7] bg-[#f7fbf8] p-6 text-center hover:border-emerald-500 hover:bg-emerald-50/40 transition-colors">
              <DatabaseBackup className="h-7 w-7 text-emerald-700" />
              <span className="mt-2 text-sm font-semibold text-[#0f241d]">
                {fileName ? `Loaded: ${fileName}` : "Click to select .json backup file"}
              </span>
              <span className="mt-0.5 text-xs text-[#5b796b]">
                Supports platform-wide or single-hospital HospitalPro (by Zeronnn Technologies) backups
              </span>
              <input
                type="file"
                accept="application/json,.json"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>

          {validating ? <SkeletonBox className="mt-4 h-24" /> : null}

          {validation ? (
            <div className="mt-5 space-y-4">
              {validation.valid ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-xs text-emerald-950">
                  <p className="flex items-center gap-2 font-bold">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    Schema & SHA-256 Checksum Verified ({validation.summary?.schemaVersion})
                  </p>
                  <p className="mt-1">
                    Exported {new Date(validation.summary!.exportedAt).toLocaleString()} by{" "}
                    @{validation.summary!.exportedBy.username} ·{" "}
                    {validation.summary!.totals.hospitals} hospitals ·{" "}
                    {validation.summary!.totals.users} users ·{" "}
                    {validation.summary!.totals.patients} patients ·{" "}
                    {validation.summary!.totals.opVisits} OP ·{" "}
                    {validation.summary!.totals.ipAdmissions} IP
                    {validation.summary!.includesCredentialHashes
                      ? " · Passwords included"
                      : " · Legacy backup (no credential hashes)"}
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-900 space-y-1">
                  <p className="font-bold">Validation Failed — Restore Blocked</p>
                  {validation.errors.map((err, idx) => (
                    <p key={idx}>• {err}</p>
                  ))}
                </div>
              )}

              {validation.warnings.length > 0 && restoreMode !== "RESTORE_PLATFORM" ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900 space-y-1">
                  <p className="flex items-center gap-1.5 font-bold">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    Conflict Detection Notice
                  </p>
                  {validation.warnings.map((w, idx) => (
                    <p key={idx}>{w}</p>
                  ))}
                </div>
              ) : null}

              {validation.valid && validation.summary ? (
                <div className="space-y-4 rounded-2xl border border-[#dcece2] bg-white p-4 text-xs">
                  <div className="grid gap-2 sm:grid-cols-3">
                    {validation.summary.scope === "PLATFORM" ? (
                      <button
                        type="button"
                        onClick={() => {
                          setRestoreMode("RESTORE_PLATFORM");
                          setConfirmOverwrite(false);
                        }}
                        className={`rounded-xl border p-3 text-left transition-colors cursor-pointer ${
                          restoreMode === "RESTORE_PLATFORM"
                            ? "border-rose-500 bg-rose-50 text-rose-950"
                            : "border-[#dcece2] text-[#466356]"
                        }`}
                      >
                        <p className="font-bold">Overwrite Entire Website</p>
                        <p className="mt-0.5 text-[11px]">
                          Replaces all hospitals, users, passwords &amp; records with this full snapshot.
                        </p>
                      </button>
                    ) : null}

                    {validation.summary.hospitals.length > 0 ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setRestoreMode("IMPORT_NEW")}
                          className={`rounded-xl border p-3 text-left transition-colors cursor-pointer ${
                            restoreMode === "IMPORT_NEW"
                              ? "border-emerald-500 bg-emerald-50 text-[#0d4a38]"
                              : "border-[#dcece2] text-[#466356]"
                          }`}
                        >
                          <p className="font-bold">Import as New Hospital</p>
                          <p className="mt-0.5 text-[11px]">
                            Creates an isolated copy of one hospital without touching existing data.
                          </p>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setRestoreMode("RESTORE_EXISTING");
                            setConfirmOverwrite(false);
                          }}
                          className={`rounded-xl border p-3 text-left transition-colors cursor-pointer ${
                            restoreMode === "RESTORE_EXISTING"
                              ? "border-amber-500 bg-amber-50 text-amber-950"
                              : "border-[#dcece2] text-[#466356]"
                          }`}
                        >
                          <p className="font-bold">Restore Single Hospital</p>
                          <p className="mt-0.5 text-[11px]">
                            Replaces only one matching hospital tenant in place.
                          </p>
                        </button>
                      </>
                    ) : null}
                  </div>

                  {restoreMode !== "RESTORE_PLATFORM" &&
                  validation.summary.hospitals.length > 0 ? (
                    <div>
                      <label className="mb-1 block font-semibold text-[#314c40]">
                        Hospital Snapshot to Restore
                      </label>
                      <select
                        value={sourceHospitalId}
                        onChange={(e) => setSourceHospitalId(e.target.value)}
                        className="w-full rounded-xl border border-[#cfe2d6] px-3 py-2 text-sm"
                      >
                        {validation.summary.hospitals.map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.name} ({h.code}) — {h.patients} pts, {h.opVisits} OP
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  {restoreMode === "IMPORT_NEW" ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block font-semibold">New Hospital Name</label>
                        <input
                          value={newHospitalName}
                          onChange={(e) => setNewHospitalName(e.target.value)}
                          className="w-full rounded-xl border border-[#cfe2d6] px-3 py-2 text-xs"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block font-semibold">New Hospital Code</label>
                        <input
                          value={newHospitalCode}
                          onChange={(e) =>
                            setNewHospitalCode(e.target.value.toUpperCase())
                          }
                          className="w-full rounded-xl border border-[#cfe2d6] px-3 py-2 text-xs font-mono-id"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="mb-1 block font-semibold">
                          Username Prefix (prevents login collisions)
                        </label>
                        <input
                          value={usernamePrefix}
                          onChange={(e) => setUsernamePrefix(e.target.value)}
                          className="w-full rounded-xl border border-[#cfe2d6] px-3 py-2 text-xs font-mono-id"
                        />
                      </div>
                    </div>
                  ) : (
                    <label
                      className={`flex items-start gap-2.5 rounded-xl border p-3 cursor-pointer ${
                        restoreMode === "RESTORE_PLATFORM"
                          ? "border-rose-200 bg-rose-50/70"
                          : "border-amber-200 bg-amber-50/70"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={confirmOverwrite}
                        onChange={(e) => setConfirmOverwrite(e.target.checked)}
                        className="mt-0.5"
                      />
                      <span
                        className={
                          restoreMode === "RESTORE_PLATFORM"
                            ? "text-rose-950 font-medium"
                            : "text-amber-950"
                        }
                      >
                        {restoreMode === "RESTORE_PLATFORM"
                          ? "I confirm this full restore will wipe ALL current hospitals, users, password changes, patients, OP/IP records, referrals, and settings across the entire platform and replace them cleanly with the uploaded backup snapshot."
                          : "I confirm restoring this snapshot will atomically replace existing operational records and passwords for this matching hospital inside a transaction."}
                      </span>
                    </label>
                  )}

                  <BubblyButton
                    disabled={
                      restoring ||
                      (restoreMode !== "IMPORT_NEW" && !confirmOverwrite)
                    }
                    onClick={handleRestore}
                    className="w-full"
                  >
                    {restoring
                      ? "Executing Transactional Restore..."
                      : restoreMode === "RESTORE_PLATFORM"
                        ? "Confirm & Overwrite Entire Platform Database"
                        : restoreMode === "IMPORT_NEW"
                          ? "Confirm & Import as New Hospital"
                          : "Confirm & Restore Existing Hospital"}
                  </BubblyButton>
                </div>
              ) : null}
            </div>
          ) : null}

          {restoreResult ? (
            <div className="mt-5 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-xs space-y-2">
              <p className="font-bold text-emerald-950">
                Restore Completed: {restoreResult.hospitalName} ({restoreResult.hospitalCode})
              </p>
              <p className="text-emerald-900">
                Restored{" "}
                {restoreResult.restoredCounts.hospitals !== undefined
                  ? `${restoreResult.restoredCounts.hospitals} hospitals, ${restoreResult.restoredCounts.users} user accounts (with original passwords), `
                  : `${restoreResult.restoredCounts.users ?? 0} user accounts (with original passwords), `}
                {restoreResult.restoredCounts.patients} patients,{" "}
                {restoreResult.restoredCounts.opVisits} OP visits,{" "}
                {restoreResult.restoredCounts.ipAdmissions} IP admissions.
              </p>
              {restoreResult.generatedCredentials.length > 0 ? (
                <div className="rounded-xl bg-white p-3 border border-emerald-200">
                  <p className="font-bold text-[#0d4a38] mb-1">
                    One-Time Generated Temporary Passwords (Save Now):
                  </p>
                  {restoreResult.generatedCredentials.map((c) => (
                    <p key={c.username} className="font-mono-id">
                      @{c.username} ({c.role}) → <strong>{c.temporaryPassword}</strong>
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </SpringCard>
      </div>

      {/* Backup & Restore Audit History */}
      <SpringCard className="p-6">
        <h2 className="mb-4 font-display text-base font-bold text-[#0f241d]">
          Backup & Restoration Audit Log
        </h2>
        {loading ? (
          <SkeletonBox className="h-32" />
        ) : history.length === 0 ? (
          <p className="text-xs text-[#5b796b]">No backup operations recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#dcece2] text-[11px] uppercase text-[#5b796b]">
                  <th className="py-2.5 pr-3">Operation</th>
                  <th className="py-2.5 px-3">Scope / Hospital</th>
                  <th className="py-2.5 px-3">Checksum</th>
                  <th className="py-2.5 px-3">Performed By</th>
                  <th className="py-2.5 pl-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eaf4ee]">
                {history.map((rec) => (
                  <tr key={rec.id}>
                    <td className="py-3 pr-3">
                      <StatusBadge
                        status={rec.operation === "EXPORT" ? "COMPLETED" : "ACTIVE"}
                        label={rec.operation.replace(/_/g, " ")}
                      />
                    </td>
                    <td className="py-3 px-3">
                      {rec.hospital
                        ? `${rec.hospital.name} (${rec.hospital.code})`
                        : "Platform-Wide"}
                    </td>
                    <td className="py-3 px-3 font-mono-id text-[#466356]">
                      {rec.checksum.slice(0, 14)}…
                    </td>
                    <td className="py-3 px-3">@{rec.performedByUsername}</td>
                    <td className="py-3 pl-3 text-[#5b796b]">
                      {new Date(rec.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SpringCard>
    </div>
  );
}
