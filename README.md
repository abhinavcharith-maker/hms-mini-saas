# VerdantCare HMS — Premium Mini Hospital Management & Referral SaaS

VerdantCare HMS is a commercial-quality, lightweight, multi-tenant **Hospital Management & Referral SaaS** built for small and medium hospitals. It enforces strict tenant isolation across five distinct role-based portals without enterprise bloat.

---

## Key Capabilities & Portals

1. **Super Admin (`/super-admin`)**
   - Platform-wide hospital, patient, OP/IP, and referral completion analytics.
   - Create and manage hospital tenants, inspect linked Hospital Admin, Receptionist, Pharmacy, and Laboratory accounts (never exposing plaintext passwords).
   - Activate/deactivate hospitals with **immediate session revocation** across all roles while preserving historical database records.
   - **JSON Backup & Restore**: Checksummed (SHA-256) platform-wide or single-hospital export (excluding all passwords/secrets) and transactional validation + restore (`Restore Existing Hospital` or `Import as New Hospital`).
2. **Hospital Admin (`/hospital`)**
   - Command dashboard with 7-day activity chart, bed occupancy, and security notifications.
   - **OP Registration (`/hospital/op`)**: Automatic UHID generation, repeat-visit lookup (prevents duplicate patients), optional fees (never invented), and immediate print modals.
   - **Print-Ready Documents**: Dedicated A4 **Doctor Prescription / Consultation Sheet** (`/print/op-consultation/[visitId]`) and immutable snapshot **Patient Billing Receipt** (`/print/receipt/[receiptId]`).
   - **IP Management (`/hospital/ip`)**: Visual ward bed map, transaction-safe bed assignment (prevents concurrent double-booking), bed transfers, and automatic bed release upon discharge.
   - **Pharmacy & Laboratory Referral Management (`/hospital/pharmacy`, `/hospital/laboratory`)**: Referral-only catalogues (optional prices), immutable item snapshots, and external partner login provisioning — **no** stock/batch/warehouse/reagent/diagnostic-result bloat.
   - **History & Transactions (`/hospital/history`)**: Append-only **Hospital Operational History** (searchable, filterable, CSV export) + **Patient History (Clickable UHID)** timeline (`/hospital/patients/[id]`) with historical receipt reprints.
   - **Reports & Analytics (`/hospital/reports`)**: Date-filtered OP, IP occupancy, and partner-wise referral statistics with CSV export (explicitly separating optional referral values from hospital commission).
   - **Settings (`/hospital/settings`)**: Hospital branding & logo upload for print headers, doctor directory, receptionist accounts, security alerts, and self-service password updates.
3. **Receptionist (`/hospital`)**
   - Front-desk OP registration, repeat visits, clickable UHID patient timelines, IP admission/transfer/discharge, and referral creation.
   - Strictly blocked on the backend (`403 Forbidden`) from modifying master catalogues, partner logins, hospital settings, operational audit logs, reports, or Super Admin APIs.
4. **Pharmacy Portal (`/pharmacy`)**
   - Isolated to referrals assigned to that pharmacy only. Prominently displays **"MARK AS COMPLETED"** with confirmation and immediate hospital sync.
5. **Laboratory Portal (`/laboratory`)**
   - Isolated to referrals assigned to that laboratory only. Prominently displays **"MARK AS COMPLETED"** with confirmation and immediate hospital sync.

---

## Required Software

- **Node.js** `20.x` or `24.x` (tested with Node `v24.19.0`) & **npm** `10+`
- **Local Prototyping Database**: SQLite (zero external setup required)
- **Production Database**: PostgreSQL `15+` or `16+` (via `docker-compose.yml` or managed cloud PostgreSQL)

---

## Environment Setup

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Generate a strong random `SESSION_SECRET`:
   ```bash
   openssl rand -hex 32
   ```
