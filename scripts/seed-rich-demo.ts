import "dotenv/config";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/security";
import {
  BED_STATUS,
  IP_STATUS,
  REFERRAL_STATUS,
  ROLES,
} from "../src/lib/constants";
import {
  MAX_PLATFORM_RECENT_ACTIVITY,
  prunePlatformAuditLogs,
} from "../src/lib/audit";

const prisma = new PrismaClient();

function uid(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(10).toString("hex")}`;
}

function pad4(n: number): string {
  return String(n).padStart(4, "0");
}

function createRng(seedInput: string) {
  let state = 0;
  for (let i = 0; i < seedInput.length; i++) {
    state = (state * 31 + seedInput.charCodeAt(i)) >>> 0;
  }
  if (state === 0) state = 1337;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

function randInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function hoursAgo(daysBack: number, hourLocal: number, minute: number): Date {
  const now = new Date();
  const d = new Date(now);
  d.setDate(d.getDate() - daysBack);
  d.setHours(hourLocal, minute, Math.floor(Math.random() * 50), 0);
  if (d.getTime() > now.getTime()) {
    return new Date(now.getTime() - randInt(() => Math.random(), 2, 180) * 60_000);
  }
  return d;
}

const FIRST_NAMES_M = [
  "Aarav",
  "Vivaan",
  "Aditya",
  "Vihaan",
  "Arjun",
  "Sai",
  "Reyansh",
  "Ayaan",
  "Krishna",
  "Ishaan",
  "Rohan",
  "Karthik",
  "Siddharth",
  "Pranav",
  "Nikhil",
  "Varun",
  "Harsha",
  "Teja",
  "Gaurav",
  "Manoj",
  "Suresh",
  "Ramesh",
  "Mahesh",
  "Venkatesh",
  "Deepak",
  "Rajesh",
  "Vikram",
  "Tarun",
  "Dev",
  "Kabir",
];

const FIRST_NAMES_F = [
  "Aadhya",
  "Ananya",
  "Diya",
  "Saanvi",
  "Pari",
  "Myra",
  "Anika",
  "Navya",
  "Kavya",
  "Riya",
  "Sneha",
  "Pooja",
  "Divya",
  "Lakshmi",
  "Priya",
  "Meera",
  "Nandini",
  "Shruti",
  "Keerthi",
  "Swathi",
  "Bhavana",
  "Harini",
  "Pavani",
  "Jyothi",
  "Padma",
  "Sunitha",
  "Geetha",
  "Revathi",
  "Vasudha",
  "Trisha",
];

const LAST_NAMES = [
  "Reddy",
  "Sharma",
  "Patel",
  "Rao",
  "Nair",
  "Kulkarni",
  "Deshmukh",
  "Iyer",
  "Menon",
  "Verma",
  "Gupta",
  "Joshi",
  "Choudhary",
  "Naidu",
  "Bhat",
  "Agarwal",
  "Mishra",
  "Kapoor",
  "Malhotra",
  "Sen",
  "Mukherjee",
  "Bose",
  "Pillai",
  "Gowda",
  "Prasad",
  "Chatterjee",
  "Singhal",
  "Bansal",
  "Nambiar",
  "Kamble",
];

const REASONS_FOR_VISIT = [
  "Persistent fever & viral workup",
  "Routine hypertension follow-up",
  "Post-operative suture evaluation",
  "Chest discomfort & ECG screening",
  "Acute knee pain & mobility review",
  "Abdominal bloating & gastritis care",
  "Migraine headaches & neurology consult",
  "Pediatric immunization & growth check",
  "Diabetes HbA1c review & diet plan",
  "Chronic cough & spirometry review",
  "Urinary tract discomfort & culture",
  "Annual preventive health evaluation",
];

const ADMISSION_DIAGNOSES = [
  "Acute febrile illness requiring IV fluid therapy and observation",
  "Uncontrolled hypertension with chest tightness for cardiac monitoring",
  "Community-acquired pneumonia requiring nebulization & IV antibiotics",
  "Post-cholecystectomy recovery and pain management",
  "Orthopaedic fracture stabilization and physiotherapy protocol",
  "Acute gastroenteritis with moderate dehydration",
  "Renal colic evaluation and ureteric stone management",
  "Acute asthma exacerbation requiring bronchodilator support",
];

const DISCHARGE_SUMMARIES = [
  "Clinically stable, afebrile for 48 hours, vitals within normal limits. Advised oral medications and 7-day OPD follow-up.",
  "Symptomatically improved after conservative management. Wound clean and dry. Follow up with discharge prescription.",
  "Hemodynamically stable, lab parameters normalized prior to discharge. Counseled on diet, hydration, and warning signs.",
  "Completed inpatient antibiotic course smoothly. Mobilizing comfortably; scheduled physiotherapy review next week.",
];

interface HospitalSeedProfile {
  code: string;
  name: string;
  slug: string;
  city: string;
  address: string;
  phone: string;
  email: string;
  tagline: string;
  registrationNo: string;
  dailyOpLimit: number;
  dailyIpLimit: number;
  patientCount: number;
  todayOpCount: number;
  todayIpCount: number;
  defaultConsultationFee: number;
  doctors: Array<{ name: string; specialty: string; qualification: string; fee: number }>;
  medicines: Array<{ name: string; desc: string; price: number }>;
  tests: Array<{ name: string; desc: string; price: number }>;
  pharmacies: Array<{ name: string; contact: string; address: string }>;
  labs: Array<{ name: string; contact: string; address: string }>;
}

const HOSPITAL_PROFILES: HospitalSeedProfile[] = [
  {
    code: "SUNRISE",
    name: "Sunrise Multispeciality Hospital",
    slug: "sunrise",
    city: "Pune",
    address: "42 Bund Garden Road, Sangamwadi, Pune 411001",
    phone: "+91 20 2612 4400",
    email: "care@sunrisehospital.in",
    tagline: "Compassionate Multispeciality & Critical Care",
    registrationNo: "MH-PUN-2024-8841",
    dailyOpLimit: 12,
    dailyIpLimit: 4,
    patientCount: 155,
    todayOpCount: 16, // Exceeds daily OP limit (12) to verify alert
    todayIpCount: 5,  // Exceeds daily IP limit (4) to verify alert
    defaultConsultationFee: 500,
    doctors: [
      { name: "Dr. Arvind Kulkarni", specialty: "Internal Medicine", qualification: "MD (Medicine)", fee: 500 },
      { name: "Dr. Sneha Deshpande", specialty: "Cardiology", qualification: "DM (Cardiology)", fee: 800 },
      { name: "Dr. Rohan Joshi", specialty: "Orthopaedics", qualification: "MS (Ortho)", fee: 650 },
      { name: "Dr. Meera Gokhale", specialty: "Pediatrics", qualification: "MD (Pediatrics)", fee: 550 },
    ],
    medicines: [
      { name: "Telma 40mg Tablet", desc: "Telmisartan antihypertensive (15s)", price: 185 },
      { name: "Ecosprin AV 75/10", desc: "Aspirin + Atorvastatin capsule (15s)", price: 96 },
      { name: "Augmentin 625 Duo", desc: "Amoxicillin + Clavulanic Acid (10s)", price: 224 },
      { name: "Pan-D Capsule", desc: "Pantoprazole + Domperidone SR (15s)", price: 198 },
      { name: "Dolo 650mg Tablet", desc: "Paracetamol antipyretic (15s)", price: 34 },
      { name: "Glycomet GP 2", desc: "Glimepiride + Metformin SR (15s)", price: 168 },
      { name: "Zerodol-SP Tablet", desc: "Aceclofenac + Serratiopeptidase (10s)", price: 122 },
      { name: "Montair LC Tablet", desc: "Montelukast + Levocetirizine (10s)", price: 215 },
      { name: "Azithral 500 Tablet", desc: "Azithromycin macrolide (5s)", price: 132 },
      { name: "Shelcal 500 Tablet", desc: "Calcium + Vitamin D3 (15s)", price: 144 },
      { name: "Budesonide Respules 0.5mg", desc: "Inhalation suspension (5x2ml)", price: 175 },
      { name: "Cilacar 10mg Tablet", desc: "Cilnidipine calcium channel blocker", price: 162 },
      { name: "Rosuvas 10 Tablet", desc: "Rosuvastatin lipid control (15s)", price: 245 },
      { name: "Neurobion Forte", desc: "Vitamin B-Complex neurotropic (30s)", price: 46 },
    ],
    tests: [
      { name: "Complete Blood Count (CBC)", desc: "Automated 5-part differential", price: 350 },
      { name: "Lipid Profile Fasting", desc: "Total Chol, HDL, LDL, TG, VLDL", price: 750 },
      { name: "HbA1c (Glycated Hemoglobin)", desc: "3-month average glycemic index", price: 550 },
      { name: "Liver Function Test (LFT)", desc: "Bilirubin, SGOT, SGPT, ALP, Protein", price: 680 },
      { name: "Kidney Function Test (KFT)", desc: "Urea, Creatinine, Uric Acid, Electrolytes", price: 720 },
      { name: "Thyroid Profile (T3, T4, TSH)", desc: "Chemiluminescence assay", price: 600 },
      { name: "12-Lead Digital ECG", desc: "Resting cardiac rhythm & ST screening", price: 300 },
      { name: "2D Echocardiography", desc: "Color Doppler cardiac ultrasound", price: 1850 },
      { name: "X-Ray Chest PA View", desc: "Digital chest radiograph", price: 450 },
      { name: "Urine Routine & Microscopy", desc: "Complete urinalysis", price: 220 },
      { name: "CRP Quantitative", desc: "High-sensitivity C-Reactive Protein", price: 480 },
      { name: "Vitamin D (25-OH)", desc: "Serum 25-hydroxy cholecalciferol", price: 1150 },
    ],
    pharmacies: [
      { name: "Sunrise MedPlus Pharmacy", contact: "Anand Phadke", address: "Ground Floor Annex, Bund Garden Rd" },
      { name: "Sangam Wellness Chemists", contact: "Priya Sathe", address: "Shop 4, Ruby Hall Lane, Pune" },
    ],
    labs: [
      { name: "Sunrise NABL Diagnostics", contact: "Dr. Kavita Patwardhan", address: "Diagnostic Wing, Pune" },
      { name: "Deccan Molecular PathLab", contact: "Suresh Chitale", address: "MG Road Camp, Pune" },
    ],
  },
  {
    code: "LOTUS",
    name: "Lotus Heart & Vascular Institute",
    slug: "lotus",
    city: "Hyderabad",
    address: "18 Road No. 12, Banjara Hills, Hyderabad 500034",
    phone: "+91 40 2338 9100",
    email: "desk@lotusheart.org",
    tagline: "Precision Cardiac, Vascular & Metabolic Care",
    registrationNo: "TS-HYD-2023-4410",
    dailyOpLimit: 10,
    dailyIpLimit: 6,
    patientCount: 148,
    todayOpCount: 13, // Exceeds OP limit (10)
    todayIpCount: 3,
    defaultConsultationFee: 750,
    doctors: [
      { name: "Dr. Srinivas Rao", specialty: "Interventional Cardiology", qualification: "MD, DM", fee: 900 },
      { name: "Dr. Padmavathi Reddy", specialty: "Cardiac Electrophysiology", qualification: "DM (Cardio)", fee: 850 },
      { name: "Dr. Harish Varma", specialty: "Vascular Surgery", qualification: "MCh (CTVS)", fee: 800 },
      { name: "Dr. Anitha Krishnan", specialty: "Diabetology", qualification: "MD (Med)", fee: 600 },
    ],
    medicines: [
      { name: "Brilinta 90mg Tablet", desc: "Ticagrelor antiplatelet (14s)", price: 460 },
      { name: "Clopilet 75mg Tablet", desc: "Clopidogrel antiplatelet (15s)", price: 118 },
      { name: "Atorva 40mg Tablet", desc: "Atorvastatin high-intensity statin", price: 295 },
      { name: "Concor 5mg Tablet", desc: "Bisoprolol beta-blocker (10s)", price: 138 },
      { name: "Dytor 10mg Tablet", desc: "Torasemide loop diuretic (15s)", price: 110 },
      { name: "Vymada 100mg Tablet", desc: "Sacubitril + Valsartan (14s)", price: 1120 },
      { name: "Jardiance 10mg Tablet", desc: "Empagliflozin SGLT2 inhibitor", price: 625 },
      { name: "Nikoran 5mg Tablet", desc: "Nicorandil anti-anginal (20s)", price: 270 },
      { name: "Aldactone 25mg Tablet", desc: "Spironolactone potassium-sparing", price: 42 },
      { name: "Eliquis 5mg Tablet", desc: "Apixaban anticoagulant (10s)", price: 780 },
      { name: "Rablet-D Capsule", desc: "Rabeprazole + Domperidone SR", price: 145 },
      { name: "Metpure XL 50", desc: "Metoprolol succinate ER (20s)", price: 175 },
      { name: "Sorbitrate 5mg", desc: "Isosorbide dinitrate sublingual", price: 48 },
      { name: "Enoxaparin 40mg PFS", desc: "Low molecular weight heparin", price: 490 },
    ],
    tests: [
      { name: "Troponin-I High Sensitivity", desc: "Quantitative acute myocardial marker", price: 1250 },
      { name: "NT-proBNP Cardiac Marker", desc: "Heart failure severity biomarker", price: 1800 },
      { name: "2D Echo + Strain Imaging", desc: "Tissue Doppler LV ejection assessment", price: 2200 },
      { name: "Treadmill Stress Test (TMT)", desc: "Bruce protocol exercise ECG", price: 1650 },
      { name: "Holter 24-Hr Rhythm Monitor", desc: "Ambulatory arrhythmia recording", price: 2600 },
      { name: "Lipid Subfraction + Lp(a)", desc: "Apolipoprotein B & Lipoprotein(a)", price: 1450 },
      { name: "D-Dimer Quantitative", desc: "Thromboembolism exclusion assay", price: 980 },
      { name: "PT / INR Coagulation", desc: "Prothrombin time standardization", price: 320 },
      { name: "Carotid Artery Doppler", desc: "Bilateral duplex carotid scan", price: 1950 },
      { name: "Renal Profile + Electrolytes", desc: "Na, K, Cl, Creatinine, eGFR", price: 680 },
      { name: "HbA1c + Fasting Insulin", desc: "Cardiometabolic insulin resistance", price: 950 },
      { name: "Chest X-Ray Digital PA", desc: "Cardiothoracic ratio assessment", price: 450 },
    ],
    pharmacies: [
      { name: "Lotus Cardiac Pharmacy", contact: "Mahesh Goud", address: "Banjara Hills Main Gate" },
      { name: "Jubilee Lifecare Chemists", contact: "Divya Sree", address: "Road No 10, Hyderabad" },
    ],
    labs: [
      { name: "Lotus Echo & Biomarker Lab", contact: "Dr. Raghu Ram", address: "Lower Concourse, Banjara Hills" },
      { name: "Vijaya Cardiac Diagnostics", contact: "Kiran Babu", address: "Somajiguda Circle, Hyderabad" },
    ],
  },
  {
    code: "EVERGREEN",
    name: "Evergreen Maternity & Child Care",
    slug: "evergreen",
    city: "Bengaluru",
    address: "105 100 Feet Road, Indiranagar, Bengaluru 560038",
    phone: "+91 80 4125 6700",
    email: "care@evergreenmaternity.in",
    tagline: "Gentle Obstetrics, Neonatology & Pediatric Wellness",
    registrationNo: "KA-BLR-2024-1192",
    dailyOpLimit: 25,
    dailyIpLimit: 3,
    patientCount: 142,
    todayOpCount: 9,
    todayIpCount: 4, // Exceeds IP limit (3)
    defaultConsultationFee: 600,
    doctors: [
      { name: "Dr. Nandini Gowda", specialty: "Obstetrics & Gynecology", qualification: "MS (OBG)", fee: 700 },
      { name: "Dr. Vivek Hegde", specialty: "Neonatology", qualification: "DM (Neonatology)", fee: 750 },
      { name: "Dr. Swathi Menon", specialty: "Pediatrics", qualification: "DNB (Pediatrics)", fee: 550 },
      { name: "Dr. Preethi Shenoy", specialty: "Fetal Medicine", qualification: "MD, Fellowship", fee: 800 },
    ],
    medicines: [
      { name: "Orofer XT Tablet", desc: "Ferrous Ascorbate + Folic Acid (10s)", price: 178 },
      { name: "Suston 200mg Capsule", desc: "Micronized Progesterone (10s)", price: 320 },
      { name: "Folvite 5mg Tablet", desc: "Folic acid maternal supplement", price: 68 },
      { name: "Calpol Pediatric Drops", desc: "Paracetamol 100mg/ml oral drops", price: 42 },
      { name: "Enterogermina Oral Suspension", desc: "Bacillus clausii probiotic vials", price: 290 },
      { name: "Ondem Syrup 30ml", desc: "Ondansetron pediatric antiemetic", price: 48 },
      { name: "Moxclav BD Syrup", desc: "Co-amoxiclav dry pediatric syrup", price: 112 },
      { name: "Duphaston 10mg Tablet", desc: "Dydrogesterone luteal support", price: 695 },
      { name: "Calcimax-P Suspension", desc: "Calcium + Phosphorus + Vit D3", price: 148 },
      { name: "Becozinc Capsules", desc: "Multivitamin + Zinc postnatal", price: 85 },
      { name: "Nasivion Mini Nasal Drops", desc: "Oxymetazoline 0.01% infant drops", price: 76 },
      { name: "T-Bact 2% Ointment", desc: "Mupirocin topical antibacterial", price: 134 },
      { name: "Pregnacare Max Tablets", desc: "Omega-3 DHA maternal prenatal", price: 540 },
      { name: "Meftal-P Suspension", desc: "Mefenamic acid antipyretic", price: 56 },
    ],
    tests: [
      { name: "Anomaly Scan (TIFFA Level II)", desc: "20-week fetal anatomy ultrasound", price: 2400 },
      { name: "Double Marker Prenatal Screen", desc: "First-trimester PAPP-A & free b-hCG", price: 2100 },
      { name: "OGTT 75g Pregnancy Glucose", desc: "DIPSI gestational diabetes screen", price: 380 },
      { name: "Beta-hCG Quantitative", desc: "Early pregnancy hormone monitoring", price: 650 },
      { name: "TORCH IgG & IgM Panel", desc: "Congenital infection serology", price: 1750 },
      { name: "Pediatric CBC + Reticulocyte", desc: "Infant anemia & infection panel", price: 420 },
      { name: "Neonatal Bilirubin Total/Direct", desc: "Newborn jaundice serum assay", price: 290 },
      { name: "TSH + Free T4 Maternal", desc: "Pregnancy thyroid screening", price: 620 },
      { name: "Blood Group & Rh Typing", desc: "ABO and Rh factor compatibility", price: 240 },
      { name: "Urine Culture & Sensitivity", desc: "Antenatal UTI microbiological culture", price: 550 },
      { name: "Growth & Doppler Ultrasound", desc: "Third-trimester fetal wellbeing scan", price: 1850 },
      { name: "Serum Ferritin & Iron Studies", desc: "Maternal iron stores assessment", price: 880 },
    ],
    pharmacies: [
      { name: "Evergreen Mom & Baby Pharmacy", contact: "Deepa Nair", address: "100 Ft Rd, Indiranagar" },
      { name: "MedSphere Indiranagar", contact: "Karthik Raj", address: "12th Main HAL 2nd Stage" },
    ],
    labs: [
      { name: "Evergreen Fetal & Diagnostics", contact: "Dr. Asha Kini", address: "Block B, Indiranagar" },
      { name: "Anand Prenatal PathLabs", contact: "Ramesh Iyer", address: "CMH Road, Bengaluru" },
    ],
  },
  {
    code: "RIVERVIEW",
    name: "Riverview Ortho & Trauma Centre",
    slug: "riverview",
    city: "Chennai",
    address: "74 Sardar Patel Road, Adyar, Chennai 600020",
    phone: "+91 44 2441 8800",
    email: "info@riverviewortho.in",
    tagline: "Joint Replacement, Sports Injury & Spine Rehab",
    registrationNo: "TN-CHN-2022-7731",
    dailyOpLimit: 35,
    dailyIpLimit: 10,
    patientCount: 138,
    todayOpCount: 8,
    todayIpCount: 2,
    defaultConsultationFee: 600,
    doctors: [
      { name: "Dr. Karthikeyan Subramanian", specialty: "Joint Replacement", qualification: "MS (Ortho)", fee: 750 },
      { name: "Dr. Deepika Natarajan", specialty: "Sports Medicine", qualification: "DNB (Ortho)", fee: 600 },
      { name: "Dr. Senthil Kumar", specialty: "Spine Surgery", qualification: "MCh (Ortho Spine)", fee: 850 },
      { name: "Dr. Gayathri Balaji", specialty: "Physical Rehab", qualification: "MD (PMR)", fee: 500 },
    ],
    medicines: [
      { name: "Nucoxia 90mg Tablet", desc: "Etoricoxib COX-2 analgesic", price: 218 },
      { name: "Myoril 4mg Capsule", desc: "Thiocolchicoside muscle relaxant", price: 195 },
      { name: "Chymoral Forte Tablet", desc: "Trypsin-Chymotrypsin anti-edema", price: 425 },
      { name: "Ultracet Semi Tablet", desc: "Tramadol + Paracetamol analgesic", price: 140 },
      { name: "Tendoactive Capsule", desc: "Collagen Type I + Mucopolysaccharide", price: 380 },
      { name: "Gemcal XT Tablet", desc: "Calcitriol + Calcium + Mecobalamin", price: 265 },
      { name: "Volini Gel 75g", desc: "Diclofenac topical nano-gel", price: 235 },
      { name: "Pregaba-M 75 Capsule", desc: "Pregabalin + Methylcobalamin", price: 245 },
      { name: "Clexane 40mg Injection", desc: "DVT prophylaxis after arthroplasty", price: 510 },
      { name: "Razo-D Capsule", desc: "Rabeprazole gastro-protection", price: 158 },
      { name: "Cefuroxime 500mg Tablet", desc: "Second-gen cephalosporin", price: 340 },
      { name: "Cartigen Duo Tablet", desc: "Glucosamine + Diacerein", price: 315 },
      { name: "Arachitol Nano 60K", desc: "Cholecalciferol oral solution", price: 98 },
      { name: "Hifenac-MR Tablet", desc: "Aceclofenac + Chlorzoxazone", price: 132 },
    ],
    tests: [
      { name: "Digital X-Ray Knee AP/Lat", desc: "Weight-bearing osteoarthritis view", price: 650 },
      { name: "MRI Lumbo-Sacral Spine", desc: "1.5T disc herniation protocol", price: 4800 },
      { name: "DEXA Bone Densitometry", desc: "Hip & spine osteoporosis T-score", price: 1900 },
      { name: "Serum Uric Acid + RA Factor", desc: "Gout & rheumatoid arthritis screen", price: 520 },
      { name: "Anti-CCP Antibody", desc: "Early rheumatoid joint marker", price: 1150 },
      { name: "HLA-B27 PCR Assay", desc: "Ankylosing spondylitis genetic test", price: 1400 },
      { name: "Digital X-Ray Cervical Spine", desc: "AP & Lateral neck radiograph", price: 580 },
      { name: "Pre-Op Surgical Profile", desc: "CBC, RBS, Creatinine, PT/INR, ECG", price: 1350 },
      { name: "Serum Vitamin B12 + D3", desc: "Neuropathy & bone mineral workup", price: 1480 },
      { name: "ESR + hsCRP Inflammatory", desc: "Acute phase joint inflammation", price: 460 },
      { name: "X-Ray Pelvis Both Hips", desc: "Trauma & AVN screening", price: 620 },
      { name: "Arterial/Venous Limb Doppler", desc: "Post-trauma DVT rule-out scan", price: 1750 },
    ],
    pharmacies: [
      { name: "Riverview Ortho Chemists", contact: "Balaji Venkat", address: "Sardar Patel Rd, Adyar" },
      { name: "Adyar Apollo Medico", contact: "Revathi Sundar", address: "Gandhi Nagar 1st Main" },
    ],
    labs: [
      { name: "Riverview Ortho Imaging & Lab", contact: "Dr. Pradeep Mani", address: "Diagnostic Block, Adyar" },
      { name: "Hitech Diagnostics Chennai", contact: "Manikandan S", address: "LB Road, Adyar" },
    ],
  },
  {
    code: "APEXMED",
    name: "ApexMed Neuro & Spine Hospital",
    slug: "apexmed",
    city: "Mumbai",
    address: "112 Linking Road, Bandra West, Mumbai 400050",
    phone: "+91 22 2640 7200",
    email: "helpdesk@apexmedneuro.com",
    tagline: "Comprehensive Stroke, Epilepsy & Neurosurgery Care",
    registrationNo: "MH-MUM-2023-5520",
    dailyOpLimit: 40,
    dailyIpLimit: 12,
    patientCount: 152,
    todayOpCount: 10,
    todayIpCount: 3,
    defaultConsultationFee: 850,
    doctors: [
      { name: "Dr. Siddharth Parekh", specialty: "Neurology", qualification: "DM (Neurology)", fee: 900 },
      { name: "Dr. Farhan Merchant", specialty: "Neurosurgery", qualification: "MCh (Neuro)", fee: 1000 },
      { name: "Dr. Ritu Khanna", specialty: "Neuro-Rehabilitation", qualification: "MD (PMR)", fee: 650 },
      { name: "Dr. Vikramaditya Sawant", specialty: "Interventional Neuroradiology", qualification: "DM", fee: 950 },
    ],
    medicines: [
      { name: "Levera 500mg Tablet", desc: "Levetiracetam anticonvulsant", price: 165 },
      { name: "Eptoin 100mg Tablet", desc: "Phenytoin sodium (100s)", price: 192 },
      { name: "Strocit Plus Tablet", desc: "Citicoline + Piracetam neuroprotective", price: 540 },
      { name: "Vertin 16mg Tablet", desc: "Betahistine vertigo control (15s)", price: 315 },
      { name: "Sibelium 10mg Tablet", desc: "Flunarizine migraine prophylaxis", price: 82 },
      { name: "Syndopa Plus Tablet", desc: "Levodopa + Carbidopa (10s)", price: 48 },
      { name: "Gabapin NT Tablet", desc: "Gabapentin + Nortriptyline (15s)", price: 345 },
      { name: "Manitol 20% IV 100ml", desc: "Osmotic cerebral decongestant", price: 118 },
      { name: "Sumitrex 50mg Tablet", desc: "Sumatriptan acute migraine relief", price: 160 },
      { name: "Nurokind Gold RF Capsule", desc: "Mecobalamin + Alpha Lipoic Acid", price: 198 },
      { name: "Tegrital CR 200", desc: "Carbamazepine controlled release", price: 54 },
      { name: "Donep 5mg Tablet", desc: "Donepezil cognitive support", price: 142 },
      { name: "Pantocid 40mg Tablet", desc: "Pantoprazole acid suppression", price: 155 },
      { name: "Clopitab-A 75 Capsule", desc: "Clopidogrel + Aspirin stroke care", price: 94 },
    ],
    tests: [
      { name: "CT Brain Plain (Non-Contrast)", desc: "Acute stroke / bleed triage scan", price: 2400 },
      { name: "MRI Brain + MR Angiography", desc: "1.5T intracranial vascular study", price: 5200 },
      { name: "Digital Video EEG (1 Hr)", desc: "Epileptiform spike wave mapping", price: 1800 },
      { name: "Nerve Conduction Velocity (NCV)", desc: "4-limb peripheral neuropathy study", price: 2200 },
      { name: "Electromyography (EMG)", desc: "Motor unit action potential test", price: 1950 },
      { name: "VEP Visual Evoked Potential", desc: "Optic nerve pathway conduction", price: 1200 },
      { name: "Serum Valproate / Phenytoin Level", desc: "Therapeutic drug monitoring", price: 1100 },
      { name: "CSF Routine & Meningitis PCR", desc: "Lumbar puncture cytology panel", price: 2800 },
      { name: "Homocysteine Serum Assay", desc: "Vascular & stroke risk marker", price: 950 },
      { name: "Sleep Study Polysomnography", desc: "Overnight apnea & neuro-sleep test", price: 4500 },
      { name: "Carotid Vertebral Color Doppler", desc: "TIA / Stroke neck vessel duplex", price: 2100 },
      { name: "CBC + Electrolytes + Renal", desc: "Baseline neuro ICU blood profile", price: 780 },
    ],
    pharmacies: [
      { name: "ApexMed Neuro Pharmacy", contact: "Zoya Merchant", address: "Ground Wing, Linking Rd" },
      { name: "Bandra Wellness Chemists", contact: "Sameer Patil", address: "Hill Road, Bandra West" },
    ],
    labs: [
      { name: "ApexMed Neuro-Imaging Lab", contact: "Dr. Nitin Shah", address: "Basement 1, Linking Rd" },
      { name: "Suburban Neuro Diagnostics", contact: "Meenal Joshi", address: "Khar West, Mumbai" },
    ],
  },
  {
    code: "SAPPHIRE",
    name: "Sapphire General Hospital",
    slug: "sapphire",
    city: "Kochi",
    address: "31 MG Road, Ravipuram, Kochi 682016",
    phone: "+91 484 235 9000",
    email: "admin@sapphirekochi.in",
    tagline: "Trusted Family Medicine, Surgery & Diagnostics",
    registrationNo: "KL-EKM-2022-3018",
    dailyOpLimit: 30,
    dailyIpLimit: 8,
    patientCount: 136,
    todayOpCount: 7,
    todayIpCount: 2,
    defaultConsultationFee: 450,
    doctors: [
      { name: "Dr. George Varghese", specialty: "General Medicine", qualification: "MD (Medicine)", fee: 450 },
      { name: "Dr. Lakshmi Menon", specialty: "General Surgery", qualification: "MS (Gen Surg)", fee: 600 },
      { name: "Dr. Thomas Kurian", specialty: "ENT", qualification: "MS (ENT)", fee: 500 },
      { name: "Dr. Reshma Nambiar", specialty: "Dermatology", qualification: "MD (DVL)", fee: 500 },
    ],
    medicines: [
      { name: "Monocef-O 200 Tablet", desc: "Cefpodoxime proxetil antibiotic", price: 196 },
      { name: "Asthalin Inhaler 100mcg", desc: "Salbutamol bronchodilator MDI", price: 158 },
      { name: "Bilasure M Tablet", desc: "Bilastine + Montelukast allergy", price: 210 },
      { name: "Lulibet 1% Cream 30g", desc: "Luliconazole antifungal topical", price: 240 },
      { name: "Otrivin Oxy Fast Relief", desc: "Oxymetazoline nasal spray", price: 105 },
      { name: "Taxim-O 200 Tablet", desc: "Cefixime broad-spectrum", price: 118 },
      { name: "Cremaffin Plus Syrup", desc: "Liquid paraffin + Milk of magnesia", price: 225 },
      { name: "Azee 500mg Tablet", desc: "Azithromycin 5-day pack", price: 128 },
      { name: "Defcort 6mg Tablet", desc: "Deflazacort anti-inflammatory", price: 146 },
      { name: "Mucaine Gel 200ml", desc: "Oxetacaine + Antacid oral gel", price: 188 },
      { name: "Candiforce 100 Capsule", desc: "Itraconazole oral antifungal", price: 194 },
      { name: "Paracin 500 Tablet", desc: "Paracetamol standard dose", price: 26 },
      { name: "Electral ORS Sachet 21.8g", desc: "WHO formula rehydration salts", price: 24 },
      { name: "Mometasone Nasal Spray", desc: "Allergic rhinitis steroid spray", price: 325 },
    ],
    tests: [
      { name: "Dengue NS1 & IgM/IgG", desc: "Acute monsoon fever panel", price: 950 },
      { name: "Typhoid Widal & IgM", desc: "Enteric fever serology", price: 380 },
      { name: "Leptospira IgM ELISA", desc: "Weil disease screening", price: 850 },
      { name: "CBC + ESR + Peripheral Smear", desc: "Complete hematology evaluation", price: 420 },
      { name: "Pure Tone Audiometry", desc: "ENT hearing threshold audiogram", price: 600 },
      { name: "Tympanometry Impedance", desc: "Middle ear effusion assessment", price: 550 },
      { name: "Fasting & Post-Prandial Sugar", desc: "Diabetes glucose monitoring", price: 180 },
      { name: "USG Whole Abdomen", desc: "Hepatobiliary, renal & pelvic scan", price: 1150 },
      { name: "Thyroid Function Panel", desc: "TSH, FT3, FT4 evaluation", price: 650 },
      { name: "Serum IgE Total", desc: "Allergy & atopy quantification", price: 780 },
      { name: "Skin KOH Fungal Mount", desc: "Microscopic dermatophyte screen", price: 260 },
      { name: "Stool Routine & Occult Blood", desc: "GI parasite & bleed screening", price: 250 },
    ],
    pharmacies: [
      { name: "Sapphire Pharmacy Ernakulam", contact: "Mathew Joseph", address: "MG Road Gate, Kochi" },
      { name: "Cochin Care Chemists", contact: "Anjali Das", address: "Pallimukku Junction, Kochi" },
    ],
    labs: [
      { name: "Sapphire Central Lab", contact: "Dr. Bindu Pillai", address: "Floor 1, Ravipuram" },
      { name: "Malabar PathLabs Kochi", contact: "Sanjay Kumar", address: "Kadavanthra, Kochi" },
    ],
  },
  {
    code: "SILVERLINE",
    name: "Silverline Gastro & Liver Care",
    slug: "silverline",
    city: "Ahmedabad",
    address: "29 CG Road, Navrangpura, Ahmedabad 380009",
    phone: "+91 79 2644 5100",
    email: "care@silverlinegastro.in",
    tagline: "Endoscopy, Hepatology & GI Surgical Excellence",
    registrationNo: "GJ-AMD-2023-6104",
    dailyOpLimit: 25,
    dailyIpLimit: 8,
    patientCount: 140,
    todayOpCount: 6,
    todayIpCount: 2,
    defaultConsultationFee: 650,
    doctors: [
      { name: "Dr. Jayesh Patel", specialty: "Medical Gastroenterology", qualification: "DM (Gastro)", fee: 750 },
      { name: "Dr. Riddhi Desai", specialty: "Hepatology", qualification: "MD, Fellowship", fee: 700 },
      { name: "Dr. Kunal Trivedi", specialty: "GI Surgery", qualification: "MCh (GI Surg)", fee: 850 },
      { name: "Dr. Nisha Mehta", specialty: "Clinical Nutrition", qualification: "MD, RD", fee: 450 },
    ],
    medicines: [
      { name: "Rifagut 550mg Tablet", desc: "Rifaximin gut-selective antibiotic", price: 445 },
      { name: "Udiliv 300mg Tablet", desc: "Ursodeoxycholic acid cholestasis", price: 580 },
      { name: "Creon 25000 Capsule", desc: "Pancreatin digestive enzymes", price: 760 },
      { name: "Looz Oral Solution 200ml", desc: "Lactulose hepatic encephalopathy", price: 245 },
      { name: "Mesacol OD 1.2g Tablet", desc: "Mesalamine IBD maintenance", price: 365 },
      { name: "Vonoprazan 20mg Tablet", desc: "P-CAB potent acid blocker", price: 290 },
      { name: "Normaxin Tablet", desc: "Chlordiazepoxide + Clidinium IBS", price: 68 },
      { name: "Darolac IBS Sachet", desc: "Multi-strain gut probiotic", price: 310 },
      { name: "Sucrafil-O Gel 200ml", desc: "Sucralfate + Oxetacaine ulcer coat", price: 195 },
      { name: "Drotin-M Tablet", desc: "Drotaverine + Mefenamic antispasmodic", price: 148 },
      { name: "Metrogyl 400mg Tablet", desc: "Metronidazole antiprotozoal", price: 28 },
      { name: "Liv-52 DS Tablet", desc: "Hepatoprotective herbal blend", price: 195 },
      { name: "Sompraz D 40 Capsule", desc: "Esomeprazole + Domperidone SR", price: 235 },
      { name: "Pegclear Powder 137g", desc: "Polyethylene glycol bowel prep", price: 340 },
    ],
    tests: [
      { name: "Upper GI Video Endoscopy (UGIE)", desc: "Esophagus, stomach & duodenum", price: 2500 },
      { name: "FibroScan Liver Elastography", desc: "Non-invasive hepatic fibrosis CAP", price: 3200 },
      { name: "Amylase & Lipase Serum", desc: "Acute pancreatitis enzyme markers", price: 850 },
      { name: "Hepatitis B & C Viral Panel", desc: "HBsAg + Anti-HCV ELISA", price: 980 },
      { name: "Liver Function Full Panel", desc: "Bilirubin fractions, albumin, GGT", price: 720 },
      { name: "Stool Calprotectin Quantitative", desc: "Inflammatory bowel activity marker", price: 1900 },
      { name: "H. Pylori Stool Antigen", desc: "Non-invasive ulcer pathogen test", price: 1100 },
      { name: "Alpha-Fetoprotein (AFP)", desc: "Hepatic surveillance tumor marker", price: 920 },
      { name: "Anti-tTG IgA Celiac Screen", desc: "Gluten enteropathy antibody test", price: 1250 },
      { name: "CECT Whole Abdomen Triple Phase", desc: "Liver & pancreas contrast CT", price: 5400 },
      { name: "Ascitic Fluid Cytology & SAAG", desc: "Paracentesis diagnostic analysis", price: 950 },
      { name: "Vitamin B12 + Folate Assay", desc: "Malabsorption anemia panel", price: 1050 },
    ],
    pharmacies: [
      { name: "Silverline GI Pharmacy", contact: "Hardik Shah", address: "Navrangpura Cross Rd" },
      { name: "Gujarat Apollo Meds", contact: "Bhumi Parikh", address: "CG Road Municipal Mkt" },
    ],
    labs: [
      { name: "Silverline Endoscopy & PathLab", contact: "Dr. Viral Modi", address: "2nd Floor, Silverline Annex" },
      { name: "Supratech Gastro Diagnostics", contact: "Parth Bhatt", address: "Paldi Cross Road" },
    ],
  },
  {
    code: "CORALCARE",
    name: "Coral Care Multispeciality",
    slug: "coralcare",
    city: "Jaipur",
    address: "88 Tonk Road, Lal Kothi, Jaipur 302015",
    phone: "+91 141 274 3300",
    email: "support@coralcarejaipur.com",
    tagline: "Modern Community & Specialty Healthcare",
    registrationNo: "RJ-JPR-2023-2209",
    dailyOpLimit: 30,
    dailyIpLimit: 10,
    patientCount: 134,
    todayOpCount: 7,
    todayIpCount: 1,
    defaultConsultationFee: 400,
    doctors: [
      { name: "Dr. Mahendra Rathore", specialty: "General Medicine", qualification: "MD (Med)", fee: 400 },
      { name: "Dr. Sunita Shekhawat", specialty: "Gynecology", qualification: "MS (OBG)", fee: 550 },
      { name: "Dr. Piyush Agarwal", specialty: "Ophthalmology", qualification: "MS (Ophthal)", fee: 450 },
      { name: "Dr. Alka Khandelwal", specialty: "Pediatrics", qualification: "MD (Peds)", fee: 450 },
    ],
    medicines: [
      { name: "Moxikind-CV 625", desc: "Amoxicillin + Clavulanate (10s)", price: 205 },
      { name: "Combiflam Tablet", desc: "Ibuprofen + Paracetamol (20s)", price: 48 },
      { name: "Systane Ultra Eye Drops", desc: "Lubricating artificial tears 10ml", price: 390 },
      { name: "Vigamox Eye Drops 5ml", desc: "Moxifloxacin 0.5% ophthalmic", price: 165 },
      { name: "Aciloc 150 Tablet", desc: "Ranitidine H2 receptor blocker", price: 42 },
      { name: "Febustat 40mg Tablet", desc: "Febuxostat hyperuricemia", price: 175 },
      { name: "Cetzine 10mg Tablet", desc: "Cetirizine antihistamine", price: 22 },
      { name: "Metolar XR 25", desc: "Metoprolol extended release", price: 98 },
      { name: "Vildagliptin M 50/500", desc: "DPP4 inhibitor glycemic control", price: 230 },
      { name: "Becosules Capsules", desc: "B-Complex + Vitamin C (20s)", price: 54 },
      { name: "Ofloxacin-OZ Tablet", desc: "Ofloxacin + Ornidazole GI", price: 116 },
      { name: "Soframycin Skin Cream", desc: "Framycetin topical antibiotic", price: 62 },
      { name: "Deriphyllin Retard 150", desc: "Etophylline + Theophylline", price: 46 },
      { name: "Tamsulosin 0.4mg MR", desc: "BPH urinary flow relief", price: 185 },
    ],
    tests: [
      { name: "Master Health Check Panel", desc: "CBC, Sugar, Lipid, LFT, KFT, Urine", price: 1450 },
      { name: "OCT Macular Eye Scan", desc: "Optical coherence retinal tomography", price: 1600 },
      { name: "Perimetry Visual Field", desc: "Glaucoma visual field charting", price: 1200 },
      { name: "Malaria Antigen & Smear", desc: "P. vivax & P. falciparum rapid", price: 360 },
      { name: "Chikungunya IgM Rapid", desc: "Arbovirus fever screening", price: 650 },
      { name: "Fasting Lipid + Triglycerides", desc: "Metabolic cardiovascular risk", price: 620 },
      { name: "PAP Smear Liquid Cytology", desc: "Cervical screening evaluation", price: 850 },
      { name: "Pelvic Ultrasound Scan", desc: "Uterus & adnexal sonography", price: 1050 },
      { name: "CBC with Platelet Count", desc: "Dengue/infection monitoring", price: 300 },
      { name: "Thyroid TSH Quantitative", desc: "Ultrasensitive thyroid assay", price: 340 },
      { name: "ECG 12-Lead Print", desc: "Pre-anesthesia cardiac screen", price: 280 },
      { name: "Serum Calcium & Phosphorus", desc: "Bone mineral electrolyte panel", price: 440 },
    ],
    pharmacies: [
      { name: "Coral Pharma Junction", contact: "Devendra Singh", address: "Lal Kothi, Jaipur" },
      { name: "PinkCity Medico", contact: "Ritu Sharma", address: "Bapu Nagar, Jaipur" },
    ],
    labs: [
      { name: "Coral Diagnostics Centre", contact: "Dr. Ashok Jain", address: "Lower Lobby, Tonk Rd" },
      { name: "Dr. Lal Path Partner Lal Kothi", contact: "Neha Gupta", address: "Apex Mall, Jaipur" },
    ],
  },
  {
    code: "CRESTVIEW",
    name: "Crestview Surgical & Pulmonology",
    slug: "crestview",
    city: "Chandigarh",
    address: "Sector 34-A, SCO 210, Chandigarh 160022",
    phone: "+91 172 260 4900",
    email: "desk@crestviewcare.in",
    tagline: "Advanced Respiratory, Sleep & Laparoscopic Care",
    registrationNo: "CH-UT-2024-1098",
    dailyOpLimit: 28,
    dailyIpLimit: 9,
    patientCount: 144,
    todayOpCount: 9,
    todayIpCount: 2,
    defaultConsultationFee: 600,
    doctors: [
      { name: "Dr. Harpreet Gill", specialty: "Pulmonology", qualification: "DM (Pulmonary Med)", fee: 700 },
      { name: "Dr. Simranjit Kaur", specialty: "Laparoscopic Surgery", qualification: "MS, FMAS", fee: 750 },
      { name: "Dr. Amanpreet Bedi", specialty: "Critical Care", qualification: "MD, IDCCM", fee: 650 },
      { name: "Dr. Rohit Malhotra", specialty: "Internal Medicine", qualification: "MD (Medicine)", fee: 550 },
    ],
    medicines: [
      { name: "Foracort 200 Inhaler", desc: "Formoterol + Budesonide COPD MDI", price: 410 },
      { name: "Tiova 18mcg Rotacaps", desc: "Tiotropium long-acting inhaler", price: 295 },
      { name: "Doxolin 400mg Tablet", desc: "Doxofylline bronchodilator", price: 92 },
      { name: "Mucomix 600 Effervescent", desc: "Acetylcysteine mucolytic (10s)", price: 285 },
      { name: "Grilinctus BM Syrup", desc: "Terbutaline + Bromhexine syrup", price: 138 },
      { name: "Pirfenex 200mg Tablet", desc: "Pirfenidone interstitial lung care", price: 495 },
      { name: "Levoflox 500mg Tablet", desc: "Levofloxacin respiratory fluoroquinolone", price: 108 },
      { name: "Omnacortil 10mg Tablet", desc: "Prednisolone short-course steroid", price: 24 },
      { name: "Nintena 150mg Capsule", desc: "Nintedanib antifibrotic", price: 1420 },
      { name: "Tazact 4.5g Injection", desc: "Piperacillin + Tazobactam IV vial", price: 390 },
      { name: "Pantop 40mg IV Vial", desc: "IV proton pump inhibitor", price: 65 },
      { name: "Cofsils Expertrace Syrup", desc: "Ambroxol + Guaifenesin syrup", price: 112 },
      { name: "Azithromycin 250mg Tab", desc: "Maintenance respiratory macrolide", price: 78 },
      { name: "Duolin Respules", desc: "Ipratropium + Levosalbutamol neb", price: 165 },
    ],
    tests: [
      { name: "Pulmonary Function Test (Spirometry)", desc: "FEV1, FVC & reversibility", price: 950 },
      { name: "HRCT Chest High-Resolution", desc: "Thin-slice interstitial lung CT", price: 3800 },
      { name: "Arterial Blood Gas (ABG)", desc: "pH, pO2, pCO2, HCO3, Lactate", price: 900 },
      { name: "Sputum AFB & GeneXpert CBNAAT", desc: "Rapid TB molecular detection", price: 1850 },
      { name: "Bronchoscopy BAL Cytology", desc: "Lower respiratory lavage panel", price: 2400 },
      { name: "6-Minute Walk Desaturation Test", desc: "SpO2 exertion capacity test", price: 450 },
      { name: "Procalcitonin (PCT) Sepsis", desc: "Bacterial pneumonia marker", price: 1650 },
      { name: "Chest X-Ray AP/Lateral", desc: "Dual view thoracic radiograph", price: 650 },
      { name: "Pleural Fluid ADA & Cell Count", desc: "Effusion diagnostic biochemistry", price: 920 },
      { name: "Serum Alpha-1 Antitrypsin", desc: "Emphysema genetic deficiency screen", price: 1950 },
      { name: "CBC + CRP + D-Dimer", desc: "Pulmonary embolism triage panel", price: 1450 },
      { name: "DLCO Lung Diffusion Capacity", desc: "Alveolar gas transfer measurement", price: 1600 },
    ],
    pharmacies: [
      { name: "Crestview Respiratory Pharmacy", contact: "Gurpreet Singh", address: "SCO 210 Ground Floor, Sec 34" },
      { name: "Tricity Health Medicos", contact: "Pooja Bansal", address: "Sector 35-C Market" },
    ],
    labs: [
      { name: "Crestview PFT & Imaging Lab", contact: "Dr. Navdeep Sandhu", address: "Basement Diagnostic Wing" },
      { name: "Atulaya Diagnostics Chandigarh", contact: "Vikram Sethi", address: "Sector 11-A, Chandigarh" },
    ],
  },
  {
    code: "HARMONY",
    name: "Harmony Renal & Urology Centre",
    slug: "harmony",
    city: "Coimbatore",
    address: "55 Avinashi Road, Peelamedu, Coimbatore 641004",
    phone: "+91 422 257 6200",
    email: "care@harmonyrenal.org",
    tagline: "Nephrology, Dialysis Support & Laser Urology",
    registrationNo: "TN-CBE-2023-4912",
    dailyOpLimit: 25,
    dailyIpLimit: 8,
    patientCount: 132,
    todayOpCount: 6,
    todayIpCount: 1,
    defaultConsultationFee: 550,
    doctors: [
      { name: "Dr. Muthukumar Selvam", specialty: "Nephrology", qualification: "DM (Nephrology)", fee: 700 },
      { name: "Dr. Saranya Balasubramanian", specialty: "Urology", qualification: "MCh (Urology)", fee: 750 },
      { name: "Dr. Arunachalam V", specialty: "General Medicine", qualification: "MD", fee: 450 },
      { name: "Dr. Kavipriya Natarajan", specialty: "Andrology & Urology", qualification: "DNB (Urology)", fee: 650 },
    ],
    medicines: [
      { name: "Urimax 0.4mg Capsule", desc: "Tamsulosin MR prostate care", price: 245 },
      { name: "Silodal 8mg Capsule", desc: "Silodosin alpha-1A blocker", price: 320 },
      { name: "Alkasol Oral Solution 100ml", desc: "Disodium hydrogen citrate alkalinizer", price: 118 },
      { name: "Nitrofur 100 SR Tablet", desc: "Nitrofurantoin UTI sustained rel.", price: 115 },
      { name: "Ketosteril Tablet (20s)", desc: "Alpha-ketoanalogue CKD support", price: 790 },
      { name: "Shelcal HD Tablet", desc: "Calcium + High-dose Vitamin D3", price: 182 },
      { name: "Lasix 40mg Tablet", desc: "Furosemide loop diuretic", price: 18 },
      { name: "Sevelamer 400mg Tablet", desc: "Renal phosphate binder", price: 280 },
      { name: "Erythropoietin 4000 IU PFS", desc: "CKD anemia injectable support", price: 640 },
      { name: "Soliten 5mg Tablet", desc: "Solifenacin overactive bladder", price: 310 },
      { name: "Faropenem 200mg Tablet", desc: "Oral penem complicated UTI", price: 485 },
      { name: "Nodosis 500mg Tablet", desc: "Sodium bicarbonate acidosis care", price: 48 },
      { name: "Dutas-T Capsule", desc: "Dutasteride + Tamsulosin", price: 390 },
      { name: "Cystone Tablet", desc: "Renal calculus herbal adjuvant", price: 165 },
    ],
    tests: [
      { name: "Renal Function + eGFR Panel", desc: "Creatinine, BUN, Uric Acid, eGFR", price: 540 },
      { name: "Urine Protein-Creatinine Ratio", desc: "Spot nephrotic proteinuria index", price: 460 },
      { name: "Uroflowmetry Study", desc: "Electronic urinary peak flow curve", price: 950 },
      { name: "USG KUB + Post-Void Residual", desc: "Kidneys, ureters, bladder, prostate", price: 1150 },
      { name: "CT KUB Non-Contrast Stone Scan", desc: "3mm renal calculus localization", price: 3100 },
      { name: "PSA Total & Free Ratio", desc: "Prostate specific antigen screening", price: 880 },
      { name: "24-Hr Urinary Calcium & Oxalate", desc: "Metabolic stone former panel", price: 1450 },
      { name: "Serum iPTH Intact Parathyroid", desc: "Renal osteodystrophy assay", price: 1350 },
      { name: "Renal Artery Color Doppler", desc: "Renovascular hypertension study", price: 1900 },
      { name: "Urine Culture + MIC Sensitivity", desc: "Quantitative bacterial colony count", price: 620 },
      { name: "Serum Electrolytes (Na/K/Cl/HCO3)", desc: "Dialysis electrolyte monitoring", price: 420 },
      { name: "Kidney Biopsy Histopathology", desc: "IF & light microscopy core study", price: 3800 },
    ],
    pharmacies: [
      { name: "Harmony Renal Chemists", contact: "Sivakumar R", address: "Avinashi Rd Gate, Peelamedu" },
      { name: "Kovai MedPoint", contact: "Madhavi P", address: "Hope College Signal, Coimbatore" },
    ],
    labs: [
      { name: "Harmony Urology & Renal Lab", contact: "Dr. Vignesh K", address: "Floor 1, Peelamedu" },
      { name: "PSG Partner PathLabs", contact: "Karthik M", address: "Avinashi Road, Coimbatore" },
    ],
  },
  {
    code: "ZENITH",
    name: "Zenith Oncology & Diagnostics",
    slug: "zenith",
    city: "Kolkata",
    address: "194 AJC Bose Road, Ballygunge, Kolkata 700017",
    phone: "+91 33 2289 7100",
    email: "care@zenithonco.in",
    tagline: "Multidisciplinary Cancer Screening, Chemo Daycare & Pain Relief",
    registrationNo: "WB-KOL-2023-3302",
    dailyOpLimit: 35,
    dailyIpLimit: 10,
    patientCount: 150,
    todayOpCount: 10,
    todayIpCount: 2,
    defaultConsultationFee: 800,
    doctors: [
      { name: "Dr. Subhashis Chatterjee", specialty: "Medical Oncology", qualification: "DM (Med Onco)", fee: 950 },
      { name: "Dr. Poulomi Mukherjee", specialty: "Surgical Oncology", qualification: "MCh (Surg Onco)", fee: 900 },
      { name: "Dr. Anirban Sen", specialty: "Palliative & Pain Medicine", qualification: "MD (Palliative)", fee: 650 },
      { name: "Dr. Debashish Bose", specialty: "Hematology", qualification: "DM (Clinical Hem)", fee: 850 },
    ],
    medicines: [
      { name: "Emeset 8mg MD Tablet", desc: "Ondansetron antiemetic prophylaxis", price: 112 },
      { name: "Aprecap 125/80mg Kit", desc: "Aprepitant CINV antiemetic pack", price: 1250 },
      { name: "Pegfilgrastim 6mg PFS", desc: "Neutropenia colony stimulating factor", price: 1450 },
      { name: "Tamoxifen 20mg Tablet", desc: "Hormone receptor modulator", price: 64 },
      { name: "Letrozole 2.5mg Tablet", desc: "Aromatase inhibitor (10s)", price: 195 },
      { name: "Capecitabine 500mg Tablet", desc: "Oral fluoropyrimidine (10s)", price: 1180 },
      { name: "Ultracet Tablet", desc: "Tramadol + Acetaminophen analgesia", price: 215 },
      { name: "Durogesic 25mcg Patch", desc: "Fentanyl transdermal pain patch", price: 1380 },
      { name: "Shelcal-M Tablet", desc: "Calcium + Mineral bone protection", price: 162 },
      { name: "Prohance Protein Powder 400g", desc: "Oncology nutrition supplementation", price: 695 },
      { name: "Filgrastim 300mcg PFS", desc: "ANC neutrophil recovery", price: 980 },
      { name: "Zoledronic Acid 4mg Vial", desc: "Bone metastasis infusion support", price: 1150 },
      { name: "Bortezomib Comfort Gel", desc: "Oral mucositis soothing gel", price: 240 },
      { name: "Pantoprazole 40mg DR", desc: "Steroid-induced gastritis shield", price: 130 },
    ],
    tests: [
      { name: "CA-125 Ovarian Tumor Marker", desc: "Quantitative chemiluminescence", price: 1150 },
      { name: "CEA Carcinoembryonic Antigen", desc: "Colorectal & GI marker", price: 950 },
      { name: "CA 19-9 Pancreatic Marker", desc: "Hepatobiliary tumor antigen", price: 1200 },
      { name: "Digital Mammography Bilateral", desc: "Low-dose breast screening", price: 2400 },
      { name: "Bone Marrow Aspiration + Biopsy", desc: "Hematologic malignancy panel", price: 3900 },
      { name: "Pre-Chemo CBC + LFT + KFT", desc: "Absolute neutrophil & organ check", price: 1150 },
      { name: "BRCA1 & BRCA2 Gene Panel", desc: "Hereditary oncology sequencing", price: 4800 },
      { name: "Serum LDH & Ferritin", desc: "Lymphoma proliferation markers", price: 890 },
      { name: "Biopsy Histopathology + IHC (4)", desc: "ER/PR/HER2/Ki67 receptor panel", price: 3600 },
      { name: "Flow Cytometry Leukemia Panel", desc: "Immunophenotyping lineage assay", price: 4200 },
      { name: "Serum Calcium + Alkaline Phos", desc: "Bone turnover screening", price: 480 },
      { name: "CECT Thorax + Abdomen", desc: "Oncology staging CT scan", price: 4950 },
    ],
    pharmacies: [
      { name: "Zenith Onco Specialty Pharma", contact: "Soumya Dutta", address: "AJC Bose Rd Annex" },
      { name: "Ballygunge Lifesave Chemists", contact: "Tanmoy Roy", address: "Park Circus Connector" },
    ],
    labs: [
      { name: "Zenith Molecular & IHC Lab", contact: "Dr. Rituparna Roy", address: "Diagnostic Wing, Level 2" },
      { name: "Quadra Onco Diagnostics", contact: "Arindam Paul", address: "Hazra Road, Kolkata" },
    ],
  },
  {
    code: "PRIMEWELL",
    name: "PrimeWell Community Hospital",
    slug: "primewell",
    city: "Visakhapatnam",
    address: "14 Siripuram Junction, Waltair Uplands, Visakhapatnam 530003",
    phone: "+91 891 255 4100",
    email: "care@primewellvizag.in",
    tagline: "24x7 Family Care, General Surgery & Preventive Health",
    registrationNo: "AP-VSP-2024-1825",
    dailyOpLimit: 30,
    dailyIpLimit: 8,
    patientCount: 138,
    todayOpCount: 8,
    todayIpCount: 2,
    defaultConsultationFee: 350,
    doctors: [
      { name: "Dr. Venkata Ramana Murthy", specialty: "General Medicine", qualification: "MD (Med)", fee: 350 },
      { name: "Dr. Madhavi Latha", specialty: "Obstetrics & Gynecology", qualification: "MD (OBG)", fee: 450 },
      { name: "Dr. Sai Prasad", specialty: "General Surgery", qualification: "MS (Surg)", fee: 500 },
      { name: "Dr. Bhavani Shankar", specialty: "Pediatrics", qualification: "DCH, DNB", fee: 400 },
    ],
    medicines: [
      { name: "Crocin 650mg Advance", desc: "Fast-release paracetamol", price: 32 },
      { name: "Azithro 500 Tablet", desc: "Azithromycin 3-day pack", price: 78 },
      { name: "Rantac 150mg Tablet", desc: "Gastric acid relief (30s)", price: 44 },
      { name: "Amlokind-AT Tablet", desc: "Amlodipine + Atenolol", price: 58 },
      { name: "Glyciphage SR 500", desc: "Metformin sustained release", price: 42 },
      { name: "Allegra 120mg Tablet", desc: "Fexofenadine non-sedating", price: 218 },
      { name: "Digene Mint Gel 200ml", desc: "Antacid antiflatulent", price: 145 },
      { name: "Amoxyclav 625 Tablet", desc: "Broad spectrum beta-lactam", price: 185 },
      { name: "Voveran SR 100", desc: "Diclofenac sustained relief", price: 96 },
      { name: "Zincovit Tablet", desc: "Multivitamin + Zinc immunity", price: 110 },
      { name: "Betadine Gargle 100ml", desc: "Povidone iodine sore throat", price: 142 },
      { name: "Candid-B Cream 20g", desc: "Clotrimazole + Beclometasone", price: 128 },
      { name: "Ecosprin 75mg Tablet", desc: "Low-dose aspirin (14s)", price: 12 },
      { name: "Benadryl Cough Syrup 150ml", desc: "Diphenhydramine antitussive", price: 136 },
    ],
    tests: [
      { name: "Complete Blood Picture (CBP)", desc: "Hb, RBC, WBC, Platelets", price: 280 },
      { name: "Random Blood Sugar (RBS)", desc: "Glucometer / Hexokinase", price: 120 },
      { name: "Malaria Parasite Smear", desc: "Thick & thin blood film", price: 220 },
      { name: "Widal Agglutination Test", desc: "Enteric fever screening", price: 260 },
      { name: "Urine Complete Examination", desc: "Physical, chemical & sediment", price: 180 },
      { name: "Serum Creatinine & Urea", desc: "Basic renal clearance", price: 340 },
      { name: "Liver Bilirubin & SGPT", desc: "Jaundice screening panel", price: 360 },
      { name: "Lipid Cholesterol Panel", desc: "Preventive heart check", price: 580 },
      { name: "Chest X-Ray PA Digital", desc: "High-resolution thoracic view", price: 400 },
      { name: "ECG Resting 12-Lead", desc: "Cardiac rhythm strip", price: 250 },
      { name: "USG Abdomen & Pelvis", desc: "General abdominal sonography", price: 950 },
      { name: "Thyroid TSH Test", desc: "Baseline thyroid function", price: 320 },
    ],
    pharmacies: [
      { name: "PrimeWell Pharma Waltair", contact: "Srinivas Raju", address: "Siripuram Gate, Vizag" },
      { name: "Coastal Medicos", contact: "Padma Devi", address: "VIP Road, Visakhapatnam" },
    ],
    labs: [
      { name: "PrimeWell Clinical Lab", contact: "Dr. Satyanarayana P", address: "Ground Block, Siripuram" },
      { name: "Vijaya Diagnostic Partner Vizag", contact: "Nagaraju B", address: "Dwaraka Nagar, Vizag" },
    ],
  },
  {
    code: "NAVODAYA",
    name: "Navodaya Mother & Multi Care",
    slug: "navodaya",
    city: "Nagpur",
    address: "22 Central Bazar Road, Ramdaspeth, Nagpur 440010",
    phone: "+91 712 245 3100",
    email: "hello@navodayacare.in",
    tagline: "Integrated Women, Trauma & Family Medicine",
    registrationNo: "MH-NGP-2024-6710",
    dailyOpLimit: 32,
    dailyIpLimit: 9,
    patientCount: 135,
    todayOpCount: 8,
    todayIpCount: 2,
    defaultConsultationFee: 450,
    doctors: [
      { name: "Dr. Prachi Deshmukh", specialty: "Gynecology", qualification: "MD (OBG)", fee: 550 },
      { name: "Dr. Ashish Meshram", specialty: "General Medicine", qualification: "MD (Medicine)", fee: 450 },
      { name: "Dr. Swapnil Gadkari", specialty: "Orthopaedics", qualification: "MS (Ortho)", fee: 550 },
      { name: "Dr. Madhuri Kale", specialty: "Pediatrics", qualification: "DNB (Peds)", fee: 450 },
    ],
    medicines: [
      { name: "Pan 40mg Tablet", desc: "Pantoprazole gastro-resistant", price: 155 },
      { name: "Calcirol Sachet 60000 IU", desc: "Cholecalciferol granules", price: 62 },
      { name: "Livogen-Z Captab", desc: "Iron + Folic Acid + Zinc", price: 92 },
      { name: "Cefixime 200 DT", desc: "Dispersible cephalosporin", price: 114 },
      { name: "Chericof Syrup 100ml", desc: "Dextromethorphan dry cough", price: 118 },
      { name: "Flexon Tablet", desc: "Ibuprofen + Paracetamol", price: 36 },
      { name: "Stemetil MD Tablet", desc: "Prochlorperazine antiemetic", price: 148 },
      { name: "Lantus SoloStar Pen", desc: "Insulin glargine 100 IU/ml", price: 680 },
      { name: "Omez-D Capsule", desc: "Omeprazole + Domperidone", price: 196 },
      { name: "Montek LC Tablet", desc: "Allergic rhinitis control", price: 205 },
      { name: "Betnovate-C Cream", desc: "Betamethasone + Clioquinol", price: 58 },
      { name: "Tetanus Toxoid 0.5ml", desc: "Injury prophylaxis injection", price: 28 },
      { name: "Ecosprin 150 Tablet", desc: "Antiplatelet tablet", price: 18 },
      { name: "Meftal-Spas Tablet", desc: "Mefenamic + Dicyclomine colic", price: 56 },
    ],
    tests: [
      { name: "CBC + Hemoglobin + Platelets", desc: "Complete blood analysis", price: 320 },
      { name: "Sickle Cell Solubility & HPLC", desc: "Hemoglobinopathy screening", price: 980 },
      { name: "HbA1c Diabetes Monitor", desc: "3-month average glucose", price: 520 },
      { name: "Thyroid T3 T4 TSH", desc: "Endocrine metabolism test", price: 580 },
      { name: "Lipid Profile Total", desc: "Cholesterol & triglycerides", price: 650 },
      { name: "X-Ray Ankle / Wrist Digital", desc: "Orthopaedic fracture screening", price: 450 },
      { name: "USG Pelvis & Early Pregnancy", desc: "Obstetric viability scan", price: 1100 },
      { name: "KFT Urea & Creatinine", desc: "Renal safety check", price: 480 },
      { name: "LFT Hepatic Enzymes", desc: "SGOT, SGPT, Bilirubin", price: 600 },
      { name: "Blood Grouping & Crossmatch", desc: "Transfusion compatibility", price: 420 },
      { name: "Dengue Rapid Combo", desc: "NS1 Antigen + IgM", price: 850 },
      { name: "ECG 12-Lead Diagnostic", desc: "Baseline cardiac check", price: 280 },
    ],
    pharmacies: [
      { name: "Navodaya Medicos", contact: "Umesh Tidke", address: "Ramdaspeth Plaza, Nagpur" },
      { name: "Orange City Pharmacy", contact: "Pallavi Joshi", address: "Dharampeth, Nagpur" },
    ],
    labs: [
      { name: "Navodaya Diagnostics", contact: "Dr. Milind Bansod", address: "Ground Floor, Central Bazar Rd" },
      { name: "Vidarbha Central PathLab", contact: "Sachin Wagh", address: "Sitabuldi Main Rd" },
    ],
  },
  {
    code: "SOLARIS",
    name: "Solaris Eye, ENT & Surgical Hub",
    slug: "solaris",
    city: "Lucknow",
    address: "61 Vibhuti Khand, Gomti Nagar, Lucknow 226010",
    phone: "+91 522 401 8800",
    email: "desk@solarissurgical.in",
    tagline: "Microsurgery, Phaco, Endoscopic ENT & Daycare Procedures",
    registrationNo: "UP-LKO-2024-7745",
    dailyOpLimit: 30,
    dailyIpLimit: 8,
    patientCount: 133,
    todayOpCount: 7,
    todayIpCount: 1,
    defaultConsultationFee: 500,
    doctors: [
      { name: "Dr. Anurag Mishra", specialty: "Ophthalmology (Phaco)", qualification: "MS (Ophthal)", fee: 550 },
      { name: "Dr. Shalini Srivastava", specialty: "ENT Endoscopic Surgery", qualification: "MS (ENT)", fee: 550 },
      { name: "Dr. Vivek Tandon", specialty: "Anesthesiology & Pain", qualification: "MD (Anesth)", fee: 500 },
      { name: "Dr. Rakesh Chandra", specialty: "General Medicine", qualification: "MD (Med)", fee: 450 },
    ],
    medicines: [
      { name: "Moxicip Eye Drops", desc: "Moxifloxacin 0.5% post-op drops", price: 152 },
      { name: "Pred Forte Eye Drops", desc: "Prednisolone acetate ophthalmic", price: 245 },
      { name: "Refresh Tears 10ml", desc: "Carboxymethylcellulose lubricant", price: 158 },
      { name: "Timolol 0.5% Eye Drops", desc: "Intraocular pressure lowering", price: 76 },
      { name: "Ciplox Ear Drops", desc: "Ciprofloxacin otic solution", price: 32 },
      { name: "Waxolve Ear Drops", desc: "Cerumenolytic ear drops", price: 118 },
      { name: "Sinarest New Tablet", desc: "Chlorpheniramine + Paracetamol", price: 68 },
      { name: "Clavam 625 Tablet", desc: "Sinusitis bacterial coverage", price: 215 },
      { name: "Betahistine 8mg Tablet", desc: "Labyrinthine vertigo relief", price: 145 },
      { name: "Budesonide Nasal Spray", desc: "Nasal polyp steroid spray", price: 340 },
      { name: "Ketorol-DT Tablet", desc: "Acute post-op pain relief", price: 96 },
      { name: "Rablet 20mg Tablet", desc: "Rabeprazole gastric shield", price: 110 },
      { name: "Travatan 0.004% Eye Drops", desc: "Travoprost glaucoma care", price: 685 },
      { name: "Nasonex Nasal Spray", desc: "Mometasone sinus spray", price: 410 },
    ],
    tests: [
      { name: "A-Scan Biometry & Keratometry", desc: "IOL lens power calculation", price: 850 },
      { name: "Fundus Fluorescein Angiography", desc: "Diabetic retinopathy vascular study", price: 2400 },
      { name: "Nasal Diagnostic Endoscopy", desc: "Rigid sinus evaluation", price: 1200 },
      { name: "CT Paranasal Sinuses (PNS)", desc: "Sinusitis & septal evaluation", price: 2600 },
      { name: "Pure Tone Audiometry + Speech", desc: "Comprehensive hearing screen", price: 700 },
      { name: "B-Scan Ocular Ultrasound", desc: "Posterior eye segment sonography", price: 1100 },
      { name: "Specular Microscopy Cornea", desc: "Pre-cataract endothelial count", price: 950 },
      { name: "Pre-Cataract Blood & ECG Panel", desc: "CBC, RBS, HBsAg, HIV, HCV, ECG", price: 1250 },
      { name: "HbA1c + Fasting Blood Glucose", desc: "Retinopathy glycemic control", price: 540 },
      { name: "BERA Auditory Brainstem", desc: "Infant/adult neural hearing test", price: 1950 },
      { name: "Thyroid + Lipid Basic", desc: "Pre-op systemic clearance", price: 890 },
      { name: "Swab Culture Ear / Throat", desc: "Microbiological sensitivity", price: 520 },
    ],
    pharmacies: [
      { name: "Solaris Eye & ENT Pharmacy", contact: "Alok Tiwari", address: "Vibhuti Khand Block A" },
      { name: "Gomti MedPlus", contact: "Nidhi Shukla", address: "Patrakarpuram Crossing" },
    ],
    labs: [
      { name: "Solaris Ocular & Path Centre", contact: "Dr. Pragya Verma", address: "Level 1, Gomti Nagar" },
      { name: "Charak Diagnostics Lucknow", contact: "Manish Pandey", address: "Indira Nagar, Lucknow" },
    ],
  },
];

async function chunkCreateMany<T>(
  fn: (chunk: T[]) => Promise<unknown>,
  items: T[],
  chunkSize = 100
) {
  for (let i = 0; i < items.length; i += chunkSize) {
    await fn(items.slice(i, i + chunkSize));
  }
}

async function seedHospital(
  profile: HospitalSeedProfile,
  passwordHash: string
) {
  const existing = await prisma.hospital.findUnique({
    where: { code: profile.code },
    select: { id: true, code: true },
  });
  if (existing) {
    console.log(`[SKIP] Hospital ${profile.code} already exists.`);
    return false;
  }

  const rng = createRng(`seed-${profile.code}-2026`);
  const hospitalId = uid("hosp");
  const currentYear = new Date().getFullYear();

  // Reserve sequence numbers after creating all records
  let opSeq = 1;
  let ipSeq = 1;
  let pharmSeq = 1;
  let labSeq = 1;
  let receiptSeq = 1;

  // Create hospital, users, doctors, beds, medicine catalog, lab catalog first
  const adminUserId = uid("usr");
  const rec1Id = uid("usr");
  const rec2Id = uid("usr");

  await prisma.hospital.create({
    data: {
      id: hospitalId,
      code: profile.code,
      name: profile.name,
      slug: profile.slug,
      address: profile.address,
      phone: profile.phone,
      email: profile.email,
      tagline: profile.tagline,
      registrationNo: profile.registrationNo,
      defaultConsultationFee: profile.defaultConsultationFee,
      dailyOpLimit: profile.dailyOpLimit,
      dailyIpLimit: profile.dailyIpLimit,
      uhidPrefix: "UHID",
      isActive: true,
    },
  });

  await prisma.user.createMany({
    data: [
      {
        id: adminUserId,
        hospitalId,
        username: `${profile.slug}.admin`,
        fullName: `${profile.name.split(" ")[0]} Admin`,
        email: profile.email,
        phone: profile.phone,
        passwordHash,
        role: ROLES.HOSPITAL_ADMIN,
        isActive: true,
      },
      {
        id: rec1Id,
        hospitalId,
        username: `${profile.slug}.rec1`,
        fullName: `${pick(rng, FIRST_NAMES_F)} ${pick(rng, LAST_NAMES)}`,
        phone: `+91 98${randInt(rng, 10000000, 99999999)}`,
        passwordHash,
        role: ROLES.RECEPTIONIST,
        isActive: true,
      },
      {
        id: rec2Id,
        hospitalId,
        username: `${profile.slug}.rec2`,
        fullName: `${pick(rng, FIRST_NAMES_M)} ${pick(rng, LAST_NAMES)}`,
        phone: `+91 97${randInt(rng, 10000000, 99999999)}`,
        passwordHash,
        role: ROLES.RECEPTIONIST,
        isActive: true,
      },
    ],
  });

  const pharmacyAccounts: Array<{ id: string; userId: string; pharmacyName: string; contactPerson: string }> = [];
  for (let i = 0; i < profile.pharmacies.length; i++) {
    const p = profile.pharmacies[i];
    const uId = uid("usr");
    const accId = uid("pha");
    await prisma.user.create({
      data: {
        id: uId,
        hospitalId,
        username: `${profile.slug}.pharm${i + 1}`,
        fullName: p.contact,
        phone: `+91 96${randInt(rng, 10000000, 99999999)}`,
        passwordHash,
        role: ROLES.PHARMACY_USER,
        isActive: true,
      },
    });
    await prisma.pharmacyAccount.create({
      data: {
        id: accId,
        hospitalId,
        userId: uId,
        pharmacyName: p.name,
        contactPerson: p.contact,
        phone: `+91 96${randInt(rng, 10000000, 99999999)}`,
        address: p.address,
        isActive: true,
      },
    });
    pharmacyAccounts.push({ id: accId, userId: uId, pharmacyName: p.name, contactPerson: p.contact });
  }

  const labAccounts: Array<{ id: string; userId: string; labName: string; contactPerson: string }> = [];
  for (let i = 0; i < profile.labs.length; i++) {
    const l = profile.labs[i];
    const uId = uid("usr");
    const accId = uid("lba");
    await prisma.user.create({
      data: {
        id: uId,
        hospitalId,
        username: `${profile.slug}.lab${i + 1}`,
        fullName: l.contact,
        phone: `+91 95${randInt(rng, 10000000, 99999999)}`,
        passwordHash,
        role: ROLES.LAB_USER,
        isActive: true,
      },
    });
    await prisma.labAccount.create({
      data: {
        id: accId,
        hospitalId,
        userId: uId,
        labName: l.name,
        contactPerson: l.contact,
        phone: `+91 95${randInt(rng, 10000000, 99999999)}`,
        address: l.address,
        isActive: true,
      },
    });
    labAccounts.push({ id: accId, userId: uId, labName: l.name, contactPerson: l.contact });
  }

  const doctors = profile.doctors.map((d) => ({
    id: uid("doc"),
    hospitalId,
    name: d.name,
    specialty: d.specialty,
    qualification: d.qualification,
    phone: `+91 98${randInt(rng, 10000000, 99999999)}`,
    consultationFee: d.fee,
    isActive: true,
  }));
  await prisma.doctor.createMany({ data: doctors });

  const medicines = profile.medicines.map((m) => ({
    id: uid("med"),
    hospitalId,
    name: m.name,
    description: m.desc,
    price: m.price,
    isActive: true,
  }));
  await prisma.medicineCatalog.createMany({ data: medicines });

  const labTests = profile.tests.map((t) => ({
    id: uid("tst"),
    hospitalId,
    name: t.name,
    description: t.desc,
    price: t.price,
    isActive: true,
  }));
  await prisma.labTestCatalog.createMany({ data: labTests });

  // 16 Beds across 4 wards/categories
  // Ensure beds 0..5 are OCCUPIED matching our active admissions, bed 15 is INACTIVE, rest AVAILABLE
  const bedConfigs = [
    { bedNumber: "GW-101", ward: "General Ward A", category: "General", activeIdx: true },
    { bedNumber: "GW-102", ward: "General Ward A", category: "General", activeIdx: true },
    { bedNumber: "GW-103", ward: "General Ward A", category: "General", activeIdx: false },
    { bedNumber: "GW-104", ward: "General Ward A", category: "General", activeIdx: false },
    { bedNumber: "GW-105", ward: "General Ward B", category: "General", activeIdx: false },
    { bedNumber: "GW-106", ward: "General Ward B", category: "General", activeIdx: false },
    { bedNumber: "SP-201", ward: "Semi-Private Wing", category: "Semi-Private", activeIdx: true },
    { bedNumber: "SP-202", ward: "Semi-Private Wing", category: "Semi-Private", activeIdx: false },
    { bedNumber: "SP-203", ward: "Semi-Private Wing", category: "Semi-Private", activeIdx: false },
    { bedNumber: "SP-204", ward: "Semi-Private Wing", category: "Semi-Private", activeIdx: false },
    { bedNumber: "PR-301", ward: "Private Suites", category: "Private", activeIdx: true },
    { bedNumber: "PR-302", ward: "Private Suites", category: "Private", activeIdx: false },
    { bedNumber: "PR-303", ward: "Private Suites", category: "Private", activeIdx: false },
    { bedNumber: "ICU-01", ward: "Critical Care ICU", category: "ICU", activeIdx: true },
    { bedNumber: "ICU-02", ward: "Critical Care ICU", category: "ICU", activeIdx: false },
    { bedNumber: "ICU-03", ward: "Critical Care ICU", category: "ICU", activeIdx: false }, // INACTIVE
  ];

  const activeAdmissionCount = Math.min(5, Math.max(profile.todayIpCount, 4));
  let assignedOccupied = 0;
  const beds = bedConfigs.map((b, idx) => {
    let status: string = BED_STATUS.AVAILABLE;
    if (idx === bedConfigs.length - 1) {
      status = BED_STATUS.INACTIVE;
    } else if (b.activeIdx && assignedOccupied < activeAdmissionCount) {
      status = BED_STATUS.OCCUPIED;
      assignedOccupied++;
    }
    return {
      id: uid("bed"),
      hospitalId,
      bedNumber: b.bedNumber,
      ward: b.ward,
      category: b.category,
      status,
    };
  });
  // If we still need more occupied beds for activeAdmissionCount:
  for (const b of beds) {
    if (assignedOccupied >= activeAdmissionCount) break;
    if (b.status === BED_STATUS.AVAILABLE) {
      b.status = BED_STATUS.OCCUPIED;
      assignedOccupied++;
    }
  }
  await prisma.bed.createMany({ data: beds });

  // Generate 130-155 unique Patients + OP visits across today and past 45 days
  const usedUhids = new Set<string>();
  const patients: Array<{
    id: string;
    hospitalId: string;
    uhid: string;
    fullName: string;
    age: number;
    gender: string;
    phone: string;
    registeredAt: Date;
    createdByUserId: string;
  }> = [];

  const opVisits: Array<{
    id: string;
    hospitalId: string;
    visitNumber: string;
    patientId: string;
    doctorId: string;
    doctorNameSnapshot: string;
    departmentSnapshot: string | null;
    visitDate: Date;
    consultationFee: number;
    registrationFee: number;
    totalAmount: number;
    paymentMode: string;
    paymentStatus: string;
    createdByUserId: string;
  }> = [];

  const billingReceipts: Array<{
    id: string;
    hospitalId: string;
    receiptNumber: string;
    patientId: string;
    opVisitId: string | null;
    ipAdmissionId: string | null;
    hospitalNameSnapshot: string;
    hospitalAddressSnapshot: string | null;
    hospitalPhoneSnapshot: string | null;
    hospitalEmailSnapshot: string | null;
    patientUhidSnapshot: string;
    patientNameSnapshot: string;
    visitSummarySnapshot: string;
    lineItemsJson: string;
    totalAmount: number;
    paymentMode: string;
    paymentStatus: string;
    issuedAt: Date;
    issuedByUserId: string;
    issuedByNameSnapshot: string;
  }> = [];

  const staffActors = [
    { id: adminUserId, name: `${profile.name.split(" ")[0]} Admin` },
    { id: rec1Id, name: "Front Desk Reception 1" },
    { id: rec2Id, name: "Front Desk Reception 2" },
  ];
  const payModes = ["UPI", "CASH", "CARD"] as const;

  for (let i = 0; i < profile.patientCount; i++) {
    let uhid = "";
    while (!uhid || usedUhids.has(uhid)) {
      uhid = String(10_000_000 + Math.floor(rng() * 90_000_000));
    }
    usedUhids.add(uhid);

    const isFemale = rng() > 0.48;
    const fullName = `${pick(rng, isFemale ? FIRST_NAMES_F : FIRST_NAMES_M)} ${pick(rng, LAST_NAMES)}`;
    const age = randInt(rng, 2, 82);
    const gender = isFemale ? "FEMALE" : "MALE";
    const phone = `+91 9${randInt(rng, 100000000, 999999999)}`;

    // First todayOpCount patients are registered TODAY so Today KPIs & limit alerts match accurately
    const isToday = i < profile.todayOpCount;
    const daysBack = isToday ? 0 : randInt(rng, 1, 45);
    const regAt = isToday
      ? hoursAgo(0, randInt(rng, 0, Math.max(1, new Date().getHours())), randInt(rng, 0, 59))
      : hoursAgo(daysBack, randInt(rng, 8, 20), randInt(rng, 0, 59));

    const actor = pick(rng, staffActors);
    const patientId = uid("pat");
    patients.push({
      id: patientId,
      hospitalId,
      uhid,
      fullName,
      age,
      gender,
      phone,
      registeredAt: regAt,
      createdByUserId: actor.id,
    });

    // Primary OP visit on registration
    const doc = pick(rng, doctors);
    const fee = doc.consultationFee ?? profile.defaultConsultationFee;
    const payMode = pick(rng, payModes);
    const visitId = uid("opv");
    const visitNumber = `OP-${profile.code}-${currentYear}-${pad4(opSeq++)}`;
    opVisits.push({
      id: visitId,
      hospitalId,
      visitNumber,
      patientId,
      doctorId: doc.id,
      doctorNameSnapshot: doc.name,
      departmentSnapshot: doc.specialty ?? null,
      visitDate: regAt,
      consultationFee: fee,
      registrationFee: 0,
      totalAmount: fee,
      paymentMode: payMode,
      paymentStatus: "PAID",
      createdByUserId: actor.id,
    });

    billingReceipts.push({
      id: uid("rcp"),
      hospitalId,
      receiptNumber: `RCP-${profile.code}-${currentYear}-${pad4(receiptSeq++)}`,
      patientId,
      opVisitId: visitId,
      ipAdmissionId: null,
      hospitalNameSnapshot: profile.name,
      hospitalAddressSnapshot: profile.address,
      hospitalPhoneSnapshot: profile.phone,
      hospitalEmailSnapshot: profile.email,
      patientUhidSnapshot: uhid,
      patientNameSnapshot: fullName,
      visitSummarySnapshot: `${visitNumber} · ${doc.name} (${doc.specialty})`,
      lineItemsJson: JSON.stringify([
        { label: `OP Consultation (${doc.name})`, amount: fee },
      ]),
      totalAmount: fee,
      paymentMode: payMode,
      paymentStatus: "PAID",
      issuedAt: regAt,
      issuedByUserId: actor.id,
      issuedByNameSnapshot: actor.name,
    });

    // Add a repeat OP visit for ~18% of non-today patients
    if (!isToday && daysBack > 5 && rng() < 0.18) {
      const repeatDaysBack = randInt(rng, 1, daysBack - 1);
      const repeatDate = hoursAgo(repeatDaysBack, randInt(rng, 9, 19), randInt(rng, 0, 59));
      const doc2 = pick(rng, doctors);
      const fee2 = doc2.consultationFee ?? profile.defaultConsultationFee;
      const payMode2 = pick(rng, payModes);
      const visitId2 = uid("opv");
      const visitNumber2 = `OP-${profile.code}-${currentYear}-${pad4(opSeq++)}`;
      opVisits.push({
        id: visitId2,
        hospitalId,
        visitNumber: visitNumber2,
        patientId,
        doctorId: doc2.id,
        doctorNameSnapshot: doc2.name,
        departmentSnapshot: doc2.specialty ?? null,
        visitDate: repeatDate,
        consultationFee: fee2,
        registrationFee: 0,
        totalAmount: fee2,
        paymentMode: payMode2,
        paymentStatus: "PAID",
        createdByUserId: actor.id,
      });
      billingReceipts.push({
        id: uid("rcp"),
        hospitalId,
        receiptNumber: `RCP-${profile.code}-${currentYear}-${pad4(receiptSeq++)}`,
        patientId,
        opVisitId: visitId2,
        ipAdmissionId: null,
        hospitalNameSnapshot: profile.name,
        hospitalAddressSnapshot: profile.address,
        hospitalPhoneSnapshot: profile.phone,
        hospitalEmailSnapshot: profile.email,
        patientUhidSnapshot: uhid,
        patientNameSnapshot: fullName,
        visitSummarySnapshot: `${visitNumber2} · Follow-up with ${doc2.name}`,
        lineItemsJson: JSON.stringify([
          { label: `OP Follow-up (${doc2.name})`, amount: fee2 },
        ]),
        totalAmount: fee2,
        paymentMode: payMode2,
        paymentStatus: "PAID",
        issuedAt: repeatDate,
        issuedByUserId: actor.id,
        issuedByNameSnapshot: actor.name,
      });
    }
  }

  await chunkCreateMany((chunk) => prisma.patient.createMany({ data: chunk }), patients);
  await chunkCreateMany((chunk) => prisma.opVisit.createMany({ data: chunk }), opVisits);

  // Create IP Admissions: active (matching OCCUPIED beds + todayIpCount today) + 18 discharged historical
  const occupiedBeds = beds.filter((b) => b.status === BED_STATUS.OCCUPIED);
  const nonInactiveBeds = beds.filter((b) => b.status !== BED_STATUS.INACTIVE);
  const ipAdmissions: Array<{
    id: string;
    hospitalId: string;
    admissionNumber: string;
    patientId: string;
    bedId: string;
    doctorId: string;
    doctorNameSnapshot: string;
    wardSnapshot: string;
    bedNumberSnapshot: string;
    admittedAt: Date;
    dischargedAt: Date | null;
    status: string;
    chargeAmount: number | null;
    admissionNotes: string | null;
    dischargeNotes: string | null;
    admittedByUserId: string;
    dischargedByUserId: string | null;
  }> = [];

  const bedTransfers: Array<{
    id: string;
    hospitalId: string;
    ipAdmissionId: string;
    fromBedId: string | null;
    fromBedLabel: string | null;
    toBedId: string;
    toBedLabel: string;
    reason: string | null;
    transferredAt: Date;
    transferredByUserId: string;
  }> = [];

  // Active IP admissions (one per occupied bed; first `todayIpCount` admitted TODAY)
  for (let i = 0; i < occupiedBeds.length; i++) {
    const bed = occupiedBeds[i];
    const pat = patients[i];
    const doc = pick(rng, doctors);
    const admAt =
      i < profile.todayIpCount
        ? hoursAgo(0, randInt(rng, 0, Math.max(1, new Date().getHours())), randInt(rng, 0, 50))
        : hoursAgo(randInt(rng, 1, 5), randInt(rng, 8, 21), randInt(rng, 0, 59));
    const admId = uid("ipa");
    const admissionNumber = `IP-${profile.code}-${currentYear}-${pad4(ipSeq++)}`;
    ipAdmissions.push({
      id: admId,
      hospitalId,
      admissionNumber,
      patientId: pat.id,
      bedId: bed.id,
      doctorId: doc.id,
      doctorNameSnapshot: doc.name,
      wardSnapshot: bed.ward,
      bedNumberSnapshot: bed.bedNumber,
      admittedAt: admAt,
      dischargedAt: null,
      status: IP_STATUS.ADMITTED,
      chargeAmount: null,
      admissionNotes: pick(rng, ADMISSION_DIAGNOSES),
      dischargeNotes: null,
      admittedByUserId: adminUserId,
      dischargedByUserId: null,
    });
  }

  // Discharged IP admissions (18 historical admissions across days 4..42)
  for (let i = 0; i < 18; i++) {
    const pat = patients[Math.min(patients.length - 1, 20 + i * 5)];
    const doc = pick(rng, doctors);
    const finalBed = pick(rng, nonInactiveBeds);
    const initialBed = pick(rng, nonInactiveBeds);
    const admitDaysBack = randInt(rng, 6, 42);
    const stayDays = randInt(rng, 2, 5);
    const admAt = hoursAgo(admitDaysBack, randInt(rng, 9, 20), randInt(rng, 0, 59));
    const disAt = hoursAgo(Math.max(1, admitDaysBack - stayDays), randInt(rng, 10, 17), randInt(rng, 0, 59));
    const charge = randInt(rng, 12, 85) * 1000;
    const admId = uid("ipa");
    const admissionNumber = `IP-${profile.code}-${currentYear}-${pad4(ipSeq++)}`;

    ipAdmissions.push({
      id: admId,
      hospitalId,
      admissionNumber,
      patientId: pat.id,
      bedId: finalBed.id,
      doctorId: doc.id,
      doctorNameSnapshot: doc.name,
      wardSnapshot: finalBed.ward,
      bedNumberSnapshot: finalBed.bedNumber,
      admittedAt: admAt,
      dischargedAt: disAt,
      status: IP_STATUS.DISCHARGED,
      chargeAmount: charge,
      admissionNotes: pick(rng, ADMISSION_DIAGNOSES),
      dischargeNotes: pick(rng, DISCHARGE_SUMMARIES),
      admittedByUserId: adminUserId,
      dischargedByUserId: adminUserId,
    });

    if (initialBed.id !== finalBed.id && i % 2 === 0) {
      bedTransfers.push({
        id: uid("trf"),
        hospitalId,
        ipAdmissionId: admId,
        fromBedId: initialBed.id,
        fromBedLabel: `${initialBed.ward} / ${initialBed.bedNumber}`,
        toBedId: finalBed.id,
        toBedLabel: `${finalBed.ward} / ${finalBed.bedNumber}`,
        reason: "Step-down / patient room category preference",
        transferredAt: new Date(admAt.getTime() + 18 * 3600_000),
        transferredByUserId: adminUserId,
      });
    }

    billingReceipts.push({
      id: uid("rcp"),
      hospitalId,
      receiptNumber: `RCP-${profile.code}-${currentYear}-${pad4(receiptSeq++)}`,
      patientId: pat.id,
      opVisitId: null,
      ipAdmissionId: admId,
      hospitalNameSnapshot: profile.name,
      hospitalAddressSnapshot: profile.address,
      hospitalPhoneSnapshot: profile.phone,
      hospitalEmailSnapshot: profile.email,
      patientUhidSnapshot: pat.uhid,
      patientNameSnapshot: pat.fullName,
      visitSummarySnapshot: `${admissionNumber} · Inpatient Discharge (${finalBed.ward} / ${finalBed.bedNumber})`,
      lineItemsJson: JSON.stringify([
        { label: `IP Care & Bed Charges (${stayDays} days)`, amount: charge },
      ]),
      totalAmount: charge,
      paymentMode: pick(rng, payModes),
      paymentStatus: "PAID",
      issuedAt: disAt,
      issuedByUserId: adminUserId,
      issuedByNameSnapshot: `${profile.name.split(" ")[0]} Admin`,
    });
  }

  await chunkCreateMany((chunk) => prisma.ipAdmission.createMany({ data: chunk }), ipAdmissions);
  await chunkCreateMany((chunk) => prisma.bedTransfer.createMany({ data: chunk }), bedTransfers);
  await chunkCreateMany((chunk) => prisma.billingReceipt.createMany({ data: chunk }), billingReceipts);

  // Create 36 Pharmacy Referrals + items per hospital
  const pharmRefs: Array<{
    id: string;
    hospitalId: string;
    referralNumber: string;
    patientId: string;
    pharmacyAccountId: string;
    opVisitId: string | null;
    patientNameSnapshot: string;
    patientUhidSnapshot: string;
    patientPhoneSnapshot: string;
    pharmacyNameSnapshot: string;
    notes: string | null;
    totalAmount: number | null;
    status: string;
    referredAt: Date;
    referredByUserId: string;
    completedAt: Date | null;
    completedByUserId: string | null;
    completedByNameSnapshot: string | null;
  }> = [];

  const pharmItems: Array<{
    id: string;
    hospitalId: string;
    referralId: string;
    medicineCatalogId: string;
    medicineNameSnapshot: string;
    descriptionSnapshot: string | null;
    quantity: number;
    unitPriceSnapshot: number;
    lineTotal: number;
    dosageInstructions: string | null;
  }> = [];

  const dosages = [
    "1 tab twice daily after food x 5 days",
    "1 tab once daily morning x 15 days",
    "1 cap before breakfast x 10 days",
    "SOS for fever / pain",
    "5ml thrice daily x 5 days",
  ];

  for (let i = 0; i < 36; i++) {
    const patIdx = Math.min(patients.length - 1, Math.floor((i * patients.length) / 36));
    const pat = patients[patIdx];
    const visit = opVisits.find((v) => v.patientId === pat.id);
    const pharm = pharmacyAccounts[i % pharmacyAccounts.length];
    const isCompleted = i < 25;
    const isCancelled = i >= 34;
    const status = isCompleted
      ? REFERRAL_STATUS.COMPLETED
      : isCancelled
        ? REFERRAL_STATUS.CANCELLED
        : REFERRAL_STATUS.PENDING;

    const refAt =
      i < 4
        ? hoursAgo(0, randInt(rng, 0, Math.max(1, new Date().getHours())), randInt(rng, 0, 50))
        : new Date(pat.registeredAt.getTime() + 15 * 60_000);
    const refId = uid("phr");
    const referralNumber = `PHR-${profile.code}-${currentYear}-${pad4(pharmSeq++)}`;

    const itemCount = randInt(rng, 2, 4);
    let computedTotal = 0;
    const chosenIndices = new Set<number>();
    while (chosenIndices.size < itemCount) {
      chosenIndices.add(randInt(rng, 0, medicines.length - 1));
    }

    for (const mIdx of chosenIndices) {
      const med = medicines[mIdx];
      const qty = randInt(rng, 1, 3);
      const lineTotal = (med.price ?? 100) * qty;
      computedTotal += lineTotal;
      pharmItems.push({
        id: uid("phi"),
        hospitalId,
        referralId: refId,
        medicineCatalogId: med.id,
        medicineNameSnapshot: med.name,
        descriptionSnapshot: med.description,
        quantity: qty,
        unitPriceSnapshot: med.price ?? 100,
        lineTotal,
        dosageInstructions: pick(rng, dosages),
      });
    }

    const completedAt = isCompleted
      ? new Date(Math.min(Date.now(), refAt.getTime() + randInt(rng, 20, 140) * 60_000))
      : null;

    pharmRefs.push({
      id: refId,
      hospitalId,
      referralNumber,
      patientId: pat.id,
      pharmacyAccountId: pharm.id,
      opVisitId: visit?.id ?? null,
      patientNameSnapshot: pat.fullName,
      patientUhidSnapshot: pat.uhid,
      patientPhoneSnapshot: pat.phone,
      pharmacyNameSnapshot: pharm.pharmacyName,
      notes: pick(rng, REASONS_FOR_VISIT),
      totalAmount: isCompleted ? computedTotal : null,
      status,
      referredAt: refAt,
      referredByUserId: adminUserId,
      completedAt,
      completedByUserId: isCompleted ? pharm.userId : null,
      completedByNameSnapshot: isCompleted ? pharm.contactPerson : null,
    });
  }

  await chunkCreateMany((chunk) => prisma.pharmacyReferral.createMany({ data: chunk }), pharmRefs);
  await chunkCreateMany((chunk) => prisma.pharmacyReferralItem.createMany({ data: chunk }), pharmItems);

  // Create 30 Lab Referrals + items per hospital
  const labRefs: Array<{
    id: string;
    hospitalId: string;
    referralNumber: string;
    patientId: string;
    labAccountId: string;
    opVisitId: string | null;
    patientNameSnapshot: string;
    patientUhidSnapshot: string;
    patientPhoneSnapshot: string;
    labNameSnapshot: string;
    notes: string | null;
    totalAmount: number | null;
    status: string;
    referredAt: Date;
    referredByUserId: string;
    completedAt: Date | null;
    completedByUserId: string | null;
    completedByNameSnapshot: string | null;
  }> = [];

  const labItems: Array<{
    id: string;
    hospitalId: string;
    referralId: string;
    labTestCatalogId: string;
    testNameSnapshot: string;
    descriptionSnapshot: string | null;
    unitPriceSnapshot: number;
  }> = [];

  for (let i = 0; i < 30; i++) {
    const patIdx = Math.min(patients.length - 1, Math.floor((i * patients.length) / 30));
    const pat = patients[patIdx];
    const visit = opVisits.find((v) => v.patientId === pat.id);
    const lab = labAccounts[i % labAccounts.length];
    const isCompleted = i < 21;
    const isCancelled = i >= 28;
    const status = isCompleted
      ? REFERRAL_STATUS.COMPLETED
      : isCancelled
        ? REFERRAL_STATUS.CANCELLED
        : REFERRAL_STATUS.PENDING;

    const refAt =
      i < 4
        ? hoursAgo(0, randInt(rng, 0, Math.max(1, new Date().getHours())), randInt(rng, 0, 50))
        : new Date(pat.registeredAt.getTime() + 20 * 60_000);
    const refId = uid("lbr");
    const referralNumber = `LAB-${profile.code}-${currentYear}-${pad4(labSeq++)}`;

    const itemCount = randInt(rng, 1, 3);
    let computedTotal = 0;
    const chosenIndices = new Set<number>();
    while (chosenIndices.size < itemCount) {
      chosenIndices.add(randInt(rng, 0, labTests.length - 1));
    }

    for (const tIdx of chosenIndices) {
      const tst = labTests[tIdx];
      computedTotal += tst.price ?? 400;
      labItems.push({
        id: uid("lbi"),
        hospitalId,
        referralId: refId,
        labTestCatalogId: tst.id,
        testNameSnapshot: tst.name,
        descriptionSnapshot: tst.description,
        unitPriceSnapshot: tst.price ?? 400,
      });
    }

    const completedAt = isCompleted
      ? new Date(Math.min(Date.now(), refAt.getTime() + randInt(rng, 35, 240) * 60_000))
      : null;

    labRefs.push({
      id: refId,
      hospitalId,
      referralNumber,
      patientId: pat.id,
      labAccountId: lab.id,
      opVisitId: visit?.id ?? null,
      patientNameSnapshot: pat.fullName,
      patientUhidSnapshot: pat.uhid,
      patientPhoneSnapshot: pat.phone,
      labNameSnapshot: lab.labName,
      notes: "Diagnostic evaluation ordered post OP consult",
      totalAmount: isCompleted ? computedTotal : null,
      status,
      referredAt: refAt,
      referredByUserId: adminUserId,
      completedAt,
      completedByUserId: isCompleted ? lab.userId : null,
      completedByNameSnapshot: isCompleted ? lab.contactPerson : null,
    });
  }

  await chunkCreateMany((chunk) => prisma.labReferral.createMany({ data: chunk }), labRefs);
  await chunkCreateMany((chunk) => prisma.labReferralItem.createMany({ data: chunk }), labItems);

  // Sync Hospital sequence numbers cleanly so future manual entries never collide
  await prisma.hospital.update({
    where: { id: hospitalId },
    data: {
      nextUhidSeq: profile.patientCount + 1,
      nextOpSeq: opSeq,
      nextIpSeq: ipSeq,
      nextPharmRefSeq: pharmSeq,
      nextLabRefSeq: labSeq,
      nextReceiptSeq: receiptSeq,
    },
  });

  // Create realistic recent AuditLog entries for this hospital
  const auditLogsToCreate = [
    {
      id: uid("aud"),
      eventId: `EVT-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
      hospitalId,
      actorUserId: null,
      actorUsername: "abhinav",
      actorRole: ROLES.SUPER_ADMIN,
      actionType: "HOSPITAL_CREATED",
      referenceId: profile.code,
      details: `Onboarded "${profile.name}" (${profile.code}) in ${profile.city} with OP limit ${profile.dailyOpLimit}/day and IP limit ${profile.dailyIpLimit}/day.`,
      createdAt: hoursAgo(2, 10, randInt(rng, 10, 50)),
    },
    ...patients.slice(0, 4).map((p, idx) => ({
      id: uid("aud"),
      eventId: `EVT-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
      hospitalId,
      actorUserId: adminUserId,
      actorUsername: `${profile.slug}.admin`,
      actorRole: ROLES.HOSPITAL_ADMIN,
      actionType: "OP_REGISTERED",
      patientId: p.id,
      patientUhid: p.uhid,
      referenceId: opVisits[idx]?.visitNumber ?? null,
      details: `Registered patient ${p.fullName} (UHID ${p.uhid}) for OP consultation.`,
      createdAt: p.registeredAt,
    })),
    ...ipAdmissions.slice(0, 2).map((adm) => ({
      id: uid("aud"),
      eventId: `EVT-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
      hospitalId,
      actorUserId: adminUserId,
      actorUsername: `${profile.slug}.admin`,
      actorRole: ROLES.HOSPITAL_ADMIN,
      actionType: "IP_ADMITTED",
      patientId: adm.patientId,
      referenceId: adm.admissionNumber,
      details: `Admitted patient to ${adm.wardSnapshot} (${adm.bedNumberSnapshot}) under ${adm.doctorNameSnapshot}.`,
      createdAt: adm.admittedAt,
    })),
    {
      id: uid("aud"),
      eventId: `EVT-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
      hospitalId,
      actorUserId: pharmacyAccounts[0].userId,
      actorUsername: `${profile.slug}.pharm1`,
      actorRole: ROLES.PHARMACY_USER,
      actionType: "PHARMACY_REFERRAL_COMPLETED",
      patientId: pharmRefs[0].patientId,
      patientUhid: pharmRefs[0].patientUhidSnapshot,
      referenceId: pharmRefs[0].referralNumber,
      details: `Completed pharmacy referral ${pharmRefs[0].referralNumber} (₹${pharmRefs[0].totalAmount}).`,
      createdAt: pharmRefs[0].completedAt ?? new Date(),
    },
    {
      id: uid("aud"),
      eventId: `EVT-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
      hospitalId,
      actorUserId: labAccounts[0].userId,
      actorUsername: `${profile.slug}.lab1`,
      actorRole: ROLES.LAB_USER,
      actionType: "LAB_REFERRAL_COMPLETED",
      patientId: labRefs[0].patientId,
      patientUhid: labRefs[0].patientUhidSnapshot,
      referenceId: labRefs[0].referralNumber,
      details: `Completed diagnostic referral ${labRefs[0].referralNumber} (₹${labRefs[0].totalAmount}).`,
      createdAt: labRefs[0].completedAt ?? new Date(),
    },
  ];
  await prisma.auditLog.createMany({ data: auditLogsToCreate });

  console.log(
    `[SEEDED] ${profile.code} (${profile.name}) — ${patients.length} patients, ${opVisits.length} OP visits, ${ipAdmissions.length} IP admissions, ${pharmRefs.length} Pharm refs, ${labRefs.length} Lab refs`
  );
  return true;
}

