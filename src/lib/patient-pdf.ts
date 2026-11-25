import PDFDocument from "pdfkit";
import { prisma } from "@/lib/prisma";
import { sanitizePdfText } from "@/lib/hospital-pdf";
import { parseDateRangeBounds } from "@/lib/datetime";

const PAGE_MARGIN_X = 32;
const PAGE_MARGIN_TOP = 32;
const PAGE_MARGIN_BOTTOM = 38;
const TABLE_WIDTH = 776; // Landscape A4 (841.89pt - 64pt horizontal margins)

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
  patientUhid: string;
  patientName: string;
  y: number;
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
        `${ctx.hospitalName} (${ctx.hospitalCode})  |  Patient: ${ctx.patientName} (${ctx.patientUhid})  |  ${bannerTitle}`
      ),
      PAGE_MARGIN_X,
      16,
      { width: TABLE_WIDTH, lineBreak: false }
    )
    .moveTo(PAGE_MARGIN_X, 27)
    .lineTo(PAGE_MARGIN_X + TABLE_WIDTH, 27)
    .lineWidth(0.6)
    .strokeColor(COLORS.border)
    .stroke()
    .restore();
}

function addPageWithHeader(ctx: PdfContext, bannerTitle: string) {
  ctx.doc.addPage({
    size: "A4",
    layout: "landscape",
    margins: {
      top: PAGE_MARGIN_TOP,
      bottom: PAGE_MARGIN_BOTTOM,
      left: PAGE_MARGIN_X,
      right: PAGE_MARGIN_X,
    },
  });
  drawContinuationHeader(ctx, bannerTitle);
  ctx.y = 36;
}

function ensureSpace(ctx: PdfContext, neededHeight: number, bannerTitle: string) {
  const maxY = ctx.doc.page.height - PAGE_MARGIN_BOTTOM - 16;
  if (ctx.y + neededHeight > maxY) {
    addPageWithHeader(ctx, bannerTitle);
  }
}

function drawSectionBanner(
  ctx: PdfContext,
  sectionNo: string,
  title: string,
  subtitle: string,
  bannerTitle: string
) {
  ensureSpace(ctx, 56, bannerTitle);
  const { doc } = ctx;
  const boxH = 34;

  doc
    .save()
    .roundedRect(PAGE_MARGIN_X, ctx.y, TABLE_WIDTH, boxH, 5)
    .fillColor(COLORS.sectionBg)
    .fill()
    .lineWidth(0.8)
    .strokeColor("#a7dfc0")
    .stroke()
    .restore();

  doc
    .save()
    .fillColor(COLORS.forest)
    .font("Helvetica-Bold")
    .fontSize(11)
    .text(
      sanitizePdfText(`SECTION ${sectionNo}: ${title}`),
      PAGE_MARGIN_X + 10,
      ctx.y + 6,
      { width: TABLE_WIDTH - 20 }
    )
    .fillColor(COLORS.muted)
    .font("Helvetica")
    .fontSize(8)
    .text(sanitizePdfText(subtitle), PAGE_MARGIN_X + 10, ctx.y + 20, {
      width: TABLE_WIDTH - 20,
    })
    .restore();

  ctx.y += boxH + 8;
}

function drawTableHeader(ctx: PdfContext, columns: TableColumn[]) {
  const { doc } = ctx;
  const headerH = 22;
  doc
    .save()
    .rect(PAGE_MARGIN_X, ctx.y, TABLE_WIDTH, headerH)
    .fillColor(COLORS.headerBg)
    .fill()
    .restore();

  let x = PAGE_MARGIN_X;
  doc.save().fillColor(COLORS.white).font("Helvetica-Bold").fontSize(7.5);
  for (const col of columns) {
    doc.text(sanitizePdfText(col.header), x + 4, ctx.y + 7, {
      width: col.width - 8,
      align: col.align ?? "left",
      lineBreak: false,
      ellipsis: true,
    });
    x += col.width;
  }
  doc.restore();
  ctx.y += headerH;
}

function drawTable(
  ctx: PdfContext,
  columns: TableColumn[],
  rows: string[][],
  bannerTitle: string,
  emptyMessage: string
) {
  const { doc } = ctx;
  if (rows.length === 0) {
    ensureSpace(ctx, 28, bannerTitle);
    doc
      .save()
      .roundedRect(PAGE_MARGIN_X, ctx.y, TABLE_WIDTH, 24, 4)
      .fillColor(COLORS.zebraBg)
      .fill()
      .lineWidth(0.5)
      .strokeColor(COLORS.border)
      .stroke()
      .fillColor(COLORS.muted)
      .font("Helvetica-Oblique")
      .fontSize(8.5)
      .text(sanitizePdfText(emptyMessage), PAGE_MARGIN_X + 10, ctx.y + 8, {
        width: TABLE_WIDTH - 20,
      })
      .restore();
    ctx.y += 32;
    return;
  }

  ensureSpace(ctx, 48, bannerTitle);
  drawTableHeader(ctx, columns);

  const maxY = () => ctx.doc.page.height - PAGE_MARGIN_BOTTOM - 14;

  for (let rIdx = 0; rIdx < rows.length; rIdx++) {
    const rawRow = rows[rIdx];
    const cells = columns.map((_, cIdx) => sanitizePdfText(rawRow[cIdx], "-"));

    doc.font("Helvetica").fontSize(7.5);
    let maxHeight = 14;
    for (let cIdx = 0; cIdx < columns.length; cIdx++) {
      const h = doc.heightOfString(cells[cIdx], {
        width: columns[cIdx].width - 8,
        lineGap: 1.5,
      });
      if (h > maxHeight) maxHeight = h;
    }
    const rowH = Math.min(Math.max(18, Math.ceil(maxHeight) + 8), 260);

    if (ctx.y + rowH > maxY()) {
      addPageWithHeader(ctx, bannerTitle);
      drawTableHeader(ctx, columns);
    }

    doc
      .save()
      .rect(PAGE_MARGIN_X, ctx.y, TABLE_WIDTH, rowH)
      .fillColor(rIdx % 2 === 1 ? COLORS.zebraBg : COLORS.white)
      .fill()
      .lineWidth(0.4)
      .strokeColor(COLORS.border)
      .stroke()
      .restore();

    let x = PAGE_MARGIN_X;
    doc.save().fillColor(COLORS.ink).font("Helvetica").fontSize(7.5);
    for (let cIdx = 0; cIdx < columns.length; cIdx++) {
      const col = columns[cIdx];
      doc.text(cells[cIdx], x + 4, ctx.y + 4, {
        width: col.width - 8,
        height: rowH - 6,
        align: col.align ?? "left",
        lineGap: 1.5,
        ellipsis: true,
      });
      if (cIdx > 0) {
        doc
          .moveTo(x, ctx.y)
          .lineTo(x, ctx.y + rowH)
          .lineWidth(0.3)
          .strokeColor("#e2efe7")
          .stroke();
      }
      x += col.width;
    }
    doc.restore();
    ctx.y += rowH;
  }

  ctx.y += 12;
}

