import crypto from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export interface AuditInput {
  hospitalId?: string | null;
  actorUserId?: string | null;
  actorUsername: string;
  actorRole: string;
  actionType: string;
  patientId?: string | null;
  patientUhid?: string | null;
  referenceId?: string | null;
  details: string;
  metadata?: Record<string, unknown> | null;
}

export function generateAuditEventId(): string {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `EVT-${stamp}-${suffix}`;
}

export const MAX_HOSPITAL_RECENT_CHANGES = 100;
export const MAX_PLATFORM_RECENT_ACTIVITY = 100;

export async function pruneHospitalAuditLogs(
  hospitalId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma,
  limit = MAX_HOSPITAL_RECENT_CHANGES
) {
  const olderRows = await client.auditLog.findMany({
    where: { hospitalId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: limit,
    select: { id: true },
  });
  if (olderRows.length > 0) {
    await client.auditLog.deleteMany({
      where: {
        id: { in: olderRows.map((row) => row.id) },
      },
    });
  }
}

export async function prunePlatformAuditLogs(
  client: Prisma.TransactionClient | typeof prisma = prisma,
  limit = MAX_PLATFORM_RECENT_ACTIVITY
) {
  // Strictly scope platform pruning to global (non-tenant) audit entries so one
  // hospital's activity can never delete another hospital's audit history.
  const olderRows = await client.auditLog.findMany({
    where: { hospitalId: null },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: limit,
    select: { id: true },
  });
  if (olderRows.length > 0) {
    await client.auditLog.deleteMany({
      where: {
        id: { in: olderRows.map((row) => row.id) },
      },
    });
  }
}

export async function recordAuditLog(
  input: AuditInput,
  tx?: Prisma.TransactionClient
) {
  const client = tx ?? prisma;
  const created = await client.auditLog.create({
    data: {
      eventId: generateAuditEventId(),
      hospitalId: input.hospitalId ?? null,
      actorUserId: input.actorUserId ?? null,
      actorUsername: input.actorUsername,
      actorRole: input.actorRole,
      actionType: input.actionType,
      patientId: input.patientId ?? null,
      patientUhid: input.patientUhid ?? null,
      referenceId: input.referenceId ?? null,
      details: input.details,
      metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
    },
  });

  if (input.hospitalId) {
    await pruneHospitalAuditLogs(input.hospitalId, client, MAX_HOSPITAL_RECENT_CHANGES);
  } else {
    await prunePlatformAuditLogs(client, MAX_PLATFORM_RECENT_ACTIVITY);
  }

  return created;
}

export async function createAdminNotification(
  params: {
    hospitalId: string;
    title: string;
    message: string;
    category?: "SECURITY" | "REFERRAL" | "SYSTEM";
  },
  tx?: Prisma.TransactionClient
) {
  const client = tx ?? prisma;
  return client.notification.create({
    data: {
      hospitalId: params.hospitalId,
      targetRole: "HOSPITAL_ADMIN",
      title: params.title,
      message: params.message,
      category: params.category ?? "SYSTEM",
    },
  });
}
