"use client";

import React from "react";
import { Pill, Settings } from "lucide-react";
import { PortalShell } from "@/components/ui/PortalShell";
import { PHARMACY_MODE, type PharmacyMode } from "@/lib/constants";

export function PharmacyShell({
  user,
  hospital,
  pharmacyName,
  children,
}: {
  user: { username: string; fullName: string; role: string };
  hospital: {
    name: string;
    code: string;
    logoDataUrl?: string | null;
    pharmacyMode?: PharmacyMode;
  };
  pharmacyName: string;
  children: React.ReactNode;
}) {
  const isManagement = hospital.pharmacyMode === PHARMACY_MODE.MANAGEMENT;

  const navItems = [
    {
      href: "/pharmacy",
      label: isManagement ? "Pharmacy Management" : "Pharmacy Referrals",
      icon: <Pill className="h-4 w-4" />,
    },
    {
      href: "/pharmacy/settings",
      label: "Settings",
      icon: <Settings className="h-4 w-4" />,
    },
  ];

  return (
    <PortalShell
      navItems={navItems}
      portalTitle={pharmacyName}
      portalSubtitle={
        isManagement
          ? `Pharmacy Management · ${hospital.code}`
          : `Pharmacy Referrals · ${hospital.code}`
      }
      user={user}
      hospital={hospital}
    >
      {children}
    </PortalShell>
  );
}
