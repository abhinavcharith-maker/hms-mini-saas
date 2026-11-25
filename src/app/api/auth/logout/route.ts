import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/constants";
import { clearSessionCookie, getSession, revokeSessionByToken } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { handleApiError } from "@/lib/api-utils";

export async function POST(request: Request) {
  try {
    const session = await getSession();
    const store = await cookies();
    const rawToken = store.get(SESSION_COOKIE_NAME)?.value;

    if (rawToken) {
      await revokeSessionByToken(rawToken);
    }
    await clearSessionCookie(request);

    if (session) {
      await recordAuditLog({
        hospitalId: session.user.hospitalId,
        actorUserId: session.user.id,
        actorUsername: session.user.username,
        actorRole: session.user.role,
        actionType: "LOGOUT",
        details: `${session.user.username} signed out.`,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
