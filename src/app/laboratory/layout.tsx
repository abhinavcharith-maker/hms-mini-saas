import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLES, getHomePathForRole } from "@/lib/constants";
import { LaboratoryShell } from "@/components/laboratory/LaboratoryShell";
import { getMaintenanceStatus } from "@/lib/maintenance";
import { MaintenanceScreen } from "@/components/ui/MaintenanceScreen";

export const dynamic = "force-dynamic";

export default async function LaboratoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, maintenance] = await Promise.all([
    getSession(),
    getMaintenanceStatus(),
  ]);
  if (!session) {
    redirect("/login?portal=laboratory");
  }
  if (session.user.role !== ROLES.LAB_USER) {
    redirect(getHomePathForRole(session.user.role));
  }
  if (!session.hospital || !session.labAccount) {
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
        hospitalName={`${session.labAccount.labName} (${session.hospital.code})`}
      />
    );
  }

  return (
    <LaboratoryShell
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
      labName={session.labAccount.labName}
    >
      {children}
    </LaboratoryShell>
  );
}
