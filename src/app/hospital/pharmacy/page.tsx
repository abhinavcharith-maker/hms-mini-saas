import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { PHARMACY_MODE, ROLES } from "@/lib/constants";
import { HospitalPharmacyReferralsView } from "@/components/hospital/HospitalPharmacyReferralsView";
import { PharmacyManagementWorkspace } from "@/components/pharmacy-mgmt/PharmacyManagementWorkspace";

export const dynamic = "force-dynamic";

export default async function HospitalPharmacyPage() {
  const session = await getSession();
  if (!session || !session.hospital) {
    redirect("/login");
  }

  if (session.hospital.pharmacyMode === PHARMACY_MODE.MANAGEMENT) {
    if (session.user.role === ROLES.RECEPTIONIST) {
      redirect("/hospital");
    }
    return <PharmacyManagementWorkspace />;
  }

  return <HospitalPharmacyReferralsView />;
}
