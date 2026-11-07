import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import { ThemeProvider } from './context/ThemeContext';
import { AuthView } from './components/AuthView';
import { Sidebar, NavRoute } from './components/Sidebar';
import { Navbar } from './components/Navbar';
import { DashboardView } from './components/DashboardView';
import { PatientsListView } from './components/PatientsListView';
import { PatientProfileView, TabType } from './components/PatientProfileView';
import { PrescriptionsView } from './components/PrescriptionsView';
import { RevenueView } from './components/RevenueView';
import { AppointmentsView } from './components/AppointmentsView';
import { MessagesView } from './components/MessagesView';
import { ImageAnalyzerView } from './components/ImageAnalyzerView';
import { SettingsView } from './components/SettingsView';
import { WalkInModal } from './components/WalkInModal';
import { ConsultationModal } from './components/ConsultationModal';
import { AIModal } from './components/AIModal';
import { Patient, Consultation } from './types';
import { api } from './lib/api';
import { CheckCircle2, X } from 'lucide-react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MobileImageUploadView } from './components/MobileImageUploadView';
import { MobileWalkInView } from './components/MobileWalkInView';

function MainApp() {
  const { doctor, switchRoleSession } = useAuth();
  const isReceptionist = doctor?.role === 'receptionist';

  // Navigation & Active views
  const [currentRoute, setCurrentRoute] = useState<NavRoute>('dashboard');
  const [activePatientId, setActivePatientId] = useState<string | null>(null);
  const [patientProfileInitialTab, setPatientProfileInitialTab] = useState<TabType | undefined>(undefined);

  // Collapsible sidebar state (defaults to sleek compact rail mode; persisted in localStorage)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('clinical_os_sidebar_rail_v2');
      return saved ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const toggleSidebar = () => {
    setIsSidebarCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('clinical_os_sidebar_rail_v2', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Global keyboard shortcut: Ctrl+B or Cmd+B to toggle sidebar collapse
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        const activeTag = document.activeElement?.tagName.toLowerCase();
        if (activeTag !== 'input' && activeTag !== 'textarea') {
          e.preventDefault();
          toggleSidebar();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Redirect receptionists away from doctor-only routes
  useEffect(() => {
    if (
      isReceptionist &&
      (currentRoute === 'prescriptions' ||
        currentRoute === 'revenue' ||
        currentRoute === 'image-analyzer' ||
        currentRoute === 'ai-assistant')
    ) {
      setCurrentRoute('dashboard');
    }
  }, [isReceptionist, currentRoute]);

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

  if (!doctor) {
    return <AuthView />;
  }

  // Navigation helper
  const handleNavigate = (route: NavRoute) => {
    if (
      isReceptionist &&
      (route === 'prescriptions' ||
        route === 'revenue' ||
        route === 'image-analyzer' ||
        route === 'ai-assistant')
    ) {
      setCurrentRoute('dashboard');
      setActivePatientId(null);
      setPatientProfileInitialTab(undefined);
      setMobileMenuOpen(false);
      return;
    }
    setCurrentRoute(route);
    setActivePatientId(null);
    setPatientProfileInitialTab(undefined);
    setMobileMenuOpen(false);
  };

  const handleSelectPatient = (patientId: string, initialTab?: TabType) => {
    setActivePatientId(patientId);
    setPatientProfileInitialTab(initialTab);
    setMobileMenuOpen(false);
  };

  // Start new consultation for a patient directly (Receptionists are routed to the patient's chart)
  const handleStartConsultationForPatient = async (patient: Patient) => {
    if (isReceptionist) {
      handleSelectPatient(patient.id);
      return;
    }
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
    // Open the patient profile directly on the timeline tab to show updated timeline
    setActivePatientId(signedConsultation.patientId);
    setPatientProfileInitialTab('timeline');
  };

  // Helper to open AI Assistant, seamlessly preserving active patient context
  const handleOpenAIAssistant = (patientOverride?: Patient | null, prompt?: string) => {
    if (isReceptionist) return;
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
    <div className="h-screen w-full overflow-hidden flex bg-[#f2f6f5] dark:bg-[#0b1514] text-[#0f2926] dark:text-[#ecfdf5] antialiased selection:bg-teal-600 selection:text-white transition-colors duration-150">
      {/* Desktop Persistent Left Sidebar (rigidly locked in place; does not scroll with page content) */}
      <div className="hidden md:block shrink-0 h-screen sticky top-0 z-30">
        <Sidebar
          currentRoute={activePatientId ? 'patients' : currentRoute}
          onNavigate={handleNavigate}
          onOpenWalkIn={() => setShowWalkInModal(true)}
          onOpenAIAssistant={() => handleOpenAIAssistant()}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={toggleSidebar}
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
            className="w-[188px] bg-[#0d3f3b] h-full shadow-2xl animate-in slide-in-from-left duration-200"
          >
            <Sidebar
              currentRoute={activePatientId ? 'patients' : currentRoute}
              onNavigate={handleNavigate}
              isCollapsed={false}
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
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Front-Desk Receptionist Mode Banner */}
        {isReceptionist && (
          <div className="shrink-0 bg-emerald-900 text-emerald-50 border-b border-emerald-700/60 px-4 sm:px-8 py-2 flex flex-wrap items-center justify-between gap-2 text-xs z-20">
            <div className="flex items-center gap-2 min-w-0">
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-500/25 border border-emerald-400/30 text-emerald-200 font-bold uppercase tracking-wider text-[10px] shrink-0">
                Receptionist Point of View
              </span>
              <span className="truncate text-emerald-100">
                Signed in as <strong>{doctor.name}</strong> ({doctor.email}) · Front-desk check-in, appointments, patient directory &amp; WhatsApp inbox active. Clinical prescribing &amp; revenue restricted to Doctors.
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleNavigate('settings')}
                className="px-2.5 py-1 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-emerald-100 font-semibold transition-colors cursor-pointer"
              >
                Role Settings
              </button>
              <button
                type="button"
                onClick={() =>
                  switchRoleSession({ role: 'doctor' }).then(() =>
                    showToast('Switched to Doctor Point of View')
                  )
                }
                className="px-3 py-1 rounded-lg bg-white text-emerald-950 hover:bg-emerald-50 font-bold transition-colors cursor-pointer"
              >
                Switch to Doctor View →
              </button>
            </div>
          </div>
        )}

        {/* Top Navbar (shown on inner views; Dashboard has its own integrated header) */}
        {(activePatientId || currentRoute !== 'dashboard') && (
          <div className="shrink-0 z-20">
            <Navbar
              onOpenWalkIn={() => setShowWalkInModal(true)}
              onOpenAIAssistant={() => handleOpenAIAssistant()}
              onSelectPatient={handleSelectPatient}
              onToggleMobileMenu={() => setMobileMenuOpen(!mobileMenuOpen)}
              onToggleSidebar={toggleSidebar}
              isSidebarCollapsed={isSidebarCollapsed}
            />
          </div>
        )}

        {/* Dynamic Route Viewport */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-8">
          <div className="max-w-7xl mx-auto">
            <ErrorBoundary
              key={activePatientId ? `patient-${activePatientId}` : `route-${currentRoute}`}
              fallbackTitle="Clinical View Encountered an Issue"
              onReset={() => {
                setActivePatientId(null);
                setPatientProfileInitialTab(undefined);
                setCurrentRoute('dashboard');
              }}
            >
              {activePatientId ? (
                <PatientProfileView
                  patientId={activePatientId}
                  initialTab={patientProfileInitialTab}
                  onBack={() => {
                    setActivePatientId(null);
                    setPatientProfileInitialTab(undefined);
                  }}
                  onStartConsultation={handleStartConsultationForPatient}
                  onOpenAIWithPrompt={
                    isReceptionist
                      ? undefined
                      : (prompt) => {
                          api.patients
                            .get(activePatientId)
                            .then(res => {
                              handleOpenAIAssistant(res.patient, prompt);
                            })
                            .catch(() => {
                              handleOpenAIAssistant(null, prompt);
                            });
                        }
                  }
                  onNavigateToImageAnalyzer={
                    isReceptionist
                      ? undefined
                      : () => {
                          setCurrentRoute('image-analyzer');
                        }
                  }
                />
              ) : currentRoute === 'dashboard' ? (
                <DashboardView
                  onOpenWalkIn={() => setShowWalkInModal(true)}
                  onOpenAIAssistant={() => handleOpenAIAssistant()}
                  onSelectPatient={handleSelectPatient}
                  onStartConsultationForPatient={handleStartConsultationForPatient}
                  onNavigateToAppointments={() => handleNavigate('appointments')}
                  onNavigateToPatients={() => handleNavigate('patients')}
                  onNavigateToPrescriptions={() => handleNavigate('prescriptions')}
                  onNavigateToImageAnalyzer={() => handleNavigate('image-analyzer')}
                  onToggleMobileMenu={() => setMobileMenuOpen(!mobileMenuOpen)}
                />
              ) : currentRoute === 'appointments' ? (
                <AppointmentsView
                  onSelectPatient={handleSelectPatient}
                  onStartConsultationForPatient={
                    isReceptionist ? undefined : handleStartConsultationForPatient
                  }
                />
              ) : currentRoute === 'patients' ? (
                <PatientsListView
                  onSelectPatient={handleSelectPatient}
                  onOpenWalkIn={() => setShowWalkInModal(true)}
                  onStartConsultationForPatient={handleStartConsultationForPatient}
                />
              ) : currentRoute === 'prescriptions' && !isReceptionist ? (
                <PrescriptionsView onSelectPatient={handleSelectPatient} />
              ) : currentRoute === 'messages' ? (
                <MessagesView />
              ) : currentRoute === 'revenue' && !isReceptionist ? (
                <RevenueView onSelectPatient={handleSelectPatient} />
              ) : currentRoute === 'image-analyzer' && !isReceptionist ? (
                <ImageAnalyzerView
                  initialPatientId={activePatientId}
                  onSelectPatient={handleSelectPatient}
                  onStartConsultationForPatient={handleStartConsultationForPatient}
                />
              ) : currentRoute === 'settings' ? (
                <SettingsView />
              ) : null}
            </ErrorBoundary>
          </div>
        </main>
      </div>

      {/* MODALS */}
      {/* 1. Walk-in Modal */}
      {showWalkInModal && (
        <WalkInModal
          onClose={() => setShowWalkInModal(false)}
          onPatientCreated={(patient) => {
            setShowWalkInModal(false);
            showToast(`Patient ${patient.fullName} checked in and saved to clinic queue`);
            handleSelectPatient(patient.id);
          }}
          onStartConsultation={
            isReceptionist
              ? undefined
              : (consultation, patient) => {
                  setShowWalkInModal(false);
                  showToast('Patient added to walk-in queue');
                  setActiveConsultation({ consultation, patient });
                }
          }
        />
      )}

      {/* 2. Consultation Workspace Modal */}
      {activeConsultation && !isReceptionist && (
        <ConsultationModal
          consultation={activeConsultation.consultation}
          patient={activeConsultation.patient}
          initialTab="notes"
          onClose={() => setActiveConsultation(null)}
          onSuccess={handleConsultationSuccess}
        />
      )}

      {/* 4. AI Clinical Assistant Modal */}
      {showAIModal && !isReceptionist && (
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
  const searchParams =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const mobileUploadToken = searchParams ? searchParams.get('mobileUploadToken') : null;
  const walkInToken = searchParams ? searchParams.get('walkInToken') : null;

  if (mobileUploadToken) {
    return (
      <ErrorBoundary fallbackTitle="Mobile Image Upload Error">
        <LanguageProvider>
          <MobileImageUploadView token={mobileUploadToken} />
        </LanguageProvider>
      </ErrorBoundary>
    );
  }

  if (walkInToken) {
    return (
      <ErrorBoundary fallbackTitle="Mobile Patient Check-In Error">
        <LanguageProvider>
          <MobileWalkInView token={walkInToken} />
        </LanguageProvider>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary fallbackTitle="Clinical OS Application Error">
      <ThemeProvider>
        <LanguageProvider>
          <AuthProvider>
            <MainApp />
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
