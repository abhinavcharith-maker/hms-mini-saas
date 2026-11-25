import PDFDocument from "pdfkit";
import { prisma } from "@/lib/prisma";

const PAGE_MARGIN_X = 32;
const PAGE_MARGIN_TOP = 32;
const PAGE_MARGIN_BOTTOM = 38;
const TABLE_WIDTH = 776; // Fits inside Landscape A4 (841.89pt - 64pt margins)

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
  emerald: "#059669",
  mintBg: "#eef7f1",
  zebraBg: "#f7fbf8",
  headerBg: "#115e46",
  border: "#cfe2d6",
  ink: "#0f241d",
  muted: "#466356",
  white: "#ffffff",
  sectionBg: "#dff4e8",
};

interface TableColumn {
  header: string;
  width: number;
  align?: "left" | "right";
}

interface PdfContext {
  doc: PDFKit.PDFDocument;
  hospitalName: string;
  hospitalCode: string;
  y: number;
}

/**
 * Normalizes text into clean printable ASCII/WinAnsi for PDFKit Type1 Helvetica.
 */
export function sanitizePdfText(value: unknown, fallback = "-"): string {
  if (value === null || value === undefined) return fallback;
  const raw = String(value)
    .replace(/\u20B9/g, "Rs. ")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2022/g, "|")
    .replace(/\u00A0/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[^\x09\x0A\x20-\x7E\xA1-\xFF]/g, "")
    .trim();
  return raw.length > 0 ? raw : fallback;
}

function formatPdfDateTime(
  value: Date | string | null | undefined,
  tzOffsetMinutes: number
): string {
  if (!value) return "-";
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

function formatMoney(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) {
    return "Not set";
  }
  return `Rs. ${amount.toFixed(2)}`;
}

function parseReceiptLineItems(jsonStr: string | null | undefined): string {
  if (!jsonStr) return "-";
  try {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed) || parsed.length === 0) return "-";
    return parsed
      .map((item) => {
        const label = sanitizePdfText(item?.label ?? item?.name ?? "Charge", "Charge");
        const amt =
          typeof item?.amount === "number" && Number.isFinite(item.amount)
            ? formatMoney(item.amount)
            : "-";
        return `${label}: ${amt}`;
      })
      .join("\n");
  } catch {
    return "-";
  }
}

function drawContinuationHeader(ctx: PdfContext, bannerTitle: string) {
  const { doc } = ctx;
  doc
    .save()
    .fillColor(COLORS.muted)
    .font("Helvetica-Bold")
    .fontSize(8)
    .text(
      sanitizePdfText(
        `${ctx.hospitalName} (${ctx.hospitalCode}) - ${bannerTitle}`
      ),
      PAGE_MARGIN_X,
      16,
      { width: TABLE_WIDTH, align: "left", lineBreak: false }
    )
    .restore();
  ctx.y = PAGE_MARGIN_TOP + 6;
}

function addFreshPage(ctx: PdfContext, bannerTitle: string) {
  ctx.doc.addPage({ layout: "landscape", size: "A4", margin: PAGE_MARGIN_X });
  drawContinuationHeader(ctx, bannerTitle);
}

function drawSectionBanner(
  ctx: PdfContext,
  sectionTag: string,
  title: string,
  subtitle: string
) {
  const { doc } = ctx;
  const maxY = doc.page.height - PAGE_MARGIN_BOTTOM;
  if (ctx.y + 64 > maxY) {
    addFreshPage(ctx, `${sectionTag}: ${title}`);
  }

  doc
    .save()
    .roundedRect(PAGE_MARGIN_X, ctx.y, TABLE_WIDTH, 46, 6)
    .fillAndStroke(COLORS.sectionBg, COLORS.border);

  doc
    .fillColor(COLORS.forest)
    .font("Helvetica-Bold")
    .fontSize(8)
    .text(sanitizePdfText(sectionTag.toUpperCase()), PAGE_MARGIN_X + 12, ctx.y + 8, {
      width: TABLE_WIDTH - 24,
    });

  doc
    .fillColor(COLORS.ink)
    .font("Helvetica-Bold")
    .fontSize(13)
    .text(sanitizePdfText(title), PAGE_MARGIN_X + 12, ctx.y + 18, {
      width: TABLE_WIDTH - 24,
    });

  doc
    .fillColor(COLORS.muted)
    .font("Helvetica")
    .fontSize(8.5)
    .text(sanitizePdfText(subtitle), PAGE_MARGIN_X + 12, ctx.y + 33, {
      width: TABLE_WIDTH - 24,
    });

  doc.restore();
  ctx.y += 54;
}

function drawTableHeaderRow(ctx: PdfContext, columns: TableColumn[]) {
  const { doc } = ctx;
  const headerHeight = 24;
  doc
    .save()
    .rect(PAGE_MARGIN_X, ctx.y, TABLE_WIDTH, headerHeight)
    .fill(COLORS.headerBg);

  let x = PAGE_MARGIN_X;
  doc.fillColor(COLORS.white).font("Helvetica-Bold").fontSize(7.5);
  for (const col of columns) {
    doc.text(sanitizePdfText(col.header), x + 5, ctx.y + 7, {
      width: col.width - 10,
      align: col.align ?? "left",
      lineBreak: false,
      ellipsis: true,
    });
    x += col.width;
  }
  doc.restore();
  ctx.y += headerHeight;
}

