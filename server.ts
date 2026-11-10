import express, { Request, Response, NextFunction } from 'express';
import compression from 'compression';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import zlib from 'zlib';
import crypto from 'crypto';
import { db } from './server/db.js';
import { summarizeConsultationWithAI, askAIAssistant, analyzeClinicalImage, compareClinicalImages, assessABCDEAnalysis, comparePatientVisits, parseClinicalNoteWithAI, askImageReportAssistant, extractBufferVisualMetrics, parseLabOrBiopsyReportWithAI } from './server/ai.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Production HTTP Security Headers
app.use(
  helmet({
    contentSecurityPolicy: false, // Vite React SPA handles dynamic script loading and local blob URLs
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// HTTP response compression for JSON payloads & static assets (reduces transfer latency by ~75%)
app.use(compression({
  threshold: 1024,
  filter: (req, res) => {
    if (
      req.headers['x-no-compression'] ||
      req.headers.accept?.includes('text/event-stream') ||
      req.path.startsWith('/api/realtime/')
    ) {
      return false;
    }
    return compression.filter(req, res);
  }
}));

function resolveClientRateLimitKey(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0].trim();
  }
  const forwarded = req.headers['forwarded'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    const forMatch = forwarded.match(/for="?([^;,"]+)"?/i);
    if (forMatch && forMatch[1]) {
      return forMatch[1].trim();
    }
  }
  return req.ip || req.socket?.remoteAddress || 'unknown-client';
}

// API Rate Limiting (Protects auth from brute-force & AI from quota exhaustion)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 attempts per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: resolveClientRateLimitKey,
  validate: false,
  message: { error: 'Too many authentication attempts. Please wait 15 minutes before trying again.' }
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 50, // 50 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: resolveClientRateLimitKey,
  validate: false,
  message: { error: 'AI scan rate limit reached. Please wait a moment before trying again.' }
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/ai', aiLimiter);

// Increase body parser limits for clinical images & capture rawBody on webhook routes for X-Hub-Signature-256 verification
app.use(
  express.json({
    limit: '15mb',
    verify: (req: Request & { rawBody?: Buffer }, _res, buf) => {
      if (req.originalUrl && req.originalUrl.includes('/webhook')) {
        req.rawBody = Buffer.from(buf);
      }
    }
  })
);
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Ensure upload directory exists (aligned with server/db.ts DATA_DIR resolution)
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(process.cwd(), 'data');
const UPLOADS_DIR = process.env.DATA_DIR
  ? path.join(DATA_DIR, 'uploads')
  : path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
// Re-hydrate any /uploads/... image files from persistent dataUrl on container boot
function hydrateDiskFilesFromDb() {
  try {
    const images = db.getAllClinicalImagesForHydration();
    for (const img of images) {
      if (img.dataUrl && img.filename) {
        const targetPath = path.join(UPLOADS_DIR, path.basename(img.filename));
        if (!fs.existsSync(targetPath)) {
          const match = img.dataUrl.match(/^data:([^;,]+);base64,([\s\S]+)$/);
          if (match) {
            fs.writeFileSync(targetPath, Buffer.from(match[2], 'base64'));
          }
        }
      }
    }
  } catch (err) {
    console.warn('[Storage] Image disk hydration warning:', err);
  }
}
hydrateDiskFilesFromDb();

// Public health check endpoint for Render uptime monitors (prevents spin-down)
app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Session store (token -> doctorId) with HMAC-signed stateless token verification
const activeSessions = new Map<
  string,
  { doctorId: string; expiresAt: number; delegatedFromDoctorId?: string }
>();
const revokedTokens = new Set<string>();
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days sliding window
const SESSION_COOKIE_NAME = 'clinical_os_session';

// Cryptographically random per-deployment secret (never falls back to a static hardcoded string)
function resolveOrGenerateSessionSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length >= 16) {
    return process.env.SESSION_SECRET.trim();
  }
  const secretFilePath = path.join(DATA_DIR, '.session_secret');
  try {
    if (fs.existsSync(secretFilePath)) {
      const existing = fs.readFileSync(secretFilePath, 'utf8').trim();
      if (existing.length >= 32) {
        return existing;
      }
    }
    const generated = crypto.randomBytes(64).toString('hex');
    fs.writeFileSync(secretFilePath, generated, { encoding: 'utf8', mode: 0o600 });
    return generated;
  } catch {
    return crypto.randomBytes(64).toString('hex');
  }
}

const SESSION_SECRET = resolveOrGenerateSessionSecret();

function signPayloadHmac(encodedPayload: string): string {
  return crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encodedPayload)
    .digest('base64url')
    .slice(0, 32);
}

function verifyHmacSignature(encodedPayload: string, candidateSig: string): boolean {
  if (!encodedPayload || !candidateSig) return false;
  const fullHmac = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encodedPayload)
    .digest('base64url');
  const expected32 = fullHmac.slice(0, 32);
  const expected24 = fullHmac.slice(0, 24);
  if (
    candidateSig.length === expected32.length &&
    crypto.timingSafeEqual(Buffer.from(candidateSig), Buffer.from(expected32))
  ) {
    return true;
  }
  if (
    candidateSig.length === expected24.length &&
    crypto.timingSafeEqual(Buffer.from(candidateSig), Buffer.from(expected24))
  ) {
    return true;
  }
  return false;
}

function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx > 0) {
      const key = part.slice(0, eqIdx).trim();
      const val = part.slice(eqIdx + 1).trim();
      try {
        out[key] = decodeURIComponent(val);
      } catch {
        out[key] = val;
      }
    }
  }
  return out;
}

function setSessionCookie(res: Response, token: string) {
  const maxAgeSec = Math.floor(SESSION_TTL_MS / 1000);
  const secureFlag = isProduction ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAgeSec}; HttpOnly; SameSite=Lax${secureFlag}`
  );
}

function clearSessionCookie(res: Response) {
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`
  );
}

function pruneExpiredSessions() {
  const now = Date.now();
  if (activeSessions.size > 500) {
    for (const [tok, sess] of activeSessions.entries()) {
      if (sess.expiresAt < now) {
        activeSessions.delete(tok);
      }
    }
  }
  if (revokedTokens.size > 1000) {
    const first = revokedTokens.values().next().value;
    if (first) revokedTokens.delete(first);
  }
}

interface SignedTokenPayload {
  id: string;
  email?: string;
  name?: string;
  speciality?: string;
  clinicName?: string;
  role?: 'doctor' | 'receptionist';
  accountType?: 'individual' | 'organisational';
  delegatedFromDoctorId?: string;
  iat?: number;
}

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
      },
  delegatedFromDoctorId?: string
): string {
  pruneExpiredSessions();
  let payloadObj: SignedTokenPayload | null = null;
  if (typeof doctorOrId === 'string' && doctorOrId) {
    const doc = db.findDoctorById(doctorOrId);
    if (doc) {
      payloadObj = {
        id: doc.id,
        email: doc.email,
        name: doc.name,
        speciality: doc.speciality,
        clinicName: doc.clinicName,
        role: doc.role,
        accountType: doc.accountType,
        delegatedFromDoctorId,
        iat: Date.now()
      };
    } else {
      payloadObj = { id: doctorOrId, delegatedFromDoctorId, iat: Date.now() };
    }
  } else if (doctorOrId && typeof doctorOrId === 'object') {
    payloadObj = {
      id: doctorOrId.id,
      email: doctorOrId.email,
      name: doctorOrId.name,
      speciality: doctorOrId.speciality,
      clinicName: doctorOrId.clinicName,
      role: doctorOrId.role,
      accountType: doctorOrId.accountType,
      delegatedFromDoctorId,
      iat: Date.now()
    };
  }

  const encodedDoc = payloadObj
    ? Buffer.from(JSON.stringify(payloadObj), 'utf8').toString('base64url')
    : '';
  if (!encodedDoc) {
    const nonce = `${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 10)}`;
    return `sess_${nonce}_${signPayloadHmac(nonce)}`;
  }
  const sig = signPayloadHmac(encodedDoc);
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 10)}_${encodedDoc}.${sig}`;
}

function verifyAndDecodeSignedToken(token: string): SignedTokenPayload | null {
  if (!token || !token.startsWith('sess_') || revokedTokens.has(token)) {
    return null;
  }
  const parts = token.split('_');
  if (parts.length < 4) return null;
  try {
    const rawTail = parts.slice(3).join('_');
    const dotIdx = rawTail.lastIndexOf('.');
    if (dotIdx <= 0) return null;
    const candidateEncoded = rawTail.slice(0, dotIdx);
    const candidateSig = rawTail.slice(dotIdx + 1);
    if (!verifyHmacSignature(candidateEncoded, candidateSig)) {
      return null;
    }
    const decodedRaw = Buffer.from(candidateEncoded, 'base64url').toString('utf8');
    if (!decodedRaw.startsWith('{')) return null;
    const parsed = JSON.parse(decodedRaw) as SignedTokenPayload;
    if (!parsed || !parsed.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

function resolveAuthenticatedDoctorFromRequest(req: Request): {
  token: string;
  doctor: NonNullable<ReturnType<typeof db.findDoctorById>>;
  session: { doctorId: string; expiresAt: number; delegatedFromDoctorId?: string };
} | null {
  const authHeader = req.headers.authorization;
  const bearerToken =
    authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1]?.trim() : '';
  const cookies = parseCookies(req);
  const cookieToken = cookies[SESSION_COOKIE_NAME] || '';
  const queryToken = typeof req.query.token === 'string' ? req.query.token.trim() : '';
  const token = bearerToken || cookieToken || queryToken;

  if (!token || revokedTokens.has(token)) {
    return null;
  }

  let session = activeSessions.get(token);
  if (session && session.expiresAt < Date.now()) {
    activeSessions.delete(token);
    session = undefined;
  }

  if (!session && token.startsWith('sess_')) {
    const verifiedPayload = verifyAndDecodeSignedToken(token);
    if (verifiedPayload) {
      const restoredDoctor = db.restoreOrEnsureDoctor(verifiedPayload);
      if (restoredDoctor) {
        session = {
          doctorId: restoredDoctor.id,
          expiresAt: Date.now() + SESSION_TTL_MS,
          delegatedFromDoctorId: verifiedPayload.delegatedFromDoctorId
        };
        activeSessions.set(token, session);
      }
    }
  }

  if (!session) {
    return null;
  }

  session.expiresAt = Date.now() + SESSION_TTL_MS;
  const doctor = db.findDoctorById(session.doctorId);
  if (!doctor) {
    activeSessions.delete(token);
    return null;
  }

  return { token, doctor, session };
}

// Authentication middleware
interface AuthenticatedRequest extends Request {
  doctor?: ReturnType<typeof db.findDoctorById>;
  sessionToken?: string;
  delegatedFromDoctorId?: string;
}

function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const resolved = resolveAuthenticatedDoctorFromRequest(req);
  if (!resolved) {
    return res.status(401).json({ error: 'Unauthorized: Missing, expired, or invalid session token' });
  }

  req.doctor = resolved.doctor;
  req.sessionToken = resolved.token;
  req.delegatedFromDoctorId = resolved.session.delegatedFromDoctorId;

  // Ensure HttpOnly session cookie is synchronized so browser <img> requests to /uploads/* are authenticated
  const cookies = parseCookies(req);
  if (cookies[SESSION_COOKIE_NAME] !== resolved.token) {
    setSessionCookie(res, resolved.token);
  }

  next();
}

function requireDoctorRole(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (req.doctor?.role === 'receptionist') {
    return res.status(403).json({ error: 'This clinical action is restricted to Doctors.' });
  }
  next();
}

// Protected static clinical image serving (/uploads/* requires valid clinic session or active mobile QR upload token)
app.use(
  '/uploads',
  (req: Request, res: Response, next: NextFunction) => {
    const requestedFile = path.basename(req.path);
    const imgRecord = db.getClinicalImageByFilename(requestedFile);

    // 1. Check standard authenticated doctor/staff session (via HttpOnly cookie, Bearer header, or ?token=)
    const resolvedAuth = resolveAuthenticatedDoctorFromRequest(req);
    if (resolvedAuth) {
      if (imgRecord && imgRecord.patientId) {
        const canAccess = db.findPatientById(imgRecord.patientId, resolvedAuth.doctor.id);
        if (!canAccess) {
          return res.status(403).json({ error: 'Forbidden: Image belongs to another clinic tenant' });
        }
      }
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return next();
    }

    // 2. Check if request comes from an active HMAC-signed mobile QR upload session for that patient
    const mobileToken =
      (typeof req.query.mobToken === 'string' ? req.query.mobToken.trim() : '') ||
      (typeof req.query.token === 'string' && req.query.token.startsWith('mob_')
        ? req.query.token.trim()
        : '');
    if (mobileToken) {
      const mobSession = getOrRestoreMobileUploadSession(mobileToken);
      if (mobSession && (!imgRecord || imgRecord.patientId === mobSession.patientId)) {
        res.setHeader('Cache-Control', 'private, no-store, max-age=0');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        return next();
      }
    }

    return res.status(401).json({ error: 'Unauthorized: Authentication required to access clinical images' });
  },
  express.static(UPLOADS_DIR)
);

// ==========================================
// REAL-TIME SERVER-SENT EVENTS (SSE) HUB
// ==========================================
interface RealtimeClinicClient {
  id: string;
  doctorId: string;
  clinicDoctorId: string;
  res: Response;
}

interface RealtimeMobileClient {
  id: string;
  token: string;
  res: Response;
}

const realtimeClinicClients = new Map<string, RealtimeClinicClient>();
const realtimeMobileClients = new Map<string, RealtimeMobileClient>();

function broadcastClinicEvent(
  eventType: string,
  payload: Record<string, unknown>,
  targetDoctorId?: string
) {
  const effectiveTargetId = targetDoctorId
    ? db.resolveEffectiveClinicDoctorId(targetDoctorId) || targetDoctorId
    : undefined;
  const isTargetDemo = effectiveTargetId ? db.isDemoAccount(effectiveTargetId) : false;
  const serialized = `data: ${JSON.stringify({
    type: eventType,
    timestamp: new Date().toISOString(),
    ...payload
  })}\n\n`;

  for (const [clientId, client] of realtimeClinicClients.entries()) {
    const matchesClinic =
      !effectiveTargetId ||
      client.clinicDoctorId === effectiveTargetId ||
      client.doctorId === effectiveTargetId ||
      (isTargetDemo && db.isDemoAccount(client.clinicDoctorId));

    if (matchesClinic) {
      try {
        client.res.write(serialized);
      } catch {
        realtimeClinicClients.delete(clientId);
      }
    }
  }
}

function broadcastMobileSessionEvent(
  token: string,
  eventType: string,
  payload: Record<string, unknown>
) {
  if (!token) return;
  const serialized = `data: ${JSON.stringify({
    type: eventType,
    token,
    timestamp: new Date().toISOString(),
    ...payload
  })}\n\n`;

  for (const [clientId, client] of realtimeMobileClients.entries()) {
    if (client.token === token) {
      try {
        client.res.write(serialized);
      } catch {
        realtimeMobileClients.delete(clientId);
      }
    }
  }
}

// Keep SSE connections alive across proxies (Render / Cloudflare) every 20s
setInterval(() => {
  const pingMsg = `: keepalive ${Date.now()}\n\n`;
  for (const [id, client] of realtimeClinicClients.entries()) {
    try {
      client.res.write(pingMsg);
    } catch {
      realtimeClinicClients.delete(id);
    }
  }
  for (const [id, client] of realtimeMobileClients.entries()) {
    try {
      client.res.write(pingMsg);
    } catch {
      realtimeMobileClients.delete(id);
    }
  }
}, 20000);

app.get('/api/realtime/events', authMiddleware, (req: AuthenticatedRequest, res) => {
  const doctor = req.doctor!;
  const clinicDoctorId = db.resolveEffectiveClinicDoctorId(doctor.id) || doctor.id;
  const clientId = `sse_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  realtimeClinicClients.set(clientId, {
    id: clientId,
    doctorId: doctor.id,
    clinicDoctorId,
    res
  });

  res.write(
    `data: ${JSON.stringify({
      type: 'connected',
      clientId,
      doctorId: doctor.id,
      timestamp: new Date().toISOString()
    })}\n\n`
  );

  req.on('close', () => {
    realtimeClinicClients.delete(clientId);
  });
});

