import PDFDocument from "pdfkit";
import { sanitizePdfText } from "@/lib/hospital-pdf";

const PAGE_MARGIN_X = 32;
const PAGE_MARGIN_TOP = 32;
const PAGE_MARGIN_BOTTOM = 38;
const TABLE_WIDTH = 776;

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const COLORS = {
  forest: "#0d4a38",
  headerBg: "#115e46",
  mintBg: "#eef7f1",
  zebraBg: "#f7fbf8",
  border: "#cfe2d6",
  ink: "#0f241d",
  muted: "#466356",
  white: "#ffffff",
};

function formatPdfDateTime(value: Date | string, tzOffsetMinutes: number): string {
  const dt = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(dt.getTime())) return "-";
  const shifted = new Date(dt.getTime() - tzOffsetMinutes * 60_000);
  const dd = String(shifted.getUTCDate()).padStart(2, "0");
  const mon = MONTHS[shifted.getUTCMonth()] ?? "Jan";
  const yyyy = shifted.getUTCFullYear();
  const hh24 = shifted.getUTCHours();
  const ampm = hh24 >= 12 ? "PM" : "AM";
  const hh12 = String(hh24 % 12 || 12).padStart(2, "0");
  const mm = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${dd} ${mon} ${yyyy}, ${hh12}:${mm} ${ampm}`;
}

function fmtRs(val: number): string {
  return `Rs. ${(Number.isFinite(val) ? val : 0).toFixed(2)}`;
}

export interface PharmacySaleReportRow {
  saleNumber: string;
  soldAt: Date;
  patientName: string;
  patientPhone: string;
  doctorName: string;
  paymentMode: string;
  subtotal: number;
  gstAmount: number;
  totalAmount: number;
  totalUnitsSold: number;
  soldByNameSnapshot: string;
  items: Array<{
    medicineNameSnapshot: string;
    batchNumberSnapshot: string;
    sellMode: string;
    enteredQuantity: number;
    basicUnitsDeducted: number;
    lineTotal: number;
  }>;
}

export async function buildPharmacySalesReportPdf(params: {
  hospitalName: string;
  hospitalCode: string;
  pharmacyName: string;
  generatedByName: string;
  filterLabel?: string;
  tzOffsetMinutes?: number;
  sales: PharmacySaleReportRow[];
}): Promise<Buffer> {
  const tzOffset = params.tzOffsetMinutes ?? 0;

  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margins: {
      top: PAGE_MARGIN_TOP,
      bottom: PAGE_MARGIN_BOTTOM,
      left: PAGE_MARGIN_X,
      right: PAGE_MARGIN_X,
    },
    bufferPages: true,
    info: {
      Title: sanitizePdfText(`${params.pharmacyName} - Complete Sales Report`),
      Author: "HospitalPro by Zeronnn Technologies",
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const donePromise = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const totalGross = params.sales.reduce((s, x) => s + x.totalAmount, 0);
  const totalCash = params.sales
    .filter((x) => x.paymentMode === "CASH")
    .reduce((s, x) => s + x.totalAmount, 0);
  const totalDigital = totalGross - totalCash;
  const totalUnits = params.sales.reduce((s, x) => s + x.totalUnitsSold, 0);

  let y = PAGE_MARGIN_TOP;

  // Header Banner
  const bannerH = 66;
  doc
    .save()
    .roundedRect(PAGE_MARGIN_X, y, TABLE_WIDTH, bannerH, 8)
    .fillColor(COLORS.forest)
    .fill()
    .fillColor("#a7f3d0")
    .font("Helvetica-Bold")
    .fontSize(8)
    .text(
      "HOSPITALPRO BY ZERONNN TECHNOLOGIES  |  PHARMACY SALES REPORT",
      PAGE_MARGIN_X + 14,
      y + 10,
      { width: TABLE_WIDTH - 28 }
    )
    .fillColor(COLORS.white)
    .font("Helvetica-Bold")
    .fontSize(15)
    .text(
      sanitizePdfText(`${params.pharmacyName} (${params.hospitalCode})`),
      PAGE_MARGIN_X + 14,
      y + 23,
      { width: 470 }
    )
    .fillColor("#d1fae5")
    .font("Helvetica")
    .fontSize(8)
    .text(
      sanitizePdfText(
        `${params.hospitalName}${params.filterLabel ? `  |  Filter: ${params.filterLabel}` : ""}`
      ),
      PAGE_MARGIN_X + 14,
      y + 44,
      { width: 470 }
    )
    .fillColor(COLORS.white)
    .font("Helvetica")
    .fontSize(8)
    .text(
      sanitizePdfText(`Generated: ${formatPdfDateTime(new Date(), tzOffset)}`),
      PAGE_MARGIN_X + 500,
      y + 24,
      { width: TABLE_WIDTH - 514, align: "right" }
    )
    .text(
      sanitizePdfText(`By: ${params.generatedByName}`),
      PAGE_MARGIN_X + 500,
      y + 38,
      { width: TABLE_WIDTH - 514, align: "right" }
    )
    .restore();

  y += bannerH + 10;

  // Summary Strip (No profit mentioned; GST % is noted on invoice only)
  const cards = [
    { label: "Total Transactions", value: String(params.sales.length) },
    { label: "Total Units Sold", value: String(totalUnits) },
    { label: "Cash Collections", value: fmtRs(totalCash) },
    { label: "UPI & Card", value: fmtRs(totalDigital) },
    { label: "Total Gross Value", value: fmtRs(totalGross) },
  ];
  const gap = 8;
  const cardW = (TABLE_WIDTH - gap * (cards.length - 1)) / cards.length;
  const cardH = 38;
  cards.forEach((c, idx) => {
    const cx = PAGE_MARGIN_X + idx * (cardW + gap);
    doc
      .save()
      .roundedRect(cx, y, cardW, cardH, 5)
      .fillColor(COLORS.mintBg)
      .fill()
      .lineWidth(0.7)
      .strokeColor(COLORS.border)
      .stroke()
      .fillColor(COLORS.muted)
      .font("Helvetica-Bold")
      .fontSize(7)
      .text(sanitizePdfText(c.label.toUpperCase()), cx + 8, y + 6, {
        width: cardW - 16,
        lineBreak: false,
      })
      .fillColor(COLORS.forest)
      .font("Helvetica-Bold")
      .fontSize(11.5)
      .text(sanitizePdfText(c.value), cx + 8, y + 18, {
        width: cardW - 16,
        lineBreak: false,
      })
      .restore();
  });
  y += cardH + 12;

  const columns: Array<{ header: string; width: number; align?: "left" | "right" }> = [
    { header: "Invoice No", width: 92 },
    { header: "Date & Time", width: 106 },
    { header: "Patient & Mobile", width: 120 },
    { header: "Ref Doctor", width: 100 },
    { header: "Medicines Sold (Batch & Qty)", width: 222 },
    { header: "Mode", width: 52 },
    { header: "Gross Total", width: 84, align: "right" },
  ];

  const drawHeader = () => {
    doc
      .save()
      .rect(PAGE_MARGIN_X, y, TABLE_WIDTH, 22)
      .fillColor(COLORS.headerBg)
      .fill()
      .fillColor(COLORS.white)
      .font("Helvetica-Bold")
      .fontSize(7.5);
    let x = PAGE_MARGIN_X;
    for (const col of columns) {
      doc.text(sanitizePdfText(col.header), x + 4, y + 7, {
        width: col.width - 8,
        align: col.align ?? "left",
        lineBreak: false,
      });
      x += col.width;
    }
    doc.restore();
    y += 22;
  };

  if (params.sales.length === 0) {
    doc
      .save()
      .roundedRect(PAGE_MARGIN_X, y, TABLE_WIDTH, 28, 4)
      .fillColor(COLORS.zebraBg)
      .fill()
      .lineWidth(0.5)
      .strokeColor(COLORS.border)
      .stroke()
      .fillColor(COLORS.muted)
      .font("Helvetica-Oblique")
      .fontSize(9)
      .text("No pharmacy sales transactions found.", PAGE_MARGIN_X + 12, y + 9)
      .restore();
  } else {
    drawHeader();
    const maxY = doc.page.height - PAGE_MARGIN_BOTTOM - 16;

    for (let rIdx = 0; rIdx < params.sales.length; rIdx++) {
      const s = params.sales[rIdx];
      const itemsText = s.items
        .map(
          (i) =>
            `${i.medicineNameSnapshot} [${i.batchNumberSnapshot}] x${i.enteredQuantity} ${
              i.sellMode === "SHEET" ? "sh" : "u"
            } (${i.basicUnitsDeducted}u)`
        )
        .join("\n");

      const row = [
        s.saleNumber,
        formatPdfDateTime(s.soldAt, tzOffset),
        `${s.patientName}\n${s.patientPhone}`,
        s.doctorName,
        itemsText || "-",
        s.paymentMode,
        fmtRs(s.totalAmount),
      ].map((v) => sanitizePdfText(v, "-"));

      doc.font("Helvetica").fontSize(7.4);
      let maxH = 14;
      for (let c = 0; c < columns.length; c++) {
        const h = doc.heightOfString(row[c], {
          width: columns[c].width - 8,
          lineGap: 1.4,
        });
        if (h > maxH) maxH = h;
      }
      const rowH = Math.min(Math.max(20, Math.ceil(maxH) + 8), 220);

      if (y + rowH > maxY) {
        doc.addPage({
          size: "A4",
          layout: "landscape",
          margins: {
            top: PAGE_MARGIN_TOP,
            bottom: PAGE_MARGIN_BOTTOM,
            left: PAGE_MARGIN_X,
            right: PAGE_MARGIN_X,
          },
        });
        y = PAGE_MARGIN_TOP;
        drawHeader();
      }

      doc
        .save()
        .rect(PAGE_MARGIN_X, y, TABLE_WIDTH, rowH)
        .fillColor(rIdx % 2 === 1 ? COLORS.zebraBg : COLORS.white)
        .fill()
        .lineWidth(0.4)
        .strokeColor(COLORS.border)
        .stroke()
        .fillColor(COLORS.ink)
        .font("Helvetica")
        .fontSize(7.4);

      let x = PAGE_MARGIN_X;
      for (let c = 0; c < columns.length; c++) {
        doc.text(row[c], x + 4, y + 4, {
          width: columns[c].width - 8,
          height: rowH - 6,
          align: columns[c].align ?? "left",
          lineGap: 1.4,
          ellipsis: true,
        });
        x += columns[c].width;
      }
      doc.restore();
      y += rowH;
    }
  }

  // Stamp clean footers with zero trailing blank page
  const range = doc.bufferedPageRange();
  const totalPages = range.count;
  for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(range.start + i);
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const footerY = doc.page.height - 24;
    doc
      .save()
      .moveTo(PAGE_MARGIN_X, footerY - 4)
      .lineTo(PAGE_MARGIN_X + TABLE_WIDTH, footerY - 4)
      .lineWidth(0.5)
      .strokeColor(COLORS.border)
      .stroke()
      .fillColor(COLORS.muted)
      .font("Helvetica")
      .fontSize(7.5)
      .text(
        sanitizePdfText(
          `HospitalPro Pharmacy Management  |  ${params.pharmacyName} (${params.hospitalCode})`
        ),
        PAGE_MARGIN_X,
        footerY,
        { width: TABLE_WIDTH - 110, lineBreak: false }
      )
      .font("Helvetica-Bold")
      .text(
        `Page ${i + 1} of ${totalPages}`,
        PAGE_MARGIN_X + TABLE_WIDTH - 100,
        footerY,
        { width: 100, align: "right", lineBreak: false }
      )
      .restore();
    doc.page.margins.bottom = savedBottom;
  }

  doc.end();
  return donePromise;
}
