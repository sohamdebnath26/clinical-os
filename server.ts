import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { db } from './server/db.js';
import { summarizeConsultationWithAI, askAIAssistant, analyzeClinicalImage, compareClinicalImages, assessABCDEAnalysis, comparePatientVisits, parseClinicalNoteWithAI, askImageReportAssistant } from './server/ai.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Increase body parser limits for clinical images
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Ensure upload directory exists
const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
app.use('/uploads', express.static(UPLOADS_DIR));

// Simple in-memory session store (token -> doctorId)
const activeSessions = new Map<string, { doctorId: string; expiresAt: number }>();

function generateToken(): string {
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 10)}`;
}

// Authentication middleware
interface AuthenticatedRequest extends Request {
  doctor?: ReturnType<typeof db.findDoctorById>;
}

function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
  }

  const token = authHeader.split(' ')[1];
  const session = activeSessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    if (session) activeSessions.delete(token);
    return res.status(401).json({ error: 'Session expired or invalid' });
  }

  const doctor = db.findDoctorById(session.doctorId);
  if (!doctor) {
    activeSessions.delete(token);
    return res.status(401).json({ error: 'Doctor account not found' });
  }

  req.doctor = doctor;
  next();
}

// ==========================================
// AUTH ROUTES
// ==========================================
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const doctor = db.findDoctorByEmail(email);
  if (!doctor) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const isValid = db.verifyPassword(doctor.id, password);
  if (!isValid) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = generateToken();
  // 7 days expiration
  activeSessions.set(token, {
    doctorId: doctor.id,
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000
  });

  db.logAudit({
    actorId: doctor.id,
    actorName: doctor.name,
    action: 'doctor_login',
    resourceType: 'auth',
    resourceId: doctor.id
  });

  res.json({ token, doctor });
});

// Single Sign-On (SSO) for Work/University/Hospital Organisations
app.post('/api/auth/sso', (req, res) => {
  const { organization, email, name, department } = req.body;
  const orgName = (organization || 'Metro Health University Medical Center').trim();
  const orgEmail = (email || 'hospital@metrohealth.org').toLowerCase().trim();
  const orgDoctorName = (name || 'Dr. Sarah Chen, MD').trim();
  const orgDept = (department || 'Chief of Dermatology & Cutaneous Medicine').trim();

  let doctor = db.findDoctorByEmail(orgEmail);
  if (!doctor) {
    doctor = db.createDoctor({
      name: orgDoctorName,
      email: orgEmail,
      password: 'Demo@1234_sso_managed',
      speciality: orgDept,
      registrationNumber: `SSO-${Math.floor(100000 + Math.random() * 900000)}`,
      clinicName: orgName,
      phone: '+1 (555) 392-1084'
    });
    db.updateDoctor(doctor.id, {
      accountType: 'organisational',
      organizationName: orgName,
      organizationDepartment: orgDept
    });
    doctor = db.findDoctorById(doctor.id)!;
  } else if (!doctor.accountType) {
    db.updateDoctor(doctor.id, {
      accountType: 'organisational',
      organizationName: orgName,
      organizationDepartment: orgDept
    });
    doctor = db.findDoctorById(doctor.id)!;
  }

  const token = generateToken();
  activeSessions.set(token, {
    doctorId: doctor.id,
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000
  });

  db.logAudit({
    actorId: doctor.id,
    actorName: doctor.name,
    action: 'doctor_sso_login',
    resourceType: 'auth',
    resourceId: doctor.id,
    metadata: { organization: orgName, provider: 'sso' }
  });

  res.json({ token, doctor });
});

// Individual Google Authentication
app.post('/api/auth/google', (req, res) => {
  const googleEmail = (req.body.email || 'dr.alex.mercer@gmail.com').toLowerCase().trim();
  const doctorName = (req.body.name || 'Dr. Alex Mercer').trim();

  let doctor = db.findDoctorByEmail(googleEmail);
  if (!doctor) {
    doctor = db.createDoctor({
      name: doctorName,
      email: googleEmail,
      password: 'Demo@1234_google_auth',
      speciality: 'Dermatologist & Laser Surgeon',
      registrationNumber: `G-MD-${Math.floor(100000 + Math.random() * 900000)}`,
      clinicName: 'Mercer Dermatology Practice',
      phone: '+1 (555) 014-9922'
    });
    db.updateDoctor(doctor.id, {
      accountType: 'individual'
    });
    doctor = db.findDoctorById(doctor.id)!;
  }

  const token = generateToken();
  activeSessions.set(token, {
    doctorId: doctor.id,
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000
  });

  db.logAudit({
    actorId: doctor.id,
    actorName: doctor.name,
    action: 'doctor_google_login',
    resourceType: 'auth',
    resourceId: doctor.id,
    metadata: { provider: 'google' }
  });

  res.json({ token, doctor });
});

app.post('/api/auth/register', (req, res) => {
  const { name, email, password, speciality, registrationNumber, clinicName, phone } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const existing = db.findDoctorByEmail(email);
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  try {
    const doctor = db.createDoctor({
      name,
      email,
      password,
      speciality,
      registrationNumber,
      clinicName,
      phone
    });

    const token = generateToken();
    activeSessions.set(token, {
      doctorId: doctor.id,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000
    });

    res.status(201).json({ token, doctor });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Registration failed';
    res.status(500).json({ error: message });
  }
});

app.get('/api/auth/me', authMiddleware, (req: AuthenticatedRequest, res) => {
  res.json({ doctor: req.doctor });
});

app.post('/api/auth/logout', authMiddleware, (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (token) activeSessions.delete(token);
  res.json({ message: 'Logged out successfully' });
});

// Update Doctor Settings
app.put('/api/doctor/profile', authMiddleware, (req: AuthenticatedRequest, res) => {
  if (!req.doctor) return res.status(401).json({ error: 'Unauthorized' });
  const updated = db.updateDoctor(req.doctor.id, req.body);
  res.json({ doctor: updated });
});

// ==========================================
// PATIENT ROUTES
// ==========================================
app.get('/api/patients', authMiddleware, (req, res) => {
  const query = req.query.q as string | undefined;
  const patients = db.getPatients(query);
  res.json({ patients });
});

app.get('/api/patients/check-mobile/:mobile', authMiddleware, (req, res) => {
  const mobile = req.params.mobile;
  const existing = db.findPatientByMobile(mobile);
  if (existing) {
    return res.json({ exists: true, patient: existing });
  }
  res.json({ exists: false });
});

app.get('/api/patients/:id', authMiddleware, (req, res) => {
  const patient = db.findPatientById(req.params.id);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });
  res.json({ patient });
});

app.post('/api/patients', authMiddleware, (req: AuthenticatedRequest, res) => {
  const { fullName, age, gender, mobile, dateOfBirth, bloodGroup, address, emergencyContact, allergies, currentMedications, medicalHistory } = req.body;

  if (!fullName || age === undefined || !gender || !mobile) {
    return res.status(400).json({ error: 'Full name, age, gender, and mobile number are required' });
  }

  // Prevent accidental duplicate mobile
  const existing = db.findPatientByMobile(mobile);
  if (existing && !req.query.force) {
    return res.status(409).json({
      error: 'An existing patient was found with this mobile number.',
      existingPatient: existing
    });
  }

  const doctor = req.doctor!;
  const newPatient = db.createPatient(
    {
      fullName: fullName.trim(),
      age: Number(age),
      gender,
      mobile: mobile.trim(),
      dateOfBirth: dateOfBirth || '',
      bloodGroup: bloodGroup || '',
      address: address || '',
      emergencyContact: emergencyContact || '',
      allergies: allergies || '',
      currentMedications: currentMedications || '',
      medicalHistory: medicalHistory || '',
      createdById: doctor.id
    },
    { id: doctor.id, name: doctor.name }
  );

  res.status(201).json({ patient: newPatient });
});

app.put('/api/patients/:id', authMiddleware, (req: AuthenticatedRequest, res) => {
  const doctor = req.doctor!;
  const updated = db.updatePatient(req.params.id, req.body, { id: doctor.id, name: doctor.name });
  if (!updated) return res.status(404).json({ error: 'Patient not found' });
  res.json({ patient: updated });
});

// Patient Historical Consultations
app.get('/api/patients/:id/consultations', authMiddleware, (req, res) => {
  const consultations = db.getConsultationsByPatient(req.params.id);
  res.json({ consultations });
});

// Clinical Timeline (Sanitized for Privacy: Never reveals address/mobile in timeline)
app.get('/api/patients/:id/timeline', authMiddleware, (req, res) => {
  const consultations = db.getConsultationsByPatient(req.params.id);
  const events = consultations
    .filter(c => c.status === 'signed')
    .map(c => ({
      id: c.id,
      date: c.consultationDate,
      symptoms: c.symptoms,
      diagnoses: c.diagnoses,
      tests: c.tests,
      procedures: c.procedures,
      clinicalNotes: c.clinicalNotes,
      bodyMarkersCount: c.bodyMarkers?.length || 0,
      imagesCount: c.images?.length || 0,
      images: c.images || [],
      prescriptions: c.prescriptions,
      followUp: c.followUp,
      fee: c.fee,
      aiSummary: c.aiSummary,
      doctorName: c.doctorName
    }));

  res.json({ events });
});

// Patient body markers
app.get('/api/patients/:id/markers', authMiddleware, (req, res) => {
  const markers = db.getPatientBodyMarkers(req.params.id);
  res.json({ markers });
});

app.post('/api/patients/:id/markers', authMiddleware, (req: AuthenticatedRequest, res) => {
  const { view, x, y, type, notes, anatomicalPart, bodyPart, color, consultationId } = req.body;
  if (!view || x === undefined || y === undefined) {
    return res.status(400).json({ error: 'view, x, and y coordinates are required' });
  }
  const marker = db.addBodyMarker({
    id: `bm-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
    patientId: req.params.id,
    consultationId,
    view: view || 'front',
    x: Number(x),
    y: Number(y),
    type: type || 'lesion',
    color: color || '#f43f5e',
    bodyPart: anatomicalPart || bodyPart || 'Skin',
    notes: notes || '',
    createdAt: new Date().toISOString()
  });

  const doctor = req.doctor;
  if (doctor) {
    db.logAudit({
      actorId: doctor.id,
      actorName: doctor.name,
      action: 'body_marker_pinned',
      resourceType: 'body_marker',
      resourceId: marker.id,
      metadata: { patientId: req.params.id, type: marker.type, part: marker.bodyPart }
    });
  }

  res.json({ marker });
});

