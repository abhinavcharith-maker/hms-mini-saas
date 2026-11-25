import assert from "node:assert/strict";
import zlib from "node:zlib";

const BASE = process.env.E2E_BASE_URL || "http://127.0.0.1:3099";

class CookieClient {
  cookieHeader = "";

  async req(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    if (this.cookieHeader) {
      headers.set("cookie", this.cookieHeader);
    }
    if (init.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers,
      redirect: "manual",
    });

    const setCookies = res.headers.getSetCookie?.() ?? [];
    for (const sc of setCookies) {
      const pair = sc.split(";")[0];
      const [k, v] = pair.split("=");
      if (v === "") {
        this.cookieHeader = "";
      } else {
        this.cookieHeader = `${k}=${v}`;
      }
    }

    const text = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    return { status: res.status, json, text, headers: res.headers };
  }
}

async function run() {
  console.log(`Running full E2E verification against ${BASE}...`);
  const superAdmin = new CookieClient();
  const hospAdminA = new CookieClient();
  const hospAdminB = new CookieClient();
  const recepA = new CookieClient();
  const pharmA1 = new CookieClient();
  const pharmA2 = new CookieClient();
  const labA1 = new CookieClient();

  // 1. Health & Setup
  const health = await superAdmin.req("/api/health");
  assert.equal(health.status, 200);
  assert.equal((health.json as { needsSetup: boolean }).needsSetup, true);

  const setupRes = await superAdmin.req("/api/auth/setup", {
    method: "POST",
    body: JSON.stringify({
      fullName: "E2E Super Owner",
      username: "e2e_super",
      email: "super@e2e.local",
      password: "SuperPassword!99",
    }),
  });
  assert.equal(setupRes.status, 201);

  // Confirm setup locks immediately
  const setupLocked = await superAdmin.req("/api/auth/setup", {
    method: "POST",
    body: JSON.stringify({
      fullName: "Attacker",
      username: "attacker",
      password: "Password!123",
    }),
  });
  assert.equal(setupLocked.status, 403);
  console.log("✓ Step 1-2: Super Admin setup & permanent setup lock verified");

  // 2. Super Admin provisions Hospital A and Hospital B (paidMonths is mandatory >= 1)
  const missingMonthsHosp = await superAdmin.req("/api/super-admin/hospitals", {
    method: "POST",
    body: JSON.stringify({
      name: "Missing Paid Months Clinic",
      adminFullName: "Test Admin",
      adminUsername: "missing_months_admin",
      adminPassword: "AdminPassword!1",
    }),
  });
  assert.equal(missingMonthsHosp.status, 400);

  const createHospA = await superAdmin.req("/api/super-admin/hospitals", {
    method: "POST",
    body: JSON.stringify({
      name: "Emerald Grove Clinic",
      code: "EMGC",
      uhidPrefix: "EMGC",
      address: "10 Forest Way",
      phone: "9900011111",
      email: "info@emgc.local",
      dailyOpLimit: 1,
      dailyIpLimit: 1,
      paidMonths: 6,
      adminFullName: "Dr. Aditi Rao",
      adminUsername: "emgc_admin",
      adminPassword: "AdminPassword!1",
    }),
  });
  assert.equal(createHospA.status, 201);
  const hospAId = (createHospA.json as { hospital: { id: string } }).hospital.id;

  const createHospB = await superAdmin.req("/api/super-admin/hospitals", {
    method: "POST",
    body: JSON.stringify({
      name: "Cedar Hills Hospital",
      paidMonths: 6,
      adminFullName: "Dr. Vivek Sen",
      adminUsername: "cdhl_admin",
      adminPassword: "AdminPassword!2",
    }),
  });
  assert.equal(createHospB.status, 201);
  console.log("✓ Step 3: Multi-tenant Hospital A & Hospital B created (mandatory paidMonths verified)");

  // 3. Hospital A Admin & B Admin sign in
  assert.equal(
    (
      await hospAdminA.req("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: "emgc_admin",
          password: "AdminPassword!1",
          portalRole: "HOSPITAL_ADMIN",
        }),
      })
    ).status,
    200
  );
  assert.equal(
    (
      await hospAdminB.req("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: "cdhl_admin",
          password: "AdminPassword!2",
          portalRole: "HOSPITAL_ADMIN",
        }),
      })
    ).status,
    200
  );

  // Portal mismatch check
  const wrongPortal = await new CookieClient().req("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      username: "emgc_admin",
      password: "AdminPassword!1",
      portalRole: "PHARMACY_USER",
    }),
  });
  assert.equal(wrongPortal.status, 403);

  // Admin creates doctor, beds, medicines (one optional price null), lab test, pharmacy partners, lab partner, receptionist
  const docRes = await hospAdminA.req("/api/hospital/doctors", {
    method: "POST",
    body: JSON.stringify({ name: "Dr. Arjun Nair", specialty: "Medicine" }),
  });
  assert.equal(docRes.status, 201);
  const doctorId = (docRes.json as { doctor: { id: string } }).doctor.id;

  const bed1Res = await hospAdminA.req("/api/hospital/beds", {
    method: "POST",
    body: JSON.stringify({ bedNumber: "B-101", ward: "Ward 1", category: "General" }),
  });
  const bed2Res = await hospAdminA.req("/api/hospital/beds", {
    method: "POST",
    body: JSON.stringify({ bedNumber: "B-102", ward: "Ward 1", category: "General" }),
  });
  assert.equal(bed1Res.status, 201);
  assert.equal(bed2Res.status, 201);
  const bed1Id = (bed1Res.json as { bed: { id: string } }).bed.id;
  const bed2Id = (bed2Res.json as { bed: { id: string } }).bed.id;

  const medNoPrice = await hospAdminA.req("/api/hospital/medicines", {
    method: "POST",
    body: JSON.stringify({ name: "Azithromycin 500mg", description: "Optional price med" }),
  });
  assert.equal(medNoPrice.status, 201);
  const med1Id = (medNoPrice.json as { medicine: { id: string } }).medicine.id;

  const testNoPrice = await hospAdminA.req("/api/hospital/lab-tests", {
    method: "POST",
    body: JSON.stringify({ name: "Thyroid Profile (TSH)" }),
  });
  assert.equal(testNoPrice.status, 201);
  const test1Id = (testNoPrice.json as { test: { id: string } }).test.id;

  const pharmA1Res = await hospAdminA.req("/api/hospital/pharmacies", {
    method: "POST",
    body: JSON.stringify({
      organizationName: "MintLeaf Rx",
      contactPerson: "Suresh",
      phone: "9811111111",
      username: "mintleaf_rx",
      password: "PharmPassword!1",
    }),
  });
  const pharmA2Res = await hospAdminA.req("/api/hospital/pharmacies", {
    method: "POST",
    body: JSON.stringify({
      organizationName: "OtherCare Rx",
      contactPerson: "Ramesh",
      phone: "9822222222",
      username: "othercare_rx",
      password: "PharmPassword!2",
    }),
  });
  assert.equal(pharmA1Res.status, 201);
  assert.equal(pharmA2Res.status, 201);
  const pharmA1Id = (pharmA1Res.json as { pharmacy: { id: string } }).pharmacy.id;

  const labA1Res = await hospAdminA.req("/api/hospital/labs", {
    method: "POST",
    body: JSON.stringify({
      organizationName: "TrueBio Diagnostics",
      contactPerson: "Kavitha",
      phone: "9833333333",
      username: "truebio_lab",
      password: "LabPassword!1",
    }),
  });
  assert.equal(labA1Res.status, 201);
  const labA1Id = (labA1Res.json as { lab: { id: string } }).lab.id;

  const recepCreate = await hospAdminA.req("/api/hospital/staff", {
    method: "POST",
    body: JSON.stringify({
      fullName: "Neha FrontDesk",
      username: "emgc_recep",
      password: "RecepPassword!1",
      role: "RECEPTIONIST",
    }),
  });
  assert.equal(recepCreate.status, 201);
  console.log("✓ Step 4: Admin setup & partner/staff accounts verified");

  // 4. Receptionist signs in and RBAC boundaries are tested on backend
  assert.equal(
    (
      await recepA.req("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: "emgc_recep",
          password: "RecepPassword!1",
          portalRole: "RECEPTIONIST",
        }),
      })
    ).status,
    200
  );

  // Receptionist MUST be blocked (403) from admin-only endpoints
  // Receptionist CAN add new missing medicines & lab tests to catalogue (201), but CANNOT edit/delete existing ones (403)
  const recepMedRes = await recepA.req("/api/hospital/medicines", {
    method: "POST",
    body: JSON.stringify({ name: "Reception Added Med" }),
  });
  assert.equal(recepMedRes.status, 201);
  const recepTestRes = await recepA.req("/api/hospital/lab-tests", {
    method: "POST",
    body: JSON.stringify({ name: "Reception Added Test" }),
  });
  assert.equal(recepTestRes.status, 201);
  assert.equal(
    (
      await recepA.req(`/api/hospital/medicines/${med1Id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: "Tampered Med" }),
      })
    ).status,
    403
  );
  assert.equal(
    (
      await recepA.req(`/api/hospital/lab-tests/${test1Id}`, {
        method: "DELETE",
      })
    ).status,
    403
  );
  assert.equal(
    (
      await recepA.req("/api/hospital/pharmacies", {
        method: "POST",
        body: JSON.stringify({
          organizationName: "Blocked",
          contactPerson: "X",
          phone: "9999999999",
          username: "blocked_rx",
          password: "Password!1",
        }),
      })
    ).status,
    403
  );
  assert.equal(
    (
      await recepA.req("/api/hospital/settings", {
        method: "PATCH",
        body: JSON.stringify({ name: "Hacked Name" }),
      })
    ).status,
    403
  );
  assert.equal((await recepA.req("/api/hospital/reports")).status, 403);
  assert.equal((await recepA.req("/api/hospital/history")).status, 403);
  assert.equal((await recepA.req("/api/hospital/management")).status, 403);
  assert.equal((await recepA.req("/api/super-admin/hospitals")).status, 403);
  console.log("✓ Step 5: Receptionist backend RBAC restrictions verified (403 on all admin/management/super-admin routes)");

  // Step 5b: Verify Management section APIs (editing doctor, pharmacy owner+username, lab owner+username, receptionist+username)
  const mgmtRes = await hospAdminA.req("/api/hospital/management");
  assert.equal(mgmtRes.status, 200);

  const editDocRes = await hospAdminA.req(`/api/hospital/doctors/${doctorId}`, {
    method: "PATCH",
    body: JSON.stringify({
      name: "Dr. Arjun Nair MD",
      phone: "9845000011",
      consultationFee: 350,
    }),
  });
  assert.equal(editDocRes.status, 200);
  assert.equal((editDocRes.json as { doctor: { phone: string } }).doctor.phone, "9845000011");

  const editPharmRes = await hospAdminA.req(`/api/hospital/pharmacies/${pharmA1Id}`, {
    method: "PATCH",
    body: JSON.stringify({
      contactPerson: "Suresh Kumar",
      username: "mintleaf_rx_v2",
    }),
  });
  assert.equal(editPharmRes.status, 200);
  assert.equal(
    (editPharmRes.json as { pharmacy: { user: { username: string } } }).pharmacy.user.username,
    "mintleaf_rx_v2"
  );
  // Restore original username so downstream pharmacy login test uses mintleaf_rx
  assert.equal(
    (
      await hospAdminA.req(`/api/hospital/pharmacies/${pharmA1Id}`, {
        method: "PATCH",
        body: JSON.stringify({ username: "mintleaf_rx" }),
      })
    ).status,
    200
  );

  const editLabRes = await hospAdminA.req(`/api/hospital/labs/${labA1Id}`, {
    method: "PATCH",
    body: JSON.stringify({
      contactPerson: "Kavitha M",
      username: "truebio_lab_v2",
    }),
  });
  assert.equal(editLabRes.status, 200);
  assert.equal(
    (editLabRes.json as { lab: { user: { username: string } } }).lab.user.username,
    "truebio_lab_v2"
  );
  assert.equal(
    (
      await hospAdminA.req(`/api/hospital/labs/${labA1Id}`, {
        method: "PATCH",
        body: JSON.stringify({ username: "truebio_lab" }),
      })
    ).status,
    200
  );

  const recepStaffId = (recepCreate.json as { staff: { id: string } }).staff.id;
  const editStaffRes = await hospAdminA.req(`/api/hospital/staff/${recepStaffId}`, {
    method: "PATCH",
    body: JSON.stringify({
      fullName: "Neha FrontDesk Updated",
      username: "emgc_recep_v2",
      phone: "9876500000",
    }),
  });
  assert.equal(editStaffRes.status, 200);
  assert.equal(
    (editStaffRes.json as { staff: { username: string } }).staff.username,
    "emgc_recep_v2"
  );
  // Rename back & re-login receptionist cleanly (rename revokes old session)
  assert.equal(
    (
      await hospAdminA.req(`/api/hospital/staff/${recepStaffId}`, {
        method: "PATCH",
        body: JSON.stringify({ username: "emgc_recep" }),
      })
    ).status,
    200
  );
  assert.equal(
    (
      await recepA.req("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: "emgc_recep",
          password: "RecepPassword!1",
          portalRole: "RECEPTIONIST",
        }),
      })
    ).status,
    200
  );
  console.log("✓ Step 5b: Management section editing (Doctor, Pharmacy Owner+Username, Lab Owner+Username, Receptionist+Username) verified");

  // 5. Reject non-10-digit mobile numbers, register Patient 1 (NO_CHARGE) & Patient 2 (fee 500)
  assert.equal(
    (
      await recepA.req("/api/hospital/patients", {
        method: "POST",
        body: JSON.stringify({
          fullName: "Invalid Phone",
          gender: "MALE",
          phone: "987654321",
        }),
      })
    ).status,
    400
  );
  assert.equal(
    (
      await recepA.req("/api/hospital/patients", {
        method: "POST",
        body: JSON.stringify({
          fullName: "Invalid Phone",
          gender: "MALE",
          phone: "+91 9000011111",
        }),
      })
    ).status,
    400
  );

  const p1Res = await recepA.req("/api/hospital/patients", {
    method: "POST",
    body: JSON.stringify({
      fullName: "Ananya Iyer",
      age: 29,
      gender: "FEMALE",
      phone: "9000011111",
      doctorId,
      reasonForVisit: "Annual checkup",
    }),
  });
  assert.equal(p1Res.status, 201);
  const p1Data = p1Res.json as {
    patient: { id: string; uhid: string };
    opVisit: { id: string };
    receipt: { id: string; totalAmount: number | null; paymentStatus: string };
  };
  assert.equal(p1Data.receipt.totalAmount, null);
  assert.equal(p1Data.receipt.paymentStatus, "NO_CHARGE");
  assert.match(p1Data.patient.uhid, /^\d{8}$/);

  const p2Res = await recepA.req("/api/hospital/patients", {
    method: "POST",
    body: JSON.stringify({
      fullName: "Raghavendra Rao",
      age: 45,
      gender: "MALE",
      phone: "9000022222",
      doctorId,
      consultationFee: 500,
      paymentMode: "UPI",
    }),
  });
  assert.equal(p2Res.status, 201);
  const p2Data = p2Res.json as {
    patient: { id: string; uhid: string };
    opVisit: { id: string };
    receipt: { id: string; totalAmount: number | null; hospitalNameSnapshot: string };
  };
  assert.equal(p2Data.receipt.totalAmount, 500);
  assert.match(p2Data.patient.uhid, /^\d{8}$/);
  assert.notEqual(p2Data.patient.uhid, p1Data.patient.uhid);

  // Repeat OP Visit for Patient 1 -> no duplicate patient!
  const repeatRes = await recepA.req("/api/hospital/patients", {
    method: "POST",
    body: JSON.stringify({
      existingPatientId: p1Data.patient.id,
      fullName: "Ananya Iyer",
      age: 29,
      gender: "FEMALE",
      phone: "9000011111",
      doctorId,
      reasonForVisit: "Follow-up visit",
    }),
  });
  assert.equal(repeatRes.status, 201);
  assert.equal(
    (repeatRes.json as { isNewPatient: boolean }).isNewPatient,
    false
  );

  // Print pages check (verifies Doctor's Signature label, no Stamp, no Advice section, no dotted/dashed lines)
  const consultPageRes = await recepA.req(`/print/op-consultation/${p1Data.opVisit.id}`);
  assert.equal(consultPageRes.status, 200);
  assert.ok(consultPageRes.text.includes("Doctor&#x27;s Signature") || consultPageRes.text.includes("Doctor's Signature"));
  assert.equal(consultPageRes.text.includes("Doctor Signature &amp; Stamp"), false);
  assert.equal(consultPageRes.text.includes("Advice / Follow-Up Instructions"), false);
  assert.equal(consultPageRes.text.includes("border-dotted"), false);
  assert.equal(consultPageRes.text.includes("border-dashed"), false);
  assert.equal(
    (await recepA.req(`/print/receipt/${p2Data.receipt.id}`)).status,
    200
  );
  console.log("✓ Step 6: OP registration, UHID generation, repeat visit & print routes verified");

  // 6. IP Admissions, Concurrency Double-Booking Guard, Transfer & Discharge
  const adm1Res = await recepA.req("/api/hospital/admissions", {
    method: "POST",
    body: JSON.stringify({
      patientId: p1Data.patient.id,
      bedId: bed1Id,
      doctorId,
      admissionNotes: "Observation",
      chargeAmount: 1500,
    }),
  });
  assert.equal(adm1Res.status, 201);
  const adm1Id = (adm1Res.json as { admission: { id: string } }).admission.id;

  // Verify Bed deletion: occupied bed MUST return 409; newly added unused bed deletes cleanly (200)
  assert.equal((await hospAdminA.req(`/api/hospital/beds/${bed1Id}`, { method: "DELETE" })).status, 409);
  const tempBedRes = await hospAdminA.req("/api/hospital/beds", {
    method: "POST",
    body: JSON.stringify({ bedNumber: "TEMP-99", ward: "Temp Ward", category: "General" }),
  });
  assert.equal(tempBedRes.status, 201);
  const tempBedId = (tempBedRes.json as { bed: { id: string } }).bed.id;
  assert.equal((await hospAdminA.req(`/api/hospital/beds/${tempBedId}`, { method: "DELETE" })).status, 200);

  // Verify dashboard Gross Amount includes OP (500) + IP (1500) = 2000
  const dashAfterAdm = (await hospAdminA.req("/api/hospital/dashboard")).json as {
    kpis: { opGrossAmount: number; ipGrossAmount: number; totalGrossAmount: number };
  };
  assert.equal(dashAfterAdm.kpis.opGrossAmount, 500);
  assert.equal(dashAfterAdm.kpis.ipGrossAmount, 1500);
  assert.equal(dashAfterAdm.kpis.totalGrossAmount, 2000);

  // Verify Patient pagination works cleanly and Super Admin receives OP limit alert without blocking entries
  const pagedPatients = (
    await hospAdminA.req("/api/hospital/patients?page=1&limit=1")
  ).json as {
    patients: unknown[];
    pagination: { total: number; page: number; pageSize: number; totalPages: number };
  };
  assert.equal(pagedPatients.patients.length, 1);
  assert.equal(pagedPatients.pagination.total, 2);
  assert.equal(pagedPatients.pagination.totalPages, 2);

  const tzOffsetParam = new Date().getTimezoneOffset();
  const saDashAlerts = (
    await superAdmin.req(`/api/super-admin/dashboard?tzOffset=${tzOffsetParam}`)
  ).json as {
    limitAlerts: Array<{ hospitalId: string; opExceeded: boolean; todayOp: number }>;
  };
  const hospAAlert = saDashAlerts.limitAlerts.find((a) => a.hospitalId === hospAId);
  assert.ok(hospAAlert && hospAAlert.opExceeded && hospAAlert.todayOp === 3);

  const saInspectHospA = (
    await superAdmin.req(`/api/super-admin/hospitals/${hospAId}?tzOffset=${tzOffsetParam}`)
  ).json as {
    hospital: {
      dailyStats: { todayPatients: number; monthPatients: number; todayOp: number };
      dailyBreakdown: unknown[];
    };
  };
  assert.equal(saInspectHospA.hospital.dailyStats.todayPatients, 2);
  assert.equal(saInspectHospA.hospital.dailyStats.monthPatients, 2);
  assert.equal(saInspectHospA.hospital.dailyStats.todayOp, 3);
  assert.equal(saInspectHospA.hospital.dailyBreakdown.length, 14);

  // Attempt to assign Bed 1 to Patient 2 -> MUST fail 409!
  const collisionAdm = await recepA.req("/api/hospital/admissions", {
    method: "POST",
    body: JSON.stringify({
      patientId: p2Data.patient.id,
      bedId: bed1Id,
      doctorId,
    }),
  });
  assert.equal(collisionAdm.status, 409);

  // Transfer Patient 1 to Bed 2 -> Bed 1 released, Bed 2 occupied
  const transferRes = await recepA.req(`/api/hospital/admissions/${adm1Id}/transfer`, {
    method: "POST",
    body: JSON.stringify({ toBedId: bed2Id, reason: "Patient preference" }),
  });
  assert.equal(transferRes.status, 200);

  // Discharge Patient 1 -> Bed 2 released!
  const dischargeRes = await recepA.req(
    `/api/hospital/admissions/${adm1Id}/discharge`,
    { method: "POST", body: JSON.stringify({ dischargeNotes: "Stable" }) }
  );
  assert.equal(dischargeRes.status, 200);

  const bedsAfter = (
    await recepA.req("/api/hospital/beds")
  ).json as { beds: Array<{ id: string; status: string }> };
  assert.equal(bedsAfter.beds.every((b) => b.status === "AVAILABLE"), true);
  console.log("✓ Step 7: Transaction-safe IP admission, double-booking guard, bed transfer & automatic discharge release verified");

  // 7. Pharmacy & Lab Referrals (with optional null pricing!) & Portal Isolation
  const phrRes = await recepA.req("/api/hospital/pharmacy-referrals", {
    method: "POST",
    body: JSON.stringify({
      patientId: p1Data.patient.id,
      pharmacyAccountId: pharmA1Id,
      items: [{ medicineCatalogId: med1Id, quantity: 2 }],
    }),
  });
  assert.equal(phrRes.status, 201);
  const phrId = (phrRes.json as { referral: { id: string; totalAmount: number | null } })
    .referral.id;
  assert.equal(
    (phrRes.json as { referral: { totalAmount: number | null } }).referral.totalAmount,
    null
  );

  const labRefRes = await recepA.req("/api/hospital/lab-referrals", {
    method: "POST",
    body: JSON.stringify({
      patientId: p1Data.patient.id,
      labAccountId: labA1Id,
      items: [{ labTestCatalogId: test1Id }],
    }),
  });
  assert.equal(labRefRes.status, 201);
  const labRefId = (labRefRes.json as { referral: { id: string } }).referral.id;

  // Pharmacy A1 & A2 logins
  assert.equal(
    (
      await pharmA1.req("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: "mintleaf_rx",
          password: "PharmPassword!1",
          portalRole: "PHARMACY_USER",
        }),
      })
    ).status,
    200
  );
  assert.equal(
    (
      await pharmA2.req("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: "othercare_rx",
          password: "PharmPassword!2",
          portalRole: "PHARMACY_USER",
        }),
      })
    ).status,
    200
  );

  // Pharm A2 MUST NOT see Pharm A1's referral or be able to complete it!
  const a2List = (await pharmA2.req("/api/pharmacy/referrals")).json as {
    referrals: unknown[];
  };
  assert.equal(a2List.referrals.length, 0);
  assert.equal(
    (await pharmA2.req(`/api/pharmacy/referrals/${phrId}/complete`, { method: "POST" }))
      .status,
    404
  );

  // Pharm A1 completes it (Pending -> Completed workflow & Completed date filter)
  const pharmA1PendingBefore = (await pharmA1.req("/api/pharmacy/referrals")).json as {
    referrals: Array<{ id: string }>;
  };
  assert.equal(
    pharmA1PendingBefore.referrals.some((r) => r.id === phrId),
    true
  );

  assert.equal(
    (
      await pharmA1.req(`/api/pharmacy/referrals/${phrId}/complete`, {
        method: "POST",
        body: JSON.stringify({ totalAmount: 425 }),
      })
    ).status,
    200
  );

  const pharmHistoryForAdmin = (
    await hospAdminA.req("/api/hospital/pharmacy-referrals")
  ).json as { referrals: Array<{ id: string; totalAmount: number | null }> };
  assert.equal(
    pharmHistoryForAdmin.referrals.find((r) => r.id === phrId)?.totalAmount,
    425
  );

  const pharmA1PendingAfter = (await pharmA1.req("/api/pharmacy/referrals")).json as {
    referrals: Array<{ id: string }>;
  };
  assert.equal(pharmA1PendingAfter.referrals.length, 0);

  const tzOffset = new Date().getTimezoneOffset();
  const todayLocal = new Date(Date.now() - tzOffset * 60_000).toISOString().slice(0, 10);
  const pharmA1CompletedRange = (
    await pharmA1.req(
      `/api/pharmacy/referrals?status=COMPLETED&from=${todayLocal}&to=${todayLocal}&tzOffset=${tzOffset}`
    )
  ).json as { referrals: Array<{ id: string }> };
  assert.equal(
    pharmA1CompletedRange.referrals.some((r) => r.id === phrId),
    true
  );

  // Lab A1 completes lab referral (Pending -> Completed workflow & Completed date filter)
  assert.equal(
    (
      await labA1.req("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: "truebio_lab",
          password: "LabPassword!1",
          portalRole: "LAB_USER",
        }),
      })
    ).status,
    200
  );
  const labA1PendingBefore = (await labA1.req("/api/laboratory/referrals")).json as {
    referrals: Array<{ id: string }>;
  };
  assert.equal(
    labA1PendingBefore.referrals.some((r) => r.id === labRefId),
    true
  );

  assert.equal(
    (
      await labA1.req(`/api/laboratory/referrals/${labRefId}/complete`, {
        method: "POST",
        body: JSON.stringify({ totalAmount: 750 }),
      })
    ).status,
    200
  );

  const labHistoryForAdmin = (
    await hospAdminA.req("/api/hospital/lab-referrals")
  ).json as { referrals: Array<{ id: string; totalAmount: number | null }> };
  assert.equal(
    labHistoryForAdmin.referrals.find((r) => r.id === labRefId)?.totalAmount,
    750
  );

  const labA1PendingAfter = (await labA1.req("/api/laboratory/referrals")).json as {
    referrals: Array<{ id: string }>;
  };
  assert.equal(labA1PendingAfter.referrals.length, 0);

  const labA1CompletedRange = (
    await labA1.req(
      `/api/laboratory/referrals?status=COMPLETED&from=${todayLocal}&to=${todayLocal}&tzOffset=${tzOffset}`
    )
  ).json as { referrals: Array<{ id: string }> };
  assert.equal(
    labA1CompletedRange.referrals.some((r) => r.id === labRefId),
    true
  );
  console.log("✓ Step 8: Pharmacy & Lab referrals, optional pricing, strict partner isolation & completion sync verified");

  // 8. Historical Receipt Immutability & Patient History & Tenant Isolation (Hospital B)
  await hospAdminA.req("/api/hospital/settings", {
    method: "PATCH",
    body: JSON.stringify({ name: "Emerald Grove Renamed Hospital" }),
  });

  const histReceipt = (
    await recepA.req(`/api/hospital/print/receipt/${p2Data.receipt.id}`)
  ).json as { receipt: { hospitalNameSnapshot: string; totalAmount: number } };
  assert.equal(histReceipt.receipt.hospitalNameSnapshot, "Emerald Grove Clinic");
  assert.equal(histReceipt.receipt.totalAmount, 500);

  const ptHistory = (
    await recepA.req(`/api/hospital/patients/${encodeURIComponent(p1Data.patient.uhid)}`)
  ).json as {
    patient: {
      opVisits: unknown[];
      ipAdmissions: Array<{ bedTransfers: unknown[] }>;
      pharmacyReferrals: Array<{ status: string }>;
      labReferrals: Array<{ status: string }>;
      billingReceipts: unknown[];
    };
  };
  assert.equal(ptHistory.patient.opVisits.length, 2);
  assert.equal(ptHistory.patient.ipAdmissions.length, 1);
  assert.equal(ptHistory.patient.ipAdmissions[0].bedTransfers.length, 2);
  assert.equal(ptHistory.patient.pharmacyReferrals[0].status, "COMPLETED");
  assert.equal(ptHistory.patient.labReferrals[0].status, "COMPLETED");
  assert.equal(ptHistory.patient.billingReceipts.length, 3);

  // Tenant isolation: Hospital B Admin MUST NOT see Hospital A patient!
  assert.equal(
    (
      await hospAdminB.req(
        `/api/hospital/patients/${encodeURIComponent(p1Data.patient.uhid)}`
      )
    ).status,
    404
  );
  console.log("✓ Step 9: Historical receipt snapshot immutability, complete UHID timeline & Hospital A/B tenant isolation verified");

  // 9. Password Change & Security Notifications
  assert.equal(
    (
      await recepA.req("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: "RecepPassword!1",
          newPassword: "RecepPassword!99",
          confirmPassword: "RecepPassword!99",
        }),
      })
    ).status,
    200
  );
  const oldPwLogin = await new CookieClient().req("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      username: "emgc_recep",
      password: "RecepPassword!1",
      portalRole: "RECEPTIONIST",
    }),
  });
  assert.equal(oldPwLogin.status, 401);

  const settingsAfterPw = (await hospAdminA.req("/api/hospital/settings")).json as {
    notifications: Array<{ title: string; message: string }>;
  };
  assert.equal(
    settingsAfterPw.notifications.some((n) => n.title.includes("Password Updated")),
    true
  );
  assert.equal(
    JSON.stringify(settingsAfterPw.notifications).includes("RecepPassword!99"),
    false
  );
  console.log("✓ Step 10: Password change, old password rejection & admin security alert (no plaintext) verified");

  // 10. Super Admin JSON Backup Export (Full Snapshot incl. passwordHash, zero plaintext), Validation & Transactional Restore/Rollback
  const exportRes = await superAdmin.req(
    `/api/super-admin/backup/export?hospitalId=${encodeURIComponent(hospAId)}`
  );
  assert.equal(exportRes.status, 200);
  // Zero plaintext passwords anywhere in backup export!
  assert.equal(exportRes.text.includes("RecepPassword"), false);
  assert.equal(exportRes.text.includes("AdminPassword"), false);

  const backupJson = exportRes.json;
  const valRes = await superAdmin.req("/api/super-admin/backup/validate", {
    method: "POST",
    body: JSON.stringify({ backup: backupJson }),
  });
  assert.equal((valRes.json as { valid: boolean }).valid, true);
  assert.equal((valRes.json as { checksumValid: boolean }).checksumValid, true);

  const restoreRes = await superAdmin.req("/api/super-admin/backup/restore", {
    method: "POST",
    body: JSON.stringify({
      backup: backupJson,
      mode: "IMPORT_NEW",
      sourceHospitalId: hospAId,
      newHospitalName: "Emerald Restored Copy",
      newHospitalCode: "EMRC",
      usernamePrefix: "rest_",
    }),
  });
  assert.equal(restoreRes.status, 200);
  assert.equal(
    (restoreRes.json as { restoredCounts: { patients: number } }).restoredCounts
      .patients,
    2
  );

  // Take Full Platform Backup BEFORE destructive post-backup changes (password change + extra hospital + extra patient)
  const fullPlatformExportRes = await superAdmin.req("/api/super-admin/backup/export");
  assert.equal(fullPlatformExportRes.status, 200);
  assert.equal(fullPlatformExportRes.text.includes("RecepPassword"), false);
  assert.equal(fullPlatformExportRes.text.includes("SuperSecret!123"), false);
  const fullPlatformBackup = fullPlatformExportRes.json;

  // Make post-backup mutations: change receptionist password again AND create an extra temporary hospital
  assert.equal(
    (
      await recepA.req("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: "RecepPassword!99",
          newPassword: "PostBackupPw!777",
          confirmPassword: "PostBackupPw!777",
        }),
      })
    ).status,
    200
  );
  const postHospRes = await superAdmin.req("/api/super-admin/hospitals", {
    method: "POST",
    body: JSON.stringify({
      name: "Temporary Post Backup Clinic",
      code: "TEMP99",
      paidMonths: 3,
      adminFullName: "Temp Admin",
      adminUsername: "temp99_admin",
      adminPassword: "TempPassword!123",
    }),
  });
  assert.equal(postHospRes.status, 201);

  // Full Platform Overwrite Restore MUST rewind the entire website back to the snapshot!
  const fullRestoreRes = await superAdmin.req("/api/super-admin/backup/restore", {
    method: "POST",
    body: JSON.stringify({
      backup: fullPlatformBackup,
      mode: "RESTORE_PLATFORM",
      confirmOverwrite: true,
    }),
  });
  assert.equal(fullRestoreRes.status, 200);
  assert.equal((fullRestoreRes.json as { requiresRelogin: boolean }).requiresRelogin, false);

  // Now also test changing Super Admin password AFTER backup -> restore -> requiresRelogin: true & old Super Admin password works again!
  assert.equal(
    (
      await superAdmin.req("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: "SuperPassword!99",
          newPassword: "SuperChanged!888",
          confirmPassword: "SuperChanged!888",
        }),
      })
    ).status,
    200
  );
  const fullRestoreWithSaChange = await superAdmin.req("/api/super-admin/backup/restore", {
    method: "POST",
    body: JSON.stringify({
      backup: fullPlatformBackup,
      mode: "RESTORE_PLATFORM",
      confirmOverwrite: true,
    }),
  });
  assert.equal(fullRestoreWithSaChange.status, 200);
  assert.equal((fullRestoreWithSaChange.json as { requiresRelogin: boolean }).requiresRelogin, true);

  // Changed Super Admin password MUST be rejected & restored snapshot Super Admin password works!
  assert.equal(
    (
      await new CookieClient().req("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: "e2e_super",
          password: "SuperChanged!888",
          portalRole: "SUPER_ADMIN",
        }),
      })
    ).status,
    401
  );
  assert.equal(
    (
      await superAdmin.req("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: "e2e_super",
          password: "SuperPassword!99",
          portalRole: "SUPER_ADMIN",
        }),
      })
    ).status,
    200
  );

  // Verify post-backup hospital is GONE after full platform overwrite
  const postRestoreHospitals = ((await superAdmin.req("/api/super-admin/hospitals")).json as {
    hospitals: Array<{ code: string }>;
  }).hospitals;
  assert.equal(postRestoreHospitals.some((h) => h.code === "TEMP99"), false);

  // Verify receptionist password rolled back cleanly: old snapshot password ("RecepPassword!99") works again & post-backup password ("PostBackupPw!777") is rejected!
  assert.equal(
    (
      await new CookieClient().req("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: "emgc_recep",
          password: "PostBackupPw!777",
          portalRole: "RECEPTIONIST",
        }),
      })
    ).status,
    401
  );
  assert.equal(
    (
      await recepA.req("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: "emgc_recep",
          password: "RecepPassword!99",
          portalRole: "RECEPTIONIST",
        }),
      })
    ).status,
    200
  );

  // Also test RESTORE_EXISTING atomic restore (and verify explicit confirmation guard)
  const missingConfirm = await superAdmin.req("/api/super-admin/backup/restore", {
    method: "POST",
    body: JSON.stringify({
      backup: backupJson,
      mode: "RESTORE_EXISTING",
      sourceHospitalId: hospAId,
      targetHospitalId: hospAId,
      confirmOverwrite: false,
    }),
  });
  assert.equal(missingConfirm.status, 400);

  const restoreExisting = await superAdmin.req("/api/super-admin/backup/restore", {
    method: "POST",
    body: JSON.stringify({
      backup: backupJson,
      mode: "RESTORE_EXISTING",
      sourceHospitalId: hospAId,
      targetHospitalId: hospAId,
      confirmOverwrite: true,
    }),
  });
  assert.equal(restoreExisting.status, 200);
  // Re-login after RESTORE_EXISTING revoked hospital sessions cleanly (and pharmacy/lab re-login too)
  assert.equal(
    (
      await hospAdminA.req("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: "emgc_admin",
          password: "AdminPassword!1",
          portalRole: "HOSPITAL_ADMIN",
        }),
      })
    ).status,
    200
  );
  assert.equal(
    (
      await pharmA1.req("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: "mintleaf_rx",
          password: "PharmPassword!1",
          portalRole: "PHARMACY_USER",
        }),
      })
    ).status,
    200
  );
  assert.equal(
    (
      await labA1.req("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: "truebio_lab",
          password: "LabPassword!1",
          portalRole: "LAB_USER",
        }),
      })
    ).status,
    200
  );
  console.log("✓ Step 11: Full backup export (password hashes, zero plaintext), checksum validation, RESTORE_PLATFORM rollback, IMPORT_NEW & RESTORE_EXISTING verified");

  // 11. Immediate Hospital Deactivation -> Blocks ALL roles & revokes active sessions!
  assert.equal(
    (
      await superAdmin.req(`/api/super-admin/hospitals/${hospAId}/status`, {
        method: "POST",
        body: JSON.stringify({ isActive: false, reason: "E2E suspension test" }),
      })
    ).status,
    200
  );

  // Existing active sessions MUST immediately return 401!
  assert.equal((await hospAdminA.req("/api/auth/me")).status, 401);
  assert.equal((await recepA.req("/api/auth/me")).status, 401);
  assert.equal((await pharmA1.req("/api/auth/me")).status, 401);
  assert.equal((await labA1.req("/api/auth/me")).status, 401);

  // Fresh login attempts MUST fail 403!
  assert.equal(
    (
      await new CookieClient().req("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: "emgc_admin",
          password: "AdminPassword!1",
        }),
      })
    ).status,
    403
  );

  // Reactivate Hospital A and confirm data preserved & login restored!
  assert.equal(
    (
      await superAdmin.req(`/api/super-admin/hospitals/${hospAId}/status`, {
        method: "POST",
        body: JSON.stringify({ isActive: true }),
      })
    ).status,
    200
  );
  assert.equal(
    (
      await hospAdminA.req("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: "emgc_admin",
          password: "AdminPassword!1",
        }),
      })
    ).status,
    200
  );
  console.log("✓ Step 12: Immediate multi-portal session revocation on hospital deactivation & lossless reactivation verified");

  // 12B. Super Admin Exclusive Complete Hospital Data PDF Export (4 Segregated Sections)
  const pdfUrl = `/api/super-admin/hospitals/${hospAId}/export-pdf?tzOffset=-330`;
  assert.equal((await hospAdminA.req(pdfUrl)).status, 403);
  assert.equal((await new CookieClient().req(pdfUrl)).status, 401);

  const pdfHttpRes = await fetch(`${BASE}${pdfUrl}`, {
    headers: { cookie: superAdmin.cookieHeader },
  });
  assert.equal(pdfHttpRes.status, 200);
  assert.equal(pdfHttpRes.headers.get("content-type"), "application/pdf");
  const pdfCd = pdfHttpRes.headers.get("content-disposition") ?? "";
  assert.ok(pdfCd.includes("attachment;") && pdfCd.includes(".pdf"));
  const pdfBuf = Buffer.from(await pdfHttpRes.arrayBuffer());
  assert.ok(pdfBuf.subarray(0, 5).toString("ascii") === "%PDF-", "Must start with %PDF-");
  assert.ok(pdfBuf.byteLength > 3000, "Generated PDF must contain multi-section content");

  // Inflate all PDF content streams and verify all 4 segregated section banners & exact page count
  const pdfLatin = pdfBuf.toString("latin1");
  const countMatch = pdfLatin.match(/\/Count\s+(\d+)/);
  const pageCount = countMatch ? Number(countMatch[1]) : 0;
  assert.ok(pageCount >= 5 && pageCount <= 20, `Expected compact multi-section page count, got ${pageCount}`);

  const streamChunks: string[] = [];
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let streamMatch: RegExpExecArray | null;
  while ((streamMatch = streamRegex.exec(pdfLatin)) !== null) {
    const rawStream = Buffer.from(streamMatch[1], "latin1");
    try {
      const inflated = zlib.inflateSync(rawStream).toString("latin1");
      const collapsed = inflated
        .replace(/\[([^\]]+)\]\s*TJ/g, (_, inner: string) =>
          Array.from(inner.matchAll(/<([0-9a-fA-F]+)>/g))
            .map((m) => Buffer.from(m[1], "hex").toString("latin1"))
            .join("")
            .replace(/\s+/g, "")
        )
        .replace(/<([0-9a-fA-F]+)>\s*Tj/g, (_, hex: string) =>
          Buffer.from(hex, "hex").toString("latin1").replace(/\s+/g, "")
        );
      streamChunks.push(collapsed);
    } catch {
      streamChunks.push(rawStream.toString("latin1"));
    }
  }
  const decodedPdf = streamChunks.join("\n");
  assert.ok(decodedPdf.includes("OPDRegistrations"));
  assert.ok(decodedPdf.includes("IPManagement"));
  assert.ok(decodedPdf.includes("PharmacyReferrals"));
  assert.ok(decodedPdf.includes("LaboratoryReferrals"));
  console.log(`✓ Step 12B: Super-Admin-only 4-section Hospital Data PDF export verified (${pageCount} pages, ${pdfBuf.byteLength} bytes)`);

  // 12. Super Admin Timeframe Data Deletion (Preview, RBAC, Guard & Selective Purge)
  const todayStr = new Date().toISOString().slice(0, 10);
  const pastRangeUrl = `/api/super-admin/hospitals/${hospAId}/purge?from=2020-01-01&to=${todayStr}`;

  // RBAC: Hospital Admin cannot access Super Admin purge endpoint
  assert.equal((await hospAdminA.req(pastRangeUrl)).status, 403);

  // Preview counts before delete
  const purgePreviewRes = await superAdmin.req(pastRangeUrl);
  assert.equal(purgePreviewRes.status, 200);
  const purgePreviewData = purgePreviewRes.json as {
    preview: {
      patientsToDelete: number;
      opVisits: number;
      ipAdmissions: number;
      totalRecords: number;
    };
  };
  assert.ok(purgePreviewData.preview.patientsToDelete >= 2);
  assert.ok(purgePreviewData.preview.opVisits >= 2);
  assert.ok(purgePreviewData.preview.ipAdmissions >= 1);

  // Missing explicit confirmation MUST be rejected
  assert.equal(
    (
      await superAdmin.req(`/api/super-admin/hospitals/${hospAId}/purge`, {
        method: "POST",
        body: JSON.stringify({
          from: "2020-01-01",
          to: todayStr,
          confirmPurge: false,
        }),
      })
    ).status,
    400
  );

  // Execute confirmed timeframe purge
  const purgeExecRes = await superAdmin.req(
    `/api/super-admin/hospitals/${hospAId}/purge`,
    {
      method: "POST",
      body: JSON.stringify({
        from: "2020-01-01",
        to: todayStr,
        confirmPurge: true,
      }),
    }
  );
  assert.equal(purgeExecRes.status, 200);
  const purgeExecData = purgeExecRes.json as {
    deletedCounts: { patients: number; opVisits: number; ipAdmissions: number };
  };
  assert.equal(
    purgeExecData.deletedCounts.patients,
    purgePreviewData.preview.patientsToDelete
  );
  assert.equal(
    purgeExecData.deletedCounts.opVisits,
    purgePreviewData.preview.opVisits
  );

  // Hospital Admin account stays active and can still access clean empty tenant
  const postPurgePatients = (await hospAdminA.req("/api/hospital/patients")).json as {
    patients: unknown[];
  };
  assert.equal(postPurgePatients.patients.length, 0);
  console.log("✓ Step 13: Super Admin timeframe data preview, confirmation guard & selective tenant purge verified");

  // 14. Super Admin Maintenance Break (Blocks non-Super-Admin logins & APIs, broadcasts reason, preserves Super Admin)
  const maintStartRes = await superAdmin.req("/api/super-admin/maintenance", {
    method: "POST",
    body: JSON.stringify({
      durationMinutes: 60,
      reason: "Scheduled 1-hour database upgrade & optimization",
    }),
  });
  assert.equal(maintStartRes.status, 200);

  // Public status exposes active state and reason
  const publicMaint = (await new CookieClient().req("/api/maintenance/status")).json as {
    active: boolean;
    reason: string;
  };
  assert.equal(publicMaint.active, true);
  assert.equal(publicMaint.reason, "Scheduled 1-hour database upgrade & optimization");

  // Non-Super-Admin logins & APIs return 503 MAINTENANCE_ACTIVE with exact reason
  const blockedLogin = await new CookieClient().req("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      username: "emgc_admin",
      password: "AdminPassword!1",
      portalRole: "HOSPITAL_ADMIN",
    }),
  });
  assert.equal(blockedLogin.status, 503);
  assert.ok(blockedLogin.text.includes("Scheduled 1-hour database upgrade"));

  const blockedApi = await hospAdminA.req("/api/hospital/patients");
  assert.equal(blockedApi.status, 503);
  assert.ok(blockedApi.text.includes("Scheduled 1-hour database upgrade"));

  // Super Admin remains completely accessible and can end maintenance early
  assert.equal((await superAdmin.req("/api/super-admin/dashboard")).status, 200);
  assert.equal((await superAdmin.req("/api/super-admin/maintenance", { method: "DELETE" })).status, 200);

  // Hospital portals and logins resume immediately
  assert.equal((await hospAdminA.req("/api/hospital/patients")).status, 200);
  console.log("✓ Step 14: Super Admin maintenance mode, reason broadcast, non-admin pause & Super Admin exemption verified");

  // 15. Verify Attendance Section & Manager Login are completely removed
  assert.equal((await fetch(`${BASE}/manager`)).status, 404);
  assert.equal((await fetch(`${BASE}/hospital/attendance`)).status, 404);
  assert.equal((await hospAdminA.req("/api/attendance")).status, 404);
  const rejectMgrRoleRes = await hospAdminA.req("/api/hospital/staff", {
    method: "POST",
    body: JSON.stringify({
      fullName: "Removed Manager Role Test",
      username: "removed_mgr_test",
      phone: "9876501122",
      password: "ManagerPassword!1",
      role: "MANAGER",
    }),
  });
  assert.equal(rejectMgrRoleRes.status, 400);
  console.log("✓ Step 15: Attendance Section & Manager Portal/Login removal verified");

  // 16. Super Admin Payments Section, Paid Months on Create, Extend Months/Years + Amount Collected, Gross Amount Overview & Non-Blocking Overdue Alerts
  const paidHospRes = await superAdmin.req("/api/super-admin/hospitals", {
    method: "POST",
    body: JSON.stringify({
      name: "Verdant Payment Test Hospital",
      code: "VPAY-01",
      paidMonths: 2,
      initialPaymentAmount: 12000,
      adminFullName: "Payment Hospital Admin",
      adminUsername: "vpay_admin",
      adminPassword: "StrongPassword!1",
    }),
  });
  assert.equal(paidHospRes.status, 201);
  const paidHospId = (paidHospRes.json as { hospital: { id: string } }).hospital.id;

  // Platform overview reports exact Total Gross Amount
  const dashAfterCreate = await superAdmin.req("/api/super-admin/dashboard");
  assert.equal(dashAfterCreate.status, 200);
  const grossAfterCreate = (dashAfterCreate.json as { kpis: { totalGrossAmount: number } }).kpis
    .totalGrossAmount;
  assert.equal(grossAfterCreate, 12000);

  // Extend timeline by 1 Year + collect Rs 48,000 -> total becomes 14 months, Rs 60,000
  const extendYearRes = await superAdmin.req("/api/super-admin/payments", {
    method: "POST",
    body: JSON.stringify({
      hospitalId: paidHospId,
      durationValue: 1,
      durationUnit: "YEARS",
      amountCollected: 48000,
      notes: "Annual renewal via UPI",
    }),
  });
  assert.equal(extendYearRes.status, 201);
  const extData = extendYearRes.json as {
    hospital: { subscriptionMonthsPaid: number; subscriptionTotalPaid: number };
  };
  assert.equal(extData.hospital.subscriptionMonthsPaid, 14);
  assert.equal(extData.hospital.subscriptionTotalPaid, 60000);

  const dashAfterExtend = await superAdmin.req("/api/super-admin/dashboard");
  assert.equal(
    (dashAfterExtend.json as { kpis: { totalGrossAmount: number } }).kpis.totalGrossAmount,
    60000
  );

  // Simulate hospital crossing its payment limit (expired 3 days ago) and verify:
  // (a) Payments API raises an alert, (b) hospital is NOT auto-blocked, (c) Super Admin can manually deactivate
  const { PrismaClient } = await import("@prisma/client");
  const verifyPrisma = new PrismaClient();
  try {
    await verifyPrisma.hospital.update({
      where: { id: paidHospId },
      data: {
        subscriptionExpiresAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      },
    });
  } finally {
    await verifyPrisma.$disconnect();
  }

  const paymentsListRes = await superAdmin.req("/api/super-admin/payments");
  assert.equal(paymentsListRes.status, 200);
  const paymentsListJson = paymentsListRes.json as {
    summary: { totalGrossAmount: number; overdueCount: number };
    overdueAlerts: Array<{ hospitalId: string; daysOverdue: number }>;
  };
  assert.equal(paymentsListJson.summary.totalGrossAmount, 60000);
  assert.ok(paymentsListJson.summary.overdueCount >= 1);
  assert.ok(
    paymentsListJson.overdueAlerts.some(
      (a) => a.hospitalId === paidHospId && a.daysOverdue >= 3
    )
  );

  // Overdue hospital must NOT be auto-blocked from signing in or working!
  const vpayClient = new CookieClient();
  const vpayLogin = await vpayClient.req("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      username: "vpay_admin",
      password: "StrongPassword!1",
      portalRole: "HOSPITAL_ADMIN",
    }),
  });
  assert.equal(vpayLogin.status, 200);
  assert.equal((await vpayClient.req("/api/hospital/patients")).status, 200);

  // Manual deactivation from Payments section works and blocks access once explicitly deactivated
  const manualDeactRes = await superAdmin.req(
    `/api/super-admin/hospitals/${paidHospId}/status`,
    {
      method: "POST",
      body: JSON.stringify({ isActive: false, reason: "Manual deactivation after payment alert" }),
    }
  );
  assert.equal(manualDeactRes.status, 200);
  assert.equal((await vpayClient.req("/api/hospital/patients")).status, 401);
  console.log("✓ Step 16: Super Admin Payments, paid months, timeline extension, gross amount KPI, non-blocking overdue alert & manual deactivation verified");

  // 17. Consulting Doctor Required, Duplicate (Full Name + Mobile) Guard, Returning-Patient Age Auto-Update, Latest-to-Oldest Search & Individual Patient Complete Audit PDF
  // OP registration without selecting a consulting doctor MUST be rejected (400)
  const missingDocRes = await hospAdminA.req("/api/hospital/patients", {
    method: "POST",
    body: JSON.stringify({
      fullName: "No Doctor Patient",
      age: 30,
      gender: "MALE",
      phone: "9848011999",
    }),
  });
  assert.equal(missingDocRes.status, 400);

  const pOldRes = await hospAdminA.req("/api/hospital/patients", {
    method: "POST",
    body: JSON.stringify({
      fullName: "Abhinav Reddy",
      age: 28,
      gender: "MALE",
      phone: "9848011223",
      doctorId,
      consultationFee: 350,
      paymentMode: "CASH",
    }),
  });
  assert.equal(pOldRes.status, 201);
  const abhinavId = (pOldRes.json as { patient: { id: string; uhid: string } }).patient.id;
  const abhinavUhid = (pOldRes.json as { patient: { id: string; uhid: string } }).patient.uhid;

  // Duplicate (same fullName case-insensitively + same phone) as new patient MUST fail with 409 DUPLICATE_PATIENT
  const dupRes = await hospAdminA.req("/api/hospital/patients", {
    method: "POST",
    body: JSON.stringify({
      fullName: "  abhinav   reddy ",
      age: 29,
      gender: "MALE",
      phone: "9848011223",
      doctorId,
    }),
  });
  assert.equal(dupRes.status, 409);
  assert.equal((dupRes.json as { code: string }).code, "DUPLICATE_PATIENT");

  // Register a second patient with matching prefix so we verify latest-to-oldest ordering
  await new Promise((r) => setTimeout(r, 40));
  const pNewRes = await hospAdminA.req("/api/hospital/patients", {
    method: "POST",
    body: JSON.stringify({
      fullName: "Abhishek Kumar",
      age: 35,
      gender: "MALE",
      phone: "9848099887",
      doctorId,
    }),
  });
  assert.equal(pNewRes.status, 201);
  const abhishekId = (pNewRes.json as { patient: { id: string } }).patient.id;

  // Search "abhi" -> latest patient ("Abhishek Kumar") must appear FIRST (top recommendation)
  const searchBeforeReturn = await hospAdminA.req("/api/hospital/patients?q=abhi&limit=10");
  assert.equal(searchBeforeReturn.status, 200);
  const listBefore = (searchBeforeReturn.json as { patients: Array<{ id: string }> }).patients;
  assert.equal(listBefore[0]?.id, abhishekId);
  assert.equal(listBefore[1]?.id, abhinavId);

  // Returning patient OP visit (selecting Abhinav via existingPatientId) with new age 31 -> updates main patient profile age & floats Abhinav to top!
  await new Promise((r) => setTimeout(r, 40));
  const returnVisitRes = await hospAdminA.req("/api/hospital/patients", {
    method: "POST",
    body: JSON.stringify({
      existingPatientId: abhinavId,
      fullName: "Abhinav Reddy",
      age: 31,
      gender: "MALE",
      phone: "9848011223",
      doctorId,
      consultationFee: 400,
      paymentMode: "UPI",
    }),
  });
  assert.equal(returnVisitRes.status, 201);
  const returnJson = returnVisitRes.json as {
    isNewPatient: boolean;
    patient: { id: string; uhid: string; age: number };
  };
  assert.equal(returnJson.isNewPatient, false);
  assert.equal(returnJson.patient.uhid, abhinavUhid);
  assert.equal(returnJson.patient.age, 31);

  // Confirm main Patient profile reflects updated age = 31 and Abhinav is now at the top of search
  const profileCheck = await hospAdminA.req(`/api/hospital/patients/${abhinavId}`);
  assert.equal(profileCheck.status, 200);
  assert.equal((profileCheck.json as { patient: { age: number } }).patient.age, 31);

  const searchAfterReturn = await hospAdminA.req("/api/hospital/patients?q=abhi&limit=10");
  const listAfter = (searchAfterReturn.json as { patients: Array<{ id: string }> }).patients;
  assert.equal(listAfter[0]?.id, abhinavId);

  // Download individual patient complete audit PDF (contains OP, IP, Pharmacy, Lab, Receipts)
  const patientPdfRes = await fetch(
    `${BASE}/api/hospital/patients/${encodeURIComponent(abhinavId)}/export-pdf?tzOffset=-330`,
    { headers: { cookie: hospAdminA.cookieHeader } }
  );
  assert.equal(patientPdfRes.status, 200);
  assert.equal(patientPdfRes.headers.get("content-type"), "application/pdf");
  const patientPdfBuf = Buffer.from(await patientPdfRes.arrayBuffer());
  assert.equal(patientPdfBuf.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok(patientPdfBuf.byteLength > 2000);

  // Decode PDF FlateDecode streams (handling PDFKit hex TJ/Tj operators) to verify all 5 audit sections + updated age
  const patientPdfLatin1 = patientPdfBuf.toString("latin1");
  const patientStreamChunks: string[] = [];
  const patientPdfStreamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let patientPdfMatch: RegExpExecArray | null;
  while ((patientPdfMatch = patientPdfStreamRegex.exec(patientPdfLatin1)) !== null) {
    const rawStream = Buffer.from(patientPdfMatch[1], "latin1");
    try {
      const inflated = zlib.inflateSync(rawStream).toString("latin1");
      const collapsed = inflated
        .replace(/\[([^\]]+)\]\s*TJ/g, (_, inner: string) =>
          Array.from(inner.matchAll(/<([0-9a-fA-F]+)>/g))
            .map((m) => Buffer.from(m[1], "hex").toString("latin1"))
            .join("")
            .replace(/\s+/g, "")
        )
        .replace(/<([0-9a-fA-F]+)>\s*Tj/g, (_, hex: string) =>
          Buffer.from(hex, "hex").toString("latin1").replace(/\s+/g, "")
        );
      patientStreamChunks.push(collapsed);
    } catch {
      patientStreamChunks.push(rawStream.toString("latin1"));
    }
  }
  const patientPdfDecodedText = patientStreamChunks.join("\n");
  assert.ok(patientPdfDecodedText.includes("AbhinavReddy"));
  assert.ok(patientPdfDecodedText.includes("31yrs"));
  assert.ok(patientPdfDecodedText.includes("SECTION1:OPAPPOINTMENTS"));
  assert.ok(patientPdfDecodedText.includes("SECTION2:IPMANAGEMENT"));
  assert.ok(patientPdfDecodedText.includes("SECTION3:PHARMACYREFERRALS"));
  assert.ok(patientPdfDecodedText.includes("SECTION4:LABORATORYREFERRALS"));
  assert.ok(patientPdfDecodedText.includes("SECTION5:INDIVIDUALPATIENTCHARGES"));

  // Cross-tenant isolation: Active Hospital B admin cannot download Hospital A's patient audit PDF
  const hospBRelogin = await hospAdminB.req("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      username: "cdhl_admin",
      password: "AdminPassword!2",
      portalRole: "HOSPITAL_ADMIN",
    }),
  });
  assert.equal(hospBRelogin.status, 200);
  const crossTenantPdfRes = await fetch(
    `${BASE}/api/hospital/patients/${encodeURIComponent(abhinavId)}/export-pdf`,
    { headers: { cookie: hospAdminB.cookieHeader } }
  );
  assert.equal(crossTenantPdfRes.status, 404);
  console.log("✓ Step 17: Duplicate patient guard, returning-patient age auto-update, latest-to-oldest search & individual patient 5-section audit PDF export verified");

  // 18. Pharmacy Mode Toggle (REFERRALS vs MANAGEMENT), Role Matrix, Full POS, FEFO, Stock Edit, PDF Report & Analytics (Zero Profit)
  // Hospital A is in REFERRALS mode -> /api/pharmacy-mgmt/* MUST return 403 PHARMACY_MANAGEMENT_DISABLED
  const refModeBlocked = await hospAdminA.req("/api/pharmacy-mgmt/medicines");
  assert.equal(refModeBlocked.status, 403);
  assert.equal(
    (refModeBlocked.json as { code: string }).code,
    "PHARMACY_MANAGEMENT_DISABLED"
  );

  // Provision Hospital C with pharmacyMode: "MANAGEMENT"
  const createHospC = await superAdmin.req("/api/super-admin/hospitals", {
    method: "POST",
    body: JSON.stringify({
      name: "Apex MedCare Hospital",
      code: "APEX",
      paidMonths: 6,
      initialPaymentAmount: 30000,
      pharmacyMode: "MANAGEMENT",
      adminFullName: "Dr. Ananya Menon",
      adminUsername: "apex_admin",
      adminPassword: "ApexPassword!1",
    }),
  });
  assert.equal(createHospC.status, 201);
  const hospCId = (createHospC.json as { hospital: { id: string; pharmacyMode: string } })
    .hospital.id;
  assert.equal(
    (createHospC.json as { hospital: { pharmacyMode: string } }).hospital.pharmacyMode,
    "MANAGEMENT"
  );

  const hospAdminC = new CookieClient();
  assert.equal(
    (
      await hospAdminC.req("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: "apex_admin",
          password: "ApexPassword!1",
          portalRole: "HOSPITAL_ADMIN",
        }),
      })
    ).status,
    200
  );

  // Create Doctor (with qualification), Receptionist, and Pharmacy Owner in Hospital C
  const apexDocRes = await hospAdminC.req("/api/hospital/doctors", {
    method: "POST",
    body: JSON.stringify({
      name: "Dr. Vikram Rao",
      specialty: "Internal Medicine",
      qualification: "MBBS, MD",
      consultationFee: 500,
    }),
  });
  assert.equal(apexDocRes.status, 201);
  const apexDoctorId = (apexDocRes.json as { doctor: { id: string } }).doctor.id;

  const apexRecepCreate = await hospAdminC.req("/api/hospital/staff", {
    method: "POST",
    body: JSON.stringify({
      fullName: "Apex Front Desk",
      username: "apex_recep",
      password: "ApexRecep!1",
      role: "RECEPTIONIST",
      phone: "9849000111",
    }),
  });
  assert.equal(apexRecepCreate.status, 201);

  const apexPharmCreate = await hospAdminC.req("/api/hospital/pharmacies", {
    method: "POST",
    body: JSON.stringify({
      organizationName: "Apex Central Pharmacy",
      contactPerson: "Suresh Nair",
      phone: "9849000222",
      username: "apex_pharmacy",
      password: "ApexPharm!1",
    }),
  });
  assert.equal(apexPharmCreate.status, 201);

  // Receptionist in MANAGEMENT hospital MUST NOT access /api/pharmacy-mgmt/* (403)
  const apexRecep = new CookieClient();
  assert.equal(
    (
      await apexRecep.req("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: "apex_recep",
          password: "ApexRecep!1",
          portalRole: "RECEPTIONIST",
        }),
      })
    ).status,
    200
  );
  assert.equal((await apexRecep.req("/api/pharmacy-mgmt/bootstrap")).status, 403);
  assert.equal((await apexRecep.req("/api/pharmacy-mgmt/medicines")).status, 403);

  // Pharmacy Owner logs in -> gets full Pharmacy Management bootstrap with Admin's doctors
  const apexPharm = new CookieClient();
  assert.equal(
    (
      await apexPharm.req("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: "apex_pharmacy",
          password: "ApexPharm!1",
          portalRole: "PHARMACY_USER",
        }),
      })
    ).status,
    200
  );
  const pharmBoot = await apexPharm.req("/api/pharmacy-mgmt/bootstrap");
  assert.equal(pharmBoot.status, 200);
  const pharmBootJson = pharmBoot.json as {
    hospital: { pharmacyMode: string };
    doctors: Array<{ id: string; name: string }>;
  };
  assert.equal(pharmBootJson.hospital.pharmacyMode, "MANAGEMENT");
  assert.equal(pharmBootJson.doctors.some((d) => d.id === apexDoctorId), true);

  // Admin ALSO has access to /api/pharmacy-mgmt/bootstrap
  assert.equal((await hospAdminC.req("/api/pharmacy-mgmt/bootstrap")).status, 200);

  // Add Medicine (Amoxicillin 500mg, Sheets 10/sh, ₹4.5/u = ₹45/sh, GST 12%, Rx=true, Placement Rack A-2) with 3 batches (late, early, expired)
  const addLate = await apexPharm.req("/api/pharmacy-mgmt/medicines", {
    method: "POST",
    body: JSON.stringify({
      name: "Amoxicillin 500mg",
      packagingType: "SHEET",
      unitsPerSheet: 10,
      minStock: 15,
      unitSellingPrice: 4.5,
      sheetSellingPrice: 45,
      hsnCode: "300410",
      gstPercent: 12,
      prescriptionRequired: true,
      placement: "Rack A-2",
      sheetsCount: 2,
      singleUnitsCount: 5,
      batchNumber: "AMX-LATE",
      expiryMonth: 12,
      expiryYear: 2028,
    }),
  });
  assert.equal(addLate.status, 201);
  const amxId = (addLate.json as { medicine: { id: string } }).medicine.id;

  const addEarly = await apexPharm.req("/api/pharmacy-mgmt/medicines", {
    method: "POST",
    body: JSON.stringify({
      medicineId: amxId,
      name: "Amoxicillin 500mg",
      packagingType: "SHEET",
      unitsPerSheet: 10,
      minStock: 15,
      unitSellingPrice: 4.5,
      sheetSellingPrice: 45,
      hsnCode: "300410",
      gstPercent: 12,
      prescriptionRequired: true,
      placement: "Rack A-2",
      sheetsCount: 1,
      singleUnitsCount: 0,
      batchNumber: "AMX-EARLY",
      expiryMonth: 5,
      expiryYear: 2027,
    }),
  });
  assert.equal(addEarly.status, 201);
  const earlyBatchId = (addEarly.json as { batch: { id: string } }).batch.id;

  const addExpired = await apexPharm.req("/api/pharmacy-mgmt/medicines", {
    method: "POST",
    body: JSON.stringify({
      medicineId: amxId,
      name: "Amoxicillin 500mg",
      packagingType: "SHEET",
      unitsPerSheet: 10,
      minStock: 15,
      unitSellingPrice: 4.5,
      sheetSellingPrice: 45,
      hsnCode: "300410",
      gstPercent: 12,
      prescriptionRequired: true,
      placement: "Rack A-2",
      sheetsCount: 0,
      singleUnitsCount: 4,
      batchNumber: "AMX-EXP",
      expiryMonth: 1,
      expiryYear: 2024,
    }),
  });
  assert.equal(addExpired.status, 201);
  const expiredBatchId = (addExpired.json as { batch: { id: string } }).batch.id;

  // Verify FEFO ordering & direct batch search
  const listMeds = await apexPharm.req("/api/pharmacy-mgmt/medicines?batchQ=AMX-EARLY");
  assert.equal(listMeds.status, 200);
  const listMedsJson = listMeds.json as {
    medicines: Array<{
      id: string;
      validUnits: number;
      totalUnits: number;
      hasExpired: boolean;
      batches: Array<{ id: string; batchNumber: string; isExpired: boolean }>;
    }>;
    matchingBatches: Array<{ batch: { batchNumber: string } }>;
  };
  const amx = listMedsJson.medicines.find((m) => m.id === amxId)!;
  assert.equal(amx.validUnits, 35);
  assert.equal(amx.totalUnits, 39);
  assert.equal(amx.hasExpired, true);
  assert.deepEqual(
    amx.batches.map((b) => b.batchNumber),
    ["AMX-EXP", "AMX-EARLY", "AMX-LATE"]
  );
  assert.equal(listMedsJson.matchingBatches[0]?.batch.batchNumber, "AMX-EARLY");

  // Hospital Admin edits medicine placement & early batch quantity/expiry in Stock Management
  const patchMed = await hospAdminC.req(`/api/pharmacy-mgmt/medicines/${amxId}`, {
    method: "PATCH",
    body: JSON.stringify({
      name: "Amoxicillin 500mg",
      packagingType: "SHEET",
      unitsPerSheet: 10,
      minStock: 15,
      unitSellingPrice: 4.5,
      sheetSellingPrice: 45,
      hsnCode: "300410",
      gstPercent: 12,
      prescriptionRequired: true,
      placement: "Rack B-1",
      batches: [
        {
          id: earlyBatchId,
          batchNumber: "AMX-EARLY",
          expiryMonth: 6,
          expiryYear: 2027,
          quantityUnits: 12,
        },
      ],
    }),
  });
  assert.equal(patchMed.status, 200);

  // Expired batch sale MUST fail with 400 BATCH_EXPIRED
  const expiredSaleAttempt = await apexPharm.req("/api/pharmacy-mgmt/sales", {
    method: "POST",
    body: JSON.stringify({
      patientName: "Sita Devi",
      patientPhone: "9849012345",
      doctorId: apexDoctorId,
      doctorName: "Dr. Vikram Rao",
      paymentMode: "CASH",
      items: [{ medicineId: amxId, batchId: expiredBatchId, sellMode: "UNIT", quantity: 1 }],
    }),
  });
  assert.equal(expiredSaleAttempt.status, 400);
  assert.equal((expiredSaleAttempt.json as { code: string }).code, "BATCH_EXPIRED");

  // Oversell MUST fail with 409 INSUFFICIENT_STOCK (2 sheets = 20 units > 12 in AMX-EARLY)
  const oversellAttempt = await apexPharm.req("/api/pharmacy-mgmt/sales", {
    method: "POST",
    body: JSON.stringify({
      patientName: "Sita Devi",
      patientPhone: "9849012345",
      doctorId: apexDoctorId,
      doctorName: "Dr. Vikram Rao",
      paymentMode: "CASH",
      items: [{ medicineId: amxId, batchId: earlyBatchId, sellMode: "SHEET", quantity: 2 }],
    }),
  });
  assert.equal(oversellAttempt.status, 409);
  assert.equal((oversellAttempt.json as { code: string }).code, "INSUFFICIENT_STOCK");

  // Valid sale: 1 sheet (10 units) of AMX-EARLY -> Subtotal 45, GST 0 (GST 12% mentioned on invoice only, not added), Total 45
  const validSaleRes = await apexPharm.req("/api/pharmacy-mgmt/sales", {
    method: "POST",
    body: JSON.stringify({
      patientName: "Sita Devi",
      patientPhone: "9849012345",
      doctorId: apexDoctorId,
      doctorName: "Dr. Vikram Rao",
      paymentMode: "UPI",
      items: [{ medicineId: amxId, batchId: earlyBatchId, sellMode: "SHEET", quantity: 1 }],
    }),
  });
  assert.equal(validSaleRes.status, 201);
  const createdSale = (
    validSaleRes.json as {
      sale: {
        id: string;
        saleNumber: string;
        subtotal: number;
        gstAmount: number;
        totalAmount: number;
        totalUnitsSold: number;
      };
    }
  ).sale;
  assert.match(createdSale.saleNumber, /^\d{8,10}$/);
  assert.equal(createdSale.subtotal, 45);
  assert.equal(createdSale.gstAmount, 0);
  assert.equal(createdSale.totalAmount, 45);
  assert.equal(createdSale.totalUnitsSold, 10);

  // Confirm atomic stock deduction on AMX-EARLY (12 -> 2 units)
  const afterSaleMed = (await apexPharm.req(`/api/pharmacy-mgmt/medicines/${amxId}`))
    .json as { medicine: { batches: Array<{ id: string; quantityUnits: number }> } };
  assert.equal(
    afterSaleMed.medicine.batches.find((b) => b.id === earlyBatchId)?.quantityUnits,
    2
  );

  // Paginated Transaction History (100/page) & search by mobile
  const historyRes = await apexPharm.req(
    "/api/pharmacy-mgmt/sales?page=1&limit=100&q=9849012345"
  );
  assert.equal(historyRes.status, 200);
  const historyJson = historyRes.json as {
    sales: Array<{ id: string }>;
    pagination: { pageSize: number; total: number };
  };
  assert.equal(historyJson.pagination.pageSize, 100);
  assert.equal(historyJson.sales.some((s) => s.id === createdSale.id), true);

  // Download Entire Sales Report PDF (200 application/pdf, valid %PDF-, zero "profit" text)
  const salesPdfRes = await fetch(
    `${BASE}/api/pharmacy-mgmt/sales/export-pdf?tzOffset=-330`,
    { headers: { cookie: apexPharm.cookieHeader } }
  );
  assert.equal(salesPdfRes.status, 200);
  assert.equal(salesPdfRes.headers.get("content-type"), "application/pdf");
  const salesPdfBuf = Buffer.from(await salesPdfRes.arrayBuffer());
  assert.equal(salesPdfBuf.subarray(0, 5).toString("ascii"), "%PDF-");
  const salesPdfLatin1 = salesPdfBuf.toString("latin1");
  const salesPdfTextChunks: string[] = [];
  const salesPdfRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let salesPdfMatch: RegExpExecArray | null;
  while ((salesPdfMatch = salesPdfRegex.exec(salesPdfLatin1)) !== null) {
    const rawStream = Buffer.from(salesPdfMatch[1], "latin1");
    try {
      const inflated = zlib.inflateSync(rawStream).toString("latin1");
      const collapsed = inflated
        .replace(/\[([^\]]+)\]\s*TJ/g, (_, inner: string) =>
          Array.from(inner.matchAll(/<([0-9a-fA-F]+)>/g))
            .map((m) => Buffer.from(m[1], "hex").toString("latin1"))
            .join("")
            .replace(/\s+/g, "")
        )
        .replace(/<([0-9a-fA-F]+)>\s*Tj/g, (_, hex: string) =>
          Buffer.from(hex, "hex").toString("latin1").replace(/\s+/g, "")
        );
      salesPdfTextChunks.push(collapsed);
    } catch {
      salesPdfTextChunks.push(rawStream.toString("latin1"));
    }
  }
  const salesPdfDecoded = salesPdfTextChunks.join("\n");
  assert.ok(salesPdfDecoded.includes("SitaDevi"));
  assert.equal(salesPdfDecoded.toLowerCase().includes("profit"), false);

  // Analytics API: gross value sold, units sold, units bought — strictly ZERO profit fields!
  const analyticsRes = await apexPharm.req("/api/pharmacy-mgmt/analytics");
  assert.equal(analyticsRes.status, 200);
  assert.equal(analyticsRes.text.toLowerCase().includes("profit"), false);
  const analyticsJson = analyticsRes.json as {
    kpis: {
      totalGrossValueSold: number;
      totalMedicinesSoldUnits: number;
      totalMedicinesBoughtUnits: number;
    };
  };
  assert.equal(analyticsJson.kpis.totalGrossValueSold, 45);
  assert.equal(analyticsJson.kpis.totalMedicinesSoldUnits, 10);
  assert.ok(analyticsJson.kpis.totalMedicinesBoughtUnits >= 39);

  // Delete medicine profile cleanly while historical sale receipt remains 100% intact (including GST % invoice mention)
  const delMedRes = await hospAdminC.req(`/api/pharmacy-mgmt/medicines/${amxId}`, {
    method: "DELETE",
  });
  assert.equal(delMedRes.status, 200);
  const receiptAfterDel = await apexPharm.req(
    `/api/pharmacy-mgmt/sales/${createdSale.id}`
  );
  assert.equal(receiptAfterDel.status, 200);
  const receiptAfterDelSale = (
    receiptAfterDel.json as {
      sale: {
        items: Array<{ medicineNameSnapshot: string; gstPercentSnapshot: number }>;
      };
    }
  ).sale;
  assert.equal(receiptAfterDelSale.items[0]?.medicineNameSnapshot, "Amoxicillin 500mg");
  assert.equal(receiptAfterDelSale.items[0]?.gstPercentSnapshot, 12);

  // Verify Hospital C backup export + validation preserves pharmacyMode & pharmacySales cleanly
  const hospCBackupRes = await superAdmin.req(
    `/api/super-admin/backup/export?hospitalId=${encodeURIComponent(hospCId)}`
  );
  assert.equal(hospCBackupRes.status, 200);
  const hospCValRes = await superAdmin.req("/api/super-admin/backup/validate", {
    method: "POST",
    body: JSON.stringify({ backup: hospCBackupRes.json }),
  });
  assert.equal((hospCValRes.json as { valid: boolean }).valid, true);
  assert.equal((hospCValRes.json as { checksumValid: boolean }).checksumValid, true);

  // Verify Pharmacy Doctor Qualification snapshot on receipt, Hospital Patient auto-lookup, Bill Scan Quota & IP Stay Payment Modes/Extensions/Analytics
  assert.equal(
    (
      receiptAfterDel.json as {
        sale: { doctorQualificationSnapshot: string | null };
      }
    ).sale.doctorQualificationSnapshot,
    "MBBS, MD"
  );

  // Register a patient via Hospital C Admin OP -> verify Pharmacy Management auto-fetches mobile & recent doctor!
  const apexPtRes = await hospAdminC.req("/api/hospital/patients", {
    method: "POST",
    body: JSON.stringify({
      fullName: "Kiran Verma",
      age: 42,
      gender: "MALE",
      phone: "9849112233",
      doctorId: apexDoctorId,
      consultationFee: 500,
      paymentMode: "CASH",
    }),
  });
  assert.equal(apexPtRes.status, 201);
  const apexPtId = (apexPtRes.json as { patient: { id: string } }).patient.id;

  const pharmPtLookup = await apexPharm.req("/api/pharmacy-mgmt/patients?q=Kiran");
  assert.equal(pharmPtLookup.status, 200);
  const lookedUpPt = (
    pharmPtLookup.json as {
      patients: Array<{
        id: string;
        phone: string;
        recentDoctorId: string | null;
        recentDoctorQualification: string | null;
      }>;
    }
  ).patients.find((p) => p.id === apexPtId);
  assert.ok(lookedUpPt);
  assert.equal(lookedUpPt!.phone, "9849112233");
  assert.equal(lookedUpPt!.recentDoctorId, apexDoctorId);
  assert.equal(lookedUpPt!.recentDoctorQualification, "MBBS, MD");

  // Bill scan quota check (4 requests/month limit) & Super Admin Gemini 3.8 Flash Settings
  const scanQuotaRes = await apexPharm.req("/api/pharmacy-mgmt/bill-scans");
  assert.equal(scanQuotaRes.status, 200);
  const scanQuotaJson = scanQuotaRes.json as {
    quota: { limit: number; used: number; remaining: number; isConfigured: boolean };
  };
  assert.equal(scanQuotaJson.quota.limit, 4);
  assert.equal(scanQuotaJson.quota.remaining, 4);

  // Non-Super-Admin MUST get 403 on /api/super-admin/ai-settings
  assert.equal((await hospAdminC.req("/api/super-admin/ai-settings")).status, 403);
  assert.equal((await apexPharm.req("/api/super-admin/ai-settings")).status, 403);

  // Super Admin saves Gemini 3.8 Flash API key -> encrypted in DB, only masked key returned, immediately active platform-wide!
  const testGeminiKey = "AIzaSyDemoSuperAdminPlatformKey7788";
  const saveAiRes = await superAdmin.req("/api/super-admin/ai-settings", {
    method: "PUT",
    body: JSON.stringify({
      apiKey: testGeminiKey,
      model: "gemini-3.8-flash",
    }),
  });
  assert.equal(saveAiRes.status, 200);
  assert.equal(saveAiRes.text.includes(testGeminiKey), false);
  const saveAiJson = saveAiRes.json as {
    configured: boolean;
    maskedKey: string;
    model: string;
  };
  assert.equal(saveAiJson.configured, true);
  assert.equal(saveAiJson.maskedKey, "AIza••••••••7788");
  assert.equal(saveAiJson.model, "gemini-3.8-flash");

  // Pharmacy bill scan endpoint immediately sees configured === true platform-wide without server restart!
  const scanQuotaAfterKey = await apexPharm.req("/api/pharmacy-mgmt/bill-scans");
  assert.equal(
    (scanQuotaAfterKey.json as { quota: { isConfigured: boolean } }).quota.isConfigured,
    true
  );

  // Backup export MUST NEVER contain the plaintext Gemini API key
  const postKeyBackup = await superAdmin.req("/api/super-admin/backup/export");
  assert.equal(postKeyBackup.status, 200);
  assert.equal(postKeyBackup.text.includes(testGeminiKey), false);

  // IP Bed Admission with Payment Mode (UPI) + Stay Duration (1 day default) + Stay Extension (CARD + amount + reason) + Admin Analytics Payment Breakdown
  const apexBedRes = await hospAdminC.req("/api/hospital/beds", {
    method: "POST",
    body: JSON.stringify({
      bedNumber: "APX-101",
      ward: "Private Room 1",
      category: "Private",
      status: "AVAILABLE",
    }),
  });
  assert.equal(apexBedRes.status, 201);
  const apexBedId = (apexBedRes.json as { bed: { id: string } }).bed.id;

  // Admit Kiran Verma 30 hours ago for 1 day via UPI (₹2000) -> immediately overdue!
  const thirtyHoursAgo = new Date(Date.now() - 30 * 3_600_000).toISOString();
  const apexAdmRes = await hospAdminC.req("/api/hospital/admissions", {
    method: "POST",
    body: JSON.stringify({
      patientId: apexPtId,
      bedId: apexBedId,
      doctorId: apexDoctorId,
      admittedAt: thirtyHoursAgo,
      stayDays: 1,
      chargeAmount: 2000,
      paymentMode: "UPI",
    }),
  });
  assert.equal(apexAdmRes.status, 201);
  const apexAdmId = (apexAdmRes.json as { admission: { id: string } }).admission.id;

  const admListBeforeExt = await hospAdminC.req("/api/hospital/admissions");
  const admRowBefore = (
    admListBeforeExt.json as {
      admissions: Array<{ id: string; isStayOverdue: boolean; stayDays: number }>;
    }
  ).admissions.find((a) => a.id === apexAdmId)!;
  assert.equal(admRowBefore.stayDays, 1);
  assert.equal(admRowBefore.isStayOverdue, true);

  // Extend stay by +2 days collecting ₹3000 via CARD with mandatory reason
  const extRes = await hospAdminC.req(`/api/hospital/admissions/${apexAdmId}/extend`, {
    method: "POST",
    body: JSON.stringify({
      additionalDays: 2,
      amountCollected: 3000,
      paymentMode: "CARD",
      reason: "Extended recovery monitoring",
    }),
  });
  assert.equal(extRes.status, 201);

  const admListAfterExt = await hospAdminC.req("/api/hospital/admissions");
  const admRowAfter = (
    admListAfterExt.json as {
      admissions: Array<{
        id: string;
        isStayOverdue: boolean;
        stayDays: number;
        chargeAmount: number;
        stayExtensions: Array<{ reason: string; paymentMode: string }>;
      }>;
    }
  ).admissions.find((a) => a.id === apexAdmId)!;
  assert.equal(admRowAfter.stayDays, 3);
  assert.equal(admRowAfter.isStayOverdue, false);
  assert.equal(admRowAfter.chargeAmount, 5000);
  assert.equal(admRowAfter.stayExtensions[0]?.paymentMode, "CARD");
  assert.equal(admRowAfter.stayExtensions[0]?.reason, "Extended recovery monitoring");

  // Verify Admin Reports & Analytics accurately separates CASH (₹500 OP), UPI (₹2000 IP + ₹45 Pharmacy), CARD (₹3000 IP Extension)
  const apexReportRes = await hospAdminC.req("/api/hospital/reports");
  assert.equal(apexReportRes.status, 200);
  const apexReport = apexReportRes.json as {
    pharmacyMode: string;
    pharmacyGrossAmount: number;
    pharmacySalesCount: number;
    totalGrossAmount: number;
    paymentBreakdown: {
      CASH: { op: number; ip: number; pharmacy: number; total: number };
      UPI: { op: number; ip: number; pharmacy: number; total: number };
      CARD: { op: number; ip: number; pharmacy: number; total: number };
    };
  };
  assert.equal(apexReport.pharmacyMode, "MANAGEMENT");
  assert.equal(apexReport.pharmacyGrossAmount, 45);
  assert.equal(apexReport.pharmacySalesCount, 1);
  assert.equal(apexReport.paymentBreakdown.CASH.total, 500);
  assert.equal(apexReport.paymentBreakdown.UPI.ip, 2000);
  assert.equal(apexReport.paymentBreakdown.UPI.pharmacy, 45);
  assert.equal(apexReport.paymentBreakdown.UPI.total, 2045);
  assert.equal(apexReport.paymentBreakdown.CARD.total, 3000);
  assert.equal(apexReport.totalGrossAmount, 5545);

  // Verify Pharmacy Mode Switching purges previous segment data & enforces strict Receptionist access!
  // 1) Switch Hospital C from MANAGEMENT -> REFERRALS: old pharmacy management sales/stock logs are deleted & Receptionist gains Pharmacy Referrals access
  const switchToRef = await superAdmin.req(`/api/super-admin/hospitals/${hospCId}`, {
    method: "PATCH",
    body: JSON.stringify({ pharmacyMode: "REFERRALS" }),
  });
  assert.equal(switchToRef.status, 200);
  assert.equal(
    (switchToRef.json as { hospital: { pharmacyMode: string } }).hospital.pharmacyMode,
    "REFERRALS"
  );
  // Pharmacy Management endpoints are now blocked (403)
  assert.equal((await apexPharm.req("/api/pharmacy-mgmt/bootstrap")).status, 403);
  // Admin Report immediately drops Pharmacy Management gross amount to 0
  const apexReportAfterRef = (await hospAdminC.req("/api/hospital/reports")).json as {
    pharmacyMode: string;
    pharmacyGrossAmount: number;
    totalGrossAmount: number;
  };
  assert.equal(apexReportAfterRef.pharmacyMode, "REFERRALS");
  assert.equal(apexReportAfterRef.pharmacyGrossAmount, 0);
  assert.equal(apexReportAfterRef.totalGrossAmount, 5500);

  // Receptionist can now create/read Pharmacy Referrals catalog items while in REFERRALS mode
  const addRefCatalog = await hospAdminC.req("/api/hospital/medicines", {
    method: "POST",
    body: JSON.stringify({
      name: "Dolo 650 Referral",
      category: "Fever",
      defaultDosage: "1-0-1",
    }),
  });
  assert.equal(addRefCatalog.status, 201);
  assert.equal((await apexRecep.req("/api/hospital/pharmacy-referrals")).status, 200);

  // 2) Switch Hospital C back from REFERRALS -> MANAGEMENT: old referral catalog is deleted, old management sales stay purged (0), Receptionist blocked again!
  const switchBackToMgmt = await superAdmin.req(`/api/super-admin/hospitals/${hospCId}`, {
    method: "PATCH",
    body: JSON.stringify({ pharmacyMode: "MANAGEMENT" }),
  });
  assert.equal(switchBackToMgmt.status, 200);
  // Old Pharmacy Management sales were purged on the first switch
  const salesAfterReEnable = (await apexPharm.req("/api/pharmacy-mgmt/sales")).json as {
    sales: unknown[];
  };
  assert.equal(salesAfterReEnable.sales.length, 0);
  // Old Referral medicine catalog was purged on the second switch
  const refCatalogAfterSwitch = (await hospAdminC.req("/api/hospital/medicines")).json as {
    medicines: unknown[];
  };
  assert.equal(refCatalogAfterSwitch.medicines.length, 0);
  // Receptionist is strictly blocked from Pharmacy Management again
  assert.equal((await apexRecep.req("/api/pharmacy-mgmt/bootstrap")).status, 403);

  console.log("✓ Step 18: Pharmacy Mode toggle + mode-switch data purge, FEFO POS (GST % invoice-only), patient auto-lookup, doctor qualification receipt, bill scan quota, IP payment modes, overdue stay alert, stay extensions & Cash/UPI/Card + Pharmacy analytics verified");

  // 19. Doctor Portal, Today-Only Consultancy (Management & Referrals modes), Auto-Catalog Creation, Pharmacy Prescriptions Queue & Strict RBAC
  // Create Doctor with Doctor Portal username + password in Hospital C (MANAGEMENT mode)
  const docWithLoginRes = await hospAdminC.req("/api/hospital/doctors", {
    method: "POST",
    body: JSON.stringify({
      name: "Dr. Meera Iyer",
      specialty: "Pediatrics",
      qualification: "MBBS, DCH",
      phone: "9849555666",
      consultationFee: 400,
      username: "dr_meera_apex",
      password: "DoctorPassword!1",
    }),
  });
  assert.equal(docWithLoginRes.status, 201);
  const meeraDoc = (
    docWithLoginRes.json as {
      doctor: { id: string; user: { username: string } | null };
    }
  ).doctor;
  assert.equal(meeraDoc.user?.username, "dr_meera_apex");

  // Create a Lab Partner in Hospital C so Doctor can refer lab tests
  const apexLabCreate = await hospAdminC.req("/api/hospital/labs", {
    method: "POST",
    body: JSON.stringify({
      organizationName: "Apex Diagnostics",
      contactPerson: "Ramesh Lab",
      phone: "9849000333",
      username: "apex_lab",
      password: "ApexLabPassword!1",
    }),
  });
  assert.equal(apexLabCreate.status, 201);
  const apexLabId = (apexLabCreate.json as { lab: { id: string } }).lab.id;

  // Add a fresh medicine with 2 batches (earlier & later expiry) to Apex Pharmacy stock
  const addParaRes = await apexPharm.req("/api/pharmacy-mgmt/medicines", {
    method: "POST",
    body: JSON.stringify({
      name: "Paracetamol 500mg",
      packagingType: "SHEET",
      unitsPerSheet: 10,
      minStock: 25,
      unitSellingPrice: 2,
      sheetSellingPrice: 20,
      gstPercent: 5,
      prescriptionRequired: true,
      sheetsCount: 2,
      singleUnitsCount: 0,
      batchNumber: "PARA-EARLY",
      expiryMonth: 4,
      expiryYear: 2027,
    }),
  });
  assert.equal(addParaRes.status, 201);
  const paraMedId = (addParaRes.json as { medicine: { id: string } }).medicine.id;
  const paraEarlyBatchId = (addParaRes.json as { batch: { id: string } }).batch.id;

  // Register a patient today specifically under Dr. Meera Iyer
  const meeraPtRes = await hospAdminC.req("/api/hospital/patients", {
    method: "POST",
    body: JSON.stringify({
      fullName: "Aarav Sharma",
      age: 9,
      gender: "MALE",
      phone: "9849777888",
      doctorId: meeraDoc.id,
      consultationFee: 400,
      paymentMode: "CASH",
    }),
  });
  assert.equal(meeraPtRes.status, 201);
  const meeraVisitId = (meeraPtRes.json as { opVisit: { id: string } }).opVisit.id;

  // Doctor logs into Doctor Portal
  const drMeeraClient = new CookieClient();
  const drLogin = await drMeeraClient.req("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      username: "dr_meera_apex",
      password: "DoctorPassword!1",
      portalRole: "DOCTOR",
    }),
  });
  assert.equal(drLogin.status, 200);
  assert.equal((drLogin.json as { redirectTo: string }).redirectTo, "/doctor");

  // Strict RBAC: Doctor MUST NOT access Pharmacy Management or Admin Management/Reports; Receptionist MUST NOT access Consultancy
  assert.equal((await drMeeraClient.req("/api/pharmacy-mgmt/bootstrap")).status, 403);
  assert.equal((await drMeeraClient.req("/api/pharmacy-mgmt/medicines")).status, 403);
  assert.equal((await drMeeraClient.req("/api/pharmacy-mgmt/prescriptions")).status, 403);
  assert.equal((await drMeeraClient.req("/api/hospital/management")).status, 403);
  assert.equal((await drMeeraClient.req("/api/hospital/reports")).status, 403);
  assert.equal((await apexRecep.req("/api/consultancy/today")).status, 403);

  // Doctor sees ONLY their own today's visit (Aarav Sharma, NOT Kiran Verma assigned to Dr. Vikram)
  const drTodayRes = await drMeeraClient.req("/api/consultancy/today?tzOffset=0");
  assert.equal(drTodayRes.status, 200);
  const drTodayJson = drTodayRes.json as {
    pharmacyMode: string;
    todayVisits: Array<{ id: string; doctorId: string | null }>;
    pharmacyMedicines: Array<{ id: string; name: string; validUnits: number }>;
  };
  assert.equal(drTodayJson.pharmacyMode, "MANAGEMENT");
  assert.equal(drTodayJson.todayVisits.length, 1);
  assert.equal(drTodayJson.todayVisits[0]?.id, meeraVisitId);
  assert.equal(drTodayJson.pharmacyMedicines.some((m) => m.id === paraMedId && m.validUnits === 20), true);

  // Hospital Admin ALSO has Consultancy access and sees BOTH today's visits across doctors
  const adminTodayRes = await hospAdminC.req("/api/consultancy/today?tzOffset=0");
  assert.equal(adminTodayRes.status, 200);
  assert.ok(
    ((adminTodayRes.json as { todayVisits: unknown[] }).todayVisits).length >= 2
  );

  // Doctor prescribes 6 units of Paracetamol 500mg (no batch selection!) -> lands in Pharmacy Management Prescriptions Queue
  const drRxRes = await drMeeraClient.req("/api/consultancy/prescribe", {
    method: "POST",
    body: JSON.stringify({
      opVisitId: meeraVisitId,
      notes: "Take after meals",
      items: [
        {
          pharmacyMedicineId: paraMedId,
          medicineName: "Paracetamol 500mg",
          quantityUnits: 6,
          dosageInstructions: "1-0-1 for 3 days",
        },
      ],
    }),
  });
  assert.equal(drRxRes.status, 201);
  const createdRxId = (drRxRes.json as { prescription: { id: string } }).prescription.id;

  // Pharmacy sees pendingCount === 1 on /api/pharmacy-mgmt/prescriptions
  const pharmRxQueue = await apexPharm.req("/api/pharmacy-mgmt/prescriptions?status=PENDING");
  assert.equal(pharmRxQueue.status, 200);
  assert.equal((pharmRxQueue.json as { pendingCount: number }).pendingCount, 1);

  // Pharmacy dispenses the prescription with earliest expiry batch -> prescription automatically marked DISPENSED & counter drops to 0!
  const dispenseSale = await apexPharm.req("/api/pharmacy-mgmt/sales", {
    method: "POST",
    body: JSON.stringify({
      patientName: "Aarav Sharma",
      patientPhone: "9849777888",
      doctorId: meeraDoc.id,
      doctorName: "Dr. Meera Iyer",
      paymentMode: "CASH",
      prescriptionId: createdRxId,
      items: [
        {
          medicineId: paraMedId,
          batchId: paraEarlyBatchId,
          sellMode: "UNIT",
          quantity: 6,
        },
      ],
    }),
  });
  assert.equal(dispenseSale.status, 201);
  const pharmRxAfter = await apexPharm.req("/api/pharmacy-mgmt/prescriptions?status=PENDING");
  assert.equal((pharmRxAfter.json as { pendingCount: number }).pendingCount, 0);

  // Doctor refers a brand-new Lab Test not yet in catalog -> auto-creates in LabTestCatalog AND creates LabReferral!
  const drLabRes = await drMeeraClient.req("/api/consultancy/lab-refer", {
    method: "POST",
    body: JSON.stringify({
      opVisitId: meeraVisitId,
      labAccountId: apexLabId,
      notes: "Fasting sample preferred",
      items: [{ testName: "HbA1c Fast Screen" }],
    }),
  });
  assert.equal(drLabRes.status, 201);
  assert.deepEqual(
    (drLabRes.json as { createdCatalogNames: string[] }).createdCatalogNames,
    ["HbA1c Fast Screen"]
  );
  const apexLabCatalog = (await hospAdminC.req("/api/hospital/lab-tests")).json as {
    tests: Array<{ name: string }>;
  };
  assert.equal(
    apexLabCatalog.tests.some((t) => t.name === "HbA1c Fast Screen"),
    true
  );

  // Doctor changes password via Settings -> old password rejected, new password succeeds!
  assert.equal(
    (
      await drMeeraClient.req("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: "DoctorPassword!1",
          newPassword: "DoctorNewPass!99",
          confirmPassword: "DoctorNewPass!99",
        }),
      })
    ).status,
    200
  );
  assert.equal(
    (
      await new CookieClient().req("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: "dr_meera_apex",
          password: "DoctorPassword!1",
          portalRole: "DOCTOR",
        }),
      })
    ).status,
    401
  );
  assert.equal(
    (
      await new CookieClient().req("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: "dr_meera_apex",
          password: "DoctorNewPass!99",
          portalRole: "DOCTOR",
        }),
      })
    ).status,
    200
  );

  // Referrals-mode Consultancy auto-creates new medicine in MedicineCatalog & sends PharmacyReferral!
  const hospAVisitRes = await hospAdminA.req("/api/hospital/patients", {
    method: "POST",
    body: JSON.stringify({
      fullName: "Lakshmi Narayana",
      age: 54,
      gender: "MALE",
      phone: "9849123123",
      doctorId,
      consultationFee: 300,
      paymentMode: "CASH",
    }),
  });
  assert.equal(hospAVisitRes.status, 201);
  const hospAVisitId = (hospAVisitRes.json as { opVisit: { id: string } }).opVisit.id;
  const refConsultRx = await hospAdminA.req("/api/consultancy/prescribe", {
    method: "POST",
    body: JSON.stringify({
      opVisitId: hospAVisitId,
      pharmacyAccountId: pharmA1Id,
      items: [
        {
          medicineName: "Azithromycin 500 AutoCat",
          quantityUnits: 5,
          dosageInstructions: "1-0-0 for 5 days",
        },
      ],
    }),
  });
  assert.equal(refConsultRx.status, 201);
  assert.deepEqual(
    (refConsultRx.json as { createdCatalogNames: string[] }).createdCatalogNames,
    ["Azithromycin 500 AutoCat"]
  );

  console.log("✓ Step 19: Doctor Portal login & password change, Today-only Consultancy (Admin & Doctor), Management Prescriptions Queue -> FEFO sale auto-dispense, Referrals & Lab auto-catalog creation, and strict Doctor/Receptionist RBAC verified");

  // 20. Expired Single-Batch Deletion (preserving Medicine profile & valid batches) + Super Admin Optional Consultancy Toggle
  const addParaExpRes = await apexPharm.req("/api/pharmacy-mgmt/medicines", {
    method: "POST",
    body: JSON.stringify({
      medicineId: paraMedId,
      name: "Paracetamol 500mg",
      packagingType: "SHEET",
      unitsPerSheet: 10,
      minStock: 25,
      unitSellingPrice: 2,
      sheetSellingPrice: 20,
      gstPercent: 5,
      prescriptionRequired: true,
      sheetsCount: 0,
      singleUnitsCount: 5,
      batchNumber: "PARA-EXPIRED-DEL",
      expiryMonth: 1,
      expiryYear: 2024,
    }),
  });
  assert.equal(addParaExpRes.status, 201);
  const paraExpBatchId = (addParaExpRes.json as { batch: { id: string } }).batch.id;

  // Delete ONLY the expired batch via DELETE /api/pharmacy-mgmt/batches/[id]
  const delBatchRes = await apexPharm.req(`/api/pharmacy-mgmt/batches/${paraExpBatchId}`, {
    method: "DELETE",
  });
  assert.equal(delBatchRes.status, 200);
  assert.equal((delBatchRes.json as { unitsRemoved: number }).unitsRemoved, 5);

  // Confirm expired batch is gone while Paracetamol 500mg profile and valid PARA-EARLY batch (14 units left) remain intact!
  const paraAfterBatchDel = (
    await apexPharm.req(`/api/pharmacy-mgmt/medicines/${paraMedId}`)
  ).json as {
    medicine: { batches: Array<{ id: string; batchNumber: string; quantityUnits: number }> };
  };
  assert.equal(
    paraAfterBatchDel.medicine.batches.some((b) => b.id === paraExpBatchId),
    false
  );
  assert.equal(
    paraAfterBatchDel.medicine.batches.find((b) => b.id === paraEarlyBatchId)?.quantityUnits,
    14
  );

  // Super Admin disables Consultancy for Hospital C -> revokes Doctor session, blocks Doctor login, blocks Consultancy & Pharmacy Prescriptions!
  const disableConsult = await superAdmin.req(`/api/super-admin/hospitals/${hospCId}`, {
    method: "PATCH",
    body: JSON.stringify({ consultancyEnabled: false }),
  });
  assert.equal(disableConsult.status, 200);

  // Active Doctor session revoked immediately
  assert.equal((await drMeeraClient.req("/api/auth/me")).status, 401);
  // Fresh Doctor login rejected with 403 CONSULTANCY_DISABLED
  const blockedDrLogin = await new CookieClient().req("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      username: "dr_meera_apex",
      password: "DoctorNewPass!99",
      portalRole: "DOCTOR",
    }),
  });
  assert.equal(blockedDrLogin.status, 403);
  assert.equal((blockedDrLogin.json as { code: string }).code, "CONSULTANCY_DISABLED");
  // Hospital Admin consultancy & Pharmacy prescriptions return 403 CONSULTANCY_DISABLED
  assert.equal((await hospAdminC.req("/api/consultancy/today")).status, 403);
  assert.equal((await apexPharm.req("/api/pharmacy-mgmt/prescriptions")).status, 403);
  const bootWhenDisabled = (await apexPharm.req("/api/pharmacy-mgmt/bootstrap")).json as {
    hospital: { consultancyEnabled: boolean };
  };
  assert.equal(bootWhenDisabled.hospital.consultancyEnabled, false);

  // Super Admin re-enables Consultancy -> Doctor login & Consultancy immediately restored!
  assert.equal(
    (
      await superAdmin.req(`/api/super-admin/hospitals/${hospCId}`, {
        method: "PATCH",
        body: JSON.stringify({ consultancyEnabled: true }),
      })
    ).status,
    200
  );
  assert.equal(
    (
      await new CookieClient().req("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: "dr_meera_apex",
          password: "DoctorNewPass!99",
          portalRole: "DOCTOR",
        }),
      })
    ).status,
    200
  );

  console.log("✓ Step 20: Single expired batch deletion (preserving profile/valid batches) & Super Admin optional Consultancy toggle verified");

  // 21. Case-Insensitive Existing Batch Restock (Zero Duplicates + Editable Expiry Update) & All-Patients Timeline PDF Export
  const restockExistingBatchRes = await apexPharm.req("/api/pharmacy-mgmt/medicines", {
    method: "POST",
    body: JSON.stringify({
      medicineId: paraMedId,
      name: "Paracetamol 500mg",
      packagingType: "SHEET",
      unitsPerSheet: 10,
      minStock: 25,
      unitSellingPrice: 2,
      sheetSellingPrice: 20,
      gstPercent: 5,
      prescriptionRequired: true,
      sheetsCount: 0,
      singleUnitsCount: 3,
      batchNumber: "para-early", // lowercase variant of PARA-EARLY
      expiryMonth: 9,
      expiryYear: 2027, // edited expiry date
    }),
  });
  assert.equal(restockExistingBatchRes.status, 201);
  const paraAfterRestock = (
    await apexPharm.req(`/api/pharmacy-mgmt/medicines/${paraMedId}`)
  ).json as {
    medicine: {
      batches: Array<{
        id: string;
        batchNumber: string;
        expiryMonth: number;
        expiryYear: number;
        quantityUnits: number;
      }>;
    };
  };
  // Still only ONE batch (no duplicate created), quantity 14 + 3 = 17, expiry updated to 09/2027!
  assert.equal(paraAfterRestock.medicine.batches.length, 1);
  assert.equal(paraAfterRestock.medicine.batches[0]?.id, paraEarlyBatchId);
  assert.equal(paraAfterRestock.medicine.batches[0]?.batchNumber, "PARA-EARLY");
  assert.equal(paraAfterRestock.medicine.batches[0]?.quantityUnits, 17);
  assert.equal(paraAfterRestock.medicine.batches[0]?.expiryMonth, 9);
  assert.equal(paraAfterRestock.medicine.batches[0]?.expiryYear, 2027);

  // Download Every Patient Data PDF with Timeline Selection
  const allPtsPdfRes = await fetch(
    `${BASE}/api/hospital/patients/export-pdf?from=2020-01-01&to=2030-12-31&tzOffset=-330`,
    { headers: { cookie: hospAdminC.cookieHeader } }
  );
  assert.equal(allPtsPdfRes.status, 200);
  assert.equal(allPtsPdfRes.headers.get("content-type"), "application/pdf");
  const exportedCount = Number(allPtsPdfRes.headers.get("x-export-patients-count") ?? "0");
  assert.ok(exportedCount >= 2, `Expected >= 2 exported patients, got ${exportedCount}`);
  const allPtsBuf = Buffer.from(await allPtsPdfRes.arrayBuffer());
  assert.equal(allPtsBuf.subarray(0, 5).toString("ascii"), "%PDF-");
  const allPtsLatin = allPtsBuf.toString("latin1");
  const allPtsChunks: string[] = [];
  const allPtsRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let allPtsMatch: RegExpExecArray | null;
  while ((allPtsMatch = allPtsRegex.exec(allPtsLatin)) !== null) {
    const rawStream = Buffer.from(allPtsMatch[1], "latin1");
    try {
      const inflated = zlib.inflateSync(rawStream).toString("latin1");
      const collapsed = inflated
        .replace(/\[([^\]]+)\]\s*TJ/g, (_, inner: string) =>
          Array.from(inner.matchAll(/<([0-9a-fA-F]+)>/g))
            .map((m) => Buffer.from(m[1], "hex").toString("latin1"))
            .join("")
            .replace(/\s+/g, "")
        )
        .replace(/<([0-9a-fA-F]+)>\s*Tj/g, (_, hex: string) =>
          Buffer.from(hex, "hex").toString("latin1").replace(/\s+/g, "")
        );
      allPtsChunks.push(collapsed);
    } catch {
      allPtsChunks.push(rawStream.toString("latin1"));
    }
  }
  const allPtsDecoded = allPtsChunks.join("\n");
  assert.ok(allPtsDecoded.includes("KiranVerma"));
  assert.ok(allPtsDecoded.includes("AaravSharma"));

  console.log(`✓ Step 21: Zero-duplicate batch restock with editable expiry update & All-Patients Timeline PDF export (${exportedCount} patients, ${allPtsBuf.byteLength} bytes) verified`);

  console.log("\nALL E2E VERIFICATION ASSERTIONS PASSED SUCCESSFULLY!");
}

run().catch((err) => {
  console.error("E2E verification failed:", err);
  process.exit(1);
});
