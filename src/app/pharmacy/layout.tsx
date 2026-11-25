import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLES, getHomePathForRole } from "@/lib/constants";
import { PharmacyShell } from "@/components/pharmacy/PharmacyShell";
import { getMaintenanceStatus } from "@/lib/maintenance";
import { MaintenanceScreen } from "@/components/ui/MaintenanceScreen";

export const dynamic = "force-dynamic";

export default async function PharmacyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, maintenance] = await Promise.all([
    getSession(),
    getMaintenanceStatus(),
  ]);
  if (!session) {
    redirect("/login?portal=pharmacy");
  }
  if (session.user.role !== ROLES.PHARMACY_USER) {
    redirect(getHomePathForRole(session.user.role));
  }
  if (!session.hospital || !session.pharmacyAccount) {
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
        hospitalName={`${session.pharmacyAccount.pharmacyName} (${session.hospital.code})`}
      />
    );
  }

  return (
    <PharmacyShell
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
      }}
      pharmacyName={session.pharmacyAccount.pharmacyName}
    >
      {children}
    </PharmacyShell>
  );
}
