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
  accountType?: 'individual' | 'organisational';
  organizationName?: string;
  organizationDepartment?: string;
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

export interface DifferentialDiagnosis {
  condition: string;
  confidence: 'High' | 'Moderate' | 'Low';
  icdCode?: string;
  rationale: string;
}

export interface VisualMorphologyMetrics {
  erythemaIndex: number; // 0 - 100 (cutaneous redness / vascular inflammation)
  pigmentationIndex: number; // 0 - 100 (melanin absorption depth)
  asymmetryScore: number; // 0 - 100 (2-axis contour deviation)
  borderIrregularity: number; // 0 - 100 (gradient edge roughness / scalloping)
  colorVariationScore: number; // 0 - 100 (color diversity dispersion)
  morphologyCategory:
    | 'pigmented_melanocytic'
    | 'annular_scaling'
    | 'inflammatory_plaque'
    | 'papulopustular_follicular'
    | 'vesicular_bullous'
    | 'ulcerative_eroded'
    | 'urticarial_wheal'
    | 'keratotic_verrucous'
    | 'eczematous_dermatitis'
    | 'vascular_purpuric'
    | 'hypopigmented_macular';
  dominantColors: { hex: string; name: string; percentage: number }[];
  estimatedDiameterMm?: number;
  textureEntropy?: number;
  perceivedSharpness?: number;
}

export interface AIImageAnalysisResult {
  id: string;
  primaryImpression: string;
  differentials: DifferentialDiagnosis[];
  visualFindings: string[];
  timelineCorrelation: string;
  redFlags: string[];
  recommendedInvestigations: string[];
  suggestedManagementPlan: string;
  disclaimer: string;
  analyzedAt: string;
  isAiPowered: boolean;
  patientId?: string;
  imageUrl?: string;
  visualMetrics?: VisualMorphologyMetrics;
}

export interface ProgressionAnalysisResult {
  id: string;
  overallProgression: 'Marked Improvement' | 'Moderate Improvement' | 'Stable / Unchanged' | 'Mild Progression / Worsening' | 'Significant Flare / Deterioration';
  progressionScore: number;
  visualComparisonObservations: string[];
  treatmentResponseSummary: string;
  recommendedAdjustments: string[];
  disclaimer: string;
  isAiPowered: boolean;
  analyzedAt: string;
}

export interface ABCDEScoreResult {
  id: string;
  asymmetryScore: number; // 0 (Symmetric), 1 (1-axis), 2 (2-axis)
  asymmetryNotes: string;
  borderScore: number; // 0 (Regular), 1 (Uneven/notched), 2 (Ragged/abrupt)
  borderNotes: string;
  colorScore: number; // 0 (Uniform), 1 (2-3 colors), 2 (4+ colors / variegated)
  colorNotes: string;
  diameterMm: number; // e.g. 5.5
  diameterScore: number; // 0 (<6mm), 1 (>=6mm)
  diameterNotes: string;
  evolutionScore: number; // 0 (Stable), 2 (Changing / itching / bleeding)
  evolutionNotes: string;
  totalScore: number; // 0 - 9
  riskLevel: 'Low Risk / Benign Characteristics' | 'Moderate Risk / Dysplastic / Follow-up Needed' | 'High Suspicion / Urgent Dermoscopy or Biopsy';
  recommendations: string[];
  disclaimer: string;
  isAiPowered: boolean;
  analyzedAt: string;
}


export interface ClinicStats {
  totalPatients: number;
  visitsToday: number;
  visitsLast7Days: number;
  followUpsDue: number;
  activePrescriptions: number;
}

export interface VisitComparisonResult {
  id: string;
  intervalDays: number;
  overallStatus: 'Marked Improvement' | 'Moderate Improvement' | 'Stable / Unchanged' | 'Mild Progression / Worsening' | 'Significant Flare / Deterioration';
  summaryText: string;
  resolvedSymptoms: string[];
  persistentSymptoms: string[];
  newSymptoms: string[];
  diagnosticEvolution: {
    resolved: string[];
    persistent: string[];
    newDiagnoses: string[];
  };
  medicationChanges: {
    added: string[];
    continued: string[];
    discontinued: string[];
  };
  investigationsComparison: {
    visitATests: string[];
    visitBTests: string[];
    notesDiff: string;
  };
  recommendations: string[];
  isAiPowered: boolean;
  analyzedAt: string;
}

export interface ProcedureRevenueItem {
  id: string;
  name: string;
  cost: number;
  date: string;
  consultationId: string;
}

export interface PatientVisitRevenueItem {
  consultationId: string;
  date: string;
  doctorName: string;
  fee: number;
  diagnoses: string[];
  procedures: ProcedureItem[];
  totalAmount: number;
}

export interface PatientRevenueBreakdown {
  patientId: string;
  patientName: string;
  patientCode: string;
  gender: string;
  age: number;
  totalRevenue: number;
  consultationRevenue: number;
  procedureRevenue: number;
  visitCount: number;
  procedureCount: number;
  lastVisitDate: string;
  visits: PatientVisitRevenueItem[];
  proceduresList: ProcedureRevenueItem[];
}

export interface DailyRevenuePoint {
  date: string;
  dayLabel: string;
  consultationRevenue: number;
  procedureRevenue: number;
  totalRevenue: number;
  visitCount: number;
}

export interface MonthlyRevenuePoint {
  month: string;
  monthLabel: string;
  consultationRevenue: number;
  procedureRevenue: number;
  totalRevenue: number;
  uniquePatients: number;
  visitCount: number;
}

export interface PracticeRevenueAnalytics {
  dailyTotalRevenue: number;
  yesterdayRevenue: number;
  dailyChangePercent: number;
  monthlyRecurringRevenue: number;
  lastMonthRevenue: number;
  mrrGrowthPercent: number;
  currentMonthRevenue: number;
  allTimeRevenue: number;
  totalConsultationsRevenue: number;
  totalProceduresRevenue: number;
  totalProceduresCount: number;
  activeBillingPatientsCount: number;
  avgRevenuePerPatient: number;
  dailyTrend: DailyRevenuePoint[];
  monthlyTrend: MonthlyRevenuePoint[];
  patientBreakdown: PatientRevenueBreakdown[];
}

export type TestReportStatus = 'pending' | 'completed';
export type TestResultFlag = 'normal' | 'abnormal' | 'positive' | 'negative' | 'critical' | 'pending';
export type TestReportCategory =
  | 'Laboratory / Blood'
  | 'Microbiology / Fungal'
  | 'Histopathology / Biopsy'
  | 'Allergy / Patch Test'
  | 'Dermoscopy / Wood\'s Lamp'
  | 'Imaging / Other';

export interface HistoricalReportSnapshot {
  id: string;
  orderedDate: string;
  reportDate?: string;
  resultFlag: TestResultFlag;
  resultValue: string;
  unit?: string;
  referenceRange?: string;
  specimenType?: string;
  labName?: string;
  orderedByDoctor?: string;
  clinicalNotes?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  archivedAt: string;
}

export interface PatientTestReport {
  id: string;
  patientId: string;
  consultationId?: string;
  testName: string;
  category: TestReportCategory;
  orderedDate: string;
  reportDate?: string;
  status: TestReportStatus;
  resultFlag: TestResultFlag;
  resultValue: string;
  unit?: string;
  referenceRange?: string;
  specimenType?: string;
  labName?: string;
  orderedByDoctor?: string;
  clinicalNotes?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  isPreviousReport?: boolean;
  previousResults?: HistoricalReportSnapshot[];
  createdAt: string;
  updatedAt: string;
}

