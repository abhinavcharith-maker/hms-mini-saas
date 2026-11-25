import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLES, getHomePathForRole } from "@/lib/constants";
import { SuperAdminShell } from "@/components/super-admin/SuperAdminShell";

export const dynamic = "force-dynamic";

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login?portal=super-admin");
  }
  if (session.user.role !== ROLES.SUPER_ADMIN) {
    redirect(getHomePathForRole(session.user.role));
  }

  return (
    <SuperAdminShell
      user={{
        username: session.user.username,
        fullName: session.user.fullName,
        role: session.user.role,
      }}
    >
      {children}
    </SuperAdminShell>
  );
}
