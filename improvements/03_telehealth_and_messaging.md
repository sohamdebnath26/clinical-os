# Spec 03: Telehealth & Automated Patient Messaging

## Overview
This specification details the technical evolution from universal web-link WhatsApp dispatching to automated enterprise messaging (WhatsApp Cloud API / Twilio) and digital prescription verification.

---

## 1. Enterprise WhatsApp Cloud API Integration

### Current Status
- Currently, Clinical OS uses authenticated, client-side universal links (`https://wa.me/...`) combined with backend audit logging (`POST /api/reports/log-whatsapp`).
- This allows doctors to send reports directly without needing a paid Meta WhatsApp Business account setup.

### Upgrade: Automated Server-Side WhatsApp Dispatch
For high-volume clinics wishing to dispatch reports automatically without doctor browser redirection:

```
[Doctor Signs Visit] 
       │
       ▼
[Server: POST /api/reports/whatsapp-dispatch]
       │
       ▼
[Meta WhatsApp Cloud API / Twilio Messaging API]
       │
       ▼
[Patient's WhatsApp Phone: Interactive Template Message with PDF Download]
```

### Key Capabilities:
- **Verified Clinic Account Green Checkmark**: Instills trust in patients receiving medical reports.
- **Automated 24h & 2h Appointment Reminders**: Cron schedule triggers WhatsApp reminders for upcoming visits, with interactive buttons: `[Confirm]`, `[Reschedule]`, `[Cancel]`.
- **Bidirectional Inbound Messaging**: Patients can reply with lesion follow-up photos that automatically attach to their pending encounter.

---

## 2. Digital Prescription QR Code Verification

To prevent prescription tampering and enable pharmacies to verify doctor authentication:

### Implementation:
1. **Cryptographic Signing**:
   - When a consultation is signed, generate a HMAC-SHA256 signature combining `consultationId`, `doctorId`, `patientId`, and `signedAt`.
2. **Verification QR Code**:
   - Embed a dynamic QR code on the printable prescription and WhatsApp PDF slip pointing to:
     `https://yourclinic.com/verify-rx?id={consultationId}&token={hash}`
3. **Public Verification Page**:
   - Renders a read-only, tamper-proof verification page confirming the doctor's registration number and active status.

---

## 3. Integrated Tele-Dermatology Video Encounters

For remote or follow-up consultations directly inside the browser:

### Architecture:
- Integrated WebRTC video room (using Daily.co, LiveKit, or Twilio Video).
- Split-screen layout: Doctor views the live patient video stream on the left while simultaneously charting diagnoses, viewing the body map, and prescribing on the right.
- High-resolution screen-capture tool to freeze and capture clinical photos directly from the live video feed into the image analyzer.