// Patient clinical images
app.get('/api/patients/:id/images', authMiddleware, (req, res) => {
  const images = db.getPatientImages(req.params.id);
  res.json({ images });
});

// Patient prescriptions
app.get('/api/patients/:id/prescriptions', authMiddleware, (req, res) => {
  const prescriptions = db.getPrescriptions(req.params.id);
  res.json({ prescriptions });
});

// Patient test & diagnostic report results
app.get('/api/patients/:id/reports', authMiddleware, (req, res) => {
  const reports = db.getTestReportsByPatient(req.params.id);
  res.json({ reports });
});

app.post('/api/patients/:id/reports', authMiddleware, (req: AuthenticatedRequest, res) => {
  const {
    testName,
    category,
    orderedDate,
    reportDate,
    status,
    resultFlag,
    resultValue,
    unit,
    referenceRange,
    specimenType,
    labName,
    orderedByDoctor,
    clinicalNotes,
    attachmentUrl,
    attachmentName,
    consultationId,
    isPreviousReport,
    previousResults
  } = req.body;

  if (!testName || !testName.trim()) {
    return res.status(400).json({ error: 'Test / report name is required' });
  }

  const doctor = req.doctor!;
  const report = db.createTestReport(
    {
      patientId: req.params.id,
      consultationId,
      testName: testName.trim(),
      category: category || 'Laboratory / Blood',
      orderedDate: orderedDate || new Date().toISOString().split('T')[0],
      reportDate: reportDate || new Date().toISOString().split('T')[0],
      status: status || 'completed',
      resultFlag: resultFlag || 'normal',
      resultValue: resultValue || '',
      unit: unit || '',
      referenceRange: referenceRange || '',
      specimenType: specimenType || '',
      labName: labName || '',
      orderedByDoctor: orderedByDoctor || doctor.name,
      clinicalNotes: clinicalNotes || '',
      attachmentUrl: attachmentUrl || '',
      attachmentName: attachmentName || '',
      isPreviousReport: Boolean(isPreviousReport),
      previousResults: Array.isArray(previousResults) ? previousResults : []
    },
    { id: doctor.id, name: doctor.name }
  );

  res.status(201).json({ report });
});

