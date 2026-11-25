"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { formatAccurateDateTime } from "@/lib/datetime";
import { formatQuantityRatio } from "@/lib/pharmacy-utils";

interface SaleReceiptResponse {
  pharmacyName: string;
  hospital: {
    name: string;
    code: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    logoDataUrl: string | null;
    registrationNo: string | null;
  };
  sale: {
    id: string;
    saleNumber: string;
    patientName: string;
    patientPhone: string;
    doctorName: string;
    doctorQualificationSnapshot?: string | null;
    subtotal: number;
    gstAmount: number;
    totalAmount: number;
    totalUnitsSold: number;
    paymentMode: string;
    soldByNameSnapshot: string;
    soldAt: string;
    items: Array<{
      id: string;
      medicineNameSnapshot: string;
      batchNumberSnapshot: string;
      expiryDateSnapshot: string;
      hsnCodeSnapshot: string | null;
      sellMode: string;
      enteredQuantity: number;
      unitsPerSheetSnapshot?: number;
      basicUnitsDeducted: number;
      unitPriceSnapshot: number;
      gstPercentSnapshot: number;
      subtotal: number;
      gstAmount: number;
      lineTotal: number;
    }>;
  };
}

export default function PrintPharmacySaleReceiptPage() {
  const params = useParams<{ saleId: string }>();
  const [data, setData] = useState<SaleReceiptResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/pharmacy-mgmt/sales/${encodeURIComponent(params.saleId)}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) {
          setError(d.error ?? "Unable to load pharmacy receipt.");
          return;
        }
        setData(d);
      })
      .catch(() => setError("Network error while loading receipt."));
  }, [params.saleId]);

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
        Loading pharmacy receipt...
      </div>
    );
  }

  const { sale, hospital } = data;

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
          Print Receipt (Low-Ink Half Page)
        </button>
      </div>

      {/* Ultra-Compact, Zero-Fill, Low-Ink Half-Page Receipt */}
      <div className="mx-auto max-w-[720px] border border-neutral-300 bg-white px-5 py-3.5 text-black shadow-sm print:max-w-none print:border-0 print:px-0 print:py-0 print:shadow-none">
        {/* 1. Compact Header: ONLY Hospital Name, Address & Contact Number + Invoice No & Date */}
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
            <p className="text-[10px] font-bold uppercase tracking-wider text-black">
              PHARMACY INVOICE
            </p>
            <p className="font-mono-id text-[12px] font-bold text-black">
              Inv No: {sale.saleNumber}
            </p>
            <p className="text-[9.5px] text-neutral-700">
              {formatAccurateDateTime(sale.soldAt)}
            </p>
          </div>
        </div>

        {/* 2. Single-Line Metadata Strip: Referred By Doctor, Patient Name & Mobile Number */}
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
            <span className="text-[9px] uppercase text-neutral-600">Ref Dr: </span>
            <strong className="font-semibold text-black">{sale.doctorName}</strong>
            {sale.doctorQualificationSnapshot ? (
              <span className="text-[9.5px] text-neutral-700">
                {" "}
                ({sale.doctorQualificationSnapshot})
              </span>
            ) : null}
          </div>
        </div>

        {/* 3. Ultra-Compact Itemized Medicine Table (fits 5-10+ medicines comfortably inside half a page) */}
        <table className="mt-1.5 w-full border-collapse text-left text-[10px] leading-tight">
          <thead>
            <tr className="border-b border-black text-[9px] font-bold uppercase text-black">
              <th className="py-1 pr-1.5 w-5">#</th>
              <th className="py-1 px-1.5">Medicine</th>
              <th className="py-1 px-1.5">Batch</th>
              <th className="py-1 px-1.5">Exp</th>
              <th className="py-1 px-1.5">HSN</th>
              <th className="py-1 px-1.5 text-right">Qty (Sh:U)</th>
              <th className="py-1 px-1.5 text-right">Rate</th>
              <th className="py-1 px-1.5 text-right">GST%</th>
              <th className="py-1 pl-1.5 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-300">
            {sale.items.map((item, idx) => (
              <tr key={item.id}>
                <td className="py-1 pr-1.5 text-neutral-700">{idx + 1}</td>
                <td className="py-1 px-1.5 font-semibold text-black">
                  {item.medicineNameSnapshot}
                </td>
                <td className="py-1 px-1.5 font-mono-id text-neutral-800">
                  {item.batchNumberSnapshot}
                </td>
                <td className="py-1 px-1.5 font-mono-id text-neutral-800">
                  {item.expiryDateSnapshot}
                </td>
                <td className="py-1 px-1.5 font-mono-id text-neutral-700">
                  {item.hsnCodeSnapshot || "-"}
                </td>
                <td className="py-1 px-1.5 text-right font-mono-id text-black">
                  {formatQuantityRatio(
                    item.basicUnitsDeducted,
                    item.unitsPerSheetSnapshot ?? 1
                  )}{" "}
                  <span className="text-[9px] text-neutral-600">
                    ({item.basicUnitsDeducted}u)
                  </span>
                </td>
                <td className="py-1 px-1.5 text-right font-mono-id text-neutral-800">
                  ₹{item.unitPriceSnapshot.toFixed(2)}
                </td>
                <td className="py-1 px-1.5 text-right font-mono-id text-neutral-700">
                  {item.gstPercentSnapshot}%
                </td>
                <td className="py-1 pl-1.5 text-right font-mono-id font-bold text-black">
                  ₹{item.lineTotal.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* 4. Compact Single-Row Totals Footer */}
        <div className="mt-2 flex items-center justify-between gap-4 border-t border-black pt-1.5 text-[10px]">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-neutral-800">
            <span>
              Mode: <strong className="text-black">{sale.paymentMode}</strong>
            </span>
            <span>
              Units: <strong className="font-mono-id text-black">{sale.totalUnitsSold}</strong>
            </span>
            <span>GST % Incl.</span>
          </div>

          <div className="shrink-0 text-right">
            <span className="mr-2 text-[10.5px] font-bold uppercase text-black">
              Grand Total:
            </span>
            <span className="font-mono-id text-[13px] font-extrabold text-black">
              ₹{sale.totalAmount.toFixed(2)}
            </span>
          </div>
        </div>

        {/* 5. Single-Line Low-Ink Note */}
        <p className="mt-1.5 border-t border-dashed border-neutral-400 pt-1 text-center text-[8.5px] text-neutral-600">
          Please verify medicines and expiry dates at the counter.
        </p>
      </div>
    </div>
  );
}
