export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  HOSPITAL_ADMIN: "HOSPITAL_ADMIN",
  RECEPTIONIST: "RECEPTIONIST",
  DOCTOR: "DOCTOR",
  PHARMACY_USER: "PHARMACY_USER",
  LAB_USER: "LAB_USER",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const PORTAL_LOGIN_OPTIONS = [
  {
    key: "hospital-admin",
    role: ROLES.HOSPITAL_ADMIN,
    label: "Hospital Admin",
    shortLabel: "Admin",
    description: "Manage OP, IP beds, consultancy, referrals, catalogues, staff & settings",
    homePath: "/hospital",
  },
  {
    key: "receptionist",
    role: ROLES.RECEPTIONIST,
    label: "Receptionist",
    shortLabel: "Reception",
    description: "Front-desk OP registrations, admissions & patient referrals",
    homePath: "/hospital",
  },
  {
    key: "doctor",
    role: ROLES.DOCTOR,
    label: "Doctor Portal",
    shortLabel: "Doctor",
    description: "Review today's patient consultations, prescribe medicines & refer lab tests",
    homePath: "/doctor",
  },
  {
    key: "pharmacy",
    role: ROLES.PHARMACY_USER,
    label: "Pharmacy Portal",
    shortLabel: "Pharmacy",
    description: "View assigned medicine referrals, prescriptions & pharmacy management",
    homePath: "/pharmacy",
  },
  {
    key: "laboratory",
    role: ROLES.LAB_USER,
    label: "Laboratory Portal",
    shortLabel: "Laboratory",
    description: "View assigned diagnostic referrals and confirm completion",
    homePath: "/laboratory",
  },
  {
    key: "super-admin",
    role: ROLES.SUPER_ADMIN,
    label: "Super Admin",
    shortLabel: "Super Admin",
    description: "Platform governance, hospitals, payments, analytics & JSON backup/restore",
    homePath: "/super-admin",
  },
] as const;

export function getHomePathForRole(role: string): string {
  switch (role) {
    case ROLES.SUPER_ADMIN:
      return "/super-admin";
    case ROLES.HOSPITAL_ADMIN:
    case ROLES.RECEPTIONIST:
      return "/hospital";
    case ROLES.DOCTOR:
      return "/doctor";
    case ROLES.PHARMACY_USER:
      return "/pharmacy";
    case ROLES.LAB_USER:
      return "/laboratory";
    default:
      return "/login";
  }
}

export function getRoleLabel(role: string): string {
  switch (role) {
    case ROLES.SUPER_ADMIN:
      return "Super Admin";
    case ROLES.HOSPITAL_ADMIN:
      return "Hospital Admin";
    case ROLES.RECEPTIONIST:
      return "Receptionist";
    case ROLES.DOCTOR:
      return "Doctor";
    case ROLES.PHARMACY_USER:
      return "Pharmacy";
    case ROLES.LAB_USER:
      return "Laboratory";
    default:
      return role;
  }
}

export const BED_STATUS = {
  AVAILABLE: "AVAILABLE",
  OCCUPIED: "OCCUPIED",
  INACTIVE: "INACTIVE",
} as const;

export const IP_STATUS = {
  ADMITTED: "ADMITTED",
  DISCHARGED: "DISCHARGED",
} as const;

export const REFERRAL_STATUS = {
  PENDING: "PENDING",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const;

export const PHARMACY_MODE = {
  REFERRALS: "REFERRALS",
  MANAGEMENT: "MANAGEMENT",
} as const;

export type PharmacyMode = (typeof PHARMACY_MODE)[keyof typeof PHARMACY_MODE];

export const SESSION_COOKIE_NAME = "verdant_hms_session";
export const SESSION_TTL_HOURS = 12;
export const BACKUP_FORMAT = "verdantcare-hms-backup";
export const BACKUP_SCHEMA_VERSION = "2.0.0";
export const SUPPORTED_BACKUP_VERSIONS = ["1.0.0", "2.0.0"] as const;