app.put('/api/reports/:id', authMiddleware, (req: AuthenticatedRequest, res) => {
  const doctor = req.doctor!;
  const updated = db.updateTestReport(req.params.id, req.body, {
    id: doctor.id,
    name: doctor.name
  });
  if (!updated) return res.status(404).json({ error: 'Report not found' });
  res.json({ report: updated });
});

app.delete('/api/reports/:id', authMiddleware, (req: AuthenticatedRequest, res) => {
  const doctor = req.doctor!;
  const deleted = db.deleteTestReport(req.params.id, {
    id: doctor.id,
    name: doctor.name
  });
  if (!deleted) return res.status(404).json({ error: 'Report not found' });
  res.json({ success: true, message: 'Report deleted' });
});

// ==========================================
// CONSULTATION WORKSPACE ROUTES
// ==========================================
app.post('/api/consultations', authMiddleware, (req: AuthenticatedRequest, res) => {
  const { patientId, symptoms, fee } = req.body;
  if (!patientId) {
    return res.status(400).json({ error: 'patientId is required' });
  }

  const doctor = req.doctor!;
  try {
    const consultation = db.createConsultation({
      patientId,
      doctorId: doctor.id,
      doctorName: doctor.name,
      symptoms: symptoms || [],
      fee: fee !== undefined ? Number(fee) : doctor.defaultConsultationFee
    });
    res.status(201).json({ consultation });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error creating consultation';
    res.status(404).json({ error: message });
  }
});

app.get('/api/consultations/:id', authMiddleware, (req, res) => {
  const consultation = db.getConsultationById(req.params.id);
  if (!consultation) return res.status(404).json({ error: 'Consultation not found' });
  res.json({ consultation });
});

// Sign & Finish Consultation
app.put('/api/consultations/:id/sign', authMiddleware, (req: AuthenticatedRequest, res) => {
  const doctor = req.doctor!;
  const signed = db.saveAndSignConsultation(req.params.id, req.body, {
    id: doctor.id,
    name: doctor.name
  });

  if (!signed) return res.status(404).json({ error: 'Consultation not found' });
  res.json({ consultation: signed });
});

