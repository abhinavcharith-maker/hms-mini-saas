"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, ShieldCheck } from "lucide-react";
import {
  BubblyButton,
  SkeletonBox,
  SpringCard,
} from "@/components/ui/MotionPrimitives";
import { ROLES, getRoleLabel } from "@/lib/constants";
import { formatAccurateDateTime } from "@/lib/datetime";

interface AuditRow {
  id: string;
  eventId: string;
  actionType: string;
  actorUsername: string;
  actorRole: string;
  patientUhid: string | null;
  referenceId: string | null;
  details: string;
  createdAt: string;
}

export default function HospitalRecentChangesPage() {
  const router = useRouter();
  const [role, setRole] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, totalPages: 1 });
  const [actors, setActors] = useState<string[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [auditFilters, setAuditFilters] = useState({
    q: "",
    actionType: "",
    actorUsername: "",
    patientUhid: "",
    from: "",
    to: "",
    page: 1,
  });

  useEffect(() => {
    fetch("/api/auth/me")
      .then(async (r) => {
        if (r.status === 401) {
          router.replace("/login");
          return;
        }
        if (!r.ok) return;
        const d = await r.json();
        if (d?.user?.role) {
          setRole(d.user.role);
          if (d.user.role !== ROLES.HOSPITAL_ADMIN) {
            router.replace("/hospital/patient-history");
          }
        }
      })
      .catch(() => {});
  }, [router]);

  const isAdmin = role === ROLES.HOSPITAL_ADMIN;

  const loadAudit = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const qs = new URLSearchParams();
      if (auditFilters.q) qs.set("q", auditFilters.q);
      if (auditFilters.actionType) qs.set("actionType", auditFilters.actionType);
      if (auditFilters.actorUsername)
        qs.set("actorUsername", auditFilters.actorUsername);
      if (auditFilters.patientUhid) qs.set("patientUhid", auditFilters.patientUhid);
      if (auditFilters.from) qs.set("from", auditFilters.from);
      if (auditFilters.to) qs.set("to", auditFilters.to);
      qs.set("tzOffset", String(new Date().getTimezoneOffset()));
      qs.set("page", String(auditFilters.page));

      const res = await fetch(`/api/hospital/history?${qs.toString()}`);
      if (res.ok) {
        const d = await res.json();
        setLogs(d.logs ?? []);
        setPagination(d.pagination ?? { total: 0, page: 1, totalPages: 1 });
        setActors(d.filters?.actors ?? []);
        setActions(d.filters?.actions ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [auditFilters, isAdmin]);

  useEffect(() => {
    void loadAudit();
  }, [loadAudit]);

  const handleExportCsv = () => {
    const qs = new URLSearchParams();
    if (auditFilters.q) qs.set("q", auditFilters.q);
    if (auditFilters.actionType) qs.set("actionType", auditFilters.actionType);
    if (auditFilters.actorUsername)
      qs.set("actorUsername", auditFilters.actorUsername);
    if (auditFilters.patientUhid) qs.set("patientUhid", auditFilters.patientUhid);
    if (auditFilters.from) qs.set("from", auditFilters.from);
    if (auditFilters.to) qs.set("to", auditFilters.to);
    qs.set("tzOffset", String(new Date().getTimezoneOffset()));
    qs.set("format", "csv");
    const link = document.createElement("a");
    link.href = `/api/hospital/history?${qs.toString()}`;
    link.download = "hospital-operational-history.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-[#0f241d]">
          Recent Changes
        </h1>
        <p className="mt-1 text-sm text-[#466356]">
          Hospital operational history — automatically retains only the 100 most recent changes.
        </p>
      </div>

      <SpringCard className="p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3.5 text-xs text-emerald-950">
          <span className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="h-4 w-4 text-emerald-700" />
            Hospital Operational History — Records cannot be altered or deleted.
          </span>
          <BubblyButton
            type="button"
            onClick={handleExportCsv}
            className="px-3.5 py-2 text-xs"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </BubblyButton>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <input
            value={auditFilters.q}
            onChange={(e) =>
              setAuditFilters({ ...auditFilters, q: e.target.value, page: 1 })
            }
            placeholder="Search event, ref, details..."
            className="rounded-xl border border-[#cfe2d6] px-3 py-2 text-xs lg:col-span-2"
          />
          <select
            value={auditFilters.actionType}
            onChange={(e) =>
              setAuditFilters({
                ...auditFilters,
                actionType: e.target.value,
                page: 1,
              })
            }
            className="rounded-xl border border-[#cfe2d6] px-3 py-2 text-xs"
          >
            <option value="">All Event Types</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {a.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <select
            value={auditFilters.actorUsername}
            onChange={(e) =>
              setAuditFilters({
                ...auditFilters,
                actorUsername: e.target.value,
                page: 1,
              })
            }
            className="rounded-xl border border-[#cfe2d6] px-3 py-2 text-xs"
          >
            <option value="">All Users</option>
            {actors.map((u) => (
              <option key={u} value={u}>
                @{u}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={auditFilters.from}
            onChange={(e) =>
              setAuditFilters({ ...auditFilters, from: e.target.value, page: 1 })
            }
            className="rounded-xl border border-[#cfe2d6] px-3 py-2 text-xs"
          />
          <input
            type="date"
            value={auditFilters.to}
            onChange={(e) =>
              setAuditFilters({ ...auditFilters, to: e.target.value, page: 1 })
            }
            className="rounded-xl border border-[#cfe2d6] px-3 py-2 text-xs"
          />
        </div>

        {loading ? (
          <SkeletonBox className="h-64" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#dcece2] text-[11px] uppercase text-[#5b796b]">
                    <th className="py-3 pr-3">Event ID</th>
                    <th className="py-3 px-3">Date & Time</th>
                    <th className="py-3 px-3">Action</th>
                    <th className="py-3 px-3">Patient UHID</th>
                    <th className="py-3 px-3">User / Role</th>
                    <th className="py-3 px-3">Reference</th>
                    <th className="py-3 pl-3">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eaf4ee]">
                  {logs.map((l) => (
                    <tr key={l.id} className="hover:bg-[#f7fbf8]">
                      <td className="py-3 pr-3 font-mono-id font-semibold text-[#0d4a38]">
                        {l.eventId}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap text-[#5b796b]">
                        {formatAccurateDateTime(l.createdAt)}
                      </td>
                      <td className="py-3 px-3 font-semibold text-emerald-800">
                        {l.actionType.replace(/_/g, " ")}
                      </td>
                      <td className="py-3 px-3">
                        {l.patientUhid ? (
                          <Link
                            href={`/hospital/patients/${encodeURIComponent(
                              l.patientUhid
                            )}`}
                            className="font-mono-id rounded bg-emerald-50 px-2 py-0.5 font-semibold text-[#0d4a38] border border-emerald-200 hover:bg-emerald-100"
                          >
                            {l.patientUhid}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-mono-id">@{l.actorUsername}</span>
                        <p className="text-[10px] text-[#5b796b]">
                          {getRoleLabel(l.actorRole)}
                        </p>
                      </td>
                      <td className="py-3 px-3 font-mono-id">
                        {l.referenceId ?? "—"}
                      </td>
                      <td className="py-3 pl-3 max-w-md text-[#314c40]">
                        {l.details}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between text-xs text-[#466356]">
              <span>
                Showing page {pagination.page} of {pagination.totalPages} (
                {pagination.total} total events)
              </span>
              <div className="flex gap-2">
                <BubblyButton
                  variant="outline"
                  className="px-3 py-1.5 text-xs"
                  disabled={pagination.page <= 1}
                  onClick={() =>
                    setAuditFilters((f) => ({ ...f, page: f.page - 1 }))
                  }
                >
                  Previous
                </BubblyButton>
                <BubblyButton
                  variant="outline"
                  className="px-3 py-1.5 text-xs"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() =>
                    setAuditFilters((f) => ({ ...f, page: f.page + 1 }))
                  }
                >
                  Next
                </BubblyButton>
              </div>
            </div>
          </>
        )}
      </SpringCard>
    </div>
  );
}
