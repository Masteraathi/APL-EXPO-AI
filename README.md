# APL EXPO AI — Expo Enquiry & Lead Management Web Application

A mobile-first full-stack web application implementing the **APL EXPO AI** Expo Enquiry & Lead Management System specification.

## Implemented Capabilities

- **AI Business Card Scanner (Front & Back)**:
  - Mobile camera capture (`capture="environment"`), live desktop webcam capture, image upload, and 3 built-in sample industrial visiting cards for instant testing.
  - Secure backend Gemini Vision OCR (`local-dev/geminiExtractor.js`) with automatic Demo OCR fallback when `GEMINI_API_KEY` is not set.
  - **Non-destructive extraction**: verified fields are never silently overwritten; conflicts are surfaced for explicit human choice.
  - Explicit verification checkboxes required for AI-extracted Mobile and Email fields before saving.
- **Fast 30–60s Enquiry Capture**:
  - Live capture stopwatch, searchable multi-select product category chips (`PRODUCT_CATEGORIES`), quick-insert industrial remark tags, priority guidance (`HIGH` / `MEDIUM` / `LOW`), tentative visit date picker, and regional salesperson dropdown (`SALES_TEAM`).
  - Real-time duplicate lead detection by phone, email, or company name.
  - Unique auto-generated Enquiry IDs (`APL-YYYY-NNNN`).
- **Enquiries & Follow-Up Workspace**:
  - Search & multi-filter lead queue (Expo, Status, Priority, Salesperson, Product Category).
  - Lead Detail Drawer displaying front/back business card images, status/priority/visit-date editors, timestamped follow-up history, and related customer enquiry history.
- **Sales & Management Dashboard + Tentative Visit Calendar**:
  - KPI cards (`Total Enquiries`, `High Priority`, `Visits Planned`, `Pending Assignment`) filterable by Expo and Date Range.
  - Reports for Enquiries by Product Category (`ENQUIRY_CATEGORIES`), State/Region, Salesperson Allocation, and High-Priority Pending Follow-ups.
  - Interactive monthly Tentative Visit Calendar.
- **Masters & Sheets-Compatible Data Store**:
  - Live CRUD + active/inactive controls for `PRODUCT_CATEGORIES` and `SALES_TEAM`.
  - Automatic persistence to JSON (`data/db.json`) and 4 normalized CSV tables (`EXPO_ENQUIRIES.csv`, `PRODUCT_CATEGORIES.csv`, `SALES_TEAM.csv`, `ENQUIRY_CATEGORIES.csv`) with one-click CSV downloads.

## Quick Start

1. Optional: copy `.env.example` to `.env` and add `GEMINI_API_KEY=...` for live Gemini Vision OCR (leave blank to use Demo OCR mode).
2. Run automated tests:
   ```bash
   npm test
   ```
3. Start the web application:
   ```bash
   npm start
   ```
4. Open `http://localhost:3080` in your browser.
