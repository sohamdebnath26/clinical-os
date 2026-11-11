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
  AIImageAnalysisResult,
  ProgressionAnalysisResult,
  ABCDEScoreResult,
  PatientTestReport,
  DoctorFormularyItem
} from '../types/index';

const TOKEN_KEY = 'clinical_os_token';
const DOCTOR_KEY = 'clinical_os_doctor';

let inMemoryToken: string | null = null;
let inMemoryDoctor: Doctor | null = null;

export const authStorage = {
  getToken: (): string | null => {
    if (inMemoryToken) return inMemoryToken;
    try {
      if (typeof window !== 'undefined') {
        const stored =
          window.sessionStorage.getItem(TOKEN_KEY) ||
          window.localStorage.getItem(TOKEN_KEY);
        if (stored) {
          inMemoryToken = stored;
          return stored;
        }
      }
    } catch {
      // ignore storage errors
    }
    return null;
  },
  setToken: (token: string) => {
    const changed = inMemoryToken !== token;
    inMemoryToken = token;
    try {
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(TOKEN_KEY, token);
        window.localStorage.setItem(TOKEN_KEY, token);
        if (changed) {
          window.dispatchEvent(new Event('clinical_os_auth_token_changed'));
        }
      }
    } catch {
      // ignore storage errors
    }
  },
  getDoctor: (): Doctor | null => {
    if (inMemoryDoctor) return inMemoryDoctor;
    try {
      if (typeof window !== 'undefined') {
        const raw =
          window.sessionStorage.getItem(DOCTOR_KEY) ||
          window.localStorage.getItem(DOCTOR_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Doctor;
          if (parsed && parsed.id) {
            inMemoryDoctor = parsed;
            return parsed;
          }
        }
      }
    } catch {
      // ignore storage errors
    }
    return null;
  },
  setDoctor: (doctor: Doctor) => {
    const prevId = inMemoryDoctor?.id;
    const prevRole = inMemoryDoctor?.role;
    inMemoryDoctor = doctor;
    if (prevId !== doctor.id || prevRole !== doctor.role) {
      MEMORY_CACHE.clear();
    }
    try {
      if (typeof window !== 'undefined') {
        const serialized = JSON.stringify(doctor);
        window.sessionStorage.setItem(DOCTOR_KEY, serialized);
        window.localStorage.setItem(DOCTOR_KEY, serialized);
      }
    } catch {
      // ignore storage errors
    }
  },
  clearToken: () => {
    inMemoryToken = null;
    inMemoryDoctor = null;
    MEMORY_CACHE.clear();
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(TOKEN_KEY);
        window.sessionStorage.removeItem(TOKEN_KEY);
        window.localStorage.removeItem(DOCTOR_KEY);
        window.sessionStorage.removeItem(DOCTOR_KEY);
        window.dispatchEvent(new Event('clinical_os_auth_token_changed'));
      }
    } catch {
      // ignore
    }
  },
};

const PATIENT_VAULT_PREFIX = 'clinical_os_doctor_patients_v2_';

export const patientVaultStorage = {
  getVaultKeys: (doctor?: Doctor | null): string[] => {
    const doc = doctor || authStorage.getDoctor();
    if (!doc) return [];
    const keys: string[] = [];
    if (doc.email) {
      keys.push(`${PATIENT_VAULT_PREFIX}email_${doc.email.trim().toLowerCase()}`);
    }
    if (doc.id) {
      keys.push(`${PATIENT_VAULT_PREFIX}id_${doc.id.trim()}`);
    }
    return keys;
  },

  getPatientsForCurrentDoctor: (doctor?: Doctor | null): Patient[] => {
    if (typeof window === 'undefined') return [];
    const keys = patientVaultStorage.getVaultKeys(doctor);
    const map = new Map<string, Patient>();
    for (const key of keys) {
      try {
        const raw = window.localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw) as Patient[];
        if (Array.isArray(parsed)) {
          for (const pat of parsed) {
            if (pat && pat.id && pat.fullName) {
              map.set(pat.id, pat);
            }
          }
        }
      } catch {
        // ignore storage parse error
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  },

  savePatient: (patient: Patient, doctor?: Doctor | null) => {
    if (typeof window === 'undefined' || !patient || !patient.id) return;
    const doc = doctor || authStorage.getDoctor();
    const enriched: Patient = {
      ...patient,
      createdById: patient.createdById || doc?.id,
      createdByEmail: patient.createdByEmail || doc?.email?.toLowerCase()
    };
    const keys = patientVaultStorage.getVaultKeys(doc);
    for (const key of keys) {
      try {
        const existingRaw = window.localStorage.getItem(key);
        const existing: Patient[] = existingRaw ? JSON.parse(existingRaw) : [];
        const list = Array.isArray(existing) ? existing : [];
        const idx = list.findIndex(p => p.id === enriched.id);
        if (idx >= 0) {
          list[idx] = enriched;
        } else {
          list.unshift(enriched);
        }
        window.localStorage.setItem(key, JSON.stringify(list.slice(0, 500)));
      } catch {
        // ignore storage quota errors
      }
    }
  },

  savePatientsList: (patients: Patient[], doctor?: Doctor | null) => {
    if (typeof window === 'undefined' || !Array.isArray(patients)) return;
    for (const p of patients) {
      if (p && p.id) {
        patientVaultStorage.savePatient(p, doctor);
      }
    }
  },

  removePatient: (patientId: string, doctor?: Doctor | null) => {
    if (typeof window === 'undefined' || !patientId) return;
    const doc = doctor || authStorage.getDoctor();
    const keys = patientVaultStorage.getVaultKeys(doc);
    for (const key of keys) {
      try {
        const existingRaw = window.localStorage.getItem(key);
        if (!existingRaw) continue;
        const list: Patient[] = JSON.parse(existingRaw);
        if (Array.isArray(list)) {
          const filtered = list.filter(p => p.id !== patientId);
          window.localStorage.setItem(key, JSON.stringify(filtered));
        }
      } catch {
        // ignore
      }
    }
  }
};

// Fast In-Memory + SessionStorage SWR Cache Layer (<1ms instant retrieval)
const MEMORY_CACHE = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes sliding freshness

function resolveCacheScopeKey(rawKey: string): string {
  const doc = authStorage.getDoctor();
  const scope = doc ? `${doc.id}_${doc.role || 'doctor'}_` : 'anon_';
  return `${scope}${rawKey}`;
}

export const fastCache = {
  get: <T>(key: string): T | null => {
    const scopedKey = resolveCacheScopeKey(key);
    // 1. In-memory check
    const mem = MEMORY_CACHE.get(scopedKey);
    if (mem && Date.now() - mem.timestamp < CACHE_TTL_MS) {
      return mem.data as T;
    }
    // 2. Storage fallback
    try {
      if (typeof window !== 'undefined') {
        const raw = window.sessionStorage.getItem(scopedKey) || window.localStorage.getItem(scopedKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.data !== undefined) {
            MEMORY_CACHE.set(scopedKey, { data: parsed.data, timestamp: parsed.timestamp || Date.now() });
            return parsed.data as T;
          }
        }
      }
    } catch {
      // ignore storage errors
    }
    return null;
  },
  set: <T>(key: string, data: T) => {
    const scopedKey = resolveCacheScopeKey(key);
    const entry = { data, timestamp: Date.now() };
    MEMORY_CACHE.set(scopedKey, entry);
    try {
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(scopedKey, JSON.stringify(entry));
      }
    } catch {
      // ignore storage quota errors
    }
  },
  invalidate: (keyPrefix?: string) => {
    if (!keyPrefix) {
      MEMORY_CACHE.clear();
      return;
    }
    const scopedPrefix = resolveCacheScopeKey(keyPrefix);
    for (const k of Array.from(MEMORY_CACHE.keys())) {
      if (k.startsWith(scopedPrefix) || k.includes(keyPrefix)) MEMORY_CACHE.delete(k);
    }
  }
};

