"use client";

import React, { createContext, useCallback, useContext, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, Info, X, XCircle } from "lucide-react";

type ToastType = "success" | "error" | "warning" | "info";

interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

interface ToastContextValue {
  toast: (item: Omit<ToastItem, "id">) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within AppProviders");
  }
  return ctx;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (item: Omit<ToastItem, "id">) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-4), { ...item, id }]);
      setTimeout(() => {
        dismiss(id);
      }, 4500);
    },
    [dismiss]
  );

  const iconFor = (type: ToastType) => {
    switch (type) {
      case "success":
        return <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />;
      case "error":
        return <XCircle className="h-5 w-5 text-rose-600 shrink-0" />;
      case "warning":
        return <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />;
      default:
        return <Info className="h-5 w-5 text-teal-600 shrink-0" />;
    }
  };

  const borderFor = (type: ToastType) => {
    switch (type) {
      case "success":
        return "border-emerald-200 bg-white/95";
      case "error":
        return "border-rose-200 bg-white/95";
      case "warning":
        return "border-amber-200 bg-white/95";
      default:
        return "border-teal-200 bg-white/95";
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <ToastContext.Provider value={{ toast }}>
        {children}
        <div
          aria-live="polite"
          className="no-print fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2.5 px-4 sm:px-0 pointer-events-none"
        >
          <AnimatePresence mode="popLayout">
            {toasts.map((item) => (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 24, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 40, scale: 0.92 }}
                transition={{ type: "spring", stiffness: 420, damping: 26 }}
                className={`pointer-events-auto flex items-start gap-3 rounded-2xl border p-3.5 shadow-xl shadow-emerald-950/10 backdrop-blur-md ${borderFor(
                  item.type
                )}`}
              >
                {iconFor(item.type)}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[#0f241d]">
                    {item.title}
                  </p>
                  {item.message ? (
                    <p className="mt-0.5 text-xs text-[#466356] leading-relaxed">
                      {item.message}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(item.id)}
                  className="rounded-lg p-1 text-[#6c877a] hover:bg-emerald-50 hover:text-[#0f241d] transition-colors"
                  aria-label="Close notification"
                >
                  <X className="h-4 w-4" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </ToastContext.Provider>
    </MotionConfig>
  );
}
