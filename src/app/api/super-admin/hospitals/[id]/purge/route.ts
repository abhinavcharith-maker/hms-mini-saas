import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { BED_STATUS, IP_STATUS, ROLES } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import { purgeHospitalDataSchema } from "@/lib/validators";
import { generateAuditEventId, pruneHospitalAuditLogs } from "@/lib/audit";
import { parseDateRangeBounds, parseSafeTzOffset } from "@/lib/datetime";
import { ApiError, handleApiError } from "@/lib/api-utils";

function resolveValidatedRange(params: {
  from?: string | null;
  to?: string | null;
  tzOffsetMinutes?: number | null;
}): { fromDate: Date; toDate: Date } {
  if (!params.from || !params.to) {
    throw new ApiError(400, "Both start and end date/time are required.", "INVALID_RANGE");
  }
  const { gte, lte } = parseDateRangeBounds({
    from: params.from,
    to: params.to,
    tzOffsetMinutes: params.tzOffsetMinutes,
  });
  if (!gte || !lte || Number.isNaN(gte.getTime()) || Number.isNaN(lte.getTime())) {
    throw new ApiError(400, "Invalid date/time range supplied.", "INVALID_RANGE");
  }
  if (gte.getTime() > lte.getTime()) {
    throw new ApiError(
      400,
      "Start date/time must be earlier than or equal to end date/time.",
      "INVALID_RANGE"
    );
  }
  return { fromDate: gte, toDate: lte };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth([ROLES.SUPER_ADMIN]);
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const tzOffsetMinutes = parseSafeTzOffset(searchParams.get("tzOffset"), null);

    const { fromDate, toDate } = resolveValidatedRange({
      from: fromParam,
      to: toParam,
      tzOffsetMinutes,
    });

    const hospital = await prisma.hospital.findUnique({
      where: { id },
      select: { id: true, code: true, name: true },
    });
    if (!hospital) {
      throw new ApiError(404, "Hospital not found.", "NOT_FOUND");
    }

    const [
      patientsInRange,
      patientsToDelete,
      opVisits,
      ipAdmissions,
      activeBedsToFree,
      bedTransfers,
      pharmacyReferrals,
      labReferrals,
      billingReceipts,
      notifications,
      auditLogs,
    ] = await Promise.all([
      prisma.patient.count({
        where: { hospitalId: id, registeredAt: { gte: fromDate, lte: toDate } },
      }),
      prisma.patient.count({
        where: {
          hospitalId: id,
          registeredAt: { gte: fromDate, lte: toDate },
          opVisits: {
            none: {
              OR: [{ visitDate: { lt: fromDate } }, { visitDate: { gt: toDate } }],
            },
          },
          ipAdmissions: {
            none: {
              OR: [{ admittedAt: { lt: fromDate } }, { admittedAt: { gt: toDate } }],
            },
          },
          pharmacyReferrals: {
            none: {
              OR: [{ referredAt: { lt: fromDate } }, { referredAt: { gt: toDate } }],
            },
          },
          labReferrals: {
            none: {
              OR: [{ referredAt: { lt: fromDate } }, { referredAt: { gt: toDate } }],
            },
          },
          billingReceipts: {
            none: {
              OR: [{ issuedAt: { lt: fromDate } }, { issuedAt: { gt: toDate } }],
            },
          },
        },
      }),
      prisma.opVisit.count({
        where: { hospitalId: id, visitDate: { gte: fromDate, lte: toDate } },
      }),
      prisma.ipAdmission.count({
        where: { hospitalId: id, admittedAt: { gte: fromDate, lte: toDate } },
      }),
      prisma.ipAdmission.count({
        where: {
          hospitalId: id,
          admittedAt: { gte: fromDate, lte: toDate },
          status: IP_STATUS.ADMITTED,
          bedId: { not: null },
        },
      }),
      prisma.bedTransfer.count({
        where: {
          hospitalId: id,
          OR: [
            { transferredAt: { gte: fromDate, lte: toDate } },
            { ipAdmission: { admittedAt: { gte: fromDate, lte: toDate } } },
          ],
        },
      }),
      prisma.pharmacyReferral.count({
        where: { hospitalId: id, referredAt: { gte: fromDate, lte: toDate } },
      }),
      prisma.labReferral.count({
        where: { hospitalId: id, referredAt: { gte: fromDate, lte: toDate } },
      }),
      prisma.billingReceipt.count({
        where: { hospitalId: id, issuedAt: { gte: fromDate, lte: toDate } },
      }),
      prisma.notification.count({
        where: { hospitalId: id, createdAt: { gte: fromDate, lte: toDate } },
      }),
      prisma.auditLog.count({
        where: { hospitalId: id, createdAt: { gte: fromDate, lte: toDate } },
      }),
    ]);

    const patientsPreserved = Math.max(0, patientsInRange - patientsToDelete);
    const totalRecords =
      patientsToDelete +
      opVisits +
      ipAdmissions +
      bedTransfers +
      pharmacyReferrals +
      labReferrals +
      billingReceipts +
      notifications +
      auditLogs;

    return NextResponse.json({
      hospital,
      range: { from: fromDate.toISOString(), to: toDate.toISOString() },
      preview: {
        patientsToDelete,
        patientsPreserved,
        opVisits,
        ipAdmissions,
        activeBedsToFree,
        bedTransfers,
        pharmacyReferrals,
        labReferrals,
        billingReceipts,
        notifications,
        auditLogs,
        totalRecords,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth([ROLES.SUPER_ADMIN]);
    const { id } = await context.params;
    const body = await request.json();
    const input = purgeHospitalDataSchema.parse(body);

    const { fromDate, toDate } = resolveValidatedRange({
      from: input.from,
      to: input.to,
      tzOffsetMinutes: input.tzOffsetMinutes ?? null,
    });

    const hospital = await prisma.hospital.findUnique({
      where: { id },
      select: { id: true, code: true, name: true },
    });
    if (!hospital) {
      throw new ApiError(404, "Hospital not found.", "NOT_FOUND");
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Release any OCCUPIED beds belonging to active IP admissions being deleted
      const activeAdmissionsInRange = await tx.ipAdmission.findMany({
        where: {
          hospitalId: id,
          admittedAt: { gte: fromDate, lte: toDate },
          status: IP_STATUS.ADMITTED,
          bedId: { not: null },
        },
        select: { bedId: true },
      });

      const bedIdsToFree = Array.from(
        new Set(
          activeAdmissionsInRange
            .map((a) => a.bedId)
            .filter((bId): bId is string => Boolean(bId))
        )
      );

      let freedBeds = 0;
      if (bedIdsToFree.length > 0) {
        const freed = await tx.bed.updateMany({
          where: {
            id: { in: bedIdsToFree },
            hospitalId: id,
            status: BED_STATUS.OCCUPIED,
          },
          data: { status: BED_STATUS.AVAILABLE },
        });
        freedBeds = freed.count;
      }

      // 2. Delete timeframe-scoped clinical, billing, referral & activity records
      const [
        deletedPharmRefs,
        deletedLabRefs,
        deletedReceipts,
        deletedTransfers,
      ] = await Promise.all([
        tx.pharmacyReferral.deleteMany({
          where: { hospitalId: id, referredAt: { gte: fromDate, lte: toDate } },
        }),
        tx.labReferral.deleteMany({
          where: { hospitalId: id, referredAt: { gte: fromDate, lte: toDate } },
        }),
        tx.billingReceipt.deleteMany({
          where: { hospitalId: id, issuedAt: { gte: fromDate, lte: toDate } },
        }),
        tx.bedTransfer.deleteMany({
          where: {
            hospitalId: id,
            OR: [
              { transferredAt: { gte: fromDate, lte: toDate } },
              { ipAdmission: { admittedAt: { gte: fromDate, lte: toDate } } },
            ],
          },
        }),
      ]);

      const deletedIpAdmissions = await tx.ipAdmission.deleteMany({
        where: { hospitalId: id, admittedAt: { gte: fromDate, lte: toDate } },
      });

      const deletedOpVisits = await tx.opVisit.deleteMany({
        where: { hospitalId: id, visitDate: { gte: fromDate, lte: toDate } },
      });

      const deletedNotifications = await tx.notification.deleteMany({
        where: { hospitalId: id, createdAt: { gte: fromDate, lte: toDate } },
      });

      const deletedAuditLogs = await tx.auditLog.deleteMany({
        where: { hospitalId: id, createdAt: { gte: fromDate, lte: toDate } },
      });

      // 3. Delete Patients registered in the timeframe who have no remaining activity outside the range
      const deletedPatients = await tx.patient.deleteMany({
        where: {
          hospitalId: id,
          registeredAt: { gte: fromDate, lte: toDate },
          opVisits: { none: {} },
          ipAdmissions: { none: {} },
          pharmacyReferrals: { none: {} },
          labReferrals: { none: {} },
          billingReceipts: { none: {} },
        },
      });

      const deletedCounts = {
        patients: deletedPatients.count,
        opVisits: deletedOpVisits.count,
        ipAdmissions: deletedIpAdmissions.count,
        freedBeds,
        bedTransfers: deletedTransfers.count,
        pharmacyReferrals: deletedPharmRefs.count,
        labReferrals: deletedLabRefs.count,
        billingReceipts: deletedReceipts.count,
        notifications: deletedNotifications.count,
        auditLogs: deletedAuditLogs.count,
      };

      const totalDeleted =
        deletedCounts.patients +
        deletedCounts.opVisits +
        deletedCounts.ipAdmissions +
        deletedCounts.bedTransfers +
        deletedCounts.pharmacyReferrals +
        deletedCounts.labReferrals +
        deletedCounts.billingReceipts +
        deletedCounts.notifications +
        deletedCounts.auditLogs;

      await tx.auditLog.create({
        data: {
          eventId: generateAuditEventId(),
          hospitalId: id,
          actorUserId: session.user.id,
          actorUsername: session.user.username,
          actorRole: session.user.role,
          actionType: "HOSPITAL_DATA_PURGED",
          referenceId: hospital.code,
          details: `Super Admin deleted "${hospital.name}" (${hospital.code}) timeframe data (${fromDate.toISOString()} to ${toDate.toISOString()}): ${deletedCounts.patients} patients, ${deletedCounts.opVisits} OP visits, ${deletedCounts.ipAdmissions} IP admissions, ${deletedCounts.pharmacyReferrals} pharmacy referrals, ${deletedCounts.labReferrals} lab referrals, ${deletedCounts.billingReceipts} receipts.`,
          metadataJson: JSON.stringify(deletedCounts),
        },
      });
      await pruneHospitalAuditLogs(id, tx);

      return { deletedCounts, totalDeleted };
    });

    return NextResponse.json({
      hospital,
      range: { from: fromDate.toISOString(), to: toDate.toISOString() },
      ...result,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
