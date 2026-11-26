"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { formatAccurateDateTime } from "@/lib/datetime";

interface SaleDosageResponse {
  pharmacyName: string;
  hospital: {
    name: string;
    code: string;
    address: string | null;
    phone: string | null;
    registrationNo: string | null;
  };
  sale: {
    id: string;
    saleNumber: string;
    patientName: string;
    patientPhone: string;
    doctorName: string;
    doctorQualificationSnapshot?: string | null;
    prescriptionId?: string | null;
    soldAt: string;
    items: Array<{
      id: string;
      medicineNameSnapshot: string;
      basicUnitsDeducted: number;
      dosageScheduleSnapshot?: string | null;
      mealTimingSnapshot?: string | null;
      dosageInstructionsSnapshot?: string | null;
    }>;
  };
}

function parseDosageParts(
  schedule?: string | null,
  instructions?: string | null
): { morning: string; afternoon: string; evening: string } {
  const raw = (schedule ?? "").trim();
  const match = raw.match(/^(\d+)\s*[-|/]\s*(\d+)\s*[-|/]\s*(\d+)$/);
  if (match) {
    return { morning: match[1], afternoon: match[2], evening: match[3] };
  }
  const instMatch = (instructions ?? "").match(/(\d+)\s*[-|/]\s*(\d+)\s*[-|/]\s*(\d+)/);
  if (instMatch) {
    return { morning: instMatch[1], afternoon: instMatch[2], evening: instMatch[3] };
  }
  return { morning: "-", afternoon: "-", evening: "-" };
}

function formatMealLabel(
  mealTiming?: string | null,
  instructions?: string | null
): string {
  if (mealTiming === "BEFORE_MEAL") return "Before Meal";
  if (mealTiming === "AFTER_MEAL") return "After Meal";
  const lower = (instructions ?? "").toLowerCase();
  if (lower.includes("before")) return "Before Meal";
  if (lower.includes("after")) return "After Meal";
  return "-";
}

