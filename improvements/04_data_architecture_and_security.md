# Spec 04: Enterprise Data Layer, Scalability & Security

## Overview
This specification outlines the data layer transition path from the current lightweight JSON store to an enterprise relational SQL database (PostgreSQL / Google Cloud SQL) with strict medical regulatory compliance (HIPAA / DISHA).

---

## 1. Migration to Cloud SQL / PostgreSQL with Drizzle ORM

### Current State
`server/db.ts` uses an in-memory JSON document database backed by `data/db.json`. This provides zero-configuration local execution and rapid development.

### Enterprise Relational Schema Design
For scaled clinics with hundreds of thousands of patient records, migrate to PostgreSQL using Drizzle ORM:

```ts
// src/db/schema.ts
import { pgTable, text, integer, timestamp, jsonb, uuid } from 'drizzle-orm/pg-core';

export const doctors = pgTable('doctors', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  email: text('email').unique().notNull(),
  speciality: text('speciality').notNull(),
  registrationNumber: text('registration_number').notNull(),
  clinicName: text('clinic_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at').defaultNow()
});

export const patients = pgTable('patients', {
  id: uuid('id').defaultRandom().primaryKey(),
  patientCode: text('patient_code').unique().notNull(),
  fullName: text('full_name').notNull(),
  age: integer('age').notNull(),
  gender: text('gender').notNull(),
  mobile: text('mobile').notNull(),
  allergies: text('allergies'),
  medicalHistory: text('medical_history'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export const consultations = pgTable('consultations', {
  id: uuid('id').defaultRandom().primaryKey(),
  patientId: uuid('patient_id').references(() => patients.id).notNull(),
  doctorId: uuid('doctor_id').references(() => doctors.id).notNull(),
  status: text('status').notNull(), // 'draft' | 'signed'
  fee: integer('fee').default(500),
  symptoms: jsonb('symptoms'),
  diagnoses: jsonb('diagnoses'),
  prescriptions: jsonb('prescriptions'),
  clinicalNotes: jsonb('clinical_notes'),
  signedAt: timestamp('signed_at'),
  createdAt: timestamp('created_at').defaultNow()
});
```

---

## 2. Regulatory Compliance (HIPAA / DISHA / GDPR)

### Security Safeguards To Implement:
1. **At-Rest Field-Level Encryption**:
   - Encrypt identifiable patient fields (`fullName`, `mobile`, `address`) using AES-256-GCM before saving to disk or database.
2. **Immutable Audit Logs**:
   - Every patient record access, modification, prescription signing, and export event is logged with:
     - `actorId`, `actorRole`, `timestamp`, `ipAddress`, `resourceId`, and `actionType`.
   - Audit logs should be append-only with cryptographic hash chaining to prevent tampering.
3. **Role-Based Access Control (RBAC)**:
   - Define granular roles:
     - `Doctor / Consultant`: Full clinical charting, prescribing, and AI diagnostic capabilities.
     - `Nurse / Clinical Assistant`: Vitals entry, walk-in check-in, and photo uploading.
     - `Receptionist / Billing`: Demographics and fee management (clinical notes hidden).

---

## 3. Real-Time Multi-Device Sync

In active clinical practices, a nurse often inputs patient vitals or uploads photos on a tablet while the doctor reviews them on a desktop computer.

### Architecture:
- Mount WebSocket / Socket.io server on `server.ts`.
- Broadcast encounter update events: `encounter:photo_added`, `patient:checked_in`, `visit:signed`.
- The doctor's screen updates in real time without manual page refreshes.
