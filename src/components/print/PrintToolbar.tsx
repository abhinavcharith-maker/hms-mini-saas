"use client";

import React from "react";
import { ArrowLeft, Printer } from "lucide-react";

export function PrintToolbar({
  title,
  backHref = "/hospital/op",
}: {
  title: string;
  backHref?: string;
}) {
  return (
    <div className="no-print sticky top-0 z-40 border-b border-[#cfe2d6] bg-white/95 backdrop-blur px-6 py-3">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <a
            href={backHref}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#cfe2d6] px-3 py-1.5 text-xs font-semibold text-[#0d4a38] hover:bg-emerald-50"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </a>
          <span className="font-display text-sm font-bold text-[#0f241d]">
            {title}
          </span>
        </div>

        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#0d4a38] to-[#059669] px-4 py-2 text-xs font-semibold text-white shadow cursor-pointer hover:opacity-95"
        >
          <Printer className="h-4 w-4" />
          Print A4 Document
        </button>
      </div>
    </div>
  );
}
