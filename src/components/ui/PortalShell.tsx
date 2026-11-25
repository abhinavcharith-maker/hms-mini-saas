"use client";

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Leaf,
  LogOut,
  Menu,
  Wrench,
  X,
  Building2,
  ShieldCheck,
} from "lucide-react";
import { ROLES, getRoleLabel } from "@/lib/constants";
import { useToast } from "@/components/providers/AppProviders";
import { formatAccurateDateTime } from "@/lib/datetime";
import type { MaintenanceState } from "@/lib/maintenance";
import { MaintenanceScreen } from "@/components/ui/MaintenanceScreen";

export interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: string | number;
}

interface SidebarContentProps {
  navItems: NavItem[];
  pathname: string;
  user: {
    username: string;
    fullName: string;
    role: string;
  };
  loggingOut: boolean;
  isExpanded: boolean;
  isPinnedCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onCloseMobile: () => void;
  onLogout: () => void;
}

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

function isPortalNavActive(pathname: string, href: string) {
  if (
    href === "/super-admin" ||
    href === "/hospital" ||
    href === "/pharmacy" ||
    href === "/laboratory"
  ) {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarContent({
  navItems,
  pathname,
  user,
  loggingOut,
  isExpanded,
  isPinnedCollapsed = false,
  onToggleCollapse,
  onCloseMobile,
  onLogout,
}: SidebarContentProps) {
  const navRef = useRef<HTMLElement | null>(null);
  const linkRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [pillStyle, setPillStyle] = useState<{
    top: number;
    height: number;
  } | null>(null);

  const activeHref =
    navItems.find((item) => isPortalNavActive(pathname, item.href))?.href ??
    null;

  // Measure active link inside the relative <nav> container so page scrolling
  // and sticky sidebar offset never introduce layout-projection jumps or wobble.
  const measureActivePill = useCallback(() => {
    if (!activeHref) {
      setPillStyle(null);
      return;
    }
    const el = linkRefs.current[activeHref];
    if (!el) return;
    const nextTop = el.offsetTop;
    const nextHeight = el.offsetHeight;
    setPillStyle((prev) =>
      prev && prev.top === nextTop && prev.height === nextHeight
        ? prev
        : { top: nextTop, height: nextHeight }
    );
  }, [activeHref]);

  useIsomorphicLayoutEffect(() => {
    measureActivePill();
    const navEl = navRef.current;
    if (!navEl || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      measureActivePill();
    });
    observer.observe(navEl);
    if (activeHref && linkRefs.current[activeHref]) {
      observer.observe(linkRefs.current[activeHref]!);
    }
    return () => observer.disconnect();
  }, [measureActivePill, activeHref, isExpanded, navItems]);

  return (
    <div className="flex h-full flex-col justify-between p-3">
      <div>
        {/* Brand Header + Back/Front Arrow Collapse Control */}
        <div
          className={`mb-5 flex rounded-2xl bg-gradient-to-br from-[#0d4a38] to-[#115e46] p-2.5 text-white shadow-lg shadow-emerald-950/15 transition-all ${
            isExpanded
              ? "items-center justify-between gap-2.5"
              : "flex-col items-center gap-2"
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
              <Leaf className="h-5 w-5 text-emerald-200" />
            </div>

            <AnimatePresence initial={false}>
              {isExpanded ? (
                <motion.div
                  key="brand-text"
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.18 }}
                  className="min-w-0 overflow-hidden whitespace-nowrap"
                >
                  <p className="truncate font-display text-sm font-bold tracking-tight">
                    HospitalPro
                  </p>
                  <p className="truncate text-[11px] text-emerald-200/90">
                    by Zeronnn Technologies
                  </p>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          {onToggleCollapse ? (
            <button
              type="button"
              onClick={onToggleCollapse}
              title={isPinnedCollapsed ? "Open sidebar" : "Close sidebar"}
              aria-label={isPinnedCollapsed ? "Open sidebar" : "Close sidebar"}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-[#0d4a38] shadow-md ring-2 ring-white/30 hover:bg-emerald-50 hover:scale-105 active:scale-95 transition-all cursor-pointer"
            >
              {isPinnedCollapsed ? (
                <ChevronRight className="h-4 w-4 stroke-[2.75]" />
              ) : (
                <ChevronLeft className="h-4 w-4 stroke-[2.75]" />
              )}
            </button>
          ) : null}
        </div>

        {/* Navigation Links */}
        <nav ref={navRef} className="relative flex flex-col gap-1">
          {pillStyle ? (
            <motion.span
              aria-hidden="true"
              initial={false}
              animate={{
                y: pillStyle.top,
                height: pillStyle.height,
              }}
              transition={{
                type: "tween",
                duration: 0.22,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="pointer-events-none absolute inset-x-0 top-0 z-0 rounded-xl bg-[#dff4e8] border border-[#b7e2ca]"
            />
          ) : null}

          {navItems.map((item) => {
            const active = item.href === activeHref;
            return (
              <Link
                key={item.href}
                ref={(el) => {
                  linkRefs.current[item.href] = el;
                }}
                href={item.href}
                title={!isExpanded ? item.label : undefined}
                onClick={onCloseMobile}
                className={`relative z-10 flex items-center rounded-xl py-2.5 text-sm font-medium transition-colors ${
                  isExpanded
                    ? "justify-between gap-3 px-3.5"
                    : "justify-center px-2"
                } ${
                  active
                    ? "text-[#0d4a38] font-semibold"
                    : "text-[#466356] hover:bg-emerald-50/70 hover:text-[#0f241d]"
                }`}
              >
                {active && !pillStyle ? (
                  <span className="pointer-events-none absolute inset-0 rounded-xl bg-[#dff4e8] border border-[#b7e2ca]" />
                ) : null}

                <span className="relative z-10 flex items-center gap-3 min-w-0">
                  <span
                    className={`shrink-0 ${
                      active ? "text-[#059669]" : "text-[#6c877a]"
                    }`}
                  >
                    {item.icon}
                  </span>
                  <AnimatePresence initial={false}>
                    {isExpanded ? (
                      <motion.span
                        key="nav-label"
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -6 }}
                        transition={{ duration: 0.16 }}
                        className="truncate whitespace-nowrap"
                      >
                        {item.label}
                      </motion.span>
                    ) : null}
                  </AnimatePresence>
                </span>

                {isExpanded &&
                item.badge !== undefined &&
                Number(item.badge) > 0 ? (
                  <span className="relative z-10 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white">
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* User & Logout Footer */}
      <div className="mt-6 space-y-2 border-t border-[#dcece2] pt-3">
        <div
          className={`rounded-2xl bg-[#eef7f1] border border-[#d6e9dd] transition-all ${
            isExpanded ? "p-3" : "p-2 flex justify-center"
          }`}
          title={!isExpanded ? `${user.fullName} (@${user.username})` : undefined}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-600/15 text-[#0d4a38] font-display font-bold text-sm">
              {user.fullName.charAt(0).toUpperCase()}
            </div>
            {isExpanded ? (
              <div className="min-w-0 overflow-hidden whitespace-nowrap">
                <p className="truncate text-xs font-bold text-[#0f241d]">
                  {user.fullName}
                </p>
                <p className="truncate text-[11px] text-[#466356]">
                  @{user.username} · {getRoleLabel(user.role)}
                </p>
              </div>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={onLogout}
          disabled={loggingOut}
          title={!isExpanded ? "Sign Out" : undefined}
          className={`flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer ${
            isExpanded ? "px-3" : "px-2"
          }`}
        >
          <LogOut className="h-3.5 w-3.5 shrink-0" />
          {isExpanded ? (
            <span className="whitespace-nowrap">
              {loggingOut ? "Signing out..." : "Sign Out"}
            </span>
          ) : null}
        </button>
      </div>
    </div>
  );
}

export function PortalShell({
  children,
  navItems,
  user,
  hospital,
  headerActions,
}: {
  children: React.ReactNode;
  navItems: NavItem[];
  portalTitle?: string;
  portalSubtitle?: string;
  user: {
    username: string;
    fullName: string;
    role: string;
  };
  hospital?: {
    name: string;
    code: string;
    logoDataUrl?: string | null;
  } | null;
  headerActions?: React.ReactNode;
}) {
  const pathname = usePathname();
  const { toast } = useToast();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [clockLabel, setClockLabel] = useState<string | null>(null);
  const [maintenance, setMaintenance] = useState<MaintenanceState | null>(null);

  useEffect(() => {
    const updateClock = () => setClockLabel(formatAccurateDateTime(new Date()));
    const raf = window.requestAnimationFrame(updateClock);
    const interval = window.setInterval(updateClock, 30_000);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const checkMaintenance = () => {
      fetch("/api/maintenance/status", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: MaintenanceState | null) => {
          if (active && d) setMaintenance(d);
        })
        .catch(() => {});
    };
    checkMaintenance();
    const poll = window.setInterval(checkMaintenance, 15_000);
    const onFocus = () => checkMaintenance();
    const onRefreshEvent = () => checkMaintenance();
    window.addEventListener("focus", onFocus);
    window.addEventListener("verdant:maintenance-refresh", onRefreshEvent);
    return () => {
      active = false;
      window.clearInterval(poll);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("verdant:maintenance-refresh", onRefreshEvent);
    };
  }, []);

  // Desktop click-only collapsible sidebar state (never auto-opens on hover)
  const [collapsed, setCollapsed] = useState(false);

  const isDesktopExpanded = !collapsed;

  const handleToggleCollapse = () => {
    setCollapsed((prev) => !prev);
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      toast({ type: "info", title: "Signed out safely" });
      // Hard navigation guarantees complete Next.js client router cache & in-memory state wipe between logins
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/login";
    } catch {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/login";
    } finally {
      setLoggingOut(false);
    }
  };

  if (user.role !== ROLES.SUPER_ADMIN && maintenance?.active) {
    return (
      <MaintenanceScreen
        maintenance={maintenance}
        user={user}
        hospitalName={hospital?.name ?? null}
        onRecovered={() => window.location.reload()}
      />
    );
  }

  return (
    <div className="min-h-screen flex bg-nature-mesh">
      {/* Desktop Click-Only Collapsible Sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: isDesktopExpanded ? 280 : 76 }}
        transition={{ type: "spring", stiffness: 320, damping: 30, mass: 0.8 }}
        className="no-print hidden lg:block shrink-0 border-r border-[#d7e7dd] bg-white/85 backdrop-blur-xl sticky top-0 h-screen overflow-y-auto overflow-x-hidden z-40 shadow-sm"
      >
        <SidebarContent
          navItems={navItems}
          pathname={pathname}
          user={user}
          loggingOut={loggingOut}
          isExpanded={isDesktopExpanded}
          isPinnedCollapsed={collapsed}
          onToggleCollapse={handleToggleCollapse}
          onCloseMobile={() => setMobileOpen(false)}
          onLogout={handleLogout}
        />
      </motion.aside>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileOpen ? (
          <div className="no-print fixed inset-0 z-50 lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 bg-[#0a2e23]/40 backdrop-blur-sm"
            />
            <motion.aside
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: "spring", stiffness: 360, damping: 30 }}
              className="relative z-10 h-full w-72 bg-white shadow-2xl overflow-y-auto"
            >
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="absolute right-3 top-3 rounded-lg p-1.5 text-[#466356] hover:bg-emerald-50"
                aria-label="Close navigation"
              >
                <X className="h-5 w-5" />
              </button>
              <SidebarContent
                navItems={navItems}
                pathname={pathname}
                user={user}
                loggingOut={loggingOut}
                isExpanded={true}
                onCloseMobile={() => setMobileOpen(false)}
                onLogout={handleLogout}
              />
            </motion.aside>
          </div>
        ) : null}
      </AnimatePresence>

      {/* Main Content Column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 border-b border-[#d7e7dd] bg-white/75 backdrop-blur-xl">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="rounded-xl border border-[#cfe2d6] bg-white p-2 text-[#0d4a38] lg:hidden hover:bg-emerald-50"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="hidden sm:flex items-center gap-2 text-xs font-medium text-[#466356]">
                {hospital ? (
                  <>
                    <Building2 className="h-4 w-4 text-emerald-600" />
                    <span className="font-semibold text-[#0f241d]">
                      {hospital.name}
                    </span>
                    <span className="text-[#8aa698]">•</span>
                    <span className="font-mono-id text-[11px] bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded-md border border-emerald-200">
                      {hospital.code}
                    </span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    <span className="font-semibold text-[#0f241d]">
                      HospitalPro{" "}
                      <span className="font-normal text-[#5b796b]">
                        by Zeronnn Technologies
                      </span>
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              {user.role === ROLES.SUPER_ADMIN && maintenance?.active ? (
                <Link
                  href="/super-admin/maintenance"
                  className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-[11px] font-bold text-amber-900 hover:bg-amber-100 shadow-xs transition-colors"
                >
                  <Wrench className="h-3 w-3 text-amber-700" />
                  Maintenance Active
                </Link>
              ) : null}

              {clockLabel ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#d7e7dd] bg-white/95 px-3 py-1 font-mono-id text-[11px] font-medium text-[#314c40] shadow-xs">
                  <Clock className="h-3.5 w-3.5 text-emerald-600" />
                  {clockLabel}
                </span>
              ) : null}

              {headerActions}

              <span className="hidden md:inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50/80 px-3 py-1 text-xs font-semibold text-[#0d4a38]">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                {getRoleLabel(user.role)}
              </span>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
