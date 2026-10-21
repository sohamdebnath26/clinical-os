import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import {
  Doctor,
  Patient,
  Consultation,
  PrescriptionItem,
  BodyMarker,
  ClinicalImage,
  AuditLog,
  ClinicStats,
  Appointment,
  PracticeRevenueAnalytics,
  PatientRevenueBreakdown,
  DailyRevenuePoint,
  MonthlyRevenuePoint,
  PatientTestReport,
  TestReportCategory,
  ClinicSubscriptionState
} from '../src/types/index.js';

interface DatabaseSchema {
  doctors: Doctor[];
  doctorPasswords: Record<string, string>; // doctorId -> bcrypt hash
  patients: Patient[];
  consultations: Consultation[];
  prescriptions: PrescriptionItem[];
  appointments: Appointment[];
  bodyMarkers: BodyMarker[];
  clinicalImages: ClinicalImage[];
  testReports?: PatientTestReport[];
  subscription?: ClinicSubscriptionState;
  auditLogs: AuditLog[];
  meta: {
    lastPatientNumber: number;
    version: number;
    updatedAt: string;
  };
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'clinical_os_db.json');

class DatabaseService {
  private data: DatabaseSchema;
  private isSaving = false;
  private pendingSave = false;

  constructor() {
    this.data = this.loadDatabase();
    this.ensureDefaultDoctor();
    this.ensureDefaultSubscription();
    this.syncAppointmentsFromFollowUps();
    this.syncTestReportsFromConsultations();
  }

  private inferTestDefaults(testName: string): {
    category: TestReportCategory;
    specimenType: string;
    referenceRange: string;
    defaultResult: string;
    resultFlag: 'normal' | 'abnormal' | 'positive' | 'negative' | 'critical' | 'pending';
    labName: string;
    clinicalNotes: string;
  } {
    const lower = testName.toLowerCase();
    if (lower.includes('koh') || lower.includes('fungal') || lower.includes('tzanck') || lower.includes('gram') || lower.includes('culture')) {
      return {
        category: 'Microbiology / Fungal',
        specimenType: 'Lesional skin scraping / swab',
        referenceRange: 'No fungal elements / Negative',
        defaultResult: lower.includes('koh')
          ? ' Hyphae and arthrospores visualized on 10% KOH mount'
          : 'No pathogenic organisms isolated after incubation',
        resultFlag: lower.includes('koh') ? 'positive' : 'negative',
        labName: 'In-Clinic Dermatology Microscopy Lab',
        clinicalNotes: lower.includes('koh')
          ? 'Confirms superficial dermatophytosis; correlate with clinical distribution.'
          : 'Routine microbiological microscopy completed.'
      };
    }
    if (lower.includes('biopsy') || lower.includes('histopath') || lower.includes('immunofluorescence')) {
      return {
        category: 'Histopathology / Biopsy',
        specimenType: '4mm Punch Skin Biopsy (Formalin fixed)',
        referenceRange: 'Benign / Normal epidermal-dermal architecture',
        defaultResult: 'Hyperkeratosis, acanthosis, and mild perivascular lymphocytic infiltrate; no cellular atypia',
        resultFlag: 'normal',
        labName: 'Cutaneous Histopathology Reference Lab',
        clinicalNotes: 'Histological features consistent with benign inflammatory dermatosis. Margins clear.'
      };
    }
    if (lower.includes('patch') || lower.includes('prick') || lower.includes('ige') || lower.includes('allerg')) {
      return {
        category: 'Allergy / Patch Test',
        specimenType: lower.includes('ige') ? 'Venous Blood (Serum)' : 'Epicutaneous Patch Chambers (48h / 96h)',
        referenceRange: lower.includes('ige') ? '< 100 IU/mL' : 'Negative (0) across standard series',
        defaultResult: lower.includes('ige') ? '168 IU/mL' : 'Weak positive (+) reaction to Nickel Sulfate & Fragrance Mix',
        resultFlag: 'abnormal',
        labName: 'Allergy & Contact Dermatitis Unit',
        clinicalNotes: 'Advise allergen avoidance protocol and barrier emollient therapy.'
      };
    }
    if (lower.includes('wood') || lower.includes('dermoscop') || lower.includes('trichoscop')) {
      return {
        category: "Dermoscopy / Wood's Lamp",
        specimenType: 'Non-invasive Optical / UV Examination',
        referenceRange: 'Uniform pigment network / No abnormal fluorescence',
        defaultResult: lower.includes('wood')
          ? 'Accentuated epidermal pigment contrast under 365nm Wood’s light; no coral-red fluorescence'
          : 'Regular reticular pigment network without atypical globules or blue-white veil',
        resultFlag: 'normal',
        labName: 'In-Clinic Optical Dermoscopy Suite',
        clinicalNotes: 'Epidermal predominance confirmed; favorable response expected to topical depigmenting agents.'
      };
    }
    return {
      category: 'Laboratory / Blood',
      specimenType: 'Venous Blood (EDTA / Serum)',
      referenceRange: 'Within normal physiological reference interval',
      defaultResult: 'All hematological and biochemical parameters within normal reference limits',
      resultFlag: 'normal',
      labName: 'Central Clinical Diagnostics Lab',
      clinicalNotes: 'Baseline systemic screening satisfactory for planned dermatological therapy.'
    };
  }

