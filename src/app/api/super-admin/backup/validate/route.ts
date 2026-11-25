import { NextResponse } from "next/server";
import { ROLES } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import { validateBackupPayload } from "@/lib/backup";
import { handleApiError } from "@/lib/api-utils";

export async function POST(request: Request) {
  try {
    await requireAuth([ROLES.SUPER_ADMIN]);
    const rawText = await request.text();
    const body = rawText ? JSON.parse(rawText) : {};

    const result = await validateBackupPayload(body.backup ?? body);
    return NextResponse.json({
      valid: result.valid,
      checksumValid: result.checksumValid,
      errors: result.errors,
      warnings: result.warnings,
      summary: result.summary,
      conflicts: result.conflicts,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
