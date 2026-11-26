import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ChangePasswordCard } from "@/components/ui/ChangePasswordCard";

export const dynamic = "force-dynamic";

export default async function PharmacySettingsPage() {
  const session = await getSession();
  if (!session || !session.pharmacyAccount || !session.hospital) {
    redirect("/login?portal=pharmacy");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-[#0f241d]">
          Pharmacy Account Settings
        </h1>
      </div>

      <ChangePasswordCard
        user={session.user}
        extraInfo={[
          { label: "Pharmacy Name", value: session.pharmacyAccount.pharmacyName },
          { label: "Contact Person", value: session.pharmacyAccount.contactPerson },
          { label: "Phone", value: session.pharmacyAccount.phone },
          {
            label: "Partner Hospital",
            value: `${session.hospital.name} (${session.hospital.code})`,
          },
        ]}
      />
    </div>
  );
}
