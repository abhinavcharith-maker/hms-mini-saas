import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ChangePasswordCard } from "@/components/ui/ChangePasswordCard";
import { GeminiApiKeyCard } from "@/components/super-admin/GeminiApiKeyCard";

export const dynamic = "force-dynamic";

export default async function SuperAdminSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login?portal=super-admin");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-[#0f241d]">
          Super Admin Settings
        </h1>
      </div>

      <GeminiApiKeyCard />

      <ChangePasswordCard
        user={session.user}
        extraInfo={[
          { label: "Platform Role", value: "Global SaaS Owner" },
          { label: "Tenant Scope", value: "All Hospitals" },
        ]}
      />
    </div>
  );
}