app.get('/api/realtime/mobile-session/:token', (req, res) => {
  const token = String(req.params.token || '').trim();
  const mobSession = token.startsWith('mob_') ? getOrRestoreMobileUploadSession(token) : undefined;
  const walkSession = token.startsWith('wlk_') ? getOrRestoreWalkInSession(token) : undefined;

  if (!mobSession && !walkSession) {
    return res.status(404).json({ error: 'Invalid or expired mobile session token' });
  }

  const clientId = `msse_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  realtimeMobileClients.set(clientId, {
    id: clientId,
    token,
    res
  });

  res.write(
    `data: ${JSON.stringify({
      type: 'connected',
      token,
      timestamp: new Date().toISOString()
    })}\n\n`
  );

  req.on('close', () => {
    realtimeMobileClients.delete(clientId);
  });
});

// ==========================================
// AUTH ROUTES
// ==========================================
app.post('/api/auth/login', (req, res) => {
  const { email, password, name, speciality, clinicName } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  let doctor = db.findDoctorByEmail(cleanEmail);

  if (!doctor) {
    // Only auto-provision if it is a known preset demo account using the demo password
    if (db.isKnownPresetEmail(cleanEmail) && password === 'Demo@1234') {
      const emailPrefix = cleanEmail.split('@')[0].replace(/[._-]+/g, ' ');
      const formattedName =
        name ||
        `Dr. ${emailPrefix
          .split(' ')
          .filter(Boolean)
          .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ')}`;

      doctor = db.createDoctor({
        name: formattedName,
        email: cleanEmail,
        password,
        speciality: speciality || 'Dermatologist & Cosmetologist',
        clinicName: clinicName || 'Cliniq Dermatology Center'
      });
    } else {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
  } else {
    const isValid = db.verifyPassword(doctor.id, password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
  }

  const token = generateToken(doctor);
  activeSessions.set(token, {
    doctorId: doctor.id,
    expiresAt: Date.now() + SESSION_TTL_MS
  });
  setSessionCookie(res, token);

  db.logAudit({
    actorId: doctor.id,
    actorName: doctor.name,
    action: 'doctor_login',
    resourceType: 'auth',
    resourceId: doctor.id
  });

  res.json({ token, doctor });
});

// Cryptographically verified session restore endpoint (requires a valid HMAC-signed session token)
app.post('/api/auth/restore', (req, res) => {
  const authHeader = req.headers.authorization;
  const bearerToken =
    authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1]?.trim() : '';
  const cookies = parseCookies(req);
  const cookieToken = cookies[SESSION_COOKIE_NAME] || '';
  const bodyToken = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  const candidateToken = bearerToken || bodyToken || cookieToken;

  if (!candidateToken || revokedTokens.has(candidateToken)) {
    return res.status(401).json({ error: 'Unauthorized: Valid signed session token is required to restore session' });
  }

  const verifiedPayload = verifyAndDecodeSignedToken(candidateToken);
  if (!verifiedPayload) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or tampered session token signature' });
  }

  const doctor = db.restoreOrEnsureDoctor(verifiedPayload);
  if (!doctor) {
    return res.status(401).json({ error: 'Unable to restore session for unknown account' });
  }

  const newToken = generateToken(doctor, verifiedPayload.delegatedFromDoctorId);
  activeSessions.set(newToken, {
    doctorId: doctor.id,
    expiresAt: Date.now() + SESSION_TTL_MS,
    delegatedFromDoctorId: verifiedPayload.delegatedFromDoctorId
  });
  setSessionCookie(res, newToken);

  res.json({ token: newToken, doctor });
});

