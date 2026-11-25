import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { ROLES } from "@/lib/constants";
import { getMaintenanceStatus } from "@/lib/maintenance";
import { LandingGateway } from "@/components/auth/LandingGateway";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [session, superAdminCount, maintenance] = await Promise.all([
    getSession(),
    prisma.user.count({ where: { role: ROLES.SUPER_ADMIN } }),
    getMaintenanceStatus(),
  ]);

  return (
    <LandingGateway
      needsSetup={superAdminCount === 0}
      maintenance={maintenance}
      activeUser={
        session
          ? { fullName: session.user.fullName, role: session.user.role }
          : null
      }
    />
  );
}
