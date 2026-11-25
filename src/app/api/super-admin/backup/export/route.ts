import { NextResponse } from "next/server";
import { ROLES } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import { buildBackupExport } from "@/lib/backup";
import { handleApiError } from "@/lib/api-utils";

export async function GET(request: Request) {
  try {
    const session = await requireAuth([ROLES.SUPER_ADMIN]);
    const { searchParams } = new URL(request.url);
    const hospitalId = searchParams.get("hospitalId") || null;

    const payload = await buildBackupExport({
      hospitalId,
      actor: session.user,
    });

    const dateTag = new Date().toISOString().slice(0, 10);
    const scopeTag = hospitalId
      ? payload.data.hospitals[0]?.code.toLowerCase() ?? "hospital"
      : "platform-full";
    const filename = `hospitalpro-hms-backup-${scopeTag}-${dateTag}.json`;

    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
