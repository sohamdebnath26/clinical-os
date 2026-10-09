import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { db } from './server/db.js';
import { summarizeConsultationWithAI, askAIAssistant } from './server/ai.js';
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

// ==========================================
// DASHBOARD & AUDIT
// ==========================================
app.get('/api/dashboard/stats', authMiddleware, (req, res) => {
  const stats = db.getStats();
  const recentVisits = db.getRecentVisits(8);
  const recentPatients = db.getRecentPatients(8);
  res.json({ stats, recentVisits, recentPatients });
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
