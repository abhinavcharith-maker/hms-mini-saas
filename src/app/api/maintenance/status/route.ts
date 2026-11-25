import { NextResponse } from "next/server";
import { getMaintenanceStatus } from "@/lib/maintenance";
import { handleApiError } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const maintenance = await getMaintenanceStatus();
    return NextResponse.json(maintenance);
  } catch (error) {
    return handleApiError(error);
  }
}