export default function PrintPharmacyDosageSlipPage() {
  const params = useParams<{ saleId: string }>();
  const [data, setData] = useState<SaleDosageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/pharmacy-mgmt/sales/${encodeURIComponent(params.saleId)}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) {
          setError(d.error ?? "Unable to load dosage slip.");
          return;
        }
        setData(d);
      })
      .catch(() => setError("Network error while loading dosage slip."));
  }, [params.saleId]);

  // Combine split FEFO batch rows of the same prescribed medicine into 1 clear usage row for the patient
  const dosageRows = useMemo(() => {
    if (!data) return [];
    const grouped = new Map<
      string,
      {
        medicineName: string;
        totalUnits: number;
        morning: string;
        afternoon: string;
        evening: string;
        mealLabel: string;
      }
    >();

    for (const item of data.sale.items) {
      const parts = parseDosageParts(
        item.dosageScheduleSnapshot,
        item.dosageInstructionsSnapshot
      );
      const mealLabel = formatMealLabel(
        item.mealTimingSnapshot,
        item.dosageInstructionsSnapshot
      );
      const key = `${item.medicineNameSnapshot.toLowerCase()}::${parts.morning}-${parts.afternoon}-${parts.evening}::${mealLabel}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.totalUnits += item.basicUnitsDeducted;
      } else {
        grouped.set(key, {
          medicineName: item.medicineNameSnapshot,
          totalUnits: item.basicUnitsDeducted,
          morning: parts.morning,
          afternoon: parts.afternoon,
          evening: parts.evening,
          mealLabel,
        });
      }
    }

    return Array.from(grouped.values());
  }, [data]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-sm text-rose-700">
        {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-sm text-neutral-600">
        Loading medicine dosage slip...
      </div>
    );
  }

  const { sale, hospital } = data;

  if (!sale.prescriptionId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 text-center text-sm text-neutral-700">
        <p className="font-semibold text-neutral-900">
          No Doctor Prescription Dosage Slip Available
        </p>
        <p className="max-w-md text-xs text-neutral-600">
          Medicine dosage slips are generated exclusively for sales fulfilled from Doctor Consultancy prescriptions.
        </p>
        <button
          type="button"
          onClick={() => window.close()}
          className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-xs font-semibold text-neutral-800 hover:bg-neutral-50 cursor-pointer"
        >
          Close Window
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-100 py-5 px-4 print:min-h-0 print:bg-white print:p-0">
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 8mm 10mm;
          }
          body {
            background: #ffffff !important;
            color: #000000 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>

      {/* Screen-only Action Bar */}
      <div className="no-print mx-auto mb-3 flex max-w-[720px] items-center justify-between">
        <button
          type="button"
          onClick={() => window.close()}
          className="inline-flex items-center gap-2 rounded-xl border border-neutral-300 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-800 hover:bg-neutral-50 cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          Close Window
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-800 cursor-pointer"
        >
          <Printer className="h-4 w-4" />
          Print Dosage Slip (Low-Ink Half Page)
        </button>
      </div>

      {/* Ultra-Compact, Low-Ink Half-Page Patient Usage / Dosage Slip */}
      <div className="mx-auto max-w-[720px] border border-neutral-300 bg-white px-5 py-3.5 text-black shadow-sm print:max-w-none print:border-0 print:px-0 print:py-0 print:shadow-none">
        {/* Header: Hospital Name, Address, Phone, Reg/License No + Slip Title & Inv No */}
        <div className="flex items-start justify-between gap-4 border-b border-black pb-2">
          <div className="min-w-0">
            <h1 className="text-[15px] font-bold uppercase tracking-tight leading-tight text-black">
              {hospital.name}
            </h1>
            {hospital.address ? (
              <p className="mt-0.5 text-[10px] leading-snug text-neutral-800">
                {hospital.address}
              </p>
            ) : null}
            {hospital.phone || hospital.registrationNo ? (
              <p className="text-[10px] leading-snug text-neutral-800">
                {[
                  hospital.phone ? `Ph: ${hospital.phone}` : null,
                  hospital.registrationNo
                    ? `Reg / License No: ${hospital.registrationNo}`
                    : null,
                ]
                  .filter(Boolean)
                  .join("  |  ")}
              </p>
            ) : null}
          </div>

          <div className="shrink-0 text-right leading-snug">
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-black">
              MEDICINE DOSAGE SLIP
            </p>
            <p className="font-mono-id text-[11.5px] font-bold text-black">
              Inv No: {sale.saleNumber}
            </p>
            <p className="text-[9.5px] text-neutral-700">
              {formatAccurateDateTime(sale.soldAt)}
            </p>
          </div>
        </div>

        {/* Patient & Doctor Metadata Strip */}
        <div className="grid grid-cols-3 gap-3 border-b border-neutral-400 py-1.5 text-[10.5px] leading-tight">
          <div className="min-w-0">
            <span className="text-[9px] uppercase text-neutral-600">Patient: </span>
            <strong className="font-semibold text-black">{sale.patientName}</strong>
          </div>
          <div className="min-w-0">
            <span className="text-[9px] uppercase text-neutral-600">Mobile: </span>
            <strong className="font-mono-id font-semibold text-black">
              {sale.patientPhone}
            </strong>
          </div>
          <div className="min-w-0 text-right">
            <span className="text-[9px] uppercase text-neutral-600">Prescribed By: </span>
            <strong className="font-semibold text-black">{sale.doctorName}</strong>
            {sale.doctorQualificationSnapshot ? (
              <span className="text-[9.5px] text-neutral-700">
                {" "}
                ({sale.doctorQualificationSnapshot})
              </span>
            ) : null}
          </div>
        </div>

        {/* Patient-Friendly Dosage Schedule Table */}
        <table className="mt-2 w-full border-collapse text-left text-[10.5px] leading-tight">
          <thead>
            <tr className="border-b border-black text-[9px] font-bold uppercase text-black">
              <th className="py-1 pr-1.5 w-6">#</th>
              <th className="py-1 px-1.5">Medicine Name</th>
              <th className="py-1 px-1.5 text-center w-16">Morning</th>
              <th className="py-1 px-1.5 text-center w-16">Afternoon</th>
              <th className="py-1 px-1.5 text-center w-16">Night</th>
              <th className="py-1 px-1.5 text-center w-24">Meal Timing</th>
              <th className="py-1 pl-1.5 text-right w-16">Qty</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-300">
            {dosageRows.map((row, idx) => (
              <tr key={`${row.medicineName}-${idx}`}>
                <td className="py-1.5 pr-1.5 text-neutral-700">{idx + 1}</td>
                <td className="py-1.5 px-1.5 font-semibold text-black">
                  {row.medicineName}
                </td>
                <td className="py-1.5 px-1.5 text-center font-mono-id text-[11.5px] font-extrabold text-black">
                  {row.morning}
                </td>
                <td className="py-1.5 px-1.5 text-center font-mono-id text-[11.5px] font-extrabold text-black">
                  {row.afternoon}
                </td>
                <td className="py-1.5 px-1.5 text-center font-mono-id text-[11.5px] font-extrabold text-black">
                  {row.evening}
                </td>
                <td className="py-1.5 px-1.5 text-center font-semibold text-black">
                  {row.mealLabel}
                </td>
                <td className="py-1.5 pl-1.5 text-right font-mono-id text-neutral-800">
                  {row.totalUnits} u
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Footer Instruction */}
        <p className="mt-2 border-t border-dashed border-neutral-400 pt-1.5 text-center text-[9px] text-neutral-700">
          Follow the prescribed Morning / Afternoon / Night schedule strictly as advised by {sale.doctorName}.
        </p>
      </div>
    </div>
  );
}
