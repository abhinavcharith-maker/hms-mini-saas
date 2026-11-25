"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Building2,
  CheckCircle2,
  CreditCard,
  X,
} from "lucide-react";

export interface SuperAdminLimitAlert {
  hospitalId: string;
  hospitalName: string;
  hospitalCode?: string;
  todayOp: number;
  dailyOpLimit: number | null;
  opExceeded: boolean;
}

export interface SuperAdminPaymentAlert {
  hospitalId: string;
  hospitalName: string;
  hospitalCode: string;
  isActive: boolean;
  subscriptionMonthsPaid: number;
  subscriptionExpiresAt: string;
  daysOverdue: number;
}

export const SUPER_ADMIN_ALERTS_REFRESH_EVENT =
  "verdant:super-admin-alerts-refresh";

export function SuperAdminAlertsBell() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<SuperAdminLimitAlert[]>([]);
  const [paymentAlerts, setPaymentAlerts] = useState<SuperAdminPaymentAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const loadAlerts = useCallback(async () => {
    try {
      const tzOffset = new Date().getTimezoneOffset();
      const res = await fetch(
        `/api/super-admin/hospitals?tzOffset=${tzOffset}`
      );
      if (res.ok) {
        const d = (await res.json()) as {
          limitAlerts?: SuperAdminLimitAlert[];
          paymentAlerts?: SuperAdminPaymentAlert[];
        };
        setAlerts(d.limitAlerts ?? []);
        setPaymentAlerts(d.paymentAlerts ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAlerts();
  }, [loadAlerts, pathname]);

  useEffect(() => {
    const handleRefresh = () => {
      void loadAlerts();
    };
    window.addEventListener(SUPER_ADMIN_ALERTS_REFRESH_EVENT, handleRefresh);
    return () => {
      window.removeEventListener(
        SUPER_ADMIN_ALERTS_REFRESH_EVENT,
        handleRefresh
      );
    };
  }, [loadAlerts]);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      void loadAlerts();
    }
  };

  const totalAlertCount = alerts.length + paymentAlerts.length;
  const hasAlerts = totalAlertCount > 0;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={toggleOpen}
        aria-label={`Platform alerts (${totalAlertCount})`}
        aria-expanded={open}
        title={
          hasAlerts
            ? `${totalAlertCount} active platform alert(s)`
            : "No active platform alerts"
        }
        className={`relative inline-flex h-9 w-9 items-center justify-center rounded-full border transition-all cursor-pointer shadow-xs ${
          hasAlerts
            ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
            : "border-[#d7e7dd] bg-white/95 text-[#314c40] hover:bg-emerald-50 hover:text-[#0d4a38]"
        }`}
      >
        <Bell className="h-4 w-4" />
        {hasAlerts ? (
          <motion.span
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white shadow-sm ring-2 ring-white"
          >
            {totalAlertCount > 99 ? "99+" : totalAlertCount}
          </motion.span>
        ) : null}
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 380, damping: 28, mass: 0.8 }}
            className="absolute right-0 top-full z-50 mt-2.5 w-[calc(100vw-2rem)] max-w-sm sm:w-96 origin-top-right overflow-hidden rounded-2xl border border-[#cfe2d6] bg-white/98 shadow-2xl shadow-emerald-950/15 backdrop-blur-xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-[#e3efe7] bg-gradient-to-r from-[#f6fbf8] to-white px-4 py-3.5">
              <div className="flex items-center gap-2.5">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                    hasAlerts
                      ? "bg-amber-100 text-amber-800"
                      : "bg-emerald-100 text-emerald-700"
                  }`}
                >
                  {hasAlerts ? (
                    <AlertTriangle className="h-4 w-4" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-sm font-bold text-[#0f241d]">
                      Platform Alerts
                    </h3>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        hasAlerts
                          ? "bg-amber-100 text-amber-900"
                          : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {totalAlertCount} active
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-[#5b796b]">
                    Payment-limit & daily OP threshold alerts (non-blocking).
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close alerts"
                className="rounded-lg p-1 text-[#5b796b] hover:bg-emerald-50 hover:text-[#0f241d] cursor-pointer transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto divide-y divide-[#eef6f1]">
              {loading && totalAlertCount === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-[#5b796b]">
                  Checking platform thresholds & payments...
                </div>
              ) : totalAlertCount === 0 ? (
                <div className="px-4 py-7 text-center">
                  <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-500/80" />
                  <p className="mt-2 text-xs font-semibold text-[#0f241d]">
                    All Hospitals Healthy & Within Limits
                  </p>
                  <p className="mt-1 text-[11px] text-[#5b796b]">
                    No payment limit or daily OP limit alerts right now.
                  </p>
                </div>
              ) : (
                <>
                  {paymentAlerts.map((pa) => (
                    <Link
                      key={`pay-${pa.hospitalId}`}
                      href="/super-admin/payments"
                      onClick={() => setOpen(false)}
                      className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-rose-50/50 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <CreditCard className="h-3.5 w-3.5 shrink-0 text-rose-700" />
                          <p className="truncate text-xs font-bold text-[#0f241d]">
                            {pa.hospitalName}
                          </p>
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
                          <span className="inline-flex items-center rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 font-semibold text-rose-800">
                            Crossed payment limit ({pa.daysOverdue}d overdue)
                          </span>
                        </div>
                      </div>
                      <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-[#8aa698]" />
                    </Link>
                  ))}

                  {alerts.map((al) => (
                    <Link
                      key={`op-${al.hospitalId}`}
                      href="/super-admin/hospitals"
                      onClick={() => setOpen(false)}
                      className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-amber-50/50 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5 shrink-0 text-amber-700" />
                          <p className="truncate text-xs font-bold text-[#0f241d]">
                            {al.hospitalName}
                          </p>
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
                          <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 font-medium text-amber-900">
                            OP today: <strong className="ml-1">{al.todayOp}</strong> /{" "}
                            {al.dailyOpLimit}
                          </span>
                        </div>
                      </div>
                      <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-[#8aa698]" />
                    </Link>
                  ))}
                </>
              )}
            </div>

            <div className="grid grid-cols-2 divide-x divide-[#e3efe7] border-t border-[#e3efe7] bg-[#f8fcfa]">
              <Link
                href="/super-admin/payments"
                onClick={() => setOpen(false)}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold text-[#0d4a38] hover:bg-emerald-50/70 transition-colors"
              >
                <span>Payments</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
              <Link
                href="/super-admin/hospitals"
                onClick={() => setOpen(false)}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold text-[#0d4a38] hover:bg-emerald-50/70 transition-colors"
              >
                <span>Hospitals</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