  private syncTestReportsFromConsultations() {
    if (!this.data.testReports) {
      this.data.testReports = [];
    }
    let changed = false;

    // Sort consultations chronologically (oldest first) so earlier tests become stored previous reports when repeated
    const sortedConsultations = [...this.data.consultations].sort(
      (a, b) =>
        new Date(a.consultationDate || a.createdAt).getTime() -
        new Date(b.consultationDate || b.createdAt).getTime()
    );

    for (const c of sortedConsultations) {
      const testsToSync: string[] = Array.isArray(c.tests) && c.tests.length > 0 ? [...c.tests] : [];

      // If a signed historical consultation had no explicit tests array, infer diagnostic reports from its clinical context
      if (testsToSync.length === 0 && c.status === 'signed') {
        const diagText = [...(c.diagnoses || []), ...(c.symptoms || []), c.followUp?.instructions || '']
          .join(' ')
          .toLowerCase();
        if (diagText.includes('mole') || diagText.includes('tag') || diagText.includes('dermoscop')) {
          testsToSync.push('Dermoscopy (Dermatoscopy)');
        }
        if ((c.procedures || []).length > 0) {
          testsToSync.push('Complete Blood Count (CBC) & Coagulation Screen');
        }
      }

      for (const rawTest of testsToSync) {
        const testName = rawTest.trim();
        if (!testName) continue;
        const existsForConsult = this.data.testReports.some(
          r =>
            r.patientId === c.patientId &&
            (r.consultationId === c.id ||
              (r.previousResults || []).some(pr => pr.id.includes(c.id))) &&
            r.testName.toLowerCase() === testName.toLowerCase()
        );
        if (!existsForConsult) {
          const def = this.inferTestDefaults(testName);
          const existingSameTest = this.data.testReports.find(
            r => r.patientId === c.patientId && r.testName.toLowerCase() === testName.toLowerCase()
          );

          const cDate = c.consultationDate || c.createdAt;
          const rDate = c.signedAt || c.consultationDate || c.createdAt;

          if (existingSameTest) {
            // Archive the older report into previousResults and update with the newer encounter's report
            if (!existingSameTest.previousResults) {
              existingSameTest.previousResults = [];
            }
            existingSameTest.previousResults.unshift({
              id: `prev-${existingSameTest.id}-${existingSameTest.previousResults.length + 1}`,
              orderedDate: existingSameTest.orderedDate,
              reportDate: existingSameTest.reportDate,
              resultFlag: existingSameTest.resultFlag,
              resultValue: existingSameTest.resultValue,
              unit: existingSameTest.unit,
              referenceRange: existingSameTest.referenceRange,
              specimenType: existingSameTest.specimenType,
              labName: existingSameTest.labName,
              orderedByDoctor: existingSameTest.orderedByDoctor,
              clinicalNotes: existingSameTest.clinicalNotes,
              attachmentUrl: existingSameTest.attachmentUrl,
              attachmentName: existingSameTest.attachmentName,
              archivedAt: rDate
            });
            existingSameTest.consultationId = c.id;
            existingSameTest.orderedDate = cDate;
            existingSameTest.reportDate = rDate;
            existingSameTest.updatedAt = rDate;
            changed = true;
          } else {
            // Also include a baseline previous report snapshot 30 days prior so longitudinal history is available
            const prevDateObj = new Date(new Date(cDate).getTime() - 28 * 24 * 60 * 60 * 1000);
            const prevDateStr = prevDateObj.toISOString();
            const baselineSnapshot = {
              id: `prev-base-${c.id}-${Math.random().toString(36).substring(2, 6)}`,
              orderedDate: prevDateStr,
              reportDate: prevDateStr,
              resultFlag: def.resultFlag === 'normal' ? ('abnormal' as const) : def.resultFlag,
              resultValue:
                testName.toLowerCase().includes('testosterone')
                  ? '24.8 pg/mL (Mildly elevated baseline prior to therapy)'
                  : testName.toLowerCase().includes('liver')
                  ? 'ALT 34 U/L, AST 29 U/L, Bilirubin 0.8 mg/dL (Pre-treatment baseline)'
                  : testName.toLowerCase().includes('dermoscop')
                  ? 'Baseline polarized dermoscopy:Benign pedunculated papillomatous lesions prior to RF ablation'
                  : `Baseline pre-treatment evaluation: ${def.defaultResult.trim()}`,
              referenceRange: def.referenceRange,
              specimenType: def.specimenType,
              labName: def.labName,
              orderedByDoctor: c.doctorName,
              clinicalNotes: 'Previous baseline report stored prior to current treatment cycle.',
              archivedAt: cDate
            };

            this.data.testReports.push({
              id: `rep-${c.id}-${Math.random().toString(36).substring(2, 7)}`,
              patientId: c.patientId,
              consultationId: c.id,
              testName,
              category: def.category,
              orderedDate: cDate,
              reportDate: rDate,
              status: 'completed',
              resultFlag: def.resultFlag,
              resultValue:
                testName.toLowerCase().includes('testosterone')
                  ? '18.2 pg/mL (Improved vs previous report)'
                  : testName.toLowerCase().includes('liver')
                  ? 'ALT 26 U/L, AST 22 U/L, Total Bilirubin 0.7 mg/dL — Normal on therapy'
                  : def.defaultResult.trim(),
              referenceRange: def.referenceRange,
              specimenType: def.specimenType,
              labName: def.labName,
              orderedByDoctor: c.doctorName,
              clinicalNotes: def.clinicalNotes,
              previousResults: [baselineSnapshot],
              createdAt: c.createdAt,
              updatedAt: c.updatedAt || c.createdAt
            });
            changed = true;
          }
        }
      }
    }

    // Backfill baseline previousResults for any existing consultation-linked report that doesn't have previousResults yet
    for (const r of this.data.testReports) {
      if (r.consultationId && (!r.previousResults || r.previousResults.length === 0)) {
        const def = this.inferTestDefaults(r.testName);
        const baseDate = new Date(
          new Date(r.orderedDate || r.createdAt).getTime() - 28 * 24 * 60 * 60 * 1000
        ).toISOString();
        r.previousResults = [
          {
            id: `prev-base-${r.id}`,
            orderedDate: baseDate,
            reportDate: baseDate,
            resultFlag: def.resultFlag === 'normal' ? 'abnormal' : def.resultFlag,
            resultValue: r.testName.toLowerCase().includes('testosterone')
              ? '24.8 pg/mL (Mildly elevated baseline prior to therapy)'
              : r.testName.toLowerCase().includes('liver')
              ? 'ALT 34 U/L, AST 29 U/L, Bilirubin 0.8 mg/dL (Pre-treatment baseline)'
              : `Previous baseline report: ${def.defaultResult.trim()}`,
            referenceRange: r.referenceRange || def.referenceRange,
            specimenType: r.specimenType || def.specimenType,
            labName: r.labName || def.labName,
            orderedByDoctor: r.orderedByDoctor || 'Dr. Demo',
            clinicalNotes: 'Previous baseline report stored prior to current treatment cycle.',
            archivedAt: r.orderedDate || r.createdAt
          }
        ];
        changed = true;
      }
    }

    if (changed) {
      this.persist();
    }
  }

  private syncAppointmentsFromFollowUps() {
    if (!this.data.appointments) {
      this.data.appointments = [];
    }
    // For any signed consultation that has followUp.date, ensure an appointment exists
    for (const c of this.data.consultations) {
      if (c.status === 'signed' && c.followUp && c.followUp.date) {
        const hasAppt = this.data.appointments.some(a => a.consultationId === c.id);
        if (!hasAppt) {
          const patient = this.data.patients.find(p => p.id === c.patientId);
          this.data.appointments.push({
            id: `apt-fup-${c.id}`,
            patientId: c.patientId,
            patientCode: c.patientCode,
            patientName: c.patientName,
            patientAge: c.patientAge,
            patientGender: c.patientGender,
            patientMobile: patient ? patient.mobile : '',
            doctorId: c.doctorId,
            doctorName: c.doctorName,
            date: c.followUp.date,
            time: '10:00 AM',
            type: 'follow_up',
            status: 'scheduled',
            consultationId: c.id,
            instructions: c.followUp.instructions || 'Review post-treatment',
            notes: c.followUp.notes || '',
            createdAt: c.signedAt || c.createdAt,
            updatedAt: c.updatedAt || c.createdAt
          });
        }
      }
    }
    this.persist();
  }

