import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import { AuthView } from './components/AuthView';
import { Sidebar, NavRoute } from './components/Sidebar';
import { Navbar } from './components/Navbar';
import { DashboardView } from './components/DashboardView';
import { PatientsListView } from './components/PatientsListView';
import { PatientProfileView } from './components/PatientProfileView';
import { PrescriptionsView } from './components/PrescriptionsView';
import { AppointmentsView } from './components/AppointmentsView';
import { SettingsView } from './components/SettingsView';
import { WalkInModal } from './components/WalkInModal';
import { ConsultationModal } from './components/ConsultationModal';
import { AIModal } from './components/AIModal';
import { Patient, Consultation } from './types';
import { api } from './lib/api';
import { CheckCircle2, X } from 'lucide-react';

function MainApp() {
  const { doctor, isLoading } = useAuth();

  // Navigation & Active views
  const [currentRoute, setCurrentRoute] = useState<NavRoute>('dashboard');
  const [activePatientId, setActivePatientId] = useState<string | null>(null);

  // Modals state
  const [showWalkInModal, setShowWalkInModal] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiPrompt, setAiPrompt] = useState<string | undefined>(undefined);
  const [activePatientForAI, setActivePatientForAI] = useState<Patient | null>(null);

  // Active Consultation Modal
  const [activeConsultation, setActiveConsultation] = useState<{
    consultation: Consultation;
    patient: Patient;
  } | null>(null);

  // Mobile sidebar drawer
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Toast banner
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white">
        <div className="w-10 h-10 border-3 border-teal-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-xs font-semibold tracking-wider uppercase text-slate-400">
          Loading Clinical OS...
        </p>
      </div>
    );
  }

  if (!doctor) {
    return <AuthView />;
  }

  // Navigation helper
  const handleNavigate = (route: NavRoute) => {
    setCurrentRoute(route);
    setActivePatientId(null);
    setMobileMenuOpen(false);
  };

  const handleSelectPatient = (patientId: string) => {
    setActivePatientId(patientId);
    setMobileMenuOpen(false);
  };

  // Start new consultation for a patient directly
  const handleStartConsultationForPatient = async (patient: Patient) => {
    try {
      const res = await api.consultations.create({
        patientId: patient.id
      });
      setActiveConsultation({
        consultation: res.consultation,
        patient
      });
    } catch (err: unknown) {
      console.warn('Failed to start consultation:', err);
    }
  };

  // Handle consultation signed & finished
  const handleConsultationSuccess = (signedConsultation: Consultation) => {
    setActiveConsultation(null);
    showToast('Consultation signed and saved to timeline');
    // Open the patient profile directly to show updated timeline
    setActivePatientId(signedConsultation.patientId);
  };

  // Helper to open AI Assistant, seamlessly preserving active patient context
  const handleOpenAIAssistant = (patientOverride?: Patient | null, prompt?: string) => {
    if (patientOverride) {
      setActivePatientForAI(patientOverride);
      setAiPrompt(prompt);
      setShowAIModal(true);
      return;
    }

    if (activePatientId) {
      api.patients.get(activePatientId)
        .then(res => {
          setActivePatientForAI(res.patient);
          setAiPrompt(prompt);
          setShowAIModal(true);
        })
        .catch(() => {
          setActivePatientForAI(null);
          setAiPrompt(prompt);
          setShowAIModal(true);
        });
    } else {
      setActivePatientForAI(null);
      setAiPrompt(prompt);
      setShowAIModal(true);
    }
  };

  return (
    <div className="min-h-screen flex bg-[#f8fafc] text-slate-800 antialiased selection:bg-teal-500 selection:text-white">
      {/* Desktop Persistent Left Sidebar */}
      <div className="hidden md:block">
        <Sidebar
          currentRoute={activePatientId ? 'patients' : currentRoute}
          onNavigate={handleNavigate}
          onOpenWalkIn={() => setShowWalkInModal(true)}
          onOpenAIAssistant={() => handleOpenAIAssistant()}
        />
      </div>

      {/* Mobile Drawer Sidebar */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex md:hidden"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-72 bg-white h-full shadow-2xl animate-in slide-in-from-left duration-200"
          >
            <Sidebar
              currentRoute={activePatientId ? 'patients' : currentRoute}
              onNavigate={handleNavigate}
              onOpenWalkIn={() => {
                setMobileMenuOpen(false);
                setShowWalkInModal(true);
              }}
              onOpenAIAssistant={() => {
                setMobileMenuOpen(false);
                handleOpenAIAssistant();
              }}
            />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Navbar */}
        <Navbar
          onOpenWalkIn={() => setShowWalkInModal(true)}
          onOpenAIAssistant={() => handleOpenAIAssistant()}
          onSelectPatient={handleSelectPatient}
          onToggleMobileMenu={() => setMobileMenuOpen(!mobileMenuOpen)}
        />

        {/* Dynamic Route Viewport */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-8">
          <div className="max-w-7xl mx-auto">
            {activePatientId ? (
              <PatientProfileView
                patientId={activePatientId}
                onBack={() => setActivePatientId(null)}
                onStartConsultation={handleStartConsultationForPatient}
                onOpenAIWithPrompt={(prompt) => {
                  api.patients.get(activePatientId).then(res => {
                    handleOpenAIAssistant(res.patient, prompt);
                  }).catch(() => {
                    handleOpenAIAssistant(null, prompt);
                  });
                }}
              />
            ) : currentRoute === 'dashboard' ? (
              <DashboardView
                onOpenWalkIn={() => setShowWalkInModal(true)}
                onOpenAIAssistant={() => handleOpenAIAssistant()}
                onSelectPatient={handleSelectPatient}
                onStartConsultationForPatient={handleStartConsultationForPatient}
                onNavigateToAppointments={() => handleNavigate('appointments')}
              />
            ) : currentRoute === 'appointments' ? (
              <AppointmentsView
                onSelectPatient={handleSelectPatient}
              />
            ) : currentRoute === 'patients' ? (
              <PatientsListView
                onSelectPatient={handleSelectPatient}
                onOpenWalkIn={() => setShowWalkInModal(true)}
                onStartConsultationForPatient={handleStartConsultationForPatient}
              />
            ) : currentRoute === 'prescriptions' ? (
              <PrescriptionsView onSelectPatient={handleSelectPatient} />
            ) : currentRoute === 'settings' ? (
              <SettingsView />
            ) : null}
          </div>
        </main>
      </div>

      {/* MODALS */}
      {/* 1. Walk-in Modal */}
      {showWalkInModal && (
        <WalkInModal
          onClose={() => setShowWalkInModal(false)}
          onStartConsultation={(consultation, patient) => {
            setShowWalkInModal(false);
            showToast('Patient added to walk-in queue');
            setActiveConsultation({ consultation, patient });
          }}
        />
      )}

      {/* 2. Consultation Workspace Modal */}
      {activeConsultation && (
        <ConsultationModal
          consultation={activeConsultation.consultation}
          patient={activeConsultation.patient}
          onClose={() => setActiveConsultation(null)}
          onSuccess={handleConsultationSuccess}
        />
      )}

      {/* 4. AI Clinical Assistant Modal */}
      {showAIModal && (
        <AIModal
          onClose={() => {
            setShowAIModal(false);
            setActivePatientForAI(null);
            setAiPrompt(undefined);
          }}
          activePatient={activePatientForAI}
          initialPrompt={aiPrompt}
        />
      )}

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-teal-800 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 border border-teal-700 animate-in slide-in-from-bottom-5 duration-200">
          <CheckCircle2 className="w-5 h-5 text-teal-300 shrink-0" />
          <span className="text-xs font-semibold">{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="text-teal-200 hover:text-white p-0.5 ml-2"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <MainApp />
      </AuthProvider>
    </LanguageProvider>
  );
}
