import type { ExpiryBucket } from "@/lib/pharmacy-utils";

export type PackagingType = "SHEET" | "INDIVIDUAL";
export type SellMode = "UNIT" | "SHEET";
export type PaymentMode = "CASH" | "UPI" | "CARD";

export interface PharmacyBatchItem {
  id: string;
  medicineId: string;
  batchNumber: string;
  expiryMonth: number;
  expiryYear: number;
  expiryDate: string; // "YYYY-MM"
  expiryLabel: string; // "MM/YYYY"
  quantityUnits: number;
  initialQuantityUnits: number;
  isExpired: boolean;
  isExpiringSoon: boolean;
  daysToExpiry: number;
  monthsToExpiry?: number;
  expiryBucket?: ExpiryBucket;
}

export interface PharmacyMedicineItem {
  id: string;
  name: string;
  packagingType: PackagingType;
  unitsPerSheet: number;
  minStock: number;
  unitSellingPrice: number;
  sheetSellingPrice: number;
  hsnCode: string | null;
  gstPercent: number;
  prescriptionRequired: boolean;
  placement: string | null;
  batches: PharmacyBatchItem[];
  totalUnits: number;
  validUnits: number;
  hasExpired: boolean;
  hasExpiringSoon: boolean;
  isOutOfStock: boolean;
  isLowStock: boolean;
}

export interface DoctorOption {
  id: string;
  name: string;
  specialty: string | null;
  qualification: string | null;
}

export interface HospitalPatientMatch {
  id: string;
  uhid: string;
  fullName: string;
  phone: string;
  age: number | null;
  gender: string;
  recentDoctorId: string | null;
  recentDoctorName: string | null;
  recentDoctorQualification: string | null;
}

export interface PharmacyBootstrapData {
  hospital: {
    id: string;
    name: string;
    code: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    logoDataUrl: string | null;
    pharmacyMode: string;
    consultancyEnabled?: boolean;
  };
  pharmacyName: string;
  userRole: string;
  userFullName: string;
  doctors: DoctorOption[];
}

export interface CartItem {
  key: string; // `${medicineId}::${batchId}::${sellMode}`
  medicineId: string;
  medicineName: string;
  batchId: string;
  batchNumber: string;
  expiryLabel: string;
  hsnCode: string | null;
  placement: string | null;
  prescriptionRequired: boolean;
  packagingType: PackagingType;
  unitsPerSheet: number;
  sellMode: SellMode;
  quantity: number;
  unitSellingPrice: number;
  sheetSellingPrice: number;
  gstPercent: number;
  maxBatchUnits: number;
}

export interface PharmacySaleItemRecord {
  id: string;
  medicineNameSnapshot: string;
  batchNumberSnapshot: string;
  expiryDateSnapshot: string;
  hsnCodeSnapshot: string | null;
  placementSnapshot: string | null;
  prescriptionRequired: boolean;
  sellMode: string;
  enteredQuantity: number;
  unitsPerSheetSnapshot: number;
  basicUnitsDeducted: number;
  unitPriceSnapshot: number;
  gstPercentSnapshot: number;
  subtotal: number;
  gstAmount: number;
  lineTotal: number;
}

export interface PharmacySaleRecord {
  id: string;
  saleNumber: string;
  patientName: string;
  patientPhone: string;
  doctorId: string | null;
  doctorName: string;
  doctorQualificationSnapshot?: string | null;
  subtotal: number;
  gstAmount: number;
  totalAmount: number;
  totalUnitsSold: number;
  paymentMode: string;
  soldByNameSnapshot: string;
  soldAt: string;
  items: PharmacySaleItemRecord[];
}

export interface PharmacyAnalyticsResponse {
  kpis: {
    totalGrossValueSold: number;
    totalSubtotalSold: number;
    totalGstCollected: number;
    totalTransactions: number;
    totalMedicinesSoldUnits: number;
    totalMedicinesBoughtUnits: number;
    stockInEntriesCount: number;
  };
  inventory: {
    totalProfiles: number;
    totalBatches: number;
    totalUnitsInStock: number;
    totalStockGrossValue: number;
    lowStockCount: number;
    outOfStockCount: number;
    expiringSoonBatches: number;
    expiringBreakdown?: {
      month1Batches: number;
      month2Batches: number;
      month3Batches: number;
    };
    expiredBatches: number;
  };
  topMedicines: Array<{
    medicineName: string;
    unitsSold: number;
    grossValue: number;
    transactions: number;
  }>;
  paymentBreakdown: Array<{
    mode: string;
    count: number;
    grossValue: number;
  }>;
  dailySeries: Array<{
    date: string;
    grossValue: number;
    unitsSold: number;
    unitsBought: number;
    transactions: number;
  }>;
}

export interface BillScanQuota {
  monthKey: string;
  used: number;
  limit: number;
  remaining: number;
  isConfigured: boolean;
}

export interface BillScanItem {
  itemId: string;
  rawName: string;
  batchNumber: string;
  packagingGuess?: "SHEET" | "INDIVIDUAL";
  sheetsCount: number;
  unitsCount?: number;
  expiryMonth: number;
  expiryYear: number;
  hsnCode: string | null;
  gstPercent: number | null;
  matchedMedicineId: string | null;
  matchedMedicineName: string | null;
  matchConfidence: number;
  status: "PENDING" | "ADDED";
  addedMedicineId?: string | null;
  addedMedicineName?: string | null;
}

export interface BillScanSession {
  id: string;
  status: "IN_PROGRESS" | "COMPLETED" | "DISCARDED";
  fileName: string;
  items: BillScanItem[];
  createdAt: string;
  updatedAt: string;
}

export interface DoctorPrescriptionItemRecord {
  id: string;
  pharmacyMedicineId: string | null;
  medicineNameSnapshot: string;
  quantityUnits: number;
  dosageInstructions: string | null;
}

export interface DoctorPrescriptionRecord {
  id: string;
  patientId: string;
  opVisitId: string | null;
  doctorId: string | null;
  doctorNameSnapshot: string;
  doctorQualificationSnapshot: string | null;
  patientNameSnapshot: string;
  patientUhidSnapshot: string;
  patientPhoneSnapshot: string;
  notes: string | null;
  status: string;
  prescribedAt: string;
  dispensedAt: string | null;
  items: DoctorPrescriptionItemRecord[];
}
