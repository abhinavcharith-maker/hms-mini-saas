/**
 * Accurate local date & time helpers so `<input type="date">`,
 * `<input type="datetime-local">`, date-range filters, and displayed timestamps
 * never suffer from UTC midnight shifts.
 */

export function getLocalDateInputValue(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getLocalDateTimeInputValue(date = new Date()): string {
  const datePart = getLocalDateInputValue(date);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${datePart}T${hours}:${minutes}`;
}

export function parseVisitDatePreservingTime(
  dateStr?: string | null,
  tzOffsetMinutes?: number | null
): Date {
  if (!dateStr) return new Date();
  const trimmed = dateStr.trim();

  // If caller passed a date-only string "YYYY-MM-DD"
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const now = new Date();
    // Compute client's local "today" if tzOffsetMinutes was supplied, else server local today
    const localNow =
      typeof tzOffsetMinutes === "number" && Number.isFinite(tzOffsetMinutes)
        ? new Date(now.getTime() - tzOffsetMinutes * 60_000)
        : now;
    const todayStr =
      typeof tzOffsetMinutes === "number" && Number.isFinite(tzOffsetMinutes)
        ? localNow.toISOString().slice(0, 10)
        : getLocalDateInputValue(now);

    if (trimmed === todayStr) {
      // Preserve exact current wall-clock timestamp when registering for today
      return now;
    }

    const [y, m, d] = trimmed.split("-").map(Number);
    if (typeof tzOffsetMinutes === "number" && Number.isFinite(tzOffsetMinutes)) {
      const utcMidday = Date.UTC(y, m - 1, d, 12, 0, 0, 0);
      return new Date(utcMidday + tzOffsetMinutes * 60_000);
    }
    return new Date(y, m - 1, d, 12, 0, 0, 0);
  }

  return new Date(trimmed);
}

export function parseDateRangeBounds(params: {
  from?: string | null;
  to?: string | null;
  tzOffsetMinutes?: number | null;
}): { gte?: Date; lte?: Date } {
  const range: { gte?: Date; lte?: Date } = {};
  const offsetMs =
    typeof params.tzOffsetMinutes === "number" &&
    Number.isFinite(params.tzOffsetMinutes)
      ? params.tzOffsetMinutes * 60_000
      : null;

  if (params.from) {
    const f = params.from.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(f)) {
      const [y, m, d] = f.split("-").map(Number);
      if (offsetMs !== null) {
        range.gte = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0) + offsetMs);
      } else {
        range.gte = new Date(y, m - 1, d, 0, 0, 0, 0);
      }
    } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(f)) {
      const [datePart, timePart] = f.split("T");
      const [y, m, d] = datePart.split("-").map(Number);
      const [hh, mm] = timePart.split(":").map(Number);
      if (offsetMs !== null) {
        range.gte = new Date(Date.UTC(y, m - 1, d, hh, mm, 0, 0) + offsetMs);
      } else {
        range.gte = new Date(y, m - 1, d, hh, mm, 0, 0);
      }
    } else {
      const dt = new Date(f);
      if (!Number.isNaN(dt.getTime())) range.gte = dt;
    }
  }

  if (params.to) {
    const t = params.to.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
      const [y, m, d] = t.split("-").map(Number);
      if (offsetMs !== null) {
        range.lte = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999) + offsetMs);
      } else {
        range.lte = new Date(y, m - 1, d, 23, 59, 59, 999);
      }
    } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(t)) {
      const [datePart, timePart] = t.split("T");
      const [y, m, d] = datePart.split("-").map(Number);
      const [hh, mm] = timePart.split(":").map(Number);
      if (offsetMs !== null) {
        range.lte = new Date(Date.UTC(y, m - 1, d, hh, mm, 59, 999) + offsetMs);
      } else {
        range.lte = new Date(y, m - 1, d, hh, mm, 59, 999);
      }
    } else {
      const dt = new Date(t);
      if (!Number.isNaN(dt.getTime())) range.lte = dt;
    }
  }

  return range;
}

export function formatAccurateDateTime(value: string | Date): string {
  const dt = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatAccurateDate(value: string | Date): string {
  const dt = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

export function parseSafeTzOffset(
  param: string | null | undefined,
  fallback: number | null = null
): number | null {
  if (param === null || param === undefined || param.trim() === "") {
    return fallback;
  }
  const num = Number(param);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  return Math.max(-840, Math.min(840, Math.trunc(num)));
}

export function getLocalDayAndMonthBounds(tzOffsetMinutes?: number | null): {
  todayStart: Date;
  todayEnd: Date;
  monthStart: Date;
  offsetMs: number;
  todayStr: string;
} {
  const safeOffset =
    typeof tzOffsetMinutes === "number" && Number.isFinite(tzOffsetMinutes)
      ? Math.max(-840, Math.min(840, Math.trunc(tzOffsetMinutes)))
      : 0;
  const offsetMs = safeOffset * 60_000;
  const localNow = new Date(Date.now() - offsetMs);
  const y = localNow.getUTCFullYear();
  const m = localNow.getUTCMonth();
  const d = localNow.getUTCDate();

  const todayStart = new Date(Date.UTC(y, m, d, 0, 0, 0, 0) + offsetMs);
  const todayEnd = new Date(Date.UTC(y, m, d, 23, 59, 59, 999) + offsetMs);
  const monthStart = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0) + offsetMs);
  const todayStr = localNow.toISOString().slice(0, 10);

  return { todayStart, todayEnd, monthStart, offsetMs, todayStr };
}