// ==========================================
// PRESCRIPTIONS ROUTES
// ==========================================
app.get('/api/prescriptions', authMiddleware, (req, res) => {
  const patientId = req.query.patientId as string | undefined;
  const prescriptions = db.getPrescriptions(patientId);
  res.json({ prescriptions });
});

app.post('/api/prescriptions', authMiddleware, (req: AuthenticatedRequest, res) => {
  const { patientId, medicineName, dosage, frequency, duration, instructions, consultationId } = req.body;
  if (!patientId || !medicineName) {
    return res.status(400).json({ error: 'Patient ID and Medicine Name are required' });
  }

  const doctor = req.doctor!;
  const rx = db.addPrescription(
    {
      patientId,
      consultationId,
      medicineName,
      dosage: dosage || '',
      frequency: frequency || '',
      duration: duration || '',
      instructions: instructions || '',
      date: new Date().toISOString()
    },
    { id: doctor.id, name: doctor.name }
  );

  res.status(201).json({ prescription: rx });
});

// ==========================================
// APPOINTMENTS ROUTES (Consistent with Consultation Follow-up Date)
// ==========================================
app.get('/api/appointments', authMiddleware, (req, res) => {
  const patientId = req.query.patientId as string | undefined;
  const date = req.query.date as string | undefined;
  const status = req.query.status as string | undefined;

  const appointments = db.getAppointments({ patientId, date, status });
  res.json({ appointments });
});

app.get('/api/appointments/:id', authMiddleware, (req, res) => {
  const appt = db.getAppointmentById(req.params.id);
  if (!appt) return res.status(404).json({ error: 'Appointment not found' });
  res.json({ appointment: appt });
});

app.post('/api/appointments', authMiddleware, (req: AuthenticatedRequest, res) => {
  const { patientId, date, time, type, instructions, notes, consultationId } = req.body;
  if (!patientId || !date) {
    return res.status(400).json({ error: 'patientId and date are required' });
  }

  const patient = db.findPatientById(patientId);
  if (!patient) {
    return res.status(404).json({ error: 'Patient not found' });
  }

  const doctor = req.doctor!;
  const appt = db.createAppointment(
    {
      patientId: patient.id,
      patientCode: patient.patientCode,
      patientName: patient.fullName,
      patientAge: patient.age,
      patientGender: patient.gender,
      patientMobile: patient.mobile || '',
      doctorId: doctor.id,
      doctorName: doctor.name,
      date,
      time: time || '10:00 AM',
      type: type || 'follow_up',
      status: 'scheduled',
      consultationId,
      instructions: instructions || '',
      notes: notes || ''
    },
    { id: doctor.id, name: doctor.name }
  );

  res.status(201).json({ appointment: appt });
});

app.put('/api/appointments/:id', authMiddleware, (req: AuthenticatedRequest, res) => {
  const doctor = req.doctor!;
  const updated = db.updateAppointment(req.params.id, req.body, { id: doctor.id, name: doctor.name });
  if (!updated) return res.status(404).json({ error: 'Appointment not found' });
  res.json({ appointment: updated });
});

app.delete('/api/appointments/:id', authMiddleware, (req: AuthenticatedRequest, res) => {
  const doctor = req.doctor!;
  const success = db.deleteAppointment(req.params.id, { id: doctor.id, name: doctor.name });
  if (!success) return res.status(404).json({ error: 'Appointment not found' });
  res.json({ success: true, message: 'Appointment deleted' });
});