function drawSummaryBox(ctx: PdfContext, bannerTitle: string, lines: string[]) {
  const { doc } = ctx;
  const boxHeight = 16 + lines.length * 13;
  if (ctx.y + boxHeight > doc.page.height - PAGE_MARGIN_BOTTOM) {
    addFreshPage(ctx, bannerTitle);
  }
  doc
    .save()
    .roundedRect(PAGE_MARGIN_X, ctx.y, TABLE_WIDTH, boxHeight, 5)
    .fillAndStroke(COLORS.mintBg, COLORS.border);
  let lineY = ctx.y + 8;
  doc.fillColor(COLORS.forest).font("Helvetica-Bold").fontSize(8.5);
  for (const line of lines) {
    doc.text(sanitizePdfText(line), PAGE_MARGIN_X + 12, lineY, {
      width: TABLE_WIDTH - 24,
    });
    lineY += 13;
  }
  doc.restore();
  ctx.y += boxHeight + 12;
}

function drawPaginatedTable(
  ctx: PdfContext,
  bannerTitle: string,
  columns: TableColumn[],
  rows: string[][],
  emptyMessage: string
) {
  const { doc } = ctx;
  const bottomLimit = doc.page.height - PAGE_MARGIN_BOTTOM;
  const maxBodyRowHeight = bottomLimit - PAGE_MARGIN_TOP - 36;

  if (rows.length === 0) {
    if (ctx.y + 34 > bottomLimit) {
      addFreshPage(ctx, bannerTitle);
    }
    doc
      .save()
      .roundedRect(PAGE_MARGIN_X, ctx.y, TABLE_WIDTH, 28, 4)
      .fillAndStroke(COLORS.zebraBg, COLORS.border)
      .fillColor(COLORS.muted)
      .font("Helvetica")
      .fontSize(8.5)
      .text(sanitizePdfText(emptyMessage), PAGE_MARGIN_X + 10, ctx.y + 9, {
        width: TABLE_WIDTH - 20,
      })
      .restore();
    ctx.y += 36;
    return;
  }

  if (ctx.y + 44 > bottomLimit) {
    addFreshPage(ctx, bannerTitle);
  }
  drawTableHeaderRow(ctx, columns);

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    doc.font("Helvetica").fontSize(7.5);

    let maxHeight = 12;
    const sanitizedCells = columns.map((col, colIdx) => {
      const text = sanitizePdfText(row[colIdx], "-");
      const measured = doc.heightOfString(text, {
        width: col.width - 10,
        align: col.align ?? "left",
      });
      if (measured > maxHeight) maxHeight = measured;
      return text;
    });

    const rowHeight = Math.min(maxBodyRowHeight, Math.max(18, maxHeight + 10));

    if (ctx.y + rowHeight > bottomLimit) {
      addFreshPage(ctx, bannerTitle);
      drawTableHeaderRow(ctx, columns);
    }

    doc.save();
    doc
      .rect(PAGE_MARGIN_X, ctx.y, TABLE_WIDTH, rowHeight)
      .fill(rowIdx % 2 === 1 ? COLORS.zebraBg : COLORS.white);

    doc
      .moveTo(PAGE_MARGIN_X, ctx.y + rowHeight)
      .lineTo(PAGE_MARGIN_X + TABLE_WIDTH, ctx.y + rowHeight)
      .lineWidth(0.5)
      .strokeColor(COLORS.border)
      .stroke();

    let x = PAGE_MARGIN_X;
    for (let colIdx = 0; colIdx < columns.length; colIdx++) {
      const col = columns[colIdx];
      doc
        .fillColor(colIdx === 0 ? COLORS.muted : COLORS.ink)
        .font(colIdx === 0 || colIdx === 2 ? "Helvetica-Bold" : "Helvetica")
        .fontSize(7.5)
        .text(sanitizedCells[colIdx], x + 5, ctx.y + 5, {
          width: col.width - 10,
          height: rowHeight - 8,
          align: col.align ?? "left",
          ellipsis: true,
        });

      if (colIdx < columns.length - 1) {
        doc
          .moveTo(x + col.width, ctx.y)
          .lineTo(x + col.width, ctx.y + rowHeight)
          .lineWidth(0.35)
          .strokeColor("#e4efe8")
          .stroke();
      }
      x += col.width;
    }
    doc.restore();
    ctx.y += rowHeight;
  }

  ctx.y += 10;
}

export interface HospitalPdfResult {
  buffer: Buffer;
  filename: string;
  hospitalCode: string;
  hospitalName: string;
  counts: {
    opVisits: number;
    ipAdmissions: number;
    bedTransfers: number;
    ipReceipts: number;
    pharmacyReferrals: number;
    labReferrals: number;
  };
}

