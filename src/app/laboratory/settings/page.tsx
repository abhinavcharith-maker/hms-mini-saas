import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ChangePasswordCard } from "@/components/ui/ChangePasswordCard";

export const dynamic = "force-dynamic";

export default async function LaboratorySettingsPage() {
  const session = await getSession();
  if (!session || !session.labAccount || !session.hospital) {
    redirect("/login?portal=laboratory");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-[#0f241d]">
          Laboratory Account Settings
        </h1>
        <p className="mt-1 text-sm text-[#466356]">
          View your assigned external laboratory details and update your password.
        </p>
      </div>

      <ChangePasswordCard
        user={session.user}
        extraInfo={[
          { label: "Laboratory Name", value: session.labAccount.labName },
          { label: "Contact Person", value: session.labAccount.contactPerson },
          { label: "Phone", value: session.labAccount.phone },
          {
            label: "Partner Hospital",
            value: `${session.hospital.name} (${session.hospital.code})`,
          },
        ]}
      />
    </div>
  );
}
