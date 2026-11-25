import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePharmacyManagementAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";

export async function GET(request: Request) {
  try {
    const session = await requirePharmacyManagementAuth();
    const hospitalId = session.hospitalId;
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").trim();
    const limit = Math.min(
      Math.max(1, Number(searchParams.get("limit") ?? 15) || 15),
      50
    );

    const patients = await prisma.patient.findMany({
      where: {
        hospitalId,
        ...(q
          ? {
              OR: [
                { fullName: { contains: q } },
                { phone: { contains: q } },
                { uhid: { contains: q } },
              ],
            }
          : {}),
      },
      orderBy: [{ updatedAt: "desc" }, { registeredAt: "desc" }],
      take: limit,
      select: {
        id: true,
        uhid: true,
        fullName: true,
        phone: true,
        age: true,
        gender: true,
        registeredAt: true,
        opVisits: {
          orderBy: { visitDate: "desc" },
          take: 1,
          select: {
            visitDate: true,
            doctorId: true,
            doctorNameSnapshot: true,
            doctor: {
              select: { id: true, name: true, qualification: true, isActive: true },
            },
          },
        },
        ipAdmissions: {
          orderBy: { admittedAt: "desc" },
          take: 1,
          select: {
            admittedAt: true,
            doctorId: true,
            doctorNameSnapshot: true,
            doctor: {
              select: { id: true, name: true, qualification: true, isActive: true },
            },
          },
        },
      },
    });

    const formatted = patients
      .map((p) => {
        const latestOp = p.opVisits[0] ?? null;
        const latestIp = p.ipAdmissions[0] ?? null;

        let recentDoctorId: string | null = null;
        let recentDoctorName: string | null = null;
        let recentDoctorQualification: string | null = null;
        let latestActivityTs = p.registeredAt.getTime();

        const opTs = latestOp ? latestOp.visitDate.getTime() : 0;
        const ipTs = latestIp ? latestIp.admittedAt.getTime() : 0;

        if (opTs >= ipTs && latestOp) {
          latestActivityTs = Math.max(latestActivityTs, opTs);
          recentDoctorId = latestOp.doctor?.isActive ? latestOp.doctor.id : latestOp.doctorId;
          recentDoctorName = latestOp.doctor?.name ?? latestOp.doctorNameSnapshot;
          recentDoctorQualification = latestOp.doctor?.qualification ?? null;
        } else if (latestIp) {
          latestActivityTs = Math.max(latestActivityTs, ipTs);
          recentDoctorId = latestIp.doctor?.isActive ? latestIp.doctor.id : latestIp.doctorId;
          recentDoctorName = latestIp.doctor?.name ?? latestIp.doctorNameSnapshot;
          recentDoctorQualification = latestIp.doctor?.qualification ?? null;
        }

        return {
          id: p.id,
          uhid: p.uhid,
          fullName: p.fullName,
          phone: p.phone,
          age: p.age,
          gender: p.gender,
          recentDoctorId,
          recentDoctorName,
          recentDoctorQualification,
          latestActivityTs,
        };
      })
      .sort((a, b) => b.latestActivityTs - a.latestActivityTs);

    return NextResponse.json({ patients: formatted });
  } catch (error) {
    return handleApiError(error);
  }
}
