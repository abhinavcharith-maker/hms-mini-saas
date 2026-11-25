import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLES, getHomePathForRole } from "@/lib/constants";
import { DoctorShell } from "@/components/doctor/DoctorShell";
import { getMaintenanceStatus } from "@/lib/maintenance";
import { MaintenanceScreen } from "@/components/ui/MaintenanceScreen";

export const dynamic = "force-dynamic";

export default async function DoctorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, maintenance] = await Promise.all([
    getSession(),
    getMaintenanceStatus(),
  ]);
  if (!session) {
    redirect("/login?portal=doctor");
  }
  if (session.user.role !== ROLES.DOCTOR) {
    redirect(getHomePathForRole(session.user.role));
  }
  if (!session.hospital || !session.doctor || !session.hospital.consultancyEnabled) {
    redirect("/login?portal=doctor");
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
        hospitalName={`${session.doctor.name} (${session.hospital.code})`}
      />
    );
  }

  return (
    <DoctorShell
      user={{
        username: session.user.username,
        fullName: session.user.fullName,
        role: session.user.role,
      }}
      hospital={{
        name: session.hospital.name,
        code: session.hospital.code,
        logoDataUrl: session.hospital.logoDataUrl,
      }}
      doctorName={session.doctor.name}
      doctorSpecialty={session.doctor.specialty}
    >
      {children}
    </DoctorShell>
  );
}