export interface PatientAuditPdfResult {
  buffer: Buffer;
  filename: string;
  patientUhid: string;
  patientName: string;
  counts: {
    opVisits: number;
    ipAdmissions: number;
    bedTransfers: number;
    pharmacyReferrals: number;
    labReferrals: number;
    billingReceipts: number;
  };
}

export async function buildPatientAuditPdf(params: {
  hospitalId: string;
  patientIdOrUhid: string;
  generatedByName: string;
  generatedByRole: string;
  tzOffsetMinutes?: number;
}): Promise<PatientAuditPdfResult | null> {
  const tzOffset = params.tzOffsetMinutes ?? 0;

  const [hospital, patient] = await Promise.all([
    prisma.hospital.findUnique({
      where: { id: params.hospitalId },
      select: {
        id: true,
        code: true,
        name: true,
        address: true,
        phone: true,
        email: true,
        registrationNo: true,
      },
    }),
    prisma.patient.findFirst({
      where: {
        hospitalId: params.hospitalId,
        OR: [{ id: params.patientIdOrUhid }, { uhid: params.patientIdOrUhid }],
      },
      include: {
        opVisits: {
          orderBy: [{ visitDate: "desc" }, { createdAt: "desc" }],
          include: {
            billingReceipts: {
              select: { receiptNumber: true, totalAmount: true },
            },
          },
        },
        ipAdmissions: {
          orderBy: [{ admittedAt: "desc" }, { createdAt: "desc" }],
          include: {
            bedTransfers: {
              orderBy: [{ transferredAt: "asc" }],
            },
          },
        },
        pharmacyReferrals: {
          orderBy: [{ referredAt: "desc" }, { createdAt: "desc" }],
          include: { items: true },
        },
        labReferrals: {
          orderBy: [{ referredAt: "desc" }, { createdAt: "desc" }],
          include: { items: true },
        },
        billingReceipts: {
          orderBy: [{ issuedAt: "desc" }, { id: "desc" }],
        },
      },
    }),
  ]);

  if (!hospital || !patient) {
    return null;
  }

  const allBedTransfers = patient.ipAdmissions.flatMap((adm) =>
    adm.bedTransfers.map((tr) => ({
      admissionNumber: adm.admissionNumber,
      transferredAt: tr.transferredAt,
      fromBedLabel: tr.fromBedLabel,
      toBedLabel: tr.toBedLabel,
      reason: tr.reason,
    }))
  );

  const totalOpCharges = patient.opVisits.reduce(
    (sum, v) => sum + (v.totalAmount ?? 0),
    0
  );
  const totalIpCharges = patient.ipAdmissions.reduce(
    (sum, a) => sum + (a.chargeAmount ?? 0),
    0
  );
  const totalPharmCharges = patient.pharmacyReferrals.reduce(
    (sum, r) => sum + (r.totalAmount ?? 0),
    0
  );
  const totalLabCharges = patient.labReferrals.reduce(
    (sum, r) => sum + (r.totalAmount ?? 0),
    0
  );
  const totalReceiptCharges = patient.billingReceipts.reduce(
    (sum, r) => sum + (r.totalAmount ?? 0),
    0
  );

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
      Title: sanitizePdfText(
        `Patient Audit Report - ${patient.fullName} (${patient.uhid})`
      ),
      Author: "HospitalPro by Zeronnn Technologies",
      Subject: "Complete Individual Patient Clinical & Billing Audit Report",
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const donePromise = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const ctx: PdfContext = {
    doc,
    hospitalName: hospital.name,
    hospitalCode: hospital.code,
    patientUhid: patient.uhid,
    patientName: patient.fullName,
    y: PAGE_MARGIN_TOP,
  };

  const generatedAtLabel = formatPdfDateTime(new Date(), tzOffset);

  // --- Top Audit Header Banner ---
  const bannerH = 74;
  doc
    .save()
    .roundedRect(PAGE_MARGIN_X, ctx.y, TABLE_WIDTH, bannerH, 8)
    .fillColor(COLORS.forest)
    .fill()
    .restore();

  doc
    .save()
    .fillColor("#a7f3d0")
    .font("Helvetica-Bold")
    .fontSize(8)
    .text(
      "HOSPITALPRO BY ZERONNN TECHNOLOGIES  |  OFFICIAL PATIENT HISTORY AUDIT REPORT",
      PAGE_MARGIN_X + 14,
      ctx.y + 10,
      { width: TABLE_WIDTH - 28 }
    )
    .fillColor(COLORS.white)
    .font("Helvetica-Bold")
    .fontSize(16)
    .text(
      sanitizePdfText(`${hospital.name} (${hospital.code})`),
      PAGE_MARGIN_X + 14,
      ctx.y + 23,
      { width: 490 }
    )
    .fillColor("#d1fae5")
    .font("Helvetica")
    .fontSize(8)
    .text(
      sanitizePdfText(
        [
          hospital.address,
          hospital.phone ? `Phone: ${hospital.phone}` : null,
          hospital.email ? `Email: ${hospital.email}` : null,
          hospital.registrationNo ? `Reg No: ${hospital.registrationNo}` : null,
        ]
          .filter(Boolean)
          .join("  |  "),
        "Multi-Tenant Hospital Clinical Record"
      ),
      PAGE_MARGIN_X + 14,
      ctx.y + 44,
      { width: 490 }
    )
    .fillColor(COLORS.white)
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .text(
      sanitizePdfText(`UHID: ${patient.uhid}`),
      PAGE_MARGIN_X + 515,
      ctx.y + 18,
      { width: TABLE_WIDTH - 529, align: "right" }
    )
    .fillColor("#d1fae5")
    .font("Helvetica")
    .fontSize(7.8)
    .text(
      sanitizePdfText(`Generated: ${generatedAtLabel}`),
      PAGE_MARGIN_X + 515,
      ctx.y + 33,
      { width: TABLE_WIDTH - 529, align: "right" }
    )
    .text(
      sanitizePdfText(`Prepared By: ${params.generatedByName} (${params.generatedByRole})`),
      PAGE_MARGIN_X + 515,
      ctx.y + 46,
      { width: TABLE_WIDTH - 529, align: "right" }
    )
    .restore();

  ctx.y += bannerH + 10;

  // --- Patient Profile Details Card ---
  const profileH = 56;
  doc
    .save()
    .roundedRect(PAGE_MARGIN_X, ctx.y, TABLE_WIDTH, profileH, 6)
    .fillColor(COLORS.mintBg)
    .fill()
    .lineWidth(0.8)
    .strokeColor(COLORS.border)
    .stroke()
    .restore();

  const colW = TABLE_WIDTH / 4;
  const profileFields = [
    ["Patient Full Name", patient.fullName],
    ["Permanent UHID", patient.uhid],
    [
      "Gender / Current Age",
      `${patient.gender} / ${patient.age !== null ? `${patient.age} yrs` : "Not set"}`,
    ],
    ["Mobile Number", patient.phone],
    ["Registered At", formatPdfDateTime(patient.registeredAt, tzOffset)],
    ["Blood Group", patient.bloodGroup ?? "Not specified"],
    ["Emergency Contact", patient.emergencyContact ?? "Not specified"],
    ["Address", patient.address ?? "Not specified"],
  ];

  doc.save();
  profileFields.forEach(([label, val], idx) => {
    const col = idx % 4;
    const row = Math.floor(idx / 4);
    const fx = PAGE_MARGIN_X + 10 + col * colW;
    const fy = ctx.y + 7 + row * 24;
    doc
      .fillColor(COLORS.muted)
      .font("Helvetica-Bold")
      .fontSize(6.8)
      .text(sanitizePdfText(label.toUpperCase()), fx, fy, {
        width: colW - 14,
        lineBreak: false,
      });
    doc
      .fillColor(COLORS.ink)
      .font("Helvetica-Bold")
      .fontSize(8.5)
      .text(sanitizePdfText(val), fx, fy + 9, {
        width: colW - 14,
        lineBreak: false,
        ellipsis: true,
      });
  });
  doc.restore();
  ctx.y += profileH + 10;

  // --- Summary Audit Metrics Strip ---
  const summaryCards = [
    { label: "OP Appointments", value: String(patient.opVisits.length), sub: `Fees: ${formatMoney(totalOpCharges)}` },
    { label: "IP Admissions", value: String(patient.ipAdmissions.length), sub: `Charges: ${formatMoney(totalIpCharges)}` },
    { label: "Pharmacy Referrals", value: String(patient.pharmacyReferrals.length), sub: `Total: ${formatMoney(totalPharmCharges)}` },
    { label: "Laboratory Referrals", value: String(patient.labReferrals.length), sub: `Total: ${formatMoney(totalLabCharges)}` },
    { label: "Billing Receipts", value: String(patient.billingReceipts.length), sub: `Billed: ${formatMoney(totalReceiptCharges)}` },
  ];
  const gap = 8;
  const cardW = (TABLE_WIDTH - gap * (summaryCards.length - 1)) / summaryCards.length;
  const cardH = 44;

  summaryCards.forEach((card, i) => {
    const cx = PAGE_MARGIN_X + i * (cardW + gap);
    doc
      .save()
      .roundedRect(cx, ctx.y, cardW, cardH, 5)
      .fillColor(COLORS.white)
      .fill()
      .lineWidth(0.8)
      .strokeColor(COLORS.border)
      .stroke()
      .fillColor(COLORS.muted)
      .font("Helvetica-Bold")
      .fontSize(7)
      .text(sanitizePdfText(card.label.toUpperCase()), cx + 8, ctx.y + 6, {
        width: cardW - 16,
        lineBreak: false,
      })
      .fillColor(COLORS.forest)
      .font("Helvetica-Bold")
      .fontSize(13)
      .text(sanitizePdfText(card.value), cx + 8, ctx.y + 16, {
        width: cardW - 16,
        lineBreak: false,
      })
      .fillColor(COLORS.muted)
      .font("Helvetica")
      .fontSize(7)
      .text(sanitizePdfText(card.sub), cx + 8, ctx.y + 32, {
        width: cardW - 16,
        lineBreak: false,
        ellipsis: true,
      })
      .restore();
  });
  ctx.y += cardH + 14;

  // --- SECTION 1: OP APPOINTMENTS & CONSULTATIONS ---
  drawSectionBanner(
    ctx,
    "1",
    "OP APPOINTMENTS & CONSULTATIONS",
    `Complete outpatient visit & appointment log (${patient.opVisits.length} visit(s))`,
    "Section 1: OP Appointments & Consultations"
  );
  drawTable(
    ctx,
    [
      { header: "Visit No", width: 82 },
      { header: "Appointment Date & Time", width: 118 },
      { header: "Consulting Doctor & Dept", width: 138 },
      { header: "Reason / Clinical Notes", width: 186 },
      { header: "Fees (Reg / Cons / Total)", width: 114, align: "right" },
      { header: "Payment", width: 68 },
      { header: "Receipt No", width: 70 },
    ],
    patient.opVisits.map((v) => {
      const feeDetails = [
        v.registrationFee !== null ? `Reg: ${formatMoney(v.registrationFee)}` : null,
        v.consultationFee !== null ? `Cons: ${formatMoney(v.consultationFee)}` : null,
        `Total: ${formatMoney(v.totalAmount)}`,
      ]
        .filter(Boolean)
        .join("\n");
      const reasonAndNotes = [
        v.reasonForVisit ? `Reason: ${v.reasonForVisit}` : null,
        v.notes ? `Notes: ${v.notes}` : null,
      ]
        .filter(Boolean)
        .join("\n");
      return [
        v.visitNumber,
        formatPdfDateTime(v.visitDate, tzOffset),
        `${v.doctorNameSnapshot}${v.departmentSnapshot ? `\n(${v.departmentSnapshot})` : ""}`,
        reasonAndNotes || "OP Consultation",
        feeDetails,
        [v.paymentStatus ?? "NO_CHARGE", v.paymentMode].filter(Boolean).join("\n"),
        v.billingReceipts.map((r) => r.receiptNumber).join("\n") || "-",
      ];
    }),
    "Section 1: OP Appointments & Consultations",
    "No OP appointments or consultations recorded for this patient."
  );

  // --- SECTION 2: IP MANAGEMENT, ADMISSIONS, DISCHARGES, BED TRANSFERS & CHARGES ---
  drawSectionBanner(
    ctx,
    "2",
    "IP MANAGEMENT, ADMISSIONS, DISCHARGES & CHARGES",
    `Inpatient admissions (${patient.ipAdmissions.length}), discharges, charges, and bed transfer history (${allBedTransfers.length} transfer(s))`,
    "Section 2: IP Management & Discharges"
  );
  drawTable(
    ctx,
    [
      { header: "Admission No", width: 82 },
      { header: "Ward / Bed", width: 92 },
      { header: "Attending Doctor", width: 102 },
      { header: "Admitted At", width: 108 },
      { header: "Discharged At / Status", width: 114 },
      { header: "IP Charge", width: 72, align: "right" },
      { header: "Admission / Discharge Notes & Transfers", width: 206 },
    ],
    patient.ipAdmissions.map((a) => {
      const notesParts = [
        a.admissionNotes ? `Admit Notes: ${a.admissionNotes}` : null,
        a.dischargeNotes ? `Discharge Notes: ${a.dischargeNotes}` : null,
        ...a.bedTransfers.map(
          (t) =>
            `Transfer (${formatPdfDateTime(t.transferredAt, tzOffset)}): ${
              t.fromBedLabel ? `${t.fromBedLabel} -> ` : "Assigned "
            }${t.toBedLabel}${t.reason ? ` [${t.reason}]` : ""}`
        ),
      ].filter(Boolean);

      return [
        a.admissionNumber,
        `${a.wardSnapshot}\nBed: ${a.bedNumberSnapshot}`,
        a.doctorNameSnapshot,
        formatPdfDateTime(a.admittedAt, tzOffset),
        a.dischargedAt
          ? `${a.status}\n${formatPdfDateTime(a.dischargedAt, tzOffset)}`
          : `${a.status}\n(Active Stay)`,
        formatMoney(a.chargeAmount),
        notesParts.join("\n") || "-",
      ];
    }),
    "Section 2: IP Management & Discharges",
    "No IP admissions or discharges recorded for this patient."
  );

  // --- SECTION 3: PHARMACY REFERRALS & MEDICINES ---
  drawSectionBanner(
    ctx,
    "3",
    "PHARMACY REFERRALS & PRESCRIBED MEDICINES",
    `Complete pharmacy referral history (${patient.pharmacyReferrals.length} referral(s))`,
    "Section 3: Pharmacy Referrals"
  );
  drawTable(
    ctx,
    [
      { header: "Referral No", width: 82 },
      { header: "Referred Date & Time", width: 112 },
      { header: "Pharmacy Partner", width: 114 },
      { header: "Medicines Prescribed (Qty & Price)", width: 236 },
      { header: "Status & Completion", width: 116 },
      { header: "Total Charge", width: 66, align: "right" },
      { header: "Notes", width: 50 },
    ],
    patient.pharmacyReferrals.map((pr) => {
      const medsList = pr.items
        .map((i) => {
          const priceStr =
            i.lineTotal !== null
              ? ` [${formatMoney(i.lineTotal)}]`
              : i.unitPriceSnapshot !== null
                ? ` [${formatMoney(i.unitPriceSnapshot)}/u]`
                : "";
          const dosage = i.dosageInstructions ? ` - ${i.dosageInstructions}` : "";
          return `${i.medicineNameSnapshot} x${i.quantity}${priceStr}${dosage}`;
        })
        .join("\n");

      const statusText = pr.completedAt
        ? `${pr.status}\n${formatPdfDateTime(pr.completedAt, tzOffset)}${
            pr.completedByNameSnapshot ? `\nBy: ${pr.completedByNameSnapshot}` : ""
          }`
        : pr.status;

      return [
        pr.referralNumber,
        formatPdfDateTime(pr.referredAt, tzOffset),
        pr.pharmacyNameSnapshot,
        medsList || "-",
        statusText,
        formatMoney(pr.totalAmount),
        pr.notes ?? "-",
      ];
    }),
    "Section 3: Pharmacy Referrals",
    "No pharmacy referrals recorded for this patient."
  );

  // --- SECTION 4: LABORATORY REFERRALS & DIAGNOSTIC TESTS ---
  drawSectionBanner(
    ctx,
    "4",
    "LABORATORY REFERRALS & DIAGNOSTIC TESTS",
    `Complete diagnostic & laboratory referral history (${patient.labReferrals.length} referral(s))`,
    "Section 4: Laboratory Referrals"
  );
  drawTable(
    ctx,
    [
      { header: "Referral No", width: 82 },
      { header: "Referred Date & Time", width: 112 },
      { header: "Laboratory Partner", width: 120 },
      { header: "Diagnostic Tests Referred", width: 220 },
      { header: "Status & Completion", width: 116 },
      { header: "Total Charge", width: 66, align: "right" },
      { header: "Notes", width: 60 },
    ],
    patient.labReferrals.map((lr) => {
      const testsList = lr.items
        .map((i) =>
          i.unitPriceSnapshot !== null
            ? `${i.testNameSnapshot} [${formatMoney(i.unitPriceSnapshot)}]`
            : i.testNameSnapshot
        )
        .join("\n");

      const statusText = lr.completedAt
        ? `${lr.status}\n${formatPdfDateTime(lr.completedAt, tzOffset)}${
            lr.completedByNameSnapshot ? `\nBy: ${lr.completedByNameSnapshot}` : ""
          }`
        : lr.status;

      return [
        lr.referralNumber,
        formatPdfDateTime(lr.referredAt, tzOffset),
        lr.labNameSnapshot,
        testsList || "-",
        statusText,
        formatMoney(lr.totalAmount),
        lr.notes ?? "-",
      ];
    }),
    "Section 4: Laboratory Referrals",
    "No laboratory referrals recorded for this patient."
  );

  // --- SECTION 5: BILLING RECEIPTS & INDIVIDUAL PATIENT CHARGES LEDGER ---
  drawSectionBanner(
    ctx,
    "5",
    "INDIVIDUAL PATIENT CHARGES & BILLING RECEIPTS LEDGER",
    `Complete billing receipts & charge snapshots (${patient.billingReceipts.length} receipt(s) · Total Billed: ${formatMoney(totalReceiptCharges)})`,
    "Section 5: Billing Receipts & Charges"
  );
  drawTable(
    ctx,
    [
      { header: "Receipt No", width: 86 },
      { header: "Issued Date & Time", width: 116 },
      { header: "Visit / Charge Summary", width: 170 },
      { header: "Itemized Charges", width: 178 },
      { header: "Payment Mode / Status", width: 88 },
      { header: "Amount", width: 70, align: "right" },
      { header: "Issued By", width: 68 },
    ],
    patient.billingReceipts.map((rc) => [
      rc.receiptNumber,
      formatPdfDateTime(rc.issuedAt, tzOffset),
      rc.visitSummarySnapshot,
      parseReceiptLineItems(rc.lineItemsJson),
      [rc.paymentStatus ?? "NO_CHARGE", rc.paymentMode].filter(Boolean).join("\n"),
      formatMoney(rc.totalAmount),
      rc.issuedByNameSnapshot,
    ]),
    "Section 5: Billing Receipts & Charges",
    "No billing receipts recorded for this patient."
  );

  // --- Stamp Page Numbers on Every Page (Zero Trailing Blank Page!) ---
  const range = doc.bufferedPageRange();
  const totalPages = range.count;
  for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(range.start + i);
    const savedBottomMargin = doc.page.margins.bottom;
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
          `HospitalPro Audit Export  |  ${hospital.name} (${hospital.code})  |  Patient: ${patient.fullName} (${patient.uhid})`
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
    doc.page.margins.bottom = savedBottomMargin;
  }

  doc.end();
  const buffer = await donePromise;

  const safeUhid = patient.uhid.replace(/[^a-zA-Z0-9_-]+/g, "-");
  const dateStamp = new Date().toISOString().slice(0, 10);

  return {
    buffer,
    filename: `patient-audit-${safeUhid}-${dateStamp}.pdf`,
    patientUhid: patient.uhid,
    patientName: patient.fullName,
    counts: {
      opVisits: patient.opVisits.length,
      ipAdmissions: patient.ipAdmissions.length,
      bedTransfers: allBedTransfers.length,
      pharmacyReferrals: patient.pharmacyReferrals.length,
      labReferrals: patient.labReferrals.length,
      billingReceipts: patient.billingReceipts.length,
    },
  };
}