// ==========================================
// CLINICAL IMAGES UPLOAD ROUTES
// ==========================================
app.post('/api/images/upload', authMiddleware, (req: AuthenticatedRequest, res) => {
  const { patientId, consultationId, dataUrl, filename, caption, tags, bodyMarkerId } = req.body;

  if (!patientId || !dataUrl) {
    return res.status(400).json({ error: 'patientId and dataUrl are required' });
  }

  try {
    // Handle base64 dataUrl (from canvas, webcam, or file reader)
    const matches = dataUrl.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ error: 'Invalid base64 data URL' });
    }

    const mimeType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');

    // 4MB limit check
    if (buffer.length > 4 * 1024 * 1024) {
      return res.status(413).json({ error: 'Image exceeds maximum allowed size of 4MB' });
    }

    const ext = mimeType.includes('png') ? 'png' : 'jpg';
    const imageId = `img-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const savedFilename = `${imageId}.${ext}`;
    const filePath = path.join(UPLOADS_DIR, savedFilename);

    fs.writeFileSync(filePath, buffer);

    const publicUrl = `/uploads/${savedFilename}`;
    const clinicalImage = db.addClinicalImage({
      id: imageId,
      patientId,
      consultationId,
      url: publicUrl,
      filename: filename || savedFilename,
      mimeType,
      sizeBytes: buffer.length,
      caption: caption || '',
      tags: tags || [],
      bodyMarkerId,
      createdAt: new Date().toISOString()
    });

    const doctor = req.doctor!;
    db.logAudit({
      actorId: doctor.id,
      actorName: doctor.name,
      action: 'image_uploaded',
      resourceType: 'clinical_image',
      resourceId: imageId,
      metadata: { patientId, sizeBytes: buffer.length }
    });

    res.status(201).json({ image: clinicalImage });
  } catch (err: unknown) {
    console.error('Image upload failed:', err);
    const message = err instanceof Error ? err.message : 'Failed to save image';
    res.status(500).json({ error: message });
  }
});

app.delete('/api/images/:id', authMiddleware, (req, res) => {
  const success = db.deleteClinicalImage(req.params.id);
  if (!success) return res.status(404).json({ error: 'Image not found' });
  res.json({ message: 'Image deleted' });
});

// ==========================================
// MOBILE QR CODE CLINICAL IMAGE UPLOAD SESSIONS
// ==========================================
interface MobileImageUploadSession {
  token: string;
  patientId: string;
  patientName: string;
  patientCode: string;
  consultationId?: string;
  doctorId: string;
  doctorName: string;
  clinicName: string;
  createdAt: number;
  expiresAt: number;
  uploadedImages: import('./src/types/index.js').ClinicalImage[];
}

const mobileUploadSessions = new Map<string, MobileImageUploadSession>();

function cleanupExpiredMobileSessions() {
  const now = Date.now();
  for (const [token, session] of mobileUploadSessions.entries()) {
    if (session.expiresAt < now) {
      mobileUploadSessions.delete(token);
    }
  }
}

// Create a QR mobile upload session (authenticated doctor)
app.post('/api/images/mobile-session', authMiddleware, (req: AuthenticatedRequest, res) => {
  cleanupExpiredMobileSessions();
  const { patientId, consultationId } = req.body;
  if (!patientId) {
    return res.status(400).json({ error: 'patientId is required' });
  }

  const patient = db.findPatientById(patientId);
  if (!patient) {
    return res.status(404).json({ error: 'Patient not found' });
  }

  const doctor = req.doctor!;
  const token = `mob_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 10)}`;
  const now = Date.now();
  const expiresAt = now + 30 * 60 * 1000; // 30 minutes validity

  // Include any existing images for this consultation so desktop polling stays in sync
  const existingImages = db
    .getPatientImages(patient.id)
    .filter(img => !consultationId || img.consultationId === consultationId);

  const session: MobileImageUploadSession = {
    token,
    patientId: patient.id,
    patientName: patient.fullName,
    patientCode: patient.patientCode,
    consultationId,
    doctorId: doctor.id,
    doctorName: doctor.name,
    clinicName: doctor.clinicName || 'Dermatology & Clinical Practice',
    createdAt: now,
    expiresAt,
    uploadedImages: [...existingImages]
  };

  mobileUploadSessions.set(token, session);

  res.status(201).json({
    session: {
      token: session.token,
      patientId: session.patientId,
      patientName: session.patientName,
      patientCode: session.patientCode,
      consultationId: session.consultationId,
      doctorName: session.doctorName,
      clinicName: session.clinicName,
      expiresAt: new Date(session.expiresAt).toISOString(),
      uploadedImages: session.uploadedImages
    }
  });
});

// Public endpoint: Get mobile upload session info (used by mobile phone after scanning QR & by desktop polling)
app.get('/api/images/mobile-session/:token', (req, res) => {
  cleanupExpiredMobileSessions();
  const session = mobileUploadSessions.get(req.params.token);
  if (!session) {
    return res.status(404).json({ error: 'QR upload link has expired or is invalid. Please generate a new QR code on your computer.' });
  }

  // Refresh images from DB in case any were added or removed
  const latestImages = db
    .getPatientImages(session.patientId)
    .filter(img => !session.consultationId || img.consultationId === session.consultationId);
  session.uploadedImages = latestImages;

  res.json({
    session: {
      token: session.token,
      patientId: session.patientId,
      patientName: session.patientName,
      patientCode: session.patientCode,
      consultationId: session.consultationId,
      doctorName: session.doctorName,
      clinicName: session.clinicName,
      expiresAt: new Date(session.expiresAt).toISOString(),
      uploadedImages: session.uploadedImages
    }
  });
});

// Public token-authorized endpoint: Upload image from mobile phone via scanned QR code
app.post('/api/images/mobile-session/:token/upload', (req, res) => {
  cleanupExpiredMobileSessions();
  const session = mobileUploadSessions.get(req.params.token);
  if (!session) {
    return res.status(404).json({ error: 'QR upload session expired or invalid. Please scan a fresh QR code.' });
  }

  const { dataUrl, filename, caption, tags } = req.body;
  if (!dataUrl) {
    return res.status(400).json({ error: 'Image dataUrl is required' });
  }

  try {
    const matches = dataUrl.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ error: 'Invalid base64 image data' });
    }

    const mimeType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');

    if (buffer.length > 8 * 1024 * 1024) {
      return res.status(413).json({ error: 'Image exceeds maximum allowed size of 8MB' });
    }

    const ext = mimeType.includes('png') ? 'png' : 'jpg';
    const imageId = `img-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const savedFilename = `${imageId}.${ext}`;
    const filePath = path.join(UPLOADS_DIR, savedFilename);

    fs.writeFileSync(filePath, buffer);

    const publicUrl = `/uploads/${savedFilename}`;
    const clinicalImage = db.addClinicalImage({
      id: imageId,
      patientId: session.patientId,
      consultationId: session.consultationId,
      url: publicUrl,
      filename: filename || `mobile_${savedFilename}`,
      mimeType,
      sizeBytes: buffer.length,
      caption: caption || 'Uploaded via Mobile QR Scan',
      tags: tags || ['mobile-qr'],
      createdAt: new Date().toISOString()
    });

    session.uploadedImages.push(clinicalImage);

    db.logAudit({
      actorId: session.doctorId,
      actorName: session.doctorName,
      action: 'image_uploaded_via_mobile_qr',
      resourceType: 'clinical_image',
      resourceId: imageId,
      metadata: {
        patientId: session.patientId,
        consultationId: session.consultationId,
        sizeBytes: buffer.length
      }
    });

    res.status(201).json({
      image: clinicalImage,
      uploadedCount: session.uploadedImages.length
    });
  } catch (err: unknown) {
    console.error('Mobile QR image upload failed:', err);
    const message = err instanceof Error ? err.message : 'Failed to upload image from mobile';
    res.status(500).json({ error: message });
  }
});

