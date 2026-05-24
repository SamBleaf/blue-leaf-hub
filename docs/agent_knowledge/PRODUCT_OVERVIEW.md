# Blue Leaf Hub — Product Overview

> Last updated: 2026-05-21
> Maintained by: AI product agent. Update after every significant change.

---

## What Blue Leaf Hub Is

Blue Leaf Hub is the construction operating system for **Blue Leaf Building** (Adelaide, SA). It is not a collection of tools — it is a single, integrated system designed to manage every stage of a construction business: from the first client enquiry through to post-handover warranty.

It is a **React 18 + Vite PWA** on the frontend, an **Express API** on the backend, a **Supabase PostgreSQL** database, and **Claude AI** (Anthropic) embedded throughout for intelligence at every step.

---

## Company Context

- **Blue Leaf Building** — residential construction company, Adelaide, South Australia
- **Owner/Admin**: sam@blueleafbuilding.com.au
- **Process framework**: APB (Association of Professional Builders) — 8-stage sales pipeline
- **Core estimating tool**: Buildexact (third-party, integrated)
- **File storage**: Dropbox (internal), Google Drive (client documents)
- **Accounting**: Xero (planned integration)

---

## Business Intent

Blue Leaf Hub is intended to:

1. Eliminate manual, duplicated admin work across sales, tendering, operations, and finance
2. Give Blue Leaf Building complete visibility over every project — from lead to handover
3. Enable better client experience through the Client Portal
4. Surface construction intelligence from historical data
5. Allow AI (Blueprint) to coach, automate, and improve decisions

The system is designed so that **data entered once flows everywhere it is needed** — a project address, a contract value, a schedule — without re-entry.

---

## User Roles

| Role | Description | Access |
|------|-------------|--------|
| `admin` | Company principal / office manager | Full access to all modules |
| `supervisor` | Site supervisor | Operations, Schedule, WHS, Site Diary, limited Finance |
| `employee` | Staff member | Limited view access |
| `client` | Homeowner / project client | Client Portal only (token-based, no app login) |

---

## Module Summary

| Module | Route | Status | Purpose |
|--------|-------|--------|---------|
| Sales Manager | `/sales` | Complete | Lead pipeline, APB coaching, transcript analysis |
| Tender Manager | `/tender-manager` | Complete | RFQ, fee proposals, subcontractors |
| RFQ Engine | `/tender-manager/rfq-engine` | Complete | Create RFQs, extract scopes with AI |
| RFQ Packages | `/tender-manager/rfq-packages` | Complete | Multi-trade RFQ package management |
| Tender Board | `/tender-manager/board` | Complete | Kanban/list of all jobs |
| Cost Intelligence | `/tender-manager/cost-intelligence` | Expanding | Pre-tender estimates, benchmarks |
| Fee Proposals | `/tender-manager/fee-proposal` | Complete | XLSX/PDF import, DOCX generation, email |
| Subcontractors | `/tender-manager/subcontractors` | Complete | Trade directory, compliance |
| Operations | `/operations` | Complete (Sprint 1) | Active project list, global Gantt |
| Schedule Manager | `/operations/:id/schedule` | Complete (Sprint 1) | Gantt, Sheet, Calendar, Delays, Dep Map |
| WHS Manager | `/operations/:id/whs` | Complete | Compliance, inductions, SWMS, incidents |
| Site Diary | `/operations/:id/diary` | Complete | Daily diary, voice capture, AI structuring |
| Finance Manager | `/finance` | Expanding | Invoice inbox, approval queue |
| Job Command Centre | `/finance/jobs/:id` | Expanding | Per-job budget, claims, variations |
| Client Portal | `/portal/:token` | Expanding | Client-facing progress, photos, decisions |
| Portal Admin | `/portal-admin` | Expanding | Internal portal management |
| Blueprint AI | Global widget | Complete | AI assistant, coaching, SOPs, QC |
| Settings | `/tender-manager/settings` | Complete | RFQ defaults, integration config |
| User Management | `/settings/users` | Complete | Invite, manage roles |
| Site Induction | `/induct/:projectId` | Complete | Public QR form for site visitors |

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, React Router v6, Tailwind CSS, Vite (PWA) |
| Backend | Express.js (Node 20+) |
| Database | Supabase (PostgreSQL), Auth, RLS |
| AI | Anthropic Claude (claude-sonnet-4-6, claude-opus-4-5) |
| PDF | PDFKit (server-side) |
| Word | docxtemplater v3, angular-expressions |
| Charts | Recharts |
| Gantt | gantt-task-react |
| Flow | @xyflow/react (dependency map) |
| Email | Gmail OAuth (primary), SMTP (fallback), IMAP (inbound) |
| Storage | Dropbox (internal), Google Drive (client docs) |
| Estimating | Buildexact API |
| Hosting | Vercel (frontend) + Railway (API) |

---

## Design Principles

See `PRODUCT_PRINCIPLES.md` for full detail. Summary:

- **Project-first** — everything revolves around the active project
- **Extract once, reuse everywhere** — no duplicate data entry
- **AI augments, not replaces** — Blueprint coaches, suggests, extracts
- **Mobile-aware** — key supervisor flows work on phone
- **Client portal hides internal complexity** — clean client experience

---

## Current Sprint Status (as at 2026-05-21)

- **Sprint 1** (Schedule) — Complete: Gantt, Sheet, Calendar, colour coding, context menu, drag/resize
- **Sprint 2** (Schedule intelligence) — Next: baseline ghost bars, EOT tracking (migration 018)
- **Sprint 3** (Dependencies) — Planned: typed dependencies overhaul, dependency map view
- **Sprint 4** (Operations overhaul) — Planned: rich project cards, global Gantt improvements
- **Sprint 5** (Client portal) — Deferred: token-based schedule sharing, variation approval
