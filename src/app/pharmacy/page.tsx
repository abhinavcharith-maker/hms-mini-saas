import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { PHARMACY_MODE } from "@/lib/constants";
import { PharmacyReferralsPortalView } from "@/components/pharmacy/PharmacyReferralsPortalView";
import { PharmacyManagementWorkspace } from "@/components/pharmacy-mgmt/PharmacyManagementWorkspace";

export const dynamic = "force-dynamic";

export default async function PharmacyPortalPage() {
  const session = await getSession();
  if (!session || !session.hospital) {
    redirect("/login?portal=pharmacy");
  }

  if (session.hospital.pharmacyMode === PHARMACY_MODE.MANAGEMENT) {
    return <PharmacyManagementWorkspace />;
  }

  return <PharmacyReferralsPortalView />;
}
