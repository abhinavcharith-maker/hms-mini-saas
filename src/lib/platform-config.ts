import crypto from "node:crypto";
import { prisma } from "./prisma";
import { recordAuditLog } from "./audit";

export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

function deriveEncryptionKey(): Buffer {
  const secret = process.env.SESSION_SECRET ?? "local-dev-session-pepper";
  return crypto.createHash("sha256").update(`platform-ai-key::${secret}`).digest();
}

export function encryptSecretValue(plaintext: string): string {
  const key = deriveEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptSecretValue(encoded: string): string | null {
  try {
    const parts = encoded.split(":");
    if (parts.length !== 3) return null;
    const iv = Buffer.from(parts[0], "base64");
    const tag = Buffer.from(parts[1], "base64");
    const ciphertext = Buffer.from(parts[2], "base64");
    const key = deriveEncryptionKey();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

export function maskApiKey(raw: string): string {
  const clean = raw.trim();
  if (!clean) return "";
  if (clean.length <= 8) {
    return "•".repeat(Math.max(6, clean.length));
  }
  return `${clean.slice(0, 4)}••••••••${clean.slice(-4)}`;
}

export interface PlatformGeminiConfig {
  apiKey: string;
  model: string;
  configured: boolean;
  maskedKey: string | null;
  source: "DATABASE" | "ENV" | "NONE";
  updatedAt: string | null;
  updatedByUsername: string | null;
}

/**
 * Server-only helper returning the active platform-wide Gemini API key & model.
 * Priority: Super Admin Settings (encrypted in DB) -> process.env.GEMINI_API_KEY fallback.
 */
export async function getPlatformGeminiConfig(): Promise<PlatformGeminiConfig> {
  const row = await prisma.platformConfig.findUnique({
    where: { id: "singleton" },
  });

  const model =
    row?.geminiModel?.trim() ||
    (process.env.GEMINI_MODEL ?? "").trim() ||
    DEFAULT_GEMINI_MODEL;

  if (row?.geminiApiKeyEncrypted) {
    const decrypted = decryptSecretValue(row.geminiApiKeyEncrypted);
    if (decrypted) {
      return {
        apiKey: decrypted,
        model,
        configured: true,
        maskedKey: row.geminiApiKeyMasked ?? maskApiKey(decrypted),
        source: "DATABASE",
        updatedAt: row.updatedAt.toISOString(),
        updatedByUsername: row.updatedByUsername ?? null,
      };
    }
  }

  const envKey = (process.env.GEMINI_API_KEY ?? "").trim();
  if (envKey) {
    return {
      apiKey: envKey,
      model,
      configured: true,
      maskedKey: maskApiKey(envKey),
      source: "ENV",
      updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
      updatedByUsername: row?.updatedByUsername ?? null,
    };
  }

  return {
    apiKey: "",
    model,
    configured: false,
    maskedKey: null,
    source: "NONE",
    updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
    updatedByUsername: row?.updatedByUsername ?? null,
  };
}

export async function savePlatformGeminiConfig(params: {
  apiKey?: string;
  model?: string;
  actor: { id: string; username: string; role: string };
}): Promise<Omit<PlatformGeminiConfig, "apiKey">> {
  const cleanKey = params.apiKey?.trim();
  const cleanModel = params.model?.trim() || DEFAULT_GEMINI_MODEL;

  const existing = await prisma.platformConfig.findUnique({
    where: { id: "singleton" },
  });

  const nextEncrypted = cleanKey
    ? encryptSecretValue(cleanKey)
    : existing?.geminiApiKeyEncrypted ?? null;
  const nextMasked = cleanKey
    ? maskApiKey(cleanKey)
    : existing?.geminiApiKeyMasked ?? null;

  const saved = await prisma.$transaction(async (tx) => {
    const row = await tx.platformConfig.upsert({
      where: { id: "singleton" },
      update: {
        geminiApiKeyEncrypted: nextEncrypted,
        geminiApiKeyMasked: nextMasked,
        geminiModel: cleanModel,
        updatedByUserId: params.actor.id,
        updatedByUsername: params.actor.username,
      },
      create: {
        id: "singleton",
        geminiApiKeyEncrypted: nextEncrypted,
        geminiApiKeyMasked: nextMasked,
        geminiModel: cleanModel,
        updatedByUserId: params.actor.id,
        updatedByUsername: params.actor.username,
      },
    });

    await recordAuditLog(
      {
        hospitalId: null,
        actorUserId: params.actor.id,
        actorUsername: params.actor.username,
        actorRole: params.actor.role,
        actionType: "PLATFORM_AI_CONFIG_UPDATED",
        referenceId: cleanModel,
        details: cleanKey
          ? `Updated platform-wide Gemini API key (${nextMasked}) for model ${cleanModel}.`
          : `Updated platform-wide Gemini model to ${cleanModel}.`,
      },
      tx
    );

    return row;
  });

  return {
    model: saved.geminiModel,
    configured: Boolean(saved.geminiApiKeyEncrypted),
    maskedKey: saved.geminiApiKeyMasked ?? null,
    source: saved.geminiApiKeyEncrypted ? "DATABASE" : "NONE",
    updatedAt: saved.updatedAt.toISOString(),
    updatedByUsername: saved.updatedByUsername ?? null,
  };
}

export async function clearPlatformGeminiKey(actor: {
  id: string;
  username: string;
  role: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.platformConfig.upsert({
      where: { id: "singleton" },
      update: {
        geminiApiKeyEncrypted: null,
        geminiApiKeyMasked: null,
        updatedByUserId: actor.id,
        updatedByUsername: actor.username,
      },
      create: {
        id: "singleton",
        geminiApiKeyEncrypted: null,
        geminiApiKeyMasked: null,
        geminiModel: DEFAULT_GEMINI_MODEL,
        updatedByUserId: actor.id,
        updatedByUsername: actor.username,
      },
    });

    await recordAuditLog(
      {
        hospitalId: null,
        actorUserId: actor.id,
        actorUsername: actor.username,
        actorRole: actor.role,
        actionType: "PLATFORM_AI_KEY_CLEARED",
        referenceId: "singleton",
        details: "Removed stored platform-wide Gemini API key.",
      },
      tx
    );
  });
}
