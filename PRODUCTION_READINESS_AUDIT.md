# Clinical OS — Full Website Audit & Production Readiness Document

## Part 1: 13-Point Clinical OS Checklist Status (All Completed ✅)

1. **Enter to next tab in each tab** ✅
   - Implemented in `WalkInModal.tsx` and `AddPatientModal.tsx`: pressing `Enter` advances focus to the next form control or clinical step without unintended form submission.
2. **Remove body map option from walk in and from patient profile** ✅
   - Removed the Body Map tab and selector from both `WalkInModal.tsx` and `PatientProfileView.tsx`.
3. **Remove comparison from walk in, in clinical image section (the blue bar)** ✅
   - Removed the blue comparison banner from the Walk-In Clinical Images section.
4. **In walk in, in summary option in 6., remove comparison from there as well** ✅
   - Removed the duplicate lesion progression comparison block from Step 6 (Summary) in `WalkInModal.tsx`.
5. **Add QR image upload feature in patient profile in comparison mode and in image AI analysis as well** ✅
   - Added `MobileQrUploadModal.tsx` and backend session pairing (`/api/mobile-upload/session`) across Patient Profile, Lesion Comparison Modal, and AI Image Analyzer.
6. **Sidebar goes up while scrolling — fix it, sidebar should not move** ✅
   - Locked the app layout (`h-screen overflow-hidden`) and Sidebar (`shrink-0 h-screen sticky top-0`) so scrolling the main workspace never moves the sidebar.
7. **In comparison modal using feature on full screen gets me back to previous page — fix it** ✅
   - Fixed `FullScreenSideBySideModal.tsx` and `LesionProgressionModal.tsx` event propagation and backdrop click handling so interacting with or exiting Full-Screen Side-by-Side view stays inside the Comparison modal and never navigates back.
8. **Remove brochure from settings** ✅
   - Removed the clinic brochure card from `SettingsView.tsx`.
9. **Remove diagnosis from AI analysis tab for once only diagnosis keep rest as same** ✅
   - Updated `ImageAnalyzerView.tsx` so the diagnosis appears once in the top **Primary Clinical Impression** banner and removed the duplicate `Differential Diagnosis` list section while keeping `01. Key Visual Findings & Patient History`, `02. Recommended Workup & Treatment Plan`, and `03. Red Flags to Watch / Rule Out`.
10. **Check chat / Inbox for rest** ✅
    - Verified native Clinical OS Inbox routing, background WhatsApp message dispatch (no foreground tab interruptions), and 1-click AI Analysis PDF Report generation & delivery.
11. **Add team feature (Doctor / Receptionist Role Management)** ✅
    - Added **Clinic Team & Email Role Assignment** in `SettingsView.tsx` with full Doctor vs. Receptionist RBAC across the entire application.
12. **In dashboard next in queue add images of Day 1 and recent visit image, also add feature to click and zoom in** ✅
    - Updated the Dashboard `NEXT IN QUEUE` card (`DashboardView.tsx`) with **Day 1** and **Recent Visit** clinical thumbnails and an interactive **Click-to-Zoom Lightbox Modal** (100%–400% zoom slider + Day 1 / Recent Visit / Side-by-Side view toggle).
13. **Add team feature — all logins should be kept there** ✅
    - Centrally listed all clinic logins (Doctors and Receptionists) in `SettingsView.tsx` with role badges, email-based role assignment (`POST /api/team/assign-role`), and 1-click session switching.

---

## Part 2: Changes Required for Production Deployment (Render & Live Clinic Readiness)

To transition Clinical OS from staging/preview to a live multi-user healthcare production environment on Render, complete the following production checklist:

### 1. Database Persistence (Render Persistent Disk or Managed PostgreSQL)
- **Current Architecture**: Uses local JSON persistence (`data/clinical-os-db.json` via `server/db.ts`). On Render's ephemeral filesystem, local files outside a mounted persistent disk reset on redeploy.
- **Production Change**:
  - **Option A (Fastest on Render)**: Attach a **Render Persistent Disk** mounted at `/var/data` and set environment variable `DATA_DIR=/var/data` so `clinical-os-db.json` persists across all deployments.
  - **Option B (Recommended for Scale)**: Migrate `server/db.ts` to **Managed PostgreSQL** (Render PostgreSQL / Supabase / Google Cloud SQL) with automated daily backups and point-in-time recovery.

### 2. Cloud Object Storage for Clinical Photos & PDF Reports
- **Current Architecture**: Clinical photos, voice notes, and generated AI PDF reports are stored as Base64 `dataUrl` strings inside the JSON database.
- **Production Change**:
  - Offload binary uploads (`/api/patients/:id/images`, `/api/mobile-upload/:token`, and PDF attachments) to **AWS S3, Cloudflare R2, or Google Cloud Storage** using signed URLs, storing only the secure object URL and metadata in the database.

### 3. Production Environment Variables & Session Hardening
- **Current Architecture**: In-memory session map (`sessions` in `server.ts`) and SHA-256 demo credential hashing.
- **Production Change**:
  - Upgrade password hashing to `bcrypt` or `argon2id` and persist sessions in PostgreSQL/Redis with `HttpOnly`, `Secure`, `SameSite=Lax` cookies.
  - Set the following environment variables in Render:
    - `NODE_ENV=production`
    - `GEMINI_API_KEY=<production-gemini-api-key>`
    - `SESSION_SECRET=<strong-64-char-secret>`
    - `GOOGLE_CLIENT_ID=<production-google-oauth-client-id>`
    - `GOOGLE_CLIENT_SECRET=<production-google-oauth-client-secret>`
    - `APP_URL=https://<your-production-domain>`

### 4. Official WhatsApp Business Cloud API Integration
- **Current Architecture**: Background dispatch via `/api/inbox/send-message` and webhook listener at `/api/inbox/webhook/whatsapp`.
- **Production Change**:
  - Configure `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, and `WHATSAPP_VERIFY_TOKEN` from Meta Business Manager (or Twilio WhatsApp API).
  - Register `https://<your-production-domain>/api/inbox/webhook/whatsapp` in Meta App Dashboard and verify `X-Hub-Signature-256` headers on incoming webhooks.

### 5. Healthcare Compliance, Rate Limiting & Audit Logging (HIPAA / India DPDP Act)
- **Production Change**:
  - Add `helmet` security headers and `express-rate-limit` on `/api/auth/*`, `/api/ai/*`, and `/api/mobile-upload/*`.
  - Add an immutable `audit_logs` table recording every patient chart access, prescription sign-off, and staff role change (`actorId`, `role`, `action`, `patientId`, `timestamp`, `ip`).
