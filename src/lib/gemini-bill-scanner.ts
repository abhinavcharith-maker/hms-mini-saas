import crypto from "node:crypto";
import { parseMonthYearInput } from "./pharmacy-utils";
import { getPlatformGeminiConfig } from "./platform-config";

/**
 * SERVER-ONLY GEMINI PURCHASE BILL SCANNER
 * ----------------------------------------
 * Reads the encrypted Gemini API key & model (default: gemini-3.8-flash) configured
 * by the Super Admin inside Super Admin -> Settings.
 * Never exposed to clients, browser bundles, logs, or backups.
 */
export const MONTHLY_BILL_SCAN_LIMIT = 4;

export interface ScannedBillItem {
  itemId: string;
  rawName: string;
  batchNumber: string;
  packagingGuess: "SHEET" | "INDIVIDUAL";
  sheetsCount: number;
  unitsCount: number;
  expiryMonth: number;
  expiryYear: number;
  hsnCode: string | null;
  gstPercent: number | null;
  matchedMedicineId: string | null;
  matchedMedicineName: string | null;
  matchConfidence: number; // 0..1
  status: "PENDING" | "ADDED";
  addedMedicineId?: string | null;
  addedMedicineName?: string | null;
}

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(
      /\b(tab|tablet|tablets|cap|capsule|capsules|syp|syrup|inj|injection|strip|strips|mg|ml|mcg|gm)\b/g,
      " "
    )
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function bigrams(str: string): Set<string> {
  const s = str.replace(/\s+/g, "");
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) {
    out.add(s.slice(i, i + 2));
  }
  return out;
}

function diceSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) {
    const ratio = Math.min(a.length, b.length) / Math.max(a.length, b.length);
    return Math.max(0.78, ratio);
  }
  const ba = bigrams(a);
  const bb = bigrams(b);
  if (ba.size === 0 || bb.size === 0) return 0;
  let overlap = 0;
  for (const g of ba) {
    if (bb.has(g)) overlap++;
  }
  return (2 * overlap) / (ba.size + bb.size);
}

/**
 * Smartly matches an extracted bill medicine name against the hospital's existing catalog.
 */
export function smartMatchMedicine(
  rawName: string,
  catalog: Array<{ id: string; name: string }>
): { medicineId: string | null; medicineName: string | null; confidence: number } {
  const targetClean = rawName.trim().toLowerCase();
  const targetNorm = normalizeName(rawName);
  if (!targetClean || catalog.length === 0) {
    return { medicineId: null, medicineName: null, confidence: 0 };
  }

  let best: { id: string; name: string; score: number } | null = null;
  const targetTokens = new Set(targetNorm.split(" ").filter(Boolean));

  for (const med of catalog) {
    const medLower = med.name.trim().toLowerCase();
    if (medLower === targetClean) {
      return { medicineId: med.id, medicineName: med.name, confidence: 1 };
    }
    const medNorm = normalizeName(med.name);
    const dice = diceSimilarity(targetNorm || targetClean, medNorm || medLower);

    const medTokens = new Set(medNorm.split(" ").filter(Boolean));
    let tokenMatches = 0;
    for (const t of targetTokens) {
      if (medTokens.has(t)) tokenMatches++;
    }
    const tokenScore =
      targetTokens.size + medTokens.size > 0
        ? (2 * tokenMatches) / (targetTokens.size + medTokens.size)
        : 0;

    const score = Math.round((dice * 0.65 + tokenScore * 0.35) * 100) / 100;
    if (!best || score > best.score) {
      best = { id: med.id, name: med.name, score };
    }
  }

  if (best && best.score >= 0.62) {
    return {
      medicineId: best.id,
      medicineName: best.name,
      confidence: best.score,
    };
  }
  return { medicineId: null, medicineName: null, confidence: best?.score ?? 0 };
}

interface RawGeminiItem {
  medicineName?: unknown;
  batchNumber?: unknown;
  packagingType?: unknown;
  sheetQuantity?: unknown;
  unitQuantity?: unknown;
  expiryDate?: unknown;
  expiryMonth?: unknown;
  expiryYear?: unknown;
  hsnCode?: unknown;
  gstPercent?: unknown;
}

function inferIndividualFromName(name: string): boolean {
  return /\b(syrup|syp|susp|suspension|drops|drop|ointment|oint|cream|gel|lotion|inhaler|spray|inj|injection|vial|ampoule|bottle|powder|sachet|solution|soln|soap|shampoo|balm|respules|eye\s*drop|ear\s*drop|nasal)\b/i.test(
    name
  );
}