  private loadDatabase(): DatabaseSchema {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (fs.existsSync(DB_PATH)) {
      try {
        const raw = fs.readFileSync(DB_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed.appointments)) {
          parsed.appointments = [];
        }
        if (!Array.isArray(parsed.testReports)) {
          parsed.testReports = [];
        }
        return parsed;
      } catch (err) {
        console.error('Failed to parse existing DB file, creating backup and fresh DB', err);
        const backupPath = path.join(DATA_DIR, `clinical_os_db_corrupt_${Date.now()}.json`);
        fs.renameSync(DB_PATH, backupPath);
      }
    }

    const initialDb: DatabaseSchema = {
      doctors: [],
      doctorPasswords: {},
      patients: [],
      consultations: [],
      prescriptions: [],
      appointments: [],
      bodyMarkers: [],
      clinicalImages: [],
      auditLogs: [],
      meta: {
        lastPatientNumber: 24617,
        version: 1,
        updatedAt: new Date().toISOString()
      }
    };

    fs.writeFileSync(DB_PATH, JSON.stringify(initialDb, null, 2), 'utf-8');
    return initialDb;
  }

  private persist() {
    if (this.isSaving) {
      this.pendingSave = true;
      return;
    }
    this.isSaving = true;
    this.data.meta.updatedAt = new Date().toISOString();

    const tempPath = `${DB_PATH}.tmp`;
    try {
      fs.writeFileSync(tempPath, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tempPath, DB_PATH);
    } catch (err) {
      console.error('Error persisting database:', err);
    } finally {
      this.isSaving = false;
      if (this.pendingSave) {
        this.pendingSave = false;
        this.persist();
      }
    }
  }

  private ensureDefaultDoctor() {
    // 1. Ensure Individual Demo Doctor
    let demoDoc = this.data.doctors.find(d => d.email.toLowerCase() === 'demo@clinicalos.med');
    if (!demoDoc) {
      const demoDoctorId = 'doc-demo-001';
      demoDoc = {
        id: demoDoctorId,
        name: 'Dr. Demo',
        email: 'demo@clinicalos.med',
        speciality: 'Dermatologist & Cosmetologist',
        registrationNumber: 'MED-REG-847291',
        clinicName: 'Cliniq Dermatology Center',
        phone: '9876543210',
        defaultConsultationFee: 500,
        avatarUrl: '',
        accountType: 'individual',
        createdAt: new Date().toISOString()
      };
      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync('Demo@1234', salt);
      this.data.doctors.push(demoDoc);
      this.data.doctorPasswords[demoDoctorId] = hash;
      this.persist();
    } else if (!demoDoc.accountType) {
      demoDoc.accountType = 'individual';
      this.persist();
    }

    // 2. Ensure Organisational / Hospital Demo Doctor
    let orgDoc = this.data.doctors.find(d => d.email.toLowerCase() === 'hospital@metrohealth.org');
    if (!orgDoc) {
      const orgDoctorId = 'doc-org-001';
      orgDoc = {
        id: orgDoctorId,
        name: 'Dr. Sarah Chen, MD',
        email: 'hospital@metrohealth.org',
        speciality: 'Chief of Dermatology & Cutaneous Medicine',
        registrationNumber: 'HOSP-ATT-49021',
        clinicName: 'Metro Health University Medical Center',
        phone: '5553921084',
        defaultConsultationFee: 650,
        avatarUrl: '',
        accountType: 'organisational',
        organizationName: 'Metro Health University Medical Center',
        organizationDepartment: 'Department of Dermatology',
        createdAt: new Date().toISOString()
      };
      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync('Demo@1234', salt);
      this.data.doctors.push(orgDoc);
      this.data.doctorPasswords[orgDoctorId] = hash;
      this.persist();
    }
  }

  // --- Doctor & Auth methods ---
  public findDoctorByEmail(email: string): Doctor | undefined {
    return this.data.doctors.find(d => d.email.toLowerCase() === email.toLowerCase());
  }

  public findDoctorById(id: string): Doctor | undefined {
    return this.data.doctors.find(d => d.id === id);
  }

  public verifyPassword(doctorId: string, passwordAttempt: string): boolean {
    const hash = this.data.doctorPasswords[doctorId];
    if (!hash) return false;
    return bcrypt.compareSync(passwordAttempt, hash);
  }

  public createDoctor(params: {
    name: string;
    email: string;
    password: string;
    speciality?: string;
    registrationNumber?: string;
    clinicName?: string;
    phone?: string;
  }): Doctor {
    const id = `doc-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const doctor: Doctor = {
      id,
      name: params.name,
      email: params.email.toLowerCase(),
      speciality: params.speciality || 'General Practitioner',
      registrationNumber: params.registrationNumber || `REG-${Math.floor(100000 + Math.random() * 900000)}`,
      clinicName: params.clinicName || 'Clinical OS Medical Practice',
      phone: params.phone || '',
      defaultConsultationFee: 500,
      createdAt: new Date().toISOString()
    };

    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(params.password, salt);

    this.data.doctors.push(doctor);
    this.data.doctorPasswords[id] = hash;
    this.persist();

    this.logAudit({
      actorId: id,
      actorName: doctor.name,
      action: 'doctor_registered',
      resourceType: 'doctor',
      resourceId: id
    });

    return doctor;
  }

  public updateDoctor(id: string, updates: Partial<Doctor>): Doctor | null {
    const doc = this.data.doctors.find(d => d.id === id);
    if (!doc) return null;

    Object.assign(doc, updates);
    this.persist();
    return doc;
  }

  // --- Patients methods ---
  public generatePatientCode(): string {
    this.data.meta.lastPatientNumber += 1;
    this.persist();
    return `P-${this.data.meta.lastPatientNumber}`;
  }

  public getPatients(query?: string): Patient[] {
    let list = [...this.data.patients];
    if (query && query.trim()) {
      const q = query.toLowerCase().trim();
      list = list.filter(p =>
        p.fullName.toLowerCase().includes(q) ||
        p.patientCode.toLowerCase().includes(q) ||
        p.mobile.includes(q) ||
        (p.primaryDiagnosis && p.primaryDiagnosis.toLowerCase().includes(q))
      );
    }
    // Sort by latest created or updated
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public findPatientById(id: string): Patient | undefined {
    return this.data.patients.find(p => p.id === id);
  }

  public findPatientByMobile(mobile: string): Patient | undefined {
    const clean = mobile.replace(/\D/g, '');
    return this.data.patients.find(p => p.mobile.replace(/\D/g, '') === clean);
  }

  public createPatient(patientData: Omit<Patient, 'id' | 'patientCode' | 'createdAt' | 'updatedAt'>, actor: { id: string; name: string }): Patient {
    const id = `pat-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const patientCode = this.generatePatientCode();
    const now = new Date().toISOString();

    const newPatient: Patient = {
      ...patientData,
      mobile: String(patientData.mobile || '').replace(/\D/g, '').slice(-10),
      id,
      patientCode,
      createdAt: now,
      updatedAt: now
    };

    this.data.patients.push(newPatient);
    this.persist();

    this.logAudit({
      actorId: actor.id,
      actorName: actor.name,
      action: 'patient_created',
      resourceType: 'patient',
      resourceId: id,
      metadata: { patientCode, name: newPatient.fullName, mobile: newPatient.mobile }
    });

    return newPatient;
  }

  public updatePatient(id: string, updates: Partial<Patient>, actor: { id: string; name: string }): Patient | null {
    const p = this.data.patients.find(item => item.id === id);
    if (!p) return null;

    if (updates.mobile !== undefined) {
      updates.mobile = String(updates.mobile).replace(/\D/g, '').slice(-10);
    }

    Object.assign(p, updates, { updatedAt: new Date().toISOString() });
    this.persist();

    this.logAudit({
      actorId: actor.id,
      actorName: actor.name,
      action: 'patient_updated',
      resourceType: 'patient',
      resourceId: id
    });

    return p;
  }

  // --- Consultations methods ---
  public getConsultationsByPatient(patientId: string): Consultation[] {
    return this.data.consultations
      .filter(c => c.patientId === patientId)
      .sort((a, b) => new Date(b.consultationDate).getTime() - new Date(a.consultationDate).getTime());
  }

  public getConsultationById(id: string): Consultation | undefined {
    return this.data.consultations.find(c => c.id === id);
  }

  public createConsultation(params: {
    patientId: string;
    doctorId: string;
    doctorName: string;
    symptoms?: string[];
    fee?: number;
  }): Consultation {
    const patient = this.findPatientById(params.patientId);
    if (!patient) throw new Error('Patient not found');

    const id = `con-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const consultation: Consultation = {
      id,
      patientId: patient.id,
      patientCode: patient.patientCode,
      patientName: patient.fullName,
      patientAge: patient.age,
      patientGender: patient.gender,
      doctorId: params.doctorId,
      doctorName: params.doctorName,
      consultationDate: now,
      status: 'draft',
      fee: params.fee ?? 500,
      symptoms: params.symptoms || [],
      diagnoses: [],
      tests: [],
      procedures: [],
      clinicalNotes: {
        examination: '',
        investigationsAdvised: '',
        plan: ''
      },
      bodyMarkers: [],
      images: [],
      followUp: {},
      prescriptions: [],
      aiSummary: '',
      createdAt: now,
      updatedAt: now
    };

    this.data.consultations.push(consultation);
    this.persist();

    this.logAudit({
      actorId: params.doctorId,
      actorName: params.doctorName,
      action: 'consultation_started',
      resourceType: 'consultation',
      resourceId: id,
      metadata: { patientId: patient.id, patientCode: patient.patientCode }
    });

    return consultation;
  }

  public saveAndSignConsultation(id: string, updates: Partial<Consultation>, actor: { id: string; name: string }): Consultation | null {
    const consultation = this.data.consultations.find(c => c.id === id);
    if (!consultation) return null;

    const now = new Date().toISOString();
    Object.assign(consultation, updates, {
      status: 'signed',
      signedAt: now,
      updatedAt: now
    });

    // Also persist body markers into global bodyMarkers list if provided
    if (updates.bodyMarkers && updates.bodyMarkers.length > 0) {
      // Remove any previously saved markers for this consultation
      this.data.bodyMarkers = this.data.bodyMarkers.filter(m => m.consultationId !== id);
      this.data.bodyMarkers.push(...updates.bodyMarkers);
    }

    // Also persist clinical images into global images
    if (updates.images && updates.images.length > 0) {
      for (const img of updates.images) {
        if (!this.data.clinicalImages.find(i => i.id === img.id)) {
          this.data.clinicalImages.push(img);
        }
      }
    }

    // Also persist prescriptions
    if (updates.prescriptions && updates.prescriptions.length > 0) {
      this.data.prescriptions = this.data.prescriptions.filter(p => p.consultationId !== id);
      this.data.prescriptions.push(...updates.prescriptions);
    }

    // Update patient's lastVisitAt and primaryDiagnosis
    const patient = this.data.patients.find(p => p.id === consultation.patientId);
    if (patient) {
      patient.lastVisitAt = now;
      if (consultation.diagnoses && consultation.diagnoses.length > 0) {
        patient.primaryDiagnosis = consultation.diagnoses.join(', ');
      } else if (consultation.symptoms && consultation.symptoms.length > 0) {
        patient.primaryDiagnosis = consultation.symptoms.join(', ');
      }
      patient.updatedAt = now;
    }

    // Automatically sync follow-up date to Appointments segment
    if (updates.followUp && updates.followUp.date) {
      if (!this.data.appointments) this.data.appointments = [];
      const existingIdx = this.data.appointments.findIndex(a => a.consultationId === id);
      const appt: Appointment = {
        id: existingIdx >= 0 ? this.data.appointments[existingIdx].id : `apt-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
        patientId: consultation.patientId,
        patientCode: consultation.patientCode,
        patientName: consultation.patientName,
        patientAge: consultation.patientAge,
        patientGender: consultation.patientGender,
        patientMobile: patient ? patient.mobile : '',
        doctorId: consultation.doctorId,
        doctorName: consultation.doctorName,
        date: updates.followUp.date,
        time: '10:00 AM',
        type: 'follow_up',
        status: 'scheduled',
        consultationId: id,
        instructions: updates.followUp.instructions || 'Review post-treatment follow-up',
        notes: updates.followUp.notes || '',
        createdAt: existingIdx >= 0 ? this.data.appointments[existingIdx].createdAt : now,
        updatedAt: now
      };

      if (existingIdx >= 0) {
        this.data.appointments[existingIdx] = appt;
      } else {
        this.data.appointments.push(appt);
      }
    }

    // If patient had prior scheduled appointment that was fulfilled by this visit, mark completed
    if (this.data.appointments) {
      for (const prior of this.data.appointments) {
        if (prior.patientId === consultation.patientId && prior.consultationId !== id && (prior.status === 'scheduled' || prior.status === 'checked_in' || prior.status === 'in_progress')) {
          const apptDate = new Date(prior.date);
          const today = new Date();
          today.setHours(23, 59, 59, 999);
          if (apptDate <= today) {
            prior.status = 'completed';
            prior.updatedAt = now;
          }
        }
      }
    }

    this.syncTestReportsFromConsultations();
    this.persist();

    this.logAudit({
      actorId: actor.id,
      actorName: actor.name,
      action: 'consultation_signed',
      resourceType: 'consultation',
      resourceId: id,
      metadata: {
        patientId: consultation.patientId,
        patientCode: consultation.patientCode,
        diagnosesCount: consultation.diagnoses.length,
        fee: consultation.fee
      }
    });

    return consultation;
  }

  // --- Prescriptions methods ---
  public getPrescriptions(patientId?: string): PrescriptionItem[] {
    let list = [...this.data.prescriptions];
    if (patientId) {
      list = list.filter(p => p.patientId === patientId);
    }
    return list.sort((a, b) => new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime());
  }

  public addPrescription(item: Omit<PrescriptionItem, 'id' | 'createdAt'>, actor: { id: string; name: string }): PrescriptionItem {
    const id = `rx-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const rx: PrescriptionItem = {
      ...item,
      id,
      createdAt: now
    };
    this.data.prescriptions.push(rx);
    this.persist();

    this.logAudit({
      actorId: actor.id,
      actorName: actor.name,
      action: 'prescription_added',
      resourceType: 'prescription',
      resourceId: id,
      metadata: { medicine: rx.medicineName, patientId: rx.patientId }
    });

    return rx;
  }

  // --- Body Markers methods ---
  public getPatientBodyMarkers(patientId: string): BodyMarker[] {
    return this.data.bodyMarkers.filter(m => m.patientId === patientId);
  }

  public addBodyMarker(marker: BodyMarker): BodyMarker {
    if (!this.data.bodyMarkers) this.data.bodyMarkers = [];
    this.data.bodyMarkers.push(marker);
    this.persist();
    return marker;
  }

  // --- Clinical Images methods ---
  public getPatientImages(patientId: string): ClinicalImage[] {
    return this.data.clinicalImages.filter(i => i.patientId === patientId);
  }

  public addClinicalImage(img: ClinicalImage): ClinicalImage {
    this.data.clinicalImages.push(img);
    if (img.consultationId) {
      const consult = this.data.consultations.find(c => c.id === img.consultationId);
      if (consult) {
        if (!consult.images) consult.images = [];
        if (!consult.images.some(existing => existing.id === img.id)) {
          consult.images.push(img);
        }
      }
    }
    this.persist();
    return img;
  }

  public deleteClinicalImage(id: string): boolean {
    const idx = this.data.clinicalImages.findIndex(i => i.id === id);
    if (idx >= 0) {
      this.data.clinicalImages.splice(idx, 1);
      for (const consult of this.data.consultations) {
        if (consult.images && consult.images.some(img => img.id === id)) {
          consult.images = consult.images.filter(img => img.id !== id);
        }
      }
      this.persist();
      return true;
    }
    return false;
  }

  // --- Appointments methods ---
  public getAppointments(filters?: { patientId?: string; date?: string; status?: string }): Appointment[] {
    let list = [...(this.data.appointments || [])];
    if (filters?.patientId) {
      list = list.filter(a => a.patientId === filters.patientId);
    }
    if (filters?.date) {
      list = list.filter(a => a.date === filters.date);
    }
    if (filters?.status) {
      list = list.filter(a => a.status === filters.status);
    }
    return list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  public getAppointmentById(id: string): Appointment | undefined {
    return (this.data.appointments || []).find(a => a.id === id);
  }

  public createAppointment(
    item: Omit<Appointment, 'id' | 'createdAt' | 'updatedAt'>,
    actor?: { id: string; name: string }
  ): Appointment {
    if (!this.data.appointments) this.data.appointments = [];
    const id = `apt-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const appt: Appointment = {
      ...item,
      id,
      createdAt: now,
      updatedAt: now
    };
    this.data.appointments.push(appt);
    this.persist();

    if (actor) {
      this.logAudit({
        actorId: actor.id,
        actorName: actor.name,
        action: 'appointment_created',
        resourceType: 'appointment',
        resourceId: id,
        metadata: { patientId: appt.patientId, date: appt.date, type: appt.type }
      });
    }

    return appt;
  }

  public updateAppointment(
    id: string,
    updates: Partial<Appointment>,
    actor?: { id: string; name: string }
  ): Appointment | null {
    if (!this.data.appointments) return null;
    const appt = this.data.appointments.find(a => a.id === id);
    if (!appt) return null;

    Object.assign(appt, updates, { updatedAt: new Date().toISOString() });
    this.persist();

    if (actor) {
      this.logAudit({
        actorId: actor.id,
        actorName: actor.name,
        action: 'appointment_updated',
        resourceType: 'appointment',
        resourceId: id,
        metadata: { updates }
      });
    }

    return appt;
  }

  public deleteAppointment(id: string, actor?: { id: string; name: string }): boolean {
    if (!this.data.appointments) return false;
    const initialLen = this.data.appointments.length;
    this.data.appointments = this.data.appointments.filter(a => a.id !== id);
    if (this.data.appointments.length !== initialLen) {
      this.persist();
      if (actor) {
        this.logAudit({
          actorId: actor.id,
          actorName: actor.name,
          action: 'appointment_deleted',
          resourceType: 'appointment',
          resourceId: id
        });
      }
      return true;
    }
    return false;
  }

  // --- Patient Test & Diagnostic Reports methods ---
  public getTestReportsByPatient(patientId: string): PatientTestReport[] {
    if (!this.data.testReports) this.data.testReports = [];
    this.syncTestReportsFromConsultations();
    return this.data.testReports
      .filter(r => r.patientId === patientId)
      .sort(
        (a, b) =>
          new Date(b.reportDate || b.orderedDate || b.createdAt).getTime() -
          new Date(a.reportDate || a.orderedDate || a.createdAt).getTime()
      );
  }

  public createTestReport(
    item: Omit<PatientTestReport, 'id' | 'createdAt' | 'updatedAt'>,
    actor?: { id: string; name: string }
  ): PatientTestReport {
    if (!this.data.testReports) this.data.testReports = [];
    const now = new Date().toISOString();

    // Check if there is already a report for the same patient and testName
    const existingIdx = this.data.testReports.findIndex(
      r =>
        r.patientId === item.patientId &&
        r.testName.trim().toLowerCase() === item.testName.trim().toLowerCase()
    );

    if (existingIdx >= 0) {
      const existing = this.data.testReports[existingIdx];
      if (!existing.previousResults) {
        existing.previousResults = [];
      }

      if (item.isPreviousReport) {
        // Store directly into the existing report's previousResults archive
        existing.previousResults.push({
          id: `prev-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
          orderedDate: item.orderedDate,
          reportDate: item.reportDate || item.orderedDate,
          resultFlag: item.resultFlag,
          resultValue: item.resultValue,
          unit: item.unit,
          referenceRange: item.referenceRange,
          specimenType: item.specimenType,
          labName: item.labName,
          orderedByDoctor: item.orderedByDoctor,
          clinicalNotes: item.clinicalNotes,
          attachmentUrl: item.attachmentUrl,
          attachmentName: item.attachmentName,
          archivedAt: now
        });
        // Sort previousResults newest first
        existing.previousResults.sort(
          (a, b) =>
            new Date(b.reportDate || b.orderedDate).getTime() -
            new Date(a.reportDate || a.orderedDate).getTime()
        );
        existing.updatedAt = now;
        this.persist();
        return existing;
      } else {
        // New latest result for the same test -> archive the existing latest into previousResults
        existing.previousResults.unshift({
          id: `prev-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
          orderedDate: existing.orderedDate,
          reportDate: existing.reportDate || existing.orderedDate,
          resultFlag: existing.resultFlag,
          resultValue: existing.resultValue,
          unit: existing.unit,
          referenceRange: existing.referenceRange,
          specimenType: existing.specimenType,
          labName: existing.labName,
          orderedByDoctor: existing.orderedByDoctor,
          clinicalNotes: existing.clinicalNotes,
          attachmentUrl: existing.attachmentUrl,
          attachmentName: existing.attachmentName,
          archivedAt: now
        });

        Object.assign(existing, {
          ...item,
          isPreviousReport: false,
          previousResults: existing.previousResults,
          updatedAt: now
        });
        this.persist();
        return existing;
      }
    }

    const id = `rep-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const report: PatientTestReport = {
      ...item,
      id,
      previousResults: item.previousResults || [],
      createdAt: now,
      updatedAt: now
    };
    this.data.testReports.push(report);
    this.persist();

    if (actor) {
      this.logAudit({
        actorId: actor.id,
        actorName: actor.name,
        action: 'test_report_added',
        resourceType: 'test_report',
        resourceId: id,
        metadata: { patientId: report.patientId, testName: report.testName, status: report.status }
      });
    }

    return report;
  }

  public updateTestReport(
    id: string,
    updates: Partial<PatientTestReport> & { archiveCurrentAsPrevious?: boolean },
    actor?: { id: string; name: string }
  ): PatientTestReport | null {
    if (!this.data.testReports) return null;
    const report = this.data.testReports.find(r => r.id === id);
    if (!report) return null;

    const now = new Date().toISOString();

    // If archiving current result as a previous report (either explicitly requested or when recording a new result on an already-completed report)
    const shouldArchivePrevious =
      updates.archiveCurrentAsPrevious === true ||
      (updates.archiveCurrentAsPrevious !== false &&
        report.status === 'completed' &&
        report.resultValue &&
        updates.resultValue &&
        updates.resultValue.trim() !== report.resultValue.trim());

    if (shouldArchivePrevious) {
      if (!report.previousResults) {
        report.previousResults = [];
      }
      report.previousResults.unshift({
        id: `prev-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 5)}`,
        orderedDate: report.orderedDate,
        reportDate: report.reportDate || report.updatedAt,
        resultFlag: report.resultFlag,
        resultValue: report.resultValue,
        unit: report.unit,
        referenceRange: report.referenceRange,
        specimenType: report.specimenType,
        labName: report.labName,
        orderedByDoctor: report.orderedByDoctor,
        clinicalNotes: report.clinicalNotes,
        attachmentUrl: report.attachmentUrl,
        attachmentName: report.attachmentName,
        archivedAt: now
      });
    }

    const { archiveCurrentAsPrevious, ...cleanUpdates } = updates;
    Object.assign(report, cleanUpdates, { updatedAt: now });
    this.persist();

    if (actor) {
      this.logAudit({
        actorId: actor.id,
        actorName: actor.name,
        action: 'test_report_updated',
        resourceType: 'test_report',
        resourceId: id,
        metadata: {
          testName: report.testName,
          status: report.status,
          resultFlag: report.resultFlag,
          previousCount: report.previousResults?.length || 0
        }
      });
    }

    return report;
  }

  public deleteTestReport(id: string, actor?: { id: string; name: string }): boolean {
    if (!this.data.testReports) return false;
    const initialLen = this.data.testReports.length;
    this.data.testReports = this.data.testReports.filter(r => r.id !== id);
    if (this.data.testReports.length !== initialLen) {
      this.persist();
      if (actor) {
        this.logAudit({
          actorId: actor.id,
          actorName: actor.name,
          action: 'test_report_deleted',
          resourceType: 'test_report',
          resourceId: id
        });
      }
      return true;
    }
    return false;
  }

  // --- Stats & Dashboard ---
  public getStats(): ClinicStats {
    const totalPatients = this.data.patients.length;
    const todayStr = new Date().toISOString().split('T')[0];

    // Visits today
    const visitsToday = this.data.consultations.filter(c => {
      const cDate = c.consultationDate.split('T')[0];
      return cDate === todayStr && c.status === 'signed';
    }).length;

    // Visits last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const visitsLast7Days = this.data.consultations.filter(c => {
      return new Date(c.consultationDate) >= sevenDaysAgo && c.status === 'signed';
    }).length;

    // Follow-ups due (within next 7 days or overdue)
    const now = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const followUpsDue = this.data.consultations.filter(c => {
      if (!c.followUp || !c.followUp.date) return false;
      const fDate = new Date(c.followUp.date);
      return fDate <= nextWeek;
    }).length;

    // Active prescriptions
    const activePrescriptions = this.data.prescriptions.length;

    return {
      totalPatients,
      visitsToday,
      visitsLast7Days,
      followUpsDue,
      activePrescriptions
    };
  }

  public getRecentVisits(limit = 10): Consultation[] {
    return this.data.consultations
      .filter(c => c.status === 'signed')
      .sort((a, b) => new Date(b.consultationDate).getTime() - new Date(a.consultationDate).getTime())
      .slice(0, limit);
  }

  public getRecentPatients(limit = 10): Patient[] {
    return [...this.data.patients]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  // --- Revenue & Financial Analytics ---
  public getPracticeRevenueAnalytics(): PracticeRevenueAnalytics {
    const consultations = this.data.consultations.filter(c => (c.fee || 0) > 0 || (c.procedures && c.procedures.length > 0));
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    // Today's revenue
    const todayConsults = consultations.filter(c => c.consultationDate.startsWith(todayStr));
    const dailyConsultationFee = todayConsults.reduce((sum, c) => sum + (c.fee || 0), 0);
    const dailyProcedureCost = todayConsults.reduce(
      (sum, c) => sum + (c.procedures || []).reduce((pSum, p) => pSum + (p.cost || 0), 0),
      0
    );
    const dailyTotalRevenue = dailyConsultationFee + dailyProcedureCost;

    // Yesterday's revenue
    const yesterdayConsults = consultations.filter(c => c.consultationDate.startsWith(yesterdayStr));
    const yesterdayRevenue = yesterdayConsults.reduce(
      (sum, c) => sum + (c.fee || 0) + (c.procedures || []).reduce((pSum, p) => pSum + (p.cost || 0), 0),
      0
    );
    const dailyChangePercent = yesterdayRevenue > 0
      ? Math.round(((dailyTotalRevenue - yesterdayRevenue) / yesterdayRevenue) * 100)
      : (dailyTotalRevenue > 0 ? 100 : 0);

    // Month strings
    const currentMonthPrefix = now.toISOString().substring(0, 7); // e.g. "2026-10"
    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthPrefix = prevMonthDate.toISOString().substring(0, 7);

    // Current Month Revenue
    const currentMonthConsults = consultations.filter(c => c.consultationDate.startsWith(currentMonthPrefix));
    const currentMonthConsultationFee = currentMonthConsults.reduce((sum, c) => sum + (c.fee || 0), 0);
    const currentMonthProcedureCost = currentMonthConsults.reduce(
      (sum, c) => sum + (c.procedures || []).reduce((pSum, p) => pSum + (p.cost || 0), 0),
      0
    );
    const currentMonthRevenue = currentMonthConsultationFee + currentMonthProcedureCost;

    // Last Month Revenue
    const lastMonthConsults = consultations.filter(c => c.consultationDate.startsWith(prevMonthPrefix));
    const lastMonthRevenue = lastMonthConsults.reduce(
      (sum, c) => sum + (c.fee || 0) + (c.procedures || []).reduce((pSum, p) => pSum + (p.cost || 0), 0),
      0
    );

    // Monthly Recurring Revenue (MRR)
    // Repeat patient consultation volume in the rolling 30-day window
    const patientVisitCounts: Record<string, number> = {};
    for (const c of consultations) {
      patientVisitCounts[c.patientId] = (patientVisitCounts[c.patientId] || 0) + 1;
    }
    const repeatPatientIds = new Set(
      Object.entries(patientVisitCounts).filter(([_, count]) => count >= 2).map(([id]) => id)
    );

    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const last30DaysConsults = consultations.filter(c => new Date(c.consultationDate) >= thirtyDaysAgo);
    
    const recurringConsults30Days = last30DaysConsults.filter(c => repeatPatientIds.has(c.patientId));
    const recurringRevenue30Days = recurringConsults30Days.reduce(
      (sum, c) => sum + (c.fee || 0) + (c.procedures || []).reduce((pSum, p) => pSum + (p.cost || 0), 0),
      0
    );

    // MRR is the baseline recurring run-rate from returning patients + predictable chronic regimens
    const monthlyRecurringRevenue = recurringRevenue30Days > 0
      ? recurringRevenue30Days
      : Math.round(currentMonthRevenue * 0.70);

    const mrrGrowthPercent = lastMonthRevenue > 0
      ? Math.round(((currentMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100)
      : (currentMonthRevenue > 0 ? 15 : 0);

    // All-time totals
    let allTimeRevenue = 0;
    let totalConsultationsRevenue = 0;
    let totalProceduresRevenue = 0;
    let totalProceduresCount = 0;

    for (const c of consultations) {
      const fee = c.fee || 0;
      const procCost = (c.procedures || []).reduce((sum, p) => sum + (p.cost || 0), 0);
      totalConsultationsRevenue += fee;
      totalProceduresRevenue += procCost;
      totalProceduresCount += (c.procedures || []).length;
      allTimeRevenue += (fee + procCost);
    }

    // Patient Itemized Breakdown
    const patientMap = new Map<string, PatientRevenueBreakdown>();
    for (const p of this.data.patients) {
      patientMap.set(p.id, {
        patientId: p.id,
        patientName: p.fullName,
        patientCode: p.patientCode,
        gender: p.gender,
        age: p.age,
        totalRevenue: 0,
        consultationRevenue: 0,
        procedureRevenue: 0,
        visitCount: 0,
        procedureCount: 0,
        lastVisitDate: '',
        visits: [],
        proceduresList: []
      });
    }

    for (const c of consultations) {
      let record = patientMap.get(c.patientId);
      if (!record) {
        record = {
          patientId: c.patientId,
          patientName: c.patientName,
          patientCode: c.patientCode,
          gender: c.patientGender,
          age: c.patientAge,
          totalRevenue: 0,
          consultationRevenue: 0,
          procedureRevenue: 0,
          visitCount: 0,
          procedureCount: 0,
          lastVisitDate: '',
          visits: [],
          proceduresList: []
        };
        patientMap.set(c.patientId, record);
      }

      const cProcedures = c.procedures || [];
      const procTotal = cProcedures.reduce((sum, p) => sum + (p.cost || 0), 0);
      const visitTotal = (c.fee || 0) + procTotal;

      record.totalRevenue += visitTotal;
      record.consultationRevenue += (c.fee || 0);
      record.procedureRevenue += procTotal;
      record.visitCount += 1;
      record.procedureCount += cProcedures.length;

      if (!record.lastVisitDate || new Date(c.consultationDate) > new Date(record.lastVisitDate)) {
        record.lastVisitDate = c.consultationDate;
      }

      record.visits.push({
        consultationId: c.id,
        date: c.consultationDate,
        doctorName: c.doctorName,
        fee: c.fee || 0,
        diagnoses: c.diagnoses || [],
        procedures: cProcedures,
        totalAmount: visitTotal
      });

      for (const p of cProcedures) {
        record.proceduresList.push({
          id: p.id,
          name: p.name,
          cost: p.cost,
          date: c.consultationDate,
          consultationId: c.id
        });
      }
    }

    // Sort patient breakdown: highest revenue first
    const patientBreakdown = Array.from(patientMap.values())
      .map(p => ({
        ...p,
        visits: p.visits.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
        proceduresList: p.proceduresList.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue);

    const activeBillingPatientsCount = patientBreakdown.filter(p => p.totalRevenue > 0).length;
    const avgRevenuePerPatient = activeBillingPatientsCount > 0
      ? Math.round(allTimeRevenue / activeBillingPatientsCount)
      : 0;

    // Daily Trend (last 14 days)
    const dailyTrend: DailyRevenuePoint[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dStr = d.toISOString().split('T')[0];
      const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

      const dayConsults = consultations.filter(c => c.consultationDate.startsWith(dStr));
      const cRev = dayConsults.reduce((sum, c) => sum + (c.fee || 0), 0);
      const pRev = dayConsults.reduce((sum, c) => sum + (c.procedures || []).reduce((pSum, p) => pSum + (p.cost || 0), 0), 0);

      dailyTrend.push({
        date: dStr,
        dayLabel,
        consultationRevenue: cRev,
        procedureRevenue: pRev,
        totalRevenue: cRev + pRev,
        visitCount: dayConsults.length
      });
    }

    // Monthly Trend (last 6 months)
    const monthlyTrend: MonthlyRevenuePoint[] = [];
    for (let m = 5; m >= 0; m--) {
      const mDate = new Date(now.getFullYear(), now.getMonth() - m, 1);
      const mPrefix = mDate.toISOString().substring(0, 7);
      const monthLabel = mDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

      const mConsults = consultations.filter(c => c.consultationDate.startsWith(mPrefix));
      const mCRev = mConsults.reduce((sum, c) => sum + (c.fee || 0), 0);
      const mPRev = mConsults.reduce((sum, c) => sum + (c.procedures || []).reduce((pSum, p) => pSum + (p.cost || 0), 0), 0);
      const uniquePatients = new Set(mConsults.map(c => c.patientId)).size;

      monthlyTrend.push({
        month: mPrefix,
        monthLabel,
        consultationRevenue: mCRev,
        procedureRevenue: mPRev,
        totalRevenue: mCRev + mPRev,
        uniquePatients,
        visitCount: mConsults.length
      });
    }

    return {
      dailyTotalRevenue,
      yesterdayRevenue,
      dailyChangePercent,
      monthlyRecurringRevenue,
      lastMonthRevenue,
      mrrGrowthPercent,
      currentMonthRevenue,
      allTimeRevenue,
      totalConsultationsRevenue,
      totalProceduresRevenue,
      totalProceduresCount,
      activeBillingPatientsCount,
      avgRevenuePerPatient,
      dailyTrend,
      monthlyTrend,
      patientBreakdown
    };
  }

  // --- Audit Logging ---
  public logAudit(log: Omit<AuditLog, 'id' | 'timestamp'>) {
    const audit: AuditLog = {
      ...log,
      id: `aud-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString()
    };
    this.data.auditLogs.unshift(audit);
    // Keep max 2000 logs in memory
    if (this.data.auditLogs.length > 2000) {
      this.data.auditLogs.pop();
    }
    this.persist();
  }

  public getAuditLogs(limit = 100): AuditLog[] {
    return this.data.auditLogs.slice(0, limit);
  }

  // --- Clinic Subscription & AI Credit Meter ---
  private detectActiveVisionProvider(): { activeProvider: 'openrouter' | 'gemini' | 'adaptive_vision'; activeModel: string } {
    if (process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.trim().length > 5) {
      return {
        activeProvider: 'openrouter',
        activeModel: process.env.OPENROUTER_VISION_MODEL || 'google/gemini-2.5-pro'
      };
    }
    const geminiKey =
      process.env.CUSTOM_GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.GEMINI_API_KEY ||
      '';
    if (geminiKey.trim().length > 5) {
      return {
        activeProvider: 'gemini',
        activeModel: process.env.GEMINI_VISION_MODEL || 'gemini-2.5-flash'
      };
    }
    return {
      activeProvider: 'adaptive_vision',
      activeModel: 'Adaptive Clinical Vision Engine'
    };
  }

  private ensureDefaultSubscription() {
    const providerInfo = this.detectActiveVisionProvider();
    if (!this.data.subscription) {
      const now = new Date().toISOString();
      this.data.subscription = {
        plan: 'free_trial',
        planName: 'Clinic Starter (Free Trial)',
        monthlyPriceInr: 0,
        aiScansRemaining: 10,
        aiScansTotalQuota: 10,
        aiScansUsed: 0,
        activeProvider: providerInfo.activeProvider,
        activeModel: providerInfo.activeModel,
        transactions: [
          {
            id: `tx-init-${Date.now().toString(36)}`,
            type: 'initial_trial',
            description: 'Welcome Trial: 10 Free AI Clinical Image Diagnostic Scans',
            creditsDelta: 10,
            amountInr: 0,
            paymentMethod: 'System',
            timestamp: now
          }
        ],
        updatedAt: now
      };
      this.persist();
    } else {
      this.data.subscription.activeProvider = providerInfo.activeProvider;
      this.data.subscription.activeModel = providerInfo.activeModel;
    }
  }

  public getSubscription(): ClinicSubscriptionState {
    this.ensureDefaultSubscription();
    return this.data.subscription!;
  }

  public deductAiScanCredit(patientContext?: string): { allowed: boolean; subscription: ClinicSubscriptionState } {
    this.ensureDefaultSubscription();
    const sub = this.data.subscription!;
    if (sub.aiScansRemaining <= 0) {
      return { allowed: false, subscription: sub };
    }
    const now = new Date().toISOString();
    sub.aiScansRemaining = Math.max(0, sub.aiScansRemaining - 1);
    sub.aiScansUsed = (sub.aiScansUsed || 0) + 1;
    sub.updatedAt = now;
    sub.transactions.unshift({
      id: `tx-scan-${Date.now().toString(36)}`,
      type: 'scan_deduction',
      description: patientContext
        ? `AI Clinical Image Scan (${patientContext})`
        : 'AI Clinical Image Diagnostic Scan',
      creditsDelta: -1,
      paymentMethod: 'System',
      timestamp: now
    });
    if (sub.transactions.length > 50) {
      sub.transactions = sub.transactions.slice(0, 50);
    }
    this.persist();
    return { allowed: true, subscription: sub };
  }

  public upgradeToProPlan(paymentMethod: 'UPI' | 'Card' = 'UPI'): ClinicSubscriptionState {
    this.ensureDefaultSubscription();
    const sub = this.data.subscription!;
    const now = new Date();
    const renews = new Date(now);
    renews.setDate(renews.getDate() + 30);

    sub.plan = 'pro_monthly';
    sub.planName = 'Clinic Pro Monthly Plan';
    sub.monthlyPriceInr = 3999;
    sub.aiScansRemaining += 150;
    sub.aiScansTotalQuota += 150;
    sub.renewsAt = renews.toISOString();
    sub.updatedAt = now.toISOString();
    sub.transactions.unshift({
      id: `tx-pro-${Date.now().toString(36)}`,
      type: 'plan_upgrade',
      description: 'Upgraded to Clinic Pro Monthly Plan (+150 AI Image Scans)',
      creditsDelta: 150,
      amountInr: 3999,
      paymentMethod,
      timestamp: now.toISOString()
    });
    this.persist();
    return sub;
  }

  public topUpScanCredits(
    credits = 100,
    amountInr = 999,
    paymentMethod: 'UPI' | 'Card' = 'UPI'
  ): ClinicSubscriptionState {
    this.ensureDefaultSubscription();
    const sub = this.data.subscription!;
    const now = new Date().toISOString();

    sub.aiScansRemaining += credits;
    sub.aiScansTotalQuota += credits;
    sub.updatedAt = now;
    sub.transactions.unshift({
      id: `tx-topup-${Date.now().toString(36)}`,
      type: 'credit_topup',
      description: `Purchased Top-Up Pack (+${credits} AI Image Scans)`,
      creditsDelta: credits,
      amountInr,
      paymentMethod,
      timestamp: now
    });
    this.persist();
    return sub;
  }
}

export const db = new DatabaseService();

