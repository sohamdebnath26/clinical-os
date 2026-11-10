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
  ClinicSubscriptionState,
  DoctorFormularyItem
} from '../src/types/index.js';
import { UPLOADED_ANTIMICROBIAL_MEDICATIONS } from '../src/data/clinicalCatalogues.js';

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
  formularyItems?: DoctorFormularyItem[];
  subscription?: ClinicSubscriptionState;
  inboxThreads?: any[];
  dispatchedWhatsAppMessages?: any[];
  auditLogs: AuditLog[];
  meta: {
    lastPatientNumber: number;
    version: number;
    updatedAt: string;
  };
}

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'clinical_os_db.json');

class DatabaseService {
  private data: DatabaseSchema;
  private isSaving = false;
  private pendingSave = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.data = this.loadDatabase();
    this.ensureDefaultDoctor();
    this.ensureDefaultSubscription();
    this.ensureDefaultFormulary();
    this.syncAppointmentsFromFollowUps();
    this.syncTestReportsFromConsultations();
    this.syncClinicalImagesFromConsultations();
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
        if (Array.isArray(parsed.doctors)) {
          parsed.doctors.forEach((d: any) => {
            if (!d.role) {
              d.role = d.email === 'receptionist@clinicalos.med' ? 'receptionist' : 'doctor';
            }
          });
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
    this.data.meta.updatedAt = new Date().toISOString();
    if (this.saveTimer) {
      return;
    }
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.writeAsync();
    }, 60);
  }

  private async writeAsync() {
    if (this.isSaving) {
      this.pendingSave = true;
      return;
    }
    this.isSaving = true;
    const tempPath = `${DB_PATH}.tmp`;
    try {
      const serialized = JSON.stringify(this.data, null, 2);
      await fs.promises.writeFile(tempPath, serialized, 'utf-8');
      await fs.promises.rename(tempPath, DB_PATH);
    } catch (err) {
      console.error('Error persisting database:', err);
    } finally {
      this.isSaving = false;
      if (this.pendingSave) {
        this.pendingSave = false;
        void this.writeAsync();
      }
    }
  }

  public flushPendingSaves() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.data.meta.updatedAt = new Date().toISOString();
    try {
      const tempPath = `${DB_PATH}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tempPath, DB_PATH);
      console.log('[Database] Flushed all pending database changes to disk successfully.');
    } catch (err) {
      console.error('[Database] Failed to flush database before shutdown:', err);
    }
  }

  public getAllClinicalImagesForHydration(): ClinicalImage[] {
    return this.data.clinicalImages || [];
  }

  public exportBackup(doctorId?: string): Omit<DatabaseSchema, 'doctorPasswords'> {
    const accessibleIds = doctorId ? this.getAccessiblePatientIds(doctorId) : null;
    const staffDoctors = doctorId ? this.getClinicStaffAccounts(doctorId) : this.data.doctors;
    const patients = accessibleIds
      ? this.data.patients.filter(p => accessibleIds.has(p.id))
      : this.data.patients;
    const consultations = accessibleIds
      ? this.data.consultations.filter(c => accessibleIds.has(c.patientId))
      : this.data.consultations;
    const prescriptions = accessibleIds
      ? this.data.prescriptions.filter(rx => accessibleIds.has(rx.patientId))
      : this.data.prescriptions;
    const appointments = accessibleIds
      ? (this.data.appointments || []).filter(a => accessibleIds.has(a.patientId))
      : this.data.appointments || [];
    const bodyMarkers = accessibleIds
      ? (this.data.bodyMarkers || []).filter(m => accessibleIds.has(m.patientId))
      : this.data.bodyMarkers || [];
    const clinicalImages = accessibleIds
      ? (this.data.clinicalImages || []).filter(img => accessibleIds.has(img.patientId))
      : this.data.clinicalImages || [];
    const testReports = accessibleIds
      ? (this.data.testReports || []).filter(r => accessibleIds.has(r.patientId))
      : this.data.testReports || [];
    const formularyItems = doctorId
      ? this.getDoctorFormulary(doctorId)
      : this.data.formularyItems || [];
    const auditLogs = this.getAuditLogs(500, doctorId);

    return JSON.parse(
      JSON.stringify({
        doctors: staffDoctors,
        patients,
        consultations,
        prescriptions,
        appointments,
        bodyMarkers,
        clinicalImages,
        testReports,
        formularyItems,
        subscription: this.data.subscription,
        auditLogs,
        meta: {
          ...this.data.meta,
          updatedAt: new Date().toISOString()
        }
      })
    );
  }

  public restoreBackup(
    imported: any,
    doctorId?: string
  ): { success: boolean; message: string; count?: number } {
    if (!imported || typeof imported !== 'object') {
      throw new Error('Invalid backup format: root must be an object.');
    }
    if (!Array.isArray(imported.patients) || !Array.isArray(imported.consultations)) {
      throw new Error('Invalid backup schema: missing patients or consultations array.');
    }

    try {
      const safetyBackupPath = path.join(DATA_DIR, `clinical_os_safety_backup_${Date.now()}.json`);
      fs.writeFileSync(safetyBackupPath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (backupErr) {
      console.warn('Could not write pre-restore safety backup:', backupErr);
    }

    const effectiveDoctorId = this.resolveEffectiveClinicDoctorId(doctorId) || doctorId;
    const callerDoc = effectiveDoctorId ? this.findDoctorById(effectiveDoctorId) : undefined;
    const existingAccessiblePatientIds = effectiveDoctorId
      ? this.getAccessiblePatientIds(effectiveDoctorId)
      : null;

    // Tenant-safe merge: never allow a restore operation to overwrite records owned by another clinic
    const incomingPatients: Patient[] = (imported.patients as Patient[]).map(p => ({
      ...p,
      createdById: effectiveDoctorId || p.createdById,
      createdByEmail: callerDoc?.email?.toLowerCase() || p.createdByEmail
    }));

    const patientMap = new Map<string, Patient>();
    for (const p of this.data.patients) {
      if (p && p.id) patientMap.set(p.id, p);
    }
    const restoredPatientIds = new Set<string>();
    for (const incomingPat of incomingPatients) {
      if (!incomingPat || !incomingPat.id) continue;
      const existingPat = patientMap.get(incomingPat.id);
      if (existingPat && existingAccessiblePatientIds && !existingAccessiblePatientIds.has(existingPat.id)) {
        // Prevent cross-tenant ID collision overwrite
        continue;
      }
      patientMap.set(incomingPat.id, incomingPat);
      restoredPatientIds.add(incomingPat.id);
    }
    this.data.patients = Array.from(patientMap.values());

    const allowedPatientIds = new Set<string>([
      ...(existingAccessiblePatientIds || []),
      ...restoredPatientIds
    ]);

    const mergeTenantScoped = <T extends { id: string; patientId?: string }>(
      existingList: T[],
      incomingList: T[]
    ): T[] => {
      const map = new Map<string, T>();
      for (const item of existingList) {
        if (item && item.id) map.set(item.id, item);
      }
      for (const item of incomingList) {
        if (!item || !item.id) continue;
        if (item.patientId && effectiveDoctorId && !allowedPatientIds.has(item.patientId)) {
          continue;
        }
        const existingItem = map.get(item.id);
        if (
          existingItem &&
          existingItem.patientId &&
          effectiveDoctorId &&
          !allowedPatientIds.has(existingItem.patientId)
        ) {
          continue;
        }
        map.set(item.id, item);
      }
      return Array.from(map.values());
    };

    this.data.consultations = mergeTenantScoped(this.data.consultations, imported.consultations || []);
    this.data.prescriptions = mergeTenantScoped(this.data.prescriptions, imported.prescriptions || []);
    this.data.appointments = mergeTenantScoped(this.data.appointments || [], imported.appointments || []);
    this.data.bodyMarkers = mergeTenantScoped(this.data.bodyMarkers || [], imported.bodyMarkers || []);
    this.data.clinicalImages = mergeTenantScoped(this.data.clinicalImages || [], imported.clinicalImages || []);
    this.data.testReports = mergeTenantScoped(this.data.testReports || [], imported.testReports || []);
    if (imported.meta?.lastPatientNumber && imported.meta.lastPatientNumber > this.data.meta.lastPatientNumber) {
      this.data.meta.lastPatientNumber = imported.meta.lastPatientNumber;
    }

    this.ensureDefaultDoctor();
    this.ensureDefaultSubscription();
    this.flushPendingSaves();

    const accessibleCount = doctorId ? this.getPatients(undefined, doctorId).length : this.data.patients.length;
    return {
      success: true,
      message: 'Clinic data restored successfully',
      count: accessibleCount
    };
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

    // 3. Ensure Default Receptionist Account
    let recDoc = this.data.doctors.find(d => d.email.toLowerCase() === 'receptionist@clinicalos.med');
    if (!recDoc) {
      const recId = 'doc-rec-001';
      recDoc = {
        id: recId,
        name: 'Emily (Front Desk Receptionist)',
        email: 'receptionist@clinicalos.med',
        speciality: 'Front Desk & Patient Access',
        registrationNumber: 'REC-2026-01',
        clinicName: 'Cliniq Dermatology Center',
        phone: '9876543211',
        defaultConsultationFee: 0,
        avatarUrl: '',
        accountType: 'individual',
        role: 'receptionist',
        createdAt: new Date().toISOString()
      };
      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync('Demo@1234', salt);
      this.data.doctors.push(recDoc);
      this.data.doctorPasswords[recId] = hash;
      this.persist();
    } else {
      let updated = false;
      if (recDoc.role !== 'receptionist') {
        recDoc.role = 'receptionist';
        updated = true;
      }
      if (!this.data.doctorPasswords[recDoc.id]) {
        const salt = bcrypt.genSaltSync(10);
        this.data.doctorPasswords[recDoc.id] = bcrypt.hashSync('Demo@1234', salt);
        updated = true;
      }
      if (updated) this.persist();
    }

    // 4. Ensure Google Auth Default Doctor & Institutional SSO Preset Doctors with deterministic IDs
    const presetDoctors: Array<Doctor & { defaultPass: string }> = [
      {
        id: 'doc-google-001',
        name: 'Dr. Alex Mercer',
        email: 'dr.alex.mercer@gmail.com',
        speciality: 'Dermatologist & Laser Surgeon',
        registrationNumber: 'G-MD-482910',
        clinicName: 'Mercer Dermatology Practice',
        phone: '9876543212',
        defaultConsultationFee: 500,
        avatarUrl: '',
        accountType: 'individual',
        createdAt: new Date().toISOString(),
        defaultPass: 'Demo@1234_google_auth'
      },
      {
        id: 'doc-org-002',
        name: 'Dr. Ayesha Patel, MBChB, FRCP',
        email: 'ayesha.patel@nhs.net',
        speciality: 'Regional Cutaneous Oncology & Phototherapy Unit',
        registrationNumber: 'NHS-ATT-77319',
        clinicName: 'NHS Foundation Trust Hospitals',
        phone: '9876543213',
        defaultConsultationFee: 650,
        avatarUrl: '',
        accountType: 'organisational',
        organizationName: 'NHS Foundation Trust Hospitals',
        organizationDepartment: 'Regional Cutaneous Oncology & Phototherapy Unit',
        createdAt: new Date().toISOString(),
        defaultPass: 'Demo@1234_sso_managed'
      },
      {
        id: 'doc-org-003',
        name: 'Dr. Michael Torres, MD',
        email: 'm.torres@stjude-health.edu',
        speciality: 'Pediatric & General Dermatology Division',
        registrationNumber: 'STJ-ATT-51902',
        clinicName: 'St. Jude Academic Medical Network',
        phone: '9876543214',
        defaultConsultationFee: 650,
        avatarUrl: '',
        accountType: 'organisational',
        organizationName: 'St. Jude Academic Medical Network',
        organizationDepartment: 'Pediatric & General Dermatology Division',
        createdAt: new Date().toISOString(),
        defaultPass: 'Demo@1234_sso_managed'
      },
      {
        id: 'doc-org-004',
        name: 'Dr. James Wilson, MD',
        email: 'jwilson@apexhealth.org',
        speciality: 'Outpatient Dermatology & Aesthetics Center',
        registrationNumber: 'APX-ATT-62041',
        clinicName: 'Apex Health Enterprise System',
        phone: '9876543215',
        defaultConsultationFee: 650,
        avatarUrl: '',
        accountType: 'organisational',
        organizationName: 'Apex Health Enterprise System',
        organizationDepartment: 'Outpatient Dermatology & Aesthetics Center',
        createdAt: new Date().toISOString(),
        defaultPass: 'Demo@1234_sso_managed'
      }
    ];

    let presetAdded = false;
    for (const preset of presetDoctors) {
      const existing = this.data.doctors.find(d => d.email.toLowerCase() === preset.email.toLowerCase());
      if (!existing) {
        const { defaultPass, ...docFields } = preset;
        this.data.doctors.push(docFields);
        const salt = bcrypt.genSaltSync(10);
        this.data.doctorPasswords[docFields.id] = bcrypt.hashSync(defaultPass, salt);
        presetAdded = true;
      }
    }
    if (presetAdded) {
      this.persist();
    }
  }

  // --- Doctor & Auth methods ---
  private static readonly DEMO_EMAILS = new Set([
    'demo@clinicalos.med',
    'demo@cliniq.com',
    'hospital@metrohealth.org',
    'receptionist@clinicalos.med',
    'emily@clinicalos.med',
    'dr.alex.mercer@gmail.com',
    'ayesha.patel@nhs.net',
    'm.torres@stjude-health.edu',
    'jwilson@apexhealth.org'
  ]);

  private static readonly DEMO_DOCTOR_IDS = new Set([
    'doc-demo-001',
    'doc-org-001',
    'doc-rec-001',
    'doc-google-001',
    'doc-org-002',
    'doc-org-003',
    'doc-org-004'
  ]);

  public getDeterministicDoctorId(email: string): string {
    const clean = email.trim().toLowerCase();
    const slug = clean.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return `doc-acct-${slug || 'physician'}`;
  }

  public isDemoAccount(doctorId?: string): boolean {
    if (!doctorId) return true;
    if (DatabaseService.DEMO_DOCTOR_IDS.has(doctorId)) return true;
    const doc = this.findDoctorById(doctorId);
    if (!doc) return false;
    return DatabaseService.DEMO_EMAILS.has(doc.email.toLowerCase());
  }

  public resolveEffectiveClinicDoctorId(doctorId?: string): string | undefined {
    if (!doctorId) return undefined;
    const callerDoc = this.findDoctorById(doctorId);
    if (!callerDoc) return doctorId;
    if (callerDoc.assignedByDoctorId && callerDoc.assignedByDoctorId !== callerDoc.id) {
      return callerDoc.assignedByDoctorId;
    }
    return doctorId;
  }

  public canDoctorAccessPatient(patient: Patient, doctorId?: string): boolean {
    if (!doctorId) return false;
    const effectiveDoctorId = this.resolveEffectiveClinicDoctorId(doctorId) || doctorId;
    const callerDoc = this.findDoctorById(effectiveDoctorId) || this.findDoctorById(doctorId);
    const callerEmail = callerDoc?.email?.trim().toLowerCase();
    const patientOwnerEmail =
      patient.createdByEmail?.trim().toLowerCase() ||
      (patient.createdById ? this.findDoctorById(patient.createdById)?.email?.trim().toLowerCase() : undefined);

    // Direct ownership match by ID, email, or deterministic account ID
    if (patient.createdById && (patient.createdById === effectiveDoctorId || patient.createdById === doctorId)) {
      return true;
    }
    if (callerEmail && patientOwnerEmail && callerEmail === patientOwnerEmail) {
      return true;
    }
    if (callerEmail && patient.createdById === this.getDeterministicDoctorId(callerEmail)) {
      return true;
    }

    // Same-clinic staff membership check (e.g., co-doctor or receptionist assigned to the same clinic owner)
    if (patient.createdById) {
      const patientOwnerResolved = this.resolveEffectiveClinicDoctorId(patient.createdById) || patient.createdById;
      if (patientOwnerResolved === effectiveDoctorId) {
        return true;
      }
    }

    const isCallerDemo = this.isDemoAccount(effectiveDoctorId) || this.isDemoAccount(doctorId);
    if (isCallerDemo) {
      // Demo accounts see seeded/demo patients, never private real-doctor patients
      return !patient.createdById || this.isDemoAccount(patient.createdById);
    }

    return false;
  }

  public findDoctorByEmail(email: string): Doctor | undefined {
    const clean = email.trim().toLowerCase();
    if (clean === 'emily@clinicalos.med') {
      return this.data.doctors.find(d => d.email.toLowerCase() === 'receptionist@clinicalos.med');
    }
    if (clean === 'demo@cliniq.com') {
      return this.data.doctors.find(d => d.email.toLowerCase() === 'demo@clinicalos.med');
    }
    return this.data.doctors.find(d => d.email.toLowerCase() === clean);
  }

  public findDoctorById(id: string): Doctor | undefined {
    return this.data.doctors.find(d => d.id === id);
  }

  /**
   * Seamlessly restores or creates a doctor account if the server/container restarted
   * (e.g., on Render free tier spin-down or redeploy) while a doctor session token was active.
   */
  public restoreOrEnsureDoctor(payload: {
    id?: string;
    email?: string;
    name?: string;
    speciality?: string;
    registrationNumber?: string;
    clinicName?: string;
    role?: 'doctor' | 'receptionist';
    accountType?: 'individual' | 'organisational';
  }): Doctor | undefined {
    if (payload.email) {
      const byEmail = this.findDoctorByEmail(payload.email);
      if (byEmail) return byEmail;
    }
    if (payload.id) {
      const byId = this.findDoctorById(payload.id);
      if (byId) return byId;
    }
    if (!payload.id && !payload.email) {
      return undefined;
    }

    const cleanEmail = payload.email ? payload.email.toLowerCase().trim() : '';
    const restoredId =
      payload.id ||
      (cleanEmail ? this.getDeterministicDoctorId(cleanEmail) : `doc-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`);
    const restoredEmail = cleanEmail || `${restoredId}@clinicalos.med`;
    const restoredDoc: Doctor = {
      id: restoredId,
      name: payload.name || 'Dr. Attending Physician',
      email: restoredEmail,
      speciality: payload.speciality || 'Dermatologist & Cosmetologist',
      registrationNumber: payload.registrationNumber || `REG-${Math.floor(100000 + Math.random() * 900000)}`,
      clinicName: payload.clinicName || 'Cliniq Dermatology Center',
      phone: '9876543210',
      defaultConsultationFee: 500,
      role: payload.role,
      accountType: payload.accountType || 'individual',
      createdAt: new Date().toISOString()
    };

    this.data.doctors.push(restoredDoc);
    if (!this.data.doctorPasswords[restoredId]) {
      const salt = bcrypt.genSaltSync(10);
      this.data.doctorPasswords[restoredId] = bcrypt.hashSync('Demo@1234', salt);
    }
    this.persist();
    return restoredDoc;
  }

  public isKnownPresetEmail(email: string): boolean {
    return DatabaseService.DEMO_EMAILS.has(email.trim().toLowerCase());
  }

  public verifyPassword(doctorId: string, passwordAttempt: string): boolean {
    const hash = this.data.doctorPasswords[doctorId];
    if (!hash) {
      if (this.isDemoAccount(doctorId) && passwordAttempt === 'Demo@1234') return true;
      return false;
    }
    return bcrypt.compareSync(passwordAttempt, hash);
  }

  public createDoctor(params: {
    id?: string;
    name: string;
    email: string;
    password: string;
    speciality?: string;
    registrationNumber?: string;
    clinicName?: string;
    phone?: string;
    role?: 'doctor' | 'receptionist';
    assignedByDoctorId?: string;
    assignedByEmail?: string;
    allowOverwritePassword?: boolean;
  }): Doctor {
    const cleanEmail = params.email.trim().toLowerCase();
    const existing = this.findDoctorByEmail(cleanEmail);
    if (existing) {
      if (params.allowOverwritePassword || !this.data.doctorPasswords[existing.id]) {
        const salt = bcrypt.genSaltSync(10);
        this.data.doctorPasswords[existing.id] = bcrypt.hashSync(params.password, salt);
      }
      if (params.name) existing.name = params.name;
      if (params.speciality) existing.speciality = params.speciality;
      if (params.clinicName) existing.clinicName = params.clinicName;
      if (params.registrationNumber) existing.registrationNumber = params.registrationNumber;
      if (params.phone) existing.phone = params.phone;
      if (params.role) existing.role = params.role;
      if (params.assignedByDoctorId) existing.assignedByDoctorId = params.assignedByDoctorId;
      if (params.assignedByEmail) existing.assignedByEmail = params.assignedByEmail;
      this.persist();
      return existing;
    }

    const id = params.id || this.getDeterministicDoctorId(cleanEmail);
    const doctor: Doctor = {
      id,
      name: params.name,
      email: cleanEmail,
      speciality: params.speciality || (params.role === 'receptionist' ? 'Front Desk & Patient Access' : 'General Practitioner'),
      registrationNumber: params.registrationNumber || (params.role === 'receptionist' ? `REC-${Math.floor(1000 + Math.random() * 9000)}` : `REG-${Math.floor(100000 + Math.random() * 900000)}`),
      clinicName: params.clinicName || 'Clinical OS Medical Practice',
      phone: params.phone || '',
      defaultConsultationFee: params.role === 'receptionist' ? 0 : 500,
      role: params.role || 'doctor',
      assignedByDoctorId: params.assignedByDoctorId,
      assignedByEmail: params.assignedByEmail,
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

  // --- Staff & Email Role Assignment Methods (Doctor assigns Email as Doctor or Receptionist) ---
  public getClinicStaffAccounts(doctorId: string): Doctor[] {
    const currentDoc = this.findDoctorById(doctorId);
    const effectiveOwnerId = this.resolveEffectiveClinicDoctorId(doctorId) || doctorId;
    const ownerDoc = this.findDoctorById(effectiveOwnerId) || currentDoc;

    return this.data.doctors.filter(d => {
      if (d.id === doctorId || d.id === effectiveOwnerId) return true;
      if (d.assignedByDoctorId === effectiveOwnerId || d.assignedByDoctorId === doctorId) return true;
      if (ownerDoc && d.assignedByEmail && d.assignedByEmail.toLowerCase() === ownerDoc.email.toLowerCase()) return true;
      if (this.isDemoAccount(effectiveOwnerId) && d.email.toLowerCase() === 'receptionist@clinicalos.med') return true;
      return false;
    });
  }

  public assignEmailRole(params: {
    email: string;
    name?: string;
    role: 'doctor' | 'receptionist';
    assignedByDoctor: Doctor;
  }): Doctor {
    const cleanEmail = params.email.trim().toLowerCase();
    const existing = this.findDoctorByEmail(cleanEmail);
    const emailPrefix = cleanEmail.split('@')[0].replace(/[._-]+/g, ' ');
    const defaultFormattedName = emailPrefix
      .split(' ')
      .filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    const resolvedName =
      params.name?.trim() ||
      (existing?.name
        ? params.role === 'receptionist'
          ? existing.name.replace(/^Dr\.\s*/i, '')
          : existing.name.startsWith('Dr.')
          ? existing.name
          : `Dr. ${existing.name}`
        : params.role === 'receptionist'
        ? `${defaultFormattedName} (Receptionist)`
        : `Dr. ${defaultFormattedName}`);

    if (existing) {
      existing.role = params.role;
      existing.name = resolvedName;
      existing.clinicName = params.assignedByDoctor.clinicName || existing.clinicName;
      existing.speciality =
        params.role === 'receptionist'
          ? 'Front Desk & Patient Access'
          : existing.speciality === 'Front Desk & Patient Access'
          ? 'Dermatologist & Cosmetologist'
          : existing.speciality;
      if (existing.id !== params.assignedByDoctor.id) {
        existing.assignedByDoctorId = params.assignedByDoctor.id;
        existing.assignedByEmail = params.assignedByDoctor.email.toLowerCase();
      }
      this.persist();

      this.logAudit({
        actorId: params.assignedByDoctor.id,
        actorName: params.assignedByDoctor.name,
        action: `assigned_role_${params.role}`,
        resourceType: 'staff_role',
        resourceId: existing.id,
        metadata: { email: cleanEmail, role: params.role }
      });

      return existing;
    }

    const created = this.createDoctor({
      name: resolvedName,
      email: cleanEmail,
      password: 'Demo@1234',
      role: params.role,
      clinicName: params.assignedByDoctor.clinicName || 'Cliniq Dermatology Center',
      speciality:
        params.role === 'receptionist'
          ? 'Front Desk & Patient Access'
          : 'Dermatologist & Cosmetologist',
      assignedByDoctorId: params.assignedByDoctor.id,
      assignedByEmail: params.assignedByDoctor.email.toLowerCase()
    });

    this.logAudit({
      actorId: params.assignedByDoctor.id,
      actorName: params.assignedByDoctor.name,
      action: `assigned_role_${params.role}`,
      resourceType: 'staff_role',
      resourceId: created.id,
      metadata: { email: cleanEmail, role: params.role }
    });

    return created;
  }

  public removeStaffAccount(targetId: string, actorId: string): boolean {
    if (targetId === actorId || DatabaseService.DEMO_DOCTOR_IDS.has(targetId)) {
      return false;
    }
    const idx = this.data.doctors.findIndex(d => d.id === targetId);
    if (idx < 0) return false;
    this.data.doctors.splice(idx, 1);
    delete this.data.doctorPasswords[targetId];
    this.persist();
    return true;
  }

  // --- Patients methods ---
  public generatePatientCode(): string {
    this.data.meta.lastPatientNumber += 1;
    this.persist();
    return `P-${this.data.meta.lastPatientNumber}`;
  }

  public getPatients(query?: string, doctorId?: string): Patient[] {
    let list = this.data.patients.filter(p => this.canDoctorAccessPatient(p, doctorId));
    if (query && query.trim()) {
      const q = query.toLowerCase().trim();
      const cleanDigits = q.replace(/\D/g, '');
      list = list.filter(p =>
        p.fullName.toLowerCase().includes(q) ||
        p.patientCode.toLowerCase().includes(q) ||
        p.mobile.toLowerCase().includes(q) ||
        (cleanDigits.length >= 3 && p.mobile.replace(/\D/g, '').includes(cleanDigits)) ||
        (p.primaryDiagnosis && p.primaryDiagnosis.toLowerCase().includes(q))
      );
    }
    // Sort by latest created or updated
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public findPatientById(id: string, doctorId?: string): Patient | undefined {
    const patient = this.data.patients.find(p => p.id === id);
    if (!patient) return undefined;
    if (doctorId && !this.canDoctorAccessPatient(patient, doctorId)) return undefined;
    return patient;
  }

  public findPatientByMobile(mobile: string, doctorId?: string): Patient | undefined {
    const clean = mobile.replace(/\D/g, '');
    if (!clean) return undefined;
    return this.data.patients.find(
      p => p.mobile.replace(/\D/g, '') === clean && this.canDoctorAccessPatient(p, doctorId)
    );
  }

  public deletePatient(patientId: string, actor: { id: string; name: string }): boolean {
    const idx = this.data.patients.findIndex(p => p.id === patientId);
    if (idx === -1) return false;
    const deleted = this.data.patients[idx];

    // Remove patient
    this.data.patients.splice(idx, 1);

    // Cascade delete associated records
    this.data.consultations = this.data.consultations.filter(c => c.patientId !== patientId);
    this.data.prescriptions = this.data.prescriptions.filter(p => p.patientId !== patientId);
    this.data.appointments = this.data.appointments.filter(a => a.patientId !== patientId);
    this.data.clinicalImages = this.data.clinicalImages.filter(img => img.patientId !== patientId);
    if (this.data.testReports) {
      this.data.testReports = this.data.testReports.filter(r => r.patientId !== patientId);
    }

    this.logAudit({
      actorId: actor.id,
      actorName: actor.name,
      action: 'delete_patient',
      resourceType: 'patient',
      resourceId: patientId,
      metadata: { patientCode: deleted.patientCode, patientName: deleted.fullName }
    });

    this.persist();
    return true;
  }

  public createPatient(
    patientData: Omit<Patient, 'id' | 'patientCode' | 'createdAt' | 'updatedAt'> & {
      id?: string;
      patientCode?: string;
      createdAt?: string;
      updatedAt?: string;
    },
    actor: { id: string; name: string; email?: string }
  ): Patient {
    const id =
      patientData.id ||
      `pat-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const patientCode = patientData.patientCode || this.generatePatientCode();
    const now = new Date().toISOString();
    const effectiveOwnerId = this.resolveEffectiveClinicDoctorId(actor.id) || actor.id;
    const effectiveOwnerDoc = this.findDoctorById(effectiveOwnerId);
    const actorEmail =
      effectiveOwnerDoc?.email ||
      actor.email ||
      patientData.createdByEmail ||
      this.findDoctorById(actor.id)?.email ||
      undefined;

    const existingIdx = this.data.patients.findIndex(p => p.id === id);
    const newPatient: Patient = {
      ...patientData,
      mobile: String(patientData.mobile || '').replace(/\D/g, '').slice(-10),
      createdById: patientData.createdById || effectiveOwnerId,
      createdByEmail: actorEmail ? actorEmail.toLowerCase().trim() : undefined,
      id,
      patientCode,
      createdAt: patientData.createdAt || now,
      updatedAt: patientData.updatedAt || now
    };

    if (existingIdx >= 0) {
      this.data.patients[existingIdx] = newPatient;
    } else {
      this.data.patients.push(newPatient);
    }
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

  public syncDoctorPatients(
    incomingPatients: Partial<Patient>[],
    doctor: Doctor
  ): Patient[] {
    if (!Array.isArray(incomingPatients) || incomingPatients.length === 0) {
      return this.getPatients(undefined, doctor.id);
    }

    let changed = false;
    const now = new Date().toISOString();
    const cleanDoctorEmail = doctor.email.toLowerCase().trim();

    for (const raw of incomingPatients) {
      if (!raw || !raw.fullName) continue;
      const existingById = raw.id ? this.data.patients.find(p => p.id === raw.id) : undefined;
      if (existingById) {
        if (!existingById.createdById) existingById.createdById = doctor.id;
        if (!existingById.createdByEmail) existingById.createdByEmail = cleanDoctorEmail;
        changed = true;
        continue;
      }

      const id =
        raw.id ||
        `pat-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
      const patientCode = raw.patientCode || this.generatePatientCode();

      const syncedPatient: Patient = {
        id,
        patientCode,
        fullName: String(raw.fullName).trim(),
        age: Number(raw.age) || 0,
        gender: (raw.gender as Patient['gender']) || 'Prefer not to say',
        mobile: String(raw.mobile || '').replace(/\D/g, '').slice(-10),
        countryCode: raw.countryCode || '+91',
        weight: raw.weight !== undefined ? Number(raw.weight) : undefined,
        notes: raw.notes || '',
        discountPanel: raw.discountPanel || '',
        primaryDiagnosis: raw.primaryDiagnosis || 'General Consultation',
        dateOfBirth: raw.dateOfBirth || '',
        bloodGroup: raw.bloodGroup || '',
        address: raw.address || '',
        emergencyContact: raw.emergencyContact || '',
        allergies: raw.allergies || '',
        currentMedications: raw.currentMedications || '',
        medicalHistory: raw.medicalHistory || '',
        createdById: doctor.id,
        createdByEmail: cleanDoctorEmail,
        createdAt: raw.createdAt || now,
        updatedAt: raw.updatedAt || now,
        lastVisitAt: raw.lastVisitAt
      };

      this.data.patients.push(syncedPatient);
      changed = true;
    }

    if (changed) {
      this.persist();
    }

    return this.getPatients(undefined, doctor.id);
  }

  public updatePatient(id: string, updates: Partial<Patient>, actor: { id: string; name: string }): Patient | null {
    const p = this.data.patients.find(item => item.id === id);
    if (!p) return null;

    if (updates.mobile !== undefined) {
      const cleaned = String(updates.mobile).replace(/\D/g, '');
      updates.mobile = cleaned.length > 10 ? cleaned.slice(-10) : cleaned;
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
      const enrichedPrescriptions = updates.prescriptions.map((rx, idx) => ({
        ...rx,
        id: rx.id || `rx-${id}-${idx}-${Date.now().toString(36)}`,
        patientId: consultation.patientId,
        consultationId: id,
        date: rx.date || consultation.consultationDate || now,
        createdAt: rx.createdAt || now
      }));
      this.data.prescriptions.push(...enrichedPrescriptions);
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
  private getAccessiblePatientIds(doctorId?: string): Set<string> {
    return new Set(
      this.data.patients
        .filter(p => this.canDoctorAccessPatient(p, doctorId))
        .map(p => p.id)
    );
  }

  public getPrescriptions(patientId?: string, doctorId?: string): PrescriptionItem[] {
    const accessibleIds = doctorId ? this.getAccessiblePatientIds(doctorId) : null;
    let list = this.data.prescriptions.filter(p => !accessibleIds || accessibleIds.has(p.patientId));
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
  private generateBaselineAndFollowUpSvgPair(diagnosisText: string): {
    pastDataUrl: string;
    pastCaption: string;
    pastBodyArea: string;
    pastModality: string;
    pastFindings: string;
    currentDataUrl: string;
    currentCaption: string;
    currentFindings: string;
  } {
    const lower = diagnosisText.toLowerCase();
    const toBase64Svg = (svg: string) =>
      `data:image/svg+xml;base64,${Buffer.from(svg.trim(), 'utf8').toString('base64')}`;

    if (lower.includes('acne') || lower.includes('comedon')) {
      const pastSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
        <rect width="400" height="300" fill="#f5d2b8"/>
        <circle cx="135" cy="110" r="36" fill="#d93829" opacity="0.72"/>
        <circle cx="135" cy="110" r="20" fill="#b82518" opacity="0.90"/>
        <circle cx="135" cy="110" r="9" fill="#fff8c4"/>
        <circle cx="215" cy="155" r="46" fill="#d93829" opacity="0.76"/>
        <circle cx="215" cy="155" r="26" fill="#b82518" opacity="0.92"/>
        <circle cx="215" cy="155" r="12" fill="#fff9c4"/>
        <circle cx="285" cy="120" r="34" fill="#d93829" opacity="0.68"/>
        <circle cx="285" cy="120" r="18" fill="#b82518" opacity="0.86"/>
        <circle cx="285" cy="120" r="8" fill="#fff8c4"/>
        <circle cx="170" cy="210" r="28" fill="#d93829" opacity="0.78"/>
        <circle cx="255" cy="215" r="26" fill="#d93829" opacity="0.74"/>
        <circle cx="178" cy="126" r="3.5" fill="#2c3e50"/>
        <circle cx="242" cy="138" r="3.2" fill="#2c3e50"/>
      </svg>`;
      const currentSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
        <rect width="400" height="300" fill="#f6d8c0"/>
        <circle cx="135" cy="110" r="18" fill="#e57368" opacity="0.38"/>
        <circle cx="215" cy="155" r="24" fill="#e57368" opacity="0.42"/>
        <circle cx="215" cy="155" r="10" fill="#c95b50" opacity="0.45"/>
        <circle cx="285" cy="120" r="15" fill="#e57368" opacity="0.32"/>
        <circle cx="170" cy="210" r="14" fill="#d98276" opacity="0.35"/>
        <circle cx="255" cy="215" r="12" fill="#d98276" opacity="0.30"/>
      </svg>`;
      return {
        pastDataUrl: toBase64Svg(pastSvg),
        pastCaption: 'Past Baseline — Bilateral Malar Cheeks (Grade III Papulopustular Acne)',
        pastBodyArea: 'Bilateral Malar Cheeks & Jawline',
        pastModality: 'Clinical Photo',
        pastFindings:
          'Multiple tense inflammatory papulopustules (8–12 mm erythema halos), central pustular cores, and open comedones across bilateral cheeks; high baseline erythema index (76/100).',
        currentDataUrl: toBase64Svg(currentSvg),
        currentCaption: 'Follow-Up Visit — Bilateral Cheeks Post-Peel & Minocycline Regimen',
        currentFindings:
          'Marked flattening of papulopustular lesions with absence of active pustular heads; residual faint post-inflammatory erythema macules (erythema index reduced to 38/100).'
      };
    }

    const pastMoleSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
      <rect width="400" height="300" fill="#efd2b9"/>
      <path d="M125 150 C115 88, 255 78, 275 132 C295 195, 238 232, 172 222 C115 212, 92 178, 125 150 Z" fill="#7a4421" opacity="0.82"/>
      <path d="M142 146 C132 102, 240 92, 258 136 C272 184, 226 214, 176 206 C132 198, 114 172, 142 146 Z" fill="#3b1e0d" opacity="0.92"/>
      <circle cx="195" cy="142" r="18" fill="#1a0c05" opacity="0.95"/>
      <circle cx="165" cy="166" r="13" fill="#241107" opacity="0.92"/>
    </svg>`;
    const currentMoleSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
      <rect width="400" height="300" fill="#f1d6be"/>
      <ellipse cx="198" cy="152" rx="52" ry="38" fill="#d99b78" opacity="0.55"/>
      <ellipse cx="198" cy="152" rx="32" ry="22" fill="#e6b497" opacity="0.72"/>
      <circle cx="195" cy="150" r="8" fill="#b87a56" opacity="0.45"/>
    </svg>`;
    return {
      pastDataUrl: toBase64Svg(pastMoleSvg),
      pastCaption: 'Past Baseline — Pre-RF Ablation Cutaneous Lesion / Skin Tags',
      pastBodyArea: 'Lateral Neck & Upper Trunk',
      pastModality: 'Dermoscopy',
      pastFindings:
        'Hyperkeratotic hyperpigmented papillomatous lesions prior to radiofrequency ablation; dark melanin core with peripheral tan network (pigmentation index 68/100).',
      currentDataUrl: toBase64Svg(currentMoleSvg),
      currentCaption: 'Follow-Up Visit — Post-RF Ablation Re-epithelialized Site',
      currentFindings:
        'Clean re-epithelialization following radiofrequency ablation; dark papillomatous tissue resolved with mild pink-tan remodeling macule and intact epidermal barrier.'
    };
  }

  private syncClinicalImagesFromConsultations() {
    if (!this.data.clinicalImages) {
      this.data.clinicalImages = [];
    }
    let changed = false;

    for (const patient of this.data.patients) {
      const existingPatientImgs = this.data.clinicalImages.filter(i => i.patientId === patient.id);
      const patientConsults = this.data.consultations
        .filter(c => c.patientId === patient.id)
        .sort(
          (a, b) =>
            new Date(a.consultationDate || a.createdAt).getTime() -
            new Date(b.consultationDate || b.createdAt).getTime()
        );

      if (existingPatientImgs.length === 0 && patientConsults.length > 0) {
        const firstConsult = patientConsults[0];
        const latestConsult = patientConsults[patientConsults.length - 1];
        const diagContext = [
          patient.primaryDiagnosis || '',
          ...(firstConsult.diagnoses || []),
          ...(firstConsult.symptoms || []),
          ...(latestConsult.diagnoses || [])
        ].join(' ');

        const pair = this.generateBaselineAndFollowUpSvgPair(diagContext);
        const firstDate = firstConsult.consultationDate || firstConsult.createdAt;
        const pastDateIso =
          patientConsults.length >= 2
            ? firstDate
            : new Date(new Date(firstDate).getTime() - 21 * 24 * 60 * 60 * 1000).toISOString();
        const currentDateIso = latestConsult.consultationDate || latestConsult.createdAt;

        const pastImg: ClinicalImage = {
          id: `img-past-${patient.id.slice(-6)}`,
          patientId: patient.id,
          consultationId: firstConsult.id,
          url: pair.pastDataUrl,
          dataUrl: pair.pastDataUrl,
          filename: `past_baseline_${patient.patientCode.toLowerCase()}.svg`,
          mimeType: 'image/svg+xml',
          sizeBytes: pair.pastDataUrl.length,
          caption: pair.pastCaption,
          bodyArea: pair.pastBodyArea,
          modality: pair.pastModality,
          imageRole: 'past',
          examDate: pastDateIso.split('T')[0],
          extractedFindings: pair.pastFindings,
          tags: ['Past Medical Image', 'Baseline'],
          createdAt: pastDateIso
        };

        const currentImg: ClinicalImage = {
          id: `img-curr-${patient.id.slice(-6)}`,
          patientId: patient.id,
          consultationId: latestConsult.id,
          url: pair.currentDataUrl,
          dataUrl: pair.currentDataUrl,
          filename: `followup_${patient.patientCode.toLowerCase()}.svg`,
          mimeType: 'image/svg+xml',
          sizeBytes: pair.currentDataUrl.length,
          caption: pair.currentCaption,
          bodyArea: pair.pastBodyArea,
          modality: pair.pastModality,
          imageRole: 'current',
          examDate: currentDateIso.split('T')[0],
          extractedFindings: pair.currentFindings,
          tags: ['Follow-up Image', 'Current'],
          createdAt: currentDateIso
        };

        this.data.clinicalImages.push(pastImg, currentImg);
        changed = true;
      }
    }

    if (changed) {
      this.persist();
    }
  }

  public getPatientImages(patientId: string): ClinicalImage[] {
    return this.data.clinicalImages
      .filter(i => i.patientId === patientId)
      .map(img => ({
        ...img,
        url: img.dataUrl && (!img.url || img.url.startsWith('/uploads/')) ? img.dataUrl : img.url
      }))
      .sort(
        (a, b) =>
          new Date(a.examDate || a.createdAt).getTime() -
          new Date(b.examDate || b.createdAt).getTime()
      );
  }

  public getClinicalImageById(id: string): ClinicalImage | undefined {
    const img = this.data.clinicalImages.find(i => i.id === id);
    if (!img) return undefined;
    return {
      ...img,
      url: img.dataUrl && (!img.url || img.url.startsWith('/uploads/')) ? img.dataUrl : img.url
    };
  }

  public getClinicalImageByFilename(filename: string): ClinicalImage | undefined {
    const cleanBase = path.basename(filename).toLowerCase();
    return this.data.clinicalImages.find(i => {
      const fMatch = i.filename && path.basename(i.filename).toLowerCase() === cleanBase;
      const uMatch = i.url && !i.url.startsWith('data:') && path.basename(i.url).toLowerCase() === cleanBase;
      const idMatch = cleanBase.startsWith(i.id.toLowerCase() + '.');
      return Boolean(fMatch || uMatch || idMatch);
    });
  }

  public addClinicalImage(img: ClinicalImage): ClinicalImage {
    const existingIdx = this.data.clinicalImages.findIndex(i => i.id === img.id);
    if (existingIdx >= 0) {
      this.data.clinicalImages[existingIdx] = img;
    } else {
      this.data.clinicalImages.push(img);
    }
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
  public getAppointments(
    filters?: { patientId?: string; date?: string; status?: string },
    doctorId?: string
  ): Appointment[] {
    const accessibleIds = doctorId ? this.getAccessiblePatientIds(doctorId) : null;
    let list = (this.data.appointments || []).filter(
      a => !accessibleIds || accessibleIds.has(a.patientId)
    );
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
  public getTestReportById(id: string): PatientTestReport | undefined {
    return (this.data.testReports || []).find(r => r.id === id);
  }

  public getTestReportsByPatient(patientId: string): PatientTestReport[] {
    if (!this.data.testReports) this.data.testReports = [];
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
  public getStats(doctorId?: string): ClinicStats {
    const accessibleIds = doctorId ? this.getAccessiblePatientIds(doctorId) : null;
    const patients = accessibleIds
      ? this.data.patients.filter(p => accessibleIds.has(p.id))
      : this.data.patients;
    const consultations = accessibleIds
      ? this.data.consultations.filter(c => accessibleIds.has(c.patientId))
      : this.data.consultations;
    const prescriptions = accessibleIds
      ? this.data.prescriptions.filter(rx => accessibleIds.has(rx.patientId))
      : this.data.prescriptions;

    const totalPatients = patients.length;
    const todayStr = new Date().toISOString().split('T')[0];

    // Visits today
    const visitsToday = consultations.filter(c => {
      const cDate = c.consultationDate.split('T')[0];
      return cDate === todayStr && c.status === 'signed';
    }).length;

    // Visits last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const visitsLast7Days = consultations.filter(c => {
      return new Date(c.consultationDate) >= sevenDaysAgo && c.status === 'signed';
    }).length;

    // Follow-ups due (within next 7 days or overdue)
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const followUpsDue = consultations.filter(c => {
      if (!c.followUp || !c.followUp.date) return false;
      const fDate = new Date(c.followUp.date);
      return fDate <= nextWeek;
    }).length;

    // Active prescriptions
    const activePrescriptions = prescriptions.length;

    return {
      totalPatients,
      visitsToday,
      visitsLast7Days,
      followUpsDue,
      activePrescriptions
    };
  }

  public getRecentVisits(limit = 10, doctorId?: string): Consultation[] {
    const accessibleIds = doctorId ? this.getAccessiblePatientIds(doctorId) : null;
    return this.data.consultations
      .filter(c => c.status === 'signed' && (!accessibleIds || accessibleIds.has(c.patientId)))
      .sort((a, b) => new Date(b.consultationDate).getTime() - new Date(a.consultationDate).getTime())
      .slice(0, limit);
  }

  public getRecentPatients(limit = 10, doctorId?: string): Patient[] {
    const accessibleIds = doctorId ? this.getAccessiblePatientIds(doctorId) : null;
    return this.data.patients
      .filter(p => !accessibleIds || accessibleIds.has(p.id))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  // --- Revenue & Financial Analytics ---
  public getPracticeRevenueAnalytics(doctorId?: string): PracticeRevenueAnalytics {
    const accessibleIds = doctorId ? this.getAccessiblePatientIds(doctorId) : null;
    const accessiblePatients = accessibleIds
      ? this.data.patients.filter(p => accessibleIds.has(p.id))
      : this.data.patients;
    const consultations = this.data.consultations.filter(
      c =>
        (!accessibleIds || accessibleIds.has(c.patientId)) &&
        ((c.fee || 0) > 0 || (c.procedures && c.procedures.length > 0))
    );
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
    for (const p of accessiblePatients) {
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

  public getAuditLogs(limit = 100, doctorId?: string): AuditLog[] {
    if (doctorId && !this.isDemoAccount(doctorId)) {
      return this.data.auditLogs.filter(l => l.actorId === doctorId).slice(0, limit);
    }
    return this.data.auditLogs
      .filter(l => !l.actorId || this.isDemoAccount(l.actorId))
      .slice(0, limit);
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
        activeModel: process.env.GEMINI_VISION_MODEL || 'gemini-3.8-flash'
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

  // --- Personalized Doctor Medical Library (Formulary) ---
  private ensureDefaultFormulary() {
    if (!this.data.formularyItems) {
      this.data.formularyItems = [];
    }
    let changed = false;
    const baseTime = new Date('2026-01-01T00:00:00.000Z').getTime();

    for (const med of UPLOADED_ANTIMICROBIAL_MEDICATIONS) {
      const seedId = `csv-antimicrobial-${med.no}`;
      const combinedText = `${med.name} ${med.dosage} ${med.frequency} ${med.instructions}`;
      const inferredRoute = /\b(iv|im|iv\/im|infusion|injection)\b/i.test(combinedText)
        ? 'IV / IM'
        : /cream|gel|ointment|lotion|shampoo|solution|topical/i.test(combinedText)
        ? 'Topical'
        : 'Oral';

      // Descending timestamp by `no` so item #1 sorts first among the 96 seeded CSV medications
      const itemTimestamp = new Date(baseTime + (1000 - med.no) * 1000).toISOString();

      const existing = this.data.formularyItems.find(
        item =>
          item.id === seedId ||
          item.name.toLowerCase() === med.name.toLowerCase()
      );

      if (!existing) {
        this.data.formularyItems.push({
          id: seedId,
          doctorId: 'shared',
          name: med.name,
          dosage: med.dosage,
          route: inferredRoute,
          frequency: med.frequency,
          duration: med.duration,
          instructions: med.instructions,
          category: 'Antimicrobial & Anti-infective CSV',
          source: 'csv_upload',
          createdAt: itemTimestamp,
          updatedAt: itemTimestamp
        });
        changed = true;
      } else if (existing.id === seedId) {
        if (
          existing.dosage !== med.dosage ||
          existing.frequency !== med.frequency ||
          existing.instructions !== med.instructions
        ) {
          existing.dosage = med.dosage;
          existing.route = inferredRoute;
          existing.frequency = med.frequency;
          existing.duration = med.duration;
          existing.instructions = med.instructions;
          existing.source = 'csv_upload';
          changed = true;
        }
      }
    }

    if (changed) {
      this.persist();
    }
  }

  public getDoctorFormulary(doctorId: string): DoctorFormularyItem[] {
    if (!this.data.formularyItems) {
      this.data.formularyItems = [];
    }
    return this.data.formularyItems
      .filter(item => item.doctorId === doctorId || item.doctorId === 'shared')
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  public upsertFormularyItem(
    doctorId: string,
    payload: {
      name: string;
      dosage: string;
      route?: string;
      frequency?: string;
      duration?: string;
      instructions?: string;
      category?: string;
      source?: DoctorFormularyItem['source'];
    },
    actor?: { id: string; name: string }
  ): DoctorFormularyItem {
    if (!this.data.formularyItems) {
      this.data.formularyItems = [];
    }
    const cleanName = payload.name.trim();
    const cleanDosage = (payload.dosage || 'As directed').trim();
    const now = new Date().toISOString();

    const existing = this.data.formularyItems.find(
      item =>
        (item.doctorId === doctorId || item.doctorId === 'shared') &&
        item.name.toLowerCase() === cleanName.toLowerCase()
    );

    if (existing) {
      existing.name = cleanName;
      existing.dosage = cleanDosage;
      if (payload.route !== undefined) existing.route = payload.route;
      if (payload.frequency !== undefined) existing.frequency = payload.frequency || existing.frequency;
      if (payload.duration !== undefined) existing.duration = payload.duration || existing.duration;
      if (payload.instructions !== undefined) existing.instructions = payload.instructions;
      if (payload.category !== undefined) existing.category = payload.category;
      if (payload.source !== undefined) existing.source = payload.source;
      existing.updatedAt = now;
      this.persist();
      return existing;
    }

    const newItem: DoctorFormularyItem = {
      id: `med-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`,
      doctorId,
      name: cleanName,
      dosage: cleanDosage,
      route: payload.route || 'Oral',
      frequency: payload.frequency || '1-0-1',
      duration: payload.duration || '5 days',
      instructions: payload.instructions || 'After meals',
      category: payload.category || 'Personal Library',
      source: payload.source || 'manual',
      createdAt: now,
      updatedAt: now
    };

    this.data.formularyItems.unshift(newItem);
    if (actor) {
      this.logAudit({
        actorId: actor.id,
        actorName: actor.name,
        action: 'formulary_item_added',
        resourceType: 'formulary',
        resourceId: newItem.id,
        metadata: { name: newItem.name, dosage: newItem.dosage, source: newItem.source }
      });
    } else {
      this.persist();
    }
    return newItem;
  }

  public bulkImportFormularyItems(
    doctorId: string,
    items: Array<{
      name: string;
      dosage?: string;
      route?: string;
      frequency?: string;
      duration?: string;
      instructions?: string;
      category?: string;
      source?: DoctorFormularyItem['source'];
    }>,
    actor?: { id: string; name: string }
  ): { importedCount: number; updatedCount: number; items: DoctorFormularyItem[] } {
    if (!this.data.formularyItems) {
      this.data.formularyItems = [];
    }
    let importedCount = 0;
    let updatedCount = 0;
    const now = new Date().toISOString();

    for (const raw of items) {
      const cleanName = (raw.name || '').trim();
      if (!cleanName || cleanName.length < 2) continue;
      const cleanDosage = (raw.dosage || 'Standard clinical dose').trim();

      const existing = this.data.formularyItems.find(
        item =>
          (item.doctorId === doctorId || item.doctorId === 'shared') &&
          item.name.toLowerCase() === cleanName.toLowerCase()
      );

      if (existing) {
        existing.dosage = cleanDosage || existing.dosage;
        if (raw.route) existing.route = raw.route;
        if (raw.frequency) existing.frequency = raw.frequency;
        if (raw.duration) existing.duration = raw.duration;
        if (raw.instructions) existing.instructions = raw.instructions;
        if (raw.category) existing.category = raw.category;
        if (raw.source) existing.source = raw.source;
        existing.updatedAt = now;
        updatedCount++;
      } else {
        const combinedText = `${cleanName} ${cleanDosage} ${raw.frequency || ''} ${raw.instructions || ''}`;
        const inferredRoute =
          raw.route ||
          (/cream|gel|ointment|lotion|shampoo|solution|spf|sunscreen|topical/i.test(combinedText)
            ? 'Topical'
            : /\b(iv|im|iv\/im|infusion|injection)\b/i.test(combinedText)
            ? 'IV / IM'
            : /\b(ophthalmic|drops|eye|ear|nasal)\b/i.test(combinedText)
            ? 'Nasal / Drops'
            : 'Oral');

        this.data.formularyItems.unshift({
          id: `med-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}-${importedCount}`,
          doctorId,
          name: cleanName,
          dosage: cleanDosage,
          route: inferredRoute,
          frequency: raw.frequency || '1-0-1',
          duration: raw.duration || '5 days',
          instructions: raw.instructions || 'Take as directed by physician',
          category: raw.category || 'Uploaded Library',
          source: raw.source || 'pdf_upload',
          createdAt: now,
          updatedAt: now
        });
        importedCount++;
      }
    }

    if (actor) {
      this.logAudit({
        actorId: actor.id,
        actorName: actor.name,
        action: 'formulary_bulk_import',
        resourceType: 'formulary',
        resourceId: doctorId,
        metadata: { importedCount, updatedCount }
      });
    } else {
      this.persist();
    }

    return {
      importedCount,
      updatedCount,
      items: this.getDoctorFormulary(doctorId)
    };
  }

  public deleteFormularyItem(
    doctorId: string,
    id: string,
    actor?: { id: string; name: string }
  ): boolean {
    if (!this.data.formularyItems) return false;
    const idx = this.data.formularyItems.findIndex(
      item => item.id === id && (item.doctorId === doctorId || item.doctorId === 'shared')
    );
    if (idx === -1) return false;
    const [removed] = this.data.formularyItems.splice(idx, 1);
    if (actor) {
      this.logAudit({
        actorId: actor.id,
        actorName: actor.name,
        action: 'formulary_item_deleted',
        resourceType: 'formulary',
        resourceId: id,
        metadata: { name: removed.name }
      });
    } else {
      this.persist();
    }
    return true;
  }

  // --- Persistent WhatsApp Inbox & Dispatched Messages ---
  public getStoredInboxThreads<T extends { id: string; doctorId?: string; patientId?: string }>(
    defaultThreads: T[],
    doctorId?: string
  ): T[] {
    if (!Array.isArray(this.data.inboxThreads) || this.data.inboxThreads.length === 0) {
      this.data.inboxThreads = JSON.parse(JSON.stringify(defaultThreads));
      this.persist();
    }
    const allThreads = this.data.inboxThreads as T[];
    if (!doctorId) return allThreads;

    const effectiveDoctorId = this.resolveEffectiveClinicDoctorId(doctorId) || doctorId;
    const isDemo = this.isDemoAccount(effectiveDoctorId);
    const accessiblePatientIds = this.getAccessiblePatientIds(effectiveDoctorId);

    return allThreads.filter(t => {
      if (t.doctorId) {
        return t.doctorId === effectiveDoctorId || t.doctorId === doctorId;
      }
      if (t.patientId) {
        return accessiblePatientIds.has(t.patientId);
      }
      // Seeded demo threads are visible to demo accounts
      return isDemo;
    });
  }

  public getAllRawInboxThreads<T extends { id: string }>(defaultThreads: T[]): T[] {
    if (!Array.isArray(this.data.inboxThreads) || this.data.inboxThreads.length === 0) {
      this.data.inboxThreads = JSON.parse(JSON.stringify(defaultThreads));
      this.persist();
    }
    return this.data.inboxThreads as T[];
  }

  public saveStoredInboxThreads(threads: any[]) {
    this.data.inboxThreads = threads;
    this.persist();
  }

  public getStoredWhatsAppMessages<T extends { doctorId?: string; patientId?: string }>(
    doctorId?: string,
    patientId?: string
  ): T[] {
    if (!Array.isArray(this.data.dispatchedWhatsAppMessages)) {
      this.data.dispatchedWhatsAppMessages = [];
    }
    const effectiveDoctorId = this.resolveEffectiveClinicDoctorId(doctorId) || doctorId;
    const accessiblePatientIds = effectiveDoctorId ? this.getAccessiblePatientIds(effectiveDoctorId) : null;
    let list = (this.data.dispatchedWhatsAppMessages as T[]).filter(m => {
      if (!effectiveDoctorId) return true;
      if (m.doctorId && (m.doctorId === effectiveDoctorId || m.doctorId === doctorId)) return true;
      if (m.patientId && accessiblePatientIds?.has(m.patientId)) return true;
      return false;
    });
    if (patientId) {
      list = list.filter(m => m.patientId === patientId);
    }
    return list.slice(0, 100);
  }

  public addStoredWhatsAppMessage(msg: any) {
    if (!Array.isArray(this.data.dispatchedWhatsAppMessages)) {
      this.data.dispatchedWhatsAppMessages = [];
    }
    this.data.dispatchedWhatsAppMessages.unshift(msg);
    if (this.data.dispatchedWhatsAppMessages.length > 500) {
      this.data.dispatchedWhatsAppMessages.pop();
    }
    this.persist();
  }
}

export const db = new DatabaseService();


