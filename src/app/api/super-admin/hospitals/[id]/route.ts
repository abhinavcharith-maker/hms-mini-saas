import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import { updateHospitalSchema } from "@/lib/validators";
import { generateAuditEventId, pruneHospitalAuditLogs } from "@/lib/audit";
import { getLocalDayAndMonthBounds, parseSafeTzOffset } from "@/lib/datetime";
import { ApiError, handleApiError } from "@/lib/api-utils";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth([ROLES.SUPER_ADMIN]);
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const tzOffsetMinutes = parseSafeTzOffset(searchParams.get("tzOffset"), 0) ?? 0;
    const { todayStart, todayEnd, monthStart, offsetMs } =
      getLocalDayAndMonthBounds(tzOffsetMinutes);

    const fourteenStart = new Date(todayStart);
    fourteenStart.setUTCDate(fourteenStart.getUTCDate() - 13);

    const hospital = await prisma.hospital.findUnique({
      where: { id },
      include: {
        users: {
          select: {
            id: true,
            username: true,
            fullName: true,
            email: true,
            phone: true,
            role: true,
            isActive: true,
            lastLoginAt: true,
            passwordChangedAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: "asc" },
        },
        pharmacyAccounts: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                isActive: true,
                lastLoginAt: true,
                passwordChangedAt: true,
              },
            },
          },
        },
        labAccounts: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                isActive: true,
                lastLoginAt: true,
                passwordChangedAt: true,
              },
            },
          },
        },
        _count: {
          select: {
            patients: true,
            opVisits: true,
            ipAdmissions: true,
            beds: true,
            pharmacyReferrals: true,
            labReferrals: true,
            billingReceipts: true,
          },
        },
        auditLogs: {
          take: 40,
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!hospital) {
      throw new ApiError(404, "Hospital not found.", "NOT_FOUND");
    }

    const [
      todayPatients,
      todayOp,
      todayIp,
      monthPatients,
      monthOp,
      monthIp,
      recentPatientRows,
      recentOpRows,
      recentIpRows,
    ] = await Promise.all([
      prisma.patient.count({
        where: { hospitalId: id, registeredAt: { gte: todayStart, lte: todayEnd } },
      }),
      prisma.opVisit.count({
        where: { hospitalId: id, visitDate: { gte: todayStart, lte: todayEnd } },
      }),
      prisma.ipAdmission.count({
        where: { hospitalId: id, admittedAt: { gte: todayStart, lte: todayEnd } },
      }),
      prisma.patient.count({
        where: { hospitalId: id, registeredAt: { gte: monthStart, lte: todayEnd } },
      }),
      prisma.opVisit.count({
        where: { hospitalId: id, visitDate: { gte: monthStart, lte: todayEnd } },
      }),
      prisma.ipAdmission.count({
        where: { hospitalId: id, admittedAt: { gte: monthStart, lte: todayEnd } },
      }),
      prisma.patient.findMany({
        where: { hospitalId: id, registeredAt: { gte: fourteenStart, lte: todayEnd } },
        select: { registeredAt: true },
      }),
      prisma.opVisit.findMany({
        where: { hospitalId: id, visitDate: { gte: fourteenStart, lte: todayEnd } },
        select: { visitDate: true },
      }),
      prisma.ipAdmission.findMany({
        where: { hospitalId: id, admittedAt: { gte: fourteenStart, lte: todayEnd } },
        select: { admittedAt: true },
      }),
    ]);

    const toKey = (dt: Date) =>
      new Date(dt.getTime() - offsetMs).toISOString().slice(0, 10);

    const dayBuckets = new Map<
      string,
      { date: string; label: string; patients: number; opVisits: number; ipAdmissions: number }
    >();
    const baseLocal = new Date(todayStart.getTime() - offsetMs);
    for (let i = 13; i >= 0; i--) {
      const d = new Date(
        Date.UTC(baseLocal.getUTCFullYear(), baseLocal.getUTCMonth(), baseLocal.getUTCDate() - i)
      );
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      });
      dayBuckets.set(key, { date: key, label, patients: 0, opVisits: 0, ipAdmissions: 0 });
    }
    for (const r of recentPatientRows) {
      const b = dayBuckets.get(toKey(r.registeredAt));
      if (b) b.patients++;
    }
    for (const r of recentOpRows) {
      const b = dayBuckets.get(toKey(r.visitDate));
      if (b) b.opVisits++;
    }
    for (const r of recentIpRows) {
      const b = dayBuckets.get(toKey(r.admittedAt));
      if (b) b.ipAdmissions++;
    }

    const opExceeded =
      hospital.dailyOpLimit !== null &&
      hospital.dailyOpLimit !== undefined &&
      todayOp > hospital.dailyOpLimit;

    return NextResponse.json({
      hospital: {
        ...hospital,
        dailyStats: {
          todayPatients,
          todayOp,
          todayIp,
          monthPatients,
          monthOp,
          monthIp,
          opExceeded,
        },
        dailyBreakdown: Array.from(dayBuckets.values()).reverse(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth([ROLES.SUPER_ADMIN]);
    const { id } = await context.params;
    const body = await request.json();
    const input = updateHospitalSchema.parse(body);

    const existing = await prisma.hospital.findUnique({ where: { id } });
    if (!existing) {
      throw new ApiError(404, "Hospital not found.", "NOT_FOUND");
    }

    const modeChanged =
      input.pharmacyMode !== undefined &&
      input.pharmacyMode !== existing.pharmacyMode;
    const consultancyDisabledNow =
      input.consultancyEnabled === false && existing.consultancyEnabled !== false;

    const updated = await prisma.$transaction(async (tx) => {
      // When switching between Pharmacy Referrals <-> Pharmacy Management, purge the previous pharmacy segment's data
      if (modeChanged) {
        if (input.pharmacyMode === "MANAGEMENT") {
          // Switching from REFERRALS -> MANAGEMENT: clear referral catalog & referral history
          await tx.pharmacyReferralItem.deleteMany({ where: { hospitalId: id } });
          await tx.pharmacyReferral.deleteMany({ where: { hospitalId: id } });
          await tx.medicineCatalog.deleteMany({ where: { hospitalId: id } });
        } else if (input.pharmacyMode === "REFERRALS") {
          // Switching from MANAGEMENT -> REFERRALS: clear pharmacy POS/stock/bill-scan/doctor-prescription data
          await tx.doctorPrescriptionItem.deleteMany({ where: { hospitalId: id } });
          await tx.doctorPrescription.deleteMany({ where: { hospitalId: id } });
          await tx.pharmacyBillScanSession.deleteMany({ where: { hospitalId: id } });
          await tx.pharmacyBillScanQuota.deleteMany({ where: { hospitalId: id } });
          await tx.pharmacySaleItem.deleteMany({ where: { hospitalId: id } });
          await tx.pharmacySale.deleteMany({ where: { hospitalId: id } });
          await tx.pharmacyBatch.deleteMany({ where: { hospitalId: id } });
          await tx.pharmacyStockLog.deleteMany({ where: { hospitalId: id } });
          await tx.pharmacyMedicine.deleteMany({ where: { hospitalId: id } });
        }
      }

      const h = await tx.hospital.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.address !== undefined ? { address: input.address } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          ...(input.email !== undefined ? { email: input.email } : {}),
          ...(input.tagline !== undefined ? { tagline: input.tagline } : {}),
          ...(input.registrationNo !== undefined
            ? { registrationNo: input.registrationNo }
            : {}),
          ...(input.uhidPrefix !== undefined ? { uhidPrefix: input.uhidPrefix } : {}),
          ...(input.dailyOpLimit !== undefined
            ? { dailyOpLimit: input.dailyOpLimit }
            : {}),
          ...(input.pharmacyMode !== undefined
            ? { pharmacyMode: input.pharmacyMode }
            : {}),
          ...(input.consultancyEnabled !== undefined
            ? { consultancyEnabled: input.consultancyEnabled }
            : {}),
          dailyIpLimit: null,
        },
      });

      if (consultancyDisabledNow) {
        const doctorUsers = await tx.user.findMany({
          where: { hospitalId: id, role: ROLES.DOCTOR },
          select: { id: true },
        });
        if (doctorUsers.length > 0) {
          await tx.session.updateMany({
            where: {
              userId: { in: doctorUsers.map((u) => u.id) },
              revokedAt: null,
            },
            data: { revokedAt: new Date() },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          eventId: generateAuditEventId(),
          hospitalId: h.id,
          actorUserId: session.user.id,
          actorUsername: session.user.username,
          actorRole: session.user.role,
          actionType: modeChanged ? "PHARMACY_MODE_SWITCHED" : "HOSPITAL_UPDATED",
          referenceId: h.code,
          details: modeChanged
            ? `Super Admin switched pharmacy module for "${h.name}" (${h.code}) from ${existing.pharmacyMode} to ${h.pharmacyMode} and cleared previous pharmacy segment data.`
            : `Super Admin updated hospital profile for "${h.name}" (${h.code}).`,
        },
      });
      await pruneHospitalAuditLogs(h.id, tx);

      return h;
    });

    return NextResponse.json({ hospital: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
