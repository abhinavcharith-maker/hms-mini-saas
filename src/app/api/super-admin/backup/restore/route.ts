import { NextResponse } from "next/server";
import { z } from "zod";
import { ROLES } from "@/lib/constants";
import {
  clearSessionCookie,
  createUserSession,
  requireAuth,
  setSessionCookie,
} from "@/lib/auth";
import { restoreBackupPayload } from "@/lib/backup";
import {
  ApiError,
  getRequestClientInfo,
  handleApiError,
} from "@/lib/api-utils";

const restoreRequestSchema = z.object({
  backup: z.unknown(),
  mode: z.enum(["RESTORE_PLATFORM", "RESTORE_EXISTING", "IMPORT_NEW"]),
  sourceHospitalId: z.string().optional(),
  targetHospitalId: z.string().optional(),
  newHospitalName: z.string().optional(),
  newHospitalCode: z.string().optional(),
  usernamePrefix: z.string().optional(),
  confirmOverwrite: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const session = await requireAuth([ROLES.SUPER_ADMIN]);
    const rawText = await request.text();
    const body = rawText ? JSON.parse(rawText) : {};
    const input = restoreRequestSchema.parse(body);

    if (input.mode !== "RESTORE_PLATFORM" && !input.sourceHospitalId) {
      throw new ApiError(
        400,
        "Please select a source hospital from the backup file.",
        "SOURCE_HOSPITAL_REQUIRED"
      );
    }

    const result = await restoreBackupPayload({
      rawInput: input.backup,
      mode: input.mode,
      sourceHospitalId: input.sourceHospitalId,
      targetHospitalId: input.targetHospitalId,
      newHospitalName: input.newHospitalName,
      newHospitalCode: input.newHospitalCode,
      usernamePrefix: input.usernamePrefix,
      confirmOverwrite: input.confirmOverwrite,
      actor: session.user,
    });

    if (result.mode === "RESTORE_PLATFORM") {
      if (result.actorCredentialsUnchanged && result.restoredSuperAdminId) {
        const { ipAddress, userAgent } = getRequestClientInfo(request);
        const { token, expiresAt } = await createUserSession({
          userId: result.restoredSuperAdminId,
          hospitalId: null,
          ipAddress,
          userAgent,
        });
        await setSessionCookie(token, expiresAt, request);
        return NextResponse.json({
          ...result,
          requiresRelogin: false,
        });
      }

      await clearSessionCookie(request);
      return NextResponse.json({
        ...result,
        requiresRelogin: true,
      });
    }

    return NextResponse.json({
      ...result,
      requiresRelogin: false,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
