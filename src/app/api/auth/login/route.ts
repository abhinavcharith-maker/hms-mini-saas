import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  ROLES,
  SESSION_COOKIE_NAME,
  getHomePathForRole,
  getRoleLabel,
} from "@/lib/constants";
import { loginSchema } from "@/lib/validators";
import {
  checkLoginRateLimit,
  clearLoginAttempts,
  hashPassword,
  needsPasswordRehash,
  recordFailedLoginAttempt,
  verifyPassword,
} from "@/lib/security";
import {
  cleanupExpiredSessions,
  createUserSession,
  revokeSessionByToken,
  setSessionCookie,
} from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { formatMaintenanceMessage, getMaintenanceStatus } from "@/lib/maintenance";
import { ApiError, getRequestClientInfo, handleApiError } from "@/lib/api-utils";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = loginSchema.parse(body);
    const { ipAddress, userAgent } = getRequestClientInfo(request);

    const rateKey = `${ipAddress}:${input.username.toLowerCase()}`;
    const ipRateKey = `ip:${ipAddress}`;
    const rateCheck = checkLoginRateLimit(rateKey);
    const ipRateCheck = checkLoginRateLimit(ipRateKey);
    if (!rateCheck.allowed || !ipRateCheck.allowed) {
      const retryAfter = Math.max(
        rateCheck.retryAfterSec ?? 0,
        ipRateCheck.retryAfterSec ?? 0,
        60
      );
      return NextResponse.json(
        {
          error: `Too many failed login attempts. Please wait ${retryAfter} seconds and try again.`,
          code: "RATE_LIMITED",
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfter),
          },
        }
      );
    }

    const user = await prisma.user.findUnique({
      where: { username: input.username },
      include: {
        hospital: true,
        doctor: true,
        pharmacyAccount: true,
        labAccount: true,
      },
    });

    if (!user) {
      recordFailedLoginAttempt(rateKey);
      recordFailedLoginAttempt(ipRateKey, 40);
      throw new ApiError(401, "Invalid username or password.", "INVALID_CREDENTIALS");
    }

    const validPassword = await verifyPassword(input.password, user.passwordHash);
    if (!validPassword) {
      recordFailedLoginAttempt(rateKey);
      recordFailedLoginAttempt(ipRateKey, 40);
      await recordAuditLog({
        hospitalId: user.hospitalId,
        actorUserId: user.id,
        actorUsername: user.username,
        actorRole: user.role,
        actionType: "LOGIN_FAILED",
        details: `Failed login attempt for username "${user.username}" from ${ipAddress}.`,
      });
      throw new ApiError(401, "Invalid username or password.", "INVALID_CREDENTIALS");
    }

    const activeRoles = Object.values(ROLES) as string[];
    if (!activeRoles.includes(user.role)) {
      throw new ApiError(
        403,
        "This portal account role is no longer supported.",
        "PORTAL_UNAVAILABLE"
      );
    }

    if (input.portalRole && user.role !== input.portalRole) {
      throw new ApiError(
        403,
        `This account belongs to the ${getRoleLabel(user.role)} portal, not the ${getRoleLabel(input.portalRole)} portal.`,
        "PORTAL_MISMATCH"
      );
    }

    if (user.role !== ROLES.SUPER_ADMIN) {
      const maintenance = await getMaintenanceStatus();
      if (maintenance.active) {
        clearLoginAttempts(rateKey);
        throw new ApiError(
          503,
          formatMaintenanceMessage(maintenance),
          "MAINTENANCE_ACTIVE",
          { maintenance }
        );
      }
    }

    if (!user.isActive) {
      throw new ApiError(
        403,
        "Your user account has been deactivated. Contact your administrator.",
        "ACCOUNT_DEACTIVATED"
      );
    }

    if (user.role !== ROLES.SUPER_ADMIN) {
      if (!user.hospital || !user.hospital.isActive) {
        throw new ApiError(
          403,
          "This hospital account is currently deactivated. Please contact the platform Super Admin.",
          "HOSPITAL_DEACTIVATED"
        );
      }
    }

    if (user.role === ROLES.DOCTOR) {
      if (!user.hospital?.consultancyEnabled) {
        throw new ApiError(
          403,
          "Consultancy & Doctor Portal is currently disabled for this hospital. Contact your administrator.",
          "CONSULTANCY_DISABLED"
        );
      }
      if (
        !user.doctor ||
        !user.doctor.isActive ||
        user.doctor.hospitalId !== user.hospitalId
      ) {
        throw new ApiError(
          403,
          "This doctor portal account is currently inactive.",
          "DOCTOR_DEACTIVATED"
        );
      }
    }

    if (user.role === ROLES.PHARMACY_USER) {
      if (
        !user.pharmacyAccount ||
        !user.pharmacyAccount.isActive ||
        user.pharmacyAccount.hospitalId !== user.hospitalId
      ) {
        throw new ApiError(
          403,
          "This pharmacy partner account is currently inactive.",
          "PHARMACY_DEACTIVATED"
        );
      }
    }

    if (user.role === ROLES.LAB_USER) {
      if (
        !user.labAccount ||
        !user.labAccount.isActive ||
        user.labAccount.hospitalId !== user.hospitalId
      ) {
        throw new ApiError(
          403,
          "This laboratory partner account is currently inactive.",
          "LAB_DEACTIVATED"
        );
      }
    }

    clearLoginAttempts(rateKey);

    // Revoke any prior browser session token before issuing a fresh session (prevents stale session carryover)
    const cookieStore = await cookies();
    const priorToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (priorToken) {
      await revokeSessionByToken(priorToken).catch(() => {});
    }

    // Transparently upgrade legacy bcrypt hashes to memory-hard peppered scrypt on login
    const upgradedHash = needsPasswordRehash(user.passwordHash)
      ? await hashPassword(input.password)
      : undefined;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        ...(upgradedHash ? { passwordHash: upgradedHash } : {}),
      },
    });

    const { token, expiresAt } = await createUserSession({
      userId: user.id,
      hospitalId: user.hospitalId,
      ipAddress,
      userAgent,
    });
    await setSessionCookie(token, expiresAt, request);

    // Opportunistic non-blocking garbage collection of expired/revoked sessions
    void cleanupExpiredSessions().catch(() => {});

    await recordAuditLog({
      hospitalId: user.hospitalId,
      actorUserId: user.id,
      actorUsername: user.username,
      actorRole: user.role,
      actionType: "LOGIN_SUCCESS",
      details: `${getRoleLabel(user.role)} "${user.username}" signed in successfully.`,
    });

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        hospitalId: user.hospitalId,
      },
      redirectTo: getHomePathForRole(user.role),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
