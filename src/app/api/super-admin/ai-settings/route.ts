import { NextResponse } from "next/server";
import { z } from "zod";
import { ROLES } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import {
  DEFAULT_GEMINI_MODEL,
  clearPlatformGeminiKey,
  getPlatformGeminiConfig,
  savePlatformGeminiConfig,
} from "@/lib/platform-config";
import { ApiError, handleApiError } from "@/lib/api-utils";

const saveAiConfigSchema = z.object({
  apiKey: z
    .string()
    .trim()
    .max(512, "API key is too long")
    .optional(),
  model: z
    .string()
    .trim()
    .min(2, "Model ID is required")
    .max(120)
    .regex(/^[a-zA-Z0-9._-]+$/, "Invalid Gemini model ID format")
    .optional(),
});

export async function GET() {
  try {
    await requireAuth([ROLES.SUPER_ADMIN]);
    const cfg = await getPlatformGeminiConfig();
    // NEVER return cfg.apiKey (plaintext) to the client!
    return NextResponse.json({
      configured: cfg.configured,
      maskedKey: cfg.maskedKey,
      model: cfg.model || DEFAULT_GEMINI_MODEL,
      source: cfg.source,
      updatedAt: cfg.updatedAt,
      updatedByUsername: cfg.updatedByUsername,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const session = await requireAuth([ROLES.SUPER_ADMIN]);
    const body = await request.json();
    const input = saveAiConfigSchema.parse(body);

    const existing = await getPlatformGeminiConfig();
    if (!input.apiKey && !existing.configured) {
      throw new ApiError(
        400,
        "Please paste your Gemini API key before saving.",
        "API_KEY_REQUIRED"
      );
    }
    if (input.apiKey && input.apiKey.length < 10) {
      throw new ApiError(
        400,
        "Gemini API key looks too short. Paste the complete API key.",
        "INVALID_API_KEY"
      );
    }

    const saved = await savePlatformGeminiConfig({
      apiKey: input.apiKey || undefined,
      model: input.model || DEFAULT_GEMINI_MODEL,
      actor: {
        id: session.user.id,
        username: session.user.username,
        role: session.user.role,
      },
    });

    return NextResponse.json(saved);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE() {
  try {
    const session = await requireAuth([ROLES.SUPER_ADMIN]);
    await clearPlatformGeminiKey({
      id: session.user.id,
      username: session.user.username,
      role: session.user.role,
    });
    const cfg = await getPlatformGeminiConfig();
    return NextResponse.json({
      configured: cfg.configured,
      maskedKey: cfg.maskedKey,
      model: cfg.model || DEFAULT_GEMINI_MODEL,
      source: cfg.source,
      updatedAt: cfg.updatedAt,
      updatedByUsername: cfg.updatedByUsername,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