async function main() {
  console.log("Precomputing demo password hash...");
  const demoPasswordHash = await hashPassword("DemoPass!123");

  let added = 0;
  for (const profile of HOSPITAL_PROFILES) {
    const created = await seedHospital(profile, demoPasswordHash);
    if (created) added++;
  }

  // Enforce global cap of 100 most recent AuditLog entries
  await prunePlatformAuditLogs(prisma, MAX_PLATFORM_RECENT_ACTIVITY);

  const [
    totalHospitals,
    totalUsers,
    totalPatients,
    totalOpVisits,
    totalIpAdmissions,
    totalPharmRefs,
    totalLabRefs,
    totalAuditLogs,
  ] = await Promise.all([
    prisma.hospital.count(),
    prisma.user.count(),
    prisma.patient.count(),
    prisma.opVisit.count(),
    prisma.ipAdmission.count(),
    prisma.pharmacyReferral.count(),
    prisma.labReferral.count(),
    prisma.auditLog.count(),
  ]);

  console.log("\n=== DATABASE SUMMARY ===");
  console.log(`Newly added hospitals : ${added}`);
  console.log(`Total Hospitals       : ${totalHospitals}`);
  console.log(`Total Users           : ${totalUsers}`);
  console.log(`Total Patients        : ${totalPatients}`);
  console.log(`Total OP Visits       : ${totalOpVisits}`);
  console.log(`Total IP Admissions   : ${totalIpAdmissions}`);
  console.log(`Total Pharm Referrals : ${totalPharmRefs}`);
  console.log(`Total Lab Referrals   : ${totalLabRefs}`);
  console.log(`Total AuditLogs (cap) : ${totalAuditLogs} (limit ${MAX_PLATFORM_RECENT_ACTIVITY})`);
  console.log("Shared password for newly seeded demo accounts: DemoPass!123");
}

main()
  .catch((err) => {
    console.error("Seed error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
