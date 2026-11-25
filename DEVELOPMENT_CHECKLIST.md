# VerdantCare HMS — Implementation Checklist

- [x] **PHASE 1**: Project architecture, normalized multi-tenant Prisma schema (SQLite local + PostgreSQL production mirror), initial migrations, session authentication & RBAC guards
- [x] **PHASE 2**: Nature-inspired light design system (`globals.css`, typography, Framer Motion spring primitives, landing/portal login gateway, responsive sidebar shells)
- [x] **PHASE 3**: Super Admin portal (platform analytics, hospital lifecycle, account visibility & immediate hospital deactivation/session revocation, JSON backup export & transactional restore)
- [x] **PHASE 4**: Hospital Admin dashboard, OP Registration + UHID generation + OP Consultation Sheet & Billing Receipt print views, IP Management (transaction-safe beds, admissions, transfers, discharges)
- [x] **PHASE 5**: Pharmacy referral management (catalogue without stock/batch/expiry, referral creation with snapshots, pharmacy account management) & external Pharmacy portal (`MARK AS COMPLETED`)
- [x] **PHASE 6**: Laboratory referral management (test catalogue, referral creation with snapshots, lab account management) & external Lab portal (`MARK AS COMPLETED`)
- [x] **PHASE 7**: Receptionist portal & backend permission restrictions, History & Transactions (append-only Operational Audit History + clickable UHID Patient History timeline & document reprints), Portal Settings & Password Change security events
- [x] **PHASE 8**: Reports & analytics (CSV export, date filtering, optional referral value vs commission distinction), backup/restore audit verification
- [x] **PHASE 9**: End-to-end integration tests, security & tenant-isolation checks, responsive UI & print verification, `START_HOSPITAL_SAAS.command`, `START_HOSPITAL_SAAS.bat`, `README.md`