// ==========================================
// AI ASSISTANT ROUTES
// ==========================================
app.post('/api/ai/summarize-consultation', authMiddleware, async (req, res) => {
  try {
    const summary = await summarizeConsultationWithAI(req.body);
    res.json({ summary });
  } catch (err: unknown) {
    console.error('AI summary error:', err);
    res.status(500).json({ error: 'Failed to generate summary' });
  }
});

app.post('/api/ai/parse-clinical-note', authMiddleware, async (req, res) => {
  try {
    const parsed = await parseClinicalNoteWithAI(req.body || {});
    res.json({ parsed });
  } catch (err: unknown) {
    console.error('AI parse clinical note error:', err);
    res.status(500).json({ error: 'Failed to parse clinical note' });
  }
});

app.post('/api/ai/chat', authMiddleware, async (req, res) => {
  const { question, patientId, contextType } = req.body;
  if (!question) {
    return res.status(400).json({ error: 'Question is required' });
  }

  const allPatients = db.getPatients();
  let patient = undefined;
  let history = undefined;

  if (patientId) {
    patient = db.findPatientById(patientId);
  } else {
    // Intelligent auto-detection of patient in query text
    const qLower = question.toLowerCase().trim();
    // 1. Direct match on full name, code, or mobile
    let matched = allPatients.find(p =>
      qLower.includes(p.fullName.toLowerCase()) ||
      qLower.includes(p.patientCode.toLowerCase()) ||
      (p.mobile && qLower.includes(p.mobile))
    );

    // 2. Match on individual name tokens (e.g. "Harman" in "Harman Singh")
    if (!matched) {
      matched = allPatients.find(p => {
        const parts = p.fullName.toLowerCase().split(/\s+/).filter(part => part.length >= 3);
        return parts.some(part => qLower.includes(part));
      });
    }

    // 3. If doctor asks for patient info/records and there is 1 patient in clinic, auto-bind
    if (!matched && allPatients.length === 1 && (
      qLower.includes('patient') ||
      qLower.includes('diagnosis') ||
      qLower.includes('info') ||
      qLower.includes('history') ||
      qLower.includes('medication') ||
      qLower.includes('record') ||
      qLower.includes('summary') ||
      qLower.includes('soap')
    )) {
      matched = allPatients[0];
    }

    if (matched) {
      patient = matched;
    }
  }

  if (patient) {
    history = db.getConsultationsByPatient(patient.id);
  }

  try {
    const result = await askAIAssistant({
      question,
      patient,
      history,
      allPatients,
      contextType
    });
    res.json({ ...result, patient });
  } catch (err: unknown) {
    console.error('AI chat error:', err);
    res.status(500).json({ error: 'Error generating AI response' });
  }
});

app.post('/api/ai/report-chat', authMiddleware, async (req, res) => {
  const { question, report, anatomicalSite, clinicalNotes, abcdeScore, patientId, conversationHistory } = req.body || {};
  if (!question || !report) {
    return res.status(400).json({ error: 'Both question and generated report context are required' });
  }

  let patient = undefined;
  let history = undefined;
  if (patientId) {
    patient = db.findPatientById(patientId);
    if (patient) {
      history = db.getConsultationsByPatient(patient.id);
    }
  }

  try {
    const result = await askImageReportAssistant({
      question,
      report,
      anatomicalSite,
      clinicalNotes,
      abcdeScore,
      patient,
      history,
      conversationHistory
    });
    res.json(result);
  } catch (err: unknown) {
    console.error('AI report chat error:', err);
    res.status(500).json({ error: 'Failed to generate AI report chat response' });
  }
});

// ==========================================
// CLINIC SUBSCRIPTION & AI CREDIT METER ROUTES
// ==========================================
app.get('/api/subscription', authMiddleware, (req, res) => {
  const subscription = db.getSubscription();
  res.json({ subscription });
});

