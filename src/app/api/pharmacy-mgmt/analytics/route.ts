import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePharmacyManagementAuth } from "@/lib/auth";
import { parseDateRangeBounds, parseSafeTzOffset } from "@/lib/datetime";
import { getBatchExpiryStatus } from "@/lib/pharmacy-utils";
import { handleApiError } from "@/lib/api-utils";

export async function GET(request: Request) {
  try {
    const session = await requirePharmacyManagementAuth();
    const hospitalId = session.hospitalId;
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const tzOffsetMinutes =
      parseSafeTzOffset(searchParams.get("tzOffset"), 0) ?? 0;

    const dateBounds =
      from || to ? parseDateRangeBounds({ from, to, tzOffsetMinutes }) : undefined;

    const saleWhere = {
      hospitalId,
      ...(dateBounds && (dateBounds.gte || dateBounds.lte)
        ? { soldAt: dateBounds }
        : {}),
    };

    const stockLogWhere = {
      hospitalId,
      unitsDelta: { gt: 0 },
      changeType: { in: ["ADDED", "RESTOCK", "ADJUSTMENT"] },
      ...(dateBounds && (dateBounds.gte || dateBounds.lte)
        ? { createdAt: dateBounds }
        : {}),
    };

    const [sales, stockInLogs, medicines] = await Promise.all([
      prisma.pharmacySale.findMany({
        where: saleWhere,
        include: { items: true },
        orderBy: [{ soldAt: "desc" }],
      }),
      prisma.pharmacyStockLog.findMany({
        where: stockLogWhere,
        orderBy: [{ createdAt: "desc" }],
      }),
      prisma.pharmacyMedicine.findMany({
        where: { hospitalId },
        include: { batches: true },
      }),
    ]);

    const totalGrossValueSold =
      Math.round(sales.reduce((sum, s) => sum + s.totalAmount, 0) * 100) / 100;
    const totalSubtotalSold =
      Math.round(sales.reduce((sum, s) => sum + s.subtotal, 0) * 100) / 100;
    const totalGstCollected =
      Math.round(sales.reduce((sum, s) => sum + s.gstAmount, 0) * 100) / 100;
    const totalMedicinesSoldUnits = sales.reduce(
      (sum, s) => sum + s.totalUnitsSold,
      0
    );
    const totalMedicinesBoughtUnits = stockInLogs.reduce(
      (sum, log) => sum + Math.max(0, log.unitsDelta),
      0
    );

    // Top selling medicines (units & gross value — zero profit metrics)
    const medSalesMap = new Map<
      string,
      { medicineName: string; unitsSold: number; grossValue: number; transactions: number }
    >();
    for (const sale of sales) {
      const seenInSale = new Set<string>();
      for (const item of sale.items) {
        const key = item.medicineNameSnapshot.trim().toLowerCase();
        const curr = medSalesMap.get(key) ?? {
          medicineName: item.medicineNameSnapshot,
          unitsSold: 0,
          grossValue: 0,
          transactions: 0,
        };
        curr.unitsSold += item.basicUnitsDeducted;
        curr.grossValue =
          Math.round((curr.grossValue + item.lineTotal) * 100) / 100;
        if (!seenInSale.has(key)) {
          curr.transactions += 1;
          seenInSale.add(key);
        }
        medSalesMap.set(key, curr);
      }
    }
    const topMedicines = Array.from(medSalesMap.values())
      .sort((a, b) => b.grossValue - a.grossValue || b.unitsSold - a.unitsSold)
      .slice(0, 10);

    // Payment mode breakdown
    const paymentBreakdownMap = new Map<
      string,
      { mode: string; count: number; grossValue: number }
    >();
    for (const sale of sales) {
      const mode = sale.paymentMode || "CASH";
      const curr = paymentBreakdownMap.get(mode) ?? {
        mode,
        count: 0,
        grossValue: 0,
      };
      curr.count += 1;
      curr.grossValue =
        Math.round((curr.grossValue + sale.totalAmount) * 100) / 100;
      paymentBreakdownMap.set(mode, curr);
    }

    // Daily breakdown (sales + stock additions)
    const offsetMs = tzOffsetMinutes * 60_000;
    const toLocalDateKey = (dt: Date) =>
      new Date(dt.getTime() - offsetMs).toISOString().slice(0, 10);

    const dailyMap = new Map<
      string,
      {
        date: string;
        grossValue: number;
        unitsSold: number;
        unitsBought: number;
        transactions: number;
      }
    >();
    for (const sale of sales) {
      const key = toLocalDateKey(sale.soldAt);
      const curr = dailyMap.get(key) ?? {
        date: key,
        grossValue: 0,
        unitsSold: 0,
        unitsBought: 0,
        transactions: 0,
      };
      curr.grossValue =
        Math.round((curr.grossValue + sale.totalAmount) * 100) / 100;
      curr.unitsSold += sale.totalUnitsSold;
      curr.transactions += 1;
      dailyMap.set(key, curr);
    }
    for (const log of stockInLogs) {
      const key = toLocalDateKey(log.createdAt);
      const curr = dailyMap.get(key) ?? {
        date: key,
        grossValue: 0,
        unitsSold: 0,
        unitsBought: 0,
        transactions: 0,
      };
      curr.unitsBought += Math.max(0, log.unitsDelta);
      dailyMap.set(key, curr);
    }
    const dailySeries = Array.from(dailyMap.values())
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 31);

    // Current Inventory Health Snapshot
    const now = new Date();
    let totalBatches = 0;
    let totalUnitsInStock = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    let expiringSoonBatches = 0;
    let expiringMonth1Batches = 0;
    let expiringMonth2Batches = 0;
    let expiringMonth3Batches = 0;
    let expiredBatches = 0;
    let totalStockGrossValue = 0;

    for (const med of medicines) {
      let validUnits = 0;
      for (const b of med.batches) {
        totalBatches += 1;
        const st = getBatchExpiryStatus(b.expiryMonth, b.expiryYear, now);
        if (st.isExpired) {
          if (b.quantityUnits > 0) expiredBatches += 1;
        } else {
          validUnits += b.quantityUnits;
          totalUnitsInStock += b.quantityUnits;
          totalStockGrossValue += b.quantityUnits * med.unitSellingPrice;
          if (st.isExpiringSoon && b.quantityUnits > 0) {
            expiringSoonBatches += 1;
            if (st.expiryBucket === "MONTH_1") expiringMonth1Batches += 1;
            else if (st.expiryBucket === "MONTH_2") expiringMonth2Batches += 1;
            else if (st.expiryBucket === "MONTH_3") expiringMonth3Batches += 1;
          }
        }
      }
      if (validUnits <= 0) {
        outOfStockCount += 1;
      } else if (med.minStock > 0 && validUnits < med.minStock) {
        lowStockCount += 1;
      }
    }

    return NextResponse.json({
      kpis: {
        totalGrossValueSold,
        totalSubtotalSold,
        totalGstCollected,
        totalTransactions: sales.length,
        totalMedicinesSoldUnits,
        totalMedicinesBoughtUnits,
        stockInEntriesCount: stockInLogs.length,
      },
      inventory: {
        totalProfiles: medicines.length,
        totalBatches,
        totalUnitsInStock,
        totalStockGrossValue: Math.round(totalStockGrossValue * 100) / 100,
        lowStockCount,
        outOfStockCount,
        expiringSoonBatches,
        expiringBreakdown: {
          month1Batches: expiringMonth1Batches,
          month2Batches: expiringMonth2Batches,
          month3Batches: expiringMonth3Batches,
        },
        expiredBatches,
      },
      topMedicines,
      paymentBreakdown: Array.from(paymentBreakdownMap.values()),
      dailySeries,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
