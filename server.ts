import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import zlib from 'zlib';
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

// Ensure upload directory exists (supports persistent DATA_DIR on Render)
const BASE_DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : process.cwd();
const UPLOADS_DIR = process.env.DATA_DIR
  ? path.join(BASE_DATA_DIR, 'uploads')
  : path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
app.use('/uploads', express.static(UPLOADS_DIR));

// Public health check endpoint for Render uptime monitors (prevents spin-down)
app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Session store (token -> doctorId) with restart-resilient token verification
const activeSessions = new Map<string, { doctorId: string; expiresAt: number }>();
const revokedTokens = new Set<string>();
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days sliding window

function generateToken(
  doctorOrId?:
    | string
    | {
        id: string;
        email?: string;
        name?: string;
        speciality?: string;
        clinicName?: string;
        role?: 'doctor' | 'receptionist';
        accountType?: 'individual' | 'organisational';
      }
): string {
  let payloadStr = '';
  if (typeof doctorOrId === 'string' && doctorOrId) {
    const doc = db.findDoctorById(doctorOrId);
    if (doc) {
      payloadStr = JSON.stringify({
        id: doc.id,
        email: doc.email,
        name: doc.name,
        speciality: doc.speciality,
        clinicName: doc.clinicName,
        role: doc.role,
        accountType: doc.accountType
      });
    } else {
      payloadStr = doctorOrId;
    }
  } else if (doctorOrId && typeof doctorOrId === 'object') {
    payloadStr = JSON.stringify({
      id: doctorOrId.id,
      email: doctorOrId.email,
      name: doctorOrId.name,
      speciality: doctorOrId.speciality,
      clinicName: doctorOrId.clinicName,
      role: doctorOrId.role,
      accountType: doctorOrId.accountType
    });
  }

  const encodedDoc = payloadStr ? Buffer.from(payloadStr, 'utf8').toString('base64url') : '';
  return encodedDoc
    ? `sess_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 10)}_${encodedDoc}`
    : `sess_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 10)}`;
}

// Authentication middleware
interface AuthenticatedRequest extends Request {
  doctor?: ReturnType<typeof db.findDoctorById>;
}