export interface AllPatientsAuditPdfResult {
  buffer: Buffer;
  filename: string;
  timelineLabel: string;
  counts: {
    patients: number;
    opVisits: number;
    ipAdmissions: number;
    pharmacyOrders: number;
    labReferrals: number;
    billingReceipts: number;
  };
}

function drawSubHeading(ctx: PdfContext, label: string, bannerTitle: string) {
  ensureSpace(ctx, 40, bannerTitle);
  ctx.doc
    .save()
    .fillColor(COLORS.forest)
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .text(sanitizePdfText(label), PAGE_MARGIN_X, ctx.y, {
      width: TABLE_WIDTH,
    })
    .restore();
  ctx.y += 13;
}

export async function buildAllPatientsAuditPdf(params: {
  hospitalId: string;
  from?: string | null;
  to?: string | null;
  generatedByName: string;
  generatedByRole: string;
  tzOffsetMinutes?: number;
}): Promise<AllPatientsAuditPdfResult | null> {
  const tzOffset = params.tzOffsetMinutes ?? 0;

  const hospital = await prisma.hospital.findUnique({
    where: { id: params.hospitalId },
    select: {
      id: true,
      name: true,
      code: true,
      address: true,
      phone: true,
      email: true,
    },
  });
  if (!hospital) return null;

  const hasRange = Boolean(params.from || params.to);
  const dateFilter = hasRange
    ? parseDateRangeBounds({
        from: params.from,
        to: params.to,
        tzOffsetMinutes: tzOffset,
      })
    : undefined;

  const patients = await prisma.patient.findMany({
    where: {
      hospitalId: params.hospitalId,
      ...(hasRange && dateFilter
        ? {
            OR: [
              { registeredAt: dateFilter },
              { opVisits: { some: { visitDate: dateFilter } } },
              { ipAdmissions: { some: { admittedAt: dateFilter } } },
              { pharmacyReferrals: { some: { referredAt: dateFilter } } },
              { doctorPrescriptions: { some: { prescribedAt: dateFilter } } },
              { labReferrals: { some: { referredAt: dateFilter } } },
              { billingReceipts: { some: { issuedAt: dateFilter } } },
            ],
          }
        : {}),
    },
    orderBy: [{ registeredAt: "desc" }, { id: "desc" }],
    include: {
      opVisits: {
        where: hasRange && dateFilter ? { visitDate: dateFilter } : undefined,
        orderBy: { visitDate: "desc" },
      },
      ipAdmissions: {
        where: hasRange && dateFilter ? { admittedAt: dateFilter } : undefined,
        orderBy: { admittedAt: "desc" },
        include: {
          bedTransfers: { orderBy: { transferredAt: "asc" } },
          stayExtensions: { orderBy: { createdAt: "asc" } },
        },
      },
      pharmacyReferrals: {
        where: hasRange && dateFilter ? { referredAt: dateFilter } : undefined,
        orderBy: { referredAt: "desc" },
        include: { items: true },
      },
      doctorPrescriptions: {
        where: hasRange && dateFilter ? { prescribedAt: dateFilter } : undefined,
        orderBy: { prescribedAt: "desc" },
        include: { items: true },
      },
      labReferrals: {
        where: hasRange && dateFilter ? { referredAt: dateFilter } : undefined,
        orderBy: { referredAt: "desc" },
        include: { items: true },
      },
      billingReceipts: {
        where: hasRange && dateFilter ? { issuedAt: dateFilter } : undefined,
        orderBy: { issuedAt: "desc" },
      },
    },
  });

  const timelineLabel = hasRange
    ? `${dateFilter?.gte ? formatPdfDateTime(dateFilter.gte, tzOffset) : "Start"} to ${
        dateFilter?.lte ? formatPdfDateTime(dateFilter.lte, tzOffset) : "Now"
      }`
    : "All Time (Complete Hospital Patient Archive)";

  const totalOpVisits = patients.reduce((s, p) => s + p.opVisits.length, 0);
  const totalIpAdmissions = patients.reduce((s, p) => s + p.ipAdmissions.length, 0);
  const totalPharmacyOrders = patients.reduce(
    (s, p) => s + p.pharmacyReferrals.length + p.doctorPrescriptions.length,
    0
  );
  const totalLabReferrals = patients.reduce((s, p) => s + p.labReferrals.length, 0);
  const totalBillingReceipts = patients.reduce(
    (s, p) => s + p.billingReceipts.length,
    0
  );

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
      Title: sanitizePdfText(`${hospital.name} - All Patients History Report`),
      Author: "HospitalPro by Zeronnn Technologies",
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const donePromise = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const ctx: PdfContext = {
    doc,
    hospitalName: hospital.name,
    hospitalCode: hospital.code,
    patientUhid: "ALL PATIENTS",
    patientName: timelineLabel,
    y: PAGE_MARGIN_TOP,
  };

  // --- Header Banner ---
  const bannerH = 74;
  doc
    .save()
    .roundedRect(PAGE_MARGIN_X, ctx.y, TABLE_WIDTH, bannerH, 8)
    .fillColor(COLORS.forest)
    .fill()
    .fillColor("#a7f3d0")
    .font("Helvetica-Bold")
    .fontSize(8)
    .text(
      "HOSPITALPRO BY ZERONNN TECHNOLOGIES  |  ALL PATIENTS INDIVIDUAL HISTORY REPORT",
      PAGE_MARGIN_X + 14,
      ctx.y + 10,
      { width: TABLE_WIDTH - 28 }
    )
    .fillColor(COLORS.white)
    .font("Helvetica-Bold")
    .fontSize(15)
    .text(
      sanitizePdfText(`${hospital.name} (${hospital.code})`),
      PAGE_MARGIN_X + 14,
      ctx.y + 24,
      { width: 470 }
    )
    .fillColor("#d1fae5")
    .font("Helvetica")
    .fontSize(8.2)
    .text(
      sanitizePdfText(`Timeline: ${timelineLabel}`),
      PAGE_MARGIN_X + 14,
      ctx.y + 46,
      { width: 480 }
    )
    .fillColor(COLORS.white)
    .font("Helvetica")
    .fontSize(8)
    .text(
      sanitizePdfText(`Generated: ${formatPdfDateTime(new Date(), tzOffset)}`),
      PAGE_MARGIN_X + 510,
      ctx.y + 26,
      { width: TABLE_WIDTH - 524, align: "right" }
    )
    .text(
      sanitizePdfText(`By: ${params.generatedByName} (${params.generatedByRole})`),
      PAGE_MARGIN_X + 510,
      ctx.y + 40,
      { width: TABLE_WIDTH - 524, align: "right" }
    )
    .restore();

  ctx.y += bannerH + 10;

  // --- Executive KPI Strip ---
  const summaryCards = [
    { label: "Total Patients", value: String(patients.length) },
    { label: "OP Consultations", value: String(totalOpVisits) },
    { label: "IP Admissions", value: String(totalIpAdmissions) },
    { label: "Pharmacy Orders", value: String(totalPharmacyOrders) },
    { label: "Lab Referrals", value: String(totalLabReferrals) },
    { label: "Billing Receipts", value: String(totalBillingReceipts) },
  ];
  const gap = 8;
  const cardW = (TABLE_WIDTH - gap * (summaryCards.length - 1)) / summaryCards.length;
  const cardH = 38;
  summaryCards.forEach((c, idx) => {
    const cx = PAGE_MARGIN_X + idx * (cardW + gap);
    doc
      .save()
      .roundedRect(cx, ctx.y, cardW, cardH, 5)
      .fillColor(COLORS.mintBg)
      .fill()
      .lineWidth(0.7)
      .strokeColor(COLORS.border)
      .stroke()
      .fillColor(COLORS.muted)
      .font("Helvetica-Bold")
      .fontSize(6.8)
      .text(sanitizePdfText(c.label.toUpperCase()), cx + 8, ctx.y + 6, {
        width: cardW - 16,
        lineBreak: false,
      })
      .fillColor(COLORS.forest)
      .font("Helvetica-Bold")
      .fontSize(12)
      .text(sanitizePdfText(c.value), cx + 8, ctx.y + 18, {
        width: cardW - 16,
        lineBreak: false,
      })
      .restore();
  });
  ctx.y += cardH + 14;

  if (patients.length === 0) {
    doc
      .save()
      .roundedRect(PAGE_MARGIN_X, ctx.y, TABLE_WIDTH, 32, 6)
      .fillColor(COLORS.zebraBg)
      .fill()
      .lineWidth(0.6)
      .strokeColor(COLORS.border)
      .stroke()
      .fillColor(COLORS.muted)
      .font("Helvetica-Oblique")
      .fontSize(9)
      .text(
        sanitizePdfText(`No patient records found for timeline: ${timelineLabel}.`),
        PAGE_MARGIN_X + 12,
        ctx.y + 11
      )
      .restore();
  } else {
    for (let idx = 0; idx < patients.length; idx++) {
      const p = patients[idx];
      const bannerTitle = `Patient #${idx + 1}: ${p.fullName} (${p.uhid})`;
      ctx.patientName = p.fullName;
      ctx.patientUhid = p.uhid;

      // Ensure comfortable space for Patient Banner + first lines
      ensureSpace(ctx, 88, bannerTitle);

      // Patient Dossier Header Strip
      const pBoxH = 40;
      doc
        .save()
        .roundedRect(PAGE_MARGIN_X, ctx.y, TABLE_WIDTH, pBoxH, 6)
        .fillColor(COLORS.sectionBg)
        .fill()
        .lineWidth(0.9)
        .strokeColor("#8fd3ae")
        .stroke()
        .fillColor(COLORS.forest)
        .font("Helvetica-Bold")
        .fontSize(10.5)
        .text(
          sanitizePdfText(
            `PATIENT #${idx + 1}: ${p.fullName}  |  UHID: ${p.uhid}`
          ),
          PAGE_MARGIN_X + 10,
          ctx.y + 7,
          { width: 520, lineBreak: false, ellipsis: true }
        )
        .fillColor(COLORS.ink)
        .font("Helvetica")
        .fontSize(8)
        .text(
          sanitizePdfText(
            `Age / Gender: ${p.age !== null ? `${p.age} yrs` : "N/A"} / ${p.gender}   |   Mobile: ${p.phone}   |   Blood Group: ${p.bloodGroup ?? "-"}   |   Registered: ${formatPdfDateTime(p.registeredAt, tzOffset)}`
          ),
          PAGE_MARGIN_X + 10,
          ctx.y + 23,
          { width: TABLE_WIDTH - 20, lineBreak: false, ellipsis: true }
        )
        .fillColor(COLORS.forest)
        .font("Helvetica-Bold")
        .fontSize(7.5)
        .text(
          sanitizePdfText(
            `OP: ${p.opVisits.length} | IP: ${p.ipAdmissions.length} | Rx: ${p.pharmacyReferrals.length + p.doctorPrescriptions.length} | Lab: ${p.labReferrals.length} | Receipts: ${p.billingReceipts.length}`
          ),
          PAGE_MARGIN_X + 530,
          ctx.y + 8,
          { width: TABLE_WIDTH - 540, align: "right", lineBreak: false }
        )
        .restore();
      ctx.y += pBoxH + 8;

      const hasAnyActivity =
        p.opVisits.length > 0 ||
        p.ipAdmissions.length > 0 ||
        p.pharmacyReferrals.length > 0 ||
        p.doctorPrescriptions.length > 0 ||
        p.labReferrals.length > 0 ||
        p.billingReceipts.length > 0;

      if (!hasAnyActivity) {
        doc
          .save()
          .roundedRect(PAGE_MARGIN_X, ctx.y, TABLE_WIDTH, 22, 4)
          .fillColor(COLORS.zebraBg)
          .fill()
          .lineWidth(0.5)
          .strokeColor(COLORS.border)
          .stroke()
          .fillColor(COLORS.muted)
          .font("Helvetica-Oblique")
          .fontSize(8)
          .text(
            "Patient registered in this timeline — no OP visits, IP stays, referrals, or receipts recorded in this window.",
            PAGE_MARGIN_X + 10,
            ctx.y + 7
          )
          .restore();
        ctx.y += 30;
        continue;
      }

      // 1) OP Visits
      if (p.opVisits.length > 0) {
        drawSubHeading(ctx, `OP Consultations (${p.opVisits.length})`, bannerTitle);
        drawTable(
          ctx,
          [
            { header: "Visit No", width: 84 },
            { header: "Date & Time", width: 118 },
            { header: "Consulting Doctor", width: 130 },
            { header: "Reason / Notes", width: 230 },
            { header: "Payment", width: 112 },
            { header: "Total Charge", width: 102, align: "right" },
          ],
          p.opVisits.map((v) => [
            v.visitNumber,
            formatPdfDateTime(v.visitDate, tzOffset),
            v.doctorNameSnapshot,
            [v.reasonForVisit, v.notes].filter(Boolean).join(" | ") || "-",
            [v.paymentStatus ?? "NO_CHARGE", v.paymentMode].filter(Boolean).join(" · "),
            formatMoney(v.totalAmount),
          ]),
          bannerTitle,
          ""
        );
      }

      // 2) IP Admissions, Stay Extensions & Bed Transfers
      if (p.ipAdmissions.length > 0) {
        drawSubHeading(
          ctx,
          `IP Admissions, Stay Extensions & Transfers (${p.ipAdmissions.length})`,
          bannerTitle
        );
        drawTable(
          ctx,
          [
            { header: "Admission No", width: 82 },
            { header: "Ward & Bed", width: 92 },
            { header: "Doctor", width: 102 },
            { header: "Admitted / Stay", width: 116 },
            { header: "Status / Discharged", width: 116 },
            { header: "IP Charge", width: 72, align: "right" },
            { header: "Transfers, Extensions & Notes", width: 196 },
          ],
          p.ipAdmissions.map((a) => {
            const notesParts = [
              a.admissionNotes ? `Admit: ${a.admissionNotes}` : null,
              a.dischargeNotes ? `Discharge: ${a.dischargeNotes}` : null,
              ...a.stayExtensions.map(
                (ex) =>
                  `Stay +${ex.additionalDays}d (${formatMoney(ex.amountCollected)} ${ex.paymentMode}): ${ex.reason}`
              ),
              ...a.bedTransfers.map(
                (t) =>
                  `Transfer (${formatPdfDateTime(t.transferredAt, tzOffset)}): ${
                    t.fromBedLabel ? `${t.fromBedLabel} -> ` : ""
                  }${t.toBedLabel}`
              ),
            ].filter(Boolean);
            return [
              a.admissionNumber,
              `${a.wardSnapshot}\nBed: ${a.bedNumberSnapshot}`,
              a.doctorNameSnapshot,
              `${formatPdfDateTime(a.admittedAt, tzOffset)}\n${a.stayDays} day(s) · ${a.paymentMode ?? "CASH"}`,
              a.dischargedAt
                ? `${a.status}\n${formatPdfDateTime(a.dischargedAt, tzOffset)}`
                : `${a.status}\n(Active Stay)`,
              formatMoney(a.chargeAmount),
              notesParts.join("\n") || "-",
            ];
          }),
          bannerTitle,
          ""
        );
      }

      // 3) Pharmacy Referrals & Doctor Prescriptions
      if (p.pharmacyReferrals.length > 0 || p.doctorPrescriptions.length > 0) {
        drawSubHeading(
          ctx,
          `Pharmacy Referrals & Prescriptions (${p.pharmacyReferrals.length + p.doctorPrescriptions.length})`,
          bannerTitle
        );
        const pharmRows: string[][] = [
          ...p.pharmacyReferrals.map((pr) => [
            pr.referralNumber,
            formatPdfDateTime(pr.referredAt, tzOffset),
            pr.pharmacyNameSnapshot,
            pr.items
              .map(
                (i) =>
                  `${i.medicineNameSnapshot} x${i.quantity}${i.dosageInstructions ? ` (${i.dosageInstructions})` : ""}`
              )
              .join("\n") || "-",
            pr.status,
            formatMoney(pr.totalAmount),
          ]),
          ...p.doctorPrescriptions.map((rx) => [
            "PRESCRIPTION",
            formatPdfDateTime(rx.prescribedAt, tzOffset),
            `Dr. ${rx.doctorNameSnapshot.replace(/^Dr\.?\s*/i, "")}`,
            rx.items
              .map(
                (i) =>
                  `${i.medicineNameSnapshot} x${i.quantityUnits}u${i.dosageInstructions ? ` (${i.dosageInstructions})` : ""}`
              )
              .join("\n") || "-",
            rx.status,
            "-",
          ]),
        ];
        drawTable(
          ctx,
          [
            { header: "Ref / Type", width: 88 },
            { header: "Date & Time", width: 118 },
            { header: "Pharmacy / Doctor", width: 132 },
            { header: "Medicines Prescribed", width: 274 },
            { header: "Status", width: 84 },
            { header: "Total Charge", width: 80, align: "right" },
          ],
          pharmRows,
          bannerTitle,
          ""
        );
      }

      // 4) Laboratory Referrals
      if (p.labReferrals.length > 0) {
        drawSubHeading(
          ctx,
          `Laboratory Referrals (${p.labReferrals.length})`,
          bannerTitle
        );
        drawTable(
          ctx,
          [
            { header: "Referral No", width: 88 },
            { header: "Date & Time", width: 118 },
            { header: "Laboratory Partner", width: 140 },
            { header: "Diagnostic Tests Referred", width: 266 },
            { header: "Status", width: 84 },
            { header: "Total Charge", width: 80, align: "right" },
          ],
          p.labReferrals.map((lr) => [
            lr.referralNumber,
            formatPdfDateTime(lr.referredAt, tzOffset),
            lr.labNameSnapshot,
            lr.items.map((i) => i.testNameSnapshot).join("\n") || "-",
            lr.status,
            formatMoney(lr.totalAmount),
          ]),
          bannerTitle,
          ""
        );
      }

      // 5) Billing Receipts
      if (p.billingReceipts.length > 0) {
        drawSubHeading(
          ctx,
          `Billing Receipts (${p.billingReceipts.length})`,
          bannerTitle
        );
        drawTable(
          ctx,
          [
            { header: "Receipt No", width: 88 },
            { header: "Issued Date & Time", width: 118 },
            { header: "Visit / Charge Summary", width: 196 },
            { header: "Itemized Charges", width: 190 },
            { header: "Payment Mode", width: 104 },
            { header: "Amount", width: 80, align: "right" },
          ],
          p.billingReceipts.map((rc) => [
            rc.receiptNumber,
            formatPdfDateTime(rc.issuedAt, tzOffset),
            rc.visitSummarySnapshot,
            parseReceiptLineItems(rc.lineItemsJson),
            [rc.paymentStatus ?? "NO_CHARGE", rc.paymentMode].filter(Boolean).join(" · "),
            formatMoney(rc.totalAmount),
          ]),
          bannerTitle,
          ""
        );
      }

      // Clean spacing before next patient dossier
      ctx.y += 6;
    }
  }

  // Stamp clean footers across all pages (zero trailing blank page!)
  const range = doc.bufferedPageRange();
  const totalPages = range.count;
  for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(range.start + i);
    const savedBottomMargin = doc.page.margins.bottom;
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
          `HospitalPro All Patients History  |  ${hospital.name} (${hospital.code})  |  ${patients.length} patient(s)`
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
    doc.page.margins.bottom = savedBottomMargin;
  }

  doc.end();
  const buffer = await donePromise;

  const safeCode = hospital.code.replace(/[^a-zA-Z0-9_-]+/g, "-");
  const dateStamp = new Date().toISOString().slice(0, 10);

  return {
    buffer,
    filename: `all-patients-history-${safeCode}-${dateStamp}.pdf`,
    timelineLabel,
    counts: {
      patients: patients.length,
      opVisits: totalOpVisits,
      ipAdmissions: totalIpAdmissions,
      pharmacyOrders: totalPharmacyOrders,
      labReferrals: totalLabReferrals,
      billingReceipts: totalBillingReceipts,
    },
  };
}
