import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { generateTempPassword, hashPassword } from "../src/lib/security";
import { ROLES, BED_STATUS, REFERRAL_STATUS } from "../src/lib/constants";
import { generateAuditEventId } from "../src/lib/audit";

async function main() {
  const existingHospitals = await prisma.hospital.count();
  if (existingHospitals > 0) {
    console.log("Database already contains hospital data. Skipping demo seed.");
    return;
  }

  const basePassword = process.env.DEMO_SEED_PASSWORD || generateTempPassword(12);
  const hash = await hashPassword(basePassword);

  const superAdmin = await prisma.user.findFirst({
    where: { role: ROLES.SUPER_ADMIN },
  });

  let createdSuperUsername: string | null = null;
  if (!superAdmin) {
    const u = await prisma.user.create({
      data: {
        username: "superadmin",
        fullName: "Platform Director",
        email: "platform@verdantcare.local",
        passwordHash: hash,
        role: ROLES.SUPER_ADMIN,
        isActive: true,
      },
    });
    createdSuperUsername = u.username;
  }

  // Create Hospital 1: Verdant Grove Community Hospital
  const h1 = await prisma.hospital.create({
    data: {
      code: "VGCH",
      name: "Verdant Grove Community Hospital",
      slug: "verdant-grove-hospital",
      address: "42 Cedar Park Avenue, Bengaluru 560001",
      phone: "+91 80 4120 8890",
      email: "care@verdantgrove.example",
      tagline: "Compassionate Primary & Inpatient Care",
      registrationNo: "KA-HMS-2026-0412",
      uhidPrefix: "VGCH",
      defaultConsultationFee: 400,
      nextUhidSeq: 4,
      nextOpSeq: 4,
      nextIpSeq: 3,
      nextPharmRefSeq: 3,
      nextLabRefSeq: 3,
      nextReceiptSeq: 4,
    },
  });

  await prisma.user.create({
    data: {
      hospitalId: h1.id,
      username: "vgch_admin",
      fullName: "Dr. Meera Nair",
      email: "meera.nair@verdantgrove.example",
      phone: "+91 98450 11223",
      passwordHash: hash,
      role: ROLES.HOSPITAL_ADMIN,
      isActive: true,
    },
  });

  const recep = await prisma.user.create({
    data: {
      hospitalId: h1.id,
      username: "vgch_frontdesk",
      fullName: "Aarav Sharma",
      email: "desk@verdantgrove.example",
      phone: "+91 98450 44556",
      passwordHash: hash,
      role: ROLES.RECEPTIONIST,
      isActive: true,
    },
  });

  const pharmUser = await prisma.user.create({
    data: {
      hospitalId: h1.id,
      username: "greenleaf_rx",
      fullName: "Kiran Patel",
      phone: "+91 99001 22334",
      passwordHash: hash,
      role: ROLES.PHARMACY_USER,
      isActive: true,
    },
  });

  const pharmAccount = await prisma.pharmacyAccount.create({
    data: {
      hospitalId: h1.id,
      userId: pharmUser.id,
      pharmacyName: "GreenLeaf Partner Pharmacy",
      contactPerson: "Kiran Patel",
      phone: "+91 99001 22334",
      address: "14 Cedar Market Road, Opposite VGCH Gate 2",
      isActive: true,
    },
  });

  const labUser = await prisma.user.create({
    data: {
      hospitalId: h1.id,
      username: "biopulse_lab",
      fullName: "Nandini Rao",
      phone: "+91 99001 55667",
      passwordHash: hash,
      role: ROLES.LAB_USER,
      isActive: true,
    },
  });

  const labAccount = await prisma.labAccount.create({
    data: {
      hospitalId: h1.id,
      userId: labUser.id,
      labName: "BioPulse Diagnostics Center",
      contactPerson: "Nandini Rao",
      phone: "+91 99001 55667",
      address: "18 Cedar Market Road, Suite 102",
      isActive: true,
    },
  });

  const doc1 = await prisma.doctor.create({
    data: {
      hospitalId: h1.id,
      name: "Dr. Rohan Deshmukh",
      specialty: "General Medicine",
      qualification: "MBBS, MD",
      phone: "+91 98801 77001",
      consultationFee: 400,
    },
  });
  const doc2 = await prisma.doctor.create({
    data: {
      hospitalId: h1.id,
      name: "Dr. Ananya Iyer",
      specialty: "Pediatrics",
      qualification: "MBBS, DCH",
      phone: "+91 98801 77002",
      consultationFee: 500,
    },
  });

  const bed1 = await prisma.bed.create({
    data: { hospitalId: h1.id, bedNumber: "GW-101", ward: "General Ward A", category: "General", status: BED_STATUS.OCCUPIED },
  });
  const bed2 = await prisma.bed.create({
    data: { hospitalId: h1.id, bedNumber: "GW-102", ward: "General Ward A", category: "General", status: BED_STATUS.AVAILABLE },
  });
  await prisma.bed.create({
    data: { hospitalId: h1.id, bedNumber: "SP-201", ward: "Emerald Suite", category: "Semi-Private", status: BED_STATUS.AVAILABLE },
  });
  await prisma.bed.create({
    data: { hospitalId: h1.id, bedNumber: "ICU-01", ward: "Critical Care", category: "ICU", status: BED_STATUS.AVAILABLE },
  });

  const p1 = await prisma.patient.create({
    data: {
      hospitalId: h1.id,
      uhid: "VGCH-2026-0001",
      fullName: "Lakshmi Narayanan",
      age: 54,
      gender: "FEMALE",
      phone: "+91 97400 11001",
      address: "19 Maple Lane, Indiranagar",
      bloodGroup: "O+",
      createdByUserId: recep.id,
    },
  });
  const p2 = await prisma.patient.create({
    data: {
      hospitalId: h1.id,
      uhid: "VGCH-2026-0002",
      fullName: "Vikramaditya Menon",
      age: 37,
      gender: "MALE",
      phone: "+91 97400 22002",
      address: "88 Olive Enclave, Koramangala",
      bloodGroup: "B+",
      createdByUserId: recep.id,
    },
  });
  const p3 = await prisma.patient.create({
    data: {
      hospitalId: h1.id,
      uhid: "VGCH-2026-0003",
      fullName: "Kavya Krishnan",
      age: 8,
      gender: "FEMALE",
      phone: "+91 97400 33003",
      address: "5 Birch Street, Jayanagar",
      bloodGroup: "A+",
      createdByUserId: recep.id,
    },
  });

  const op1 = await prisma.opVisit.create({
    data: {
      hospitalId: h1.id,
      visitNumber: "OP-VGCH-2026-0001",
      patientId: p1.id,
      doctorId: doc1.id,
      doctorNameSnapshot: doc1.name,
      departmentSnapshot: doc1.specialty,
      reasonForVisit: "Persistent fever and seasonal fatigue",
      consultationFee: 400,
      totalAmount: 400,
      paymentMode: "UPI",
      paymentStatus: "PAID",
      createdByUserId: recep.id,
    },
  });
  await prisma.billingReceipt.create({
    data: {
      hospitalId: h1.id,
      receiptNumber: "RCP-VGCH-2026-0001",
      patientId: p1.id,
      opVisitId: op1.id,
      hospitalNameSnapshot: h1.name,
      hospitalAddressSnapshot: h1.address,
      hospitalPhoneSnapshot: h1.phone,
      hospitalEmailSnapshot: h1.email,
      patientUhidSnapshot: p1.uhid,
      patientNameSnapshot: p1.fullName,
      visitSummarySnapshot: `OP Visit ${op1.visitNumber} · ${doc1.name} (${doc1.specialty})`,
      lineItemsJson: JSON.stringify([{ label: "OP Consultation Fee", amount: 400 }]),
      totalAmount: 400,
      paymentMode: "UPI",
      paymentStatus: "PAID",
      issuedByUserId: recep.id,
      issuedByNameSnapshot: recep.fullName,
    },
  });

  const op2 = await prisma.opVisit.create({
    data: {
      hospitalId: h1.id,
      visitNumber: "OP-VGCH-2026-0002",
      patientId: p2.id,
      doctorId: doc1.id,
      doctorNameSnapshot: doc1.name,
      departmentSnapshot: doc1.specialty,
      reasonForVisit: "Acute abdominal discomfort, advised observation",
      consultationFee: 400,
      totalAmount: 400,
      paymentMode: "CASH",
      paymentStatus: "PAID",
      createdByUserId: recep.id,
    },
  });
  await prisma.billingReceipt.create({
    data: {
      hospitalId: h1.id,
      receiptNumber: "RCP-VGCH-2026-0002",
      patientId: p2.id,
      opVisitId: op2.id,
      hospitalNameSnapshot: h1.name,
      hospitalAddressSnapshot: h1.address,
      hospitalPhoneSnapshot: h1.phone,
      hospitalEmailSnapshot: h1.email,
      patientUhidSnapshot: p2.uhid,
      patientNameSnapshot: p2.fullName,
      visitSummarySnapshot: `OP Visit ${op2.visitNumber} · ${doc1.name}`,
      lineItemsJson: JSON.stringify([{ label: "OP Consultation Fee", amount: 400 }]),
      totalAmount: 400,
      paymentMode: "CASH",
      paymentStatus: "PAID",
      issuedByUserId: recep.id,
      issuedByNameSnapshot: recep.fullName,
    },
  });

  const op3 = await prisma.opVisit.create({
    data: {
      hospitalId: h1.id,
      visitNumber: "OP-VGCH-2026-0003",
      patientId: p3.id,
      doctorId: doc2.id,
      doctorNameSnapshot: doc2.name,
      departmentSnapshot: doc2.specialty,
      reasonForVisit: "Pediatric wellness checkup",
      paymentStatus: "NO_CHARGE",
      createdByUserId: recep.id,
    },
  });
  await prisma.billingReceipt.create({
    data: {
      hospitalId: h1.id,
      receiptNumber: "RCP-VGCH-2026-0003",
      patientId: p3.id,
      opVisitId: op3.id,
      hospitalNameSnapshot: h1.name,
      hospitalAddressSnapshot: h1.address,
      hospitalPhoneSnapshot: h1.phone,
      hospitalEmailSnapshot: h1.email,
      patientUhidSnapshot: p3.uhid,
      patientNameSnapshot: p3.fullName,
      visitSummarySnapshot: `OP Visit ${op3.visitNumber} · ${doc2.name} (${doc2.specialty})`,
      lineItemsJson: "[]",
      totalAmount: null,
      paymentStatus: "NO_CHARGE",
      issuedByUserId: recep.id,
      issuedByNameSnapshot: recep.fullName,
    },
  });

  const adm1 = await prisma.ipAdmission.create({
    data: {
      hospitalId: h1.id,
      admissionNumber: "IP-VGCH-2026-0001",
      patientId: p2.id,
      bedId: bed1.id,
      doctorId: doc1.id,
      doctorNameSnapshot: doc1.name,
      wardSnapshot: bed1.ward,
      bedNumberSnapshot: bed1.bedNumber,
      status: "ADMITTED",
      admissionNotes: "Admitted for overnight hydration & monitoring.",
      admittedByUserId: recep.id,
    },
  });
  await prisma.bedTransfer.create({
    data: {
      hospitalId: h1.id,
      ipAdmissionId: adm1.id,
      fromBedId: null,
      fromBedLabel: null,
      toBedId: bed1.id,
      toBedLabel: `${bed1.ward} · ${bed1.bedNumber}`,
      reason: "Initial admission bed assignment",
      transferredByUserId: recep.id,
    },
  });

  const med1 = await prisma.medicineCatalog.create({
    data: {
      hospitalId: h1.id,
      name: "Paracetamol 650mg Tablets",
      description: "Strip of 15 tablets",
      price: 35,
    },
  });
  const med2 = await prisma.medicineCatalog.create({
    data: {
      hospitalId: h1.id,
      name: "Oral Rehydration Salts (ORS) Sachet",
      description: "WHO standard electrolyte blend",
      price: null, // demonstrates optional pricing
    },
  });

  await prisma.pharmacyReferral.create({
    data: {
      hospitalId: h1.id,
      referralNumber: "PHR-VGCH-2026-0001",
      patientId: p1.id,
      pharmacyAccountId: pharmAccount.id,
      opVisitId: op1.id,
      patientNameSnapshot: p1.fullName,
      patientUhidSnapshot: p1.uhid,
      patientPhoneSnapshot: p1.phone,
      pharmacyNameSnapshot: pharmAccount.pharmacyName,
      notes: "Dispense 1 strip after meals as needed.",
      totalAmount: 35,
      status: REFERRAL_STATUS.PENDING,
      referredByUserId: recep.id,
      items: {
        create: [
          {
            hospitalId: h1.id,
            medicineCatalogId: med1.id,
            medicineNameSnapshot: med1.name,
            descriptionSnapshot: med1.description,
            quantity: 1,
            unitPriceSnapshot: 35,
            lineTotal: 35,
            dosageInstructions: "1 tablet twice daily after food",
          },
        ],
      },
    },
  });

  await prisma.pharmacyReferral.create({
    data: {
      hospitalId: h1.id,
      referralNumber: "PHR-VGCH-2026-0002",
      patientId: p2.id,
      pharmacyAccountId: pharmAccount.id,
      opVisitId: op2.id,
      patientNameSnapshot: p2.fullName,
      patientUhidSnapshot: p2.uhid,
      patientPhoneSnapshot: p2.phone,
      pharmacyNameSnapshot: pharmAccount.pharmacyName,
      totalAmount: null,
      status: REFERRAL_STATUS.COMPLETED,
      referredByUserId: recep.id,
      completedAt: new Date(),
      completedByUserId: pharmUser.id,
      completedByNameSnapshot: pharmUser.fullName,
      items: {
        create: [
          {
            hospitalId: h1.id,
            medicineCatalogId: med2.id,
            medicineNameSnapshot: med2.name,
            descriptionSnapshot: med2.description,
            quantity: 3,
            unitPriceSnapshot: null,
            lineTotal: null,
          },
        ],
      },
    },
  });

  const test1 = await prisma.labTestCatalog.create({
    data: {
      hospitalId: h1.id,
      name: "Complete Blood Count (CBC)",
      description: "Automated hematology panel",
      price: 450,
    },
  });
  const test2 = await prisma.labTestCatalog.create({
    data: {
      hospitalId: h1.id,
      name: "Lipid Profile",
      description: "Fasting cholesterol & triglycerides",
      price: null,
    },
  });

  await prisma.labReferral.create({
    data: {
      hospitalId: h1.id,
      referralNumber: "LAB-VGCH-2026-0001",
      patientId: p1.id,
      labAccountId: labAccount.id,
      opVisitId: op1.id,
      patientNameSnapshot: p1.fullName,
      patientUhidSnapshot: p1.uhid,
      patientPhoneSnapshot: p1.phone,
      labNameSnapshot: labAccount.labName,
      notes: "Morning sample preferred",
      totalAmount: 450,
      status: REFERRAL_STATUS.PENDING,
      referredByUserId: recep.id,
      items: {
        create: [
          {
            hospitalId: h1.id,
            labTestCatalogId: test1.id,
            testNameSnapshot: test1.name,
            descriptionSnapshot: test1.description,
            unitPriceSnapshot: 450,
          },
        ],
      },
    },
  });

  await prisma.auditLog.createMany({
    data: [
      {
        eventId: generateAuditEventId(),
        hospitalId: h1.id,
        actorUserId: recep.id,
        actorUsername: recep.username,
        actorRole: recep.role,
        actionType: "PATIENT_REGISTERED",
        patientId: p1.id,
        patientUhid: p1.uhid,
        referenceId: op1.visitNumber,
        details: `Registered patient ${p1.fullName} (${p1.uhid}) and created OP visit ${op1.visitNumber}.`,
      },
      {
        eventId: generateAuditEventId(),
        hospitalId: h1.id,
        actorUserId: recep.id,
        actorUsername: recep.username,
        actorRole: recep.role,
        actionType: "IP_ADMITTED",
        patientId: p2.id,
        patientUhid: p2.uhid,
        referenceId: adm1.admissionNumber,
        details: `Admitted ${p2.fullName} (${p2.uhid}) to ${bed1.ward} · ${bed1.bedNumber}.`,
      },
      {
        eventId: generateAuditEventId(),
        hospitalId: h1.id,
        actorUserId: pharmUser.id,
        actorUsername: pharmUser.username,
        actorRole: pharmUser.role,
        actionType: "PHARMACY_REFERRAL_COMPLETED",
        patientId: p2.id,
        patientUhid: p2.uhid,
        referenceId: "PHR-VGCH-2026-0002",
        details: `Pharmacy referral PHR-VGCH-2026-0002 marked completed by ${pharmUser.fullName}.`,
      },
    ],
  });

  // Ensure bed2 is kept unused/available cleanly
  void bed2;
  void test2;

  console.log("=== Demo Hospital Seed Completed ===");
  if (createdSuperUsername) {
    console.log(`Super Admin username : ${createdSuperUsername}`);
  }
  console.log(`Hospital Admin       : vgch_admin`);
  console.log(`Receptionist         : vgch_frontdesk`);
  console.log(`Pharmacy Portal      : greenleaf_rx`);
  console.log(`Laboratory Portal    : biopulse_lab`);
  console.log(`Generated Password   : ${basePassword}`);
}

main()
  .catch((err) => {
    console.error("Demo seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