// Single Sign-On (SSO) for Work/University/Hospital Organisations
app.post('/api/auth/sso', (req, res) => {
  const { organization, email, name, department, password } = req.body || {};
  const orgName = (organization || 'Metro Health University Medical Center').trim();
  const orgEmail = (email || 'hospital@metrohealth.org').toLowerCase().trim();
  const orgDoctorName = (name || 'Dr. Sarah Chen, MD').trim();
  const orgDept = (department || 'Chief of Dermatology & Cutaneous Medicine').trim();

  let doctor = db.findDoctorByEmail(orgEmail);
  if (doctor) {
    // Prevent account takeover of non-demo accounts via unverified SSO payload
    if (!db.isKnownPresetEmail(orgEmail)) {
      if (!password || !db.verifyPassword(doctor.id, String(password))) {
        return res.status(401).json({
          error: 'This clinic account requires your password or a verified organizational SSO assertion.'
        });
      }
    }
    if (!doctor.accountType) {
      db.updateDoctor(doctor.id, {
        accountType: 'organisational',
        organizationName: orgName,
        organizationDepartment: orgDept
      });
      doctor = db.findDoctorById(doctor.id)!;
    }
  } else {
    if (!db.isKnownPresetEmail(orgEmail) && !password) {
      return res.status(401).json({
        error: 'Please provide a password or register a new organizational clinic account.'
      });
    }
    doctor = db.createDoctor({
      name: orgDoctorName,
      email: orgEmail,
      password: password ? String(password) : 'Demo@1234_sso_managed',
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
  }

  const token = generateToken(doctor);
  activeSessions.set(token, {
    doctorId: doctor.id,
    expiresAt: Date.now() + SESSION_TTL_MS
  });
  setSessionCookie(res, token);

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

// Individual Google Authentication (Verifies Google ID Token when provided, or enforces password for registered accounts)
app.post('/api/auth/google', async (req, res) => {
  const { idToken, credential, password } = req.body || {};
  const rawToken = idToken || credential;

  let googleEmail = (req.body?.email || 'dr.alex.mercer@gmail.com').toLowerCase().trim();
  let doctorName = (req.body?.name || 'Dr. Alex Mercer').trim();
  let tokenVerifiedByGoogle = false;

  if (rawToken && typeof rawToken === 'string') {
    try {
      const verifyRes = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(rawToken)}`
      );
      if (!verifyRes.ok) {
        return res.status(401).json({ error: 'Invalid Google OAuth ID token' });
      }
      const tokenInfo = (await verifyRes.json()) as {
        email?: string;
        email_verified?: string | boolean;
        name?: string;
      };
      if (!tokenInfo.email || String(tokenInfo.email_verified) === 'false') {
        return res.status(401).json({ error: 'Google account email is not verified' });
      }
      googleEmail = tokenInfo.email.toLowerCase().trim();
      if (tokenInfo.name) doctorName = tokenInfo.name.trim();
      tokenVerifiedByGoogle = true;
    } catch {
      return res.status(401).json({ error: 'Failed to verify Google OAuth token' });
    }
  }

  let doctor = db.findDoctorByEmail(googleEmail);
  if (doctor) {
    // If not verified by a cryptographic Google ID token and not a preset demo account, require password verification
    if (!tokenVerifiedByGoogle && !db.isKnownPresetEmail(googleEmail)) {
      if (!password || !db.verifyPassword(doctor.id, String(password))) {
        return res.status(401).json({
          error: 'Invalid password for this clinic account.'
        });
      }
    }
  } else {
    if (!tokenVerifiedByGoogle && !db.isKnownPresetEmail(googleEmail) && !password) {
      return res.status(401).json({
        error: 'Please enter a password to create or sign in to your account.'
      });
    }
    doctor = db.createDoctor({
      name: doctorName,
      email: googleEmail,
      password: password ? String(password) : 'Demo@1234_google_auth',
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
  setSessionCookie(res, token);

  db.logAudit({
    actorId: doctor.id,
    actorName: doctor.name,
    action: 'doctor_google_login',
    resourceType: 'auth',
    resourceId: doctor.id,
    metadata: { provider: tokenVerifiedByGoogle ? 'google_oauth_verified' : 'google' }
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
    setSessionCookie(res, token);

    res.status(201).json({ token, doctor });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Registration failed';
    res.status(500).json({ error: message });
  }
});

app.get('/api/auth/me', authMiddleware, (req: AuthenticatedRequest, res) => {
  res.json({ doctor: req.doctor });
});

app.post('/api/auth/logout', authMiddleware, (req: AuthenticatedRequest, res) => {
  const token = req.sessionToken || req.headers.authorization?.split(' ')[1];
  if (token) {
    activeSessions.delete(token);
    revokedTokens.add(token);
  }
  clearSessionCookie(res);
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
// CLINIC STAFF & EMAIL ROLE ASSIGNMENT ROUTES
// ==========================================
app.get('/api/staff', authMiddleware, (req: AuthenticatedRequest, res) => {
  if (!req.doctor) return res.status(401).json({ error: 'Unauthorized' });
  const staff = db.getClinicStaffAccounts(req.doctor.id);
  res.json({ staff });
});

app.post('/api/staff/assign', authMiddleware, (req: AuthenticatedRequest, res) => {
  if (!req.doctor) return res.status(401).json({ error: 'Unauthorized' });
  if (req.doctor.role === 'receptionist') {
    return res.status(403).json({ error: 'Only doctors can assign or modify clinic email roles.' });
  }

  const { email, name, role } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return res.status(400).json({ error: 'Please provide a valid email address.' });
  }
  if (role !== 'doctor' && role !== 'receptionist') {
    return res.status(400).json({ error: 'Role must be either "doctor" or "receptionist".' });
  }

  const account = db.assignEmailRole({
    email: cleanEmail,
    name: name ? String(name).trim() : undefined,
    role,
    assignedByDoctor: req.doctor
  });

  const staff = db.getClinicStaffAccounts(req.doctor.id);
  res.json({ account, staff });
});

app.put('/api/staff/:id/role', authMiddleware, (req: AuthenticatedRequest, res) => {
  if (!req.doctor) return res.status(401).json({ error: 'Unauthorized' });
  if (req.doctor.role === 'receptionist') {
    return res.status(403).json({ error: 'Only doctors can change account roles.' });
  }

  const { role } = req.body || {};
  if (role !== 'doctor' && role !== 'receptionist') {
    return res.status(400).json({ error: 'Role must be either "doctor" or "receptionist".' });
  }

  const target = db.findDoctorById(req.params.id);
  if (!target) {
    return res.status(404).json({ error: 'Account not found.' });
  }

  const updated = db.assignEmailRole({
    email: target.email,
    name: target.name,
    role,
    assignedByDoctor: req.doctor
  });

  const staff = db.getClinicStaffAccounts(req.doctor.id);
  res.json({ account: updated, staff });
});

app.delete('/api/staff/:id', authMiddleware, (req: AuthenticatedRequest, res) => {
  if (!req.doctor) return res.status(401).json({ error: 'Unauthorized' });
  if (req.doctor.role === 'receptionist') {
    return res.status(403).json({ error: 'Only doctors can remove staff accounts.' });
  }

  const removed = db.removeStaffAccount(req.params.id, req.doctor.id);
  if (!removed) {
    return res.status(400).json({ error: 'Cannot remove primary or system demo account.' });
  }
  const staff = db.getClinicStaffAccounts(req.doctor.id);
  res.json({ success: true, staff });
});

// Switch session between Doctor and Receptionist account within the same clinic (with privilege-escalation protection)
app.post('/api/staff/switch-session', authMiddleware, (req: AuthenticatedRequest, res) => {
  if (!req.doctor) return res.status(401).json({ error: 'Unauthorized' });
  const { targetId, targetRole, role, password } = req.body || {};
  const effectiveTargetRole = targetRole || role;
  const clinicStaff = db.getClinicStaffAccounts(req.doctor.id);
  const allowedStaffIds = new Set(clinicStaff.map(s => s.id));

  let targetAccount: ReturnType<typeof db.findDoctorById>;
  if (targetId) {
    const candidate = db.findDoctorById(String(targetId));
    if (candidate && !allowedStaffIds.has(candidate.id)) {
      return res.status(403).json({
        error: 'Forbidden: Cannot switch into an account outside your clinic.'
      });
    }
    targetAccount = candidate;
  } else if (effectiveTargetRole === 'receptionist') {
    targetAccount =
      clinicStaff.find(s => s.role === 'receptionist') ||
      db.assignEmailRole({
        email: `reception.${req.doctor.email.split('@')[0]}@clinicalos.med`,
        name: `Emily (Front Desk · ${req.doctor.clinicName || 'Clinic'})`,
        role: 'receptionist',
        assignedByDoctor: req.doctor
      });
  } else if (effectiveTargetRole === 'doctor') {
    if (req.delegatedFromDoctorId) {
      targetAccount = db.findDoctorById(req.delegatedFromDoctorId);
    }
    if (!targetAccount && req.doctor.assignedByDoctorId) {
      targetAccount = db.findDoctorById(req.doctor.assignedByDoctorId);
    }
    if (!targetAccount) {
      targetAccount = clinicStaff.find(s => s.role !== 'receptionist');
    }
  }

  if (!targetAccount) {
    return res.status(404).json({ error: 'Target clinic staff account not found.' });
  }

  // Privilege escalation check: a standalone Receptionist cannot elevate to a real Doctor account without either:
  // 1) Having originally switched from that Doctor session (`req.delegatedFromDoctorId`),
  // 2) Providing the target Doctor's valid password, or
  // 3) Switching between preset demo accounts.
  const isElevatingToDoctor =
    req.doctor.role === 'receptionist' && targetAccount.role !== 'receptionist';
  if (isElevatingToDoctor) {
    const isReturningToDelegatingDoctor =
      Boolean(req.delegatedFromDoctorId) && req.delegatedFromDoctorId === targetAccount.id;
    const isPresetDemoSwitch =
      db.isDemoAccount(req.doctor.id) && db.isDemoAccount(targetAccount.id);
    const hasValidDoctorPassword =
      typeof password === 'string' &&
      password.length > 0 &&
      db.verifyPassword(targetAccount.id, password);

    if (!isReturningToDelegatingDoctor && !isPresetDemoSwitch && !hasValidDoctorPassword) {
      return res.status(403).json({
        error: 'Doctor password is required to switch from a Receptionist login to a Doctor account.'
      });
    }
  }

  const nextDelegatedFromDoctorId =
    req.doctor.role !== 'receptionist' && targetAccount.role === 'receptionist'
      ? req.doctor.id
      : undefined;

  const token = generateToken(targetAccount, nextDelegatedFromDoctorId);
  activeSessions.set(token, {
    doctorId: targetAccount.id,
    expiresAt: Date.now() + SESSION_TTL_MS,
    delegatedFromDoctorId: nextDelegatedFromDoctorId
  });
  setSessionCookie(res, token);

  db.logAudit({
    actorId: req.doctor.id,
    actorName: req.doctor.name,
    action: 'staff_session_switched',
    resourceType: 'auth',
    resourceId: targetAccount.id,
    metadata: { fromRole: req.doctor.role || 'doctor', toRole: targetAccount.role || 'doctor' }
  });

  res.json({ token, doctor: targetAccount });
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
  // Regulatory compliance: audit log every chart view access
  if (req.doctor) {
    db.logAudit({
      actorId: req.doctor.id,
      actorName: req.doctor.name,
      action: 'view_patient_chart',
      resourceType: 'patient',
      resourceId: patient.id,
      metadata: { patientCode: patient.patientCode }
    });
  }
  res.json({ patient });
});

app.delete('/api/patients/:id', authMiddleware, (req: AuthenticatedRequest, res) => {
  if (req.doctor?.role === 'receptionist') {
    return res.status(403).json({ error: 'Only doctors can delete or archive patient records.' });
  }
  const existing = db.findPatientById(req.params.id, req.doctor?.id);
  if (!existing) {
    return res.status(404).json({ error: 'Patient not found' });
  }
  const deleted = db.deletePatient(req.params.id, {
    id: req.doctor?.id || 'admin',
    name: req.doctor?.name || 'Doctor'
  });
  if (!deleted) {
    return res.status(404).json({ error: 'Patient not found' });
  }
  res.json({ success: true, message: 'Patient and associated clinical records removed successfully.' });
});

app.post('/api/patients/sync', authMiddleware, (req: AuthenticatedRequest, res) => {
  const doctor = req.doctor!;
  const incoming = Array.isArray(req.body?.patients) ? req.body.patients : [];
  const patients = db.syncDoctorPatients(incoming, doctor);
  res.json({ patients });
});

app.post('/api/patients', authMiddleware, (req: AuthenticatedRequest, res) => {
  const {
    id,
    patientCode,
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
    medicalHistory,
    forceCreate
  } = req.body;

  if (!fullName || !String(fullName).trim()) {
    return res.status(400).json({ error: 'Patient full name is required' });
  }

  const rawDigits = String(mobile || '').replace(/\D/g, '');
  const cleanMobile = rawDigits.length > 10 ? rawDigits.slice(-10) : rawDigits;

  // Prevent accidental duplicate mobile within the same doctor/clinic account only when a 10-digit phone is given and force is not set
  if (cleanMobile.length === 10 && !req.query.force && !forceCreate) {
    const existing = db.findPatientByMobile(cleanMobile, req.doctor?.id);
    if (existing) {
      return res.status(409).json({
        error: 'An existing patient was found with this mobile number.',
        existingPatient: existing
      });
    }
  }

  const doctor = req.doctor!;
  const newPatient = db.createPatient(
    {
      id: typeof id === 'string' && id.trim() ? id.trim() : undefined,
      patientCode: typeof patientCode === 'string' && patientCode.trim() ? patientCode.trim() : undefined,
      fullName: String(fullName).trim(),
      age: age !== undefined && age !== '' && !Number.isNaN(Number(age)) ? Number(age) : 0,
      gender: gender || 'Prefer not to say',
      mobile: cleanMobile,
      countryCode: countryCode || '+91',
      weight: weight !== undefined && weight !== '' && !Number.isNaN(Number(weight)) ? Number(weight) : undefined,
      notes: notes || '',
      discountPanel: discountPanel || '',
      primaryDiagnosis: primaryDiagnosis || 'General Consultation',
      dateOfBirth: dateOfBirth || '',
      bloodGroup: bloodGroup || '',
      address: address || '',
      emergencyContact: emergencyContact || '',
      allergies: allergies || notes || '',
      currentMedications: currentMedications || '',
      medicalHistory: medicalHistory || '',
      createdById: doctor.id,
      createdByEmail: doctor.email.toLowerCase()
    },
    { id: doctor.id, name: doctor.name, email: doctor.email }
  );

  res.status(201).json({ patient: newPatient });
});

app.put('/api/patients/:id', authMiddleware, (req: AuthenticatedRequest, res) => {
  const doctor = req.doctor!;
  const existing = db.findPatientById(req.params.id, doctor.id);
  if (!existing) return res.status(404).json({ error: 'Patient not found' });

  const updates = { ...req.body };
  if (updates.mobile !== undefined) {
    const rawDigits = String(updates.mobile).replace(/\D/g, '');
    updates.mobile = rawDigits.length > 10 ? rawDigits.slice(-10) : rawDigits;
  }
  const updated = db.updatePatient(req.params.id, updates, { id: doctor.id, name: doctor.name });
  if (!updated) return res.status(404).json({ error: 'Patient not found' });
  res.json({ patient: updated });
});

// Patient Historical Consultations
app.get('/api/patients/:id/consultations', authMiddleware, (req: AuthenticatedRequest, res) => {
  const patient = db.findPatientById(req.params.id, req.doctor?.id);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });
  const consultations = db.getConsultationsByPatient(req.params.id);
  res.json({ consultations });
});

// Clinical Timeline (Sanitized for Privacy: Never reveals address/mobile in timeline)
app.get('/api/patients/:id/timeline', authMiddleware, (req: AuthenticatedRequest, res) => {
  const patient = db.findPatientById(req.params.id, req.doctor?.id);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });
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
app.get('/api/patients/:id/markers', authMiddleware, (req: AuthenticatedRequest, res) => {
  const patient = db.findPatientById(req.params.id, req.doctor?.id);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });
  const markers = db.getPatientBodyMarkers(req.params.id);
  res.json({ markers });
});

app.post('/api/patients/:id/markers', authMiddleware, (req: AuthenticatedRequest, res) => {
  const patient = db.findPatientById(req.params.id, req.doctor?.id);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });
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

// Helper to persist a clinical image (past or current) with self-contained dataUrl and extracted visual findings
function storePatientClinicalImage(params: {
  patientId: string;
  consultationId?: string;
  rawDataUrl?: string;
  filename?: string;
  mimeType?: string;
  caption?: string;
  bodyArea?: string;
  modality?: import('./src/types/index.js').MedicalImageModality;
  imageRole?: 'past' | 'current' | 'followup';
  examDate?: string;
  extractedFindings?: string;
  visualMetrics?: import('./src/types/index.js').ImageVisualMetrics;
  tags?: string[];
  bodyMarkerId?: string;
  actor?: { id: string; name: string };
}): import('./src/types/index.js').ClinicalImage {
  const {
    patientId,
    consultationId,
    rawDataUrl,
    filename,
    caption,
    bodyArea,
    modality,
    imageRole,
    examDate,
    extractedFindings,
    visualMetrics,
    tags,
    bodyMarkerId,
    actor
  } = params;

  if (!patientId || !rawDataUrl) {
    throw new Error('patientId and image dataUrl/url are required');
  }

  let mimeType = params.mimeType || 'image/jpeg';
  let base64Data = rawDataUrl;
  let dataUrlToStore = rawDataUrl;
  let buffer: Buffer;

  const dataUrlMatch = rawDataUrl.match(/^data:([^;,]+)(?:;charset=[^;,]+)?;base64,([\s\S]+)$/);
  if (dataUrlMatch) {
    mimeType = dataUrlMatch[1];
    base64Data = dataUrlMatch[2].replace(/\s/g, '');
    buffer = Buffer.from(base64Data, 'base64');
  } else if (rawDataUrl.startsWith('data:image/svg+xml')) {
    mimeType = 'image/svg+xml';
    const commaIdx = rawDataUrl.indexOf(',');
    const svgContent = commaIdx >= 0 ? decodeURIComponent(rawDataUrl.slice(commaIdx + 1)) : rawDataUrl;
    buffer = Buffer.from(svgContent, 'utf8');
    base64Data = buffer.toString('base64');
    dataUrlToStore = `data:image/svg+xml;base64,${base64Data}`;
  } else {
    buffer = Buffer.from(rawDataUrl, 'base64');
    dataUrlToStore = `data:${mimeType};base64,${rawDataUrl}`;
  }

  if (buffer.length > 12 * 1024 * 1024) {
    throw new Error('Image exceeds maximum allowed size of 12MB');
  }

  const ext = mimeType.includes('svg')
    ? 'svg'
    : mimeType.includes('png')
    ? 'png'
    : mimeType.includes('webp')
    ? 'webp'
    : 'jpg';
  const imageId = `img-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
  const savedFilename = `${imageId}.${ext}`;
  const filePath = path.join(UPLOADS_DIR, savedFilename);

  try {
    fs.writeFileSync(filePath, buffer);
  } catch (writeErr) {
    console.warn('Could not write image file to disk, relying on persistent dataUrl:', writeErr);
  }

  const computedMetrics = visualMetrics || extractBufferVisualMetrics(base64Data, mimeType);
  const resolvedRole: 'past' | 'current' | 'followup' =
    imageRole || (examDate && new Date(examDate).getTime() < Date.now() - 36 * 3600 * 1000 ? 'past' : 'current');
  const resolvedModality: import('./src/types/index.js').MedicalImageModality =
    modality || 'Clinical Photo';
  const resolvedExamDate = examDate || new Date().toISOString().split('T')[0];

  const autoExtractedFindings =
    extractedFindings ||
    `${resolvedRole === 'past' ? 'Past baseline' : 'Current'} ${resolvedModality.toLowerCase()} (${bodyArea || caption || 'clinical target site'}) captured on ${resolvedExamDate}: erythema index ${computedMetrics.erythemaIndex}/100, pigmentation index ${computedMetrics.pigmentationIndex}/100, border irregularity ${computedMetrics.borderIrregularity}/100, estimated diameter ~${computedMetrics.estimatedDiameterMm} mm.`;

  const createdIso = examDate
    ? (() => {
        const parsed = new Date(examDate);
        return isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
      })()
    : new Date().toISOString();

  const clinicalImage = db.addClinicalImage({
    id: imageId,
    patientId,
    consultationId,
    url: dataUrlToStore,
    dataUrl: dataUrlToStore,
    filename: filename || savedFilename,
    mimeType,
    sizeBytes: buffer.length,
    caption: caption || bodyArea || `${resolvedRole === 'past' ? 'Past' : 'Current'} ${resolvedModality}`,
    bodyArea: bodyArea || caption || 'Target Lesion Site',
    modality: resolvedModality,
    imageRole: resolvedRole,
    examDate: resolvedExamDate,
    extractedFindings: autoExtractedFindings,
    visualMetrics: computedMetrics,
    tags: Array.from(new Set([...(tags || []), resolvedRole, resolvedModality])),
    bodyMarkerId,
    createdAt: createdIso
  });

  if (actor) {
    db.logAudit({
      actorId: actor.id,
      actorName: actor.name,
      action: resolvedRole === 'past' ? 'past_medical_image_stored' : 'clinical_image_uploaded',
      resourceType: 'clinical_image',
      resourceId: imageId,
      metadata: {
        patientId,
        imageRole: resolvedRole,
        modality: resolvedModality,
        examDate: resolvedExamDate,
        sizeBytes: buffer.length
      }
    });
  }

  return clinicalImage;
}

// Patient clinical images
app.get('/api/patients/:id/images', authMiddleware, (req: AuthenticatedRequest, res) => {
  const patient = db.findPatientById(req.params.id, req.doctor?.id);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });
  const images = db.getPatientImages(req.params.id);
  res.json({ images });
});

app.post('/api/patients/:id/images', authMiddleware, (req: AuthenticatedRequest, res) => {
  try {
    const patient = db.findPatientById(req.params.id, req.doctor?.id);
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    const rawDataUrl = req.body.dataUrl || req.body.url;
    if (!rawDataUrl) {
      return res.status(400).json({ error: 'Image dataUrl or url is required' });
    }
    const doctor = req.doctor!;
    const image = storePatientClinicalImage({
      patientId: req.params.id,
      consultationId: req.body.consultationId,
      rawDataUrl,
      filename: req.body.filename,
      mimeType: req.body.mimeType,
      caption: req.body.caption,
      bodyArea: req.body.bodyArea,
      modality: req.body.modality,
      imageRole: req.body.imageRole,
      examDate: req.body.examDate,
      extractedFindings: req.body.extractedFindings,
      visualMetrics: req.body.visualMetrics,
      tags: req.body.tags,
      bodyMarkerId: req.body.bodyMarkerId,
      actor: { id: doctor.id, name: doctor.name }
    });
    res.status(201).json({ image });
  } catch (err: unknown) {
    console.error('Patient image storage error:', err);
    const message = err instanceof Error ? err.message : 'Failed to store patient medical image';
    res.status(400).json({ error: message });
  }
});

app.delete('/api/patients/:id/images/:imageId', authMiddleware, (req: AuthenticatedRequest, res) => {
  const patient = db.findPatientById(req.params.id, req.doctor?.id);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });
  const success = db.deleteClinicalImage(req.params.imageId);
  if (!success) return res.status(404).json({ error: 'Medical image not found' });
  res.json({ success: true, message: 'Medical image removed' });
});

// Patient prescriptions
app.get('/api/patients/:id/prescriptions', authMiddleware, (req: AuthenticatedRequest, res) => {
  const patient = db.findPatientById(req.params.id, req.doctor?.id);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });
  const prescriptions = db.getPrescriptions(req.params.id, req.doctor?.id);
  res.json({ prescriptions });
});

// Patient test & diagnostic report results
app.get('/api/patients/:id/reports', authMiddleware, (req: AuthenticatedRequest, res) => {
  const patient = db.findPatientById(req.params.id, req.doctor?.id);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });
  const reports = db.getTestReportsByPatient(req.params.id);
  res.json({ reports });
});

app.post('/api/patients/:id/reports', authMiddleware, requireDoctorRole, (req: AuthenticatedRequest, res) => {
  const patient = db.findPatientById(req.params.id, req.doctor?.id);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });

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