app.post('/api/subscription/upgrade', authMiddleware, (req: AuthenticatedRequest, res) => {
  const paymentMethod: 'UPI' | 'Card' = req.body?.paymentMethod === 'Card' ? 'Card' : 'UPI';
  const subscription = db.upgradeToProPlan(paymentMethod);
  const doctor = req.doctor!;

  db.logAudit({
    actorId: doctor.id,
    actorName: doctor.name,
    action: 'clinic_subscription_upgraded_pro',
    resourceType: 'subscription',
    resourceId: 'pro_monthly',
    metadata: {
      planName: subscription.planName,
      amountInr: 3999,
      creditsAdded: 150,
      paymentMethod,
      aiScansRemaining: subscription.aiScansRemaining
    }
  });

  res.json({
    subscription,
    message: 'Upgraded to Clinic Pro Monthly Plan (₹3,999/mo) — 150 AI Image Diagnostic Scans added!'
  });
});

app.post('/api/subscription/topup', authMiddleware, (req: AuthenticatedRequest, res) => {
  const paymentMethod: 'UPI' | 'Card' = req.body?.paymentMethod === 'Card' ? 'Card' : 'UPI';
  const credits = Number(req.body?.credits) || 100;
  const amountInr = Number(req.body?.amountInr) || 999;
  const subscription = db.topUpScanCredits(credits, amountInr, paymentMethod);
  const doctor = req.doctor!;

  db.logAudit({
    actorId: doctor.id,
    actorName: doctor.name,
    action: 'clinic_ai_credits_topped_up',
    resourceType: 'subscription',
    resourceId: 'credit_topup',
    metadata: {
      creditsAdded: credits,
      amountInr,
      paymentMethod,
      aiScansRemaining: subscription.aiScansRemaining
    }
  });

  res.json({
    subscription,
    message: `Added +${credits} AI Image Diagnostic Scans to your clinic account!`
  });
});

app.post('/api/ai/analyze-image', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const { imageBase64, mimeType, patientId, clinicalNotes, imageUrl, visualMetrics } = req.body;

  if (!imageBase64) {
    return res.status(400).json({ error: 'Clinical image data (imageBase64) is required for analysis' });
  }

  // Enforce AI Scan Credit Meter before running analysis
  const currentSub = db.getSubscription();
  if (currentSub.aiScansRemaining <= 0) {
    return res.status(402).json({
      error: 'All 10 free AI Diagnostic Scans have been used. Upgrade to the Pro Monthly Plan (₹3,999/mo for 150 scans) or Top Up a pack of 100 scans to continue.',
      code: 'OUT_OF_CREDITS',
      subscription: currentSub
    });
  }

  let patient = undefined;
  let history = undefined;
  let testReports = undefined;

  if (patientId) {
    patient = db.findPatientById(patientId);
    if (patient) {
      history = db.getConsultationsByPatient(patient.id);
      testReports = db.getTestReportsByPatient(patient.id);
    }
  }

  try {
    const analysis = await analyzeClinicalImage({
      imageBase64,
      mimeType,
      patient,
      history,
      testReports,
      clinicalNotes,
      imageUrl,
      visualMetrics
    });

    // Deduct 1 AI scan credit upon successful analysis
    const { subscription } = db.deductAiScanCredit(
      patient ? `${patient.fullName} (${patient.patientCode})` : undefined
    );

    const doctor = req.doctor!;
    db.logAudit({
      actorId: doctor.id,
      actorName: doctor.name,
      action: 'ai_clinical_image_analyzed',
      resourceType: 'clinical_image',
      resourceId: analysis.id,
      metadata: {
        patientId: patient?.id,
        patientName: patient?.fullName,
        primaryImpression: analysis.primaryImpression,
        isAiPowered: analysis.isAiPowered,
        aiScansRemaining: subscription.aiScansRemaining
      }
    });

    res.json({ analysis, patient, subscription });
  } catch (err: unknown) {
    console.error('AI image analysis endpoint error:', err);
    const message = err instanceof Error ? err.message : 'Failed to analyze clinical image';
    res.status(500).json({ error: message });
  }
});

app.post('/api/ai/compare-progression', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const { imageA, imageB, patientId, clinicalContext } = req.body;

  if (!imageA?.base64 || !imageB?.base64) {
    return res.status(400).json({ error: 'Both imageA and imageB base64 data are required for progression analysis' });
  }

  let patient = undefined;
  if (patientId) {
    patient = db.findPatientById(patientId);
  }

  try {
    const progression = await compareClinicalImages({
      imageA,
      imageB,
      patient,
      clinicalContext
    });

    const doctor = req.doctor!;
    db.logAudit({
      actorId: doctor.id,
      actorName: doctor.name,
      action: 'ai_lesion_progression_compared',
      resourceType: 'clinical_progression',
      resourceId: progression.id,
      metadata: {
        patientId: patient?.id,
        overallProgression: progression.overallProgression,
        progressionScore: progression.progressionScore
      }
    });

    res.json({ progression, patient });
  } catch (err: unknown) {
    console.error('Progression comparison error:', err);
    const message = err instanceof Error ? err.message : 'Failed to analyze progression';
    res.status(500).json({ error: message });
  }
});

