import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { ROLES } from "@/lib/constants";
import { PrintToolbar } from "@/components/print/PrintToolbar";
import { getMaintenanceStatus } from "@/lib/maintenance";
import { MaintenanceScreen } from "@/components/ui/MaintenanceScreen";

export const dynamic = "force-dynamic";

export default async function PrintReceiptPage({
  params,
}: {
  params: Promise<{ receiptId: string }>;
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

  const { receiptId } = await params;
  const receipt = await prisma.billingReceipt.findFirst({
    where: {
      hospitalId: session.hospital.id,
      OR: [{ id: receiptId }, { receiptNumber: receiptId }],
    },
    include: {
      patient: {
        select: { phone: true, age: true, gender: true, address: true },
      },
    },
  });

  if (!receipt) {
    notFound();
  }

  let lineItems: Array<{ label: string; amount: number }> = [];
  try {
    lineItems = JSON.parse(receipt.lineItemsJson);
  } catch {
    lineItems = [];
  }

  return (
    <div className="min-h-screen bg-[#eef3ef] pb-12">
      <PrintToolbar
        title={`Patient Billing Receipt · ${receipt.receiptNumber}`}
        backHref={`/hospital/patients/${encodeURIComponent(
          receipt.patientUhidSnapshot
        )}`}
      />

      <div className="print-sheet mx-auto mt-6 max-w-[190mm] rounded-xl border border-[#d7e7dd] bg-white p-8 shadow-lg">
        {/* Hospital Snapshot Header */}
        <header className="flex items-start justify-between gap-4 border-b-2 border-[#0d4a38] pb-4">
          <div className="flex items-start gap-4">
            {receipt.hospitalLogoSnapshot ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={receipt.hospitalLogoSnapshot}
                alt={receipt.hospitalNameSnapshot}
                className="h-14 w-14 object-contain"
              />
            ) : null}
            <div>
              <h1 className="font-display text-xl font-extrabold uppercase text-[#0d4a38]">
                {receipt.hospitalNameSnapshot}
              </h1>
              {receipt.hospitalAddressSnapshot ? (
                <p className="text-xs text-slate-700">
                  {receipt.hospitalAddressSnapshot}
                </p>
              ) : null}
              <p className="text-xs text-slate-700">
                {[
                  receipt.hospitalPhoneSnapshot
                    ? `Tel: ${receipt.hospitalPhoneSnapshot}`
                    : null,
                  receipt.hospitalEmailSnapshot
                    ? `Email: ${receipt.hospitalEmailSnapshot}`
                    : null,
                  session.hospital.registrationNo
                    ? `Reg / License No: ${session.hospital.registrationNo}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          </div>

          <div className="text-right">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#0d4a38]">
              Official Billing Receipt
            </p>
            <p className="font-mono-id mt-1 text-sm font-bold text-slate-900">
              {receipt.receiptNumber}
            </p>
            <p className="text-xs text-slate-600">
              Issued: {new Date(receipt.issuedAt).toLocaleString()}
            </p>
          </div>
        </header>

        {/* Patient & Visit Snapshot Details */}
        <section className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-4 rounded-lg border border-slate-300 bg-slate-50/70 p-4 text-xs">
          <div>
            <span className="text-[10px] font-semibold uppercase text-slate-500">
              Patient Name
            </span>
            <p className="font-bold text-sm text-slate-900">
              {receipt.patientNameSnapshot}
            </p>
          </div>
          <div>
            <span className="text-[10px] font-semibold uppercase text-slate-500">
              Permanent UHID
            </span>
            <p className="font-mono-id font-bold text-sm text-[#0d4a38]">
              {receipt.patientUhidSnapshot}
            </p>
          </div>
          <div>
            <span className="text-[10px] font-semibold uppercase text-slate-500">
              Contact / Demographics
            </span>
            <p className="font-semibold text-slate-900">
              {receipt.patient.phone} · {receipt.patient.age ? `${receipt.patient.age}y ` : ""}
              {receipt.patient.gender}
            </p>
          </div>
          <div className="col-span-2 sm:col-span-3 border-t border-slate-200 pt-2">
            <span className="text-[10px] font-semibold uppercase text-slate-500">
              Visit / Service Details:{" "}
            </span>
            <span className="font-semibold text-slate-900">
              {receipt.visitSummarySnapshot}
            </span>
          </div>
        </section>

        {/* Applicable Charges (Strictly configured/entered only) */}
        <section className="mt-6">
          {lineItems.length === 0 ? (
            <div className="rounded-lg border border-slate-300 bg-slate-50 p-5 text-center text-xs text-slate-700">
              <p className="font-semibold">
                Registration & Visit Confirmation Receipt (No Fee Configured)
              </p>
              <p className="mt-1 text-slate-500">
                No consultation or registration charges were entered for this visit.
              </p>
            </div>
          ) : (
            <table className="w-full border-collapse border border-slate-300 text-xs">
              <thead>
                <tr className="bg-slate-100 text-left uppercase text-[11px] text-slate-700">
                  <th className="border border-slate-300 px-4 py-2.5">#</th>
                  <th className="border border-slate-300 px-4 py-2.5">
                    Description of Charge
                  </th>
                  <th className="border border-slate-300 px-4 py-2.5 text-right">
                    Amount (₹)
                  </th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, idx) => (
                  <tr key={idx}>
                    <td className="border border-slate-300 px-4 py-2.5">
                      {idx + 1}
                    </td>
                    <td className="border border-slate-300 px-4 py-2.5 font-medium">
                      {item.label}
                    </td>
                    <td className="border border-slate-300 px-4 py-2.5 text-right font-mono-id">
                      ₹{item.amount.toFixed(2)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-emerald-50 font-bold text-sm">
                  <td
                    colSpan={2}
                    className="border border-slate-300 px-4 py-3 text-right text-[#0d4a38]"
                  >
                    Total Amount
                  </td>
                  <td className="border border-slate-300 px-4 py-3 text-right font-mono-id text-[#0d4a38]">
                    ₹{(receipt.totalAmount ?? 0).toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </section>

        {/* Payment & Authorization Footer */}
        <footer className="mt-8 flex flex-wrap items-end justify-between gap-4 border-t border-slate-300 pt-5 text-xs text-slate-700">
          <div className="space-y-1">
            <p>
              <strong>Payment Status:</strong>{" "}
              {receipt.paymentStatus?.replace(/_/g, " ") ?? "N/A"}
              {receipt.paymentMode ? ` · Mode: ${receipt.paymentMode}` : ""}
            </p>
            <p>
              <strong>Issued By:</strong> {receipt.issuedByNameSnapshot}
            </p>
            <p className="text-[10px] text-slate-500">
              Historical transaction snapshot — amounts preserved permanently.
            </p>
          </div>
          <div className="text-right">
            <div className="mb-1 h-8 w-44 border-b border-slate-400" />
            <p className="font-semibold text-slate-900">
              Authorized Hospital Signatory
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
