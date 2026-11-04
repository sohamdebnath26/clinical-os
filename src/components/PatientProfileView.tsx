import React, { useState, useEffect, useRef } from 'react';
import { Patient, Consultation, PrescriptionItem, BodyMarker, ClinicalImage, Appointment, PatientTestReport, MedicalImageModality, ImageVisualMetrics } from '../types';
import { api } from '../lib/api';
import { analyzeImageVisualFeatures } from '../utils/visualImageAnalyzer';
import { PrintRxModal } from './PrintRxModal';
import { EditPatientModal } from './EditPatientModal';
import { ScheduleAppointmentModal } from './ScheduleAppointmentModal';
import { MarkdownView } from './MarkdownView';
import { LesionProgressionModal } from './LesionProgressionModal';
import { WhatsAppShareModal, WhatsAppIcon, WhatsAppReportType } from './WhatsAppShareModal';
import { PatientVitalsChart } from './PatientVitalsChart';
import { VisitComparisonSection } from './VisitComparisonSection';
import { PatientReportsSection } from './PatientReportsSection';
import { MobileQrUploadModal } from './MobileQrUploadModal';
import { useAuth } from '../context/AuthContext';
import {
  ArrowLeft,
  Calendar,
  FileText,
  Plus,
  Stethoscope,
  Sparkles,
  User,
  Clock,
  Pill,
  ChevronRight,
  ShieldAlert,
  Printer,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Pencil,
  ScanEye,
  Activity,
  Search,
  ArrowUpDown,
  CheckCircle2,
  FileEdit,
  Upload,
  QrCode,
  Maximize2
} from 'lucide-react';

interface PatientProfileViewProps {
  patientId: string;
  initialTab?: TabType;
  onBack: () => void;
  onStartConsultation: (patient: Patient) => void;
  onOpenAIWithPrompt?: (prompt: string) => void;
  onNavigateToImageAnalyzer?: (patientId: string) => void;
}

export type TabType = 'overview' | 'images' | 'vitals' | 'appointments' | 'timeline' | 'visits' | 'reports' | 'prescriptions';

const normalizeTab = (tab?: TabType): TabType => (tab === 'visits' ? 'timeline' : tab || 'overview');