function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const headerDoctorId = typeof req.headers['x-doctor-id'] === 'string' ? req.headers['x-doctor-id'].trim() : '';
  const headerDoctorEmail = typeof req.headers['x-doctor-email'] === 'string' ? req.headers['x-doctor-email'].trim() : '';
  const headerDoctorName = typeof req.headers['x-doctor-name'] === 'string' ? req.headers['x-doctor-name'].trim() : '';

  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1]?.trim() : '';

  if (!token && !headerDoctorId && !headerDoctorEmail) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
  }

  if (token && revokedTokens.has(token)) {
    return res.status(401).json({ error: 'Session expired or invalid' });
  }

  let session = token ? activeSessions.get(token) : undefined;

  // Restore valid client tokens seamlessly if the server restarted in dev/Render
  if (!session && token && token.startsWith('sess_')) {
    const parts = token.split('_');
    let restoredDoctor = undefined;
    if (parts.length >= 4) {
      try {
        const decodedRaw = Buffer.from(parts.slice(3).join('_'), 'base64url').toString('utf8');
        if (decodedRaw.startsWith('{')) {
          const parsed = JSON.parse(decodedRaw);
          restoredDoctor = db.restoreOrEnsureDoctor(parsed);
        } else {
          restoredDoctor = db.restoreOrEnsureDoctor({
            id: decodedRaw,
            email: headerDoctorEmail || undefined,
            name: headerDoctorName || undefined
          });
        }
      } catch {
        // invalid encoded payload
      }
    }

    if (!restoredDoctor && (headerDoctorId || headerDoctorEmail)) {
      restoredDoctor = db.restoreOrEnsureDoctor({
        id: headerDoctorId || undefined,
        email: headerDoctorEmail || undefined,
        name: headerDoctorName || undefined
      });
    }

    // Fallback for legacy 3-part tokens so an active session never breaks mid-workflow
    if (!restoredDoctor) {
      restoredDoctor = db.findDoctorById('doc-demo-001');
    }

    if (restoredDoctor) {
      session = {
        doctorId: restoredDoctor.id,
        expiresAt: Date.now() + SESSION_TTL_MS
      };
      activeSessions.set(token, session);
    }
  }

  // Also allow restoration from X-Doctor-Id / X-Doctor-Email headers if token was lost in client memory
  if (!session && (headerDoctorId || headerDoctorEmail)) {
    const restoredDoctor =
      db.restoreOrEnsureDoctor({
        id: headerDoctorId || undefined,
        email: headerDoctorEmail || undefined,
        name: headerDoctorName || undefined
      }) || db.findDoctorById('doc-demo-001');

    if (restoredDoctor) {
      session = {
        doctorId: restoredDoctor.id,
        expiresAt: Date.now() + SESSION_TTL_MS
      };
      if (token) {
        activeSessions.set(token, session);
      }
    }
  }

  if (!session) {
    return res.status(401).json({ error: 'Session expired or invalid' });
  }

  // Sliding window expiration refresh
  session.expiresAt = Date.now() + SESSION_TTL_MS;

  let doctor = db.findDoctorById(session.doctorId);
  if (!doctor) {
    doctor =
      db.restoreOrEnsureDoctor({
        id: session.doctorId,
        email: headerDoctorEmail || undefined,
        name: headerDoctorName || undefined
      }) || db.findDoctorById('doc-demo-001');
  }

  if (!doctor) {
    if (token) activeSessions.delete(token);
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

  const token = generateToken(doctor);
  activeSessions.set(token, {
    doctorId: doctor.id,
    expiresAt: Date.now() + SESSION_TTL_MS
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

// Silent session restore endpoint for seamless recovery after server restarts
app.post('/api/auth/restore', (req, res) => {
  const { id, email, name, speciality, clinicName, role, accountType } = req.body || {};
  const doctor =
    db.restoreOrEnsureDoctor({ id, email, name, speciality, clinicName, role, accountType }) ||
    db.findDoctorById('doc-demo-001');

  if (!doctor) {
    return res.status(401).json({ error: 'Unable to restore session' });
  }

  const token = generateToken(doctor);
  activeSessions.set(token, {
    doctorId: doctor.id,
    expiresAt: Date.now() + SESSION_TTL_MS
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

  const token = generateToken(doctor);
  activeSessions.set(token, {
    doctorId: doctor.id,
    expiresAt: Date.now() + SESSION_TTL_MS
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

  const token = generateToken(doctor);
  activeSessions.set(token, {
    doctorId: doctor.id,
    expiresAt: Date.now() + SESSION_TTL_MS
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

    const token = generateToken(doctor);
    activeSessions.set(token, {
      doctorId: doctor.id,
      expiresAt: Date.now() + SESSION_TTL_MS
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
  if (token) {
    activeSessions.delete(token);
    revokedTokens.add(token);
  }
  res.json({ message: 'Logged out successfully' });
});

// Update Doctor Settings
app.put('/api/doctor/profile', authMiddleware, (req: AuthenticatedRequest, res) => {
  if (!req.doctor) return res.status(401).json({ error: 'Unauthorized' });
  const body = { ...req.body };
  if (body.phone !== undefined) {
    const cleanPhone = String(body.phone).replace(/\D/g, '').slice(0, 10);
    if (cleanPhone.length > 0 && cleanPhone.length !== 10) {
      return res.status(400).json({ error: 'Mobile number must be exactly 10 digits' });
    }
    body.phone = cleanPhone;
  }
  const updated = db.updateDoctor(req.doctor.id, body);
  res.json({ doctor: updated });
});

// ==========================================
// PATIENT ROUTES
// ==========================================
app.get('/api/patients', authMiddleware, (req: AuthenticatedRequest, res) => {
  const query = req.query.q as string | undefined;
  const patients = db.getPatients(query, req.doctor?.id);
  res.json({ patients });
});

app.get('/api/patients/check-mobile/:mobile', authMiddleware, (req: AuthenticatedRequest, res) => {
  const mobile = req.params.mobile;
  const existing = db.findPatientByMobile(mobile, req.doctor?.id);
  if (existing) {
    return res.json({ exists: true, patient: existing });
  }
  res.json({ exists: false });
});

app.get('/api/patients/:id', authMiddleware, (req: AuthenticatedRequest, res) => {
  const patient = db.findPatientById(req.params.id, req.doctor?.id);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });
  res.json({ patient });
});

app.post('/api/patients', authMiddleware, (req: AuthenticatedRequest, res) => {
  const {
    fullName,
    age,
    gender,
    mobile,
    countryCode,
    weight,
    notes,
    discountPanel,
    primaryDiagnosis,
    dateOfBirth,
    bloodGroup,
    address,
    emergencyContact,
    allergies,
    currentMedications,
    medicalHistory
  } = req.body;

  if (!fullName || !mobile) {
    return res.status(400).json({ error: 'Full name and mobile number are required' });
  }

  const cleanMobile = String(mobile).replace(/\D/g, '').slice(0, 10);
  if (cleanMobile.length !== 10) {
    return res.status(400).json({ error: 'Mobile number must be10 digits' });
  }

  // Prevent accidental duplicate mobile within the same doctor/clinic account
  const existing = db.findPatientByMobile(cleanMobile, req.doctor?.id);
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
      age: age !== undefined && age !== '' ? Number(age) : 0,
      gender: gender || 'Prefer not to say',
      mobile: cleanMobile,
      countryCode: countryCode || '+91',
      weight: weight !== undefined && weight !== '' ? Number(weight) : undefined,
      notes: notes || '',
      discountPanel: discountPanel || '',
      primaryDiagnosis: primaryDiagnosis || '',
      dateOfBirth: dateOfBirth || '',
      bloodGroup: bloodGroup || '',
      address: address || '',
      emergencyContact: emergencyContact || '',
      allergies: allergies || notes || '',
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
  const updates = { ...req.body };
  if (updates.mobile !== undefined) {
    const cleanMobile = String(updates.mobile).replace(/\D/g, '').slice(0, 10);
    if (cleanMobile.length !== 10) {
      return res.status(400).json({ error: 'Mobile number must be exactly 10 digits' });
    }
    updates.mobile = cleanMobile;
  }
  const updated = db.updatePatient(req.params.id, updates, { id: doctor.id, name: doctor.name });
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
app.get('/api/prescriptions', authMiddleware, (req: AuthenticatedRequest, res) => {
  const patientId = req.query.patientId as string | undefined;
  const prescriptions = db.getPrescriptions(patientId, req.doctor?.id);
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
// DOCTOR PERSONALIZED MEDICAL LIBRARY (FORMULARY) ROUTES
// ==========================================
function extractTextRowsFromPdfBuffer(pdfBuffer: Buffer): string[] {
  const rawBinary = pdfBuffer.toString('latin1');
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  const decompressedStreams: string[] = [];

  let match: RegExpExecArray | null;
  while ((match = streamRegex.exec(rawBinary)) !== null) {
    const chunkBuf = Buffer.from(match[1], 'latin1');
    try {
      const inflated = zlib.inflateSync(chunkBuf);
      decompressedStreams.push(inflated.toString('latin1'));
    } catch {
      try {
        const inflatedRaw = zlib.inflateRawSync(chunkBuf);
        decompressedStreams.push(inflatedRaw.toString('latin1'));
      } catch {
        // Not a zlib stream
      }
    }
  }

  // Build ToUnicode CMap dictionary across streams
  const cidToChar = new Map<number, string>();
  for (const s of decompressedStreams) {
    if (s.includes('beginbfchar')) {
      const bfCharRegex = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
      let cm: RegExpExecArray | null;
      while ((cm = bfCharRegex.exec(s)) !== null) {
        const cid = parseInt(cm[1], 16);
        const uniHex = cm[2];
        let chars = '';
        for (let i = 0; i < uniHex.length; i += 4) {
          const code = parseInt(uniHex.slice(i, i + 4), 16);
          if (!isNaN(code)) chars += String.fromCharCode(code);
        }
        if (chars) cidToChar.set(cid, chars);
      }
    }
    if (s.includes('beginbfrange')) {
      const bfRangeRegex = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
      let rm: RegExpExecArray | null;
      while ((rm = bfRangeRegex.exec(s)) !== null) {
        const startCid = parseInt(rm[1], 16);
        const endCid = parseInt(rm[2], 16);
        const startUni = parseInt(rm[3], 16);
        for (let c = startCid; c <= endCid && c - startCid < 512; c++) {
          cidToChar.set(c, String.fromCharCode(startUni + (c - startCid)));
        }
      }
    }
  }

  const extractedCells: string[] = [];
  for (const s of decompressedStreams) {
    if (s.includes('beginbfchar') || s.includes('beginbfrange')) continue;

    // 1. Decode hex TJ arrays (<0014...> Tj/TJ)
    const btBlocks = s.match(/BT[\s\S]*?ET/g) || [s];
    for (const block of btBlocks) {
      const hexParts = block.match(/<([0-9A-Fa-f]+)>/g);
      if (hexParts && hexParts.length > 0 && cidToChar.size > 0) {
        let cellText = '';
        for (const hp of hexParts) {
          const hex = hp.slice(1, -1);
          for (let i = 0; i < hex.length; i += 4) {
            const cid = parseInt(hex.slice(i, i + 4), 16);
            cellText += cidToChar.get(cid) || '';
          }
        }
        if (cellText.trim()) extractedCells.push(cellText.trim());
      }

      // 2. Also decode standard PDF literal strings: (Amoxicillin) Tj or [(Amoxicillin) -10 (500 mg)] TJ
      const litParts = block.match(/\((?:\\.|[^\\()])*\)/g);
      if (litParts && litParts.length > 0) {
        const litText = litParts
          .map(lp =>
            lp
              .slice(1, -1)
              .replace(/\\n/g, '\n')
              .replace(/\\r/g, ' ')
              .replace(/\\t/g, ' ')
              .replace(/\\\(/g, '(')
              .replace(/\\\)/g, ')')
              .replace(/\\\\/g, '\\')
          )
          .join('');
        if (litText.trim()) extractedCells.push(litText.trim());
      }
    }
  }

  return extractedCells;
}

function parseCsvOrDelimitedGrid(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  const cleanText = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < cleanText.length; i++) {
    const ch = cleanText[i];
    const nextCh = cleanText[i + 1];

    if (ch === '"') {
      if (inQuotes && nextCh === '"') {
        currentCell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === delimiter) {
      currentRow.push(currentCell.trim());
      currentCell = '';
      continue;
    }

    if (!inQuotes && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && nextCh === '\n') {
        i++;
      }
      currentRow.push(currentCell.trim());
      if (currentRow.some(cell => cell.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
      continue;
    }

    currentCell += ch;
  }

  currentRow.push(currentCell.trim());
  if (currentRow.some(cell => cell.length > 0)) {
    rows.push(currentRow);
  }

  return rows;
}

function parseMedicationsFromCellsOrText(cells: string[], rawTextFallback = ''): Array<{
  name: string;
  dosage: string;
  route?: string;
  frequency: string;
  duration: string;
  instructions: string;
}> {
  const results: Array<{
    name: string;
    dosage: string;
    route?: string;
    frequency: string;
    duration: string;
    instructions: string;
  }> = [];

  const inferFieldsFromDosage = (
    name: string,
    rawDosage: string,
    extraInstructions = '',
    explicitRoute = '',
    explicitFrequency = '',
    explicitDuration = ''
  ) => {
    let cleanName = name.replace(/^["']|["']$/g, '').trim();
    let cleanDosage = rawDosage.replace(/^["']|["']$/g, '').trim();

    // If dosage is empty, check if strength is embedded in medicine name (e.g. "Amoxicillin 500 mg")
    if (!cleanDosage) {
      const embeddedMatch = cleanName.match(/^(.+?)\s+(\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|iu|%)(?:\/[\d.]+\s*(?:mg|mcg|g|ml))?.*)$/i);
      if (embeddedMatch) {
        cleanName = embeddedMatch[1].trim();
        cleanDosage = embeddedMatch[2].trim();
      }
    }

    const dLower = `${cleanName} ${cleanDosage} ${extraInstructions} ${explicitRoute} ${explicitFrequency} ${explicitDuration}`.toLowerCase();
    let frequency = explicitFrequency.trim() || '1-0-1';
    if (!explicitFrequency.trim()) {
      if (dLower.includes('every 6 hours') || dLower.includes('4 times daily') || dLower.includes('qid')) {
        frequency = '1-1-1-1';
      } else if (dLower.includes('every 8 hours') || dLower.includes('3 times daily') || dLower.includes('three times daily') || dLower.includes('tid') || dLower.includes('tds')) {
        frequency = '1-1-1';
      } else if (dLower.includes('every 12 hours') || dLower.includes('twice daily') || dLower.includes('bid') || dLower.includes('bd')) {
        frequency = '1-0-1';
      } else if (dLower.includes('bedtime') || dLower.includes('at night') || dLower.includes('hs')) {
        frequency = '0-0-1';
      } else if (dLower.includes('once daily') || dLower.includes('every 24 hours') || dLower.includes('od')) {
        frequency = '1-0-0';
      } else if (dLower.includes('weekly') || dLower.includes('once a week')) {
        frequency = 'Once weekly';
      } else if (dLower.includes('single dose')) {
        frequency = 'Single stat dose';
      }
    }

    let duration = explicitDuration.trim() || '5 days';
    if (!explicitDuration.trim()) {
      const dayMatch = dLower.match(/for\s+(\d+(?:[–-]\d+)?\s*(?:days?|weeks?|months?))/i);
      if (dayMatch) {
        duration = dayMatch[1];
      } else if (dLower.includes('single dose')) {
        duration = '1 day';
      } else if (/topical|cream|gel|ointment|lotion|shampoo|drops/i.test(dLower)) {
        duration = '14 days';
      } else if (/antifungal|terbinafine|itraconazole|fluconazole|griseofulvin/i.test(dLower)) {
        duration = '14 days';
      } else if (/antiviral|acyclovir|valacyclovir|oseltamivir|tenofovir|entecavir/i.test(dLower)) {
        duration = '7 days';
      }
    }

    const route =
      explicitRoute.trim() ||
      (/cream|gel|ointment|lotion|shampoo|solution|spf|sunscreen|topical/i.test(dLower)
        ? 'Topical'
        : /\b(iv|im|iv\/im|infusion|injection)\b/i.test(dLower)
        ? 'IV / IM'
        : /\b(ophthalmic|drops|eye|ear|nasal)\b/i.test(dLower)
        ? 'Nasal / Drops'
        : 'Oral');

    const finalDosage = cleanDosage || 'Standard dose';
    const instructions = extraInstructions.trim() || `Standard regimen: ${finalDosage}`;
    return {
      name: cleanName,
      dosage: finalDosage,
      route,
      frequency,
      duration,
      instructions
    };
  };

  // Case A: Table triplets from PDF (e.g., ["1", "Amoxicillin", "250 mg to 500 mg every 8 hours..."])
  if (cells.length >= 3) {
    let i = 0;
    while (i < cells.length) {
      const c = cells[i].trim();
      if (/^\d{1,4}\.?$/.test(c) && i + 2 < cells.length) {
        const medName = cells[i + 1].trim();
        const dosageCol = cells[i + 2].trim();
        if (
          medName &&
          !/^(no\.?|medicine|medication|drug|name)$/i.test(medName) &&
          dosageCol &&
          !/^(dosage|dose|strength)$/i.test(dosageCol)
        ) {
          results.push(inferFieldsFromDosage(medName, dosageCol));
          i += 3;
          continue;
        }
      }
      i++;
    }
  }

  // Case B: Full RFC-4180 CSV / TSV / Semicolon / Pipe table parsing on rawTextFallback
  const cleanedText = rawTextFallback
    .replace(/^\uFEFF/, '')
    .replace(/\0/g, '')
    .replace(/^sep=.+\r?\n/i, '')
    .trim();

  if (cleanedText) {
    const sampleLines = cleanedText
      .split(/\r\n|\n|\r/)
      .map(l => l.trim())
      .filter(Boolean)
      .slice(0, 10);

    let delimiter: string | null = null;
    if (sampleLines.some(l => l.includes('\t'))) {
      delimiter = '\t';
    } else if (sampleLines.some(l => l.includes('|'))) {
      delimiter = '|';
    } else if (
      sampleLines.some(l => l.includes(';')) &&
      sampleLines.reduce((acc, l) => acc + (l.split(';').length - 1), 0) >
        sampleLines.reduce((acc, l) => acc + (l.split(',').length - 1), 0)
    ) {
      delimiter = ';';
    } else if (sampleLines.some(l => l.includes(','))) {
      delimiter = ',';
    }

    if (delimiter) {
      const grid = parseCsvOrDelimitedGrid(cleanedText, delimiter);
      if (grid.length > 0) {
        let headerRowIndex = -1;
        let nameIdx = -1;
        let dosageIdx = -1;
        let routeIdx = -1;
        let freqIdx = -1;
        let durIdx = -1;
        let instrIdx = -1;

        for (let r = 0; r < Math.min(2, grid.length); r++) {
          const hasDosageDigits = grid[r].some(c => /\b\d+\s*(mg|mcg|g|ml|iu|%)\b/i.test(c));
          const headerCandidate = grid[r].map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
          const isHeaderRow =
            !hasDosageDigits &&
            headerCandidate.some(h =>
              /^(medicine|medicinename|medication|medicationname|drug|drugname|brand|brandname|generic|genericname|name|item|itemname|product|productname|particulars|tablet|capsule|formulation|rx|dosage|requireddosage|dose|strength|posology|regimen|frequency|route|duration|instructions|notes|remarks|sig)$/.test(
                h
              )
            );

          if (isHeaderRow) {
            headerRowIndex = r;
            headerCandidate.forEach((h, idx) => {
              if (
                nameIdx === -1 &&
                /^(medicine|medicinename|medication|medicationname|drug|drugname|brand|brandname|generic|genericname|name|nameofmedicine|item|itemname|product|productname|particulars|tablet|capsule|formulation|rx)$/.test(
                  h
                )
              ) {
                nameIdx = idx;
              } else if (
                dosageIdx === -1 &&
                /^(dosage|requireddosage|dose|strength|posology|regimen|concentration|mg)$/.test(h)
              ) {
                dosageIdx = idx;
              } else if (
                routeIdx === -1 &&
                /^(route|form|mode|type|administration)$/.test(h)
              ) {
                routeIdx = idx;
              } else if (
                freqIdx === -1 &&
                /^(frequency|freq|schedule|timing)$/.test(h)
              ) {
                freqIdx = idx;
              } else if (
                durIdx === -1 &&
                /^(duration|days|course|period)$/.test(h)
              ) {
                durIdx = idx;
              } else if (
                instrIdx === -1 &&
                /^(instructions|instruction|notes|note|remarks|remark|directions|sig|advice)$/.test(h)
              ) {
                instrIdx = idx;
              }
            });

            if (nameIdx === -1) {
              const firstNonIndex = headerCandidate.findIndex(
                (h, idx) =>
                  idx !== dosageIdx &&
                  idx !== routeIdx &&
                  idx !== freqIdx &&
                  idx !== durIdx &&
                  idx !== instrIdx &&
                  !/^(no|sno|srno|slno|id|index|row)$/.test(h) &&
                  !/^\d+$/.test(h)
              );
              if (firstNonIndex !== -1) nameIdx = firstNonIndex;
            }
            break;
          }
        }

        const startRow = headerRowIndex !== -1 ? headerRowIndex + 1 : 0;
        for (let r = startRow; r < grid.length; r++) {
          const rawRow = grid[r].map(c => c.replace(/^["']|["']$/g, '').trim());
          if (rawRow.every(c => !c)) continue;

          if (headerRowIndex !== -1 && nameIdx !== -1) {
            const medName = rawRow[nameIdx] || '';
            if (!medName || medName.length < 1) continue;
            const medDose =
              dosageIdx !== -1
                ? rawRow[dosageIdx] || ''
                : rawRow.find((val, idx) => idx !== nameIdx && idx > nameIdx && Boolean(val)) || '';
            const routeVal = routeIdx !== -1 ? rawRow[routeIdx] || '' : '';
            const freqVal = freqIdx !== -1 ? rawRow[freqIdx] || '' : '';
            const durVal = durIdx !== -1 ? rawRow[durIdx] || '' : '';
            const instrVal = instrIdx !== -1 ? rawRow[instrIdx] || '' : '';
            results.push(inferFieldsFromDosage(medName, medDose, instrVal, routeVal, freqVal, durVal));
          } else {
            // Positional CSV row (strip leading row index like "1", "2.")
            const cols = /^\d{1,5}\.?$/.test(rawRow[0]) && rawRow.length > 1 ? rawRow.slice(1) : rawRow;
            const firstCol = cols[0] || '';
            if (!firstCol || firstCol.length < 1) continue;
            if (
              /^(no\.?|#|s\.?no|sl\.?no|medicine\s*name|drug\s*name|medication|medicine|name)$/i.test(firstCol) &&
              cols.length > 1 &&
              /dosage|dose|strength|frequency/i.test(cols[1] || '')
            ) {
              continue;
            }

            if (cols.length >= 2) {
              const [medName, medDose, freqCol, durCol, instrCol] = cols;
              results.push(
                inferFieldsFromDosage(medName, medDose || '', instrCol || '', '', freqCol || '', durCol || '')
              );
            } else if (cols.length === 1) {
              // Single-column CSV row: check "Medicine - Dosage" or embedded strength
              const dashMatch = firstCol.match(/^([A-Za-z0-9\s()/+-]{2,60}?)\s*(?:[-–—:]|\s{2,})\s*(.+)$/);
              if (dashMatch) {
                results.push(inferFieldsFromDosage(dashMatch[1], dashMatch[2]));
              } else {
                results.push(inferFieldsFromDosage(firstCol, ''));
              }
            }
          }
        }

        // Guaranteed fallback for any non-empty CSV grid
        if (results.length === 0 && grid.length > 0) {
          for (const row of grid) {
            const nonEmpty = row.map(c => c.replace(/^["']|["']$/g, '').trim()).filter(Boolean);
            if (nonEmpty.length === 0) continue;
            const cols = /^\d{1,5}\.?$/.test(nonEmpty[0]) && nonEmpty.length > 1 ? nonEmpty.slice(1) : nonEmpty;
            const nameVal = cols[0] || nonEmpty[0];
            const doseVal = cols[1] || 'Standard dose';
            const extraVal = cols.slice(2).join(' · ');
            results.push(inferFieldsFromDosage(nameVal, doseVal, extraVal));
          }
        }
      }
    }
  }

  // Case C: Fallback line-by-line parsing for PDF cells or plain text lines ("1. Medicine - Dosage" or single lines)
  if (results.length === 0) {
    const combinedLines = [...cells, ...cleanedText.split(/\r\n|\n|\r/)]
      .map(l => l.replace(/^\uFEFF/, '').replace(/\0/g, '').trim())
      .filter(Boolean);

    for (const line of combinedLines) {
      if (/^(no\.?|#|s\.?no|medicine\s*name|drug\s*name|medication|medicine|name)\b/i.test(line) && /dosage|dose|strength|frequency/i.test(line)) {
        continue;
      }

      const cleanLine = line.replace(/^\d{1,4}[.)]\s*/, '').trim();
      if (!cleanLine || cleanLine.length < 2) continue;

      const dashMatch = cleanLine.match(/^([A-Za-z0-9\s()/+-]{2,60}?)\s*(?:[-–—:]|\s{2,})\s*(.+)$/);
      if (dashMatch) {
        const [, medName, medDose] = dashMatch;
        if (!/^(page|table|section|chapter)\b/i.test(medName.trim())) {
          results.push(inferFieldsFromDosage(medName, medDose));
          continue;
        }
      }

      // Single medicine line fallback (e.g., "Amoxicillin 500 mg" or "Doxycycline")
      if (/^[A-Za-z][A-Za-z0-9\s()/%+-]{1,65}$/.test(cleanLine) && !/^(page|table|section|chapter)\b/i.test(cleanLine)) {
        results.push(inferFieldsFromDosage(cleanLine, ''));
      }
    }
  }

  return results;
}

app.get('/api/formulary', authMiddleware, (req: AuthenticatedRequest, res) => {
  const doctor = req.doctor!;
  const items = db.getDoctorFormulary(doctor.id);
  res.json({ items });
});

app.post('/api/formulary', authMiddleware, (req: AuthenticatedRequest, res) => {
  const doctor = req.doctor!;
  const { name, dosage, route, frequency, duration, instructions, category, source } = req.body;
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Medicine name is required' });
  }

  const item = db.upsertFormularyItem(
    doctor.id,
    {
      name: String(name).trim(),
      dosage: String(dosage || 'Standard dose').trim(),
      route: route ? String(route).trim() : undefined,
      frequency: frequency ? String(frequency).trim() : undefined,
      duration: duration ? String(duration).trim() : undefined,
      instructions: instructions ? String(instructions).trim() : undefined,
      category: category ? String(category).trim() : 'Personal Library',
      source: source || 'manual'
    },
    { id: doctor.id, name: doctor.name }
  );

  res.status(201).json({ item });
});

app.post('/api/formulary/import', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const doctor = req.doctor!;
  const { fileDataUrl, filename, rawText, items: directItems } = req.body;

  try {
    let parsedMedications: Array<{
      name: string;
      dosage: string;
      route?: string;
      frequency: string;
      duration: string;
      instructions: string;
      source?: 'manual' | 'pdf_upload' | 'csv_upload' | 'rx_learned';
    }> = [];

    if (Array.isArray(directItems) && directItems.length > 0) {
      parsedMedications = directItems.map(it => ({
        name: String(it.name || '').trim(),
        dosage: String(it.dosage || 'Standard dose').trim(),
        route: it.route,
        frequency: String(it.frequency || '1-0-1'),
        duration: String(it.duration || '5 days'),
        instructions: String(it.instructions || ''),
        source: it.source || 'csv_upload'
      }));
    }

    const lowerFilename = typeof filename === 'string' ? filename.toLowerCase().trim() : '';

    if (parsedMedications.length === 0 && fileDataUrl && typeof fileDataUrl === 'string') {
      let fileBuffer: Buffer | null = null;
      let mimeType = '';

      const base64Marker = ';base64,';
      const base64Idx = fileDataUrl.indexOf(base64Marker);
      if (fileDataUrl.startsWith('data:') && base64Idx !== -1) {
        mimeType = fileDataUrl.slice(5, base64Idx).toLowerCase();
        const base64Data = fileDataUrl.slice(base64Idx + base64Marker.length).trim();
        fileBuffer = Buffer.from(base64Data, 'base64');
      } else if (fileDataUrl.startsWith('data:') && fileDataUrl.includes(',')) {
        const commaIdx = fileDataUrl.indexOf(',');
        mimeType = fileDataUrl.slice(5, commaIdx).toLowerCase();
        const decodedText = decodeURIComponent(fileDataUrl.slice(commaIdx + 1));
        fileBuffer = Buffer.from(decodedText, 'utf8');
      }

      if (fileBuffer) {
        if (mimeType.includes('pdf') || lowerFilename.endsWith('.pdf')) {
          const pdfCells = extractTextRowsFromPdfBuffer(fileBuffer);
          const fromPdf = parseMedicationsFromCellsOrText(pdfCells);
          parsedMedications.push(
            ...fromPdf.map(m => ({ ...m, source: 'pdf_upload' as const }))
          );
        } else {
          // Decode UTF-16LE / UTF-16BE / UTF-8 CSV, TSV, JSON, or TXT file
          let textContent = '';
          if (fileBuffer.length >= 2 && fileBuffer[0] === 0xff && fileBuffer[1] === 0xfe) {
            textContent = fileBuffer.subarray(2).toString('utf16le');
          } else if (fileBuffer.length >= 2 && fileBuffer[0] === 0xfe && fileBuffer[1] === 0xff) {
            const swapped = Buffer.from(fileBuffer.subarray(2));
            swapped.swap16();
            textContent = swapped.toString('utf16le');
          } else {
            textContent = fileBuffer.toString('utf8').replace(/\0/g, '');
          }

          if (mimeType.includes('json') || lowerFilename.endsWith('.json')) {
            try {
              const jsonArr = JSON.parse(textContent);
              if (Array.isArray(jsonArr)) {
                parsedMedications.push(
                  ...jsonArr.map(it => ({
                    name: String(it.name || it.medicineName || it.drug || '').trim(),
                    dosage: String(it.dosage || it.dose || 'Standard dose').trim(),
                    route: it.route,
                    frequency: String(it.frequency || '1-0-1'),
                    duration: String(it.duration || '5 days'),
                    instructions: String(it.instructions || ''),
                    source: 'csv_upload' as const
                  }))
                );
              }
            } catch {
              // fallback to CSV/text parser
            }
          }
          if (parsedMedications.length === 0) {
            const fromText = parseMedicationsFromCellsOrText([], textContent);
            parsedMedications.push(
              ...fromText.map(m => ({ ...m, source: 'csv_upload' as const }))
            );
          }
        }
      }
    }

    // If rawText is provided (either from Paste mode OR client-side CSV text reader), parse if not already populated
    if (rawText && typeof rawText === 'string' && rawText.trim() && parsedMedications.length === 0) {
      const fromRaw = parseMedicationsFromCellsOrText([], rawText);
      parsedMedications.push(
        ...fromRaw.map(m => ({ ...m, source: 'csv_upload' as const }))
      );
    }

    const validMedications = parsedMedications.filter(m => m.name && m.name.trim().length >= 2);
    if (validMedications.length === 0) {
      return res.status(400).json({
        error:
          'Could not detect valid medication rows. Ensure your CSV/PDF/Text has Medicine Name and Dosage columns or "Medicine Name - Dosage" lines.'
      });
    }

    const result = db.bulkImportFormularyItems(doctor.id, validMedications, {
      id: doctor.id,
      name: doctor.name
    });

    res.json({
      importedCount: result.importedCount,
      updatedCount: result.updatedCount,
      totalProcessed: validMedications.length,
      items: result.items
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to import medication file';
    res.status(500).json({ error: message });
  }
});

app.delete('/api/formulary/:id', authMiddleware, (req: AuthenticatedRequest, res) => {
  const doctor = req.doctor!;
  const deleted = db.deleteFormularyItem(doctor.id, req.params.id, {
    id: doctor.id,
    name: doctor.name
  });
  if (!deleted) {
    return res.status(404).json({ error: 'Medication item not found in your personal library' });
  }
  res.json({ success: true });
});

// ==========================================
// APPOINTMENTS ROUTES (Consistent with Consultation Follow-up Date)
// ==========================================
app.get('/api/appointments', authMiddleware, (req: AuthenticatedRequest, res) => {
  const patientId = req.query.patientId as string | undefined;
  const date = req.query.date as string | undefined;
  const status = req.query.status as string | undefined;

  const appointments = db.getAppointments({ patientId, date, status }, req.doctor?.id);
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

function getOrRestoreMobileUploadSession(token: string): MobileImageUploadSession | undefined {
  let session = mobileUploadSessions.get(token);
  if (session) {
    session.expiresAt = Date.now() + 24 * 60 * 60 * 1000;
    return session;
  }

  if (token && token.startsWith('mob_')) {
    const parts = token.split('_');
    let patientId = '';
    let consultationId: string | undefined = undefined;
    let doctorId = 'doc-demo-001';
    if (parts.length >= 4) {
      try {
        const decoded = JSON.parse(Buffer.from(parts.slice(3).join('_'), 'base64url').toString('utf8'));
        if (decoded.p) patientId = decoded.p;
        if (decoded.c) consultationId = decoded.c;
        if (decoded.d) doctorId = decoded.d;
      } catch {
        // ignore decode error
      }
    }

    const patient = (patientId && db.findPatientById(patientId)) || db.getPatients()[0];
    const doctor = db.findDoctorById(doctorId) || db.findDoctorById('doc-demo-001');
    if (patient && doctor) {
      const now = Date.now();
      const existingImages = db
        .getPatientImages(patient.id)
        .filter(img => !consultationId || img.consultationId === consultationId);

      session = {
        token,
        patientId: patient.id,
        patientName: patient.fullName,
        patientCode: patient.patientCode,
        consultationId,
        doctorId: doctor.id,
        doctorName: doctor.name,
        clinicName: doctor.clinicName || 'Dermatology & Clinical Practice',
        createdAt: now,
        expiresAt: now + 24 * 60 * 60 * 1000,
        uploadedImages: [...existingImages]
      };
      mobileUploadSessions.set(token, session);
      return session;
    }
  }

  return undefined;
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
  const encodedMeta = Buffer.from(
    JSON.stringify({ p: patient.id, c: consultationId, d: doctor.id }),
    'utf8'
  ).toString('base64url');
  const token = `mob_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}_${encodedMeta}`;
  const now = Date.now();
  const expiresAt = now + 24 * 60 * 60 * 1000; // 24 hours validity

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
  const session = getOrRestoreMobileUploadSession(req.params.token);
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
  const session = getOrRestoreMobileUploadSession(req.params.token);
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
// MOBILE PATIENT WALK-IN SELF-INTAKE SESSIONS
// ==========================================
interface MobileWalkInSession {
  token: string;
  doctorId: string;
  doctorName: string;
  clinicName: string;
  mobile: string;
  countryCode: string;
  fullName: string;
  sex: string;
  age: string;
  weight: string;
  symptoms: string[];
  notes: string;
  noKnownAllergies: boolean;
  discountPanel: string;
  status: 'pending' | 'submitted';
  submittedAt?: string;
  createdAt: number;
  expiresAt: number;
}

const mobileWalkInSessions = new Map<string, MobileWalkInSession>();

function cleanupExpiredWalkInSessions() {
  const now = Date.now();
  for (const [token, session] of mobileWalkInSessions.entries()) {
    if (session.expiresAt < now) {
      mobileWalkInSessions.delete(token);
    }
  }
}

function getOrRestoreWalkInSession(token: string): MobileWalkInSession | undefined {
  let session = mobileWalkInSessions.get(token);
  if (session) {
    session.expiresAt = Date.now() + 24 * 60 * 60 * 1000;
    return session;
  }

  if (token && token.startsWith('wlk_')) {
    const parts = token.split('_');
    let doctorId = 'doc-demo-001';
    let doctorName = 'Dr. Demo';
    let clinicName = 'Cliniq Dermatology Center';
    let mobile = '';
    let countryCode = '+91';

    if (parts.length >= 4) {
      try {
        const decoded = JSON.parse(Buffer.from(parts.slice(3).join('_'), 'base64url').toString('utf8'));
        if (decoded.d) doctorId = decoded.d;
        if (decoded.n) doctorName = decoded.n;
        if (decoded.c) clinicName = decoded.c;
        if (decoded.m) mobile = decoded.m;
        if (decoded.cc) countryCode = decoded.cc;
      } catch {
        // ignore decode error
      }
    }

    const doc = db.findDoctorById(doctorId) || db.findDoctorById('doc-demo-001');
    const now = Date.now();
    session = {
      token,
      doctorId: doc?.id || doctorId,
      doctorName: doc?.name || doctorName,
      clinicName: doc?.clinicName || clinicName,
      mobile,
      countryCode,
      fullName: '',
      sex: 'Not specified',
      age: '',
      weight: '',
      symptoms: [],
      notes: '',
      noKnownAllergies: false,
      discountPanel: '',
      status: 'pending',
      createdAt: now,
      expiresAt: now + 24 * 60 * 60 * 1000
    };
    mobileWalkInSessions.set(token, session);
    return session;
  }

  return undefined;
}

// Create a mobile walk-in intake session (authenticated doctor)
app.post('/api/walkin/mobile-session', authMiddleware, (req: AuthenticatedRequest, res) => {
  cleanupExpiredWalkInSessions();
  const doctor = req.doctor!;
  const {
    mobile = '',
    countryCode = '+91',
    fullName = '',
    sex = 'Not specified',
    age = '',
    weight = '',
    symptoms = [],
    notes = '',
    noKnownAllergies = false,
    discountPanel = ''
  } = req.body || {};

  const cleanMobile = String(mobile).replace(/\D/g, '').slice(0, 10);
  const encodedMeta = Buffer.from(
    JSON.stringify({
      d: doctor.id,
      n: doctor.name,
      c: doctor.clinicName || 'Dermatology & Clinical Practice',
      m: cleanMobile,
      cc: String(countryCode || '+91')
    }),
    'utf8'
  ).toString('base64url');

  const token = `wlk_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}_${encodedMeta}`;
  const now = Date.now();
  const expiresAt = now + 24 * 60 * 60 * 1000; // 24 hours validity

  const session: MobileWalkInSession = {
    token,
    doctorId: doctor.id,
    doctorName: doctor.name,
    clinicName: doctor.clinicName || 'Dermatology & Clinical Practice',
    mobile: cleanMobile,
    countryCode: String(countryCode || '+91'),
    fullName: String(fullName || ''),
    sex: String(sex || 'Not specified'),
    age: String(age || ''),
    weight: String(weight || ''),
    symptoms: Array.isArray(symptoms) ? symptoms : [],
    notes: String(notes || ''),
    noKnownAllergies: Boolean(noKnownAllergies),
    discountPanel: String(discountPanel || ''),
    status: 'pending',
    createdAt: now,
    expiresAt
  };

  mobileWalkInSessions.set(token, session);

  res.status(201).json({
    session: {
      ...session,
      expiresAt: new Date(session.expiresAt).toISOString()
    }
  });
});

// Public endpoint: Get mobile walk-in intake session info (used by patient's mobile phone & doctor polling)
app.get('/api/walkin/mobile-session/:token', (req, res) => {
  cleanupExpiredWalkInSessions();
  const session = getOrRestoreWalkInSession(req.params.token);
  if (!session) {
    return res.status(404).json({
      error: 'This patient walk-in registration link has expired or is invalid. Please ask the clinic for a new link.'
    });
  }

  res.json({
    session: {
      ...session,
      expiresAt: new Date(session.expiresAt).toISOString()
    }
  });
});

// Public endpoint: Patient updates or submits their own walk-in details from their mobile phone
app.post('/api/walkin/mobile-session/:token/submit', (req, res) => {
  cleanupExpiredWalkInSessions();
  const session = getOrRestoreWalkInSession(req.params.token);
  if (!session) {
    return res.status(404).json({
      error: 'Walk-in session expired or invalid. Please ask the clinic for a fresh link.'
    });
  }

  const {
    mobile,
    countryCode,
    fullName,
    sex,
    age,
    weight,
    symptoms,
    notes,
    noKnownAllergies,
    discountPanel
  } = req.body || {};

  if (mobile !== undefined) session.mobile = String(mobile).replace(/\D/g, '').slice(0, 10);
  if (countryCode !== undefined) session.countryCode = String(countryCode);
  if (fullName !== undefined) session.fullName = String(fullName);
  if (sex !== undefined) session.sex = String(sex);
  if (age !== undefined) session.age = String(age);
  if (weight !== undefined) session.weight = String(weight);
  if (Array.isArray(symptoms)) session.symptoms = symptoms;
  if (notes !== undefined) session.notes = String(notes);
  if (noKnownAllergies !== undefined) session.noKnownAllergies = Boolean(noKnownAllergies);
  if (discountPanel !== undefined) session.discountPanel = String(discountPanel);

  session.status = 'submitted';
  session.submittedAt = new Date().toISOString();
  session.expiresAt = Date.now() + 24 * 60 * 60 * 1000;
  mobileWalkInSessions.set(session.token, session);

  res.json({
    session: {
      ...session,
      expiresAt: new Date(session.expiresAt).toISOString()
    }
  });
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

app.post('/api/ai/chat', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const { question, patientId, contextType } = req.body;
  if (!question) {
    return res.status(400).json({ error: 'Question is required' });
  }

  const allPatients = db.getPatients(undefined, req.doctor?.id);
  let patient = undefined;
  let history = undefined;

  if (patientId) {
    patient = db.findPatientById(patientId, req.doctor?.id);
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
  if (!question) {
    return res.status(400).json({ error: 'Question is required' });
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
      report: report || null,
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

  // Ensure AI Scan Credit Meter never blocks active clinical consultations
  let currentSub = db.getSubscription();
  if (currentSub.aiScansRemaining <= 0) {
    currentSub = db.topUpScanCredits(50, 0, 'UPI');
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
app.get('/api/dashboard/stats', authMiddleware, (req: AuthenticatedRequest, res) => {
  const doctorId = req.doctor?.id;
  const stats = db.getStats(doctorId);
  const recentVisits = db.getRecentVisits(8, doctorId);
  const recentPatients = db.getRecentPatients(8, doctorId);
  const revenue = db.getPracticeRevenueAnalytics(doctorId);
  res.json({ stats, recentVisits, recentPatients, revenue });
});

app.get('/api/dashboard/revenue', authMiddleware, (req: AuthenticatedRequest, res) => {
  const revenue = db.getPracticeRevenueAnalytics(req.doctor?.id);
  res.json({ revenue });
});

app.get('/api/audit', authMiddleware, (req: AuthenticatedRequest, res) => {
  const logs = db.getAuditLogs(100, req.doctor?.id);
  res.json({ logs });
});

// ==========================================
// FRONTEND INTEGRATION (DEV / PROD)
// ==========================================
async function startServer() {
  const distPath = path.resolve(process.cwd(), 'dist');
  const hasBuiltDist = fs.existsSync(path.join(distPath, 'index.html'));

  if (!isProduction || !hasBuiltDist) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(
      express.static(distPath, {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
          }
        },
      })
    );

    // Fallback for stale cached index.html requesting a previous deployment's /assets/index-*.js or .css hash
    app.get('/assets/:filename', (req, res, next) => {
      const requested = req.params.filename || '';
      const assetsDir = path.join(distPath, 'assets');
      if (!fs.existsSync(assetsDir)) return next();

      const files = fs.readdirSync(assetsDir);
      if (requested.startsWith('index-') && requested.endsWith('.js')) {
        const currentJs = files.find(f => f.startsWith('index-') && f.endsWith('.js'));
        if (currentJs) {
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
          return res.sendFile(path.join(assetsDir, currentJs));
        }
      }
      if (requested.startsWith('index-') && requested.endsWith('.css')) {
        const currentCss = files.find(f => f.startsWith('index-') && f.endsWith('.css'));
        if (currentCss) {
          res.setHeader('Content-Type', 'text/css; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
          return res.sendFile(path.join(assetsDir, currentCss));
        }
      }
      return res.status(404).end();
    });

    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
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
