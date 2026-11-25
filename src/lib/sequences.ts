import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";

function padSeq(seq: number): string {
  return String(seq).padStart(4, "0");
}

export async function allocateUhid(
  tx: Prisma.TransactionClient,
  hospitalId: string
): Promise<string> {
  // Random, non-sequential 8-digit numeric UHID with per-hospital uniqueness check
  for (let attempt = 0; attempt < 30; attempt++) {
    const candidate = String(crypto.randomInt(10_000_000, 100_000_000));
    const existing = await tx.patient.findUnique({
      where: {
        hospitalId_uhid: {
          hospitalId,
          uhid: candidate,
        },
      },
      select: { id: true },
    });
    if (!existing) {
      return candidate;
    }
  }
  throw new Error("Unable to allocate a unique 8-digit UHID.");
}

export async function allocateOpVisitNumber(
  tx: Prisma.TransactionClient,
  hospitalId: string
): Promise<string> {
  const updated = await tx.hospital.update({
    where: { id: hospitalId },
    data: { nextOpSeq: { increment: 1 } },
    select: { code: true, nextOpSeq: true },
  });
  const seq = updated.nextOpSeq - 1;
  const year = new Date().getFullYear();
  return `OP-${updated.code.toUpperCase()}-${year}-${padSeq(seq)}`;
}

export async function allocateIpAdmissionNumber(
  tx: Prisma.TransactionClient,
  hospitalId: string
): Promise<string> {
  const updated = await tx.hospital.update({
    where: { id: hospitalId },
    data: { nextIpSeq: { increment: 1 } },
    select: { code: true, nextIpSeq: true },
  });
  const seq = updated.nextIpSeq - 1;
  const year = new Date().getFullYear();
  return `IP-${updated.code.toUpperCase()}-${year}-${padSeq(seq)}`;
}

export async function allocatePharmacyReferralNumber(
  tx: Prisma.TransactionClient,
  hospitalId: string
): Promise<string> {
  const updated = await tx.hospital.update({
    where: { id: hospitalId },
    data: { nextPharmRefSeq: { increment: 1 } },
    select: { code: true, nextPharmRefSeq: true },
  });
  const seq = updated.nextPharmRefSeq - 1;
  const year = new Date().getFullYear();
  return `PHR-${updated.code.toUpperCase()}-${year}-${padSeq(seq)}`;
}

export async function allocateLabReferralNumber(
  tx: Prisma.TransactionClient,
  hospitalId: string
): Promise<string> {
  const updated = await tx.hospital.update({
    where: { id: hospitalId },
    data: { nextLabRefSeq: { increment: 1 } },
    select: { code: true, nextLabRefSeq: true },
  });
  const seq = updated.nextLabRefSeq - 1;
  const year = new Date().getFullYear();
  return `LAB-${updated.code.toUpperCase()}-${year}-${padSeq(seq)}`;
}

export async function allocateReceiptNumber(
  tx: Prisma.TransactionClient,
  hospitalId: string
): Promise<string> {
  const updated = await tx.hospital.update({
    where: { id: hospitalId },
    data: { nextReceiptSeq: { increment: 1 } },
    select: { code: true, nextReceiptSeq: true },
  });
  const seq = updated.nextReceiptSeq - 1;
  const year = new Date().getFullYear();
  return `RCP-${updated.code.toUpperCase()}-${year}-${padSeq(seq)}`;
}

export async function allocatePharmacySaleNumber(
  tx: Prisma.TransactionClient,
  hospitalId: string
): Promise<string> {
  // Clean 9-digit (up to 10-digit) purely numeric invoice number: YYYY + 5-digit sequence (e.g. 202600001)
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 20; attempt++) {
    const updated = await tx.hospital.update({
      where: { id: hospitalId },
      data: { nextPharmSaleSeq: { increment: 1 } },
      select: { nextPharmSaleSeq: true },
    });
    const seq = updated.nextPharmSaleSeq - 1;
    const candidate = `${year}${String(seq).padStart(5, "0")}`;
    const collision = await tx.pharmacySale.findUnique({
      where: {
        hospitalId_saleNumber: {
          hospitalId,
          saleNumber: candidate,
        },
      },
      select: { id: true },
    });
    if (!collision) {
      return candidate;
    }
  }
  return String(crypto.randomInt(100_000_000, 1_000_000_000));
}