export const PatientProfileView: React.FC<PatientProfileViewProps> = ({
  patientId,
  initialTab,
  onBack,
  onStartConsultation,
  onOpenAIWithPrompt,
  onNavigateToImageAnalyzer
}) => {
  const { doctor } = useAuth();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<any[]>([]);
  const [prescriptions, setPrescriptions] = useState<PrescriptionItem[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [markers, setMarkers] = useState<BodyMarker[]>([]);
  const [images, setImages] = useState<ClinicalImage[]>([]);
  const [testReports, setTestReports] = useState<PatientTestReport[]>([]);

  const [activeTab, setActiveTab] = useState<TabType>(normalizeTab(initialTab));
  const [tabAdvanceToast, setTabAdvanceToast] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const PROFILE_TAB_ORDER: TabType[] = [
    'overview',
    'images',
    'vitals',
    'appointments',
    'timeline',
    'reports',
    'prescriptions'
  ];

  const PROFILE_TAB_LABELS: Record<TabType, string> = {
    overview: 'Overview',
    images: 'Images & Compare',
    vitals: 'Vitals & Growth',
    appointments: 'Appointments & Follow-ups',
    timeline: 'Visits & Timeline',
    visits: 'Visits & Timeline',
    reports: 'Report Results',
    prescriptions: 'Prescriptions'
  };

  useEffect(() => {
    if (initialTab) {
      setActiveTab(normalizeTab(initialTab));
    }
  }, [initialTab]);

  // Print Rx Modal
  const [showPrintRx, setShowPrintRx] = useState(false);

  // Edit Patient Modal
  const [showEditModal, setShowEditModal] = useState(false);

  // Schedule Appointment Modal
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);

  // Unified Visits & Timeline controls
  const [expandedEvents, setExpandedEvents] = useState<Record<string, boolean>>({});
  const [timelineSearch, setTimelineSearch] = useState('');
  const [timelineStatusFilter, setTimelineStatusFilter] = useState<'all' | 'signed' | 'draft'>('all');
  const [timelineSortOrder, setTimelineSortOrder] = useState<'desc' | 'asc'>('desc');

  // Lesion Progression / Past vs. Current Medical Image Modal & Archive State
  const [showProgressionModal, setShowProgressionModal] = useState(false);
  const [selectedPrevImageId, setSelectedPrevImageId] = useState<string | undefined>(undefined);
  const [selectedCurrImageOverride, setSelectedCurrImageOverride] = useState<ClinicalImage | null>(null);
  const [isUploadingProfileImage, setIsUploadingProfileImage] = useState(false);
  const [uploadCaption, setUploadCaption] = useState('');
  const [uploadImageRole, setUploadImageRole] = useState<'past' | 'current'>('past');
  const [uploadModality, setUploadModality] = useState<MedicalImageModality>('Clinical Photo');
  const [uploadExamDate, setUploadExamDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return d.toISOString().split('T')[0];
  });
  const profileImageInputRef = useRef<HTMLInputElement>(null);
  const quickCompareInputRef = useRef<HTMLInputElement>(null);
  const pastImageInputRef = useRef<HTMLInputElement>(null);

  // WhatsApp Medical Report Modal
  const [whatsAppData, setWhatsAppData] = useState<{
    isOpen: boolean;
    reportType: WhatsAppReportType;
    data: any;
  } | null>(null);

  // Mobile QR Code upload modal for comparison
  const [showProfileQrModal, setShowProfileQrModal] = useState(false);

  const handleProfileQrImageUploaded = (newImg: ClinicalImage) => {
    setImages(prev => {
      if (prev.some(i => i.id === newImg.id)) return prev;
      return [...prev, newImg];
    });
    setSelectedCurrImageOverride(newImg);
    setShowProgressionModal(true);
  };

  const loadPatientData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [patRes, conRes, timeRes, rxRes, markRes, imgRes, apptRes, repRes] = await Promise.all([
        api.patients.get(patientId),
        api.patients.getConsultations(patientId),
        api.patients.getTimeline(patientId),
        api.patients.getPrescriptions(patientId),
        api.patients.getMarkers(patientId),
        api.patients.getImages(patientId),
        api.appointments.list({ patientId }),
        api.patients.getReports(patientId).catch(() => ({ reports: [] }))
      ]);

      setPatient(patRes.patient);
      setConsultations(conRes.consultations);
      setTimelineEvents(timeRes.events);
      setPrescriptions(rxRes.prescriptions);
      setMarkers(markRes.markers);
      setImages(imgRes.images);
      setAppointments(apptRes.appointments);
      setTestReports(repRes.reports || []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error loading patient profile';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPatientData();
  }, [patientId]);

  // Merge consultations and timelineEvents into a single unified chronological model
  const unifiedChronologicalEntries = React.useMemo(() => {
    const timelineMap = new Map<string, any>();
    timelineEvents.forEach(evt => {
      timelineMap.set(evt.id, evt);
    });

    const mergedMap = new Map<string, {
      id: string;
      date: string;
      status: 'signed' | 'draft';
      doctorName: string;
      fee: number;
      symptoms: string[];
      diagnoses: string[];
      tests: string[];
      procedures: Consultation['procedures'];
      clinicalNotes: Consultation['clinicalNotes'];
      prescriptions: PrescriptionItem[];
      images: ClinicalImage[];
      bodyMarkersCount: number;
      followUp?: Consultation['followUp'];
      aiSummary: string;
      rawConsultation?: Consultation;
    }>();

    consultations.forEach(c => {
      const tEvt = timelineMap.get(c.id);
      mergedMap.set(c.id, {
        id: c.id,
        date: c.consultationDate || tEvt?.date || c.createdAt,
        status: c.status || 'signed',
        doctorName: c.doctorName || tEvt?.doctorName || 'Physician',
        fee: c.fee ?? tEvt?.fee ?? 0,
        symptoms: c.symptoms?.length ? c.symptoms : (tEvt?.symptoms || []),
        diagnoses: c.diagnoses?.length ? c.diagnoses : (tEvt?.diagnoses || []),
        tests: c.tests?.length ? c.tests : (tEvt?.tests || []),
        procedures: c.procedures?.length ? c.procedures : (tEvt?.procedures || []),
        clinicalNotes: c.clinicalNotes || tEvt?.clinicalNotes || { examination: '', investigationsAdvised: '', plan: '' },
        prescriptions: c.prescriptions?.length ? c.prescriptions : (tEvt?.prescriptions || []),
        images: c.images?.length ? c.images : (tEvt?.images || []),
        bodyMarkersCount: c.bodyMarkers?.length ?? tEvt?.bodyMarkersCount ?? 0,
        followUp: c.followUp || tEvt?.followUp,
        aiSummary: c.aiSummary || tEvt?.aiSummary || '',
        rawConsultation: c
      });
    });

    timelineEvents.forEach(tEvt => {
      if (!mergedMap.has(tEvt.id)) {
        mergedMap.set(tEvt.id, {
          id: tEvt.id,
          date: tEvt.date,
          status: 'signed',
          doctorName: tEvt.doctorName || 'Physician',
          fee: tEvt.fee ?? 0,
          symptoms: tEvt.symptoms || [],
          diagnoses: tEvt.diagnoses || [],
          tests: tEvt.tests || [],
          procedures: tEvt.procedures || [],
          clinicalNotes: tEvt.clinicalNotes || { examination: '', investigationsAdvised: '', plan: '' },
          prescriptions: tEvt.prescriptions || [],
          images: tEvt.images || [],
          bodyMarkersCount: tEvt.bodyMarkersCount ?? 0,
          followUp: tEvt.followUp,
          aiSummary: tEvt.aiSummary || ''
        });
      }
    });

    const list = Array.from(mergedMap.values());

    const filtered = list.filter(entry => {
      if (timelineStatusFilter !== 'all' && entry.status !== timelineStatusFilter) {
        return false;
      }
      if (timelineSearch.trim()) {
        const q = timelineSearch.toLowerCase();
        const inDiag = entry.diagnoses.some(d => d.toLowerCase().includes(q));
        const inSymp = entry.symptoms.some(s => s.toLowerCase().includes(q));
        const inDoc = entry.doctorName.toLowerCase().includes(q);
        const inProc = entry.procedures?.some(p => p.name.toLowerCase().includes(q));
        const inMed = entry.prescriptions?.some(rx => rx.medicineName.toLowerCase().includes(q));
        const inNotes =
          entry.clinicalNotes?.examination?.toLowerCase().includes(q) ||
          entry.clinicalNotes?.plan?.toLowerCase().includes(q) ||
          entry.aiSummary?.toLowerCase().includes(q);
        return inDiag || inSymp || inDoc || inProc || inMed || inNotes;
      }
      return true;
    });

    filtered.sort((a, b) => {
      const timeA = new Date(a.date).getTime();
      const timeB = new Date(b.date).getTime();
      return timelineSortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    });

    return filtered;
  }, [consultations, timelineEvents, timelineStatusFilter, timelineSearch, timelineSortOrder]);

  if (isLoading) {
    return (
      <div className="p-8 text-center text-slate-500 flex flex-col items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-xs font-semibold">Loading clinical medical record...</p>
      </div>
    );
  }

  if (error || !patient) {
    return (
      <div className="p-8 max-w-md mx-auto text-center space-y-4">
        <p className="text-sm text-red-600 font-semibold">{error || 'Patient not found'}</p>
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl"
        >
          Return to Patient Directory
        </button>
      </div>
    );
  }

  const toggleExpandEvent = (id: string) => {
    setExpandedEvents(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const totalUnifiedCount = Math.max(consultations.length, timelineEvents.length);

  const toggleAllEvents = (expand: boolean) => {
    const next: Record<string, boolean> = {};
    unifiedChronologicalEntries.forEach(e => {
      next[e.id] = expand;
    });
    setExpandedEvents(next);
  };

  const getEffectiveImgDate = (img: ClinicalImage) =>
    img.examDate || (img.createdAt ? img.createdAt.split('T')[0] : new Date().toISOString().split('T')[0]);

  const sortedPatientImages = [...images].sort(
    (a, b) => new Date(getEffectiveImgDate(a)).getTime() - new Date(getEffectiveImgDate(b)).getTime()
  );
  const previousProfileImage =
    sortedPatientImages.find(i => i.imageRole === 'past') ||
    (sortedPatientImages.length >= 2
      ? sortedPatientImages[sortedPatientImages.length - 2]
      : sortedPatientImages[0] || null);
  const currentProfileImage =
    sortedPatientImages.length >= 2
      ? sortedPatientImages[sortedPatientImages.length - 1]
      : null;

  const handleUploadProfileImage = (
    e: React.ChangeEvent<HTMLInputElement>,
    openComparisonAfter: boolean,
    forcedRole?: 'past' | 'current'
  ) => {
    const file = e.target.files?.[0];
    if (!file || !patient) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      return;
    }

    const effectiveRole = forcedRole || uploadImageRole;
    const effectiveDate =
      effectiveRole === 'current' && !forcedRole
        ? uploadExamDate || new Date().toISOString().split('T')[0]
        : effectiveRole === 'current'
        ? new Date().toISOString().split('T')[0]
        : uploadExamDate;

    setIsUploadingProfileImage(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Url = reader.result as string;
      const siteLabel = uploadCaption.trim() || 'Target Clinical Lesion Site';
      const caption =
        uploadCaption.trim() ||
        `${effectiveRole === 'past' ? 'Past' : 'Current'} ${uploadModality} (${effectiveDate})`;

      let extractedMetrics: ImageVisualMetrics | undefined = undefined;
      try {
        extractedMetrics = await analyzeImageVisualFeatures(base64Url);
      } catch {
        // Server will compute fallback visual metrics
      }

      const extractedFindingsText = extractedMetrics
        ? `${effectiveRole === 'past' ? 'Past baseline' : 'Current'} ${uploadModality.toLowerCase()} (${siteLabel}) on ${effectiveDate}: erythema ${extractedMetrics.erythemaIndex}/100, pigmentation ${extractedMetrics.pigmentationIndex}/100, border irregularity ${extractedMetrics.borderIrregularity}/100, diameter ~${extractedMetrics.estimatedDiameterMm} mm.`
        : `${effectiveRole === 'past' ? 'Past baseline' : 'Current'} ${uploadModality.toLowerCase()} (${siteLabel}) stored on ${effectiveDate}.`;

      try {
        const res = await api.patients.addImage(patient.id, {
          dataUrl: base64Url,
          url: base64Url,
          filename: file.name,
          mimeType: file.type,
          caption,
          bodyArea: siteLabel,
          modality: uploadModality,
          imageRole: effectiveRole,
          examDate: effectiveDate,
          extractedFindings: extractedFindingsText,
          visualMetrics: extractedMetrics
        });
        const newImg = res.image;
        setImages(prev => [newImg, ...prev.filter(i => i.id !== newImg.id)]);
        setUploadCaption('');
        if (openComparisonAfter) {
          if (effectiveRole === 'past') {
            setSelectedPrevImageId(newImg.id);
            setSelectedCurrImageOverride(null);
          } else {
            setSelectedCurrImageOverride(newImg);
          }
          setShowProgressionModal(true);
        }
      } catch {
        const fallbackImg: ClinicalImage = {
          id: `local_${Date.now()}`,
          patientId: patient.id,
          url: base64Url,
          dataUrl: base64Url,
          filename: file.name,
          mimeType: file.type,
          caption,
          bodyArea: siteLabel,
          modality: uploadModality,
          imageRole: effectiveRole,
          examDate: effectiveDate,
          extractedFindings: extractedFindingsText,
          visualMetrics: extractedMetrics,
          createdAt: new Date(effectiveDate).toISOString()
        };
        setImages(prev => [fallbackImg, ...prev]);
        if (openComparisonAfter) {
          if (effectiveRole === 'past') {
            setSelectedPrevImageId(fallbackImg.id);
          } else {
            setSelectedCurrImageOverride(fallbackImg);
          }
          setShowProgressionModal(true);
        }
      } finally {
        setIsUploadingProfileImage(false);
        e.target.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  const currentTabIndex = PROFILE_TAB_ORDER.indexOf(activeTab);
  const nextProfileTab =
    currentTabIndex >= 0 && currentTabIndex < PROFILE_TAB_ORDER.length - 1
      ? PROFILE_TAB_ORDER[currentTabIndex + 1]
      : PROFILE_TAB_ORDER[0];

  const handleAdvanceProfileTab = () => {
    setActiveTab(nextProfileTab);
    setTabAdvanceToast(`Moved to ${PROFILE_TAB_LABELS[nextProfileTab]}`);
    setTimeout(() => setTabAdvanceToast(null), 2000);
  };

  return (
    <div
      className="space-y-6 outline-hidden"
      tabIndex={-1}
      onKeyDown={e => {
        if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
        if (showEditModal || showScheduleModal || showPrintRx || showProgressionModal || whatsAppData?.isOpen) {
          return;
        }
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON' || target.tagName === 'SELECT')) {
          return;
        }
        if (target && target.tagName === 'INPUT') {
          const inp = target as HTMLInputElement;
          // If an input has text or is on a tab where fields are complete, pressing Enter advances to the next tab
          if (!inp.value.trim()) return;
        }
        e.preventDefault();
        handleAdvanceProfileTab();
      }}
    >
      {/* Hidden File Inputs for Direct Patient Profile Upload (Past or Current Medical Image) */}
      <input
        ref={quickCompareInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={e => handleUploadProfileImage(e, true, 'current')}
      />
      <input
        ref={pastImageInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={e => handleUploadProfileImage(e, false, 'past')}
      />
      <input
        ref={profileImageInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={e => handleUploadProfileImage(e, false)}
      />

      {/* Breadcrumb Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <button
            type="button"
            onClick={onBack}
            className="hover:text-slate-700 font-medium transition-colors flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Patients</span>
          </button>
          <span>/</span>
          <span className="text-slate-700 font-semibold">{patient.fullName}</span>
          <span>/</span>
          <span className="capitalize">
            {activeTab === 'timeline'
              ? 'Visits & Timeline'
              : activeTab === 'images'
              ? 'Images & Compare'
              : activeTab === 'reports'
              ? 'Report Results'
              : activeTab}
          </span>
        </div>
      </div>

      {/* Patient Header Card */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-teal-600 text-white font-bold text-xl flex items-center justify-center shadow-md">
            {patient.fullName.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                {patient.fullName}
              </h1>
              <span className="font-mono text-xs font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200">
                {patient.patientCode}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 font-medium">
              <span>{patient.age} years old</span>
              <span>•</span>
              <span>{patient.gender}</span>
              {patient.bloodGroup && (
                <>
                  <span>•</span>
                  <span className="font-semibold text-slate-700">Blood: {patient.bloodGroup}</span>
                </>
              )}
              {patient.allergies && (
                <>
                  <span>•</span>
                  <span className="text-rose-600 font-semibold flex items-center gap-1">
                    <ShieldAlert className="w-3.5 h-3.5" /> Allergies: {patient.allergies}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 w-full md:w-auto flex-wrap">
          {onNavigateToImageAnalyzer && (
            <button
              type="button"
              onClick={() => onNavigateToImageAnalyzer(patient.id)}
              className="flex-1 md:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-xl text-xs font-semibold text-teal-900 shadow-2xs transition-colors"
            >
              <ScanEye className="w-3.5 h-3.5 text-teal-600" />
              <span>Analyze Image</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setSelectedPrevImageId(undefined);
              setSelectedCurrImageOverride(null);
              setShowProgressionModal(true);
            }}
            className="flex-1 md:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl text-xs font-semibold text-indigo-900 shadow-2xs transition-colors"
            title="Compare previous visit image with current image side-by-side"
          >
            <Activity className="w-3.5 h-3.5 text-indigo-600" />
            <span>Compare Prev vs. Current Image</span>
          </button>
          <button
            type="button"
            onClick={() => onOpenAIWithPrompt?.('')}
            className="flex-1 md:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 shadow-2xs transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-teal-600" />
            <span>AI Assistant</span>
          </button>
          <button
            type="button"
            onClick={() => setShowEditModal(true)}
            className="flex-1 md:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 shadow-2xs transition-colors"
          >
            <Pencil className="w-3.5 h-3.5 text-teal-700" />
            <span>Edit details</span>
          </button>
          <button
            type="button"
            onClick={() => setShowPrintRx(true)}
            className="flex-1 md:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 shadow-2xs transition-colors"
          >
            <FileText className="w-3.5 h-3.5 text-slate-500" />
            <span>Prescription</span>
          </button>
          <button
            type="button"
            onClick={() => setWhatsAppData({
              isOpen: true,
              reportType: 'patient_summary',
              data: {
                activePrescriptions: prescriptions,
                consultation: consultations[0] || null
              }
            })}
            className="flex-1 md:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-[#25D366] hover:bg-[#1EBE5D] text-white rounded-xl text-xs font-bold shadow-2xs transition-colors"
            title="Send Medical Summary directly to patient's WhatsApp"
          >
            <WhatsAppIcon className="w-3.5 h-3.5 fill-white" />
            <span>WhatsApp Summary</span>
          </button>
          <button
            type="button"
            onClick={() => onStartConsultation(patient)}
            className="flex-1 md:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-semibold shadow-md transition-all"
          >
            <Stethoscope className="w-3.5 h-3.5" />
            <span>New consultation</span>
          </button>
        </div>
      </div>

      {/* AI Assistant Quick Chips */}
      <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-teal-900 flex items-center gap-1 mr-1">
          <Sparkles className="w-3.5 h-3.5 text-teal-600" />
          ASK THE AI ASSISTANT:
        </span>
        <button
          type="button"
          onClick={() => onOpenAIWithPrompt?.(`Summarize ${patient.fullName}'s clinical history`)}
          className="px-3 py-1 bg-white hover:bg-teal-50 border border-slate-200 hover:border-teal-400 rounded-lg text-xs font-medium text-slate-700 transition-colors"
        >
          Summarize this patient&apos;s history
        </button>
        <button
          type="button"
          onClick={() => onOpenAIWithPrompt?.(`Generate a structured SOAP note for ${patient.fullName}`)}
          className="px-3 py-1 bg-white hover:bg-teal-50 border border-slate-200 hover:border-teal-400 rounded-lg text-xs font-medium text-slate-700 transition-colors"
        >
          Generate a SOAP note
        </button>
        <button
          type="button"
          onClick={() => onOpenAIWithPrompt?.(`List current medications and dosing for ${patient.fullName}`)}
          className="px-3 py-1 bg-white hover:bg-teal-50 border border-slate-200 hover:border-teal-400 rounded-lg text-xs font-medium text-slate-700 transition-colors"
        >
          List current medications
        </button>
        <button
          type="button"
          onClick={() => onOpenAIWithPrompt?.(`Draft a follow-up plan for ${patient.fullName}`)}
          className="px-3 py-1 bg-white hover:bg-teal-50 border border-slate-200 hover:border-teal-400 rounded-lg text-xs font-medium text-slate-700 transition-colors"
        >
          Draft a follow-up plan
        </button>
      </div>

      {/* Profile Navigation Tabs */}
      <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-2xs space-y-2">
        <div className="flex items-center justify-between px-2 pt-0.5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Patient Chart Sections ({currentTabIndex + 1}/{PROFILE_TAB_ORDER.length})
            </span>
            {tabAdvanceToast && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-700 text-white text-[10px] font-bold animate-in fade-in duration-150">
                <CheckCircle2 className="w-3 h-3 text-emerald-300" />
                {tabAdvanceToast}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleAdvanceProfileTab}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 border border-teal-200 text-[11px] font-semibold text-teal-900 transition-colors cursor-pointer"
            title="Press Enter when fields are filled to jump to the next tab"
          >
            <span>Press</span>
            <kbd className="px-1.5 py-0.5 bg-white border border-teal-300 rounded text-[10px] font-mono font-bold text-teal-900 shadow-2xs">
              Enter ↵
            </kbd>
            <span>→ {PROFILE_TAB_LABELS[nextProfileTab]}</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {PROFILE_TAB_ORDER.map(tab => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`py-2.5 px-3.5 text-xs font-bold rounded-xl transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                  isActive
                    ? 'bg-teal-700 text-white shadow-xs'
                    : 'bg-slate-50/70 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {tab === 'overview' && <User className="w-3.5 h-3.5" />}
                {tab === 'images' && <ImageIcon className="w-3.5 h-3.5" />}
                {tab === 'vitals' && <Activity className="w-3.5 h-3.5" />}
                {tab === 'appointments' && <Calendar className="w-3.5 h-3.5" />}
                {tab === 'timeline' && <Clock className="w-3.5 h-3.5" />}
                {tab === 'reports' && <FileText className="w-3.5 h-3.5" />}
                {tab === 'prescriptions' && <Pill className="w-3.5 h-3.5" />}
                <span>
                  {tab === 'overview' && 'Overview'}
                  {tab === 'images' && `Images & Compare (${images.length})`}
                  {tab === 'vitals' && 'Vitals & Growth'}
                  {tab === 'appointments' && `Appointments (${appointments.length})`}
                  {tab === 'timeline' && `Visits & Timeline (${totalUnifiedCount})`}
                  {tab === 'reports' && `Report Results (${testReports.length})`}
                  {tab === 'prescriptions' && `Prescriptions (${prescriptions.length})`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-150">
          {/* Left Column: Personal info */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Personal Information
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
                <div>
                  <span className="text-[11px] text-slate-400 block font-medium">Full Name</span>
                  <span className="font-bold text-slate-800">{patient.fullName}</span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block font-medium">Patient Code</span>
                  <span className="font-mono font-bold text-teal-800">{patient.patientCode}</span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block font-medium">Age & Gender</span>
                  <span className="font-semibold text-slate-800">{patient.age}y / {patient.gender}</span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block font-medium">Mobile Number</span>
                  <span className="font-mono font-medium text-slate-800">{patient.mobile}</span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block font-medium">Blood Group</span>
                  <span className="font-semibold text-slate-800">{patient.bloodGroup || 'Not recorded'}</span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block font-medium">Date of Birth</span>
                  <span className="font-medium text-slate-700">{patient.dateOfBirth || 'Not provided'}</span>
                </div>
                {patient.emergencyContact && (
                  <div className="col-span-2">
                    <span className="text-[11px] text-slate-400 block font-medium">Emergency Contact</span>
                    <span className="font-medium text-slate-700">{patient.emergencyContact}</span>
                  </div>
                )}
                {patient.address && (
                  <div className="col-span-2 sm:col-span-3">
                    <span className="text-[11px] text-slate-400 block font-medium">Residential Address</span>
                    <span className="font-medium text-slate-700">{patient.address}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Direct Patient Profile Card: Compare Previous Image vs. Current Image */}
            <div className="bg-white p-6 rounded-2xl border border-indigo-200/90 shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center shrink-0">
                    <Activity className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-slate-900">
                        Compare Previous Image vs. Current Image
                      </h3>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-800 border border-indigo-200">
                        {images.length} {images.length === 1 ? 'Photo' : 'Photos'} in Profile
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Inspect previous visit photos alongside today&apos;s image with full-screen 1x–4x zoom, lesion marking, voice notes, and AI progression summary.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setShowProfileQrModal(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-teal-50 hover:bg-teal-100 border border-teal-200 text-teal-900 rounded-xl text-xs font-bold shadow-2xs transition cursor-pointer"
                    title="Scan QR code with phone camera to snap lesion photo for comparison"
                  >
                    <QrCode className="w-3.5 h-3.5 text-teal-700" />
                    <span>Scan QR from Mobile</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => pastImageInputRef.current?.click()}
                    disabled={isUploadingProfileImage}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-900 rounded-xl text-xs font-bold shadow-2xs transition cursor-pointer disabled:opacity-50"
                  >
                    <Upload className="w-3.5 h-3.5 text-blue-600" />
                    <span>{isUploadingProfileImage ? 'Storing...' : '+ Store Past Medical Image'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => quickCompareInputRef.current?.click()}
                    disabled={isUploadingProfileImage}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-xl text-xs font-bold shadow-2xs transition cursor-pointer disabled:opacity-50"
                  >
                    <Upload className="w-3.5 h-3.5 text-indigo-600" />
                    <span>{isUploadingProfileImage ? 'Uploading...' : '+ Upload Current Image'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPrevImageId(undefined);
                      setSelectedCurrImageOverride(null);
                      setShowProgressionModal(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-900 hover:bg-indigo-950 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer"
                  >
                    <Maximize2 className="w-3.5 h-3.5 text-indigo-200" />
                    <span>Compare Past vs. Current</span>
                  </button>
                </div>
              </div>

              {/* Side-by-Side Past vs. Current Preview right inside Patient Profile */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                {/* Slot 1: Previous Image */}
                <div
                  onClick={() => {
                    setSelectedPrevImageId(previousProfileImage?.id);
                    setSelectedCurrImageOverride(null);
                    setShowProgressionModal(true);
                  }}
                  className="group relative rounded-xl border border-slate-200 bg-slate-50/70 p-3 flex items-center gap-3.5 hover:border-indigo-300 hover:bg-indigo-50/20 transition cursor-pointer"
                >
                  <div className="w-20 h-20 rounded-lg bg-slate-900 overflow-hidden shrink-0 flex items-center justify-center border border-slate-200">
                    {previousProfileImage ? (
                      <img
                        src={previousProfileImage.url}
                        alt={previousProfileImage.caption || 'Previous visit image'}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    ) : (
                      <ImageIcon className="w-6 h-6 text-slate-500" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-200/80 text-slate-700">
                      1. Previous Image (Baseline)
                    </span>
                    {previousProfileImage ? (
                      <>
                        <p className="text-xs font-bold text-slate-800 truncate">
                          {previousProfileImage.caption || 'Clinical Baseline Photo'}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Captured {new Date(previousProfileImage.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-slate-500">
                        No previous image yet — click to upload baseline photo
                      </p>
                    )}
                  </div>
                </div>

                {/* Slot 2: Current Image */}
                <div
                  onClick={() => {
                    if (currentProfileImage) {
                      setSelectedPrevImageId(previousProfileImage?.id);
                      setSelectedCurrImageOverride(currentProfileImage);
                      setShowProgressionModal(true);
                    } else {
                      quickCompareInputRef.current?.click();
                    }
                  }}
                  className="group relative rounded-xl border border-teal-200 bg-teal-50/30 p-3 flex items-center gap-3.5 hover:border-teal-400 hover:bg-teal-50/60 transition cursor-pointer"
                >
                  <div className="w-20 h-20 rounded-lg bg-slate-900 overflow-hidden shrink-0 flex items-center justify-center border border-teal-200">
                    {currentProfileImage ? (
                      <img
                        src={currentProfileImage.url}
                        alt={currentProfileImage.caption || 'Current visit image'}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-teal-300">
                        <Upload className="w-5 h-5" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-teal-100 text-teal-900">
                      2. Current Image (Follow-up)
                    </span>
                    {currentProfileImage ? (
                      <>
                        <p className="text-xs font-bold text-slate-800 truncate">
                          {currentProfileImage.caption || 'Latest Follow-up Photo'}
                        </p>
                        <p className="text-[11px] text-teal-800 font-medium">
                          Captured {new Date(currentProfileImage.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      </>
                    ) : (
                      <p className="text-xs font-semibold text-teal-800">
                        + Click to upload today&apos;s current image &amp; compare
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs">
                <span className="text-[11px] text-slate-500">
                  Supports side-by-side full-screen zoom (1x–4x), area marking, voice notes &amp; editable AI summary.
                </span>
                <button
                  type="button"
                  onClick={() => setActiveTab('images')}
                  className="font-bold text-indigo-700 hover:text-indigo-950 flex items-center gap-1 shrink-0"
                >
                  <span>Open Full Image Gallery ({images.length})</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Visit & Clinical Report Comparison (Longitudinal Tracking) */}
            <VisitComparisonSection
              patient={patient}
              consultations={consultations}
              images={images}
              onStartConsultation={onStartConsultation}
              onRefreshData={loadPatientData}
              onOpenImageComparison={() => {
                setSelectedPrevImageId(undefined);
                setSelectedCurrImageOverride(null);
                setShowProgressionModal(true);
              }}
              onOpenWhatsApp={(data) => setWhatsAppData({
                isOpen: true,
                reportType: 'consultation_summary',
                data: { consultation: data.consultation }
              })}
            />

            {/* Medical History, Medications & Allergies */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Clinical Background & Allergies
                </h3>
                <button
                  type="button"
                  onClick={() => setShowEditModal(true)}
                  className="text-xs font-semibold text-teal-700 hover:text-teal-900 flex items-center gap-1"
                >
                  <Pencil className="w-3 h-3" />
                  <span>Edit</span>
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <span className="font-semibold text-rose-700 block mb-0.5">Known Drug Allergies:</span>
                  <p className="text-slate-700 bg-rose-50/50 p-2.5 rounded-lg border border-rose-100">
                    {patient.allergies || 'No known drug or environmental allergies documented.'}
                  </p>
                </div>

                <div>
                  <span className="font-semibold text-teal-800 block mb-0.5">Current / Regular Medications:</span>
                  <p className="text-slate-700 bg-teal-50/30 p-2.5 rounded-lg border border-teal-100">
                    {patient.currentMedications || 'No ongoing long-term medications documented.'}
                  </p>
                </div>

                <div>
                  <span className="font-semibold text-slate-700 block mb-0.5">Medical & Surgical History:</span>
                  <p className="text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                    {patient.medicalHistory || 'No past surgical or chronic medical history reported.'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Encounters summary */}
          <div className="space-y-6">
            {/* Quick stats card */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Patient Metrics
              </h3>
              <div className="grid grid-cols-2 gap-3 text-center">
                <button
                  type="button"
                  onClick={() => setActiveTab('timeline')}
                  className="bg-slate-50 hover:bg-teal-50/70 p-3 rounded-xl border border-slate-100 hover:border-teal-200 transition-colors cursor-pointer"
                >
                  <span className="text-xl font-extrabold text-slate-800 block">{totalUnifiedCount}</span>
                  <span className="text-[11px] text-slate-500 font-medium">Visits &amp; Timeline</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('images')}
                  className="bg-indigo-50/60 hover:bg-indigo-100/70 p-3 rounded-xl border border-indigo-100 hover:border-indigo-300 transition-colors cursor-pointer"
                >
                  <span className="text-xl font-extrabold text-indigo-900 block">{images.length}</span>
                  <span className="text-[11px] text-indigo-800 font-semibold">Images &amp; Compare</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('prescriptions')}
                  className="bg-slate-50 hover:bg-teal-50/70 p-3 rounded-xl border border-slate-100 hover:border-teal-200 transition-colors cursor-pointer"
                >
                  <span className="text-xl font-extrabold text-teal-800 block">{prescriptions.length}</span>
                  <span className="text-[11px] text-slate-500 font-medium">Prescriptions</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('reports')}
                  className="bg-slate-50 hover:bg-teal-50/70 p-3 rounded-xl border border-slate-100 hover:border-teal-200 transition-colors cursor-pointer"
                >
                  <span className="text-xl font-extrabold text-teal-800 block">{testReports.length}</span>
                  <span className="text-[11px] text-slate-500 font-medium">Report Results</span>
                </button>
              </div>
            </div>

            {/* Upcoming Follow-Up & Appointment Card */}
            {(() => {
              const upcomingAppt = appointments.find(a => a.status === 'scheduled' || a.status === 'checked_in');
              const followUpDate = upcomingAppt?.date || consultations[0]?.followUp?.date;
              const followUpInstructions = upcomingAppt?.instructions || consultations[0]?.followUp?.instructions;

              if (!followUpDate) {
                return (
                  <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-700 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-teal-700" />
                        Follow-up Status
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingAppointment(null);
                          setShowScheduleModal(true);
                        }}
                        className="text-xs font-bold text-teal-800 hover:underline"
                      >
                        + Schedule
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      No future follow-up appointment currently scheduled for this patient.
                    </p>
                  </div>
                );
              }

              return (
                <div className="bg-amber-50/80 border border-amber-200 p-4 rounded-2xl text-xs space-y-2">
                  <div className="flex items-center justify-between text-amber-900 font-bold">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-amber-700" />
                      Follow-up Scheduled
                    </span>
                    <span className="text-[10px] uppercase font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full">
                      {upcomingAppt?.time || '10:00 AM'}
                    </span>
                  </div>
                  <p className="text-slate-900 font-bold text-sm pt-0.5">
                    {followUpDate}
                  </p>
                  {followUpInstructions && (
                    <p className="text-slate-700 text-[11px] leading-relaxed bg-white/60 p-2 rounded-lg border border-amber-100">
                      <strong>Plan:</strong> {followUpInstructions}
                    </p>
                  )}
                  <div className="pt-1 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onStartConsultation(patient)}
                      className="flex-1 py-1.5 bg-teal-800 hover:bg-teal-900 text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors flex items-center justify-center gap-1"
                    >
                      <Stethoscope className="w-3.5 h-3.5" />
                      <span>Start Visit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingAppointment(upcomingAppt || null);
                        setShowScheduleModal(true);
                      }}
                      className="py-1.5 px-3 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 transition-colors"
                    >
                      Reschedule
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Quick Vitals & Growth Summary Card */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-teal-50 text-teal-800 flex items-center justify-center">
                    <Activity className="w-3.5 h-3.5" />
                  </div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Vitals & Biometrics
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('vitals')}
                  className="text-xs font-bold text-teal-800 hover:text-teal-950 flex items-center gap-1 transition-colors"
                >
                  <span>View Trends</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Historical weight, height, and body mass index (BMI) curves tracked over consultations.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('vitals')}
                className="w-full py-2 bg-slate-50 hover:bg-teal-50/80 border border-slate-200 hover:border-teal-300 rounded-xl text-xs font-semibold text-slate-700 hover:text-teal-950 transition-colors flex items-center justify-center gap-1.5"
              >
                <Activity className="w-3.5 h-3.5 text-teal-700" />
                <span>Open Biometric Charts & Trends</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB: CLINICAL IMAGES & PREVIOUS vs. CURRENT COMPARISON */}
      {activeTab === 'images' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* Top Comparison & Upload Banner */}
          <div className="bg-white p-6 rounded-2xl border border-indigo-200 shadow-2xs space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-indigo-700" />
                  <h3 className="text-sm font-bold text-slate-900">
                    Patient Clinical Images &amp; Previous vs. Current Comparison
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Compare any previous visit photo with the current image side-by-side (1x–4x zoom, lesion marking, voice dictation &amp; AI progression summary).
                </p>
              </div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPrevImageId(undefined);
                    setSelectedCurrImageOverride(null);
                    setShowProgressionModal(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-indigo-900 hover:bg-indigo-950 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer"
                >
                  <Maximize2 className="w-3.5 h-3.5 text-indigo-200" />
                  <span>Compare Previous vs. Current Image</span>
                </button>
              </div>
            </div>

            {/* Store Past or Current Medical Image Form inside Patient Profile */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <label className="text-xs font-bold text-slate-800">
                  Store Past Medical Image or Upload Current Image to {patient.fullName}&apos;s Permanent Archive
                </label>
                <div className="inline-flex rounded-lg bg-white border border-slate-200 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setUploadImageRole('past');
                      const d = new Date();
                      d.setDate(d.getDate() - 14);
                      setUploadExamDate(d.toISOString().split('T')[0]);
                    }}
                    className={`px-3 py-1 rounded-md font-bold transition ${
                      uploadImageRole === 'past'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    1. Past Medical Image (Historical)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUploadImageRole('current');
                      setUploadExamDate(new Date().toISOString().split('T')[0]);
                    }}
                    className={`px-3 py-1 rounded-md font-bold transition ${
                      uploadImageRole === 'current'
                        ? 'bg-teal-700 text-white'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    2. Current Visit Image (Today)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                    {uploadImageRole === 'past' ? 'Past Exam / Capture Date' : 'Current Exam Date'}
                  </label>
                  <input
                    type="date"
                    value={uploadExamDate}
                    onChange={e => setUploadExamDate(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-600"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                    Medical Image Modality
                  </label>
                  <select
                    value={uploadModality}
                    onChange={e => setUploadModality(e.target.value as MedicalImageModality)}
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-600"
                  >
                    {[
                      'Clinical Photo',
                      'Dermoscopy',
                      "Wood's Lamp",
                      'X-Ray / Radiograph',
                      'CT / MRI Scan',
                      'Ultrasound',
                      'Histopathology / Slide',
                      'Other Medical Image'
                    ].map(mod => (
                      <option key={mod} value={mod}>
                        {mod}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                    Anatomical Site / Clinical Caption
                  </label>
                  <input
                    type="text"
                    value={uploadCaption}
                    onChange={e => setUploadCaption(e.target.value)}
                    placeholder={
                      uploadImageRole === 'past'
                        ? 'e.g., Left forearm plaque — Past baseline before treatment'
                        : 'e.g., Left forearm plaque — Current follow-up visit'
                    }
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-600"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1 flex-wrap">
                <button
                  type="button"
                  onClick={() => profileImageInputRef.current?.click()}
                  disabled={isUploadingProfileImage}
                  className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 ${
                    uploadImageRole === 'past'
                      ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-2xs'
                      : 'bg-white hover:bg-slate-100 border border-slate-300 text-slate-800'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>
                    {isUploadingProfileImage
                      ? 'Storing & Extracting...'
                      : uploadImageRole === 'past'
                      ? 'Store Past Medical Image in Archive'
                      : 'Store Current Image in Archive'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => quickCompareInputRef.current?.click()}
                  disabled={isUploadingProfileImage}
                  className="px-3.5 py-2 bg-teal-800 hover:bg-teal-900 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs transition cursor-pointer disabled:opacity-50"
                >
                  <Upload className="w-3.5 h-3.5 text-teal-200" />
                  <span>Upload Current Image &amp; Compare Immediately</span>
                </button>
              </div>
            </div>
          </div>

          {/* Patient Medical Image Archive Grid */}
          {sortedPatientImages.length === 0 ? (
            <div className="bg-white p-12 rounded-2xl border border-dashed border-slate-300 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center mx-auto">
                <ImageIcon className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-slate-700">No Medical Images Stored Yet</p>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Store a past/baseline medical image or upload today&apos;s current clinical image above to extract findings and compare progression for {patient.fullName}.
              </p>
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => pastImageInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Store Past Medical Image</span>
                </button>
                <button
                  type="button"
                  onClick={() => quickCompareInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-900 hover:bg-indigo-950 text-white rounded-xl text-xs font-bold shadow-xs transition"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Current Image</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...sortedPatientImages].reverse().map((img, idx) => {
                const isLatest = idx === 0 && img.imageRole !== 'past';
                const displayDate = img.examDate || img.createdAt;
                return (
                  <div
                    key={img.id}
                    className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs flex flex-col justify-between hover:border-indigo-300 transition"
                  >
                    <div>
                      <div className="relative h-48 bg-slate-900 overflow-hidden">
                        <img
                          src={img.dataUrl || img.url}
                          alt={img.caption || 'Patient medical image'}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-md shadow-xs ${
                              img.imageRole === 'past'
                                ? 'bg-blue-700 text-white'
                                : isLatest
                                ? 'bg-teal-600 text-white'
                                : 'bg-slate-900/80 text-slate-100 backdrop-blur-xs'
                            }`}
                          >
                            {img.imageRole === 'past' ? 'Stored Past Image' : isLatest ? 'Current / Latest' : 'Stored Follow-up'}
                          </span>
                          {img.modality && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-black/70 text-teal-200 border border-white/15">
                              {img.modality}
                            </span>
                          )}
                        </div>
                        <div className="absolute bottom-2.5 right-2.5 bg-slate-900/80 text-white text-[10px] font-mono px-2 py-0.5 rounded backdrop-blur-xs">
                          Exam Date:{' '}
                          {new Date(displayDate).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric'
                          })}
                        </div>
                      </div>
                      <div className="p-4 space-y-1.5">
                        <p className="text-xs font-bold text-slate-900">
                          {img.caption || img.bodyArea || 'Clinical Examination Image'}
                        </p>
                        {img.extractedFindings ? (
                          <p className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100 leading-snug">
                            <strong className="text-slate-800">Extracted:</strong> {img.extractedFindings}
                          </p>
                        ) : (
                          <p className="text-[11px] text-slate-500">
                            Stored in patient archive • {img.modality || 'Clinical Photo'}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPrevImageId(img.id);
                          setSelectedCurrImageOverride(null);
                          setShowProgressionModal(true);
                        }}
                        className="flex-1 py-1.5 px-2.5 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-blue-900 rounded-lg text-[11px] font-bold transition cursor-pointer"
                      >
                        Use as Past Image
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPrevImageId(
                            previousProfileImage && previousProfileImage.id !== img.id
                              ? previousProfileImage.id
                              : undefined
                          );
                          setSelectedCurrImageOverride(img);
                          setShowProgressionModal(true);
                        }}
                        className="flex-1 py-1.5 px-2.5 bg-indigo-900 hover:bg-indigo-950 text-white rounded-lg text-[11px] font-bold transition cursor-pointer"
                      >
                        Compare as Current
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB: VITALS & GROWTH DATA VISUALIZATION (Recharts) */}
      {activeTab === 'vitals' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          <PatientVitalsChart patient={patient} consultations={consultations} />
          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={() => setActiveTab('appointments')}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl shadow-2xs transition"
            >
              <span>Next: Appointments & Follow-ups</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </div>
        </div>
      )}

      {/* TAB 2: APPOINTMENTS & FOLLOW-UPS */}
      {activeTab === 'appointments' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">Appointments & Follow-up History</h3>
              <p className="text-xs text-slate-500">
                Scheduled reviews and follow-up dates consistent with clinical consultations
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingAppointment(null);
                setShowScheduleModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-teal-800 hover:bg-teal-900 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Schedule Follow-up</span>
            </button>
          </div>

          {appointments.length === 0 ? (
            <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center mx-auto shadow-2xs">
                <Calendar className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-slate-700">No appointments scheduled for this patient</p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Follow-ups set during consultation automatically sync here, or schedule an appointment below.
              </p>
              <button
                type="button"
                onClick={() => {
                  setEditingAppointment(null);
                  setShowScheduleModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-teal-800 text-white rounded-xl text-xs font-semibold hover:bg-teal-900 transition-colors shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Schedule Follow-up</span>
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs divide-y divide-slate-100">
              {appointments.map(appt => (
                <div key={appt.id} className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-teal-700" />
                        {appt.date}
                      </span>
                      <span className="text-xs text-slate-500 font-medium flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {appt.time || '10:00 AM'}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        appt.status === 'completed'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : appt.status === 'checked_in'
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : appt.status === 'in_progress'
                          ? 'bg-teal-50 text-teal-800 border border-teal-300'
                          : appt.status === 'cancelled'
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        {appt.status.replace('_', ' ')}
                      </span>
                      <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full capitalize">
                        {appt.type.replace('_', ' ')}
                      </span>
                    </div>

                    {appt.instructions && (
                      <p className="text-xs text-slate-700 bg-slate-50 p-2 rounded-lg border border-slate-200/80">
                        <strong>Doctor Instructions:</strong> {appt.instructions}
                      </p>
                    )}
                    {appt.notes && (
                      <p className="text-[11px] text-slate-500 italic">
                        Notes: {appt.notes}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                    {appt.status !== 'completed' && appt.status !== 'cancelled' && (
                      <button
                        type="button"
                        onClick={() => onStartConsultation(patient)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-800 hover:bg-teal-900 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
                      >
                        <Stethoscope className="w-3.5 h-3.5 text-teal-200" />
                        <span>Start Consultation</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setEditingAppointment(appt);
                        setShowScheduleModal(true);
                      }}
                      className="px-2.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors"
                    >
                      Reschedule
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Step Navigation */}
          <div className="flex justify-between items-center pt-2">
            <button
              type="button"
              onClick={() => setActiveTab('vitals')}
              className="text-xs text-slate-500 hover:text-slate-800 font-semibold"
            >
              ← Vitals & Growth
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('timeline')}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl shadow-2xs transition"
            >
              <span>Next: Visits &amp; Timeline</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </div>
        </div>
      )}

      {/* TAB 3: UNIFIED VISITS & CHRONOLOGICAL TIMELINE */}
      {activeTab === 'timeline' && (
        <div className="space-y-5 animate-in fade-in duration-150">
          {/* Unified Header & Controls Bar */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  <Clock className="w-4 h-4 text-teal-700" />
                  <span>Unified Visits &amp; Clinical Timeline</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Complete chronological history of consultations, diagnoses, procedures, billing, and clinical notes
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {unifiedChronologicalEntries.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => toggleAllEvents(true)}
                      className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-700 transition"
                    >
                      Expand All
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleAllEvents(false)}
                      className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-700 transition"
                    >
                      Collapse All
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => onStartConsultation(patient)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-teal-800 hover:bg-teal-900 text-white rounded-xl text-xs font-semibold shadow-2xs transition"
                >
                  <Stethoscope className="w-3.5 h-3.5" />
                  <span>New Visit</span>
                </button>
              </div>
            </div>

            {totalUnifiedCount > 0 && (
              <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-3 border-t border-slate-100">
                {/* Search Input */}
                <div className="relative flex-1 max-w-md">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={timelineSearch}
                    onChange={e => setTimelineSearch(e.target.value)}
                    placeholder="Filter visits by diagnosis, symptom, procedure, medicine, or doctor..."
                    className="w-full text-xs pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-teal-600 focus:bg-white"
                  />
                </div>

                {/* Status Filter & Chronological Sort */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="inline-flex rounded-xl bg-slate-100 p-0.5 border border-slate-200">
                    {(['all', 'signed', 'draft'] as const).map(statusOpt => (
                      <button
                        key={statusOpt}
                        type="button"
                        onClick={() => setTimelineStatusFilter(statusOpt)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold capitalize transition ${
                          timelineStatusFilter === statusOpt
                            ? 'bg-white text-teal-900 shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {statusOpt === 'all' ? `All (${totalUnifiedCount})` : statusOpt}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => setTimelineSortOrder(prev => (prev === 'desc' ? 'asc' : 'desc'))}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-semibold text-slate-700 transition"
                    title="Toggle chronological sort order"
                  >
                    <ArrowUpDown className="w-3.5 h-3.5 text-teal-700" />
                    <span>{timelineSortOrder === 'desc' ? 'Newest First' : 'Oldest First'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Chronological Stream */}
          {unifiedChronologicalEntries.length === 0 ? (
            <div className="bg-white p-12 rounded-2xl border border-dashed border-slate-300 text-center space-y-2">
              <Clock className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs font-bold text-slate-700">
                {totalUnifiedCount === 0
                  ? 'No Consultations or Timeline Visits Recorded Yet'
                  : 'No Visits Match Your Filter'}
              </p>
              <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                {totalUnifiedCount === 0
                  ? `When you start or sign a consultation for ${patient.fullName}, each visit and its clinical details will appear here in chronological order.`
                  : 'Try clearing your search query or switching the status filter to view all visits.'}
              </p>
            </div>
          ) : (
            <div className="space-y-5 relative before:absolute before:inset-0 before:left-5 before:w-0.5 before:bg-slate-200">
              {unifiedChronologicalEntries.map((evt, index) => {
                const isExpanded = !!expandedEvents[evt.id];
                const dateObj = new Date(evt.date);
                const dateFormatted = dateObj.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                });
                const visitNumber =
                  timelineSortOrder === 'desc'
                    ? unifiedChronologicalEntries.length - index
                    : index + 1;

                // Construct consultation payload for WhatsApp sharing
                const consultationForShare: Consultation = evt.rawConsultation || {
                  id: evt.id,
                  patientId: patient.id,
                  patientCode: patient.patientCode,
                  patientName: patient.fullName,
                  patientAge: patient.age,
                  patientGender: patient.gender,
                  doctorId: doctor?.id || '',
                  doctorName: evt.doctorName,
                  consultationDate: evt.date,
                  status: evt.status,
                  fee: evt.fee,
                  symptoms: evt.symptoms,
                  diagnoses: evt.diagnoses,
                  tests: evt.tests,
                  procedures: evt.procedures || [],
                  clinicalNotes: evt.clinicalNotes || { examination: '', investigationsAdvised: '', plan: '' },
                  bodyMarkers: [],
                  images: evt.images || [],
                  followUp: evt.followUp || {},
                  prescriptions: evt.prescriptions || [],
                  aiSummary: evt.aiSummary || '',
                  createdAt: evt.date,
                  updatedAt: evt.date
                };

                return (
                  <div key={evt.id} className="relative pl-12">
                    {/* Chronological Node Indicator */}
                    <div
                      className={`absolute left-5 top-4 -translate-x-1/2 w-4 h-4 rounded-full border-2 border-white shadow-xs z-10 ${
                        evt.status === 'signed' ? 'bg-teal-600' : 'bg-amber-500'
                      }`}
                      title={evt.status === 'signed' ? 'Signed Consultation' : 'Draft Consultation'}
                    />

                    <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden transition-all hover:border-slate-300">
                      {/* Unified Visit & Timeline Header */}
                      <div
                        onClick={() => toggleExpandEvent(evt.id)}
                        className="p-4 bg-slate-50/70 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-mono font-bold text-slate-500 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                              Visit #{visitNumber}
                            </span>
                            <span className="text-xs font-extrabold text-slate-900 tracking-tight">
                              {dateFormatted}
                            </span>
                            <span
                              className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                evt.status === 'signed'
                                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                  : 'bg-amber-50 text-amber-800 border border-amber-200'
                              }`}
                            >
                              {evt.status === 'signed' ? (
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <FileEdit className="w-3 h-3 text-amber-600" />
                              )}
                              {evt.status.toUpperCase()}
                            </span>
                            <span className="text-slate-300 hidden sm:inline">•</span>
                            <span className="text-xs font-bold text-teal-800">
                              {evt.diagnoses.join(', ') || 'Consultation Encounter'}
                            </span>
                          </div>

                          {/* Visit Metadata Summary Row (formerly in Visits tab) */}
                          <div className="flex items-center gap-2.5 flex-wrap text-[11px] text-slate-500">
                            <span>
                              Doctor: <strong className="text-slate-700">Dr. {evt.doctorName.replace(/^Dr\.\s*/i, '')}</strong>
                            </span>
                            <span>•</span>
                            <span>
                              Fee: <strong className="text-slate-700">₹{Number(evt.fee || 0).toLocaleString('en-IN')}</strong>
                            </span>
                            <span>•</span>
                            <span>
                              Procedures: <strong className="text-slate-700">{evt.procedures?.length || 0}</strong>
                            </span>
                            {evt.prescriptions && evt.prescriptions.length > 0 && (
                              <>
                                <span>•</span>
                                <span>
                                  Rx: <strong className="text-slate-700">{evt.prescriptions.length} meds</strong>
                                </span>
                              </>
                            )}
                            {evt.followUp?.date && (
                              <>
                                <span>•</span>
                                <span className="text-amber-800 font-semibold">
                                  Follow-up: {evt.followUp.date}
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Actions & Expand Toggle */}
                        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setWhatsAppData({
                                isOpen: true,
                                reportType: 'consultation_summary',
                                data: { consultation: consultationForShare }
                              });
                            }}
                            className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-semibold flex items-center gap-1 transition"
                            title="Send Consultation Visit Report to Patient's WhatsApp"
                          >
                            <WhatsAppIcon className="w-3.5 h-3.5 fill-[#128C7E]" />
                            <span>WhatsApp</span>
                          </button>
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-600 hover:text-slate-900">
                            <span>{isExpanded ? 'Hide Details' : 'Full Record'}</span>
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                            )}
                          </span>
                        </div>
                      </div>

                      {/* Content Card Body */}
                      <div className="p-5 space-y-4 text-xs">
                        {/* Symptoms */}
                        {evt.symptoms && evt.symptoms.length > 0 && (
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                              SYMPTOMS &amp; COMPLAINTS
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {evt.symptoms.map((s: string) => (
                                <span
                                  key={s}
                                  className="px-2.5 py-0.5 bg-slate-100 text-slate-700 rounded-full font-medium text-[11px]"
                                >
                                  {s}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* AI Summary Block */}
                        {evt.aiSummary && (
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-teal-800 flex items-center gap-1 mb-1">
                              <Sparkles className="w-3 h-3 text-teal-600" />
                              VISIT SUMMARY &amp; CHARGES
                            </span>
                            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-800 leading-relaxed shadow-inner">
                              <MarkdownView content={evt.aiSummary} />
                            </div>
                          </div>
                        )}

                        {/* Expanded details: Clinical Notes, Procedures, Investigations, Prescriptions, Photos */}
                        {isExpanded && (
                          <div className="pt-3 border-t border-slate-100 space-y-3.5 animate-in fade-in duration-150">
                            {evt.clinicalNotes?.examination && (
                              <div>
                                <span className="font-bold text-slate-700 block mb-0.5">Clinical Examination:</span>
                                <p className="text-slate-600 bg-slate-50/70 p-2.5 rounded-lg border border-slate-100">
                                  {evt.clinicalNotes.examination}
                                </p>
                              </div>
                            )}

                            {evt.clinicalNotes?.plan && (
                              <div>
                                <span className="font-bold text-slate-700 block mb-0.5">Treatment Plan:</span>
                                <p className="text-slate-600 bg-slate-50/70 p-2.5 rounded-lg border border-slate-100">
                                  {evt.clinicalNotes.plan}
                                </p>
                              </div>
                            )}

                            {evt.procedures && evt.procedures.length > 0 && (
                              <div>
                                <span className="font-bold text-slate-700 block mb-1">Procedures Performed:</span>
                                <div className="flex flex-wrap gap-2">
                                  {evt.procedures.map((proc, idx) => (
                                    <div
                                      key={proc.id || idx}
                                      className="px-3 py-1.5 bg-teal-50/60 border border-teal-200/80 rounded-lg text-[11px] text-teal-950 flex items-center gap-2"
                                    >
                                      <span className="font-semibold">{proc.name}</span>
                                      <span className="font-mono font-bold text-teal-800">₹{Number(proc.cost || 0).toLocaleString('en-IN')}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {evt.tests && evt.tests.length > 0 && (
                              <div>
                                <span className="font-bold text-slate-700 block mb-0.5">Investigations Ordered:</span>
                                <p className="text-slate-600">{evt.tests.join(', ')}</p>
                              </div>
                            )}

                            {evt.prescriptions && evt.prescriptions.length > 0 && (
                              <div>
                                <span className="font-bold text-slate-700 block mb-1">Medications Prescribed:</span>
                                <ul className="list-disc list-inside text-slate-600 space-y-0.5">
                                  {evt.prescriptions.map((p: any, i: number) => (
                                    <li key={p.id || i}>
                                      <span className="font-semibold text-slate-800">{p.medicineName}</span> ({p.dosage},{' '}
                                      {p.frequency}
                                      {p.duration ? `, ${p.duration}` : ''})
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {evt.images && evt.images.length > 0 && (
                              <div>
                                <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                                  <span className="font-bold text-slate-700 flex items-center gap-1.5">
                                    <ImageIcon className="w-3.5 h-3.5 text-teal-700" />
                                    Clinical Photos Documented ({evt.images.length}):
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setShowProgressionModal(true)}
                                    className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-900 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition"
                                  >
                                    <Activity className="w-3 h-3 text-indigo-600" />
                                    <span>Compare Prev vs. Current Image</span>
                                  </button>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {evt.images.map((img: ClinicalImage) => (
                                    <div
                                      key={img.id}
                                      onClick={() => setShowProgressionModal(true)}
                                      className="group relative w-16 h-16 rounded-xl border border-slate-200 overflow-hidden bg-slate-100 cursor-pointer hover:border-teal-500 shadow-2xs transition"
                                      title={img.caption || 'Click to compare with previous / current image'}
                                    >
                                      <img
                                        src={img.url}
                                        alt={img.caption || 'Encounter photo'}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                      />
                                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[9px] font-bold transition-opacity">
                                        Compare
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Step Navigation */}
          <div className="p-4 bg-white rounded-2xl border border-slate-200 flex justify-between items-center">
            <button
              type="button"
              onClick={() => setActiveTab('appointments')}
              className="text-xs text-slate-500 hover:text-slate-800 font-semibold"
            >
              ← Appointments
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('reports')}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-800 hover:bg-teal-900 text-white text-xs font-bold rounded-xl shadow-xs transition"
            >
              <span>Next: Report Results</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* TAB: REPORT RESULTS */}
      {activeTab === 'reports' && (
        <div className="space-y-4">
          <PatientReportsSection
            patient={patient}
            reports={testReports}
            doctorName={doctor?.name}
            onRefresh={loadPatientData}
            onOpenAIWithPrompt={onOpenAIWithPrompt}
          />
          <div className="p-4 bg-white rounded-2xl border border-slate-200 flex justify-between items-center">
            <button
              type="button"
              onClick={() => setActiveTab('timeline')}
              className="text-xs text-slate-500 hover:text-slate-800 font-semibold"
            >
              ← Visits &amp; Timeline
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('prescriptions')}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-800 hover:bg-teal-900 text-white text-xs font-bold rounded-xl shadow-xs transition"
            >
              <span>Next: Prescriptions</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* TAB: PRESCRIPTIONS */}
      {activeTab === 'prescriptions' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs divide-y divide-slate-100 animate-in fade-in duration-150">
          <div className="p-4 bg-slate-50/70 flex items-center justify-between flex-wrap gap-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Active &amp; Historical Prescriptions ({prescriptions.length})
            </h4>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setWhatsAppData({
                  isOpen: true,
                  reportType: 'prescription',
                  data: { prescriptions }
                })}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#25D366] hover:bg-[#1EBE5D] text-white rounded-lg text-xs font-bold shadow-2xs transition"
                title="Send all prescriptions to patient's WhatsApp"
              >
                <WhatsAppIcon className="w-3.5 h-3.5 fill-white" />
                <span>WhatsApp Rx</span>
              </button>
              <button
                type="button"
                onClick={() => setShowPrintRx(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold shadow-2xs"
              >
                <Printer className="w-3.5 h-3.5 text-teal-700" />
                Print Prescription (Rx)
              </button>
            </div>
          </div>

          {prescriptions.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              No prescriptions recorded for this patient.
            </div>
          ) : (
            prescriptions.map(rx => (
              <div key={rx.id} className="p-4 flex items-center justify-between text-xs hover:bg-slate-50/80 transition-colors">
                <div>
                  <p className="font-bold text-slate-900 text-sm">{rx.medicineName}</p>
                  <p className="text-slate-600 mt-0.5">
                    {rx.dosage} • <span className="font-mono text-teal-800 font-semibold">{rx.frequency}</span> • {rx.duration}
                  </p>
                  {rx.instructions && (
                    <p className="text-[11px] text-slate-500 mt-0.5 italic">Instructions: {rx.instructions}</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-slate-400">
                    {new Date(rx.date || rx.createdAt).toLocaleDateString()}
                  </span>
                  <button
                    type="button"
                    onClick={() => setWhatsAppData({
                      isOpen: true,
                      reportType: 'prescription',
                      data: { prescriptions: [rx] }
                    })}
                    className="p-1.5 text-emerald-700 hover:bg-emerald-50 rounded-lg border border-transparent hover:border-emerald-200 transition"
                    title="Send this prescription via WhatsApp"
                  >
                    <WhatsAppIcon className="w-4 h-4 fill-emerald-600" />
                  </button>
                </div>
              </div>
            ))
          )}
          {/* Step Navigation */}
          <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
            <button
              type="button"
              onClick={() => setActiveTab('timeline')}
              className="text-xs text-slate-500 hover:text-slate-800 font-semibold"
            >
              ← Visits &amp; Timeline
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl shadow-2xs transition"
            >
              <span>Back to Overview</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </div>
        </div>
      )}

      {/* Print Rx Modal */}
      {showPrintRx && doctor && (
        <PrintRxModal
          patient={patient}
          prescriptions={prescriptions}
          doctor={doctor}
          onClose={() => setShowPrintRx(false)}
        />
      )}

      {/* Edit Patient Modal */}
      {showEditModal && (
        <EditPatientModal
          patient={patient}
          onClose={() => setShowEditModal(false)}
          onPatientUpdated={(updated) => {
            setPatient(updated);
            setActiveTab('overview');
          }}
        />
      )}

      {/* Schedule Appointment / Follow-up Modal */}
      {showScheduleModal && (
        <ScheduleAppointmentModal
          patient={patient}
          initialAppointment={editingAppointment}
          onClose={() => {
            setShowScheduleModal(false);
            setEditingAppointment(null);
          }}
          onSuccess={() => {
            setShowScheduleModal(false);
            setEditingAppointment(null);
            loadPatientData();
            setActiveTab('appointments');
          }}
        />
      )}

      {/* Lesion Progression / Previous vs. Current Image Modal */}
      {showProgressionModal && (
        <LesionProgressionModal
          patient={patient}
          images={images}
          initialPreviousImageId={selectedPrevImageId}
          currentImageOverride={selectedCurrImageOverride}
          onImagesUpdated={(updatedImages) => setImages(updatedImages)}
          onClose={() => {
            setShowProgressionModal(false);
            setSelectedPrevImageId(undefined);
            setSelectedCurrImageOverride(null);
          }}
        />
      )}

      {/* WhatsApp Medical Report Modal */}
      {whatsAppData?.isOpen && (
        <WhatsAppShareModal
          isOpen={whatsAppData.isOpen}
          onClose={() => setWhatsAppData(null)}
          patient={patient}
          doctor={doctor}
          reportType={whatsAppData.reportType}
          data={whatsAppData.data}
        />
      )}

      {/* Mobile QR Code Scanner Modal for Patient Profile & Comparison */}
      <MobileQrUploadModal
        isOpen={showProfileQrModal}
        onClose={() => setShowProfileQrModal(false)}
        patientId={patient?.id}
        patientName={patient?.fullName}
        title="Scan QR to Upload for Comparison"
        subtitle="Direct Mobile-to-Comparison Sync"
        slotLabel="Comparison Medical Image"
        onImageUploaded={handleProfileQrImageUploaded}
      />
    </div>
  );
};
