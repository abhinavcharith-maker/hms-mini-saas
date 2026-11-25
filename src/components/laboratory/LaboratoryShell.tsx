"use client";

import React from "react";
import { FlaskConical, Settings } from "lucide-react";
import { PortalShell } from "@/components/ui/PortalShell";

export function LaboratoryShell({
  user,
  hospital,
  labName,
  children,
}: {
  user: { username: string; fullName: string; role: string };
  hospital: { name: string; code: string; logoDataUrl?: string | null };
  labName: string;
  children: React.ReactNode;
}) {
  const navItems = [
    {
      href: "/laboratory",
      label: "Assigned Referrals",
      icon: <FlaskConical className="h-4 w-4" />,
    },
    {
      href: "/laboratory/settings",
      label: "Settings",
      icon: <Settings className="h-4 w-4" />,
    },
  ];

  return (
    <PortalShell
      navItems={navItems}
      portalTitle={labName}
      portalSubtitle={`Diagnostic Partner · ${hospital.code}`}
      user={user}
      hospital={hospital}
    >
      {children}
    </PortalShell>
  );
}
