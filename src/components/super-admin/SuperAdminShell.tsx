"use client";

import React from "react";
import {
  Activity,
  Building2,
  CreditCard,
  DatabaseBackup,
  Settings,
  Wrench,
} from "lucide-react";
import { PortalShell } from "@/components/ui/PortalShell";
import { SuperAdminAlertsBell } from "@/components/super-admin/SuperAdminAlertsBell";

export function SuperAdminShell({
  user,
  children,
}: {
  user: { username: string; fullName: string; role: string };
  children: React.ReactNode;
}) {
  const navItems = [
    {
      href: "/super-admin",
      label: "Platform Overview",
      icon: <Activity className="h-4 w-4" />,
    },
    {
      href: "/super-admin/hospitals",
      label: "Hospital Accounts",
      icon: <Building2 className="h-4 w-4" />,
    },
    {
      href: "/super-admin/payments",
      label: "Payments",
      icon: <CreditCard className="h-4 w-4" />,
    },
    {
      href: "/super-admin/backup",
      label: "Backup & Restore",
      icon: <DatabaseBackup className="h-4 w-4" />,
    },
    {
      href: "/super-admin/maintenance",
      label: "Maintenance",
      icon: <Wrench className="h-4 w-4" />,
    },
    {
      href: "/super-admin/settings",
      label: "Account Settings",
      icon: <Settings className="h-4 w-4" />,
    },
  ];

  return (
    <PortalShell
      navItems={navItems}
      portalTitle="HospitalPro"
      portalSubtitle="by Zeronnn Technologies"
      user={user}
      headerActions={<SuperAdminAlertsBell />}
    >
      {children}
    </PortalShell>
  );
}
