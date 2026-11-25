import { cookies } from "next/headers";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import {
  PHARMACY_MODE,
  ROLES,
  SESSION_COOKIE_NAME,
  SESSION_TTL_HOURS,
  type PharmacyMode,
  type Role,
} from "./constants";
import { generateSessionToken, hashSessionToken } from "./security";
import { ApiError } from "./api-utils";
import { assertNotUnderMaintenanceForRole } from "./maintenance";

export interface SessionContext {
  sessionId: string;
  user: {
    id: string;
    username: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    role: Role;
    hospitalId: string | null;
    isActive: boolean;
    passwordChangedAt: Date | null;
  };
  hospital: {
    id: string;
    code: string;
    name: string;
    slug: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    logoDataUrl: string | null;
    tagline: string | null;
    registrationNo: string | null;
    defaultConsultationFee: number | null;
    pharmacyMode: PharmacyMode;
    consultancyEnabled: boolean;
    uhidPrefix: string;
    isActive: boolean;
  } | null;
  doctor: {
    id: string;
    name: string;
    specialty: string | null;
    qualification: string | null;
    phone: string | null;
    consultationFee: number | null;
    isActive: boolean;
  } | null;
  pharmacyAccount: {
    id: string;
    pharmacyName: string;
    contactPerson: string;
    phone: string;
    address: string | null;
    isActive: boolean;
  } | null;
  labAccount: {
    id: string;
    labName: string;
    contactPerson: string;
    phone: string;
    address: string | null;
    isActive: boolean;
  } | null;
}

export async function createUserSession(params: {
  userId: string;
  hospitalId: string | null;
  ipAddress?: string;
  userAgent?: string;
}) {
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      tokenHash,
      userId: params.userId,
      hospitalId: params.hospitalId,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
      expiresAt,
    },
  });

  return { token, expiresAt };
}

function shouldUseSecureCookie(request?: Request): boolean {
  if (process.env.COOKIE_SECURE === "true") return true;
  if (process.env.COOKIE_SECURE === "false") return false;
  if (request) {
    const forwardedProto = request.headers
      .get("x-forwarded-proto")
      ?.split(",")[0]
      ?.trim()
      .toLowerCase();
    if (forwardedProto === "https") return true;
    if (forwardedProto === "http") return false;
    try {
      const protocol = new URL(request.url).protocol;
      if (protocol === "https:") return true;
      if (protocol === "http:") return false;
    } catch {
      // fall through
    }
  }
  if (process.env.APP_URL?.startsWith("https://")) {
    return true;
  }
  return false;
}

export async function setSessionCookie(
  token: string,
  expiresAt: Date,
  request?: Request
) {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookie(request),
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie(request?: Request) {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookie(request),
    path: "/",
    maxAge: 0,
  });
}

export async function cleanupExpiredSessions() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await prisma.session.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: cutoff } },
        { revokedAt: { lt: cutoff } },
      ],
    },
  });
}

export async function revokeSessionByToken(token: string) {
  const tokenHash = hashSessionToken(token);
  await prisma.session.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeUserSessions(
  userId: string,
  tx?: Prisma.TransactionClient,
  exceptSessionId?: string
) {
  const client = tx ?? prisma;
  await client.session.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
    },
    data: { revokedAt: new Date() },
  });
}

