export function formatExpiryMonthYear(month: number, year: number): string {
  const mm = String(Math.max(1, Math.min(12, Math.trunc(month)))).padStart(2, "0");
  return `${mm}/${year}`;
}

export function formatSortableExpiryKey(month: number, year: number): string {
  const mm = String(Math.max(1, Math.min(12, Math.trunc(month)))).padStart(2, "0");
  return `${year}-${mm}`;
}

/**
 * Parses "MM/YYYY", "M/YYYY", "MM-YYYY", or "YYYY-MM" into { month, year }.
 */
export function parseMonthYearInput(
  raw: string
): { month: number; year: number } | null {
  const cleaned = raw.trim().replace(/\s+/g, "");
  if (!cleaned) return null;

  // YYYY-MM or YYYY-MM-DD (from <input type="month" /> or <input type="date" />)
  const isoMatch = cleaned.match(/^(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    if (month >= 1 && month <= 12 && year >= 2000 && year <= 2150) {
      return { month, year };
    }
    return null;
  }

  // MM/YYYY or MM-YYYY
  const myMatch = cleaned.match(/^(\d{1,2})[/-](\d{4})$/);
  if (myMatch) {
    const month = Number(myMatch[1]);
    const year = Number(myMatch[2]);
    if (month >= 1 && month <= 12 && year >= 2000 && year <= 2150) {
      return { month, year };
    }
    return null;
  }

  // MM/YY
  const shortMatch = cleaned.match(/^(\d{1,2})[/-](\d{2})$/);
  if (shortMatch) {
    const month = Number(shortMatch[1]);
    const year = 2000 + Number(shortMatch[2]);
    if (month >= 1 && month <= 12) {
      return { month, year };
    }
  }

  return null;
}

export type ExpiryBucket = "EXPIRED" | "MONTH_1" | "MONTH_2" | "MONTH_3" | "SAFE";

/**
 * Calendar-month 3-month expiry evaluation:
 * - A batch with expiry MM/YYYY is valid through the last day of that month
 *   (e.g., April 2027 -> April 30, 2027 23:59:59.999) and EXPIRED after that.
 * - Expiring Soon triggers on the 1st day of the 3-month window ending in the expiry month:
 *   e.g. April expiry (month=4) triggers starting February 1 (month=2):
 *   monthDiff === 0 -> MONTH_1 (Expiring this month, e.g. April)
 *   monthDiff === 1 -> MONTH_2 (Expiring next month, e.g. March for April expiry)
 *   monthDiff === 2 -> MONTH_3 (Expiring in 3rd month, e.g. February for April expiry)
 */
export function getBatchExpiryStatus(
  expiryMonth: number,
  expiryYear: number,
  now: Date = new Date()
): {
  isExpired: boolean;
  isExpiringSoon: boolean;
  daysToExpiry: number;
  monthsToExpiry: number;
  expiryBucket: ExpiryBucket;
} {
  // End of expiry month (23:59:59.999 local)
  const endOfExpiryMonth = new Date(expiryYear, expiryMonth, 0, 23, 59, 59, 999);
  const diffMs = endOfExpiryMonth.getTime() - now.getTime();
  const daysToExpiry = Math.ceil(diffMs / 86_400_000);

  if (diffMs < 0) {
    return {
      isExpired: true,
      isExpiringSoon: false,
      daysToExpiry,
      monthsToExpiry: -1,
      expiryBucket: "EXPIRED",
    };
  }

  const expiryMonthIndex = expiryYear * 12 + (expiryMonth - 1);
  const currentMonthIndex = now.getFullYear() * 12 + now.getMonth();
  const monthDiff = expiryMonthIndex - currentMonthIndex;

  if (monthDiff <= 0) {
    return {
      isExpired: false,
      isExpiringSoon: true,
      daysToExpiry,
      monthsToExpiry: 0,
      expiryBucket: "MONTH_1",
    };
  }
  if (monthDiff === 1) {
    return {
      isExpired: false,
      isExpiringSoon: true,
      daysToExpiry,
      monthsToExpiry: 1,
      expiryBucket: "MONTH_2",
    };
  }
  if (monthDiff === 2) {
    return {
      isExpired: false,
      isExpiringSoon: true,
      daysToExpiry,
      monthsToExpiry: 2,
      expiryBucket: "MONTH_3",
    };
  }

  return {
    isExpired: false,
    isExpiringSoon: false,
    daysToExpiry,
    monthsToExpiry: monthDiff,
    expiryBucket: "SAFE",
  };
}

export function sortBatchesByExpiryPriority<
  T extends {
    id: string;
    expiryDate: string;
    expiryMonth: number;
    expiryYear: number;
    quantityUnits: number;
  },
>(batches: T[], now: Date = new Date()) {
  return [...batches]
    .map((b) => {
      const status = getBatchExpiryStatus(b.expiryMonth, b.expiryYear, now);
      return {
        ...b,
        ...status,
        expiryLabel: formatExpiryMonthYear(b.expiryMonth, b.expiryYear),
      };
    })
    .sort((a, b) => {
      const cmp = a.expiryDate.localeCompare(b.expiryDate);
      if (cmp !== 0) return cmp;
      return b.quantityUnits - a.quantityUnits;
    });
}

/**
 * Automatically chooses the earliest-expiring non-expired batch with stock > 0 first.
 */
export function pickDefaultSellBatch<
  T extends { id: string; isExpired: boolean; quantityUnits: number },
>(sortedBatches: T[], preferredBatchId?: string | null): T | null {
  if (preferredBatchId) {
    const exact = sortedBatches.find((b) => b.id === preferredBatchId);
    if (exact) return exact;
  }
  const firstValidWithStock = sortedBatches.find(
    (b) => !b.isExpired && b.quantityUnits > 0
  );
  if (firstValidWithStock) return firstValidWithStock;
  const firstNonExpired = sortedBatches.find((b) => !b.isExpired);
  if (firstNonExpired) return firstNonExpired;
  return sortedBatches[0] ?? null;
}

export function formatStockBreakdown(
  totalUnits: number,
  packagingType: string,
  unitsPerSheet: number
): string {
  const safeTotal = Math.max(0, Math.trunc(totalUnits));
  if (packagingType !== "SHEET" || unitsPerSheet <= 1) {
    return `${safeTotal} unit${safeTotal === 1 ? "" : "s"}`;
  }
  const sheets = Math.floor(safeTotal / unitsPerSheet);
  const loose = safeTotal % unitsPerSheet;
  if (sheets > 0 && loose > 0) {
    return `${sheets} sh + ${loose} u (${safeTotal} units)`;
  }
  if (sheets > 0) {
    return `${sheets} sheet${sheets === 1 ? "" : "s"} (${safeTotal} units)`;
  }
  return `${loose} unit${loose === 1 ? "" : "s"}`;
}

/**
 * Formats dispensed quantity as a clean "sheets : units" ratio for pharmacy receipts.
 * Example: 2 sheets of 10 -> "2 : 0"; 15 units with 10/sheet -> "1 : 5"; 4 individual units -> "0 : 4".
 */
export function formatQuantityRatio(
  basicUnitsDeducted: number,
  unitsPerSheet: number
): string {
  const safeUnits = Math.max(0, Math.trunc(basicUnitsDeducted));
  const safeUps = Math.max(1, Math.trunc(unitsPerSheet));
  if (safeUps <= 1) {
    return `0 : ${safeUnits}`;
  }
  const sheets = Math.floor(safeUnits / safeUps);
  const loose = safeUnits % safeUps;
  return `${sheets} : ${loose}`;
}