/**
 * Generates a segregated 4-section Landscape A4 PDF containing all hospital
 * OPD registrations, IP management (admissions, discharges, charges, transfers),
 * pharmacy referrals, and laboratory referrals. Strictly scoped to one hospital.
 */
export async function buildHospitalCompletePdf(params: {
  hospitalId: string;
  tzOffsetMinutes: number;
  actorUsername: string;
}): Promise<HospitalPdfResult | null> {
  const { hospitalId, tzOffsetMinutes, actorUsername } = params;

  const hospital = await prisma.hospital.findUnique({
    where: { id: hospitalId },
  });
  if (!hospital) return null;

  const [
    opVisits,
    ipAdmissions,
    bedTransfers,
    ipReceipts,
    pharmacyReferrals,
    labReferrals,
  ] = await Promise.all([
    prisma.opVisit.findMany({
      where: { hospitalId },
      include: {
        patient: {
          select: {
            uhid: true,
            fullName: true,
            age: true,
            gender: true,
            phone: true,
            address: true,
            bloodGroup: true,
            emergencyContact: true,
            registeredAt: true,
          },
        },
        billingReceipts: {
          select: {
            receiptNumber: true,
            totalAmount: true,
            paymentMode: true,
            paymentStatus: true,
            issuedAt: true,
          },
        },
      },
      orderBy: [{ visitDate: "asc" }, { createdAt: "asc" }],
    }),
    prisma.ipAdmission.findMany({
      where: { hospitalId },
      include: {
        patient: {
          select: {
            uhid: true,
            fullName: true,
            age: true,
            gender: true,
            phone: true,
            address: true,
            bloodGroup: true,
          },
        },
        bedTransfers: {
          orderBy: { transferredAt: "asc" },
        },
        billingReceipts: {
          select: {
            receiptNumber: true,
            totalAmount: true,
            paymentMode: true,
            paymentStatus: true,
            issuedAt: true,
            issuedByNameSnapshot: true,
            lineItemsJson: true,
          },
          orderBy: { issuedAt: "asc" },
        },
      },
      orderBy: [{ admittedAt: "asc" }, { createdAt: "asc" }],
    }),
    prisma.bedTransfer.findMany({
      where: { hospitalId },
      include: {
        ipAdmission: {
          select: {
            admissionNumber: true,
            patient: {
              select: {
                uhid: true,
                fullName: true,
                phone: true,
              },
            },
          },
        },
      },
      orderBy: { transferredAt: "asc" },
    }),
    prisma.billingReceipt.findMany({
      where: { hospitalId, ipAdmissionId: { not: null } },
      include: {
        ipAdmission: {
          select: { admissionNumber: true },
        },
      },
      orderBy: { issuedAt: "asc" },
    }),
    prisma.pharmacyReferral.findMany({
      where: { hospitalId },
      include: {
        items: { orderBy: { id: "asc" } },
        opVisit: { select: { visitNumber: true } },
        ipAdmission: { select: { admissionNumber: true } },
      },
      orderBy: [{ referredAt: "asc" }, { createdAt: "asc" }],
    }),
    prisma.labReferral.findMany({
      where: { hospitalId },
      include: {
        items: { orderBy: { id: "asc" } },
        opVisit: { select: { visitNumber: true } },
        ipAdmission: { select: { admissionNumber: true } },
      },
      orderBy: [{ referredAt: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  const doc = new PDFDocument({
    layout: "landscape",
    size: "A4",
    margin: PAGE_MARGIN_X,
    bufferPages: true,
    info: {
      Title: sanitizePdfText(
        `${hospital.name} (${hospital.code}) - Complete Hospital Data Export`
      ),
      Author: "HospitalPro by Zeronnn Technologies (Super Admin)",
      Subject:
        "Segregated OPD Registrations, IP Management, Pharmacy Referrals, and Laboratory Referrals",
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const pdfBufferPromise = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const ctx: PdfContext = {
    doc,
    hospitalName: hospital.name,
    hospitalCode: hospital.code,
    y: PAGE_MARGIN_TOP,
  };

  // --- COVER / EXECUTIVE SUMMARY (PAGE 1) ---
  doc
    .save()
    .roundedRect(PAGE_MARGIN_X, ctx.y, TABLE_WIDTH, 76, 8)
    .fill(COLORS.forest);

  doc
    .fillColor("#a7f3d0")
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(
      "HOSPITALPRO BY ZERONNN TECHNOLOGIES | SUPER ADMIN COMPLETE DATA EXPORT",
      PAGE_MARGIN_X + 16,
      ctx.y + 12,
      { width: TABLE_WIDTH - 32 }
    );

  doc
    .fillColor(COLORS.white)
    .font("Helvetica-Bold")
    .fontSize(20)
    .text(sanitizePdfText(hospital.name), PAGE_MARGIN_X + 16, ctx.y + 26, {
      width: TABLE_WIDTH - 32,
    });

  doc
    .fillColor("#d1fae5")
    .font("Helvetica")
    .fontSize(9.5)
    .text(
      sanitizePdfText(
        `Hospital Code: ${hospital.code}  |  UHID Prefix: ${hospital.uhidPrefix}  |  Status: ${hospital.isActive ? "ACTIVE" : "DEACTIVATED"}  |  Reg No: ${hospital.registrationNo ?? "-"}`
      ),
      PAGE_MARGIN_X + 16,
      ctx.y + 52,
      { width: TABLE_WIDTH - 32 }
    );
  doc.restore();
  ctx.y += 90;

  // Hospital Metadata Strip
  doc
    .save()
    .roundedRect(PAGE_MARGIN_X, ctx.y, TABLE_WIDTH, 52, 6)
    .fillAndStroke(COLORS.zebraBg, COLORS.border);
  doc
    .fillColor(COLORS.ink)
    .font("Helvetica")
    .fontSize(8.5)
    .text(
      sanitizePdfText(
        `Address: ${hospital.address ?? "-"}   |   Phone: ${hospital.phone ?? "-"}   |   Email: ${hospital.email ?? "-"}`
      ),
      PAGE_MARGIN_X + 12,
      ctx.y + 10,
      { width: TABLE_WIDTH - 24 }
    )
    .text(
      sanitizePdfText(
        `Exported At: ${formatPdfDateTime(new Date(), tzOffsetMinutes)}   |   Exported By: @${actorUsername} (Super Admin)   |   Tenant Created: ${formatPdfDateTime(hospital.createdAt, tzOffsetMinutes)}`
      ),
      PAGE_MARGIN_X + 12,
      ctx.y + 28,
      { width: TABLE_WIDTH - 24 }
    );
  doc.restore();
  ctx.y += 66;

  // Compute totals for cover cards & section summaries
  const opTotalCharged = opVisits.reduce((s, v) => s + (v.totalAmount ?? 0), 0);
  const opUniquePatients = new Set(opVisits.map((v) => v.patientId)).size;

  const ipActiveCount = ipAdmissions.filter((a) => a.status === "ADMITTED").length;
  const ipDischargedCount = ipAdmissions.filter(
    (a) => a.status === "DISCHARGED"
  ).length;
  const ipAdmissionChargesTotal = ipAdmissions.reduce(
    (s, a) => s + (a.chargeAmount ?? 0),
    0
  );
  const ipReceiptsTotal = ipReceipts.reduce(
    (s, r) => s + (r.totalAmount ?? 0),
    0
  );

  const pharmCompleted = pharmacyReferrals.filter(
    (r) => r.status === "COMPLETED"
  ).length;
  const pharmPending = pharmacyReferrals.filter(
    (r) => r.status === "PENDING"
  ).length;
  const pharmCancelled = pharmacyReferrals.filter(
    (r) => r.status === "CANCELLED"
  ).length;
  const pharmItemsCount = pharmacyReferrals.reduce(
    (s, r) => s + r.items.length,
    0
  );
  const pharmTotalAmount = pharmacyReferrals.reduce(
    (s, r) => s + (r.totalAmount ?? 0),
    0
  );

  const labCompleted = labReferrals.filter((r) => r.status === "COMPLETED").length;
  const labPending = labReferrals.filter((r) => r.status === "PENDING").length;
  const labCancelled = labReferrals.filter((r) => r.status === "CANCELLED").length;
  const labItemsCount = labReferrals.reduce((s, r) => s + r.items.length, 0);
  const labTotalAmount = labReferrals.reduce(
    (s, r) => s + (r.totalAmount ?? 0),
    0
  );

  // 4-Section Overview Grid on Cover Page
  const cardWidth = (TABLE_WIDTH - 18) / 2;
  const cardHeight = 112;
  const cards = [
    {
      tag: "SECTION 1",
      title: "OPD Registrations",
      metric: `${opVisits.length} OP Visits (${opUniquePatients} Unique Patients)`,
      lines: [
        `Total OP Charges Billed: ${formatMoney(opTotalCharged)}`,
        "Includes Visit #, Date/Time, UHID, Patient Demographics,",
        "Assigned Doctor & Department, Fees, Receipts & Clinical Notes.",
      ],
    },
    {
      tag: "SECTION 2",
      title: "IP Management (Admissions, Discharges, Charges & Transfers)",
      metric: `${ipAdmissions.length} Admissions (${ipActiveCount} Active, ${ipDischargedCount} Discharged)`,
      lines: [
        `Bed Transfers: ${bedTransfers.length}  |  IP Charges: ${formatMoney(ipAdmissionChargesTotal)}`,
        `IP Receipts Issued: ${ipReceipts.length} (${formatMoney(ipReceiptsTotal)})`,
        "Includes Admissions, Discharges, Stay History, Transfers & Receipts.",
      ],
    },
    {
      tag: "SECTION 3",
      title: "Pharmacy Referrals",
      metric: `${pharmacyReferrals.length} Referrals (${pharmItemsCount} Prescribed Lines)`,
      lines: [
        `Completed: ${pharmCompleted}  |  Pending: ${pharmPending}  |  Cancelled: ${pharmCancelled}`,
        `Total Pharmacy Referral Amount: ${formatMoney(pharmTotalAmount)}`,
        "Includes Ref #, Patient, Pharmacy, Status, Medicines, Qty & Pricing.",
      ],
    },
    {
      tag: "SECTION 4",
      title: "Laboratory Referrals",
      metric: `${labReferrals.length} Referrals (${labItemsCount} Tests Ordered)`,
      lines: [
        `Completed: ${labCompleted}  |  Pending: ${labPending}  |  Cancelled: ${labCancelled}`,
        `Total Laboratory Referral Amount: ${formatMoney(labTotalAmount)}`,
        "Includes Ref #, Patient, Laboratory, Status, Tests & Pricing.",
      ],
    },
  ];

  cards.forEach((card, idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const cx = PAGE_MARGIN_X + col * (cardWidth + 18);
    const cy = ctx.y + row * (cardHeight + 14);

    doc
      .save()
      .roundedRect(cx, cy, cardWidth, cardHeight, 6)
      .fillAndStroke(COLORS.white, COLORS.border);

    doc
      .fillColor(COLORS.emerald)
      .font("Helvetica-Bold")
      .fontSize(8)
      .text(card.tag, cx + 12, cy + 10, { width: cardWidth - 24 });

    doc
      .fillColor(COLORS.ink)
      .font("Helvetica-Bold")
      .fontSize(11)
      .text(card.title, cx + 12, cy + 22, { width: cardWidth - 24 });

    doc
      .fillColor(COLORS.forest)
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(card.metric, cx + 12, cy + 40, { width: cardWidth - 24 });

    let lineY = cy + 58;
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(8);
    for (const ln of card.lines) {
      doc.text(ln, cx + 12, lineY, { width: cardWidth - 24 });
      lineY += 13;
    }
    doc.restore();
  });

  // =========================================================================
  // SECTION 1: ALL OPD REGISTRATIONS (Starts on dedicated page)
  // =========================================================================
  addFreshPage(ctx, "Section 1: OPD Registrations");
  drawSectionBanner(
    ctx,
    "Section 1 of 4",
    "OPD Registrations & Outpatient Visits",
    `Complete chronological record of all ${opVisits.length} OPD registrations (${opUniquePatients} unique patients) for ${hospital.name}.`
  );

  const opColumns: TableColumn[] = [
    { header: "#", width: 30 },
    { header: "Visit Date & Time", width: 90 },
    { header: "Visit # / UHID", width: 96 },
    { header: "Patient Details", width: 150 },
    { header: "Doctor & Dept", width: 115 },
    { header: "Fees, Payment & Receipt", width: 130 },
    { header: "Reason for Visit & Notes", width: 165 },
  ];

  const opRows = opVisits.map((v, idx) => {
    const p = v.patient;
    const demoParts = [
      p.fullName,
      `${p.age !== null ? `${p.age}y` : "-"} / ${p.gender}`,
      `Ph: ${p.phone}`,
      p.bloodGroup ? `BG: ${p.bloodGroup}` : null,
      p.address ? `Addr: ${p.address}` : null,
      p.emergencyContact ? `Emerg: ${p.emergencyContact}` : null,
    ].filter(Boolean);

    const receiptSummary =
      v.billingReceipts.length > 0
        ? v.billingReceipts
            .map(
              (r) =>
                `${r.receiptNumber}${r.totalAmount !== null ? ` (${formatMoney(r.totalAmount)})` : ""}`
            )
            .join(", ")
        : "None";

    const feeLines = [
      `Consult: ${formatMoney(v.consultationFee)}`,
      v.registrationFee !== null ? `Reg: ${formatMoney(v.registrationFee)}` : null,
      `Total: ${formatMoney(v.totalAmount)}`,
      `Mode: ${v.paymentMode ?? "-"} (${v.paymentStatus ?? "-"})`,
      `Rcpt: ${receiptSummary}`,
    ].filter(Boolean);

    const reasonLines = [
      v.reasonForVisit ? `Reason: ${v.reasonForVisit}` : null,
      v.notes ? `Notes: ${v.notes}` : null,
    ].filter(Boolean);

    return [
      String(idx + 1),
      formatPdfDateTime(v.visitDate, tzOffsetMinutes),
      `${v.visitNumber}\n${p.uhid}`,
      demoParts.join("\n"),
      `${v.doctorNameSnapshot}\n${v.departmentSnapshot ?? "-"}`,
      feeLines.join("\n"),
      reasonLines.length > 0 ? reasonLines.join("\n") : "-",
    ];
  });

  drawPaginatedTable(
    ctx,
    "Section 1: OPD Registrations",
    opColumns,
    opRows,
    "No OPD registrations recorded for this hospital."
  );

  const opConsultSum = opVisits.reduce((s, v) => s + (v.consultationFee ?? 0), 0);
  const opRegSum = opVisits.reduce((s, v) => s + (v.registrationFee ?? 0), 0);
  drawSummaryBox(ctx, "Section 1: OPD Registrations", [
    `Section 1 Summary - Total OPD Visits: ${opVisits.length} | Unique Patients: ${opUniquePatients}`,
    `Consultation Fees Total: ${formatMoney(opConsultSum)} | Registration Fees Total: ${formatMoney(opRegSum)} | Grand OPD Total: ${formatMoney(opTotalCharged)}`,
  ]);

  // =========================================================================
  // SECTION 2: IP MANAGEMENT (Admissions, Discharges, Charges & Transfers)
  // =========================================================================
  addFreshPage(ctx, "Section 2: IP Management");
  drawSectionBanner(
    ctx,
    "Section 2 of 4",
    "IP Management - Admissions, Discharges, Charges, Bed Transfers & Receipts",
    `Complete inpatient directory (${ipAdmissions.length} admissions, ${bedTransfers.length} bed transfers, ${ipReceipts.length} IP receipts) for ${hospital.name}.`
  );

  const ipColumns: TableColumn[] = [
    { header: "#", width: 30 },
    { header: "Admission # & Status", width: 98 },
    { header: "Patient Details", width: 132 },
    { header: "Ward / Bed & Doctor", width: 118 },
    { header: "Admitted / Discharged", width: 114 },
    { header: "Charges & IP Receipts", width: 124 },
    { header: "Transfers & Clinical Notes", width: 160 },
  ];

  const ipRows = ipAdmissions.map((a, idx) => {
    const p = a.patient;
    const patientInfo = [
      p.fullName,
      `${p.uhid} (${p.age !== null ? `${p.age}y` : "-"} / ${p.gender})`,
      `Ph: ${p.phone}`,
      p.bloodGroup ? `BG: ${p.bloodGroup}` : null,
      p.address ? `Addr: ${p.address}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const receiptText =
      a.billingReceipts.length > 0
        ? a.billingReceipts
            .map(
              (r) =>
                `${r.receiptNumber}: ${formatMoney(r.totalAmount)} (${r.paymentMode ?? "-"})`
            )
            .join("\n")
        : "No IP Receipt";

    const transferText =
      a.bedTransfers.length > 0
        ? a.bedTransfers
            .map(
              (t, tIdx) =>
                `T${tIdx + 1}: ${t.fromBedLabel ?? "-"} -> ${t.toBedLabel} (${formatPdfDateTime(t.transferredAt, tzOffsetMinutes)})${t.reason ? ` [${t.reason}]` : ""}`
            )
            .join("\n")
        : "No bed transfers";

    const notesText = [
      `Transfers (${a.bedTransfers.length}):\n${transferText}`,
      a.admissionNotes ? `Adm Notes: ${a.admissionNotes}` : null,
      a.dischargeNotes ? `Disch Notes: ${a.dischargeNotes}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    return [
      String(idx + 1),
      `${a.admissionNumber}\nStatus: ${a.status}`,
      patientInfo,
      `Ward: ${a.wardSnapshot}\nBed: ${a.bedNumberSnapshot}\nDr: ${a.doctorNameSnapshot}`,
      `Adm: ${formatPdfDateTime(a.admittedAt, tzOffsetMinutes)}\nDisch: ${a.dischargedAt ? formatPdfDateTime(a.dischargedAt, tzOffsetMinutes) : "Still Admitted"}`,
      `Charge: ${formatMoney(a.chargeAmount)}\nReceipts:\n${receiptText}`,
      notesText,
    ];
  });

  drawPaginatedTable(
    ctx,
    "Section 2: IP Management",
    ipColumns,
    ipRows,
    "No inpatient admissions recorded for this hospital."
  );

  // Part 2B: Bed Transfers Ledger
  drawSectionBanner(
    ctx,
    "Section 2B - IP Bed Transfers",
    "IP Bed Transfers Chronological Ledger",
    `All ${bedTransfers.length} inpatient bed and ward transfers recorded for ${hospital.name}.`
  );

  const transferColumns: TableColumn[] = [
    { header: "#", width: 32 },
    { header: "Transferred At", width: 105 },
    { header: "Admission #", width: 96 },
    { header: "Patient Details", width: 155 },
    { header: "From Bed -> To Bed", width: 200 },
    { header: "Transfer Reason", width: 188 },
  ];

  const transferRows = bedTransfers.map((t, idx) => [
    String(idx + 1),
    formatPdfDateTime(t.transferredAt, tzOffsetMinutes),
    t.ipAdmission.admissionNumber,
    `${t.ipAdmission.patient.fullName}\n${t.ipAdmission.patient.uhid} | ${t.ipAdmission.patient.phone}`,
    `${t.fromBedLabel ?? "Initial"} -> ${t.toBedLabel}`,
    t.reason ?? "-",
  ]);

  drawPaginatedTable(
    ctx,
    "Section 2B: IP Bed Transfers",
    transferColumns,
    transferRows,
    "No bed transfers recorded for this hospital."
  );

  // Part 2C: IP Billing Receipts & Charges Ledger
  drawSectionBanner(
    ctx,
    "Section 2C - IP Charges & Receipts",
    "IP Billing Receipts & Itemized Charges Ledger",
    `All ${ipReceipts.length} inpatient billing receipts and charge breakdowns for ${hospital.name}.`
  );

  const ipReceiptColumns: TableColumn[] = [
    { header: "#", width: 32 },
    { header: "Issued At", width: 100 },
    { header: "Receipt # / IP #", width: 105 },
    { header: "Patient", width: 140 },
    { header: "Charge Line Items & Mode", width: 255 },
    { header: "Amount & Issued By", width: 144 },
  ];

  const ipReceiptRows = ipReceipts.map((r, idx) => [
    String(idx + 1),
    formatPdfDateTime(r.issuedAt, tzOffsetMinutes),
    `${r.receiptNumber}\n${r.ipAdmission?.admissionNumber ?? "-"}`,
    `${r.patientNameSnapshot}\nUHID: ${r.patientUhidSnapshot}`,
    `${parseReceiptLineItems(r.lineItemsJson)}\nMode: ${r.paymentMode ?? "-"} | Status: ${r.paymentStatus ?? "-"}`,
    `${formatMoney(r.totalAmount)}\nBy: ${r.issuedByNameSnapshot}`,
  ]);

  drawPaginatedTable(
    ctx,
    "Section 2C: IP Billing Receipts",
    ipReceiptColumns,
    ipReceiptRows,
    "No IP billing receipts recorded for this hospital."
  );

  drawSummaryBox(ctx, "Section 2: IP Management", [
    `Section 2 Summary - Total Admissions: ${ipAdmissions.length} (Active: ${ipActiveCount} | Discharged: ${ipDischargedCount}) | Bed Transfers: ${bedTransfers.length}`,
    `Admission Charge Records Total: ${formatMoney(ipAdmissionChargesTotal)} | IP Billing Receipts (${ipReceipts.length}) Total: ${formatMoney(ipReceiptsTotal)}`,
  ]);

  // =========================================================================
  // SECTION 3: PHARMACY REFERRALS (Starts on dedicated page)
  // =========================================================================
  addFreshPage(ctx, "Section 3: Pharmacy Referrals");
  drawSectionBanner(
    ctx,
    "Section 3 of 4",
    "Pharmacy Referrals & Dispensed Prescriptions",
    `Complete record of all ${pharmacyReferrals.length} pharmacy referrals and ${pharmItemsCount} prescribed medicine line items for ${hospital.name}.`
  );

  const pharmColumns: TableColumn[] = [
    { header: "#", width: 30 },
    { header: "Referred At / Ref #", width: 100 },
    { header: "Patient Details", width: 132 },
    { header: "Pharmacy & Status", width: 124 },
    { header: "Prescribed Medicines (Item | Qty | Unit | Total | Dosage)", width: 250 },
    { header: "Amount & Notes", width: 140 },
  ];

  const pharmRows = pharmacyReferrals.map((r, idx) => {
    const sourceLabel = r.opVisit?.visitNumber
      ? `OP: ${r.opVisit.visitNumber}`
      : r.ipAdmission?.admissionNumber
        ? `IP: ${r.ipAdmission.admissionNumber}`
        : "Direct";

    const itemsText =
      r.items.length > 0
        ? r.items
            .map((it) => {
              const pricePart =
                it.unitPriceSnapshot !== null
                  ? ` @ ${formatMoney(it.unitPriceSnapshot)}`
                  : "";
              const linePart =
                it.lineTotal !== null ? ` = ${formatMoney(it.lineTotal)}` : "";
              const dosagePart = it.dosageInstructions
                ? ` (${it.dosageInstructions})`
                : "";
              return `- ${it.medicineNameSnapshot} x${it.quantity}${pricePart}${linePart}${dosagePart}`;
            })
            .join("\n")
        : "-";

    const statusLines = [
      r.pharmacyNameSnapshot,
      `Status: ${r.status}`,
      r.completedAt
        ? `Done: ${formatPdfDateTime(r.completedAt, tzOffsetMinutes)}`
        : r.cancelledAt
          ? `Cancelled: ${formatPdfDateTime(r.cancelledAt, tzOffsetMinutes)}`
          : null,
      r.completedByNameSnapshot ? `By: ${r.completedByNameSnapshot}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    return [
      String(idx + 1),
      `${formatPdfDateTime(r.referredAt, tzOffsetMinutes)}\n${r.referralNumber}\n${sourceLabel}`,
      `${r.patientNameSnapshot}\n${r.patientUhidSnapshot}\nPh: ${r.patientPhoneSnapshot ?? "-"}`,
      statusLines,
      itemsText,
      `Total: ${formatMoney(r.totalAmount)}${r.notes ? `\nNotes: ${r.notes}` : ""}`,
    ];
  });

  drawPaginatedTable(
    ctx,
    "Section 3: Pharmacy Referrals",
    pharmColumns,
    pharmRows,
    "No pharmacy referrals recorded for this hospital."
  );

  drawSummaryBox(ctx, "Section 3: Pharmacy Referrals", [
    `Section 3 Summary - Total Referrals: ${pharmacyReferrals.length} (Completed: ${pharmCompleted} | Pending: ${pharmPending} | Cancelled: ${pharmCancelled})`,
    `Total Medicine Line Items: ${pharmItemsCount} | Total Pharmacy Referral Amount: ${formatMoney(pharmTotalAmount)}`,
  ]);

  // =========================================================================
  // SECTION 4: LABORATORY REFERRALS (Starts on dedicated page)
  // =========================================================================
  addFreshPage(ctx, "Section 4: Laboratory Referrals");
  drawSectionBanner(
    ctx,
    "Section 4 of 4",
    "Laboratory Referrals & Diagnostic Test Orders",
    `Complete record of all ${labReferrals.length} laboratory referrals and ${labItemsCount} diagnostic test items for ${hospital.name}.`
  );

  const labColumns: TableColumn[] = [
    { header: "#", width: 30 },
    { header: "Referred At / Ref #", width: 100 },
    { header: "Patient Details", width: 132 },
    { header: "Laboratory & Status", width: 124 },
    { header: "Requested Lab Tests (Test | Description | Unit Price)", width: 250 },
    { header: "Amount & Notes", width: 140 },
  ];

  const labRows = labReferrals.map((r, idx) => {
    const sourceLabel = r.opVisit?.visitNumber
      ? `OP: ${r.opVisit.visitNumber}`
      : r.ipAdmission?.admissionNumber
        ? `IP: ${r.ipAdmission.admissionNumber}`
        : "Direct";

    const itemsText =
      r.items.length > 0
        ? r.items
            .map((it) => {
              const descPart = it.descriptionSnapshot
                ? ` (${it.descriptionSnapshot})`
                : "";
              const pricePart =
                it.unitPriceSnapshot !== null
                  ? ` - ${formatMoney(it.unitPriceSnapshot)}`
                  : "";
              return `- ${it.testNameSnapshot}${descPart}${pricePart}`;
            })
            .join("\n")
        : "-";

    const statusLines = [
      r.labNameSnapshot,
      `Status: ${r.status}`,
      r.completedAt
        ? `Done: ${formatPdfDateTime(r.completedAt, tzOffsetMinutes)}`
        : r.cancelledAt
          ? `Cancelled: ${formatPdfDateTime(r.cancelledAt, tzOffsetMinutes)}`
          : null,
      r.completedByNameSnapshot ? `By: ${r.completedByNameSnapshot}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    return [
      String(idx + 1),
      `${formatPdfDateTime(r.referredAt, tzOffsetMinutes)}\n${r.referralNumber}\n${sourceLabel}`,
      `${r.patientNameSnapshot}\n${r.patientUhidSnapshot}\nPh: ${r.patientPhoneSnapshot ?? "-"}`,
      statusLines,
      itemsText,
      `Total: ${formatMoney(r.totalAmount)}${r.notes ? `\nNotes: ${r.notes}` : ""}`,
    ];
  });

  drawPaginatedTable(
    ctx,
    "Section 4: Laboratory Referrals",
    labColumns,
    labRows,
    "No laboratory referrals recorded for this hospital."
  );

  drawSummaryBox(ctx, "Section 4: Laboratory Referrals", [
    `Section 4 Summary - Total Referrals: ${labReferrals.length} (Completed: ${labCompleted} | Pending: ${labPending} | Cancelled: ${labCancelled})`,
    `Total Lab Tests Ordered: ${labItemsCount} | Total Laboratory Referral Amount: ${formatMoney(labTotalAmount)}`,
  ]);

  // Stamp global page numbers on all buffered pages without triggering extra page breaks
  const pageRange = doc.bufferedPageRange();
  const totalPages = pageRange.count;
  for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(pageRange.start + i);
    const prevBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const footerY = doc.page.height - 24;
    doc
      .save()
      .fillColor(COLORS.muted)
      .font("Helvetica")
      .fontSize(7.5)
      .text(
        sanitizePdfText(
          `HospitalPro by Zeronnn Technologies | ${hospital.name} (${hospital.code}) - Confidential Super Admin Export`
        ),
        PAGE_MARGIN_X,
        footerY,
        { width: TABLE_WIDTH - 110, align: "left", lineBreak: false }
      )
      .text(
        `Page ${i + 1} of ${totalPages}`,
        PAGE_MARGIN_X + TABLE_WIDTH - 105,
        footerY,
        { width: 105, align: "right", lineBreak: false }
      )
      .restore();
    doc.page.margins.bottom = prevBottomMargin;
  }

  doc.end();
  const buffer = await pdfBufferPromise;

  const safeSlug =
    hospital.slug.toLowerCase().replace(/[^a-z0-9-_]+/g, "-") ||
    hospital.code.toLowerCase();
  const dateTag = new Date().toISOString().slice(0, 10);

  return {
    buffer,
    filename: `${safeSlug}-complete-data-${dateTag}.pdf`,
    hospitalCode: hospital.code,
    hospitalName: hospital.name,
    counts: {
      opVisits: opVisits.length,
      ipAdmissions: ipAdmissions.length,
      bedTransfers: bedTransfers.length,
      ipReceipts: ipReceipts.length,
      pharmacyReferrals: pharmacyReferrals.length,
      labReferrals: labReferrals.length,
    },
  };
}