// ==========================================
// AI DERMOSCOPIC ABCDE ASSESSMENT
// ==========================================
app.post('/api/ai/assess-abcde', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const { imageBase64, mimeType, patientId, clinicalNotes, estimatedDiameterMm, visualMetrics } = req.body;

  if (!imageBase64) {
    return res.status(400).json({ error: 'imageBase64 is required for ABCDE assessment' });
  }

  let patient = undefined;
  if (patientId) {
    patient = db.findPatientById(patientId);
  }

  try {
    const abcde = await assessABCDEAnalysis({
      imageBase64,
      mimeType,
      patient,
      clinicalNotes,
      estimatedDiameterMm: estimatedDiameterMm ? Number(estimatedDiameterMm) : undefined,
      visualMetrics
    });

    const doctor = req.doctor!;
    db.logAudit({
      actorId: doctor.id,
      actorName: doctor.name,
      action: 'ai_dermoscopic_abcde_assessed',
      resourceType: 'dermoscopic_assessment',
      resourceId: abcde.id,
      metadata: {
        patientId: patient?.id,
        totalScore: abcde.totalScore,
        riskLevel: abcde.riskLevel
      }
    });

    res.json({ abcde, patient });
  } catch (err: unknown) {
    console.error('ABCDE assessment error:', err);
    const message = err instanceof Error ? err.message : 'Failed to assess dermoscopic ABCDE';
    res.status(500).json({ error: message });
  }
});

// ==========================================
// VISIT & CLINICAL REPORT COMPARISON
// ==========================================
app.post('/api/ai/compare-visits', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const { visitAId, visitBId, patientId } = req.body;

  if (!visitAId || !visitBId || !patientId) {
    return res.status(400).json({ error: 'visitAId, visitBId, and patientId are required' });
  }

  const patient = db.findPatientById(patientId);
  if (!patient) {
    return res.status(404).json({ error: 'Patient not found' });
  }

  const visitA = db.getConsultationById(visitAId);
  const visitB = db.getConsultationById(visitBId);

  if (!visitA || !visitB) {
    return res.status(404).json({ error: 'One or both consultation visits not found' });
  }

  try {
    const comparison = await comparePatientVisits({
      visitA,
      visitB,
      patient
    });

    const doctor = req.doctor!;
    db.logAudit({
      actorId: doctor.id,
      actorName: doctor.name,
      action: 'ai_longitudinal_visits_compared',
      resourceType: 'consultation_comparison',
      resourceId: comparison.id,
      metadata: {
        patientId: patient.id,
        visitAId,
        visitBId,
        overallStatus: comparison.overallStatus
      }
    });

    res.json({ comparison });
  } catch (err: unknown) {
    console.error('Visit comparison error:', err);
    const message = err instanceof Error ? err.message : 'Failed to compare patient visits';
    res.status(500).json({ error: message });
  }
});



// ==========================================
// WHATSAPP MEDICAL REPORT DISPATCH & LOGGING
// ==========================================
app.post('/api/reports/log-whatsapp', authMiddleware, (req: AuthenticatedRequest, res) => {
  const { patientId, reportType, recipientMobile, note } = req.body;
  if (!recipientMobile) {
    return res.status(400).json({ error: 'recipientMobile is required' });
  }

  let patient = undefined;
  if (patientId) {
    patient = db.findPatientById(patientId);
  }

  const doctor = req.doctor!;
  db.logAudit({
    actorId: doctor.id,
    actorName: doctor.name,
    action: 'report_sent_whatsapp',
    resourceType: 'medical_report',
    resourceId: patientId || 'unlinked',
    metadata: {
      reportType: reportType || 'clinical_report',
      recipientMobile,
      patientName: patient?.fullName || 'Patient',
      patientCode: patient?.patientCode,
      note,
      clinicName: doctor.clinicName
    }
  });

  res.json({
    success: true,
    message: 'WhatsApp report dispatch logged successfully',
    timestamp: new Date().toISOString()
  });
});

// ==========================================
// DASHBOARD & AUDIT
// ==========================================
app.get('/api/dashboard/stats', authMiddleware, (req, res) => {
  const stats = db.getStats();
  const recentVisits = db.getRecentVisits(8);
  const recentPatients = db.getRecentPatients(8);
  const revenue = db.getPracticeRevenueAnalytics();
  res.json({ stats, recentVisits, recentPatients, revenue });
});

app.get('/api/dashboard/revenue', authMiddleware, (req, res) => {
  const revenue = db.getPracticeRevenueAnalytics();
  res.json({ revenue });
});

app.get('/api/audit', authMiddleware, (req, res) => {
  const logs = db.getAuditLogs(100);
  res.json({ logs });
});

// ==========================================
// FRONTEND INTEGRATION (DEV / PROD)
// ==========================================
async function startServer() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Clinical OS running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
