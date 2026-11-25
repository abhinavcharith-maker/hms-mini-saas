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
import {
  Activity,
  BarChart3,
  BedDouble,
  DatabaseBackup,
  Leaf,
  Lock,
  Pill,
  Printer,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

// ---------------------------------------------------------------------------
// 1. Calm Serene Botanical Ambient Glow (Zero Clutter, Zero Prisms/Dots)
// ---------------------------------------------------------------------------

export function SereneAmbientBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
    >
      <div
        className="absolute -left-28 -top-24 h-[460px] w-[460px] rounded-full opacity-55"
        style={{
          background:
            "radial-gradient(circle, rgba(167, 243, 208, 0.42) 0%, rgba(16, 185, 129, 0.08) 48%, transparent 72%)",
        }}
      />
      <div
        className="absolute -right-24 top-20 h-[500px] w-[500px] rounded-full opacity-50"
        style={{
          background:
            "radial-gradient(circle, rgba(153, 246, 228, 0.36) 0%, rgba(20, 184, 166, 0.07) 50%, transparent 72%)",
        }}
      />
      <div
        className="absolute bottom-[-140px] left-1/3 h-[440px] w-[560px] rounded-full opacity-45"
        style={{
          background:
            "radial-gradient(circle, rgba(209, 250, 229, 0.48) 0%, rgba(5, 150, 105, 0.06) 52%, transparent 74%)",
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. Interactive Floating & Gently Swaying 3D Window Card
// ---------------------------------------------------------------------------

export interface FloatMotionConfig {
  amplitudeY?: number;
  wobbleRotate?: number;
  wobbleTiltX?: number;
  wobbleTiltY?: number;
  duration?: number;
  phaseDelay?: number;
}

export function Tilt3DCard({
  children,
  className = "",
  delay = 0,
  maxTilt = 7,
  disabled = false,
  ambientFloat,
  windowChrome = false,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  maxTilt?: number;
  disabled?: boolean;
  ambientFloat?: FloatMotionConfig;
  windowChrome?: boolean;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const [isHovered, setIsHovered] = useState(false);

  const rawRotateX = useMotionValue(0);
  const rawRotateY = useMotionValue(0);
  const rawGlareX = useMotionValue(50);
  const rawGlareY = useMotionValue(50);
  const rawGlareOpacity = useMotionValue(0);

  const rotateX = useSpring(rawRotateX, { stiffness: 200, damping: 24, mass: 0.65 });
  const rotateY = useSpring(rawRotateY, { stiffness: 200, damping: 24, mass: 0.65 });
  const glareX = useSpring(rawGlareX, { stiffness: 240, damping: 28 });
  const glareY = useSpring(rawGlareY, { stiffness: 240, damping: 28 });
  const glareOpacity = useSpring(rawGlareOpacity, { stiffness: 210, damping: 28 });

  useEffect(() => {
    if (disabled) {
      rawRotateX.set(0);
      rawRotateY.set(0);
      rawGlareOpacity.set(0);
    }
  }, [disabled, rawRotateX, rawRotateY, rawGlareOpacity]);

  const glareBg = useMotionTemplate`radial-gradient(380px circle at ${glareX}% ${glareY}%, rgba(255, 255, 255, 0.68), rgba(167, 243, 208, 0.22) 42%, transparent 72%)`;

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (disabled || !cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / Math.max(1, rect.width);
    const py = (e.clientY - rect.top) / Math.max(1, rect.height);
    rawRotateY.set((px - 0.5) * maxTilt * 2);
    rawRotateX.set((0.5 - py) * maxTilt * 2);
    rawGlareX.set(px * 100);
    rawGlareY.set(py * 100);
    rawGlareOpacity.set(1);
  };

  const handleMouseEnter = () => {
    if (!disabled) setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    rawRotateX.set(0);
    rawRotateY.set(0);
    rawGlareOpacity.set(0);
  };

  const ampY = ambientFloat?.amplitudeY ?? 6;
  const wobZ = ambientFloat?.wobbleRotate ?? 0.55;
  const floatDur = ambientFloat?.duration ?? 6.2;
  const phaseDelay = ambientFloat?.phaseDelay ?? 0;

  const shouldFloat =
    Boolean(ambientFloat) && !prefersReducedMotion && !disabled && !isHovered;

  const floatCssVars = {
    "--hp-float-y": `${ampY}px`,
    "--hp-float-rot": `${wobZ}deg`,
    "--hp-float-dur": `${floatDur}s`,
    "--hp-float-delay": `${phaseDelay}s`,
    animationPlayState: shouldFloat ? "running" : "paused",
  } as React.CSSProperties;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1], delay }}
      style={{ perspective: 1000 }}
      className="h-full"
    >
      {/* Pure GPU-composited floating sway layer (zero preserve-3d BSP scroll stutter) */}
      <div
        style={floatCssVars}
        className={`h-full ${
          ambientFloat && !prefersReducedMotion ? "hospitalpro-card-float" : ""
        }`}
      >
        {/* Interactive cursor-tracked 3D tilt floating glass window */}
        <motion.div
          ref={cardRef}
          onMouseEnter={handleMouseEnter}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          style={{
            rotateX,
            rotateY,
            backfaceVisibility: "hidden",
          }}
          className={`relative h-full rounded-2xl border border-[#cde4d6]/95 bg-gradient-to-b from-white via-white to-[#f3fbf6] shadow-[0_8px_22px_-10px_rgba(13,74,56,0.12),inset_0_1px_0_rgba(255,255,255,0.98)] transition-shadow duration-300 hover:shadow-[0_18px_36px_-14px_rgba(13,74,56,0.20)] hover:border-emerald-300/95 ${className}`}
        >
          {/* Optional subtle floating-window top accent strip */}
          {windowChrome ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-4 top-2.5 flex items-center gap-1 opacity-45"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/70" />
              <span className="h-1.5 w-1.5 rounded-full bg-teal-400/70" />
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300/80" />
            </div>
          ) : null}

          {/* Dynamic cursor-tracked specular glass sheen */}
          <motion.div
            aria-hidden="true"
            style={{
              background: glareBg,
              opacity: glareOpacity,
            }}
            className="pointer-events-none absolute inset-0 rounded-2xl overflow-hidden z-0"
          />

          <div className="relative z-10 h-full flex flex-col justify-between">
            {children}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// 3. Interactive 3D Circular HospitalPro Orbital Dial (Hero Centerpiece)
// ---------------------------------------------------------------------------

export function Hero3DEcosystem() {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const [dialHovered, setDialHovered] = useState(false);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [pinnedIdx, setPinnedIdx] = useState<number | null>(null);

  const rawRx = useMotionValue(5);
  const rawRy = useMotionValue(-6);
  const rx = useSpring(rawRx, { stiffness: 145, damping: 22 });
  const ry = useSpring(rawRy, { stiffness: 145, damping: 22 });

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / Math.max(1, rect.width) - 0.5;
    const ny = (e.clientY - rect.top) / Math.max(1, rect.height) - 0.5;
    rawRy.set(nx * 16);
    rawRx.set(-ny * 14);
  };

  const handleEnter = () => {
    setDialHovered(true);
  };

  const handleLeave = () => {
    rawRx.set(5);
    rawRy.set(-6);
    setDialHovered(false);
    setHoveredIdx(null);
  };

  const orbitalNodes = [
    {
      short: "UHID",
      label: "UHID Timeline",
      sub: "OP · IP · Receipts",
      icon: <Activity className="h-4 w-4" />,
      accent: "from-[#0d4a38] to-[#059669]",
    },
    {
      short: "Beds",
      label: "IP Bed Matrix",
      sub: "Zero Double-Book",
      icon: <BedDouble className="h-4 w-4" />,
      accent: "from-[#0f766e] to-[#14b8a6]",
    },
    {
      short: "Rx/Lab",
      label: "Rx & Diagnostics",
      sub: "Pharmacy & Lab",
      icon: <Pill className="h-4 w-4" />,
      accent: "from-[#047857] to-[#10b981]",
    },
    {
      short: "Print",
      label: "A4 Print Ready",
      sub: "Consult & Bills",
      icon: <Printer className="h-4 w-4" />,
      accent: "from-[#135a45] to-[#059669]",
    },
    {
      short: "Reports",
      label: "Live Analytics",
      sub: "OP · IP · Audits",
      icon: <BarChart3 className="h-4 w-4" />,
      accent: "from-[#0f5132] to-[#10b981]",
    },
    {
      short: "Vault",
      label: "Snapshot Vault",
      sub: "Full JSON Backup",
      icon: <DatabaseBackup className="h-4 w-4" />,
      accent: "from-[#0a2e23] to-[#0d4a38]",
    },
  ];

  const activeIdx = hoveredIdx ?? pinnedIdx;
  const activeNode = activeIdx !== null ? orbitalNodes[activeIdx] : null;
  // Pause smoothly as soon as pointer enters the dial so hovering individual icons never jitters or blinks
  const orbitPaused =
    Boolean(prefersReducedMotion) || dialHovered || activeIdx !== null;
  const orbitRadius = 138;

  return (
    <div
      ref={stageRef}
      onMouseEnter={handleEnter}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      style={{ perspective: 1100 }}
      className="relative mx-auto flex h-[356px] w-full max-w-[420px] items-center justify-center select-none"
    >
      {/* Calm soft radial halo behind the circular dial */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute h-80 w-80 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(167, 243, 208, 0.48) 0%, rgba(20, 184, 166, 0.14) 50%, transparent 72%)",
        }}
      />

      <motion.div
        style={{
          rotateX: rx,
          rotateY: ry,
          backfaceVisibility: "hidden",
        }}
        className="relative flex h-[340px] w-[340px] scale-[0.88] sm:scale-100 items-center justify-center"
      >
        {/* Outer Frosted Circular Glass Disc Plate */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute z-0 h-[312px] w-[312px] rounded-full border border-[#cde4d6]/90 bg-gradient-to-b from-white/75 via-[#f2faf6]/65 to-emerald-50/70 shadow-[0_16px_40px_-18px_rgba(13,74,56,0.16)]"
        />

        {/* Secondary Precision Dashed Compass Ring */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute z-0 h-[276px] w-[276px]"
        >
          <div
            style={{ animationPlayState: orbitPaused ? "paused" : "running" }}
            className="hospitalpro-orbit-ccw h-full w-full rounded-full border border-dashed border-emerald-500/35"
          />
        </div>

        {/* Inner Luminous Emerald Halo Ring */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute z-10 h-[196px] w-[196px] rounded-full border border-emerald-300/60 bg-white/45 shadow-[inset_0_0_20px_rgba(16,185,129,0.09)]"
        />

        {/* Revolving Circular Orbit Track Holding 6 Upright Satellite Orbs */}
        <div className="absolute inset-0 z-20">
          <div
            style={{
              animationPlayState: orbitPaused ? "paused" : "running",
            }}
            className="hospitalpro-orbit-cw relative h-full w-full"
          >
            {orbitalNodes.map((node, idx) => {
              const angleRad = ((idx * 60 - 90) * Math.PI) / 180;
              const x = Math.round(Math.cos(angleRad) * orbitRadius * 100) / 100;
              const y = Math.round(Math.sin(angleRad) * orbitRadius * 100) / 100;
              const isSelected = activeIdx === idx;

              return (
                <div
                  key={node.label}
                  style={{
                    left: `calc(50% + ${x}px)`,
                    top: `calc(50% + ${y}px)`,
                    transform: "translate(-50%, -50%)",
                  }}
                  className="absolute"
                >
                  {/* Counter-rotating wrapper keeps every circular orb 100% upright */}
                  <div
                    style={{
                      animationPlayState: orbitPaused ? "paused" : "running",
                    }}
                    className="hospitalpro-orbit-ccw"
                  >
                    <button
                      type="button"
                      onMouseEnter={() => setHoveredIdx(idx)}
                      onMouseLeave={() => setHoveredIdx(null)}
                      onClick={() =>
                        setPinnedIdx((prev) => (prev === idx ? null : idx))
                      }
                      style={{ backfaceVisibility: "hidden" }}
                      title={`${node.label} — ${node.sub}`}
                      aria-label={`${node.label}: ${node.sub}`}
                      className={`group flex h-[62px] w-[62px] flex-col items-center justify-center rounded-full border transition-transform duration-200 ease-out cursor-pointer ${
                        isSelected
                          ? "scale-110 border-emerald-400 bg-white shadow-[0_12px_26px_-8px_rgba(5,150,105,0.38)] ring-4 ring-emerald-200/70"
                          : "scale-100 border-[#cde4d6] bg-white/95 shadow-[0_8px_18px_-8px_rgba(13,74,56,0.20)] hover:scale-110 hover:border-emerald-400"
                      }`}
                    >
                      <span
                        className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors duration-200 ${
                          isSelected
                            ? `bg-gradient-to-br ${node.accent} text-white shadow-xs`
                            : "bg-emerald-50 text-[#0d4a38] group-hover:bg-emerald-100"
                        }`}
                      >
                        {node.icon}
                      </span>
                      <span className="mt-0.5 font-display text-[9px] font-bold tracking-tight text-[#0f241d]">
                        {node.short}
                      </span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Central Elevated Circular 3D HospitalPro Medallion */}
        <div className="relative z-30">
          <button
            type="button"
            onClick={() => setPinnedIdx(null)}
            style={
              {
                "--hp-float-y": "4px",
                "--hp-float-rot": "0deg",
                "--hp-float-dur": "5s",
                backfaceVisibility: "hidden",
              } as React.CSSProperties
            }
            aria-label="HospitalPro circular hub"
            className="hospitalpro-card-float relative flex h-[152px] w-[152px] flex-col items-center justify-center rounded-full border-2 border-emerald-200/95 bg-gradient-to-b from-white via-white to-[#e8f8ef] p-3 text-center shadow-[0_18px_38px_-14px_rgba(13,74,56,0.26),inset_0_2px_4px_rgba(255,255,255,1)] transition-transform duration-200 hover:scale-105 cursor-pointer"
          >
            {/* Subtle inner circular ring */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-1.5 rounded-full border border-emerald-100"
            />

            <AnimatePresence mode="wait">
              {activeNode ? (
                <motion.div
                  key={activeNode.label}
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.92 }}
                  transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                  className="relative z-10 flex flex-col items-center"
                >
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br ${activeNode.accent} text-white shadow-md shadow-emerald-900/25`}
                  >
                    {activeNode.icon}
                  </div>
                  <span className="mt-2 font-display text-xs font-extrabold leading-tight text-[#0f241d]">
                    {activeNode.label}
                  </span>
                  <span className="mt-0.5 text-[10px] font-semibold text-emerald-700">
                    {activeNode.sub}
                  </span>
                </motion.div>
              ) : (
                <motion.div
                  key="hospitalpro-core"
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.92 }}
                  transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                  className="relative z-10 flex flex-col items-center"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#0d4a38] via-[#059669] to-[#14b8a6] text-white shadow-lg shadow-emerald-900/25">
                    <Leaf className="h-6 w-6" />
                  </div>
                  <span className="mt-2 font-display text-sm font-extrabold tracking-tight text-[#0f241d]">
                    HospitalPro
                  </span>
                  <span className="text-[9.5px] font-medium text-[#5b796b]">
                    by Zeronnn
                  </span>
                  <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[8.5px] font-bold text-emerald-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    5 Portals
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. Interactive 3D Floating Portal Window Totem (Portal Login Page Left)
// ---------------------------------------------------------------------------

export function Portal3DTotem({
  portalKey,
  label,
  description,
  icon,
}: {
  portalKey: string;
  label: string;
  description: string;
  icon: React.ReactNode;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const [hovered, setHovered] = useState(false);

  const rawRx = useMotionValue(5);
  const rawRy = useMotionValue(7);
  const rx = useSpring(rawRx, { stiffness: 165, damping: 22 });
  const ry = useSpring(rawRy, { stiffness: 165, damping: 22 });

  const accentByPortal: Record<string, string> = {
    "hospital-admin": "from-[#0d4a38] to-[#059669]",
    receptionist: "from-[#135a45] to-[#10b981]",
    pharmacy: "from-[#047857] to-[#34d399]",
    laboratory: "from-[#0f766e] to-[#14b8a6]",
    "super-admin": "from-[#0a2e23] to-[#0d4a38]",
  };
  const accent = accentByPortal[portalKey] ?? "from-[#0d4a38] to-[#059669]";

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!boxRef.current) return;
    const rect = boxRef.current.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / Math.max(1, rect.width) - 0.5;
    const ny = (e.clientY - rect.top) / Math.max(1, rect.height) - 0.5;
    rawRy.set(nx * 18);
    rawRx.set(-ny * 15);
  };

  const handleLeave = () => {
    setHovered(false);
    rawRx.set(5);
    rawRy.set(7);
  };

  return (
    <div
      ref={boxRef}
      onMouseEnter={() => setHovered(true)}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      style={{ perspective: 1150 }}
      className="relative flex flex-col items-center justify-center p-4"
    >
      <motion.div
        animate={
          prefersReducedMotion || hovered
            ? { y: 0, rotateZ: 0 }
            : { y: [0, -7, 0, -3, 0], rotateZ: [0, -0.6, 0, 0.5, 0] }
        }
        transition={
          prefersReducedMotion || hovered
            ? { type: "spring", stiffness: 220, damping: 24 }
            : { duration: 6.4, repeat: Infinity, ease: "easeInOut" }
        }
        style={{ transformStyle: "preserve-3d" }}
        className="w-full max-w-sm"
      >
        <motion.div
          style={{
            rotateX: rx,
            rotateY: ry,
            transformStyle: "preserve-3d",
          }}
          className="relative w-full rounded-3xl border border-[#cde4d6] bg-gradient-to-b from-white/96 via-white/92 to-[#f2faf6]/94 p-7 shadow-[0_26px_54px_-18px_rgba(13,74,56,0.22)]"
        >
          {/* Floating Stacked Depth Window Behind Card */}
          <div
            aria-hidden="true"
            style={{ transform: "translateZ(-20px) translateY(10px) scale(0.95)" }}
            className="pointer-events-none absolute inset-0 rounded-3xl border border-emerald-200/70 bg-emerald-50/55"
          />

          {/* Floating Window Header Strip */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500/75" />
              <span className="h-2 w-2 rounded-full bg-teal-400/75" />
              <span className="h-2 w-2 rounded-full bg-emerald-300/85" />
            </div>
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-[#0d4a38]">
              <Lock className="h-2.5 w-2.5 text-emerald-600" />
              Encrypted Gateway
            </span>
          </div>

          {/* Animated 3D Portal Emblem Core */}
          <div
            style={{ transformStyle: "preserve-3d" }}
            className="relative mx-auto flex h-36 w-36 items-center justify-center"
          >
            <div
              style={{
                transform: "rotateX(65deg) translateZ(-8px)",
                transformStyle: "preserve-3d",
              }}
              className="pointer-events-none absolute h-36 w-36"
            >
              <motion.div
                animate={prefersReducedMotion ? undefined : { rotate: 360 }}
                transition={{ duration: 24, repeat: Infinity, ease: "linear" }}
                className="h-full w-full rounded-full border border-dashed border-emerald-500/40"
              />
            </div>

            <div
              style={{
                transform: "translateZ(40px)",
                transformStyle: "preserve-3d",
              }}
              className="relative"
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={portalKey}
                  initial={{ opacity: 0, rotateY: -75, scale: 0.82 }}
                  animate={{
                    opacity: 1,
                    rotateY: 0,
                    scale: hovered ? 1.05 : 1,
                  }}
                  exit={{ opacity: 0, rotateY: 75, scale: 0.82 }}
                  transition={{ type: "spring", stiffness: 280, damping: 22 }}
                  className={`flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br ${accent} text-white shadow-[0_18px_32px_-8px_rgba(13,74,56,0.42)]`}
                >
                  {icon}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* Portal Details Switching Smoothly in 3D */}
          <div
            style={{
              transform: "translateZ(26px)",
              transformStyle: "preserve-3d",
            }}
            className="mt-4 text-center"
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={portalKey}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              >
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50/90 px-3 py-1 text-[11px] font-semibold text-[#0d4a38]">
                  <Sparkles className="h-3 w-3 text-emerald-600" />
                  Active Gateway
                </span>
                <h2 className="mt-3 font-display text-xl font-extrabold text-[#0f241d]">
                  {label}
                </h2>
                <p className="mt-2 text-xs leading-relaxed text-[#466356]">
                  {description}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Floating Mini Security Pills */}
          <div
            style={{ transform: "translateZ(18px)" }}
            className="mt-6 grid grid-cols-2 gap-2 border-t border-[#dcece2] pt-4 text-[11px]"
          >
            <div className="flex items-center gap-2 rounded-xl bg-[#f4faf6] border border-[#dcece2] px-2.5 py-2 text-[#314c40]">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
              <span className="font-semibold">Role Isolated</span>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-[#f4faf6] border border-[#dcece2] px-2.5 py-2 text-[#314c40]">
              <Activity className="h-3.5 w-3.5 shrink-0 text-teal-600" />
              <span className="font-semibold">Audit Logged</span>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