async function fetchWithAuth<T>(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {},
  isRetry = false
): Promise<T> {
  const isGet = !options.method || options.method.toUpperCase() === 'GET';
  const token = authStorage.getToken();
  const storedDoctor = authStorage.getDoctor();
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (storedDoctor) {
    if (storedDoctor.id) headers.set('X-Doctor-Id', storedDoctor.id);
    if (storedDoctor.email) headers.set('X-Doctor-Email', storedDoctor.email);
    if (storedDoctor.name) headers.set('X-Doctor-Name', storedDoctor.name);
  }

  // Resilient timeout controller (defaults to 10s so requests never hang indefinitely)
  const timeoutMs = options.timeoutMs || (isGet ? 10000 : 25000);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      credentials: 'include',
      headers,
      signal: options.signal || controller.signal,
    });
  } catch (networkErr: unknown) {
    clearTimeout(timeoutId);
    // If it's a GET request and network timed out or disconnected (e.g. Render cold start),
    // transparently fallback to cached data so the user never sees a broken screen!
    if (isGet) {
      const cached = fastCache.get<T>(`api_${url}`);
      if (cached !== null) {
        console.warn(`[FastCache Fallback] Network request failed for ${url}, serving cached snapshot:`, networkErr);
        return cached;
      }
    }
    throw networkErr;
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 401) {
    const isAuthCredentialRoute =
      url.includes('/api/auth/login') ||
      url.includes('/api/auth/register') ||
      url.includes('/api/auth/restore');

    // Transparently re-establish session if server restarted or token expired mid-workflow
    if (!isRetry && !isAuthCredentialRoute && storedDoctor && token) {
      try {
        const restoreRes = await fetch('/api/auth/restore', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ ...storedDoctor, token }),
        });
        if (restoreRes.ok) {
          const restoredData = (await restoreRes.json()) as { token: string; doctor: Doctor };
          if (restoredData.token) {
            authStorage.setToken(restoredData.token);
          }
          if (restoredData.doctor) {
            authStorage.setDoctor(restoredData.doctor);
          }
          return fetchWithAuth<T>(url, options, true);
        }
      } catch {
        // ignore restore error and fall through
      }
    }

    if (!isAuthCredentialRoute) {
      authStorage.clearToken();
      window.dispatchEvent(new Event('clinical_os_unauthorized'));
      throw new Error('Session expired or unauthorized');
    }
  }

  if (!response.ok) {
    // If server returned 502/503/504 while waking up, try cache fallback for GET
    if (isGet && (response.status === 502 || response.status === 503 || response.status === 504)) {
      const cached = fastCache.get<T>(`api_${url}`);
      if (cached !== null) {
        console.warn(`[FastCache Fallback] Server status ${response.status} for ${url}, serving cached snapshot.`);
        return cached;
      }
    }

    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    try {
      const errorJson = await response.json();
      if (errorJson.error) errorMessage = errorJson.error;
    } catch {
      // ignore
    }
    throw new Error(errorMessage);
  }

  const resultData = (await response.json()) as T;
  // Automatically update fastCache on successful GET requests
  if (isGet) {
    fastCache.set(`api_${url}`, resultData);
  }
  return resultData;
}

