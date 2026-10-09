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
  Appointment
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
    this.syncAppointmentsFromFollowUps();
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
    if (this.data.doctors.length === 0) {
      const demoDoctorId = 'doc-demo-001';
      const demoDoctor: Doctor = {
        id: demoDoctorId,
        name: 'Dr. Demo',
        email: 'demo@clinicalos.med',
        speciality: 'Dermatologist & Cosmetologist',
        registrationNumber: 'MED-REG-847291',
        clinicName: 'Cliniq Dermatology Center',
        phone: '+91 98765 43210',
        defaultConsultationFee: 500,
        avatarUrl: '',
        createdAt: new Date().toISOString()
      };
      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync('Demo@1234', salt);

      this.data.doctors.push(demoDoctor);
      this.data.doctorPasswords[demoDoctorId] = hash;
      this.logAudit({
        actorId: 'system',
        actorName: 'System',
        action: 'system_init',
        resourceType: 'doctor',
        resourceId: demoDoctorId,
        metadata: { info: 'Default doctor initialized' }
      });
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

  // --- Clinical Images methods ---
  public getPatientImages(patientId: string): ClinicalImage[] {
    return this.data.clinicalImages.filter(i => i.patientId === patientId);
  }

  public addClinicalImage(img: ClinicalImage): ClinicalImage {
    this.data.clinicalImages.push(img);
    this.persist();
    return img;
  }

  public deleteClinicalImage(id: string): boolean {
    const idx = this.data.clinicalImages.findIndex(i => i.id === id);
    if (idx >= 0) {
      this.data.clinicalImages.splice(idx, 1);
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
}

export const db = new DatabaseService();
