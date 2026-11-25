import crypto from "crypto";
import bcrypt from "bcryptjs";

function scryptDerive(
  password: crypto.BinaryLike,
  salt: crypto.BinaryLike,
  keylen: number,
  options: crypto.ScryptOptions
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

// Memory-hard scrypt parameters (32 MiB RAM per hash: GPU/ASIC-resistant)
const SCRYPT_PREFIX = "$scrypt$v1$";
const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

function getPasswordPepper(): Buffer {
  const raw =
    process.env.PASSWORD_PEPPER ??
    process.env.SESSION_SECRET ??
    "local-dev-session-pepper";
  return crypto
    .createHash("sha256")
    .update(`hospitalpro:password-pepper:v1:${raw}`)
    .digest();
}

function pepperPassword(plain: string): Buffer {
  return crypto.createHmac("sha512", getPasswordPepper()).update(plain, "utf8").digest();
}

export async function hashPassword(plain: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const peppered = pepperPassword(plain);
  const derived = await scryptDerive(peppered, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });
  return `${SCRYPT_PREFIX}N=${SCRYPT_N},r=${SCRYPT_R},p=${SCRYPT_P}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export function needsPasswordRehash(hash: string): boolean {
  return !hash.startsWith(SCRYPT_PREFIX);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  if (hash.startsWith(SCRYPT_PREFIX)) {
    const parts = hash.slice(SCRYPT_PREFIX.length).split("$");
    if (parts.length !== 3) return false;
    const [paramStr, saltHex, expectedHex] = parts;
    const params = Object.fromEntries(
      paramStr.split(",").map((kv) => {
        const [k, v] = kv.split("=");
        return [k, Number(v)];
      })
    );
    const N = Number(params.N);
    const r = Number(params.r);
    const p = Number(params.p);
    if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) {
      return false;
    }
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(expectedHex, "hex");
    if (salt.length < 8 || expected.length < 32) return false;

    const peppered = pepperPassword(plain);
    const derived = await scryptDerive(peppered, salt, expected.length, {
      N,
      r,
      p,
      maxmem: Math.max(SCRYPT_MAXMEM, 256 * N * r),
    });

    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  }

  // Seamless backwards compatibility for legacy bcrypt hashes ($2a$ / $2b$)
  if (hash.startsWith("$2a$") || hash.startsWith("$2b$") || hash.startsWith("$2y$")) {
    return bcrypt.compare(plain, hash);
  }

  return false;
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function hashSessionToken(token: string): string {
  const secret = process.env.SESSION_SECRET ?? "local-dev-session-pepper";
  return crypto.createHmac("sha256", secret).update(token).digest("hex");
}

export function generateTempPassword(length = 12): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$";
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
}

export function computeSha256(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

type AttemptEntry = {
  count: number;
  windowStart: number;
  blockedUntil?: number;
};

const globalRateStore = globalThis as unknown as {
  __hmsLoginRateLimiter?: Map<string, AttemptEntry>;
};

const rateStore = (globalRateStore.__hmsLoginRateLimiter ??= new Map());

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const BLOCK_MS = 15 * 60 * 1000;
const MAX_RATE_ENTRIES = 10_000;

function pruneRateStore(now: number) {
  if (rateStore.size < MAX_RATE_ENTRIES) return;
  for (const [k, v] of rateStore) {
    const expiredBlock = !v.blockedUntil || v.blockedUntil <= now;
    if (expiredBlock && now - v.windowStart > WINDOW_MS) {
      rateStore.delete(k);
    }
  }
  // If still above cap under an active flood, drop oldest entries
  while (rateStore.size >= MAX_RATE_ENTRIES) {
    const oldestKey = rateStore.keys().next().value;
    if (oldestKey === undefined) break;
    rateStore.delete(oldestKey);
  }
}

export function checkLoginRateLimit(key: string): { allowed: boolean; retryAfterSec?: number } {
  const now = Date.now();
  const entry = rateStore.get(key);
  if (!entry) return { allowed: true };

  if (entry.blockedUntil && entry.blockedUntil > now) {
    return {
      allowed: false,
      retryAfterSec: Math.ceil((entry.blockedUntil - now) / 1000),
    };
  }

  if (now - entry.windowStart > WINDOW_MS) {
    rateStore.delete(key);
    return { allowed: true };
  }

  return { allowed: true };
}

export function recordFailedLoginAttempt(key: string, maxAttempts = MAX_ATTEMPTS): void {
  const now = Date.now();
  pruneRateStore(now);
  const entry = rateStore.get(key);

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    rateStore.set(key, { count: 1, windowStart: now });
    return;
  }

  const nextCount = entry.count + 1;
  if (nextCount >= maxAttempts) {
    rateStore.set(key, {
      count: nextCount,
      windowStart: entry.windowStart,
      blockedUntil: now + BLOCK_MS,
    });
  } else {
    rateStore.set(key, {
      count: nextCount,
      windowStart: entry.windowStart,
    });
  }
}

export function clearLoginAttempts(key: string): void {
  rateStore.delete(key);
}