export const api = {
  auth: {
    login: (credentials: { email: string; password: string }) =>
      fetchWithAuth<{ token: string; doctor: Doctor }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      }),
    sso: (params?: { organization?: string; email?: string; name?: string; department?: string; password?: string; idToken?: string }) =>
      fetchWithAuth<{ token: string; doctor: Doctor }>('/api/auth/sso', {
        method: 'POST',
        body: JSON.stringify(params || {}),
      }),
    google: (params?: { email?: string; name?: string; password?: string; idToken?: string }) =>
      fetchWithAuth<{ token: string; doctor: Doctor }>('/api/auth/google', {
        method: 'POST',
        body: JSON.stringify(params || {}),
      }),
    register: (data: {
      name: string;
      email: string;
      password: string;
      speciality?: string;
      registrationNumber?: string;
      clinicName?: string;
      phone?: string;
    }) =>
      fetchWithAuth<{ token: string; doctor: Doctor }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    me: () => fetchWithAuth<{ doctor: Doctor }>('/api/auth/me'),
    logout: () =>
      fetchWithAuth<{ message: string }>('/api/auth/logout', { method: 'POST' }),
    updateProfile: (data: Partial<Doctor>) =>
      fetchWithAuth<{ doctor: Doctor }>('/api/doctor/profile', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
  },

  staff: {
    list: () => fetchWithAuth<{ staff: Doctor[] }>('/api/staff'),
    assign: (data: { email: string; name?: string; role: 'doctor' | 'receptionist' }) =>
      fetchWithAuth<{ account: Doctor; staff: Doctor[] }>('/api/staff/assign', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    updateRole: (id: string, role: 'doctor' | 'receptionist') =>
      fetchWithAuth<{ account: Doctor; staff: Doctor[] }>(`/api/staff/${id}/role`, {
        method: 'PUT',
        body: JSON.stringify({ role }),
      }),
    remove: (id: string) =>
      fetchWithAuth<{ success: boolean; staff: Doctor[] }>(`/api/staff/${id}`, {
        method: 'DELETE',
      }),
    switchSession: (params: { targetId?: string; targetRole?: 'doctor' | 'receptionist'; password?: string }) =>
      fetchWithAuth<{ token: string; doctor: Doctor }>('/api/staff/switch-session', {
        method: 'POST',
        body: JSON.stringify(params),
      }),
  },

  patients: {
    getCachedList: (query?: string): Patient[] => {
      const url = `/api/patients${query ? `?q=${encodeURIComponent(query)}` : ''}`;
      const cached = fastCache.get<{ patients: Patient[] }>(`api_${url}`);
      if (cached && Array.isArray(cached.patients)) {
        return cached.patients;
      }
      const vaultPatients = patientVaultStorage.getPatientsForCurrentDoctor();
      if (vaultPatients.length > 0) {
        if (!query) return vaultPatients;
        const q = query.toLowerCase().trim();
        const cleanDigits = q.replace(/\D/g, '');
        return vaultPatients.filter(
          p =>
            p.fullName.toLowerCase().includes(q) ||
            p.patientCode.toLowerCase().includes(q) ||
            (p.mobile && p.mobile.toLowerCase().includes(q)) ||
            (cleanDigits.length >= 3 && p.mobile && p.mobile.replace(/\D/g, '').includes(cleanDigits))
        );
      }
      return [];
    },
    list: async (query?: string) => {
      const res = await fetchWithAuth<{ patients: Patient[] }>(
        `/api/patients${query ? `?q=${encodeURIComponent(query)}` : ''}`
      );
      const serverPatients = Array.isArray(res.patients) ? res.patients : [];
      const currentDoctor = authStorage.getDoctor();

      // Check if local doctor vault has stored patients not yet present on the server (e.g. after Render container spin-down)
      const vaultPatients = patientVaultStorage.getPatientsForCurrentDoctor(currentDoctor);
      const serverIds = new Set(serverPatients.map(p => p.id));
      const missingOnServer = vaultPatients.filter(vp => !serverIds.has(vp.id));

      let mergedPatients = [...serverPatients];

      if (missingOnServer.length > 0) {
        try {
          const syncRes = await fetchWithAuth<{ patients: Patient[] }>('/api/patients/sync', {
            method: 'POST',
            body: JSON.stringify({ patients: missingOnServer }),
          });
          if (Array.isArray(syncRes.patients)) {
            mergedPatients = syncRes.patients;
          }
        } catch {
          // If sync fails transiently, merge locally so the doctor always sees their stored patients
          const combinedMap = new Map<string, Patient>();
          for (const p of [...missingOnServer, ...serverPatients]) {
            combinedMap.set(p.id, p);
          }
          mergedPatients = Array.from(combinedMap.values()).sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        }
      }

      // Persist owned patients in the current doctor's vault
      if (!query) {
        patientVaultStorage.savePatientsList(mergedPatients, currentDoctor);
      }

      if (query && query.trim()) {
        const q = query.toLowerCase().trim();
        const cleanDigits = q.replace(/\D/g, '');
        mergedPatients = mergedPatients.filter(
          p =>
            p.fullName.toLowerCase().includes(q) ||
            p.patientCode.toLowerCase().includes(q) ||
            (p.mobile && p.mobile.toLowerCase().includes(q)) ||
            (cleanDigits.length >= 3 && p.mobile && p.mobile.replace(/\D/g, '').includes(cleanDigits)) ||
            (p.primaryDiagnosis && p.primaryDiagnosis.toLowerCase().includes(q))
        );
      }

      return { patients: mergedPatients };
    },
    delete: async (id: string) => {
      const res = await fetchWithAuth<{ success: boolean; message: string }>(`/api/patients/${id}`, {
        method: 'DELETE',
      });
      patientVaultStorage.removePatient(id);
      fastCache.invalidate('api_/api/patients');
      fastCache.invalidate('api_/api/dashboard');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('clinical_os_patients_updated', { detail: { deletedId: id } }));
      }
      return res;
    },
    get: async (id: string) => {
      try {
        const res = await fetchWithAuth<{ patient: Patient }>(`/api/patients/${id}`);
        if (res.patient) {
          patientVaultStorage.savePatient(res.patient);
        }
        return res;
      } catch (err) {
        // Fallback: check if the patient is in the doctor's local vault and sync to server
        const vaultPatients = patientVaultStorage.getPatientsForCurrentDoctor();
        const found = vaultPatients.find(p => p.id === id);
        if (found) {
          try {
            await fetchWithAuth<{ patients: Patient[] }>('/api/patients/sync', {
              method: 'POST',
              body: JSON.stringify({ patients: [found] }),
            });
          } catch {
            // ignore
          }
          return { patient: found };
        }
        throw err;
      }
    },
    checkMobile: (mobile: string) =>
      fetchWithAuth<{ exists: boolean; patient?: Patient }>(
        `/api/patients/check-mobile/${encodeURIComponent(mobile)}`
      ),
    create: async (data: Partial<Patient>, force = false) => {
      const res = await fetchWithAuth<{ patient: Patient }>(
        `/api/patients${force ? '?force=true' : ''}`,
        {
          method: 'POST',
          body: JSON.stringify({ ...data, forceCreate: force }),
        }
      );
      if (res.patient) {
        patientVaultStorage.savePatient(res.patient);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('clinical_os_patients_updated', { detail: { patient: res.patient } })
          );
        }
      }
      return res;
    },
    update: async (id: string, data: Partial<Patient>) => {
      const res = await fetchWithAuth<{ patient: Patient }>(`/api/patients/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      if (res.patient) {
        patientVaultStorage.savePatient(res.patient);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('clinical_os_patients_updated', { detail: { patient: res.patient } })
          );
        }
      }
      return res;
    },
    getConsultations: (id: string) =>
      fetchWithAuth<{ consultations: Consultation[] }>(
        `/api/patients/${id}/consultations`
      ),
    getTimeline: (id: string) =>
      fetchWithAuth<{
        events: {
          id: string;
          date: string;
          symptoms: string[];
          diagnoses: string[];
          tests: string[];
          procedures: { id: string; name: string; cost: number }[];
          clinicalNotes: { examination: string; investigationsAdvised: string; plan: string };
          bodyMarkersCount: number;
          imagesCount: number;
          images?: ClinicalImage[];
          prescriptions: PrescriptionItem[];
          followUp: { date?: string; instructions?: string };
          fee: number;
          aiSummary: string;
          doctorName: string;
        }[];
      }>(`/api/patients/${id}/timeline`),
    getMarkers: (id: string) =>
      fetchWithAuth<{ markers: BodyMarker[] }>(`/api/patients/${id}/markers`),
    addMarker: (
      id: string,
      data: {
        view: 'front' | 'back';
        x: number;
        y: number;
        type: string;
        notes?: string;
        anatomicalPart?: string;
        consultationId?: string;
      }
    ) =>
      fetchWithAuth<{ marker: BodyMarker }>(`/api/patients/${id}/markers`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    getImages: (id: string) =>
      fetchWithAuth<{ images: ClinicalImage[] }>(`/api/patients/${id}/images`),
    addImage: (
      id: string,
      data: {
        url?: string;
        dataUrl?: string;
        filename?: string;
        mimeType?: string;
        caption?: string;
        bodyArea?: string;
        modality?: string;
        imageRole?: 'past' | 'current';
        examDate?: string;
        extractedFindings?: string;
        visualMetrics?: import('../types').VisualMorphologyMetrics;
        consultationId?: string;
        tags?: string[];
      }
    ) =>
      fetchWithAuth<{ image: ClinicalImage }>(`/api/patients/${id}/images`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    deleteImage: (id: string, imageId: string) =>
      fetchWithAuth<{ message: string }>(`/api/patients/${id}/images/${imageId}`, {
        method: 'DELETE',
      }),
    getPrescriptions: (id: string) =>
      fetchWithAuth<{ prescriptions: PrescriptionItem[] }>(
        `/api/patients/${id}/prescriptions`
      ),
    getReports: (id: string) =>
      fetchWithAuth<{ reports: PatientTestReport[] }>(
        `/api/patients/${id}/reports`
      ),
    addReport: (id: string, data: Partial<PatientTestReport>) =>
      fetchWithAuth<{ report: PatientTestReport }>(
        `/api/patients/${id}/reports`,
        {
          method: 'POST',
          body: JSON.stringify(data),
        }
      ),
  },

  consultations: {
    create: (data: { patientId: string; symptoms?: string[]; fee?: number }) =>
      fetchWithAuth<{ consultation: Consultation }>('/api/consultations', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    get: (id: string) =>
      fetchWithAuth<{ consultation: Consultation }>(`/api/consultations/${id}`),
    sign: (id: string, data: Partial<Consultation>) =>
      fetchWithAuth<{ consultation: Consultation }>(
        `/api/consultations/${id}/sign`,
        {
          method: 'PUT',
          body: JSON.stringify(data),
        }
      ),
  },

  prescriptions: {
    list: (patientId?: string) =>
      fetchWithAuth<{ prescriptions: PrescriptionItem[] }>(
        `/api/prescriptions${patientId ? `?patientId=${patientId}` : ''}`
      ),
    create: (data: Partial<PrescriptionItem>) =>
      fetchWithAuth<{ prescription: PrescriptionItem }>('/api/prescriptions', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    signVerificationToken: (data: {
      patientId: string;
      consultationId?: string;
      prescriptionIds?: string[];
      prescriptions?: Array<{
        medicineName: string;
        dosage: string;
        frequency: string;
        duration: string;
        instructions?: string;
      }>;
    }) =>
      fetchWithAuth<{
        token: string;
        verificationCode: string;
        signedAt: string;
      }>('/api/prescriptions/sign-token', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    verifyToken: async (token: string) => {
      const res = await fetch(`/api/prescriptions/verify/${encodeURIComponent(token)}`);
      const json = await res.json().catch(() => ({ verified: false, error: 'Verification request failed' }));
      if (!res.ok) {
        throw new Error(json.error || 'Prescription verification failed');
      }
      return json as {
        verified: boolean;
        verificationCode: string;
        signedAt: string;
        clinic: {
          name: string;
          doctorName: string;
          speciality: string;
          registrationNumber: string;
          phone: string;
        };
        patient: {
          name: string;
          patientCode: string;
          demographics: string;
        };
        medications: Array<{
          medicineName: string;
          dosage: string;
          frequency: string;
          duration: string;
          instructions: string;
        }>;
      };
    },
  },

  formulary: {
    list: () =>
      fetchWithAuth<{ items: DoctorFormularyItem[] }>('/api/formulary'),
    upsert: (data: {
      name: string;
      dosage: string;
      route?: string;
      frequency?: string;
      duration?: string;
      instructions?: string;
      category?: string;
      source?: DoctorFormularyItem['source'];
    }) =>
      fetchWithAuth<{ item: DoctorFormularyItem }>('/api/formulary', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    importData: (data: {
      fileDataUrl?: string;
      filename?: string;
      rawText?: string;
      items?: Array<Partial<DoctorFormularyItem>>;
    }) =>
      fetchWithAuth<{
        importedCount: number;
        updatedCount: number;
        totalProcessed: number;
        items: DoctorFormularyItem[];
      }>('/api/formulary/import', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      fetchWithAuth<{ success: boolean }>(`/api/formulary/${id}`, {
        method: 'DELETE',
      }),
  },

  appointments: {
    getCachedList: (params?: { patientId?: string; date?: string; status?: string }): Appointment[] => {
      const q = new URLSearchParams();
      if (params?.patientId) q.set('patientId', params.patientId);
      if (params?.date) q.set('date', params.date);
      if (params?.status) q.set('status', params.status);
      const queryStr = q.toString() ? `?${q.toString()}` : '';
      const cached = fastCache.get<{ appointments: Appointment[] }>(`api_/api/appointments${queryStr}`);
      return cached?.appointments || [];
    },
    list: (params?: { patientId?: string; date?: string; status?: string }) => {
      const q = new URLSearchParams();
      if (params?.patientId) q.set('patientId', params.patientId);
      if (params?.date) q.set('date', params.date);
      if (params?.status) q.set('status', params.status);
      const queryStr = q.toString() ? `?${q.toString()}` : '';
      return fetchWithAuth<{ appointments: Appointment[] }>(`/api/appointments${queryStr}`);
    },
    get: (id: string) =>
      fetchWithAuth<{ appointment: Appointment }>(`/api/appointments/${id}`),
    create: (data: Partial<Appointment>) =>
      fetchWithAuth<{ appointment: Appointment }>('/api/appointments', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<Appointment>) =>
      fetchWithAuth<{ appointment: Appointment }>(`/api/appointments/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      fetchWithAuth<{ success: boolean; message: string }>(`/api/appointments/${id}`, {
        method: 'DELETE',
      }),
    sendReminders: (data?: { date?: string; appointmentIds?: string[] }) =>
      fetchWithAuth<{
        success: boolean;
        dispatchedCount: number;
        reminders: Array<{
          appointmentId: string;
          patientName: string;
          mobile: string;
          date: string;
          time: string;
          deliveryMode: string;
        }>;
        message: string;
      }>('/api/appointments/send-reminders', {
        method: 'POST',
        body: JSON.stringify(data || {}),
      }),
  },

  images: {
    upload: (data: {
      patientId: string;
      consultationId?: string;
      dataUrl?: string;
      url?: string;
      filename?: string;
      mimeType?: string;
      caption?: string;
      bodyArea?: string;
      modality?: string;
      imageRole?: 'past' | 'current';
      examDate?: string;
      extractedFindings?: string;
      visualMetrics?: import('../types').VisualMorphologyMetrics;
      tags?: string[];
      bodyMarkerId?: string;
    }) =>
      fetchWithAuth<{ image: ClinicalImage }>('/api/images/upload', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      fetchWithAuth<{ message: string }>(`/api/images/${id}`, {
        method: 'DELETE',
      }),
    createMobileSession: (data: { patientId?: string; consultationId?: string }) =>
      fetchWithAuth<{
        session: {
          token: string;
          patientId: string;
          patientName: string;
          patientCode: string;
          consultationId?: string;
          doctorName: string;
          clinicName: string;
          expiresAt: string;
          uploadedImages: ClinicalImage[];
        };
      }>('/api/images/mobile-session', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    getMobileSession: async (token: string) => {
      const response = await fetch(`/api/images/mobile-session/${encodeURIComponent(token)}`);
      if (!response.ok) {
        let errorMessage = 'QR upload link expired or invalid';
        try {
          const json = await response.json();
          if (json.error) errorMessage = json.error;
        } catch {
          // ignore
        }
        throw new Error(errorMessage);
      }
      return response.json() as Promise<{
        session: {
          token: string;
          patientId: string;
          patientName: string;
          patientCode: string;
          consultationId?: string;
          doctorName: string;
          clinicName: string;
          expiresAt: string;
          uploadedImages: ClinicalImage[];
        };
      }>;
    },
    uploadViaMobileSession: async (
      token: string,
      data: { dataUrl: string; filename?: string; caption?: string; tags?: string[] }
    ) => {
      const response = await fetch(`/api/images/mobile-session/${encodeURIComponent(token)}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        let errorMessage = 'Failed to upload image from mobile';
        try {
          const json = await response.json();
          if (json.error) errorMessage = json.error;
        } catch {
          // ignore
        }
        throw new Error(errorMessage);
      }
      return response.json() as Promise<{ image: ClinicalImage; uploadedCount: number }>;
    },
  },

  walkin: {
    createMobileSession: (data: {
      mobile?: string;
      countryCode?: string;
      fullName?: string;
      sex?: string;
      age?: string;
      weight?: string;
      symptoms?: string[];
      notes?: string;
      noKnownAllergies?: boolean;
      discountPanel?: string;
    }) =>
      fetchWithAuth<{
        session: {
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
          expiresAt: string;
        };
      }>('/api/walkin/mobile-session', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    getMobileSession: async (token: string) => {
      const response = await fetch(`/api/walkin/mobile-session/${encodeURIComponent(token)}`);
      if (!response.ok) {
        let errorMessage = 'Walk-in registration link expired or invalid';
        try {
          const json = await response.json();
          if (json.error) errorMessage = json.error;
        } catch {
          // ignore
        }
        throw new Error(errorMessage);
      }
      return response.json() as Promise<{
        session: {
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
          expiresAt: string;
        };
      }>;
    },
    submitMobileSession: async (
      token: string,
      data: {
        mobile: string;
        countryCode?: string;
        fullName: string;
        sex: string;
        age: string;
        weight?: string;
        symptoms?: string[];
        notes?: string;
        noKnownAllergies?: boolean;
        discountPanel?: string;
      }
    ) => {
      const response = await fetch(`/api/walkin/mobile-session/${encodeURIComponent(token)}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        let errorMessage = 'Failed to submit walk-in details';
        try {
          const json = await response.json();
          if (json.error) errorMessage = json.error;
        } catch {
          // ignore
        }
        throw new Error(errorMessage);
      }
      return response.json() as Promise<{
        session: {
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
          expiresAt: string;
        };
      }>;
    },
  },

  portal: {
    getSession: async (token: string) => {
      const response = await fetch(`/api/portal/session/${encodeURIComponent(token)}`);
      if (!response.ok) {
        let errorMessage = 'This patient reply link has expired or is invalid.';
        try {
          const json = await response.json();
          if (json.error) errorMessage = json.error;
        } catch {
          // ignore
        }
        throw new Error(errorMessage);
      }
      return response.json() as Promise<{
        valid: boolean;
        session: {
          token: string;
          threadId: string;
          patientName: string;
          patientPhone: string;
          doctorName: string;
          clinicName: string;
          clinicPhone: string;
          latestDoctorMessage?: string;
          expiresAt: number;
        };
        messages: {
          id: string;
          sender: 'patient' | 'doctor' | 'ai';
          text: string;
          time: string;
          imageUrl?: string;
          hasAttachment?: boolean;
          attachmentFilename?: string;
          createdAt?: string;
        }[];
      }>;
    },
    sendReply: async (
      token: string,
      data: { text?: string; imageDataUrl?: string; imageCaption?: string }
    ) => {
      const response = await fetch(`/api/portal/session/${encodeURIComponent(token)}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        let errorMessage = 'Failed to deliver your reply to the clinic.';
        try {
          const json = await response.json();
          if (json.error) errorMessage = json.error;
        } catch {
          // ignore
        }
        throw new Error(errorMessage);
      }
      return response.json() as Promise<{
        success: boolean;
        message: {
          id: string;
          sender: 'patient';
          text: string;
          time: string;
          imageUrl?: string;
        };
        threadId: string;
        timestamp: string;
      }>;
    },
    generateToken: (data: {
      threadId: string;
      patientId?: string;
      patientName?: string;
      patientPhone?: string;
      latestDoctorMessage?: string;
    }) =>
      fetchWithAuth<{ token: string; portalUrl: string }>('/api/portal/generate-token', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  ai: {
    summarize: (data: {
      patient: { name: string; age: number; gender: string; code: string };
      date: string;
      symptoms: string[];
      diagnoses: string[];
      tests: string[];
      procedures: { name: string; cost: number }[];
      consultationFee: number;
      clinicalNotes?: { examination?: string; investigationsAdvised?: string; plan?: string };
    }) =>
      fetchWithAuth<{ summary: string }>('/api/ai/summarize-consultation', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    parseClinicalNote: (data: {
      rawNote: string;
      existingExamination?: string;
      existingInvestigations?: string;
      existingPlan?: string;
      patientPrimaryDiagnosis?: string;
      existingSymptoms?: string[];
    }) =>
      fetchWithAuth<{ parsed: import('../utils/clinicalNoteAutoFill').ParsedClinicalNoteSummary }>(
        '/api/ai/parse-clinical-note',
        {
          method: 'POST',
          body: JSON.stringify(data),
        }
      ),
    parseLabReport: (data: {
      attachmentDataUrl?: string;
      reportText?: string;
      testName?: string;
      category?: string;
      patientId?: string;
    }) =>
      fetchWithAuth<{
        parsed: {
          testName: string;
          category: import('../types').TestReportCategory;
          specimenType: string;
          resultValue: string;
          unit: string;
          referenceRange: string;
          resultFlag: import('../types').TestResultFlag;
          labName: string;
          clinicalNotes: string;
          safetyAlerts: string[];
          isAiPowered: boolean;
        };
      }>('/api/ai/parse-lab-report', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    chat: (data: {
      question: string;
      patientId?: string;
      contextType?: 'soap' | 'summary' | 'medications' | 'followup' | 'general';
    }) =>
      fetchWithAuth<{ answer: string; isAiPowered: boolean; patient?: Patient }>('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    chatWithReport: (data: {
      question: string;
      report?: AIImageAnalysisResult | null;
      anatomicalSite?: string;
      clinicalNotes?: string;
      abcdeScore?: ABCDEScoreResult | null;
      patientId?: string;
      conversationHistory?: { role: 'doctor' | 'assistant'; content: string }[];
    }) =>
      fetchWithAuth<{ answer: string; isAiPowered: boolean }>('/api/ai/report-chat', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    analyzeImage: (data: {
      imageBase64: string;
      mimeType?: string;
      patientId?: string;
      clinicalNotes?: string;
      imageUrl?: string;
      visualMetrics?: import('../types').VisualMorphologyMetrics;
    }) =>
      fetchWithAuth<{
        analysis: AIImageAnalysisResult;
        patient?: Patient;
        subscription?: import('../types').ClinicSubscriptionState;
      }>('/api/ai/analyze-image', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    compareProgression: (data: {
      imageA: {
        id?: string;
        base64: string;
        mimeType?: string;
        label?: string;
        date?: string;
        modality?: string;
        bodyArea?: string;
        extractedFindings?: string;
        visualMetrics?: import('../types').VisualMorphologyMetrics;
      };
      imageB: {
        id?: string;
        base64: string;
        mimeType?: string;
        label?: string;
        date?: string;
        modality?: string;
        bodyArea?: string;
        extractedFindings?: string;
        visualMetrics?: import('../types').VisualMorphologyMetrics;
      };
      patientId?: string;
      clinicalContext?: string;
    }) =>
      fetchWithAuth<{ progression: ProgressionAnalysisResult; patient?: Patient }>('/api/ai/compare-progression', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    assessABCDE: (data: {
      imageBase64: string;
      mimeType?: string;
      patientId?: string;
      clinicalNotes?: string;
      estimatedDiameterMm?: number;
    }) =>
      fetchWithAuth<{ abcde: ABCDEScoreResult; patient?: Patient }>('/api/ai/assess-abcde', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    compareVisits: (data: {
      visitAId: string;
      visitBId: string;
      patientId: string;
      doctorNotes?: string;
      markedAreas?: string[];
    }) =>
      fetchWithAuth<{ comparison: import('../types').VisitComparisonResult }>('/api/ai/compare-visits', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  subscription: {
    get: () =>
      fetchWithAuth<{ subscription: import('../types').ClinicSubscriptionState }>('/api/subscription'),
    upgradeToPro: (paymentMethod: 'UPI' | 'Card' = 'UPI') =>
      fetchWithAuth<{ subscription: import('../types').ClinicSubscriptionState; message: string }>(
        '/api/subscription/upgrade',
        {
          method: 'POST',
          body: JSON.stringify({ paymentMethod }),
        }
      ),
    topUpCredits: (params?: { credits?: number; amountInr?: number; paymentMethod?: 'UPI' | 'Card' }) =>
      fetchWithAuth<{ subscription: import('../types').ClinicSubscriptionState; message: string }>(
        '/api/subscription/topup',
        {
          method: 'POST',
          body: JSON.stringify(params || { credits: 100, amountInr: 999, paymentMethod: 'UPI' }),
        }
      ),
  },

  dashboard: {
    getCachedStats: () => {
      return fastCache.get<{
        stats: ClinicStats;
        recentVisits: Consultation[];
        recentPatients: Patient[];
        revenue?: import('../types').PracticeRevenueAnalytics;
      }>('api_/api/dashboard/stats');
    },
    getStats: async () => {
      const currentDoctor = authStorage.getDoctor();
      const vaultPatients = patientVaultStorage.getPatientsForCurrentDoctor(currentDoctor);
      // Run patient vault sync silently in background without blocking dashboard load
      if (vaultPatients.length > 0) {
        fetchWithAuth<{ patients: Patient[] }>('/api/patients/sync', {
          method: 'POST',
          body: JSON.stringify({ patients: vaultPatients }),
        }).catch(() => {
          // non-blocking background sync
        });
      }
      return fetchWithAuth<{
        stats: ClinicStats;
        recentVisits: Consultation[];
        recentPatients: Patient[];
        revenue?: import('../types').PracticeRevenueAnalytics;
      }>('/api/dashboard/stats');
    },
    getCachedRevenue: () => {
      return fastCache.get<{
        revenue: import('../types').PracticeRevenueAnalytics;
      }>('api_/api/dashboard/revenue');
    },
    getRevenue: () =>
      fetchWithAuth<{
        revenue: import('../types').PracticeRevenueAnalytics;
      }>('/api/dashboard/revenue'),
  },

  reports: {
    update: (id: string, data: Partial<PatientTestReport>) =>
      fetchWithAuth<{ report: PatientTestReport }>(`/api/reports/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      fetchWithAuth<{ success: boolean; message: string }>(`/api/reports/${id}`, {
        method: 'DELETE',
      }),
    logWhatsApp: (data: {
      patientId?: string;
      reportType: string;
      recipientMobile: string;
      note?: string;
    }) =>
      fetchWithAuth<{ success: boolean; message: string; timestamp: string }>(
        '/api/reports/log-whatsapp',
        {
          method: 'POST',
          body: JSON.stringify(data),
        }
      ),
  },

  whatsapp: {
    threads: () =>
      fetchWithAuth<{
        threads: Array<any>;
        lastUpdatedAt: string;
      }>('/api/whatsapp/threads'),
    receiveIncoming: (data: {
      threadId?: string;
      patientId?: string;
      patientName?: string;
      senderPhone?: string;
      messageText: string;
      channel?: 'WhatsApp' | 'SMS';
    }) =>
      fetchWithAuth<{
        success: boolean;
        thread: any;
        incomingMessage: any;
        threads: Array<any>;
      }>('/api/whatsapp/incoming', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    send: (data: {
      threadId?: string;
      patientId?: string;
      patientName?: string;
      recipientMobile: string;
      clinicPhone?: string;
      reportType?: string;
      messageText: string;
      note?: string;
      autoSimulateReply?: boolean;
      pdfAttachment?: {
        filename: string;
        reportId: string;
        sizeLabel: string;
        generatedAt: string;
        summaryPoints?: string[];
        pdfDataUrl?: string;
      };
    }) =>
      fetchWithAuth<{
        success: boolean;
        whatsappUrl: string;
        message: string;
        timestamp: string;
        thread?: any;
        threads?: Array<any>;
        dispatch: {
          id: string;
          patientId?: string;
          patientName: string;
          recipientMobile: string;
          clinicPhone: string;
          reportType: string;
          messageText: string;
          pdfAttachment?: {
            filename: string;
            reportId: string;
            sizeLabel: string;
            generatedAt: string;
            summaryPoints?: string[];
            pdfDataUrl?: string;
          };
          deliveryMode: 'cloud_api' | 'whatsapp_gateway';
          status: 'sent' | 'delivered';
          whatsappUrl: string;
          sentAt: string;
        };
      }>('/api/whatsapp/send', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    list: (patientId?: string) =>
      fetchWithAuth<{
        messages: Array<{
          id: string;
          patientId?: string;
          patientName: string;
          recipientMobile: string;
          clinicPhone: string;
          reportType: string;
          messageText: string;
          deliveryMode: 'cloud_api' | 'whatsapp_gateway';
          status: 'sent' | 'delivered';
          whatsappUrl: string;
          sentAt: string;
        }>;
      }>(`/api/whatsapp/messages${patientId ? `?patientId=${encodeURIComponent(patientId)}` : ''}`),
  },

  audit: {
    list: () => fetchWithAuth<{ logs: AuditLog[] }>('/api/audit'),
    verify: () =>
      fetchWithAuth<{
        verified: boolean;
        totalChecked: number;
        hashChainHead: string;
        genesisHash: string;
        checkedAt: string;
      }>('/api/audit/verify'),
  },

  clinic: {
    downloadBackup: async () => {
      const token = authStorage.getToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch('/api/clinic/backup', { headers });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || `Backup failed: ${res.statusText}`);
      }
      const data = await res.json();
      try {
        const doc = authStorage.getDoctor();
        const key = `clinical_os_full_vault_${doc?.id || 'default'}`;
        window.localStorage.setItem(key, JSON.stringify(data));
      } catch (e) {
        console.warn('Could not cache full backup to localStorage (storage limit):', e);
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `clinical_os_backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    },
    saveToLocalVault: async () => {
      const token = authStorage.getToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch('/api/clinic/backup', { headers });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || `Failed to fetch snapshot: ${res.statusText}`);
      }
      const data = await res.json();
      const doc = authStorage.getDoctor();
      const key = `clinical_os_full_vault_${doc?.id || 'default'}`;
      window.localStorage.setItem(key, JSON.stringify(data));
      return {
        patientCount: Array.isArray(data.patients) ? data.patients.length : 0,
        consultationCount: Array.isArray(data.consultations) ? data.consultations.length : 0,
        savedAt: new Date().toISOString()
      };
    },
    getLocalVaultInfo: () => {
      try {
        const doc = authStorage.getDoctor();
        const key = `clinical_os_full_vault_${doc?.id || 'default'}`;
        const raw = window.localStorage.getItem(key);
        if (!raw) return null;
        const data = JSON.parse(raw);
        return {
          patientCount: Array.isArray(data.patients) ? data.patients.length : 0,
          consultationCount: Array.isArray(data.consultations) ? data.consultations.length : 0,
          savedAt: data.meta?.updatedAt || data.updatedAt || new Date().toISOString()
        };
      } catch {
        return null;
      }
    },
    restoreFromLocalVault: async () => {
      const doc = authStorage.getDoctor();
      const key = `clinical_os_full_vault_${doc?.id || 'default'}`;
      const raw = window.localStorage.getItem(key);
      if (!raw) {
        throw new Error('No offline browser vault snapshot found. Please upload a .json backup file.');
      }
      const data = JSON.parse(raw);
      return api.clinic.restoreBackup(data);
    },
    restoreBackup: (backupData: unknown) =>
      fetchWithAuth<{ success: boolean; message: string; count?: number }>('/api/clinic/restore', {
        method: 'POST',
        body: JSON.stringify(backupData),
      }),
  },
};

export interface RealtimeClinicEvent {
  type: string;
  timestamp: string;
  [key: string]: any;
}

export function subscribeToClinicRealtimeEvents(
  onEvent: (event: RealtimeClinicEvent) => void
): () => void {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
    return () => {};
  }

  let es: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let isDisposed = false;

  const connect = () => {
    if (isDisposed) return;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (es) {
      es.close();
      es = null;
    }
    const token = authStorage.getToken();
    const url = token
      ? `/api/realtime/events?token=${encodeURIComponent(token)}`
      : '/api/realtime/events';

    try {
      es = new EventSource(url, { withCredentials: true });
      es.onmessage = (evt) => {
        if (!evt.data) return;
        try {
          const parsed = JSON.parse(evt.data) as RealtimeClinicEvent;
          onEvent(parsed);
        } catch {
          // ignore malformed payload
        }
      };
      es.onerror = () => {
        if (es) {
          es.close();
          es = null;
        }
        if (!isDisposed) {
          reconnectTimer = setTimeout(connect, 4000);
        }
      };
    } catch {
      if (!isDisposed) {
        reconnectTimer = setTimeout(connect, 5000);
      }
    }
  };

  const handleTokenChanged = () => {
    if (!isDisposed) {
      connect();
    }
  };

  window.addEventListener('clinical_os_auth_token_changed', handleTokenChanged);
  connect();

  return () => {
    isDisposed = true;
    window.removeEventListener('clinical_os_auth_token_changed', handleTokenChanged);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (es) {
      es.close();
      es = null;
    }
  };
}

export function subscribeToMobileSessionRealtimeEvents(
  token: string,
  onEvent: (event: RealtimeClinicEvent) => void
): () => void {
  if (!token || typeof window === 'undefined' || typeof EventSource === 'undefined') {
    return () => {};
  }

  let es: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let isDisposed = false;

  const connect = () => {
    if (isDisposed) return;
    try {
      es = new EventSource(`/api/realtime/mobile-session/${encodeURIComponent(token)}`);
      es.onmessage = (evt) => {
        if (!evt.data) return;
        try {
          const parsed = JSON.parse(evt.data) as RealtimeClinicEvent;
          onEvent(parsed);
        } catch {
          // ignore
        }
      };
      es.onerror = () => {
        if (es) {
          es.close();
          es = null;
        }
        if (!isDisposed) {
          reconnectTimer = setTimeout(connect, 3500);
        }
      };
    } catch {
      if (!isDisposed) {
        reconnectTimer = setTimeout(connect, 4000);
      }
    }
  };

  connect();

  return () => {
    isDisposed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (es) {
      es.close();
      es = null;
    }
  };
}

