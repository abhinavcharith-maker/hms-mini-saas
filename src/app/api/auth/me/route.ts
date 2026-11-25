import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getMaintenanceStatus } from "@/lib/maintenance";

export async function GET() {
  const [session, maintenance] = await Promise.all([
    getSession(),
    getMaintenanceStatus(),
  ]);
  if (!session) {
    return NextResponse.json({ authenticated: false, maintenance }, { status: 401 });
  }
  return NextResponse.json({
    authenticated: true,
    user: session.user,
    hospital: session.hospital,
    pharmacyAccount: session.pharmacyAccount,
    labAccount: session.labAccount,
    maintenance,
  });
}
