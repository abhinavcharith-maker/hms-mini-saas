import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLES } from "@/lib/constants";
import { ConsultancyWorkspace } from "@/components/consultancy/ConsultancyWorkspace";

export const dynamic = "force-dynamic";

export default async function HospitalConsultancyPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login?portal=hospital-admin");
  }
  if (session.user.role !== ROLES.HOSPITAL_ADMIN || !session.hospital?.consultancyEnabled) {
    redirect("/hospital");
  }
  return <ConsultancyWorkspace viewerMode="ADMIN" />;
}
