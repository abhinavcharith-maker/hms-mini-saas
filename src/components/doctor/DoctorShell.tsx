"use client";

import React from "react";
import { Settings, Stethoscope } from "lucide-react";
import { PortalShell } from "@/components/ui/PortalShell";

export function DoctorShell({
  user,
  hospital,
  doctorName,
  doctorSpecialty,
  children,
}: {
  user: { username: string; fullName: string; role: string };
  hospital: {
    name: string;
    code: string;
    logoDataUrl?: string | null;
  };
  doctorName: string;
  doctorSpecialty?: string | null;
  children: React.ReactNode;
}) {
  // Strictly TWO options only for Doctor's Portal: Consultancy and Settings
  const navItems = [
    {
      href: "/doctor",
      label: "Consultancy",
      icon: <Stethoscope className="h-4 w-4" />,
    },
    {
      href: "/doctor/settings",
      label: "Settings",
      icon: <Settings className="h-4 w-4" />,
    },
  ];

  return (
    <PortalShell
      navItems={navItems}
      portalTitle={doctorName}
      portalSubtitle={
        doctorSpecialty
          ? `${doctorSpecialty} · ${hospital.code}`
          : `Doctor Portal · ${hospital.code}`
      }
      user={user}
      hospital={hospital}
    >
      {children}
    </PortalShell>
  );
}
