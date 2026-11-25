"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";

const MONTHS = [
  { num: 1, label: "Jan" },
  { num: 2, label: "Feb" },
  { num: 3, label: "Mar" },
  { num: 4, label: "Apr" },
  { num: 5, label: "May" },
  { num: 6, label: "Jun" },
  { num: 7, label: "Jul" },
  { num: 8, label: "Aug" },
  { num: 9, label: "Sep" },
  { num: 10, label: "Oct" },
  { num: 11, label: "Nov" },
  { num: 12, label: "Dec" },
];

export function ExpiryMonthYearInput({
  month,
  year,
  onChange,
  disabled = false,
  compact = false,
  monthInputRef,
  onEnterComplete,
}: {
  month: string; // "" or "01".."12" (or partial digits while typing)
  year: string; // "" or "2027" (or partial digits while typing)
  onChange: (next: { month: string; year: string }) => void;
  disabled?: boolean;
  compact?: boolean;
  monthInputRef?: React.RefObject<HTMLInputElement | null>;
  onEnterComplete?: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const currentYear = new Date().getFullYear();
  const parsedYearNum = Number.parseInt(year, 10);
  const [pickerYear, setPickerYear] = useState<number>(
    Number.isInteger(parsedYearNum) && parsedYearNum >= 2020 && parsedYearNum <= 2100
      ? parsedYearNum
      : currentYear + 1
  );

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const internalMonthRef = useRef<HTMLInputElement | null>(null);
  const yearRef = useRef<HTMLInputElement | null>(null);
  const resolvedMonthRef = monthInputRef ?? internalMonthRef;

  useEffect(() => {
    if (!pickerOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPickerOpen(false);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [pickerOpen]);

  const parsedMonthNum = Number.parseInt(month, 10);

  const handleMonthChange = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 2);
    if (digits.length === 2) {
      const n = Number.parseInt(digits, 10);
      const clamped = n < 1 ? "01" : n > 12 ? "12" : digits;
      onChange({ month: clamped, year });
      yearRef.current?.focus();
      yearRef.current?.select();
      return;
    }
    onChange({ month: digits, year });
  };

  const handleMonthBlur = () => {
    if (month.length === 1) {
      const n = Number.parseInt(month, 10);
      if (n >= 1 && n <= 9) {
        onChange({ month: `0${n}`, year });
      }
    }
  };

  const handleYearChange = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 4);
    onChange({ month, year: digits });
  };

  const handlePickMonth = (m: number) => {
    const mm = String(m).padStart(2, "0");
    onChange({ month: mm, year: String(pickerYear) });
    setPickerOpen(false);
  };

  const quickYears = [
    currentYear,
    currentYear + 1,
    currentYear + 2,
    currentYear + 3,
    currentYear + 4,
  ];

  return (
    <div ref={wrapRef} className="relative">
      <div
        className={`flex items-center justify-between rounded-xl border border-[#cfe2d6] bg-white transition-all focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-200/70 ${
          disabled ? "bg-[#f2f6f4] opacity-60" : ""
        } ${compact ? "px-2 py-1.5" : "px-3 py-2"}`}
      >
        <div className="flex items-center gap-1 font-mono-id font-semibold text-[#0f241d]">
          <input
            ref={resolvedMonthRef}
            type="text"
            inputMode="numeric"
            disabled={disabled}
            aria-label="Expiry month"
            maxLength={2}
            value={month}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={handleMonthBlur}
            onChange={(e) => handleMonthChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "/" || e.key === "-" || e.key === "ArrowRight") {
                e.preventDefault();
                yearRef.current?.focus();
                yearRef.current?.select();
              } else if (e.key === "Enter") {
                e.preventDefault();
                yearRef.current?.focus();
                yearRef.current?.select();
              }
            }}
            className={`${
              compact ? "w-7 text-xs" : "w-8 text-sm"
            } bg-transparent text-center font-mono-id font-bold text-[#0f241d] focus:outline-none`}
          />
          <span className="select-none font-mono-id text-sm font-extrabold text-emerald-700">
            /
          </span>
          <input
            ref={yearRef}
            type="text"
            inputMode="numeric"
            disabled={disabled}
            aria-label="Expiry year"
            maxLength={4}
            value={year}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => handleYearChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && year.length === 0) {
                resolvedMonthRef.current?.focus();
              } else if (e.key === "ArrowLeft" && e.currentTarget.selectionStart === 0) {
                resolvedMonthRef.current?.focus();
              } else if (e.key === "Enter" && onEnterComplete) {
                e.preventDefault();
                onEnterComplete();
              }
            }}
            className={`${
              compact ? "w-11 text-xs" : "w-14 text-sm"
            } bg-transparent text-center font-mono-id font-bold text-[#0f241d] focus:outline-none`}
          />
        </div>

        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            const y = Number.parseInt(year, 10);
            if (Number.isInteger(y) && y >= 2020 && y <= 2100) {
              setPickerYear(y);
            }
            setPickerOpen((o) => !o);
          }}
          aria-label="Open month and year selector"
          className="ml-1 inline-flex items-center justify-center rounded-lg p-1 text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer disabled:cursor-not-allowed"
        >
          <Calendar className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
        </button>
      </div>

      {/* Centered Month & Year Selection Modal Pop-up (Never clips or overflows below screen!) */}
      {typeof document !== "undefined"
        ? createPortal(
            <AnimatePresence>
              {pickerOpen ? (
                <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.14 }}
                    onClick={() => setPickerOpen(false)}
                    className="absolute inset-0 bg-[#0b231b]/45 backdrop-blur-[2px]"
                  />
                  <motion.div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Select Expiry Month and Year"
                    initial={{ opacity: 0, scale: 0.92, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.94, y: 8 }}
                    transition={{ type: "spring", stiffness: 420, damping: 30 }}
                    className="relative z-10 w-full max-w-xs rounded-3xl border border-[#cfe2d6] bg-white p-5 shadow-2xl shadow-emerald-950/25"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#eef7f1] text-[#0d4a38]">
                          <Calendar className="h-4 w-4" />
                        </span>
                        <div>
                          <h4 className="font-display text-sm font-extrabold text-[#0f241d]">
                            Select Expiry Date
                          </h4>
                          <p className="text-[11px] text-[#5b796b]">
                            Choose month &amp; year
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPickerOpen(false)}
                        aria-label="Close expiry picker"
                        className="rounded-xl p-1.5 text-[#5b796b] hover:bg-[#eef7f1] hover:text-[#0d4a38] cursor-pointer"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Year Stepper Bar */}
                    <div className="mb-3 flex items-center justify-between rounded-2xl bg-[#f2f9f5] px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setPickerYear((y) => Math.max(2020, y - 1))}
                        className="rounded-xl p-1.5 text-[#0d4a38] hover:bg-emerald-100 cursor-pointer"
                        aria-label="Previous year"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <span className="font-mono-id text-base font-extrabold text-[#0d4a38]">
                        {pickerYear}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPickerYear((y) => Math.min(2060, y + 1))}
                        className="rounded-xl p-1.5 text-[#0d4a38] hover:bg-emerald-100 cursor-pointer"
                        aria-label="Next year"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Quick Year Pills */}
                    <div className="mb-3 flex items-center justify-between gap-1.5">
                      {quickYears.map((qy) => (
                        <button
                          key={qy}
                          type="button"
                          onClick={() => setPickerYear(qy)}
                          className={`flex-1 rounded-xl py-1.5 font-mono-id text-[11px] font-bold transition-colors cursor-pointer ${
                            pickerYear === qy
                              ? "bg-[#0d4a38] text-white shadow-xs"
                              : "bg-[#f6fbf8] text-[#466356] hover:bg-emerald-100"
                          }`}
                        >
                          {qy}
                        </button>
                      ))}
                    </div>

                    {/* 12-Month Grid */}
                    <div className="grid grid-cols-4 gap-2">
                      {MONTHS.map((m) => {
                        const selected =
                          parsedMonthNum === m.num && parsedYearNum === pickerYear;
                        return (
                          <button
                            key={m.num}
                            type="button"
                            onClick={() => handlePickMonth(m.num)}
                            className={`rounded-xl py-2.5 text-xs font-bold transition-all cursor-pointer ${
                              selected
                                ? "bg-gradient-to-r from-[#0d4a38] to-[#059669] text-white shadow-sm"
                                : "bg-[#f8fcfa] text-[#0f241d] hover:bg-[#dff4e8] hover:text-[#0d4a38]"
                            }`}
                          >
                            {m.label}
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                </div>
              ) : null}
            </AnimatePresence>,
            document.body
          )
        : null}
    </div>
  );
}