3. Configure `DATABASE_URL` in `.env`:
   - **Local SQLite (default)**:
     ```env
     DATABASE_URL="file:./dev.db"
     ```
   - **Production PostgreSQL**:
     ```env
     DATABASE_URL="postgresql://hms_user:STRONG_PASSWORD@localhost:5432/hms_mini_saas?schema=public"
     ```

---

## Database Setup & Migration Commands

### Local SQLite (Out of the Box)
```bash
npm install
npx prisma generate
npx prisma migrate deploy
```

### Production PostgreSQL Switch
A complete synchronized PostgreSQL schema is provided at `prisma/schema.postgres.prisma`, along with `docker-compose.yml`.
```bash
# 1. Start PostgreSQL (or point DATABASE_URL to managed Postgres)
docker compose up -d

# 2. Switch Prisma schema to PostgreSQL
cp prisma/schema.postgres.prisma prisma/schema.prisma

# 3. Push / generate migrations for PostgreSQL
npx prisma generate
npx prisma migrate dev --name init_postgres
```

---

## Creating the First Super Admin (No Hardcoded Passwords)

No default production passwords or secrets are hardcoded in source code. Initialize your first Super Admin via **either** method:

1. **Interactive Setup Wizard in Browser**:
   Start the app and open `http://localhost:3000/setup`. Once one Super Admin exists, `/setup` locks permanently (`403 Forbidden`).
2. **CLI Command**:
   ```bash
   npm run create-super-admin
   ```
   *(Optionally pass `SUPER_ADMIN_USERNAME`, `SUPER_ADMIN_NAME`, `SUPER_ADMIN_PASSWORD` via environment variables.)*

### Optional Local Demo Data
For local evaluation on an empty database, you can seed a sample hospital (`VGCH`) with randomized or env-specified credentials (`DEMO_SEED_PASSWORD`):
```bash
npm run seed:demo
```

---

## Starting the Application

### macOS One-Click Launcher
Double-click **`START_HOSPITAL_SAAS.command`** in Finder. It automatically:
- Navigates to the project directory
- Verifies Node.js/npm & `.env`
- Installs missing dependencies & runs non-destructive Prisma migrations
- Starts the production server and opens `http://localhost:3000` in your default browser

### Windows Launcher
Double-click **`START_HOSPITAL_SAAS.bat`**.

### Terminal Commands
```bash
npm run build
npm run start
```
For local development with hot reload:
```bash
npm run dev
```

---

## Accessing the 5 Portals

Open `http://localhost:3000` (or `/login`) and select the portal tab matching your account role:
- **Hospital Admin**: `/login?portal=hospital-admin`
- **Receptionist**: `/login?portal=receptionist`
- **Pharmacy Portal**: `/login?portal=pharmacy`
- **Laboratory Portal**: `/login?portal=laboratory`
- **Super Admin**: `/login?portal=super-admin`

---

## Backup & Restore Workflow

1. Sign in to **Super Admin** → **Backup & Restore** (`/super-admin/backup`).
2. **Export**: Download a full platform backup or choose a specific hospital to export a SHA-256 checksummed JSON file. Credentials, password hashes, and session tokens are never exported.
3. **Restore**: Upload the `.json` file to run schema, checksum, relational integrity, and conflict validation. Choose **Import as New Hospital** (creates an isolated tenant copy with unique IDs and one-time temporary credentials) or **Restore Existing Hospital** (requires explicit overwrite confirmation and executes inside a single atomic database transaction).

---

## Cloud Deployment Checklist

1. Provision managed PostgreSQL and set `DATABASE_URL`, `SESSION_SECRET` (64+ hex chars), `APP_URL`, and `NODE_ENV=production`.
2. Switch to `prisma/schema.postgres.prisma`, run `npx prisma migrate deploy`, and `npm run build`.
3. Create your initial Super Admin via `npm run create-super-admin` or `/setup`.
4. Serve behind HTTPS (so `HttpOnly; Secure; SameSite=Lax` session cookies are enforced).
