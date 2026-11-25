import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { ROLES } from "@/lib/constants";
import { PrintToolbar } from "@/components/print/PrintToolbar";
import { getMaintenanceStatus } from "@/lib/maintenance";
import { MaintenanceScreen } from "@/components/ui/MaintenanceScreen";

export const dynamic = "force-dynamic";

export default async function PrintOpConsultationPage({
  params,
}: {
  params: Promise<{ visitId: string }>;
}) {
  const [session, maintenance] = await Promise.all([
    getSession(),
    getMaintenanceStatus(),
  ]);
  if (
    !session ||
    !session.hospital ||
    (session.user.role !== ROLES.HOSPITAL_ADMIN &&
      session.user.role !== ROLES.RECEPTIONIST)
  ) {
    redirect("/login");
  }
  if (maintenance.active) {
    return (
      <MaintenanceScreen
        maintenance={maintenance}
        user={{
          username: session.user.username,
          fullName: session.user.fullName,
          role: session.user.role,
        }}
        hospitalName={session.hospital.name}
      />
    );
  }

  const { visitId } = await params;
  const visit = await prisma.opVisit.findFirst({
    where: {
      hospitalId: session.hospital.id,
      OR: [{ id: visitId }, { visitNumber: visitId }],
    },
    include: {
      patient: true,
      billingReceipts: { take: 1, orderBy: { issuedAt: "desc" } },
    },
  });

  if (!visit) {
    notFound();
  }

  const snap = visit.billingReceipts[0];
  const hospitalName = snap?.hospitalNameSnapshot ?? session.hospital.name;
  const hospitalAddress = snap?.hospitalAddressSnapshot ?? session.hospital.address;
  const hospitalPhone = snap?.hospitalPhoneSnapshot ?? session.hospital.phone;
  const hospitalEmail = snap?.hospitalEmailSnapshot ?? session.hospital.email;
  const hospitalLogo = snap?.hospitalLogoSnapshot ?? session.hospital.logoDataUrl;

  return (
    <div className="min-h-screen bg-[#eef3ef] pb-12">
      <PrintToolbar
        title={`OP Consultation Sheet · ${visit.visitNumber}`}
        backHref={`/hospital/patients/${encodeURIComponent(visit.patient.uhid)}`}
      />

      <div className="print-sheet mx-auto mt-6 max-w-[210mm] min-h-[275mm] rounded-xl border border-[#d7e7dd] bg-white p-8 shadow-lg flex flex-col justify-between">
        <div>
          {/* Hospital Header */}
          <header className="flex items-start justify-between gap-4 border-b-2 border-[#0d4a38] pb-4">
            <div className="flex items-start gap-4">
              {hospitalLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={hospitalLogo}
                  alt={hospitalName}
                  className="h-16 w-16 object-contain"
                />
              ) : null}
              <div>
                <h1 className="font-display text-2xl font-extrabold uppercase tracking-tight text-[#0d4a38]">
                  {hospitalName}
                </h1>
                {session.hospital.tagline ? (
                  <p className="text-xs font-medium text-[#466356]">
                    {session.hospital.tagline}
                  </p>
                ) : null}
                {hospitalAddress ? (
                  <p className="mt-1 text-xs text-slate-700">{hospitalAddress}</p>
                ) : null}
                <p className="text-xs text-slate-700">
                  {[
                    hospitalPhone ? `Tel: ${hospitalPhone}` : null,
                    hospitalEmail ? `Email: ${hospitalEmail}` : null,
                    session.hospital.registrationNo
                      ? `Reg / License No: ${session.hospital.registrationNo}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </div>

            <div className="text-right shrink-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#0d4a38]">
                OP Consultation & Rx Sheet
              </p>
              <p className="font-mono-id mt-1 text-sm font-bold text-slate-900">
                {visit.visitNumber}
              </p>
              <p className="mt-0.5 text-xs text-slate-600">
                Date: {new Date(visit.visitDate).toLocaleDateString()}
              </p>
            </div>
          </header>

          {/* Patient & Visit Details Box */}
          <section className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 rounded-lg border border-slate-300 bg-slate-50/70 p-4 text-xs">
            <div>
              <span className="text-slate-500 uppercase text-[10px] font-semibold">
                Patient Name
              </span>
              <p className="font-bold text-sm text-slate-900">
                {visit.patient.fullName}
              </p>
            </div>
            <div>
              <span className="text-slate-500 uppercase text-[10px] font-semibold">
                Permanent UHID
              </span>
              <p className="font-mono-id font-bold text-sm text-[#0d4a38]">
                {visit.patient.uhid}
              </p>
            </div>
            <div>
              <span className="text-slate-500 uppercase text-[10px] font-semibold">
                Age / Gender
              </span>
              <p className="font-semibold text-slate-900">
                {visit.patient.age !== null ? `${visit.patient.age} Years` : "—"} /{" "}
                {visit.patient.gender}
              </p>
            </div>
            <div>
              <span className="text-slate-500 uppercase text-[10px] font-semibold">
                Consulting Doctor
              </span>
              <p className="font-semibold text-slate-900">
                {visit.doctorNameSnapshot}
              </p>
            </div>
            <div>
              <span className="text-slate-500 uppercase text-[10px] font-semibold">
                Department
              </span>
              <p className="font-semibold text-slate-900">
                {visit.departmentSnapshot ?? "General Consultation"}
              </p>
            </div>
            <div>
              <span className="text-slate-500 uppercase text-[10px] font-semibold">
                Contact
              </span>
              <p className="font-semibold text-slate-900">{visit.patient.phone}</p>
            </div>
            {visit.reasonForVisit ? (
              <div className="col-span-2 sm:col-span-3 border-t border-slate-200 pt-2 mt-1">
                <span className="text-slate-500 uppercase text-[10px] font-semibold">
                  Reason for Visit / Chief Complaint:{" "}
                </span>
                <span className="text-slate-900">{visit.reasonForVisit}</span>
              </div>
            ) : null}
          </section>

          {/* Clean Empty-Paper Clinical Writing Layout (No in-between or dotted lines) */}
          <div className="mt-6 grid grid-cols-12 gap-6">
            {/* Left Vitals & Diagnosis Column */}
            <div className="col-span-4 space-y-6 pr-4">
              <div>
                <h2 className="text-[11px] font-bold uppercase tracking-wider text-[#0d4a38]">
                  Vitals & Clinical Notes
                </h2>
                <div className="mt-3 space-y-4 text-xs text-slate-600">
                  <p>BP:</p>
                  <p>Pulse:</p>
                  <p>Temp:</p>
                  <p>SpO₂:</p>
                  <p>Weight:</p>
                </div>
                {visit.notes ? (
                  <p className="mt-3 text-[11px] text-slate-700 italic">
                    Triage note: {visit.notes}
                  </p>
                ) : null}
              </div>

              <div className="pt-2">
                <h2 className="text-[11px] font-bold uppercase tracking-wider text-[#0d4a38]">
                  Diagnosis / Findings
                </h2>
                <div className="h-52" />
              </div>
            </div>

            {/* Right Rx & Dosage Column */}
            <div className="col-span-8 flex flex-col justify-between">
              <div>
                <div className="flex items-baseline justify-between">
                  <h2 className="font-display text-lg font-extrabold text-[#0d4a38]">
                    ℞ Prescribed Medicines & Investigations
                  </h2>
                  <span className="text-[10px] uppercase text-slate-500">
                    Dosage · Frequency · Duration
                  </span>
                </div>
                <div className="min-h-[440px]" />
              </div>
            </div>
          </div>
        </div>

        {/* Doctor's Signature Footer */}
        <footer className="print-avoid-break mt-10 flex items-end justify-between pt-6 text-xs text-slate-700">
          <div>
            <p className="font-semibold">Next Review / Follow-Up Date:</p>
            <p className="mt-1 text-[10px] text-slate-500">
              Printed from {hospitalName} · {visit.visitNumber}
            </p>
          </div>
          <div className="text-right">
            <div className="mb-1 h-12 w-52" />
            <p className="font-bold text-slate-900">{visit.doctorNameSnapshot}</p>
            <p className="text-[10px] text-slate-500">Doctor&apos;s Signature</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
