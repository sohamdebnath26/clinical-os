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
  ABCDEScoreResult
} from '../types/index';

const TOKEN_KEY = 'clinical_os_token';

export const authStorage = {
  getToken: () => localStorage.getItem(TOKEN_KEY),
  setToken: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clearToken: () => localStorage.removeItem(TOKEN_KEY),
};

async function fetchWithAuth<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = authStorage.getToken();
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    authStorage.clearToken();
    window.dispatchEvent(new Event('clinical_os_unauthorized'));
    throw new Error('Session expired or unauthorized');
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

  patients: {
    list: (query?: string) =>
      fetchWithAuth<{ patients: Patient[] }>(
        `/api/patients${query ? `?q=${encodeURIComponent(query)}` : ''}`
      ),
    get: (id: string) => fetchWithAuth<{ patient: Patient }>(`/api/patients/${id}`),
    checkMobile: (mobile: string) =>
      fetchWithAuth<{ exists: boolean; patient?: Patient }>(
        `/api/patients/check-mobile/${encodeURIComponent(mobile)}`
      ),
    create: (data: Partial<Patient>, force = false) =>
      fetchWithAuth<{ patient: Patient }>(
        `/api/patients${force ? '?force=true' : ''}`,
        {
          method: 'POST',
          body: JSON.stringify(data),
        }
      ),
    update: (id: string, data: Partial<Patient>) =>
      fetchWithAuth<{ patient: Patient }>(`/api/patients/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
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
    getPrescriptions: (id: string) =>
      fetchWithAuth<{ prescriptions: PrescriptionItem[] }>(
        `/api/patients/${id}/prescriptions`
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
      dataUrl: string;
      filename?: string;
      caption?: string;
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
    chat: (data: {
      question: string;
      patientId?: string;
      contextType?: 'soap' | 'summary' | 'medications' | 'followup' | 'general';
    }) =>
      fetchWithAuth<{ answer: string; isAiPowered: boolean; patient?: Patient }>('/api/ai/chat', {
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
      fetchWithAuth<{ analysis: AIImageAnalysisResult; patient?: Patient }>('/api/ai/analyze-image', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    compareProgression: (data: {
      imageA: { base64: string; mimeType?: string; label?: string; date?: string };
      imageB: { base64: string; mimeType?: string; label?: string; date?: string };
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
    }) =>
      fetchWithAuth<{ comparison: import('../types').VisitComparisonResult }>('/api/ai/compare-visits', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },



  dashboard: {
    getStats: () =>
      fetchWithAuth<{
        stats: ClinicStats;
        recentVisits: Consultation[];
        recentPatients: Patient[];
      }>('/api/dashboard/stats'),
  },

  reports: {
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

  audit: {
    list: () => fetchWithAuth<{ logs: AuditLog[] }>('/api/audit'),
  },
};
