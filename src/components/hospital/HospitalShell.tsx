"use client";

import React from "react";
import {
  BarChart3,
  BedDouble,
  ClipboardPlus,
  FlaskConical,
  History,
  LayoutDashboard,
  Pill,
  Settings,
  Stethoscope,
  UserCog,
  Users,
} from "lucide-react";
import { PortalShell } from "@/components/ui/PortalShell";
import { PHARMACY_MODE, ROLES, type PharmacyMode } from "@/lib/constants";

export function HospitalShell({
  user,
  hospital,
  children,
}: {
  user: { username: string; fullName: string; role: string };
  hospital: {
    name: string;
    code: string;
    logoDataUrl?: string | null;
    pharmacyMode?: PharmacyMode;
    consultancyEnabled?: boolean;
  };
  children: React.ReactNode;
}) {
  const isAdmin = user.role === ROLES.HOSPITAL_ADMIN;
  const isFullPharmacyMgmt = hospital.pharmacyMode === PHARMACY_MODE.MANAGEMENT;
  const isConsultancyEnabled = hospital.consultancyEnabled !== false;

  const navItems = [
    {
      href: "/hospital",
      label: "Dashboard",
      icon: <LayoutDashboard className="h-4 w-4" />,
    },
    ...(isAdmin && isConsultancyEnabled
      ? [
          {
            href: "/hospital/consultancy",
            label: "Consultancy",
            icon: <ClipboardPlus className="h-4 w-4" />,
          },
        ]
      : []),
    {
      href: "/hospital/op",
      label: "OP Registration",
      icon: <Stethoscope className="h-4 w-4" />,
    },
    {
      href: "/hospital/ip",
      label: "IP Management",
      icon: <BedDouble className="h-4 w-4" />,
    },
    // When Super Admin enables Pharmacy Management, ONLY Hospital Admin (and Pharmacy Login) see it — hidden from Receptionist.
    // When Pharmacy Referrals mode is active, both Admin and Receptionist see Pharmacy Referrals.
    ...(isFullPharmacyMgmt
      ? isAdmin
        ? [
            {
              href: "/hospital/pharmacy",
              label: "Pharmacy Management",
              icon: <Pill className="h-4 w-4" />,
            },
          ]
        : []
      : [
          {
            href: "/hospital/pharmacy",
            label: "Pharmacy Referrals",
            icon: <Pill className="h-4 w-4" />,
          },
        ]),
    {
      href: "/hospital/laboratory",
      label: "Laboratory Referrals",
      icon: <FlaskConical className="h-4 w-4" />,
    },
    ...(isAdmin
      ? [
          {
            href: "/hospital/history",
            label: "Recent Changes",
            icon: <History className="h-4 w-4" />,
          },
        ]
      : []),
    {
      href: "/hospital/patient-history",
      label: "Patient History",
      icon: <Users className="h-4 w-4" />,
    },
    ...(isAdmin
      ? [
          {
            href: "/hospital/management",
            label: "Management",
            icon: <UserCog className="h-4 w-4" />,
          },
          {
            href: "/hospital/reports",
            label: "Reports & Analytics",
            icon: <BarChart3 className="h-4 w-4" />,
          },
        ]
      : []),
    {
      href: "/hospital/settings",
      label: isAdmin ? "Account & Settings" : "Settings",
      icon: <Settings className="h-4 w-4" />,
    },
  ];

  return (
    <PortalShell
      navItems={navItems}
      portalTitle={isAdmin ? "Hospital Admin" : "Reception Desk"}
      user={user}
      hospital={hospital}
    >
      {children}
    </PortalShell>
  );
}