export async function scanPurchaseBillWithGemini(params: {
  buffer: Buffer;
  mimeType: string;
  catalog: Array<{ id: string; name: string }>;
}): Promise<ScannedBillItem[]> {
  const { apiKey, model } = await getPlatformGeminiConfig();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY_NOT_CONFIGURED");
  }

  const base64Data = params.buffer.toString("base64");
  const prompt = [
    "You are an expert pharmacy purchase invoice OCR & structured data extractor.",
    "Extract EVERY medicine line item from this supplier purchase bill image or PDF.",
    "DO NOT extract or return any purchase prices, rates, or MRP values.",
    "Return ONLY valid JSON matching this exact shape (no markdown fences, no commentary):",
    '{ "items": [ { "medicineName": "string", "batchNumber": "string", "packagingType": "SHEET" | "INDIVIDUAL", "sheetQuantity": 0, "unitQuantity": 0, "expiryDate": "MM/YYYY", "hsnCode": "string or null", "gstPercent": 0 } ] }',
    "Rules:",
    "- medicineName: Clean medicine name & strength (e.g. 'Dolo 650mg', 'Benadryl Syrup 100ml').",
    "- batchNumber: Exact printed batch / lot code (if unreadable, use empty string '').",
    "- packagingType: Smartly determine if the medicine is sold as strips/sheets ('SHEET', e.g. tablets, capsules, lozenges) OR as individual items ('INDIVIDUAL', e.g. syrups, bottles, ointments, creams, gels, drops, injections, vials, inhalers, sprays, powders, sachets).",
    "- sheetQuantity: If packagingType is 'SHEET', set integer number of sheets/strips billed (default 1 if unclear) and set unitQuantity to 0.",
    "- unitQuantity: If packagingType is 'INDIVIDUAL', set integer number of individual bottles/tubes/units billed (default 1 if unclear) and set sheetQuantity to 0.",
    "- expiryDate: Always formatted strictly as MM/YYYY (convert '04/27' or 'Apr-27' -> '04/2027').",
    "- hsnCode: HSN code string if shown, else null.",
    "- gstPercent: Total GST % (CGST + SGST or IGST) as a number if shown, else null.",
  ].join("\n");

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: params.mimeType,
                data: base64Data,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`GEMINI_UPSTREAM_ERROR:${res.status}:${errText.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };
  const rawText =
    json.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim() ?? "";

  if (!rawText) {
    throw new Error("GEMINI_EMPTY_RESPONSE");
  }

  const cleanedJson = rawText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsedObj: { items?: RawGeminiItem[] } | RawGeminiItem[];
  try {
    parsedObj = JSON.parse(cleanedJson);
  } catch {
    throw new Error("GEMINI_INVALID_JSON");
  }

  const rawItems: RawGeminiItem[] = Array.isArray(parsedObj)
    ? parsedObj
    : Array.isArray(parsedObj.items)
      ? parsedObj.items
      : [];

  const now = new Date();
  const fallbackMonth = now.getMonth() + 1;
  const fallbackYear = now.getFullYear() + 1;

  const items: ScannedBillItem[] = [];
  for (const r of rawItems) {
    const rawName = typeof r.medicineName === "string" ? r.medicineName.trim() : "";
    if (!rawName) continue;

    const batchNumber =
      typeof r.batchNumber === "string" ? r.batchNumber.trim() : "";

    const rawPack =
      typeof r.packagingType === "string"
        ? r.packagingType.trim().toUpperCase()
        : "";
    const packagingGuess: "SHEET" | "INDIVIDUAL" =
      rawPack === "INDIVIDUAL"
        ? "INDIVIDUAL"
        : rawPack === "SHEET"
          ? "SHEET"
          : inferIndividualFromName(rawName)
            ? "INDIVIDUAL"
            : "SHEET";

    const rawSheetNum = Number(r.sheetQuantity);
    const rawUnitNum = Number(r.unitQuantity);
    let sheetsCount =
      Number.isFinite(rawSheetNum) && rawSheetNum > 0
        ? Math.round(rawSheetNum)
        : 0;
    let unitsCount =
      Number.isFinite(rawUnitNum) && rawUnitNum > 0
        ? Math.round(rawUnitNum)
        : 0;

    if (packagingGuess === "INDIVIDUAL") {
      if (unitsCount === 0) {
        unitsCount = sheetsCount > 0 ? sheetsCount : 1;
      }
      sheetsCount = 0;
    } else {
      if (sheetsCount === 0) {
        sheetsCount = unitsCount > 0 ? unitsCount : 1;
      }
      unitsCount = 0;
    }

    let expiryMonth = fallbackMonth;
    let expiryYear = fallbackYear;
    if (typeof r.expiryDate === "string") {
      const parsedExp = parseMonthYearInput(r.expiryDate);
      if (parsedExp) {
        expiryMonth = parsedExp.month;
        expiryYear = parsedExp.year;
      }
    } else if (
      Number.isInteger(Number(r.expiryMonth)) &&
      Number.isInteger(Number(r.expiryYear))
    ) {
      const em = Number(r.expiryMonth);
      const ey = Number(r.expiryYear);
      if (em >= 1 && em <= 12 && ey >= 2000 && ey <= 2150) {
        expiryMonth = em;
        expiryYear = ey;
      }
    }

    const hsnCode =
      typeof r.hsnCode === "string" && r.hsnCode.trim() ? r.hsnCode.trim() : null;
    const gstNum = Number(r.gstPercent);
    const gstPercent =
      r.gstPercent !== null &&
      r.gstPercent !== undefined &&
      r.gstPercent !== "" &&
      Number.isFinite(gstNum) &&
      gstNum >= 0 &&
      gstNum <= 100
        ? gstNum
        : null;

    const match = smartMatchMedicine(rawName, params.catalog);

    items.push({
      itemId: `scan_${crypto.randomBytes(6).toString("hex")}`,
      rawName,
      batchNumber,
      packagingGuess,
      sheetsCount,
      unitsCount,
      expiryMonth,
      expiryYear,
      hsnCode,
      gstPercent,
      matchedMedicineId: match.medicineId,
      matchedMedicineName: match.medicineName,
      matchConfidence: match.confidence,
      status: "PENDING",
    });
  }

  return items;
}
