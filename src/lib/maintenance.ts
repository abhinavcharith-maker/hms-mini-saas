import { prisma } from "./prisma";
import { ROLES } from "./constants";
import { ApiError } from "./api-utils";

export interface MaintenanceState {
  active: boolean;
  reason: string | null;
  startsAt: string | null;
  endsAt: string | null;
  activatedByUsername: string | null;
  activatedAt: string | null;
}

export async function getMaintenanceStatus(): Promise<MaintenanceState> {
  try {
    const row = await prisma.systemMaintenance.findUnique({
      where: { id: "singleton" },
    });

    if (!row || !row.isActive) {
      return {
        active: false,
        reason: null,
        startsAt: null,
        endsAt: null,
        activatedByUsername: null,
        activatedAt: null,
      };
    }

    const now = new Date();
    if (row.endsAt && row.endsAt.getTime() <= now.getTime()) {
      await prisma.systemMaintenance
        .updateMany({
          where: { id: "singleton", isActive: true },
          data: {
            isActive: false,
            endedAt: row.endsAt,
          },
        })
        .catch(() => {});
      return {
        active: false,
        reason: null,
        startsAt: null,
        endsAt: null,
        activatedByUsername: null,
        activatedAt: null,
      };
    }

    return {
      active: true,
      reason: row.reason || "Scheduled platform maintenance is in progress.",
      startsAt: row.startsAt ? row.startsAt.toISOString() : null,
      endsAt: row.endsAt ? row.endsAt.toISOString() : null,
      activatedByUsername: row.activatedByUsername ?? null,
      activatedAt: row.activatedAt ? row.activatedAt.toISOString() : null,
    };
  } catch {
    return {
      active: false,
      reason: null,
      startsAt: null,
      endsAt: null,
      activatedByUsername: null,
      activatedAt: null,
    };
  }
}

export function formatMaintenanceMessage(state: MaintenanceState): string {
  const reasonPart = state.reason
    ? state.reason
    : "Scheduled maintenance break is active.";
  const endPart = state.endsAt
    ? ` Expected resume: ${new Date(state.endsAt).toLocaleString()}.`
    : "";
  return `Platform under maintenance: ${reasonPart}.${endPart}`;
}

export async function assertNotUnderMaintenanceForRole(role: string): Promise<void> {
  if (role === ROLES.SUPER_ADMIN) {
    return;
  }
  const state = await getMaintenanceStatus();
  if (state.active) {
    throw new ApiError(
      503,
      formatMaintenanceMessage(state),
      "MAINTENANCE_ACTIVE",
      { maintenance: state }
    );
  }
}