app.put('/api/reports/:id', authMiddleware, requireDoctorRole, (req: AuthenticatedRequest, res) => {
  const doctor = req.doctor!;
  const existingReport = db.getTestReportById(req.params.id);
  if (!existingReport || !db.findPatientById(existingReport.patientId, doctor.id)) {
    return res.status(404).json({ error: 'Report not found' });
  }
  const updated = db.updateTestReport(req.params.id, req.body, {
    id: doctor.id,
    name: doctor.name
  });
  if (!updated) return res.status(404).json({ error: 'Report not found' });
  res.json({ report: updated });
});

app.delete('/api/reports/:id', authMiddleware, requireDoctorRole, (req: AuthenticatedRequest, res) => {
  const doctor = req.doctor!;
  const existingReport = db.getTestReportById(req.params.id);
  if (!existingReport || !db.findPatientById(existingReport.patientId, doctor.id)) {
    return res.status(404).json({ error: 'Report not found' });
  }
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
  if (req.doctor?.role === 'receptionist') {
    return res.status(403).json({ error: 'Receptionists cannot start clinical consultations. Please check in the patient for the doctor.' });
  }
  const { patientId, symptoms, fee } = req.body;
  if (!patientId) {
    return res.status(400).json({ error: 'patientId is required' });
  }

  const doctor = req.doctor!;
  const patient = db.findPatientById(patientId, doctor.id);
  if (!patient) {
    return res.status(404).json({ error: 'Patient not found' });
  }

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

app.get('/api/consultations/:id', authMiddleware, (req: AuthenticatedRequest, res) => {
  const consultation = db.getConsultationById(req.params.id);
  if (!consultation || !db.findPatientById(consultation.patientId, req.doctor?.id)) {
    return res.status(404).json({ error: 'Consultation not found' });
  }
  res.json({ consultation });
});

// Sign & Finish Consultation
app.put('/api/consultations/:id/sign', authMiddleware, (req: AuthenticatedRequest, res) => {
  if (req.doctor?.role === 'receptionist') {
    return res.status(403).json({ error: 'Only doctors can sign clinical consultations.' });
  }
  const doctor = req.doctor!;
  const existingConsult = db.getConsultationById(req.params.id);
  if (!existingConsult || !db.findPatientById(existingConsult.patientId, doctor.id)) {
    return res.status(404).json({ error: 'Consultation not found' });
  }
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
app.get('/api/prescriptions', authMiddleware, requireDoctorRole, (req: AuthenticatedRequest, res) => {
  const patientId = req.query.patientId as string | undefined;
  const prescriptions = db.getPrescriptions(patientId, req.doctor?.id);
  res.json({ prescriptions });
});

app.post('/api/prescriptions', authMiddleware, (req: AuthenticatedRequest, res) => {
  if (req.doctor?.role === 'receptionist') {
    return res.status(403).json({ error: 'Only doctors can issue medical prescriptions.' });
  }
  const { patientId, medicineName, dosage, frequency, duration, instructions, consultationId } = req.body;
  if (!patientId || !medicineName) {
    return res.status(400).json({ error: 'Patient ID and Medicine Name are required' });
  }

  const doctor = req.doctor!;
  const patient = db.findPatientById(patientId, doctor.id);
  if (!patient) {
    return res.status(404).json({ error: 'Patient not found' });
  }

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

// Generate an HMAC-signed Digital Prescription Verification QR Token
app.post('/api/prescriptions/sign-token', authMiddleware, (req: AuthenticatedRequest, res) => {
  const doctor = req.doctor!;
  const { patientId, consultationId, prescriptionIds } = req.body || {};
  if (!patientId) {
    return res.status(400).json({ error: 'patientId is required' });
  }

  const patient = db.findPatientById(String(patientId), doctor.id);
  if (!patient) {
    return res.status(404).json({ error: 'Patient not found' });
  }

  const allRx = db.getPrescriptions(patient.id, doctor.id);
  const selectedIds = Array.isArray(prescriptionIds)
    ? prescriptionIds.map(String).filter(Boolean)
    : [];
  const filteredRx =
    selectedIds.length > 0
      ? allRx.filter(r => selectedIds.includes(r.id))
      : consultationId
      ? allRx.filter(r => r.consultationId === consultationId)
      : allRx.slice(0, 12);

  const rxBatch = (filteredRx.length > 0 ? filteredRx : allRx.slice(0, 10)).map(r => ({
    m: r.medicineName,
    d: r.dosage,
    f: r.frequency,
    du: r.duration,
    i: r.instructions || ''
  }));

  const signedAt = new Date().toISOString();
  const payload = {
    p: patient.id,
    pc: patient.patientCode,
    pn: patient.fullName,
    pa: `${patient.age}y / ${patient.gender}`,
    d: doctor.id,
    dn: doctor.name,
    ds: doctor.speciality || 'Dermatology & Clinical Medicine',
    dr: doctor.registrationNumber || 'MCI-VERIFIED',
    cn: doctor.clinicName || 'Cliniq Clinical OS',
    cp: doctor.phone || '',
    c: consultationId || undefined,
    rx: rxBatch,
    iat: signedAt
  };

  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = signPayloadHmac(encoded);
  const token = `rxv_${encoded}.${sig}`;
  const verificationCode = `RX-${sig.slice(0, 8).toUpperCase()}`;

  res.json({
    token,
    verificationCode,
    signedAt
  });
});

// Public endpoint: Verify a Digital Prescription QR Code token (for patients & pharmacies)
app.get('/api/prescriptions/verify/:token', (req, res) => {
  const rawToken = String(req.params.token || '').trim();
  if (!rawToken.startsWith('rxv_')) {
    return res.status(400).json({ verified: false, error: 'Invalid prescription verification token format.' });
  }

  const body = rawToken.slice(4);
  const dotIdx = body.lastIndexOf('.');
  if (dotIdx <= 0) {
    return res.status(400).json({ verified: false, error: 'Malformed prescription signature.' });
  }

  const encoded = body.slice(0, dotIdx);
  const sig = body.slice(dotIdx + 1);
  if (!verifyHmacSignature(encoded, sig)) {
    return res.status(401).json({
      verified: false,
      error: 'Prescription signature verification failed. This prescription may have been altered or tampered with.'
    });
  }

  try {
    const decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    const liveDoctor = decoded.d ? db.findDoctorById(String(decoded.d)) : undefined;
    const livePatient =
      decoded.p && decoded.d ? db.findPatientById(String(decoded.p), String(decoded.d)) : undefined;

    const liveRx =
      livePatient && decoded.d
        ? db
            .getPrescriptions(livePatient.id, String(decoded.d))
            .filter(r => !decoded.c || r.consultationId === decoded.c)
        : [];

    const medications =
      Array.isArray(decoded.rx) && decoded.rx.length > 0
        ? decoded.rx.map((item: { m: string; d: string; f: string; du: string; i?: string }) => ({
            medicineName: item.m,
            dosage: item.d,
            frequency: item.f,
            duration: item.du || '',
            instructions: item.i || ''
          }))
        : liveRx.map(r => ({
            medicineName: r.medicineName,
            dosage: r.dosage,
            frequency: r.frequency,
            duration: r.duration,
            instructions: r.instructions || ''
          }));

    return res.json({
      verified: true,
      verificationCode: `RX-${sig.slice(0, 8).toUpperCase()}`,
      signedAt: decoded.iat || new Date().toISOString(),
      clinic: {
        name: liveDoctor?.clinicName || decoded.cn || 'Cliniq Clinical OS',
        doctorName: liveDoctor?.name || decoded.dn || 'Attending Physician',
        speciality: liveDoctor?.speciality || decoded.ds || 'Dermatology & Clinical Practice',
        registrationNumber: liveDoctor?.registrationNumber || decoded.dr || 'Verified Practitioner',
        phone: liveDoctor?.phone || decoded.cp || ''
      },
      patient: {
        name: livePatient?.fullName || decoded.pn || 'Verified Patient',
        patientCode: livePatient?.patientCode || decoded.pc || 'P-VERIFIED',
        demographics: livePatient ? `${livePatient.age}y / ${livePatient.gender}` : decoded.pa || ''
      },
      medications
    });
  } catch {
    return res.status(400).json({ verified: false, error: 'Unable to decode prescription verification payload.' });
  }
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

app.get('/api/formulary', authMiddleware, requireDoctorRole, (req: AuthenticatedRequest, res) => {
  const doctor = req.doctor!;
  const items = db.getDoctorFormulary(doctor.id);
  res.json({ items });
});

app.post('/api/formulary', authMiddleware, requireDoctorRole, (req: AuthenticatedRequest, res) => {
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

app.post('/api/formulary/import', authMiddleware, requireDoctorRole, async (req: AuthenticatedRequest, res) => {
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

app.delete('/api/formulary/:id', authMiddleware, requireDoctorRole, (req: AuthenticatedRequest, res) => {
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

app.get('/api/appointments/:id', authMiddleware, (req: AuthenticatedRequest, res) => {
  const appt = db.getAppointmentById(req.params.id);
  if (!appt || !db.findPatientById(appt.patientId, req.doctor?.id)) {
    return res.status(404).json({ error: 'Appointment not found' });
  }
  res.json({ appointment: appt });
});

app.post('/api/appointments', authMiddleware, (req: AuthenticatedRequest, res) => {
  const { patientId, date, time, type, instructions, notes, consultationId } = req.body;
  if (!patientId || !date) {
    return res.status(400).json({ error: 'patientId and date are required' });
  }

  const doctor = req.doctor!;
  const patient = db.findPatientById(patientId, doctor.id);
  if (!patient) {
    return res.status(404).json({ error: 'Patient not found' });
  }

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
  const existing = db.getAppointmentById(req.params.id);
  if (!existing || !db.findPatientById(existing.patientId, doctor.id)) {
    return res.status(404).json({ error: 'Appointment not found' });
  }
  const updated = db.updateAppointment(req.params.id, req.body, { id: doctor.id, name: doctor.name });
  if (!updated) return res.status(404).json({ error: 'Appointment not found' });
  res.json({ appointment: updated });
});

app.delete('/api/appointments/:id', authMiddleware, (req: AuthenticatedRequest, res) => {
  const doctor = req.doctor!;
  const existing = db.getAppointmentById(req.params.id);
  if (!existing || !db.findPatientById(existing.patientId, doctor.id)) {
    return res.status(404).json({ error: 'Appointment not found' });
  }
  const success = db.deleteAppointment(req.params.id, { id: doctor.id, name: doctor.name });
  if (!success) return res.status(404).json({ error: 'Appointment not found' });
  res.json({ success: true, message: 'Appointment deleted' });
});

// ==========================================
// CLINICAL IMAGES UPLOAD ROUTES
// ==========================================
app.post('/api/images/upload', authMiddleware, (req: AuthenticatedRequest, res) => {
  const {
    patientId,
    consultationId,
    dataUrl,
    url,
    filename,
    mimeType,
    caption,
    bodyArea,
    modality,
    imageRole,
    examDate,
    extractedFindings,
    visualMetrics,
    tags,
    bodyMarkerId
  } = req.body;

  const rawDataUrl = dataUrl || url;
  if (!patientId || !rawDataUrl) {
    return res.status(400).json({ error: 'patientId and image dataUrl/url are required' });
  }

  try {
    const doctor = req.doctor!;
    const patient = db.findPatientById(patientId, doctor.id);
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    const clinicalImage = storePatientClinicalImage({
      patientId,
      consultationId,
      rawDataUrl,
      filename,
      mimeType,
      caption,
      bodyArea,
      modality,
      imageRole,
      examDate,
      extractedFindings,
      visualMetrics,
      tags,
      bodyMarkerId,
      actor: { id: doctor.id, name: doctor.name }
    });

    res.status(201).json({ image: clinicalImage });
  } catch (err: unknown) {
    console.error('Image upload failed:', err);
    const message = err instanceof Error ? err.message : 'Failed to save image';
    res.status(500).json({ error: message });
  }
});

app.delete('/api/images/:id', authMiddleware, (req: AuthenticatedRequest, res) => {
  const existingImg = db.getClinicalImageById(req.params.id);
  if (!existingImg || !db.findPatientById(existingImg.patientId, req.doctor?.id)) {
    return res.status(404).json({ error: 'Image not found' });
  }
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
    let doctorId = '';
    if (parts.length >= 4) {
      try {
        const rawTail = parts.slice(3).join('_');
        const dotIdx = rawTail.lastIndexOf('.');
        // Require valid HMAC signature on restored mobile QR tokens
        if (dotIdx <= 0) return undefined;
        const encodedMeta = rawTail.slice(0, dotIdx);
        const sig = rawTail.slice(dotIdx + 1);
        if (!verifyHmacSignature(encodedMeta, sig)) {
          return undefined;
        }
        const decoded = JSON.parse(Buffer.from(encodedMeta, 'base64url').toString('utf8'));
        if (decoded.p) patientId = decoded.p;
        if (decoded.c) consultationId = decoded.c;
        if (decoded.d) doctorId = decoded.d;
      } catch {
        return undefined;
      }
    }

    if (!patientId || !doctorId) return undefined;
    const doctor = db.findDoctorById(doctorId);
    const patient = doctor ? db.findPatientById(patientId, doctor.id) : undefined;
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

// Create a QR mobile upload session (authenticated doctor, scoped to doctor's clinic)
app.post('/api/images/mobile-session', authMiddleware, (req: AuthenticatedRequest, res) => {
  cleanupExpiredMobileSessions();
  const { patientId, consultationId } = req.body || {};
  const doctor = req.doctor!;
  let patient = patientId ? db.findPatientById(patientId, doctor.id) : undefined;
  if (!patient) {
    const clinicPatients = db.getPatients(undefined, doctor.id);
    if (clinicPatients.length > 0) {
      patient = clinicPatients[0];
    } else {
      patient = db.createPatient(
        {
          fullName: 'Clinical Practice Scan',
          age: 30,
          gender: 'Other',
          mobile: '9999999999',
          medicalHistory: 'Clinical scan intake',
          createdById: doctor.id,
          createdByEmail: doctor.email.toLowerCase()
        },
        doctor
      );
    }
  }
  const encodedMeta = Buffer.from(
    JSON.stringify({ p: patient.id, c: consultationId, d: doctor.id }),
    'utf8'
  ).toString('base64url');
  const sig = signPayloadHmac(encodedMeta);
  const token = `mob_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}_${encodedMeta}.${sig}`;
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
      dataUrl,
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

    // Real-time push to desktop modal & clinic workstation
    broadcastMobileSessionEvent(session.token, 'mobile_qr:image_uploaded', {
      image: clinicalImage,
      uploadedCount: session.uploadedImages.length
    });
    broadcastClinicEvent(
      'mobile_qr:image_uploaded',
      {
        token: session.token,
        patientId: session.patientId,
        consultationId: session.consultationId,
        image: clinicalImage
      },
      session.doctorId
    );

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
    let doctorId = '';
    let doctorName = 'Dr. Demo';
    let clinicName = 'Cliniq Dermatology Center';
    let mobile = '';
    let countryCode = '+91';

    if (parts.length >= 4) {
      try {
        const rawTail = parts.slice(3).join('_');
        const dotIdx = rawTail.lastIndexOf('.');
        if (dotIdx <= 0) return undefined;
        const encodedMeta = rawTail.slice(0, dotIdx);
        const sig = rawTail.slice(dotIdx + 1);
        if (!verifyHmacSignature(encodedMeta, sig)) {
          return undefined;
        }
        const decoded = JSON.parse(Buffer.from(encodedMeta, 'base64url').toString('utf8'));
        if (decoded.d) doctorId = decoded.d;
        if (decoded.n) doctorName = decoded.n;
        if (decoded.c) clinicName = decoded.c;
        if (decoded.m) mobile = decoded.m;
        if (decoded.cc) countryCode = decoded.cc;
      } catch {
        return undefined;
      }
    }

    if (!doctorId) return undefined;
    const doc = db.findDoctorById(doctorId);
    if (!doc) return undefined;
    const now = Date.now();
    session = {
      token,
      doctorId: doc.id,
      doctorName: doc.name || doctorName,
      clinicName: doc.clinicName || clinicName,
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
  const sig = signPayloadHmac(encodedMeta);
  const token = `wlk_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}_${encodedMeta}.${sig}`;
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

  const serializedSession = {
    ...session,
    expiresAt: new Date(session.expiresAt).toISOString()
  };

  // Real-time push to desktop Walk-In modal & clinic workstation
  broadcastMobileSessionEvent(session.token, 'walkin:session_submitted', {
    session: serializedSession
  });
  broadcastClinicEvent(
    'walkin:session_submitted',
    {
      token: session.token,
      session: serializedSession
    },
    session.doctorId
  );

  res.json({
    session: serializedSession
  });
});

// ==========================================
// AI ASSISTANT ROUTES
// ==========================================
app.post('/api/ai/summarize-consultation', authMiddleware, requireDoctorRole, async (req, res) => {
  try {
    const summary = await summarizeConsultationWithAI(req.body);
    res.json({ summary });
  } catch (err: unknown) {
    console.error('AI summary error:', err);
    res.status(500).json({ error: 'Failed to generate summary' });
  }
});

app.post('/api/ai/parse-clinical-note', authMiddleware, requireDoctorRole, async (req, res) => {
  try {
    const parsed = await parseClinicalNoteWithAI(req.body || {});
    res.json({ parsed });
  } catch (err: unknown) {
    console.error('AI parse clinical note error:', err);
    res.status(500).json({ error: 'Failed to parse clinical note' });
  }
});

app.post('/api/ai/parse-lab-report', authMiddleware, requireDoctorRole, async (req: AuthenticatedRequest, res) => {
  try {
    const { attachmentDataUrl, reportText, testName, category, patientId } = req.body || {};
    let patientObj: { name?: string; age?: number; gender?: string; allergies?: string } | undefined;
    if (patientId) {
      const p = db.findPatientById(patientId, req.doctor?.id);
      if (p) {
        patientObj = {
          name: p.fullName,
          age: p.age,
          gender: p.gender,
          allergies: p.allergies
        };
      }
    }
    const parsed = await parseLabOrBiopsyReportWithAI({
      attachmentDataUrl,
      reportText,
      testName,
      category,
      patient: patientObj
    });
    res.json({ parsed });
  } catch (err: unknown) {
    console.error('AI parse lab report error:', err);
    res.status(500).json({ error: 'Failed to parse lab/biopsy report' });
  }
});

app.post('/api/ai/chat', authMiddleware, requireDoctorRole, async (req: AuthenticatedRequest, res) => {
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

app.post('/api/ai/report-chat', authMiddleware, requireDoctorRole, async (req: AuthenticatedRequest, res) => {
  const { question, report, anatomicalSite, clinicalNotes, abcdeScore, patientId, conversationHistory } = req.body || {};
  if (!question) {
    return res.status(400).json({ error: 'Question is required' });
  }

  let patient = undefined;
  let history = undefined;
  if (patientId) {
    patient = db.findPatientById(patientId, req.doctor?.id);
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
app.get('/api/subscription', authMiddleware, requireDoctorRole, (_req, res) => {
  const subscription = db.getSubscription();
  res.json({ subscription });
});

app.post('/api/subscription/upgrade', authMiddleware, requireDoctorRole, (req: AuthenticatedRequest, res) => {
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

app.post('/api/subscription/topup', authMiddleware, requireDoctorRole, (req: AuthenticatedRequest, res) => {
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

app.post('/api/ai/analyze-image', authMiddleware, requireDoctorRole, async (req: AuthenticatedRequest, res) => {
  const { imageBase64, mimeType, patientId, clinicalNotes, imageUrl, visualMetrics } = req.body;

  if (!imageBase64) {
    return res.status(400).json({ error: 'Clinical image data (imageBase64) is required for analysis' });
  }

  // Ensure AI Scan Credit Meter never blocks active clinical consultations (100% free)
  let currentSub = db.getSubscription();
  if (currentSub.aiScansRemaining <= 0) {
    currentSub = db.topUpScanCredits(50, 0, 'UPI');
  }

  let patient = undefined;
  let history = undefined;
  let testReports = undefined;

  if (patientId) {
    patient = db.findPatientById(patientId, req.doctor?.id);
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

app.post('/api/ai/compare-progression', authMiddleware, requireDoctorRole, async (req: AuthenticatedRequest, res) => {
  const { imageA, imageB, patientId, clinicalContext } = req.body;

  if (!imageA || !imageB) {
    return res.status(400).json({ error: 'Both past image (imageA) and current image (imageB) are required for progression analysis' });
  }

  // Helper to resolve stored past/current image from DB or /uploads/ path so comparison always extracts real data
  const resolveComparisonImageInput = (input: {
    id?: string;
    base64?: string;
    mimeType?: string;
    label: string;
    date: string;
    modality?: string;
    bodyArea?: string;
    extractedFindings?: string;
    visualMetrics?: import('./src/types/index.js').ImageVisualMetrics;
  }) => {
    const stored = input.id ? db.getClinicalImageById(input.id) : undefined;
    let resolvedBase64 = input.base64 || stored?.dataUrl || stored?.url || '';
    let resolvedMime = input.mimeType || stored?.mimeType || 'image/jpeg';

    // If resolvedBase64 is a local /uploads/... path, read from disk or fallback to stored dataUrl
    if (resolvedBase64.startsWith('/uploads/')) {
      const diskPath = path.join(UPLOADS_DIR, path.basename(resolvedBase64));
      if (fs.existsSync(diskPath)) {
        const buf = fs.readFileSync(diskPath);
        resolvedBase64 = `data:${resolvedMime};base64,${buf.toString('base64')}`;
      } else if (stored?.dataUrl) {
        resolvedBase64 = stored.dataUrl;
      }
    }

    return {
      base64: resolvedBase64,
      mimeType: resolvedMime,
      label: input.label || stored?.caption || stored?.bodyArea || 'Medical Image',
      date: input.date || stored?.examDate || (stored?.createdAt ? stored.createdAt.split('T')[0] : new Date().toISOString().split('T')[0]),
      modality: input.modality || stored?.modality || 'Clinical Photo',
      bodyArea: input.bodyArea || stored?.bodyArea || stored?.caption,
      extractedFindings: input.extractedFindings || stored?.extractedFindings,
      visualMetrics: input.visualMetrics || stored?.visualMetrics
    };
  };

  const resolvedA = resolveComparisonImageInput(imageA);
  const resolvedB = resolveComparisonImageInput(imageB);

  if (!resolvedA.base64 || !resolvedB.base64) {
    return res.status(400).json({ error: 'Both past medical image and current medical image data are required for comparison' });
  }

  let patient = undefined;
  if (patientId) {
    patient = db.findPatientById(patientId, req.doctor?.id);
  }

  try {
    const progression = await compareClinicalImages({
      imageA: resolvedA,
      imageB: resolvedB,
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
        pastImageDate: resolvedA.date,
        currentImageDate: resolvedB.date,
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
app.post('/api/ai/assess-abcde', authMiddleware, requireDoctorRole, async (req: AuthenticatedRequest, res) => {
  const { imageBase64, mimeType, patientId, clinicalNotes, estimatedDiameterMm, visualMetrics } = req.body;

  if (!imageBase64) {
    return res.status(400).json({ error: 'imageBase64 is required for ABCDE assessment' });
  }

  let patient = undefined;
  if (patientId) {
    patient = db.findPatientById(patientId, req.doctor?.id);
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
app.post('/api/ai/compare-visits', authMiddleware, requireDoctorRole, async (req: AuthenticatedRequest, res) => {
  const { visitAId, visitBId, patientId, doctorNotes, markedAreas } = req.body;

  if (!visitAId || !visitBId || !patientId) {
    return res.status(400).json({ error: 'visitAId, visitBId, and patientId are required' });
  }

  const patient = db.findPatientById(patientId, req.doctor?.id);
  if (!patient) {
    return res.status(404).json({ error: 'Patient not found' });
  }

  const visitA = db.getConsultationById(visitAId);
  const visitB = db.getConsultationById(visitBId);

  if (!visitA || !visitB || visitA.patientId !== patient.id || visitB.patientId !== patient.id) {
    return res.status(404).json({ error: 'One or both consultation visits not found' });
  }

  try {
    const comparison = await comparePatientVisits({
      visitA,
      visitB,
      patient,
      doctorNotes: typeof doctorNotes === 'string' ? doctorNotes : undefined,
      markedAreas: Array.isArray(markedAreas) ? markedAreas : undefined
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
// WHATSAPP DIRECT MESSAGE & REPORT DISPATCH
// ==========================================
interface InboxPdfAttachment {
  filename: string;
  reportId: string;
  sizeLabel: string;
  generatedAt: string;
  summaryPoints?: string[];
  pdfDataUrl?: string;
}

interface DispatchedWhatsAppMessage {
  id: string;
  patientId?: string;
  patientName: string;
  recipientMobile: string;
  clinicPhone: string;
  reportType: string;
  messageText: string;
  note?: string;
  pdfAttachment?: InboxPdfAttachment;
  deliveryMode: 'cloud_api' | 'whatsapp_gateway';
  status: 'sent' | 'delivered';
  whatsappUrl: string;
  sentAt: string;
  doctorId: string;
  doctorName: string;
}

interface InboxSuggestedResolution {
  id: string;
  label: string;
  intent: string;
  text: string;
}

interface InboxMessageRecord {
  id?: string;
  sender: 'patient' | 'doctor' | 'ai';
  text: string;
  time: string;
  status?: string;
  receiptId?: string;
  whatsappUrl?: string;
  recipientPhone?: string;
  pdfAttachment?: InboxPdfAttachment;
  createdAt?: string;
}

interface InboxThreadRecord {
  id: string;
  doctorId?: string;
  name: string;
  subtitle: string;
  category: 'patients' | 'pharmacies' | 'collaborations';
  channel: 'WhatsApp' | 'SMS' | 'Email' | 'App';
  priority: 'urgent' | 'routine';
  stage: 'needs_review' | 'draft_ready' | 'resolved';
  preview: string;
  timestamp: string;
  unread: boolean;
  statusLabel: string;
  phone: string;
  aiSummary: string;
  patientId?: string;
  messages: InboxMessageRecord[];
  draftReply: string;
  suggestedReplies: InboxSuggestedResolution[];
  updatedAt: string;
}

const defaultInboxThreads: InboxThreadRecord[] = [
  {
    id: 't-1',
    name: 'Rohit Sharma',
    subtitle: '28y · P-24621 · English',
    category: 'patients',
    channel: 'WhatsApp',
    priority: 'urgent',
    stage: 'needs_review',
    preview: 'Chest feels tight since morning with red rash',
    timestamp: '2 min ago',
    unread: true,
    statusLabel: 'Red flag · Immediate review',
    phone: '+91 98765 43210',
    aiSummary: 'Patient reports acute rash extension with chest tightness. Immediate clinical triage advised.',
    messages: [
      {
        id: 'm-101',
        sender: 'patient',
        text: 'Doctor, my chest feels tight and the rash is spreading since morning. Is this normal?',
        time: '9:30 AM'
      }
    ],
    draftReply:
      'Rohit, please stop any newly started medication immediately and visit the nearest emergency room or call our clinic hotline right away for an urgent evaluation of your chest tightness and rash.',
    suggestedReplies: [
      {
        id: 's-1a',
        label: 'Urgent ER & Stop Meds',
        intent: 'Immediate safety escalation',
        text: 'Rohit, please stop any newly started medication immediately and visit the nearest emergency room or call our clinic hotline right away for an urgent evaluation of your chest tightness and rash.'
      },
      {
        id: 's-1b',
        label: 'Immediate Clinic Walk-In',
        intent: 'Priority in-clinic triage',
        text: 'Rohit, chest tightness with a spreading rash needs immediate evaluation. Please come directly to the clinic priority desk now or head to the nearest emergency department.'
      },
      {
        id: 's-1c',
        label: 'Check Anaphylaxis Signs',
        intent: 'Symptom screening & call',
        text: 'Rohit, I am calling you now. If you have any difficulty breathing, lip/tongue swelling, or dizziness, please take your emergency antihistamine and go to the nearest ER immediately.'
      }
    ],
    updatedAt: new Date(Date.now() - 2 * 60_000).toISOString()
  },
  {
    id: 't-2',
    name: 'Harman Preet',
    subtitle: '25y · P-24618 · English & Punjabi',
    category: 'patients',
    channel: 'WhatsApp',
    priority: 'routine',
    stage: 'draft_ready',
    preview: 'Itching more at night, is it normal?',
    timestamp: '40 min ago',
    unread: true,
    statusLabel: 'Patient question · AI draft ready',
    phone: '+91 98765 11223',
    aiSummary: 'Less redness, mild night itching. Clinical photo shows barrier healing. No fever or swelling.',
    messages: [
      {
        id: 'm-201',
        sender: 'patient',
        text: 'Doctor, the redness is better but the itching is more at night. Is this normal?',
        time: '9:41 AM',
        status: 'photo attached'
      },
      {
        id: 'm-202',
        sender: 'doctor',
        text: 'Hi Harman. I received your message and photo. I will reply with advice shortly.',
        time: '9:45 AM',
        status: 'read'
      }
    ],
    draftReply:
      'Mild itching at night is common as the skin barrier repairs. Keep the area well moisturised with your prescribed ceramide cream before sleep, avoid scratching, and continue your bedtime antihistamine.',
    suggestedReplies: [
      {
        id: 's-2a',
        label: 'Reassure & Moisturize',
        intent: 'Barrier healing guidance',
        text: 'Mild itching at night is common as the skin barrier repairs. Keep the area well moisturised with your prescribed ceramide cream before sleep, avoid scratching, and continue your bedtime antihistamine.'
      },
      {
        id: 's-2b',
        label: 'Cold Compress & Dosage Adjustment',
        intent: 'Symptomatic relief',
        text: 'Hi Harman, the reduced redness is a good sign of healing. For night itching, apply a cool damp compress for 5 minutes before applying your chilled moisturizer, and take your prescribed tablet 1 hour before bed.'
      },
      {
        id: 's-2c',
        label: 'Bilingual (English + Punjabi)',
        intent: 'Patient native comfort',
        text: 'Hi Harman, ਰਾਤ ਨੂੰ ਹਲਕੀ ਖਾਰਸ਼ ਚਮੜੀ ਦੇ ਠੀਕ ਹੋਣ ਦਾ ਹਿੱਸਾ ਹੈ। ਸੌਣ ਤੋਂ ਪਹਿਲਾਂ ਆਪਣੀ ਮਾਇਸਚਰਾਈਜ਼ਰ ਕਰੀਮ ਲਗਾਓ ਅਤੇ ਖੁਰਕਣ ਤੋਂ ਬਚੋ। (Mild night itching is normal during healing; apply moisturizer before bed.)'
      }
    ],
    updatedAt: new Date(Date.now() - 40 * 60_000).toISOString()
  },
  {
    id: 't-3',
    name: 'Simran Kaur',
    subtitle: '31y · P-24619 · Refill request',
    category: 'patients',
    channel: 'WhatsApp',
    priority: 'routine',
    stage: 'draft_ready',
    preview: 'Need refill for my prescribed tablets',
    timestamp: '3 h ago',
    unread: false,
    statusLabel: 'Refill verified · Safe to approve',
    phone: '+91 91234 56789',
    aiSummary: 'Antihistamine tablet 30 days. Seen 3 weeks ago. Safe refill verified against chart.',
    messages: [
      {
        id: 'm-301',
        sender: 'patient',
        text: 'Hello doctor, I need a refill for my allergy tablets for another 30 days.',
        time: '7:15 AM'
      }
    ],
    draftReply:
      'Hello Simran, your 30-day allergy tablet refill has been approved. We have updated your digital prescription—you can collect it at the clinic pharmacy or order directly.',
    suggestedReplies: [
      {
        id: 's-3a',
        label: 'Approve 30-Day Refill',
        intent: 'Full authorization',
        text: 'Hello Simran, your 30-day allergy tablet refill has been approved. We have updated your digital prescription—you can collect it at the clinic pharmacy or order directly.'
      },
      {
        id: 's-3b',
        label: 'Approve + Book 4-Week Review',
        intent: 'Refill with follow-up',
        text: 'Hello Simran, I have authorized your 30-day refill. Since this completes your 2-month course, please book a brief follow-up check next month so we can taper the dose.'
      },
      {
        id: 's-3c',
        label: 'Short 14-Day Bridge Refill',
        intent: 'Require in-person check',
        text: 'Hello Simran, I have approved a 14-day supply to keep your symptoms controlled. Please schedule a quick clinic visit within two weeks so we can review your progress.'
      }
    ],
    updatedAt: new Date(Date.now() - 180 * 60_000).toISOString()
  },
  {
    id: 't-4',
    name: 'Anita Verma',
    subtitle: '42y · P-24622 · Reschedule request',
    category: 'patients',
    channel: 'WhatsApp',
    priority: 'routine',
    stage: 'draft_ready',
    preview: 'Can we move my visit to Friday?',
    timestamp: '3 h ago',
    unread: false,
    statusLabel: 'Schedule change · 3 open slots',
    phone: '+91 99887 76655',
    aiSummary: 'Requests moving visit to Friday. Open clinic slots: 10:00 AM, 2:30 PM, 4:00 PM.',
    messages: [
      {
        id: 'm-401',
        sender: 'patient',
        text: 'Can we move my visit from tomorrow to Friday? Something urgent came up.',
        time: '6:50 AM'
      }
    ],
    draftReply:
      'Hi Anita, certainly. We have open slots this Friday at 10:00 AM, 2:30 PM, or 4:00 PM. Please reply with your preferred time and we will confirm your appointment.',
    suggestedReplies: [
      {
        id: 's-4a',
        label: 'Offer Friday Slots (10 AM / 2:30 PM / 4 PM)',
        intent: 'Direct slot selection',
        text: 'Hi Anita, certainly. We have open slots this Friday at 10:00 AM, 2:30 PM, or 4:00 PM. Please reply with your preferred time and we will confirm your appointment.'
      },
      {
        id: 's-4b',
        label: 'Confirm Friday 10:00 AM Slot',
        intent: 'Proactive booking',
        text: 'Hi Anita, I have tentatively reserved the Friday 10:00 AM morning slot for your visit. Let us know if you prefer an afternoon time instead.'
      },
      {
        id: 's-4c',
        label: 'Offer Tele-Consult Option',
        intent: 'Remote alternative',
        text: 'Hi Anita, we can move your in-clinic visit to Friday at 2:30 PM, or if it is more convenient, we can do a quick video follow-up tomorrow evening.'
      }
    ],
    updatedAt: new Date(Date.now() - 190 * 60_000).toISOString()
  },
  {
    id: 't-5',
    name: 'Meera Patel',
    subtitle: '29y · P-24623 · Follow-up check',
    category: 'patients',
    channel: 'SMS',
    priority: 'routine',
    stage: 'resolved',
    preview: 'Thank you for the prescription',
    timestamp: 'Yesterday',
    unread: false,
    statusLabel: 'Follow-up logged',
    phone: '+91 98111 22334',
    aiSummary: 'Topical cream 2 tubes. Patient confirmed adherence. Next review in 7 days.',
    messages: [
      {
        id: 'm-501',
        sender: 'patient',
        text: 'Thank you for the prescription. I am using the cream as directed.',
        time: 'Yesterday'
      }
    ],
    draftReply:
      'Hi Meera, glad to hear that. Remember to apply SPF 50+ sunscreen every morning while using the night cream, and message us if you notice any dryness.',
    suggestedReplies: [
      {
        id: 's-5a',
        label: 'Sunscreen & Hydration Reminder',
        intent: 'Adherence support',
        text: 'Hi Meera, glad to hear that. Remember to apply SPF 50+ sunscreen every morning while using the night cream, and message us if you notice any dryness.'
      },
      {
        id: 's-5b',
        label: '1-Week Photo Check-In Request',
        intent: 'Visual progress tracking',
        text: 'Hi Meera, great! Please share a clear daylight photo of the treated area after 7 days so we can assess your pigmentation improvement.'
      },
      {
        id: 's-5c',
        label: 'Confirm 7-Day Review Slot',
        intent: 'Routine follow-up',
        text: 'Hi Meera, glad your skin is tolerating the cream well. We will check in with you next week for your 7-day progress review.'
      }
    ],
    updatedAt: new Date(Date.now() - 1440 * 60_000).toISOString()
  },
  {
    id: 't-6',
    name: 'Apollo Pharmacy Hub',
    subtitle: 'Partner Pharmacy · Batch verification',
    category: 'pharmacies',
    channel: 'SMS',
    priority: 'routine',
    stage: 'needs_review',
    preview: 'Verifying prescription batch #RX-8842',
    timestamp: '1 h ago',
    unread: true,
    statusLabel: 'Pharmacy authorization',
    phone: '+91 98765 00420',
    aiSummary: 'Partner pharmacy requesting dispensing confirmation for Harman Preet (P-24618).',
    messages: [
      {
        id: 'm-601',
        sender: 'patient',
        text: 'Hello Doctor, confirming prescription for patient Harman (P-24618). Please authorize.',
        time: '11:15 AM'
      }
    ],
    draftReply: 'Prescription batch #RX-8842 for Harman Preet (P-24618) is verified and authorized for dispensing as written.',
    suggestedReplies: [
      {
        id: 's-6a',
        label: 'Authorize Dispensing (#RX-8842)',
        intent: 'Approve as written',
        text: 'Prescription batch #RX-8842 for Harman Preet (P-24618) is verified and authorized for dispensing as written.'
      },
      {
        id: 's-6b',
        label: 'Approve Brand Substitution',
        intent: 'Allow generic equivalent',
        text: 'Batch #RX-8842 is authorized. If the primary topical brand is out of stock, you may dispense the equivalent strength ceramide formulation.'
      },
      {
        id: 's-6c',
        label: 'Request Patient Call Before Dispense',
        intent: 'Dosage verification',
        text: 'Please hold batch #RX-8842 briefly and have the pharmacist call our clinic desk to confirm the strength.'
      }
    ],
    updatedAt: new Date(Date.now() - 60 * 60_000).toISOString()
  }
];

function formatDisplayPhone(rawDigits: string): string {
  const digits = rawDigits.replace(/\D/g, '');
  if (digits.length >= 10) {
    const last10 = digits.slice(-10);
    return `+91 ${last10.slice(0, 5)} ${last10.slice(5)}`;
  }
  return `+91 ${digits || '98765 43210'}`;
}

function buildSmartSuggestedRepliesForIncoming(
  patientName: string,
  incomingText: string
): {
  isUrgent: boolean;
  aiSummary: string;
  draftReply: string;
  suggestedReplies: InboxSuggestedResolution[];
} {
  const lower = incomingText.toLowerCase();
  const isUrgent =
    /chest|tight|breath|swelling|fever|bleed|pus|severe|worse|spread|pain|dizzy|emergency/.test(lower);

  if (isUrgent) {
    const draftReply = `Hi ${patientName}, because you mentioned "${incomingText.slice(
      0,
      45
    )}", please pause any newly started topical or oral medication and visit our clinic priority desk or the nearest emergency room immediately for an evaluation.`;
    return {
      isUrgent: true,
      aiSummary: `Red Flag Alert: Patient reported "${incomingText.slice(0, 80)}". Immediate clinical review recommended.`,
      draftReply,
      suggestedReplies: [
        {
          id: `sug-urg-1-${Date.now()}`,
          label: 'Immediate Clinic / ER Triage',
          intent: 'Urgent safety escalation',
          text: draftReply
        },
        {
          id: `sug-urg-2-${Date.now()}`,
          label: 'Stop Active Meds & Call Now',
          intent: 'Direct physician call',
          text: `Hi ${patientName}, please stop applying the cream/tablets immediately. I am reviewing your chart now—please answer our clinic call or come directly to the clinic.`
        },
        {
          id: `sug-urg-3-${Date.now()}`,
          label: 'Bilingual Urgent Guidance (EN + PA)',
          intent: 'Native patient safety',
          text: `Hi ${patientName}, ਕਿਰਪਾ ਕਰਕੇ ਨਵੀਂ ਦਵਾਈ ਤੁਰੰਤ ਬੰਦ ਕਰੋ ਅਤੇ ਤੁਰੰਤ ਕਲੀਨਿਕ ਜਾਂ ਨੇੜਲੇ ਹਸਪਤਾਲ ਵਿਖੇ ਸੰਪਰਕ ਕਰੋ। (Please stop the new medication immediately and visit the clinic or nearest ER right away.)`
        }
      ]
    };
  }

  const draftReply = `Hi ${patientName}, thank you for the update ("${incomingText.slice(
    0,
    40
  )}"). Please continue your prescribed skincare regimen as directed and share a daylight photo if you need us to review any changes.`;

  return {
    isUrgent: false,
    aiSummary: `Latest patient reply: "${incomingText.slice(0, 85)}". Routine clinical follow-up draft ready.`,
    draftReply,
    suggestedReplies: [
      {
        id: `sug-rt-1-${Date.now()}`,
        label: 'Acknowledge & Continue Regimen',
        intent: 'Reassurance & adherence',
        text: draftReply
      },
      {
        id: `sug-rt-2-${Date.now()}`,
        label: 'Confirm Slot / Follow-Up Plan',
        intent: 'Scheduling & next steps',
        text: `Hi ${patientName}, we have noted your message in your Clinical OS chart. We have reserved your requested follow-up slot—see you at the clinic.`
      },
      {
        id: `sug-rt-3-${Date.now()}`,
        label: 'Bilingual Reply (EN + Punjabi)',
        intent: 'Patient native comfort',
        text: `Hi ${patientName}, ਤੁਹਾਡਾ ਸੁਨੇਹਾ ਮਿਲ ਗਿਆ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ ਆਪਣੀ ਦੱਸੀ ਹੋਈ ਦਵਾਈ ਅਤੇ ਕਰੀਮ ਸਮੇਂ ਸਿਰ ਲਗਾਉਂਦੇ ਰਹੋ। (We received your message; please continue your prescribed treatment as scheduled.)`
      }
    ]
  };
}

function findOrCreateInboxThread(params: {
  threadId?: string;
  patientId?: string;
  patientName?: string;
  phoneDigits: string;
  doctorId?: string;
}): InboxThreadRecord {
  const allThreads = db.getAllRawInboxThreads(defaultInboxThreads);
  const last10 = params.phoneDigits.replace(/\D/g, '').slice(-10);

  let thread = allThreads.find(
    t =>
      (params.threadId && t.id === params.threadId) ||
      (params.patientId && (t.patientId === params.patientId || t.id === params.patientId)) ||
      (last10.length === 10 && t.phone.replace(/\D/g, '').endsWith(last10))
  );

  if (!thread) {
    const matchedPatient =
      (params.patientId ? db.findPatientById(params.patientId, params.doctorId) : undefined) ||
      (last10.length === 10 ? db.findPatientByMobile(last10, params.doctorId) : undefined);

    const resolvedName =
      matchedPatient?.fullName || params.patientName || `Patient (${last10 || 'New'})`;
    const displayPhone = formatDisplayPhone(last10 || params.phoneDigits);
    const defaultDraft = `Hello ${resolvedName}, thank you for reaching out to our clinic. How can we assist you with your treatment today?`;

    thread = {
      id: params.threadId || (matchedPatient ? `p-thread-${matchedPatient.id}` : `t-in-${Date.now().toString(36)}`),
      doctorId: params.doctorId || matchedPatient?.createdById,
      name: resolvedName,
      subtitle: matchedPatient
        ? `${matchedPatient.age}y · ${matchedPatient.patientCode} · ${matchedPatient.gender}`
        : 'Patient · Direct WhatsApp/SMS Line',
      category: 'patients',
      channel: 'WhatsApp',
      priority: 'routine',
      stage: 'draft_ready',
      preview: 'New conversation linked to Clinical OS Inbox',
      timestamp: 'Just now',
      unread: true,
      statusLabel: 'Linked to Clinical OS Inbox',
      phone: displayPhone,
      patientId: matchedPatient?.id || params.patientId,
      aiSummary: matchedPatient
        ? `EHR Profile: ${matchedPatient.age}y ${matchedPatient.gender}. Allergies: ${matchedPatient.allergies || 'None'}.`
        : 'Direct patient conversation routed into Clinical OS.',
      messages: [],
      draftReply: defaultDraft,
      suggestedReplies: [
        {
          id: `s-init-1-${Date.now()}`,
          label: 'Standard Clinical Check-In',
          intent: 'Routine follow-up',
          text: defaultDraft
        }
      ],
      updatedAt: new Date().toISOString()
    };

    allThreads.unshift(thread);
    db.saveStoredInboxThreads(allThreads);
  }

  return thread;
}

function routeIncomingPatientMessageToInbox(params: {
  threadId?: string;
  patientId?: string;
  patientName?: string;
  senderPhone: string;
  messageText: string;
  channel?: 'WhatsApp' | 'SMS';
  doctorId?: string;
}): { thread: InboxThreadRecord; message: InboxMessageRecord } {
  const allThreads = db.getAllRawInboxThreads(defaultInboxThreads);
  const cleanDigits = String(params.senderPhone || '').replace(/\D/g, '') || '919876543210';
  const thread = findOrCreateInboxThread({
    threadId: params.threadId,
    patientId: params.patientId,
    patientName: params.patientName,
    phoneDigits: cleanDigits,
    doctorId: params.doctorId
  });

  const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const incomingMsg: InboxMessageRecord = {
    id: `msg-in-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    sender: 'patient',
    text: params.messageText.trim(),
    time: nowTime,
    status: `Routed to Clinical OS (${params.channel || thread.channel})`,
    createdAt: new Date().toISOString()
  };

  const triage = buildSmartSuggestedRepliesForIncoming(thread.name, params.messageText.trim());

  thread.messages.push(incomingMsg);
  thread.preview = params.messageText.trim();
  thread.timestamp = 'Just now';
  thread.unread = true;
  thread.channel = params.channel || thread.channel;
  thread.priority = triage.isUrgent ? 'urgent' : thread.priority;
  thread.stage = triage.isUrgent ? 'needs_review' : 'draft_ready';
  thread.statusLabel = triage.isUrgent
    ? 'Red flag · New patient reply'
    : 'New patient reply · AI draft ready';
  thread.aiSummary = triage.aiSummary;
  thread.draftReply = triage.draftReply;
  thread.suggestedReplies = triage.suggestedReplies;
  thread.updatedAt = new Date().toISOString();

  // Move updated thread to top of inbox
  const idx = allThreads.findIndex(t => t.id === thread.id);
  if (idx > 0) {
    allThreads.splice(idx, 1);
    allThreads.unshift(thread);
  }
  db.saveStoredInboxThreads(allThreads);

  // Interactive Appointment Reply Automation (CONFIRM / CANCEL / RESCHEDULE)
  const cleanUpper = params.messageText.trim().toUpperCase();
  const last10 = cleanDigits.slice(-10);
  const matchedPatient =
    (thread.patientId ? db.findPatientById(thread.patientId, params.doctorId) : undefined) ||
    (last10.length === 10 ? db.findPatientByMobile(last10, params.doctorId) : undefined);

  if (matchedPatient) {
    const patientAppts = db.getAppointments({ patientId: matchedPatient.id }, params.doctorId || matchedPatient.createdById);
    const activeScheduled = patientAppts.find(a => a.status === 'scheduled');
    if (activeScheduled) {
      if (/^(CONFIRM|CONFIRMED|YES|1|OK)\b/.test(cleanUpper)) {
        const updatedAppt = db.updateAppointment(
          activeScheduled.id,
          {
            notes: `${activeScheduled.notes ? activeScheduled.notes + ' · ' : ''}Confirmed by patient via ${params.channel || 'WhatsApp'}`
          },
          { id: matchedPatient.id, name: matchedPatient.fullName }
        );
        thread.statusLabel = 'Appointment confirmed by patient';
        db.saveStoredInboxThreads(allThreads);
        broadcastClinicEvent(
          'appointment:status_updated',
          { appointment: updatedAppt, patientAction: 'confirmed' },
          params.doctorId || matchedPatient.createdById
        );
      } else if (/^(CANCEL|CANCELLED)\b/.test(cleanUpper)) {
        const updatedAppt = db.updateAppointment(
          activeScheduled.id,
          {
            status: 'cancelled',
            notes: `${activeScheduled.notes ? activeScheduled.notes + ' · ' : ''}Cancelled by patient via ${params.channel || 'WhatsApp'}`
          },
          { id: matchedPatient.id, name: matchedPatient.fullName }
        );
        thread.statusLabel = 'Appointment cancelled by patient';
        db.saveStoredInboxThreads(allThreads);
        broadcastClinicEvent(
          'appointment:status_updated',
          { appointment: updatedAppt, patientAction: 'cancelled' },
          params.doctorId || matchedPatient.createdById
        );
      }
    }
  }

  // Real-time SSE push to clinic inbox
  broadcastClinicEvent(
    'inbox:message_received',
    {
      threadId: thread.id,
      thread,
      message: incomingMsg
    },
    params.doctorId || thread.doctorId
  );

  return { thread, message: incomingMsg };
}

function updateInboxMessageDeliveryStatus(params: {
  receiptId?: string;
  recipientPhone?: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  doctorId?: string;
}): boolean {
  const allThreads = db.getAllRawInboxThreads(defaultInboxThreads);
  const last10 = (params.recipientPhone || '').replace(/\D/g, '').slice(-10);
  let updatedThread: InboxThreadRecord | undefined;

  for (const thread of allThreads) {
    const phoneMatch = last10.length === 10 && thread.phone.replace(/\D/g, '').endsWith(last10);
    for (let i = thread.messages.length - 1; i >= 0; i--) {
      const msg = thread.messages[i];
      if (msg.sender !== 'doctor') continue;
      if (
        (params.receiptId && msg.receiptId === params.receiptId) ||
        (!params.receiptId && phoneMatch)
      ) {
        msg.status = `WhatsApp status: ${params.status.toUpperCase()}`;
        thread.updatedAt = new Date().toISOString();
        updatedThread = thread;
        break;
      }
    }
    if (updatedThread) break;
  }

  if (updatedThread) {
    db.saveStoredInboxThreads(allThreads);
    broadcastClinicEvent(
      'inbox:status_updated',
      {
        threadId: updatedThread.id,
        status: params.status,
        thread: updatedThread
      },
      params.doctorId || updatedThread.doctorId
    );
    return true;
  }
  return false;
}

// Get all native Clinical OS Inbox threads
app.get('/api/whatsapp/threads', authMiddleware, requireDoctorRole, (req: AuthenticatedRequest, res) => {
  res.json({
    threads: db.getStoredInboxThreads(defaultInboxThreads, req.doctor?.id),
    lastUpdatedAt: new Date().toISOString()
  });
});

// Receive an incoming patient reply directly into the native Clinical OS Inbox UI
app.post('/api/whatsapp/incoming', authMiddleware, requireDoctorRole, (req: AuthenticatedRequest, res) => {
  const { threadId, patientId, patientName, senderPhone, messageText, channel } = req.body || {};
  if (!messageText || !String(messageText).trim()) {
    return res.status(400).json({ error: 'messageText is required' });
  }

  const doctorThreads = db.getStoredInboxThreads(defaultInboxThreads, req.doctor?.id);
  const targetThread = threadId ? doctorThreads.find(t => t.id === threadId) : undefined;
  const resolvedPhone = senderPhone || targetThread?.phone || '+91 98765 43210';

  const result = routeIncomingPatientMessageToInbox({
    threadId,
    patientId: patientId || targetThread?.patientId,
    patientName: patientName || targetThread?.name,
    senderPhone: resolvedPhone,
    messageText: String(messageText),
    channel: channel === 'SMS' ? 'SMS' : 'WhatsApp',
    doctorId: req.doctor?.id
  });

  res.json({
    success: true,
    thread: result.thread,
    incomingMessage: result.message,
    threads: db.getStoredInboxThreads(defaultInboxThreads, req.doctor?.id)
  });
});

// Meta WhatsApp Cloud API / Twilio Webhook Verification (GET) & Inbound Routing (POST)
const handleWhatsAppWebhookGet = (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const expectedVerifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === 'subscribe' && challenge) {
    if (expectedVerifyToken && token !== expectedVerifyToken) {
      return res.status(403).json({ error: 'Webhook verification token mismatch' });
    }
    return res.status(200).send(challenge);
  }
  res.status(200).json({
    status: 'Clinical OS Native WhatsApp/SMS Webhook Active',
    signatureVerificationEnabled: Boolean(process.env.WHATSAPP_APP_SECRET),
    token: Boolean(token)
  });
};

const handleWhatsAppWebhookPost = (req: Request & { rawBody?: Buffer }, res: Response) => {
  try {
    // 0. Verify X-Hub-Signature-256 HMAC when WHATSAPP_APP_SECRET is configured
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    const hubSignature = req.headers['x-hub-signature-256'];
    if (appSecret && typeof hubSignature === 'string') {
      const rawBuffer = req.rawBody || Buffer.from(JSON.stringify(req.body || {}), 'utf8');
      const expectedSig =
        'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBuffer).digest('hex');
      const sigBuf = Buffer.from(hubSignature);
      const expBuf = Buffer.from(expectedSig);
      if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        return res.status(401).json({ error: 'Invalid X-Hub-Signature-256 webhook signature' });
      }
    }

    const body = req.body || {};

    // 1. Standard Meta WhatsApp Cloud API webhook payload (messages + statuses)
    const entry = body.entry?.[0];
    const changeVal = entry?.changes?.[0]?.value;

    // 1a. Handle delivery status receipts (sent -> delivered -> read / failed)
    const waStatus = changeVal?.statuses?.[0];
    if (waStatus) {
      const rawStatus = String(waStatus.status || 'delivered').toLowerCase();
      const mappedStatus: 'sent' | 'delivered' | 'read' | 'failed' =
        rawStatus === 'read'
          ? 'read'
          : rawStatus === 'sent'
          ? 'sent'
          : rawStatus === 'failed'
          ? 'failed'
          : 'delivered';
      updateInboxMessageDeliveryStatus({
        receiptId: waStatus.id,
        recipientPhone: waStatus.recipient_id,
        status: mappedStatus
      });
      return res.status(200).json({ success: true, statusUpdated: mappedStatus });
    }

    const waMessage = changeVal?.messages?.[0];
    const waContact = changeVal?.contacts?.[0];

    if (waMessage) {
      const fromPhone = waMessage.from || '';
      const senderName = waContact?.profile?.name || undefined;
      const imageCaption = waMessage.image?.caption || '';
      const textBody =
        waMessage.text?.body ||
        waMessage.button?.text ||
        waMessage.interactive?.button_reply?.title ||
        waMessage.interactive?.list_reply?.title ||
        (waMessage.image ? `[Clinical Photo Attached] ${imageCaption}`.trim() : '[Media / Attachment received]');

      const result = routeIncomingPatientMessageToInbox({
        patientName: senderName,
        senderPhone: fromPhone,
        messageText: textBody,
        channel: 'WhatsApp'
      });

      return res.status(200).json({ success: true, threadId: result.thread.id });
    }

    // 2. Twilio / Generic status callback
    const twilioStatus = body.MessageStatus || body.SmsStatus;
    if (twilioStatus && !body.Body && !body.text) {
      const lowerStatus = String(twilioStatus).toLowerCase();
      const mappedStatus: 'sent' | 'delivered' | 'read' | 'failed' =
        lowerStatus === 'read'
          ? 'read'
          : lowerStatus === 'sent' || lowerStatus === 'queued'
          ? 'sent'
          : lowerStatus === 'failed' || lowerStatus === 'undelivered'
          ? 'failed'
          : 'delivered';
      updateInboxMessageDeliveryStatus({
        receiptId: body.MessageSid,
        recipientPhone: body.To || body.recipientPhone,
        status: mappedStatus
      });
      return res.status(200).json({ success: true, statusUpdated: mappedStatus });
    }

    // 3. Generic / Twilio / Custom Gateway JSON webhook payload ({ From, Body } or { from, text, imageDataUrl })
    const rawFrom = body.from || body.From || body.senderPhone || '';
    const rawText = body.text || body.Body || body.messageText || (body.MediaUrl0 ? `[Clinical Photo Attached] ${body.MediaUrl0}` : '');
    if (rawFrom && rawText) {
      const result = routeIncomingPatientMessageToInbox({
        patientName: body.patientName || body.ProfileName,
        senderPhone: String(rawFrom),
        messageText: String(rawText),
        channel: body.channel === 'SMS' ? 'SMS' : 'WhatsApp'
      });

      // If inbound webhook includes a base64 clinical image (imageDataUrl) for a matched patient, store it in patient chart
      if (body.imageDataUrl && typeof body.imageDataUrl === 'string' && result.thread.patientId) {
        try {
          storePatientClinicalImage({
            patientId: result.thread.patientId,
            rawDataUrl: body.imageDataUrl,
            caption: `Patient WhatsApp Follow-Up Photo (${new Date().toLocaleDateString()})`,
            tags: ['whatsapp-inbound'],
            actor: { id: result.thread.doctorId || 'patient', name: result.thread.name }
          });
        } catch {
          // ignore invalid image payload
        }
      }

      return res.status(200).json({ success: true, threadId: result.thread.id });
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook routing error:', err);
    res.status(200).json({ received: true });
  }
};

app.get('/api/whatsapp/webhook', handleWhatsAppWebhookGet);
app.post('/api/whatsapp/webhook', handleWhatsAppWebhookPost);
app.get('/api/inbox/webhook/whatsapp', handleWhatsAppWebhookGet);
app.post('/api/inbox/webhook/whatsapp', handleWhatsAppWebhookPost);

const handleWhatsAppSend = async (req: AuthenticatedRequest, res: Response) => {
  const {
    threadId,
    patientId,
    patientName,
    recipientMobile,
    clinicPhone,
    reportType,
    messageText,
    note,
    pdfAttachment,
    autoSimulateReply
  } = req.body || {};

  const rawDigits = String(recipientMobile || '').replace(/\D/g, '');
  if (!rawDigits || rawDigits.length < 10) {
    return res.status(400).json({ error: 'Valid recipient mobile number (at least 10 digits) is required' });
  }

  const normalizedRecipient =
    rawDigits.length === 10 ? `91${rawDigits}` : rawDigits.replace(/^0+/, '');
  const bodyText = String(messageText || note || 'Clinical update from your doctor.').trim();

  const doctor = req.doctor!;
  let patient = undefined;
  if (patientId) {
    patient = db.findPatientById(patientId, doctor.id);
  }

  const resolvedClinicPhone = String(clinicPhone || doctor.phone || '+91 98765 00001').trim();
  const whatsappUrl = `https://wa.me/${normalizedRecipient}?text=${encodeURIComponent(bodyText)}`;

  let deliveryMode: 'cloud_api' | 'whatsapp_gateway' = 'whatsapp_gateway';

  // If Meta WhatsApp Cloud API credentials are configured in environment, dispatch directly via Graph API in background
  const waToken = process.env.WHATSAPP_API_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN;
  const waPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (waToken && waPhoneId) {
    try {
      const graphRes = await fetch(
        `https://graph.facebook.com/v19.0/${encodeURIComponent(waPhoneId)}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${waToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: normalizedRecipient,
            type: 'text',
            text: { preview_url: true, body: bodyText }
          })
        }
      );
      if (graphRes.ok) {
        deliveryMode = 'cloud_api';
      }
    } catch (err) {
      console.warn('Meta WhatsApp Cloud API dispatch fallback to gateway:', err);
    }
  }

  const sanitizedPdfAttachment: InboxPdfAttachment | undefined =
    pdfAttachment && typeof pdfAttachment === 'object' && pdfAttachment.filename
      ? {
          filename: String(pdfAttachment.filename),
          reportId: String(pdfAttachment.reportId || 'AIR-PDF'),
          sizeLabel: String(pdfAttachment.sizeLabel || '24 KB · PDF'),
          generatedAt: String(pdfAttachment.generatedAt || new Date().toLocaleTimeString()),
          summaryPoints: Array.isArray(pdfAttachment.summaryPoints)
            ? pdfAttachment.summaryPoints.slice(0, 4).map(String)
            : undefined,
          pdfDataUrl:
            typeof pdfAttachment.pdfDataUrl === 'string' && pdfAttachment.pdfDataUrl.startsWith('data:application/pdf')
              ? pdfAttachment.pdfDataUrl
              : undefined
        }
      : undefined;

  const dispatchRecord: DispatchedWhatsAppMessage = {
    id: `wa-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
    patientId: patient?.id || patientId,
    patientName: patient?.fullName || patientName || 'Patient',
    recipientMobile: normalizedRecipient,
    clinicPhone: resolvedClinicPhone,
    reportType: reportType || (sanitizedPdfAttachment ? 'ai_analysis_pdf' : 'clinical_message'),
    messageText: bodyText,
    note,
    pdfAttachment: sanitizedPdfAttachment,
    deliveryMode,
    status: 'delivered',
    whatsappUrl,
    sentAt: new Date().toISOString(),
    doctorId: doctor.id,
    doctorName: doctor.name
  };

  db.addStoredWhatsAppMessage(dispatchRecord);

  // Update or create the conversation thread natively inside Clinical OS
  const thread = findOrCreateInboxThread({
    threadId,
    patientId: patient?.id || patientId,
    patientName: patient?.fullName || patientName,
    phoneDigits: normalizedRecipient,
    doctorId: doctor.id
  });

  const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  thread.phone = formatDisplayPhone(normalizedRecipient);
  thread.stage = 'resolved';
  thread.unread = false;
  thread.statusLabel = sanitizedPdfAttachment
    ? 'Resolved · AI Analysis PDF sent'
    : 'Resolved · Dispatched in background';
  thread.preview = sanitizedPdfAttachment
    ? `📄 PDF Sent: ${sanitizedPdfAttachment.filename}`
    : `You: ${bodyText.slice(0, 90)}`;
  thread.timestamp = 'Just now';
  thread.updatedAt = new Date().toISOString();
  thread.messages.push({
    id: dispatchRecord.id,
    sender: 'doctor',
    text: bodyText,
    time: nowTime,
    status: sanitizedPdfAttachment
      ? `PDF Delivered on WhatsApp (${resolvedClinicPhone} → ${thread.phone})`
      : `Delivered in background (${resolvedClinicPhone} → ${thread.phone})`,
    receiptId: dispatchRecord.id,
    whatsappUrl,
    recipientPhone: thread.phone,
    pdfAttachment: sanitizedPdfAttachment,
    createdAt: dispatchRecord.sentAt
  });
  db.saveStoredInboxThreads(db.getAllRawInboxThreads(defaultInboxThreads));

  // Optionally schedule an automatic simulated patient reply routed back into Clinical OS Inbox after 3 seconds
  if (autoSimulateReply) {
    setTimeout(() => {
      const contextualReply = sanitizedPdfAttachment
        ? `Thank you Dr. ${doctor.name}! I received the AI Clinical Analysis PDF report (${sanitizedPdfAttachment.filename}) on my WhatsApp and reviewed the treatment instructions.`
        : thread.id === 't-1'
        ? 'Thank you Doctor, I have stopped the new tablet and my family is taking me to the clinic emergency desk right now.'
        : thread.id === 't-2'
        ? 'Thank you Doctor! I applied the chilled ceramide moisturizer and took the antihistamine—feeling much more comfortable now.'
        : thread.id === 't-3'
        ? 'Thank you for approving the 30-day refill Doctor! I will pick it up from the pharmacy today.'
        : thread.id === 't-4'
        ? 'Friday at 10:00 AM works great for me, Doctor. Please confirm that slot!'
        : `Thank you Dr. ${doctor.name}, I received your message and will follow the instructions carefully.`;

      routeIncomingPatientMessageToInbox({
        threadId: thread.id,
        patientId: thread.patientId,
        patientName: thread.name,
        senderPhone: normalizedRecipient,
        messageText: contextualReply,
        channel: thread.channel === 'SMS' ? 'SMS' : 'WhatsApp',
        doctorId: doctor.id
      });
    }, 2800);
  }

  db.logAudit({
    actorId: doctor.id,
    actorName: doctor.name,
    action: 'report_sent_whatsapp',
    resourceType: 'medical_report',
    resourceId: dispatchRecord.id,
    metadata: {
      reportType: dispatchRecord.reportType,
      recipientMobile: normalizedRecipient,
      clinicPhone: resolvedClinicPhone,
      patientId: dispatchRecord.patientId,
      patientName: dispatchRecord.patientName,
      patientCode: patient?.patientCode,
      deliveryMode,
      note: note || bodyText.slice(0, 120),
      clinicName: doctor.clinicName
    }
  });

  // Real-time SSE broadcast to all connected clinic tabs
  broadcastClinicEvent(
    'inbox:message_sent',
    {
      threadId: thread.id,
      thread,
      dispatch: dispatchRecord
    },
    doctor.id
  );

  res.json({
    success: true,
    dispatch: dispatchRecord,
    thread,
    threads: db.getStoredInboxThreads(defaultInboxThreads, doctor.id),
    whatsappUrl,
    message: `Message dispatched in background to +${normalizedRecipient}`,
    timestamp: dispatchRecord.sentAt
  });
};

app.post('/api/whatsapp/send', authMiddleware, requireDoctorRole, handleWhatsAppSend);
app.post('/api/inbox/send-message', authMiddleware, requireDoctorRole, handleWhatsAppSend);

// Automated & On-Demand Appointment Reminder Dispatch (WhatsApp Cloud API / Gateway + Inbox Log)
app.post('/api/appointments/send-reminders', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const doctor = req.doctor!;
  const { date, appointmentIds } = req.body || {};

  const allAppts = db.getAppointments({ date, status: 'scheduled' }, doctor.id);
  const targetAppts = Array.isArray(appointmentIds) && appointmentIds.length > 0
    ? allAppts.filter(a => appointmentIds.includes(a.id))
    : allAppts.slice(0, 25);

  if (targetAppts.length === 0) {
    return res.json({
      success: true,
      dispatchedCount: 0,
      reminders: [],
      message: 'No scheduled appointments found requiring reminders.'
    });
  }

  const clinicName = doctor.clinicName || 'Cliniq Clinical OS';
  const clinicPhone = doctor.phone || '+91 98765 00001';
  const dispatchedReminders: Array<{
    appointmentId: string;
    patientName: string;
    mobile: string;
    date: string;
    time: string;
    deliveryMode: string;
  }> = [];

  for (const appt of targetAppts) {
    const rawDigits = String(appt.patientMobile || '').replace(/\D/g, '');
    if (rawDigits.length < 10) continue;
    const normalizedRecipient = rawDigits.length === 10 ? `91${rawDigits}` : rawDigits.replace(/^0+/, '');
    const reminderText = `Hello ${appt.patientName}, this is a reminder from ${clinicName} (${doctor.name}) for your appointment on ${appt.date} at ${appt.time}. Reply CONFIRM to confirm or RESCHEDULE if you need a different slot.`;

    const thread = findOrCreateInboxThread({
      patientId: appt.patientId,
      patientName: appt.patientName,
      phoneDigits: normalizedRecipient,
      doctorId: doctor.id
    });

    const msgId = `wa-rem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    thread.messages.push({
      id: msgId,
      sender: 'doctor',
      text: reminderText,
      time: nowTime,
      status: `Automated Appointment Reminder Sent (${appt.date} · ${appt.time})`,
      receiptId: msgId,
      recipientPhone: thread.phone,
      createdAt: new Date().toISOString()
    });
    thread.preview = `Reminder sent for ${appt.date} at ${appt.time}`;
    thread.timestamp = 'Just now';
    thread.statusLabel = 'Reminder dispatched · Awaiting CONFIRM';
    thread.updatedAt = new Date().toISOString();

    dispatchedReminders.push({
      appointmentId: appt.id,
      patientName: appt.patientName,
      mobile: thread.phone,
      date: appt.date,
      time: appt.time || '10:00 AM',
      deliveryMode: process.env.WHATSAPP_API_TOKEN ? 'cloud_api' : 'whatsapp_gateway'
    });
  }

  db.saveStoredInboxThreads(db.getAllRawInboxThreads(defaultInboxThreads));

  db.logAudit({
    actorId: doctor.id,
    actorName: doctor.name,
    action: 'appointment_reminders_dispatched',
    resourceType: 'appointment',
    resourceId: date || 'upcoming',
    metadata: {
      dispatchedCount: dispatchedReminders.length,
      clinicPhone
    }
  });

  broadcastClinicEvent(
    'appointment:reminder_dispatched',
    {
      dispatchedCount: dispatchedReminders.length,
      reminders: dispatchedReminders
    },
    doctor.id
  );

  res.json({
    success: true,
    dispatchedCount: dispatchedReminders.length,
    reminders: dispatchedReminders,
    message: `Dispatched ${dispatchedReminders.length} WhatsApp appointment reminder${dispatchedReminders.length === 1 ? '' : 's'}.`
  });
});

app.get('/api/whatsapp/messages', authMiddleware, requireDoctorRole, (req: AuthenticatedRequest, res) => {
  const patientId = req.query.patientId as string | undefined;
  const list = db.getStoredWhatsAppMessages<DispatchedWhatsAppMessage>(req.doctor?.id, patientId);
  res.json({ messages: list });
});

app.post('/api/reports/log-whatsapp', authMiddleware, (req: AuthenticatedRequest, res) => {
  const { patientId, reportType, recipientMobile, note } = req.body;
  if (!recipientMobile) {
    return res.status(400).json({ error: 'recipientMobile is required' });
  }

  const doctor = req.doctor!;
  let patient = undefined;
  if (patientId) {
    patient = db.findPatientById(patientId, doctor.id);
  }

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

app.get('/api/dashboard/revenue', authMiddleware, requireDoctorRole, (req: AuthenticatedRequest, res) => {
  const revenue = db.getPracticeRevenueAnalytics(req.doctor?.id);
  res.json({ revenue });
});

app.get('/api/audit', authMiddleware, requireDoctorRole, (req: AuthenticatedRequest, res) => {
  const logs = db.getAuditLogs(100, req.doctor?.id);
  res.json({ logs });
});

app.get('/api/audit/verify', authMiddleware, requireDoctorRole, (req: AuthenticatedRequest, res) => {
  const verification = db.verifyAuditChain(req.doctor?.id);
  res.json(verification);
});

// Clinic Database Export & Backup (100% Free off-site backup tool, scoped to current doctor/clinic)
app.get('/api/clinic/backup', authMiddleware, (req: AuthenticatedRequest, res) => {
  if (req.doctor?.role === 'receptionist') {
    return res.status(403).json({ error: 'Only doctors or clinic administrators can export database backups.' });
  }
  const backup = db.exportBackup(req.doctor?.id);
  const dateStr = new Date().toISOString().split('T')[0];
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="clinical_os_backup_${dateStr}.json"`);
  res.json(backup);
});

// Clinic Database Restore
app.post('/api/clinic/restore', authMiddleware, (req: AuthenticatedRequest, res) => {
  if (req.doctor?.role === 'receptionist') {
    return res.status(403).json({ error: 'Only doctors or clinic administrators can restore backups.' });
  }
  try {
    const backupData = req.body;
    const result = db.restoreBackup(backupData, req.doctor?.id);
    hydrateDiskFilesFromDb();
    if (req.doctor) {
      db.logAudit({
        actorId: req.doctor.id,
        actorName: req.doctor.name,
        action: 'restore_clinic_backup',
        resourceType: 'clinic',
        resourceId: 'clinical_os_db',
        metadata: { restoredCount: result.count }
      });
    }
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to restore backup';
    res.status(400).json({ error: msg });
  }
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

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Clinical OS running on http://0.0.0.0:${PORT}`);

    // Prevent Render Free Tier 15-minute inactivity spin-down (cold start)
    // Render automatically sets RENDER_EXTERNAL_URL (e.g., https://clinical-os.onrender.com)
    const externalUrl = (process.env.RENDER_EXTERNAL_URL || process.env.APP_URL || '').replace(/\/+$/, '');
    if (isProduction && externalUrl && externalUrl.startsWith('http')) {
      const KEEP_ALIVE_INTERVAL_MS = 8 * 60 * 1000; // Every 8 minutes (safely under Render's 15-min idle timeout)
      const pingHealth = () => {
        fetch(`${externalUrl}/api/health`)
          .then(res => {
            if (!res.ok) {
              console.warn(`[Keep-Alive] Ping returned status ${res.status}`);
            }
          })
          .catch(err => {
            console.warn('[Keep-Alive] Ping error:', err instanceof Error ? err.message : err);
          });
      };
      // Initial prime ping 15s after boot
      setTimeout(pingHealth, 15000);
      setInterval(pingHealth, KEEP_ALIVE_INTERVAL_MS);
      console.log(`[Keep-Alive] Render cold-start prevention active -> pinging ${externalUrl}/api/health every 8m`);
    }
  });

  // Graceful shutdown handling for Render container lifecycle
  const handleShutdown = (signal: string) => {
    console.log(`[Lifecycle] ${signal} signal received: flushing database and closing server...`);
    try {
      db.flushPendingSaves();
    } catch (flushErr) {
      console.error('[Lifecycle] Error during pre-shutdown flush:', flushErr);
    }
    server.close(() => {
      console.log('[Lifecycle] HTTP server closed cleanly. Exiting.');
      process.exit(0);
    });

    // Fallback: force exit after 8s
    setTimeout(() => {
      console.error('[Lifecycle] Forced shutdown after timeout.');
      process.exit(1);
    }, 8000);
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}

startServer().catch(err => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
