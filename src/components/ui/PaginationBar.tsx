"use client";

import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BubblyButton } from "@/components/ui/MotionPrimitives";

export const DEFAULT_PAGE_SIZE = 100;

export function PaginationBar({
  totalItems,
  pageSize = DEFAULT_PAGE_SIZE,
  currentPage,
  onPageChange,
  itemLabel = "item(s)",
}: {
  totalItems: number;
  pageSize?: number;
  currentPage: number;
  onPageChange: (nextPage: number) => void;
  itemLabel?: string;
}) {
  if (totalItems <= 0) return null;

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#dcece2] bg-[#f8fcfa] px-4 py-3 text-xs">
      <span className="text-[#466356]">
        Showing{" "}
        <strong className="font-mono-id text-[#0f241d]">
          {startIndex + 1}–{endIndex}
        </strong>{" "}
        of{" "}
        <strong className="font-mono-id text-[#0f241d]">{totalItems}</strong>{" "}
        {itemLabel}
        {totalPages > 1 ? (
          <>
            {" "}
            · Page{" "}
            <strong className="font-mono-id text-[#0d4a38]">{safePage}</strong>{" "}
            of{" "}
            <strong className="font-mono-id text-[#0d4a38]">{totalPages}</strong>
          </>
        ) : null}
      </span>

      {totalPages > 1 ? (
        <div className="flex items-center gap-2">
          <BubblyButton
            type="button"
            variant="outline"
            disabled={safePage <= 1}
            onClick={() => {
              onPageChange(Math.max(1, safePage - 1));
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="px-3 py-1.5 text-xs"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Previous
          </BubblyButton>
          <BubblyButton
            type="button"
            variant="outline"
            disabled={safePage >= totalPages}
            onClick={() => {
              onPageChange(Math.min(totalPages, safePage + 1));
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="px-3 py-1.5 text-xs"
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" />
          </BubblyButton>
        </div>
      ) : null}
    </div>
  );
}
