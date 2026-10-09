export interface Doctor {
  id: string;
  name: string;
  email: string;
  speciality: string;
  registrationNumber: string;
  clinicName: string;
  phone?: string;
  defaultConsultationFee: number;
  avatarUrl?: string;
  createdAt: string;
}

export type Gender = 'Male' | 'Female' | 'Other' | 'Prefer not to say';

export interface Patient {
  id: string;
  patientCode: string; // e.g. "P-24618"
  fullName: string;
  dateOfBirth?: string;
  age: number;
  gender: Gender;
  mobile: string;
  bloodGroup?: string;
  address?: string;
  emergencyContact?: string;
  allergies?: string;
  currentMedications?: string;
  medicalHistory?: string;
  createdById?: string;
  createdAt: string;
  updatedAt: string;
  lastVisitAt?: string;
  primaryDiagnosis?: string;
}

export interface BodyMarker {
  id: string;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  view: 'front' | 'back';
  bodyPart: string;
  type: 'lesion' | 'rash' | 'acne' | 'pigmentation' | 'hair' | 'custom';
  color: string;
  notes?: string;
  consultationId?: string;
  patientId: string;
  createdAt: string;
}

export interface ClinicalImage {
  id: string;
  patientId: string;
  consultationId?: string;
  url: string;
  thumbnailUrl?: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  caption?: string;
  tags?: string[];
  bodyMarkerId?: string;
  createdAt: string;
}

export interface ProcedureItem {
  id: string;
  name: string;
  cost: number;
  notes?: string;
}

export interface ClinicalNotes {
  examination: string;
  investigationsAdvised: string;
  plan: string;
}

export interface FollowUp {
  date?: string;
  daysNotice?: number;
  instructions?: string;
  notes?: string;
  reminderSent?: boolean;
}

export type AppointmentStatus = 'scheduled' | 'checked_in' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
export type AppointmentType = 'follow_up' | 'new_consultation' | 'routine_checkup' | 'procedure';

export interface Appointment {
  id: string;
  patientId: string;
  patientCode: string;
  patientName: string;
  patientAge: number;
  patientGender: Gender;
  patientMobile: string;
  doctorId: string;
  doctorName: string;
  date: string; // YYYY-MM-DD
  time?: string; // e.g. "10:00 AM"
  type: AppointmentType;
  status: AppointmentStatus;
  consultationId?: string; // Linked consultation if created from follow-up
  instructions?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PrescriptionItem {
  id: string;
  consultationId?: string;
  patientId: string;
  medicineName: string;
  dosage: string; // e.g. "500 mg", "1 tab"
  frequency: string; // e.g. "1-0-1", "Once daily", "SOS"
  duration: string; // e.g. "5 days", "14 days"
  instructions: string; // e.g. "After meals", "Apply thin layer on lesions"
  date: string;
  createdAt: string;
}

export interface Consultation {
  id: string;
  patientId: string;
  patientCode: string;
  patientName: string;
  patientAge: number;
  patientGender: Gender;
  doctorId: string;
  doctorName: string;
  consultationDate: string;
  status: 'draft' | 'signed';
  fee: number;
  symptoms: string[];
  diagnoses: string[];
  tests: string[];
  procedures: ProcedureItem[];
  clinicalNotes: ClinicalNotes;
  bodyMarkers: BodyMarker[];
  images: ClinicalImage[];
  followUp: FollowUp;
  prescriptions: PrescriptionItem[];
  aiSummary: string;
  signedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  actorId: string;
  actorName: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
}

export interface ClinicStats {
  totalPatients: number;
  visitsToday: number;
  visitsLast7Days: number;
  followUpsDue: number;
  activePrescriptions: number;
}
