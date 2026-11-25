"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "framer-motion";
import { X } from "lucide-react";

export function SpringCard({
  children,
  className = "",
  delay = 0,
  hoverLift = false,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  hoverLift?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        type: "spring",
        stiffness: 320,
        damping: 26,
        delay,
      }}
      whileHover={
        hoverLift
          ? {
              y: -3,
              transition: { type: "spring", stiffness: 380, damping: 22 },
            }
          : undefined
      }
      className={`glass-surface rounded-2xl ${className}`}
    >
      {children}
    </motion.div>
  );
}

export function BubblyButton({
  children,
  className = "",
  variant = "primary",
  type = "button",
  disabled = false,
  onClick,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  variant?: "primary" | "secondary" | "outline" | "danger" | "ghost";
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  const variantClasses: Record<string, string> = {
    primary:
      "bg-gradient-to-r from-[#0d4a38] to-[#059669] text-white shadow-md shadow-emerald-900/15 hover:shadow-lg hover:shadow-emerald-900/20",
    secondary:
      "bg-[#e6f5ec] text-[#0d4a38] border border-[#c5e4d2] hover:bg-[#d8efe2]",
    outline:
      "bg-white text-[#0f241d] border border-[#cfe2d6] hover:border-emerald-400 hover:bg-emerald-50/40",
    danger:
      "bg-rose-600 text-white shadow-md shadow-rose-900/15 hover:bg-rose-700",
    ghost: "text-[#466356] hover:bg-emerald-50 hover:text-[#0d4a38]",
  };

  return (
    <motion.button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      whileHover={disabled ? undefined : { scale: 1.02 }}
      whileTap={disabled ? undefined : { scale: 0.96 }}
      transition={{ type: "spring", stiffness: 460, damping: 22 }}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses[variant]} ${className}`}
    >
      {children}
    </motion.button>
  );
}

export function AnimatedModal({
  open,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = "max-w-xl",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-[#0a2e23]/35 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 10 }}
            transition={{ type: "spring", stiffness: 360, damping: 26 }}
            className={`relative z-10 w-full ${maxWidth} max-h-[90vh] overflow-y-auto rounded-3xl border border-[#cfe2d6] bg-white p-6 shadow-2xl shadow-emerald-950/20`}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="font-display text-lg font-bold text-[#0f241d]">
                  {title}
                </h3>
                {subtitle ? (
                  <p className="mt-0.5 text-sm text-[#466356]">{subtitle}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl p-1.5 text-[#6c877a] hover:bg-emerald-50 hover:text-[#0f241d] transition-colors cursor-pointer"
                aria-label="Close modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {children}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

export function FloatingOrb({
  className = "",
  duration = 9,
}: {
  className?: string;
  duration?: number;
}) {
  return (
    <motion.div
      aria-hidden="true"
      animate={{
        y: [0, -14, 4, 0],
        x: [0, 8, -6, 0],
        scale: [1, 1.04, 0.98, 1],
      }}
      transition={{
        duration,
        repeat: Infinity,
        ease: "easeInOut",
      }}
      className={`pointer-events-none absolute rounded-full blur-3xl ${className}`}
    />
  );
}

export function StatusBadge({
  status,
  label,
}: {
  status: string;
  label?: string;
}) {
  const s = status.toUpperCase();
  let cls = "bg-slate-100 text-slate-700 border-slate-200";
  if (
    s === "ACTIVE" ||
    s === "AVAILABLE" ||
    s === "COMPLETED" ||
    s === "PAID" ||
    s === "TRUE"
  ) {
    cls = "bg-emerald-50 text-emerald-700 border-emerald-200";
  } else if (s === "PENDING" || s === "OCCUPIED" || s === "ADMITTED") {
    cls = "bg-amber-50 text-amber-700 border-amber-200";
  } else if (
    s === "INACTIVE" ||
    s === "DEACTIVATED" ||
    s === "CANCELLED" ||
    s === "FALSE"
  ) {
    cls = "bg-rose-50 text-rose-700 border-rose-200";
  } else if (s === "DISCHARGED" || s === "NO_CHARGE") {
    cls = "bg-teal-50 text-teal-700 border-teal-200";
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label ?? status.replace(/_/g, " ")}
    </span>
  );
}

function AnimatedStatNumber({
  value,
}: {
  value: string | number;
}) {
  const prefersReducedMotion = useReducedMotion();
  const isNumeric = typeof value === "number" && Number.isFinite(value);
  const [displayed, setDisplayed] = useState<number>(isNumeric ? 0 : 0);
  const prevRef = useRef<number>(0);

  useEffect(() => {
    if (!isNumeric) return;
    if (prefersReducedMotion) {
      prevRef.current = value;
      return;
    }

    const from = prevRef.current;
    const to = value;
    if (from === to) {
      const rafSync = window.requestAnimationFrame(() => setDisplayed(to));
      return () => window.cancelAnimationFrame(rafSync);
    }

    const duration = 680;
    const start = performance.now();
    let rafId = 0;

    const tick = (now: number) => {
      const elapsed = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - elapsed, 3);
      const current = Math.round(from + (to - from) * eased);
      setDisplayed(current);
      if (elapsed < 1) {
        rafId = window.requestAnimationFrame(tick);
      } else {
        prevRef.current = to;
      }
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [isNumeric, value, prefersReducedMotion]);

  if (!isNumeric) {
    return <>{value}</>;
  }
  const shown = prefersReducedMotion ? value : displayed;
  return <>{shown.toLocaleString()}</>;
}

export function StatCard({
  title,
  value,
  subtitle,
  icon,
  tone = "emerald",
  delay = 0,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  tone?: "emerald" | "forest" | "amber" | "teal" | "rose";
  delay?: number;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const [hovered, setHovered] = useState(false);

  const rawRx = useMotionValue(0);
  const rawRy = useMotionValue(0);
  const rawGx = useMotionValue(50);
  const rawGy = useMotionValue(50);
  const rawGlare = useMotionValue(0);

  const rotateX = useSpring(rawRx, { stiffness: 230, damping: 24 });
  const rotateY = useSpring(rawRy, { stiffness: 230, damping: 24 });
  const gx = useSpring(rawGx, { stiffness: 250, damping: 28 });
  const gy = useSpring(rawGy, { stiffness: 250, damping: 28 });
  const glareOpacity = useSpring(rawGlare, { stiffness: 220, damping: 28 });

  const glareBg = useMotionTemplate`radial-gradient(280px circle at ${gx}% ${gy}%, rgba(255, 255, 255, 0.72), rgba(167, 243, 208, 0.18) 45%, transparent 72%)`;

  const toneStyles: Record<
    string,
    {
      iconBg: string;
      topBar: string;
      glow: string;
      hoverBorder: string;
    }
  > = {
    emerald: {
      iconBg: "bg-emerald-100/90 text-emerald-700 border-emerald-200/80",
      topBar: "from-[#059669] via-[#10b981] to-[#34d399]",
      glow: "bg-emerald-300/20",
      hoverBorder: "hover:border-emerald-300",
    },
    forest: {
      iconBg: "bg-[#dff2e7] text-[#0d4a38] border-[#bde2cc]",
      topBar: "from-[#0a2e23] via-[#0d4a38] to-[#059669]",
      glow: "bg-emerald-400/18",
      hoverBorder: "hover:border-emerald-400",
    },
    amber: {
      iconBg: "bg-amber-100/90 text-amber-700 border-amber-200/80",
      topBar: "from-amber-500 via-amber-400 to-emerald-400",
      glow: "bg-amber-300/20",
      hoverBorder: "hover:border-amber-300",
    },
    teal: {
      iconBg: "bg-teal-100/90 text-teal-700 border-teal-200/80",
      topBar: "from-[#0f766e] via-[#14b8a6] to-[#5eead4]",
      glow: "bg-teal-300/20",
      hoverBorder: "hover:border-teal-300",
    },
    rose: {
      iconBg: "bg-rose-100/90 text-rose-700 border-rose-200/80",
      topBar: "from-rose-600 via-rose-500 to-amber-400",
      glow: "bg-rose-300/20",
      hoverBorder: "hover:border-rose-300",
    },
  };

  const styles = toneStyles[tone] ?? toneStyles.emerald;

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (prefersReducedMotion || !cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / Math.max(1, rect.width);
    const py = (e.clientY - rect.top) / Math.max(1, rect.height);
    rawRy.set((px - 0.5) * 9);
    rawRx.set((0.5 - py) * 9);
    rawGx.set(px * 100);
    rawGy.set(py * 100);
    rawGlare.set(1);
  };

  const handleMouseLeave = () => {
    setHovered(false);
    rawRx.set(0);
    rawRy.set(0);
    rawGlare.set(0);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 290, damping: 24, delay }}
      style={{ perspective: 1000 }}
      className="h-full"
    >
      <motion.div
        ref={cardRef}
        onMouseEnter={() => setHovered(true)}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          rotateX: prefersReducedMotion ? 0 : rotateX,
          rotateY: prefersReducedMotion ? 0 : rotateY,
          backfaceVisibility: "hidden",
        }}
        whileHover={prefersReducedMotion ? undefined : { y: -4 }}
        className={`group relative h-full overflow-hidden rounded-2xl border border-[#cde4d6]/95 bg-gradient-to-b from-white via-white to-[#f4fbf7] p-5 shadow-[0_10px_28px_-12px_rgba(15,76,58,0.12),inset_0_1px_0_rgba(255,255,255,0.95)] transition-shadow duration-300 hover:shadow-[0_20px_40px_-14px_rgba(13,74,56,0.22)] ${styles.hoverBorder}`}
      >
        {/* Animated top gradient accent bar */}
        <motion.div
          aria-hidden="true"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{
            duration: 0.55,
            delay: delay + 0.06,
            ease: [0.22, 1, 0.36, 1],
          }}
          style={{ transformOrigin: "left center" }}
          className={`pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${styles.topBar}`}
        />

        {/* Subtle ambient corner aura expanding gently on hover */}
        <motion.div
          aria-hidden="true"
          animate={
            hovered
              ? { scale: 1.35, opacity: 0.9 }
              : { scale: 1, opacity: 0.45 }
          }
          transition={{ duration: 0.35, ease: "easeOut" }}
          className={`pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl ${styles.glow}`}
        />

        {/* Cursor-following specular highlight */}
        <motion.div
          aria-hidden="true"
          style={{ background: glareBg, opacity: glareOpacity }}
          className="pointer-events-none absolute inset-0 rounded-2xl"
        />

        <div className="relative z-10 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#5b796b]">
              {title}
            </p>
            <motion.p
              initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: delay + 0.08 }}
              className="mt-2 font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[#0f241d] break-words tabular-nums"
            >
              <AnimatedStatNumber value={value} />
            </motion.p>
            {subtitle ? (
              <p className="mt-1 text-xs text-[#466356] leading-relaxed">
                {subtitle}
              </p>
            ) : null}
          </div>

          <motion.div
            animate={
              prefersReducedMotion
                ? undefined
                : hovered
                  ? { scale: 1.1, rotate: -6, y: -2 }
                  : { y: [0, -2.5, 0], rotate: 0, scale: 1 }
            }
            transition={
              hovered
                ? { type: "spring", stiffness: 360, damping: 18 }
                : { duration: 4.2, repeat: Infinity, ease: "easeInOut", delay: delay * 3 }
            }
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border shadow-xs ${styles.iconBg}`}
          >
            {icon}
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function SkeletonBox({ className = "h-24 w-full" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-2xl bg-gradient-to-r from-[#e6f3eb] via-[#f1f9f4] to-[#e6f3eb] ${className}`}
    />
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#c7dfd0] bg-white/60 px-6 py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
        {icon}
      </div>
      <p className="font-display text-base font-bold text-[#0f241d]">{title}</p>
      <p className="mt-1 max-w-md text-sm text-[#466356]">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
