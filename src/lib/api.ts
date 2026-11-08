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
    inMemoryToken = token;
    try {
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(TOKEN_KEY, token);
        window.localStorage.setItem(TOKEN_KEY, token);
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
    inMemoryDoctor = doctor;
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
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(TOKEN_KEY);
        window.sessionStorage.removeItem(TOKEN_KEY);
        window.localStorage.removeItem(DOCTOR_KEY);
        window.sessionStorage.removeItem(DOCTOR_KEY);
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
  }
};

async function fetchWithAuth<T>(url: string, options: RequestInit = {}, isRetry = false): Promise<T> {
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

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    const isAuthCredentialRoute =
      url.includes('/api/auth/login') ||
      url.includes('/api/auth/register') ||
      url.includes('/api/auth/restore');

    // Transparently re-establish session if server restarted or token expired mid-workflow
    if (!isRetry && !isAuthCredentialRoute && storedDoctor) {
      try {
        const restoreRes = await fetch('/api/auth/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(storedDoctor),
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
    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    try {
      const errorJson = await response.json();
      if (errorJson.error) errorMessage = errorJson.error;
    } catch {
      // ignore
    }
    throw new Error(errorMessage);
  }

  return response.json();
}

export const api = {
  auth: {
    login: (credentials: { email: string; password: string }) =>
      fetchWithAuth<{ token: string; doctor: Doctor }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      }),
    sso: (params?: { organization?: string; email?: string; name?: string; department?: string }) =>
      fetchWithAuth<{ token: string; doctor: Doctor }>('/api/auth/sso', {
        method: 'POST',
        body: JSON.stringify(params || {}),
      }),
    google: (params?: { email?: string; name?: string }) =>
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
    setPassword: (id: string, password: string) =>
      fetchWithAuth<{ success: boolean; message: string }>(`/api/staff/${id}/password`, {
        method: 'PUT',
        body: JSON.stringify({ password }),
      }),
    switchSession: (params: { targetId?: string; targetRole?: 'doctor' | 'receptionist' }) =>
      fetchWithAuth<{ token: string; doctor: Doctor }>('/api/staff/switch-session', {
        method: 'POST',
        body: JSON.stringify(params),
      }),
  },

  patients: {
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
        mergedPatients = mergedPatients.filter(
          p =>
            p.fullName.toLowerCase().includes(q) ||
            p.patientCode.toLowerCase().includes(q) ||
            (p.mobile && p.mobile.includes(q)) ||
            (p.primaryDiagnosis && p.primaryDiagnosis.toLowerCase().includes(q))
        );
      }

      return { patients: mergedPatients };
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
    getStats: async () => {
      const currentDoctor = authStorage.getDoctor();
      const vaultPatients = patientVaultStorage.getPatientsForCurrentDoctor(currentDoctor);
      if (vaultPatients.length > 0) {
        try {
          await fetchWithAuth<{ patients: Patient[] }>('/api/patients/sync', {
            method: 'POST',
            body: JSON.stringify({ patients: vaultPatients }),
          });
        } catch {
          // ignore
        }
      }
      return fetchWithAuth<{
        stats: ClinicStats;
        recentVisits: Consultation[];
        recentPatients: Patient[];
        revenue?: import('../types').PracticeRevenueAnalytics;
      }>('/api/dashboard/stats');
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
  },
};
