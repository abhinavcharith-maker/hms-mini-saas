import { ConsultancyWorkspace } from "@/components/consultancy/ConsultancyWorkspace";

export const dynamic = "force-dynamic";

export default function DoctorConsultancyPage() {
  return <ConsultancyWorkspace viewerMode="DOCTOR" />;
}