export async function revokeHospitalSessions(
  hospitalId: string,
  tx?: Prisma.TransactionClient
) {
  const client = tx ?? prisma;
  await client.session.updateMany({
    where: {
      hospitalId,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
}

export async function getSession(): Promise<SessionContext | null> {
  const store = await cookies();
  const rawToken = store.get(SESSION_COOKIE_NAME)?.value;
  if (!rawToken) return null;

  const tokenHash = hashSessionToken(rawToken);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: {
      user: {
        include: {
          hospital: true,
          doctor: true,
          pharmacyAccount: true,
          labAccount: true,
        },
      },
    },
  });

  if (!session || session.revokedAt !== null || session.expiresAt <= new Date()) {
    return null;
  }

  const { user } = session;
  if (!user || !user.isActive) {
    return null;
  }

  if (user.role !== ROLES.SUPER_ADMIN) {
    if (!user.hospital || !user.hospital.isActive) {
      return null;
    }
    if (session.hospitalId !== user.hospitalId) {
      return null;
    }
  } else if (user.hospitalId !== null || session.hospitalId !== null) {
    return null;
  }

  if (user.role === ROLES.DOCTOR) {
    if (
      !user.hospital?.consultancyEnabled ||
      !user.doctor ||
      !user.doctor.isActive ||
      user.doctor.hospitalId !== user.hospitalId
    ) {
      return null;
    }
  }

  if (user.role === ROLES.PHARMACY_USER) {
    if (
      !user.pharmacyAccount ||
      !user.pharmacyAccount.isActive ||
      user.pharmacyAccount.hospitalId !== user.hospitalId
    ) {
      return null;
    }
  }

  if (user.role === ROLES.LAB_USER) {
    if (
      !user.labAccount ||
      !user.labAccount.isActive ||
      user.labAccount.hospitalId !== user.hospitalId
    ) {
      return null;
    }
  }

  return {
    sessionId: session.id,
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      role: user.role as Role,
      hospitalId: user.hospitalId,
      isActive: user.isActive,
      passwordChangedAt: user.passwordChangedAt,
    },
    hospital: user.hospital
      ? {
          id: user.hospital.id,
          code: user.hospital.code,
          name: user.hospital.name,
          slug: user.hospital.slug,
          address: user.hospital.address,
          phone: user.hospital.phone,
          email: user.hospital.email,
          logoDataUrl: user.hospital.logoDataUrl,
          tagline: user.hospital.tagline,
          registrationNo: user.hospital.registrationNo,
          defaultConsultationFee: user.hospital.defaultConsultationFee,
          pharmacyMode:
            user.hospital.pharmacyMode === PHARMACY_MODE.MANAGEMENT
              ? PHARMACY_MODE.MANAGEMENT
              : PHARMACY_MODE.REFERRALS,
          consultancyEnabled: user.hospital.consultancyEnabled !== false,
          uhidPrefix: user.hospital.uhidPrefix,
          isActive: user.hospital.isActive,
        }
      : null,
    doctor: user.doctor
      ? {
          id: user.doctor.id,
          name: user.doctor.name,
          specialty: user.doctor.specialty,
          qualification: user.doctor.qualification,
          phone: user.doctor.phone,
          consultationFee: user.doctor.consultationFee,
          isActive: user.doctor.isActive,
        }
      : null,
    pharmacyAccount: user.pharmacyAccount
      ? {
          id: user.pharmacyAccount.id,
          pharmacyName: user.pharmacyAccount.pharmacyName,
          contactPerson: user.pharmacyAccount.contactPerson,
          phone: user.pharmacyAccount.phone,
          address: user.pharmacyAccount.address,
          isActive: user.pharmacyAccount.isActive,
        }
      : null,
    labAccount: user.labAccount
      ? {
          id: user.labAccount.id,
          labName: user.labAccount.labName,
          contactPerson: user.labAccount.contactPerson,
          phone: user.labAccount.phone,
          address: user.labAccount.address,
          isActive: user.labAccount.isActive,
        }
      : null,
  };
}

export async function requireAuth(allowedRoles?: Role[]): Promise<SessionContext> {
  const session = await getSession();
  if (!session) {
    throw new ApiError(401, "Authentication required or session expired.", "UNAUTHORIZED");
  }
  if (allowedRoles && !allowedRoles.includes(session.user.role)) {
    throw new ApiError(
      403,
      "You do not have permission to perform this action.",
      "FORBIDDEN"
    );
  }
  await assertNotUnderMaintenanceForRole(session.user.role);
  return session;
}

export async function requireHospitalAuth(allowedRoles: Role[]) {
  const session = await requireAuth(allowedRoles);
  if (!session.user.hospitalId || !session.hospital) {
    throw new ApiError(403, "Hospital tenant context is required.", "TENANT_REQUIRED");
  }
  return {
    ...session,
    hospitalId: session.user.hospitalId,
    hospital: session.hospital,
  };
}

export async function requirePharmacyManagementAuth() {
  const session = await requireHospitalAuth([
    ROLES.HOSPITAL_ADMIN,
    ROLES.PHARMACY_USER,
  ]);
  if (session.hospital.pharmacyMode !== PHARMACY_MODE.MANAGEMENT) {
    throw new ApiError(
      403,
      "Full Pharmacy Management is not enabled for this hospital. This hospital uses Pharmacy Referrals mode.",
      "PHARMACY_MANAGEMENT_DISABLED"
    );
  }
  return session;
}
