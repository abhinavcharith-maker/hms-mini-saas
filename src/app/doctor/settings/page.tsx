import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ChangePasswordCard } from "@/components/ui/ChangePasswordCard";

export const dynamic = "force-dynamic";

export default async function DoctorSettingsPage() {
  const session = await getSession();
  if (!session || !session.doctor || !session.hospital) {
    redirect("/login?portal=doctor");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-[#0f241d]">
          Doctor Account Settings
        </h1>
      </div>

      <ChangePasswordCard
        user={session.user}
        extraInfo={[
          { label: "Doctor Name", value: session.doctor.name },
          {
            label: "Specialty",
            value: session.doctor.specialty || "General Medicine",
          },
          {
            label: "Qualification",
            value: session.doctor.qualification || "—",
          },
          {
            label: "Phone",
            value: session.doctor.phone || "—",
          },
          {
            label: "Hospital",
            value: `${session.hospital.name} (${session.hospital.code})`,
          },
        ]}
      />
    </div>
  );
}
