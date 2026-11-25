export type PaymentStatus = "ACTIVE" | "EXPIRING_SOON" | "OVERDUE" | "UNSET";

/**
 * Adds whole calendar months to a Date while clamping day-of-month
 * (e.g., Jan 31 + 1 month -> Feb 28/29 instead of rolling into March).
 */
export function addCalendarMonths(baseDate: Date, months: number): Date {
  const result = new Date(baseDate.getTime());
  const originalDay = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDayOfTargetMonth = new Date(
    result.getFullYear(),
    result.getMonth() + 1,
    0
  ).getDate();
  result.setDate(Math.min(originalDay, lastDayOfTargetMonth));
  return result;
}

export function computeNewSubscriptionExpiry(
  currentExpiresAt: Date | null | undefined,
  monthsToAdd: number,
  now: Date = new Date()
): Date {
  const base =
    currentExpiresAt && currentExpiresAt.getTime() > now.getTime()
      ? currentExpiresAt
      : now;
  return addCalendarMonths(base, monthsToAdd);
}

export interface EvaluatedPaymentState {
  status: PaymentStatus;
  isOverdue: boolean;
  daysOverdue: number;
  daysRemaining: number | null;
}

export function evaluateHospitalPaymentState(
  subscriptionExpiresAt: Date | string | null | undefined,
  now: Date = new Date()
): EvaluatedPaymentState {
  if (!subscriptionExpiresAt) {
    return {
      status: "UNSET",
      isOverdue: false,
      daysOverdue: 0,
      daysRemaining: null,
    };
  }

  const expiry =
    subscriptionExpiresAt instanceof Date
      ? subscriptionExpiresAt
      : new Date(subscriptionExpiresAt);

  if (Number.isNaN(expiry.getTime())) {
    return {
      status: "UNSET",
      isOverdue: false,
      daysOverdue: 0,
      daysRemaining: null,
    };
  }

  const diffMs = expiry.getTime() - now.getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  if (diffMs < 0) {
    return {
      status: "OVERDUE",
      isOverdue: true,
      daysOverdue: Math.max(1, Math.ceil(Math.abs(diffMs) / dayMs)),
      daysRemaining: 0,
    };
  }

  const daysRemaining = Math.max(0, Math.ceil(diffMs / dayMs));
  return {
    status: daysRemaining <= 7 ? "EXPIRING_SOON" : "ACTIVE",
    isOverdue: false,
    daysOverdue: 0,
    daysRemaining,
  };
}

export function formatInrAmount(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const hasDecimals = Math.abs(safe - Math.round(safe)) > 0.001;
  return `₹${new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(safe)}`;
}
