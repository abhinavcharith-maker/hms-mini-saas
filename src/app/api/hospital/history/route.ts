import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/constants";
import { requireHospitalAuth } from "@/lib/auth";
import { pruneHospitalAuditLogs } from "@/lib/audit";
import { parseDateRangeBounds, parseSafeTzOffset } from "@/lib/datetime";
import { handleApiError } from "@/lib/api-utils";

function escapeCsv(val: string | null | undefined): string {
  let s = val ?? "";
  if (/^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(request: Request) {
  try {
    const session = await requireHospitalAuth([ROLES.HOSPITAL_ADMIN]);
    await pruneHospitalAuditLogs(session.hospitalId, prisma);
    const { searchParams } = new URL(request.url);

    const q = (searchParams.get("q") ?? "").trim();
    const actionType = searchParams.get("actionType") || undefined;
    const actorUsername = searchParams.get("actorUsername") || undefined;
    const patientUhid = (searchParams.get("patientUhid") ?? "").trim();
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const tzOffsetMinutes = parseSafeTzOffset(searchParams.get("tzOffset"), null);
    const format = searchParams.get("format");
    const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
    const pageSize = Math.min(
      100,
      Math.max(10, Number(searchParams.get("pageSize") ?? 25) || 25)
    );

    const dateFilter = parseDateRangeBounds({ from, to, tzOffsetMinutes });

    const where = {
      hospitalId: session.hospitalId,
      ...(actionType ? { actionType } : {}),
      ...(actorUsername ? { actorUsername } : {}),
      ...(patientUhid ? { patientUhid: { contains: patientUhid } } : {}),
      ...(from || to ? { createdAt: dateFilter } : {}),
      ...(q
        ? {
            OR: [
              { eventId: { contains: q } },
              { details: { contains: q } },
              { patientUhid: { contains: q } },
              { referenceId: { contains: q } },
              { actorUsername: { contains: q } },
            ],
          }
        : {}),
    };

    if (format === "csv") {
      const rows = await prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 2000,
      });
      const header = [
        "Event ID",
        "Timestamp",
        "Action",
        "Patient UHID",
        "Reference ID",
        "User",
        "Role",
        "Details",
      ].join(",");
      const lines = rows.map((r) =>
        [
          escapeCsv(r.eventId),
          escapeCsv(r.createdAt.toISOString()),
          escapeCsv(r.actionType),
          escapeCsv(r.patientUhid),
          escapeCsv(r.referenceId),
          escapeCsv(r.actorUsername),
          escapeCsv(r.actorRole),
          escapeCsv(r.details),
        ].join(",")
      );
      const csv = [header, ...lines].join("\n");
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="hospital-audit-history-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    const [total, logs, distinctActors, distinctActions] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.auditLog.findMany({
        where: { hospitalId: session.hospitalId },
        distinct: ["actorUsername"],
        select: { actorUsername: true },
        orderBy: { actorUsername: "asc" },
      }),
      prisma.auditLog.findMany({
        where: { hospitalId: session.hospitalId },
        distinct: ["actionType"],
        select: { actionType: true },
        orderBy: { actionType: "asc" },
      }),
    ]);

    return NextResponse.json({
      logs,
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
      filters: {
        actors: distinctActors.map((a) => a.actorUsername),
        actions: distinctActions.map((a) => a.actionType),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
