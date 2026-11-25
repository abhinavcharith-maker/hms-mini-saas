import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLES, getHomePathForRole } from "@/lib/constants";
import { HospitalShell } from "@/components/hospital/HospitalShell";
import { getMaintenanceStatus } from "@/lib/maintenance";
import { MaintenanceScreen } from "@/components/ui/MaintenanceScreen";

export const dynamic = "force-dynamic";

export default async function HospitalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, maintenance] = await Promise.all([
    getSession(),
    getMaintenanceStatus(),
  ]);
  if (!session) {
    redirect("/login?portal=hospital-admin");
  }
  if (
    session.user.role !== ROLES.HOSPITAL_ADMIN &&
    session.user.role !== ROLES.RECEPTIONIST
  ) {
    redirect(getHomePathForRole(session.user.role));
  }
  if (!session.hospital) {
    redirect("/login");
  }

  if (maintenance.active) {
    return (
      <MaintenanceScreen
        maintenance={maintenance}
        user={{
          username: session.user.username,
          fullName: session.user.fullName,
          role: session.user.role,
        }}
        hospitalName={session.hospital.name}
      />
    );
  }

  return (
    <HospitalShell
      user={{
        username: session.user.username,
        fullName: session.user.fullName,
        role: session.user.role,
      }}
      hospital={{
        name: session.hospital.name,
        code: session.hospital.code,
        logoDataUrl: session.hospital.logoDataUrl,
        pharmacyMode: session.hospital.pharmacyMode,
        consultancyEnabled: session.hospital.consultancyEnabled,
      }}
    >
      {children}
    </HospitalShell>
  );
}
