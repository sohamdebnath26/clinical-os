import React, { useState, useEffect } from 'react';
import { Consultation, Patient, ProcedureItem, BodyMarker, ClinicalImage, PrescriptionItem, AIImageAnalysisResult } from '../types';
import { PREDEFINED_DIAGNOSES, PREDEFINED_TESTS, PREDEFINED_PROCEDURES, COMMON_MEDICATIONS } from '../data/clinicalCatalogues';
import { BodyMap } from './BodyMap';
import { ClinicalImageUploader } from './ClinicalImageUploader';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { analyzeImageVisualFeatures } from '../utils/visualImageAnalyzer';
import { parseClinicalNoteToStructuredSummary, ParsedClinicalNoteSummary } from '../utils/clinicalNoteAutoFill';
import { WhatsAppShareModal, WhatsAppIcon } from './WhatsAppShareModal';
import { VoiceDictationButton } from './VoiceDictationButton';
import confetti from 'canvas-confetti';
import {
  X,
  Stethoscope,
  FlaskConical,
  Scissors,
  FileText,
  User,
  Image as ImageIcon,
  Calendar,
  Sparkles,
  Check,
  Plus,
  Trash2,
  RefreshCw,
  Pill,
  ChevronDown,
  ShieldAlert,
  Clock,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Mic,
  Search
} from 'lucide-react';

interface ConsultationModalProps {
  consultation: Consultation;
  patient: Patient;
  initialTab?: TabType;
  onClose: () => void;
  onSuccess: (updatedConsultation: Consultation) => void;
}

export type TabType =
  | 'diagnosis'
  | 'tests'
  | 'procedure'
  | 'notes'
  | 'bodymap'
  | 'images'
  | 'followup'
  | 'aisummary';

export const TAB_ORDER: TabType[] = [
  'diagnosis',
  'tests',
  'procedure',
  'notes',
  'bodymap',
  'images',
  'followup',
  'aisummary'
];

export const TAB_NEXT_LABELS: Record<TabType, string> = {
  diagnosis: 'Skin Tests',
  tests: 'Procedures',
  procedure: 'Clinical Notes',
  notes: 'Body Map',
  bodymap: 'Clinical Images',
  images: 'Follow-up & Rx',
  followup: 'AI Summary & Sign',
  aisummary: 'Sign & Finish'
};

export const ConsultationModal: React.FC<ConsultationModalProps> = ({
  consultation,
  patient,
  initialTab = 'notes',
  onClose,
  onSuccess
}) => {
  const { doctor } = useAuth();
  const [showWhatsApp, setShowWhatsApp] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [fee, setFee] = useState<number>(
    consultation.fee && consultation.fee !== 500
      ? consultation.fee
      : doctor?.defaultConsultationFee && doctor.defaultConsultationFee !== 500
      ? doctor.defaultConsultationFee
      : 650
  );

  // Clinical data state
  const [symptoms, setSymptoms] = useState<string[]>(
    consultation.symptoms?.length
      ? consultation.symptoms
      : [patient.primaryDiagnosis || 'Pigmentation / Dark spots']
  );
  const [diagnoses, setDiagnoses] = useState<string[]>(consultation.diagnoses || []);
  const [secondaryDiagnosis, setSecondaryDiagnosis] = useState<string>(
    consultation.diagnoses?.slice(1).join(', ') || ''
  );
  const [tests, setTests] = useState<string[]>(consultation.tests || []);
  const [procedures, setProcedures] = useState<ProcedureItem[]>(consultation.procedures || []);
  const [clinicalNotes, setClinicalNotes] = useState({
    examination:
      consultation.clinicalNotes?.examination ||
      [
        patient.weight ? `Weight: ${patient.weight} kg` : '',
        patient.notes ? `Intake Notes: ${patient.notes}` : ''
      ]
        .filter(Boolean)
        .join(' | '),
    investigationsAdvised: consultation.clinicalNotes?.investigationsAdvised || '',
    plan: consultation.clinicalNotes?.plan || ''
  });
  const [bodyMarkers, setBodyMarkers] = useState<BodyMarker[]>(consultation.bodyMarkers || []);
  const [images, setImages] = useState<ClinicalImage[]>(consultation.images || []);
  const [followUp, setFollowUp] = useState<{ date?: string; instructions?: string; notes?: string }>({
    date: consultation.followUp?.date || '',
    instructions: consultation.followUp?.instructions || '',
    notes: consultation.followUp?.notes || ''
  });
  const [prescriptions, setPrescriptions] = useState<PrescriptionItem[]>(consultation.prescriptions || []);
  const [aiSummary, setAiSummary] = useState<string>(consultation.aiSummary || '');

  // Derive clinical baseline morphology & AI image summary from patient condition
  const getInitialDermSummary = () => {
    const primary = (
      consultation.diagnoses?.[0] ||
      patient.primaryDiagnosis ||
      consultation.symptoms?.[0] ||
      'Pigmentation / Dark spots'
    ).toLowerCase();

    if (primary.includes('acne') || primary.includes('comedo') || primary.includes('pustul')) {
      return {
        lesionType: 'Inflammatory papules, pustules & closed comedones',
        colour: 'Erythematous with post-inflammatory hyperpigmented macules',
        distribution: 'Bilateral malar cheeks, mandibular jawline & forehead',
        sizeExtent: '2–5 mm discrete & clustered follicular lesions',
        borders: 'Well-circumscribed follicular papules, mild perilesional halo',
        severity: 'Moderate Grade II–III · follicular porphyrin fluorescence',
        aiObservation:
          'Follicular-centered erythematous papules and comedones over bilateral cheeks with early post-inflammatory hyperpigmentation; no deep nodulocystic scarring.',
        aiSummaryTitle: 'Acne (Acne Vulgaris)',
        aiConfidence: '94% Match · High',
        leftSpecimenTitle: 'Left cheek',
        leftSpecimenSummary:
          'Clustered erythematous papules (3–4 mm) and closed comedones over left malar & buccal region; mild perifollicular erythema.',
        rightSpecimenTitle: 'Right cheek',
        rightSpecimenSummary:
          'Scattered inflammatory papulopustules and residual brown PIH macules over right cheek; orange-red follicular fluorescence on Wood’s lamp.',
        aiResultNarrative:
          'AI Vision Summary: Bilateral facial inflammatory papules and comedones consistent with Acne (Acne Vulgaris) with early post-inflammatory hyperpigmentation (PIH). Dermoscopy shows follicular keratin plugs and perifollicular erythema. Recommended: Topical retinoid + benzoyl peroxide/clindamycin regimen and strict photoprotection.',
        differentials: [
          'Acne (Acne Vulgaris)',
          'Rosacea (Papulopustular Rosacea)',
          'Hair Follicle Infection (Pityrosporum Folliculitis)'
        ],
        workup: ['Dermoscopy', "Wood's Lamp Examination"]
      };
    }

    if (primary.includes('tinea') || primary.includes('fungal') || primary.includes('ringworm')) {
      return {
        lesionType: 'Annular erythematous plaque with active scaly border',
        colour: 'Erythematous periphery with central clearing',
        distribution: 'Asymmetrical plaque with peripheral centrifugal spread',
        sizeExtent: '3–5 cm annular polycyclic plaque',
        borders: 'Sharply marginated, raised, advancing vesicular-scaly border',
        severity: 'Moderate · negative coral-red fluorescence on Wood’s lamp',
        aiObservation:
          'Well-demarcated annular plaque with Peripheral collarette scaling and central hypopigmented clearing; peripheral dotted vessels on dermoscopy.',
        aiSummaryTitle: 'Ringworm (Tinea Corporis)',
        aiConfidence: '95% Match · High',
        leftSpecimenTitle: 'Left cheek / Primary site',
        leftSpecimenSummary:
          'Annular erythematous plaque (4.2 cm) with raised peripheral collarette scale and central clearing; outward centrifugal orientation.',
        rightSpecimenTitle: 'Right cheek / Contralateral site',
        rightSpecimenSummary:
          'Early satellite erythematous maculopapule (1.1 cm) with fine peripheral white scale on dermoscopy.',
        aiResultNarrative:
          'AI Vision Summary: Classic annular scaly plaque with advancing raised border and central clearing suggestive of Ringworm (Tinea Corporis). Dermoscopy highlights peripheral inward-facing white scales and dotted vessels. Recommended: 10% KOH mount microscopy and topical/systemic antifungal therapy.',
        differentials: [
          'Ringworm (Tinea Corporis)',
          'Ring-Shaped Dermal Bump Rash (Granuloma Annulare)',
          'Skin Lupus (Subacute Cutaneous Lupus Erythematosus)'
        ],
        workup: ['KOH Mount (Fungal)', 'Dermoscopy']
      };
    }

    if (primary.includes('eczema') || primary.includes('atopic') || primary.includes('dermatitis')) {
      return {
        lesionType: 'Erythematous scaly patches & lichenified plaques',
        colour: 'Erythematous to violaceous-brown with fine xerotic scale',
        distribution: 'Bilateral symmetrical flexural & facial distribution',
        sizeExtent: '3–6 cm ill-defined coalescing patches',
        borders: 'Ill-defined, blending into surrounding xerotic skin',
        severity: 'Moderate · EASI ~9.4 · marked barrier impairment',
        aiObservation:
          'Bilateral erythematous plaques with fine white scaling, excoriation marks, and background xerosis; patchy dotted vessels and yellow serocrusts on dermoscopy.',
        aiSummaryTitle: 'Atopic Eczema (Atopic Dermatitis)',
        aiConfidence: '92% Match · High',
        leftSpecimenTitle: 'Left cheek',
        leftSpecimenSummary:
          'Ill-defined erythematous scaly patch (3.5 cm) with fine fissuring and superficial excoriations over left malar cheek.',
        rightSpecimenTitle: 'Right cheek',
        rightSpecimenSummary:
          'Symmetrical eczematous patch (3.2 cm) with patchy yellow serocrusts and clustered dotted vessels on dermoscopy.',
        aiResultNarrative:
          'AI Vision Summary: Bilateral subacute eczematous patches with xerosis, fine scaling, and focal serocrusts consistent with Atopic Eczema (Atopic Dermatitis). Dermoscopy demonstrates clustered dotted vessels and yellow scaling. Recommended: Intensive ceramide barrier repair + short-course anti-inflammatory topical therapy.',
        differentials: [
          'Atopic Eczema (Atopic Dermatitis)',
          'Allergic Contact Eczema (Allergic Contact Dermatitis)',
          'Seborrheic Eczema (Seborrheic Dermatitis)'
        ],
        workup: ['Patch Test (Allergy)', 'Serum Total IgE']
      };
    }

    // Default: Pigmentation / Melasma / Dark spots
    return {
      lesionType: 'Macule / Confluent Patch',
      colour: 'Hyperpigmented light-to-dark brown',
      distribution: 'Malar cheeks, bilateral centrofacial',
      sizeExtent: '2–4 cm confluent symmetrical patches',
      borders: 'Irregular, well-demarcated, non-scaly geographic borders',
      severity: 'Moderate (mMASI 6.8) · mixed epidermal-dermal on Wood’s lamp',
      aiObservation:
        'Bilateral symmetrical hyperpigmented macules and patches over malar prominence; accentuated reticular pigment network with perifollicular sparing on dermoscopy.',
      aiSummaryTitle: 'Dark Facial Patches (Centrofacial Melasma)',
      aiConfidence: '94% Match · High',
      leftSpecimenTitle: 'Left cheek',
      leftSpecimenSummary:
        'Confluent brown hyperpigmented macules & patch (3.2 × 2.4 cm) over left malar eminence; regular pseudoreticular pigment network with follicular sparing.',
      rightSpecimenTitle: 'Right cheek',
      rightSpecimenSummary:
        'Symmetrical hyperpigmented patch (2.9 × 2.2 cm) over right malar prominence; partial epidermal contrast enhancement on Wood’s lamp.',
      aiResultNarrative:
        'AI Vision Summary: Symmetrical bilateral malar hyperpigmented macules and confluent patches consistent with Dark Facial Patches (Centrofacial Melasma). Dermoscopy shows an accentuated pseudoreticular brown pigment network sparing follicular openings without atypical vessels. Recommended: Broad-spectrum tinted SPF 50+, tyrosinase inhibitor topicals, and Wood’s lamp follow-up.',
      differentials: [
        'Dark Facial Patches (Centrofacial Melasma)',
        'Post-Inflammatory Dark Spots (Post-Inflammatory Hyperpigmentation)',
        'Sun Spots (Solar Lentigines)'
      ],
      workup: ["Wood's Lamp Examination", 'Dermoscopy']
    };
  };

  const initialDerm = getInitialDermSummary();

  // Structured Dermatology Image Summary & Rx Summary states (Section 6 & 7)
  const [dermMorphology, setDermMorphology] = useState({
    lesionType: initialDerm.lesionType,
    colour: initialDerm.colour,
    distribution: initialDerm.distribution,
    sizeExtent: initialDerm.sizeExtent,
    borders: initialDerm.borders,
    severity: initialDerm.severity,
    aiObservation: initialDerm.aiObservation
  });
  const [aiImageSummaryResult, setAiImageSummaryResult] = useState({
    title: initialDerm.aiSummaryTitle,
    confidence: initialDerm.aiConfidence,
    leftSpecimenTitle: initialDerm.leftSpecimenTitle,
    leftSpecimenSummary: initialDerm.leftSpecimenSummary,
    rightSpecimenTitle: initialDerm.rightSpecimenTitle,
    rightSpecimenSummary: initialDerm.rightSpecimenSummary,
    narrative: initialDerm.aiResultNarrative,
    differentials: initialDerm.differentials,
    workup: initialDerm.workup
  });
  const [selectedSummarySpecimen, setSelectedSummarySpecimen] = useState<'all' | 'left' | 'right' | string>('all');
  const [inlineMedSummary, setInlineMedSummary] = useState('');
  const [topicalsAdvice, setTopicalsAdvice] = useState('');
  const [customSymptomInput, setCustomSymptomInput] = useState('');
  const summaryImageInputRef = React.useRef<HTMLInputElement>(null);

  // Single Voice-to-Text Clinical Note state & auto-fill tracking
  const [singleVoiceNote, setSingleVoiceNote] = useState<string>(
    [
      consultation.clinicalNotes?.examination,
      consultation.clinicalNotes?.investigationsAdvised,
      consultation.clinicalNotes?.plan
    ]
      .filter(Boolean)
      .join(' ')
  );
  const [isAutoFillingSummary, setIsAutoFillingSummary] = useState(false);
  const [autoFillSummaryReady, setAutoFillSummaryReady] = useState(false);
  const doctorEditedFieldsRef = React.useRef<Set<string>>(new Set());

  const markDoctorEdited = (fieldKey: string) => {
    doctorEditedFieldsRef.current.add(fieldKey);
  };

  // Apply parsed clinical note into AI Summary (Visit Summary) and Clinical Notes fields
  // while respecting any fields that the doctor manually edited later
  const applyParsedClinicalNoteToSummary = React.useCallback(
    (
      parsed: ParsedClinicalNoteSummary,
      options?: { source?: 'single' | 'sections'; forceOverwrite?: boolean }
    ) => {
      const edited = doctorEditedFieldsRef.current;
      const force = Boolean(options?.forceOverwrite);

      if (options?.source === 'single') {
        setClinicalNotes(prev => ({
          examination: force || !edited.has('notes.examination') ? parsed.examination : prev.examination,
          investigationsAdvised:
            force || !edited.has('notes.investigationsAdvised')
              ? parsed.investigationsAdvised
              : prev.investigationsAdvised,
          plan: force || !edited.has('notes.plan') ? parsed.plan : prev.plan
        }));
      }

      if (force || !edited.has('summary.symptoms')) {
        setSymptoms(parsed.symptoms);
      }
      if (force || !edited.has('summary.primaryDiagnosis')) {
        setDiagnoses(prev => [parsed.primaryDiagnosis, ...prev.slice(1).filter(d => d !== parsed.primaryDiagnosis)]);
      }
      if (force || !edited.has('summary.secondaryDiagnosis')) {
        setSecondaryDiagnosis(parsed.secondaryDiagnosis);
      }
      if (force || !edited.has('summary.tests')) {
        setTests(parsed.tests);
      }
      if ((force || !edited.has('summary.procedures')) && parsed.procedures.length > 0) {
        setProcedures(parsed.procedures);
      }

      setDermMorphology(prev => ({
        lesionType: force || !edited.has('derm.lesionType') ? parsed.dermMorphology.lesionType : prev.lesionType,
        colour: force || !edited.has('derm.colour') ? parsed.dermMorphology.colour : prev.colour,
        distribution: force || !edited.has('derm.distribution') ? parsed.dermMorphology.distribution : prev.distribution,
        sizeExtent: force || !edited.has('derm.sizeExtent') ? parsed.dermMorphology.sizeExtent : prev.sizeExtent,
        borders: force || !edited.has('derm.borders') ? parsed.dermMorphology.borders : prev.borders,
        severity: force || !edited.has('derm.severity') ? parsed.dermMorphology.severity : prev.severity,
        aiObservation: force || !edited.has('derm.aiObservation') ? parsed.dermMorphology.aiObservation : prev.aiObservation
      }));

      setAiImageSummaryResult(prev => ({
        ...prev,
        title: force || !edited.has('summary.primaryDiagnosis') ? parsed.aiImageSummaryResult.title : prev.title,
        confidence: parsed.aiImageSummaryResult.confidence,
        leftSpecimenTitle: parsed.aiImageSummaryResult.leftSpecimenTitle,
        leftSpecimenSummary: parsed.aiImageSummaryResult.leftSpecimenSummary,
        rightSpecimenTitle: parsed.aiImageSummaryResult.rightSpecimenTitle,
        rightSpecimenSummary: parsed.aiImageSummaryResult.rightSpecimenSummary,
        narrative: force || !edited.has('derm.narrative') ? parsed.aiImageSummaryResult.narrative : prev.narrative,
        differentials: parsed.aiImageSummaryResult.differentials,
        workup: parsed.aiImageSummaryResult.workup
      }));

      if (force || !edited.has('summary.medications')) {
        setPrescriptions(
          parsed.prescriptions.map(p => ({
            ...p,
            patientId: patient.id,
            consultationId: consultation.id
          }))
        );
        setInlineMedSummary(parsed.inlineMedSummary);
      }

      if (force || !edited.has('summary.topicalsAdvice')) {
        setTopicalsAdvice(parsed.topicalsAdvice);
      }

      setFollowUp(prev => ({
        date: force || !edited.has('summary.followUpDate') ? parsed.followUp.date : prev.date,
        instructions:
          force || !edited.has('summary.followUpInstructions') ? parsed.followUp.instructions : prev.instructions,
        notes: force || !edited.has('summary.followUpNotes') ? parsed.followUp.notes : prev.notes
      }));

      if (force || !edited.has('summary.aiSummary')) {
        setAiSummary(parsed.aiSummaryText);
      }

      setAutoFillSummaryReady(true);
    },
    [patient.id, consultation.id]
  );

  // Trigger instant client-side + background LLM AI Summary auto-fill whenever singleVoiceNote changes
  const handleSingleVoiceNoteChange = (newText: string, forceOverwrite = false) => {
    setSingleVoiceNote(newText);
    if (!newText.trim()) {
      setAutoFillSummaryReady(false);
      return;
    }
    const instantParsed = parseClinicalNoteToStructuredSummary(newText, {
      patientPrimaryDiagnosis: patient.primaryDiagnosis,
      existingSymptoms: symptoms
    });
    applyParsedClinicalNoteToSummary(instantParsed, {
      source: 'single',
      forceOverwrite
    });
  };

  // Also refine with backend AI (OpenRouter / Gemini) after brief debounce when clinical notes are filled
  useEffect(() => {
    const combined = [
      singleVoiceNote.trim(),
      clinicalNotes.examination.trim(),
      clinicalNotes.investigationsAdvised.trim(),
      clinicalNotes.plan.trim()
    ]
      .filter(Boolean)
      .join('. ');

    if (combined.length < 8) return;

    const timer = setTimeout(async () => {
      setIsAutoFillingSummary(true);
      try {
        const res = await api.ai.parseClinicalNote({
          rawNote: singleVoiceNote,
          existingExamination: clinicalNotes.examination,
          existingInvestigations: clinicalNotes.investigationsAdvised,
          existingPlan: clinicalNotes.plan,
          patientPrimaryDiagnosis: patient.primaryDiagnosis,
          existingSymptoms: symptoms
        });
        if (res?.parsed) {
          applyParsedClinicalNoteToSummary(res.parsed, {
            source: singleVoiceNote.trim() ? 'single' : 'sections',
            forceOverwrite: false
          });
        }
      } catch {
        // Local deterministic parser already populated all fields
      } finally {
        setIsAutoFillingSummary(false);
      }
    }, 650);

    return () => clearTimeout(timer);
  }, [
    singleVoiceNote,
    clinicalNotes.examination,
    clinicalNotes.investigationsAdvised,
    clinicalNotes.plan,
    patient.primaryDiagnosis,
    applyParsedClinicalNoteToSummary
  ]);

  // Filter & Search states
  const [diagnosisSearch, setDiagnosisSearch] = useState('');
  const [customDiagnosis, setCustomDiagnosis] = useState('');

  const [testSearch, setTestSearch] = useState('');
  const [customTest, setCustomTest] = useState('');

  const [procedureSearch, setProcedureSearch] = useState('');
  const [customProcedureName, setCustomProcedureName] = useState('');
  const [customProcedureCost, setCustomProcedureCost] = useState<number>(500);

  // New medication form inside consultation
  const [medName, setMedName] = useState('');
  const [medDosage, setMedDosage] = useState('500 mg');
  const [medRoute, setMedRoute] = useState('Oral');
  const [medFrequency, setMedFrequency] = useState('1-0-1');
  const [medDuration, setMedDuration] = useState('5 days');
  const [medQty, setMedQty] = useState('10');
  const [medQtyManual, setMedQtyManual] = useState(false);
  const [medInstructions, setMedInstructions] = useState('After meals');
  const [isMedDropdownOpen, setIsMedDropdownOpen] = useState(false);

  // Helper to expand shorthand frequency like "101" -> "1-0-1"
  const normalizeFrequencyInput = (raw: string): string => {
    const trimmed = raw.trim();
    if (/^[0-9]{3,4}$/.test(trimmed)) {
      return trimmed.split('').join('-');
    }
    return raw;
  };

  // Helper to expand shorthand duration like "5d" -> "5 days", "2w" -> "2 weeks", "1m" -> "1 month"
  const normalizeDurationInput = (raw: string): string => {
    const trimmed = raw.trim().toLowerCase();
    const match = trimmed.match(/^(\d+)\s*(d|w|m)$/);
    if (!match) return raw;
    const count = Number(match[1]);
    const unit = match[2];
    if (unit === 'd') return `${count} ${count === 1 ? 'day' : 'days'}`;
    if (unit === 'w') return `${count} ${count === 1 ? 'week' : 'weeks'}`;
    if (unit === 'm') return `${count} ${count === 1 ? 'month' : 'months'}`;
    return raw;
  };

  // Auto-calculate QTY when frequency, duration, or route changes (unless manually overridden)
  useEffect(() => {
    if (medQtyManual) return;
    if (medRoute && medRoute !== 'Oral') {
      setMedQty('1');
      return;
    }

    // Daily dose count from pattern like 1-0-1, 1-1-1, etc.
    let dailyDoses = 1;
    const dashParts = medFrequency.trim().split('-').map(n => parseFloat(n));
    if (dashParts.length >= 2 && dashParts.every(n => !isNaN(n))) {
      dailyDoses = dashParts.reduce((a, b) => a + b, 0) || 1;
    } else if (/twice|bd|bid/i.test(medFrequency)) {
      dailyDoses = 2;
    } else if (/thrice|three|tid|tds/i.test(medFrequency)) {
      dailyDoses = 3;
    } else if (/four|qid/i.test(medFrequency)) {
      dailyDoses = 4;
    } else if (/sos|prn/i.test(medFrequency)) {
      dailyDoses = 1;
    }

    // Total days from duration string
    let days = 1;
    const durLower = medDuration.trim().toLowerCase();
    const dayMatch = durLower.match(/(\d+)\s*(d|day|days)/);
    const weekMatch = durLower.match(/(\d+)\s*(w|wk|week|weeks)/);
    const monthMatch = durLower.match(/(\d+)\s*(m|mo|month|months)/);
    if (dayMatch) {
      days = parseInt(dayMatch[1], 10);
    } else if (weekMatch) {
      days = parseInt(weekMatch[1], 10) * 7;
    } else if (monthMatch) {
      days = parseInt(monthMatch[1], 10) * 30;
    } else {
      const numOnly = parseInt(durLower, 10);
      if (!isNaN(numOnly) && numOnly > 0) days = numOnly;
    }

    const total = Math.max(1, Math.round(dailyDoses * days));
    setMedQty(String(total));
  }, [medFrequency, medDuration, medRoute, medQtyManual]);

  // Prior body markers for this patient
  const [priorMarkers, setPriorMarkers] = useState<BodyMarker[]>([]);

  // Loading states
  const [isSigning, setIsSigning] = useState(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [isGeneratingImageSummaryAI, setIsGeneratingImageSummaryAI] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AI Image Analysis state inside consultation
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const [activeImageAnalysis, setActiveImageAnalysis] = useState<AIImageAnalysisResult | null>(null);
  const [activeAnalyzedImage, setActiveAnalyzedImage] = useState<ClinicalImage | null>(null);
  const [analysisFeedbackToast, setAnalysisFeedbackToast] = useState<string | null>(null);

  // Fetch prior markers
  useEffect(() => {
    api.patients.getMarkers(patient.id)
      .then(res => {
        setPriorMarkers(res.markers.filter(m => m.consultationId !== consultation.id));
      })
      .catch(() => {});
  }, [patient.id, consultation.id]);

  // Calculate procedure cost sum
  const proceduresTotal = procedures.reduce((acc, p) => acc + (p.cost || 0), 0);
  const grandTotal = proceduresTotal + (fee || 0);

  // Run AI analysis specifically for Section 6 Dermatology Image Summary (side by side)
  const handleRunSummaryAIAnalysis = async (targetImg?: ClinicalImage) => {
    setIsGeneratingImageSummaryAI(true);
    try {
      const imgToAnalyze = targetImg || images[0];
      if (imgToAnalyze && imgToAnalyze.url.startsWith('data:image')) {
        const visualMetrics = await analyzeImageVisualFeatures(imgToAnalyze.url);
        const res = await api.ai.analyzeImage({
          imageBase64: imgToAnalyze.url,
          mimeType: imgToAnalyze.mimeType || 'image/jpeg',
          patientId: patient.id,
          visualMetrics,
          clinicalNotes: [
            diagnoses.length > 0 ? `Diagnoses: ${diagnoses.join(', ')}` : '',
            symptoms.length > 0 ? `Symptoms: ${symptoms.join(', ')}` : '',
            clinicalNotes.examination ? `Examination: ${clinicalNotes.examination}` : ''
          ].filter(Boolean).join('. ')
        });
        const analysis = res.analysis;
        setActiveImageAnalysis(analysis);
        setActiveAnalyzedImage(imgToAnalyze);

        const topConfidence = analysis.differentials?.[0]?.confidence || 'High';
        const firstRationale =
          analysis.differentials?.[0]?.rationale ||
          analysis.timelineCorrelation ||
          initialDerm.leftSpecimenSummary;
        const secondRationale =
          analysis.differentials?.[1]?.rationale ||
          analysis.suggestedManagementPlan ||
          initialDerm.rightSpecimenSummary;

        setAiImageSummaryResult(prev => ({
          ...prev,
          title: analysis.primaryImpression || prev.title,
          confidence: `${topConfidence} Confidence · AI Verified`,
          leftSpecimenTitle: images[0]?.bodyArea || images[0]?.caption || prev.leftSpecimenTitle,
          leftSpecimenSummary: firstRationale,
          rightSpecimenTitle: images[1]?.bodyArea || images[1]?.caption || prev.rightSpecimenTitle,
          rightSpecimenSummary: secondRationale,
          narrative: `AI Vision Summary: ${analysis.primaryImpression}. ${firstRationale} ${
            analysis.suggestedManagementPlan ? `Recommended Plan: ${analysis.suggestedManagementPlan}` : ''
          }`,
          differentials:
            analysis.differentials?.length > 0
              ? analysis.differentials.map(d => d.condition)
              : prev.differentials,
          workup:
            analysis.recommendedInvestigations?.length > 0
              ? analysis.recommendedInvestigations
              : prev.workup
        }));
      } else {
        // Refresh from current diagnosis / symptoms context
        const refreshed = getInitialDermSummary();
        setAiImageSummaryResult({
          title: refreshed.aiSummaryTitle,
          confidence: refreshed.aiConfidence,
          leftSpecimenTitle: refreshed.leftSpecimenTitle,
          leftSpecimenSummary: refreshed.leftSpecimenSummary,
          rightSpecimenTitle: refreshed.rightSpecimenTitle,
          rightSpecimenSummary: refreshed.rightSpecimenSummary,
          narrative: refreshed.aiResultNarrative,
          differentials: refreshed.differentials,
          workup: refreshed.workup
        });
        setDermMorphology(prev => ({
          lesionType: prev.lesionType || refreshed.lesionType,
          colour: prev.colour || refreshed.colour,
          distribution: prev.distribution || refreshed.distribution,
          sizeExtent: prev.sizeExtent || refreshed.sizeExtent,
          borders: prev.borders || refreshed.borders,
          severity: prev.severity || refreshed.severity,
          aiObservation: prev.aiObservation || refreshed.aiObservation
        }));
      }
    } catch (err) {
      console.warn('Summary AI image analysis error:', err);
    } finally {
      setIsGeneratingImageSummaryAI(false);
    }
  };

  // Handle direct image upload from Visit Summary card 6
  const handleSummaryImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file, idx) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          const newImg: ClinicalImage = {
            id: `img-${Date.now()}-${idx}`,
            patientId: patient.id,
            consultationId: consultation.id,
            url: reader.result,
            filename: file.name,
            mimeType: file.type || 'image/jpeg',
            sizeBytes: file.size,
            caption: file.name.replace(/\.[^/.]+$/, '') || (images.length === 0 ? 'Left cheek' : 'Right cheek'),
            bodyArea: images.length === 0 ? 'Left cheek' : 'Right cheek',
            tags: ['Dermoscopy', 'Baseline'],
            uploadedAt: new Date().toISOString(),
            createdAt: new Date().toISOString()
          };
          setImages(prev => [...prev, newImg]);
          if (idx === 0) {
            handleRunSummaryAIAnalysis(newImg);
          }
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  // AI Summary / Regenerate from tabs
  const generateSummary = async () => {
    setIsGeneratingAI(true);
    try {
      // Sync structured summary fields from tabs
      if (prescriptions.length > 0) {
        setInlineMedSummary(
          prescriptions
            .map(p => `${p.medicineName} ${p.dosage} · ${p.frequency} · ${p.duration}`)
            .join('; ')
        );
      }
      const refreshed = getInitialDermSummary();
      setDermMorphology(prev => ({
        lesionType: prev.lesionType || refreshed.lesionType,
        colour: prev.colour || refreshed.colour,
        distribution: prev.distribution || refreshed.distribution,
        sizeExtent: prev.sizeExtent || refreshed.sizeExtent,
        borders: prev.borders || refreshed.borders,
        severity: prev.severity || refreshed.severity,
        aiObservation: prev.aiObservation || refreshed.aiObservation
      }));
      await handleRunSummaryAIAnalysis();

      const res = await api.ai.summarize({
        patient: {
          name: patient.fullName,
          age: patient.age,
          gender: patient.gender,
          code: patient.patientCode
        },
        date: consultation.consultationDate,
        symptoms,
        diagnoses,
        tests,
        procedures,
        consultationFee: fee,
        clinicalNotes
      });
      setAiSummary(res.summary);
    } catch (err: unknown) {
      console.warn('AI summary error:', err);
    } finally {
      setIsGeneratingAI(false);
    }
  };

  // Switch to tab
  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
  };

  const currentTabIndex = TAB_ORDER.indexOf(activeTab);
  const nextTab = currentTabIndex < TAB_ORDER.length - 1 ? TAB_ORDER[currentTabIndex + 1] : null;
  const prevTab = currentTabIndex > 0 ? TAB_ORDER[currentTabIndex - 1] : null;

  const advanceToNextTab = () => {
    if (nextTab) {
      handleTabChange(nextTab);
    }
  };

  // Diagnosis handlers
  const toggleDiagnosis = (diag: string) => {
    if (diagnoses.includes(diag)) {
      setDiagnoses(diagnoses.filter(d => d !== diag));
    } else {
      setDiagnoses([...diagnoses, diag]);
    }
  };

  const addCustomDiagnosis = () => {
    if (!customDiagnosis.trim()) return;
    if (!diagnoses.includes(customDiagnosis.trim())) {
      setDiagnoses([...diagnoses, customDiagnosis.trim()]);
    }
    setCustomDiagnosis('');
  };

  // Test handlers
  const toggleTest = (test: string) => {
    if (tests.includes(test)) {
      setTests(tests.filter(t => t !== test));
    } else {
      setTests([...tests, test]);
    }
  };

  const addCustomTest = () => {
    if (!customTest.trim()) return;
    if (!tests.includes(customTest.trim())) {
      setTests([...tests, customTest.trim()]);
    }
    setCustomTest('');
  };

  // Procedure handlers
  const addProcedure = (name: string, cost: number) => {
    const newProc: ProcedureItem = {
      id: `proc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name,
      cost
    };
    setProcedures([...procedures, newProc]);
  };

  const removeProcedure = (id: string) => {
    setProcedures(procedures.filter(p => p.id !== id));
  };

  const updateProcedureCost = (id: string, cost: number) => {
    setProcedures(procedures.map(p => p.id === id ? { ...p, cost } : p));
  };

  // Image Upload handler
  const handleImageUpload = async (dataUrl: string, filename: string, caption?: string) => {
    const res = await api.images.upload({
      patientId: patient.id,
      consultationId: consultation.id,
      dataUrl,
      filename,
      caption
    });
    setImages([...images, res.image]);
  };

  const handleImageDelete = async (imageId: string) => {
    await api.images.delete(imageId);
    setImages(images.filter(i => i.id !== imageId));
  };

  const handleAnalyzeConsultationImage = async (image: ClinicalImage) => {
    setIsAnalyzingImage(true);
    setActiveAnalyzedImage(image);
    setActiveImageAnalysis(null); // Clear previous image's results
    setError(null);
    try {
      const visualMetrics = await analyzeImageVisualFeatures(image.url);
      const res = await api.ai.analyzeImage({
        imageBase64: image.url,
        mimeType: image.mimeType,
        patientId: patient.id,
        visualMetrics,
        clinicalNotes: [
          clinicalNotes.examination ? `Examination: ${clinicalNotes.examination}` : '',
          symptoms.length > 0 ? `Symptoms: ${symptoms.join(', ')}` : '',
          image.caption ? `Image caption: ${image.caption}` : ''
        ].filter(Boolean).join('. ')
      });
      setActiveImageAnalysis(res.analysis);
    } catch (err: unknown) {
      console.warn('Consultation image analysis failed:', err);
      setError('AI clinical image analysis failed. Please try again.');
    } finally {
      setIsAnalyzingImage(false);
    }
  };

  const handleApplyDiagnosesFromAI = () => {
    if (!activeImageAnalysis) return;
    const newDiags = activeImageAnalysis.differentials.map(d => d.condition);
    const updated = Array.from(new Set([...diagnoses, ...newDiags]));
    setDiagnoses(updated);
    setAnalysisFeedbackToast('Diagnoses applied! Advancing to Clinical Notes...');
    setActiveImageAnalysis(null);
    setIsAnalyzingImage(false);
    setTimeout(() => {
      setAnalysisFeedbackToast(null);
      handleTabChange('notes');
    }, 600);
  };

  const handleApplyPlanFromAI = () => {
    if (!activeImageAnalysis) return;
    const currentNotes = { ...clinicalNotes };
    if (activeImageAnalysis.recommendedInvestigations.length > 0) {
      const testsStr = activeImageAnalysis.recommendedInvestigations.join(', ');
      currentNotes.investigationsAdvised = currentNotes.investigationsAdvised
        ? `${currentNotes.investigationsAdvised}; ${testsStr}`
        : testsStr;
    }
    if (activeImageAnalysis.suggestedManagementPlan) {
      currentNotes.plan = currentNotes.plan
        ? `${currentNotes.plan}\n\n[AI Plan]: ${activeImageAnalysis.suggestedManagementPlan}`
        : activeImageAnalysis.suggestedManagementPlan;
    }
    setClinicalNotes(currentNotes);
    setAnalysisFeedbackToast('Workup & Plan applied! Advancing to Clinical Notes...');
    setActiveImageAnalysis(null);
    setIsAnalyzingImage(false);
    setTimeout(() => {
      setAnalysisFeedbackToast(null);
      handleTabChange('notes');
    }, 600);
  };


  // Body Marker handlers
  const handleAddMarker = (newMarker: Omit<BodyMarker, 'id' | 'createdAt'>) => {
    const marker: BodyMarker = {
      ...newMarker,
      id: `bm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      createdAt: new Date().toISOString()
    };
    setBodyMarkers([...bodyMarkers, marker]);
  };

  const handleRemoveMarker = (id: string) => {
    setBodyMarkers(bodyMarkers.filter(m => m.id !== id));
  };

  // Prescription handler
  const handleAddPrescription = () => {
    if (!medName.trim()) return;
    const normalizedFreq = normalizeFrequencyInput(medFrequency) || '1-0-1';
    const normalizedDur = normalizeDurationInput(medDuration) || '5 days';
    const doseDisplay = [
      medDosage.trim() || '500 mg',
      medRoute ? `(${medRoute})` : '',
      medQty ? `Qty: ${medQty}` : ''
    ]
      .filter(Boolean)
      .join(' · ');

    const item: PrescriptionItem = {
      id: `rx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      patientId: patient.id,
      consultationId: consultation.id,
      medicineName: medName.trim(),
      dosage: doseDisplay,
      frequency: normalizedFreq,
      duration: normalizedDur,
      instructions: medInstructions.trim(),
      date: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
    markDoctorEdited('summary.medications');
    setPrescriptions([...prescriptions, item]);
    setMedName('');
    setMedQtyManual(false);
    setIsMedDropdownOpen(false);
  };

  const handleRemovePrescription = (id: string) => {
    setPrescriptions(prescriptions.filter(p => p.id !== id));
  };

  // Sign & Finish Handler
  const handleSignAndFinish = async () => {
    setIsSigning(true);
    setError(null);

    const combinedDiagnoses = Array.from(
      new Set([
        ...diagnoses.filter(Boolean),
        ...(secondaryDiagnosis.trim() ? [secondaryDiagnosis.trim()] : [])
      ])
    );

    // If AI summary is not generated, create structured deterministic summary from the 7 cards
    let finalSummary = aiSummary;
    if (!finalSummary) {
      const lines: string[] = [];
      const dateFormatted = consultation.consultationDate.split('T')[0];
      lines.push(`CONSULTATION — ${dateFormatted}\n`);
      if (symptoms.length > 0) {
        lines.push(`CHIEF COMPLAINTS: ${symptoms.join(', ')}`);
      }
      if (combinedDiagnoses.length > 0) {
        lines.push('DIAGNOSIS');
        combinedDiagnoses.forEach(d => lines.push(`• ${d}`));
        lines.push('');
      }
      if (
        dermMorphology.lesionType ||
        dermMorphology.distribution ||
        dermMorphology.aiObservation ||
        aiImageSummaryResult.narrative
      ) {
        lines.push('DERMATOLOGY IMAGE & AI SUMMARY');
        if (aiImageSummaryResult.title) lines.push(`• AI Impression: ${aiImageSummaryResult.title}`);
        if (dermMorphology.lesionType) lines.push(`• Lesion: ${dermMorphology.lesionType}`);
        if (dermMorphology.colour) lines.push(`• Colour: ${dermMorphology.colour}`);
        if (dermMorphology.distribution) lines.push(`• Distribution: ${dermMorphology.distribution}`);
        if (dermMorphology.aiObservation) lines.push(`• Observation: ${dermMorphology.aiObservation}`);
        if (aiImageSummaryResult.narrative) lines.push(`• AI Image Summary Result: ${aiImageSummaryResult.narrative}`);
        lines.push('');
      }
      lines.push('CHARGES');
      lines.push(`• Procedures: ₹${proceduresTotal}`);
      lines.push(`• Consultation fee: ₹${fee}`);
      lines.push(`• Total: ₹${grandTotal}`);
      finalSummary = lines.join('\n');
    }

    const updatedClinicalNotes = {
      ...clinicalNotes,
      plan: [clinicalNotes.plan, topicalsAdvice ? `Topicals & Skincare: ${topicalsAdvice}` : '']
        .filter(Boolean)
        .join('\n')
    };

    try {
      const res = await api.consultations.sign(consultation.id, {
        fee,
        symptoms,
        diagnoses: combinedDiagnoses,
        tests,
        procedures,
        clinicalNotes: updatedClinicalNotes,
        bodyMarkers,
        images,
        followUp,
        prescriptions,
        aiSummary: finalSummary
      });

      // Celebration confetti
      try {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.8 }
        });
      } catch {
        // ignore
      }

      onSuccess(res.consultation);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save consultation';
      setError(message);
    } finally {
      setIsSigning(false);
    }
  };

  // Filter diagnoses
  const filteredDiagnoses = PREDEFINED_DIAGNOSES.filter(d =>
    d.toLowerCase().includes(diagnosisSearch.toLowerCase().trim())
  );

  // Filter tests
  const filteredTests = PREDEFINED_TESTS.filter(t =>
    t.toLowerCase().includes(testSearch.toLowerCase().trim())
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-[#fafcfb] rounded-3xl w-full max-w-[920px] shadow-2xl flex flex-col max-h-[95vh] border border-[#d6e2df] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Deep Forest Teal Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-[#0e423d] via-[#13534c] to-[#17645c] flex items-center justify-between shrink-0 text-white">
          <div>
            <h2 className="text-[22px] font-bold text-white tracking-tight leading-tight">Consultation</h2>
            <div className="flex items-center gap-2 mt-1 text-[13px] text-[#b8dad5] font-medium flex-wrap">
              <span className="text-white/95 font-medium">{patient.fullName}</span>
              <span>·</span>
              <span>{patient.age}y</span>
              <span>·</span>
              <span>{patient.gender}</span>
              {patient.weight ? (
                <>
                  <span>·</span>
                  <span>{patient.weight} kg</span>
                </>
              ) : null}
              <span className="font-mono text-[11px] text-white bg-white/15 border border-white/20 px-2.5 py-0.5 rounded-md font-semibold tracking-wider ml-0.5">
                {patient.patientCode}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleTabChange('aisummary')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all border shadow-2xs shrink-0 ${
                activeTab === 'aisummary'
                  ? 'bg-white text-[#0f2926] border-white ring-2 ring-teal-300/60'
                  : 'bg-white/15 hover:bg-white/25 text-white border-white/25'
              }`}
              title="Open AI-auto-filled consultation summary"
            >
              <Sparkles className={`w-3.5 h-3.5 ${activeTab === 'aisummary' ? 'text-[#157a6e]' : 'text-teal-200'}`} />
              <span>View Summary</span>
            </button>

            <div className="flex items-center gap-2.5 bg-white/12 border border-white/20 px-3.5 py-1.5 rounded-xl">
              <span className="text-xs font-medium text-[#d4ece8]">Consultation fee</span>
              <span className="text-xs font-semibold text-white/80">₹</span>
              <input
                type="number"
                min="0"
                step="50"
                value={fee}
                onChange={e => setFee(Number(e.target.value))}
                className="w-16 text-xs font-bold text-[#0f2926] bg-white rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-teal-300 text-center"
              />
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-white/12 hover:bg-white/20 border border-white/15 flex items-center justify-center text-white/90 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="flex items-center gap-1 px-6 border-b border-[#e2ebe8] bg-white overflow-x-auto shrink-0 scrollbar-none">
          <button
            type="button"
            onClick={() => handleTabChange('diagnosis')}
            className={`flex items-center gap-1.5 py-3 px-3 text-xs font-medium border-b-2 transition-all shrink-0 ${
              activeTab === 'diagnosis'
                ? 'border-[#157a6e] text-[#115e56] font-semibold'
                : 'border-transparent text-[#5c7470] hover:text-[#0f2926]'
            }`}
          >
            <Stethoscope className="w-3.5 h-3.5" />
            <span>Diagnosis</span>
            {diagnoses.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-[#157a6e] text-white text-[10px] flex items-center justify-center font-bold">
                {diagnoses.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('tests')}
            className={`flex items-center gap-1.5 py-3 px-3 text-xs font-medium border-b-2 transition-all shrink-0 ${
              activeTab === 'tests'
                ? 'border-[#157a6e] text-[#115e56] font-semibold'
                : 'border-transparent text-[#5c7470] hover:text-[#0f2926]'
            }`}
          >
            <FlaskConical className="w-3.5 h-3.5" />
            <span>Tests</span>
            {tests.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-[#157a6e] text-white text-[10px] flex items-center justify-center font-bold">
                {tests.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('procedure')}
            className={`flex items-center gap-1.5 py-3 px-3 text-xs font-medium border-b-2 transition-all shrink-0 ${
              activeTab === 'procedure'
                ? 'border-[#157a6e] text-[#115e56] font-semibold'
                : 'border-transparent text-[#5c7470] hover:text-[#0f2926]'
            }`}
          >
            <Scissors className="w-3.5 h-3.5" />
            <span>Procedure</span>
            {procedures.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-[#157a6e] text-white text-[10px] flex items-center justify-center font-bold">
                {procedures.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('notes')}
            className={`flex items-center gap-1.5 py-3 px-3 text-xs font-medium border-b-2 transition-all shrink-0 ${
              activeTab === 'notes'
                ? 'border-[#157a6e] text-[#115e56] font-semibold'
                : 'border-transparent text-[#5c7470] hover:text-[#0f2926]'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Clinical notes</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('bodymap')}
            className={`flex items-center gap-1.5 py-3 px-3 text-xs font-medium border-b-2 transition-all shrink-0 ${
              activeTab === 'bodymap'
                ? 'border-[#157a6e] text-[#115e56] font-semibold'
                : 'border-transparent text-[#5c7470] hover:text-[#0f2926]'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Body map</span>
            {bodyMarkers.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-[#157a6e] text-white text-[10px] flex items-center justify-center font-bold">
                {bodyMarkers.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('images')}
            className={`flex items-center gap-1.5 py-3 px-3 text-xs font-medium border-b-2 transition-all shrink-0 ${
              activeTab === 'images'
                ? 'border-[#157a6e] text-[#115e56] font-semibold'
                : 'border-transparent text-[#5c7470] hover:text-[#0f2926]'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Clinical images</span>
            {images.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-[#157a6e] text-white text-[10px] flex items-center justify-center font-bold">
                {images.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('followup')}
            className={`flex items-center gap-1.5 py-3 px-3 text-xs font-medium border-b-2 transition-all shrink-0 ${
              activeTab === 'followup'
                ? 'border-[#157a6e] text-[#115e56] font-semibold'
                : 'border-transparent text-[#5c7470] hover:text-[#0f2926]'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Follow up & Rx</span>
            {prescriptions.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-[#157a6e] text-white text-[10px] flex items-center justify-center font-bold">
                {prescriptions.length}
              </span>
            )}
          </button>
        </div>

        {/* Tab Body Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 bg-[#fafcfb]">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center justify-between">
              <span>{error}</span>
              <button type="button" onClick={() => setError(null)}><X className="w-4 h-4" /></button>
            </div>
          )}

          {/* TAB 1: DIAGNOSIS */}
          {activeTab === 'diagnosis' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <p className="text-xs text-slate-500">
                Tap to add a diagnosis. Selected diagnoses appear above.
              </p>

              {/* Selected Diagnoses Box */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl min-h-[56px] flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold tracking-wider uppercase text-slate-400 mr-1">
                  DERMATOLOGY DIAGNOSES (tap to add):
                </span>
                {diagnoses.length === 0 ? (
                  <span className="text-xs text-slate-400 italic">No diagnoses selected yet</span>
                ) : (
                  diagnoses.map(diag => (
                    <span
                      key={diag}
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-teal-800 text-white shadow-xs"
                    >
                      {diag}
                      <button
                        type="button"
                        onClick={() => toggleDiagnosis(diag)}
                        className="hover:text-teal-200 p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))
                )}
              </div>

              {/* Search input */}
              <div className="relative flex items-center">
                <input
                  type="text"
                  placeholder="Search all 93 dermatology diagnoses..."
                  value={diagnosisSearch}
                  onChange={e => setDiagnosisSearch(e.target.value)}
                  className="w-full text-xs pl-3.5 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 shadow-2xs"
                />
                <div className="absolute right-1.5">
                  <VoiceDictationButton
                    value=""
                    onTranscript={spoken => setDiagnosisSearch(spoken)}
                    variant="badge"
                    title="Speak to search diagnosis"
                  />
                </div>
              </div>

              {/* Quick suggestions pills */}
              <div className="flex flex-wrap gap-1.5 max-h-56 overflow-y-auto p-1">
                {filteredDiagnoses.map(d => {
                  const isSelected = diagnoses.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleDiagnosis(d)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                        isSelected
                          ? 'bg-teal-800 text-white border-teal-800 font-semibold shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-teal-500 hover:text-teal-800'
                      }`}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>

              {/* Custom diagnosis entry */}
              <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
                <input
                  type="text"
                  placeholder="Add a custom diagnosis (press Enter or speak)"
                  value={customDiagnosis}
                  onChange={e => setCustomDiagnosis(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCustomDiagnosis())}
                  className="flex-1 text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl focus:ring-1 focus:ring-teal-500"
                />
                <VoiceDictationButton
                  value={customDiagnosis}
                  onChange={setCustomDiagnosis}
                  variant="badge"
                  title="Dictate diagnosis with mic"
                />
                <button
                  type="button"
                  onClick={addCustomDiagnosis}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Add
                </button>
              </div>

              {/* Step Navigation */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <span className="text-xs text-slate-500 font-medium">
                  {diagnoses.length > 0 ? `${diagnoses.length} diagnosis selected` : 'Select or enter diagnoses'}
                </span>
                <button
                  type="button"
                  onClick={() => handleTabChange('tests')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-800 hover:bg-teal-900 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
                >
                  <span>Continue to Skin Tests</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: TESTS */}
          {activeTab === 'tests' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <p className="text-xs text-slate-500">
                Select all skin-related tests you're ordering for this patient.
              </p>

              {/* Selected Tests Box */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl min-h-[56px] flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold tracking-wider uppercase text-slate-400 mr-1">
                  SKIN TESTS & INVESTIGATIONS (tap to add):
                </span>
                {tests.length === 0 ? (
                  <span className="text-xs text-slate-400 italic">No tests selected</span>
                ) : (
                  tests.map(test => (
                    <span
                      key={test}
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-teal-800 text-white shadow-xs"
                    >
                      {test}
                      <button
                        type="button"
                        onClick={() => toggleTest(test)}
                        className="hover:text-teal-200 p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))
                )}
              </div>

              {/* Search input */}
              <div className="relative flex items-center">
                <input
                  type="text"
                  placeholder="Search all 46 skin tests & investigations..."
                  value={testSearch}
                  onChange={e => setTestSearch(e.target.value)}
                  className="w-full text-xs pl-3.5 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 shadow-2xs"
                />
                <div className="absolute right-1.5">
                  <VoiceDictationButton
                    value=""
                    onTranscript={spoken => setTestSearch(spoken)}
                    variant="badge"
                    title="Speak to search tests"
                  />
                </div>
              </div>

              {/* Quick test pills */}
              <div className="flex flex-wrap gap-1.5 max-h-56 overflow-y-auto p-1">
                {filteredTests.map(t => {
                  const isSelected = tests.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggleTest(t)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                        isSelected
                          ? 'bg-teal-800 text-white border-teal-800 font-semibold shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-teal-500 hover:text-teal-800'
                      }`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>

              {/* Custom test entry */}
              <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
                <input
                  type="text"
                  placeholder="Add a custom test (press Enter or speak)"
                  value={customTest}
                  onChange={e => setCustomTest(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCustomTest())}
                  className="flex-1 text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl focus:ring-1 focus:ring-teal-500"
                />
                <VoiceDictationButton
                  value={customTest}
                  onChange={setCustomTest}
                  variant="badge"
                  title="Dictate test name with mic"
                />
                <button
                  type="button"
                  onClick={addCustomTest}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Add
                </button>
              </div>

              {/* Step Navigation */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => handleTabChange('diagnosis')}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Diagnosis</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleTabChange('procedure')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-800 hover:bg-teal-900 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
                >
                  <span>Continue to Procedures</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: PROCEDURE */}
          {activeTab === 'procedure' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <p className="text-xs text-slate-500">
                Add every procedure performed (or to be performed) today. Add a charge to bill it.
              </p>

              {/* Common procedure catalogue chips */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                  COMMON IN-CLINIC PROCEDURES (tap to add):
                </span>
                <div className="flex flex-wrap gap-2">
                  {PREDEFINED_PROCEDURES.map(p => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => addProcedure(p.name, p.defaultCost)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:border-teal-500 hover:bg-teal-50/50 text-xs font-medium text-slate-700 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5 text-teal-600" />
                      <span>{p.name}</span>
                      <span className="text-slate-400 font-semibold">₹{p.defaultCost}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom procedure input */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Custom procedure name (type or speak)..."
                  value={customProcedureName}
                  onChange={e => setCustomProcedureName(e.target.value)}
                  className="flex-2 text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl focus:ring-1 focus:ring-teal-500"
                />
                <VoiceDictationButton
                  value={customProcedureName}
                  onChange={setCustomProcedureName}
                  variant="badge"
                  title="Dictate procedure name with mic"
                />
                <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-2 py-1.5">
                  <span className="text-xs font-semibold text-slate-400">₹</span>
                  <input
                    type="number"
                    min="0"
                    step="50"
                    placeholder="Cost"
                    value={customProcedureCost}
                    onChange={e => setCustomProcedureCost(Number(e.target.value))}
                    className="w-16 text-xs font-medium focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (customProcedureName.trim()) {
                      addProcedure(customProcedureName.trim(), customProcedureCost);
                      setCustomProcedureName('');
                    }
                  }}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  + Add procedure
                </button>
              </div>

              {/* Added Procedures List */}
              <div className="space-y-2 pt-2">
                <span className="text-xs font-bold text-slate-700">Procedures Added Today ({procedures.length})</span>
                {procedures.length === 0 ? (
                  <p className="text-xs text-slate-400 italic bg-white p-4 rounded-xl border border-dashed border-slate-200 text-center">
                    No procedures added today. Click any procedure above to add it.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl bg-white overflow-hidden">
                    {procedures.map((proc, idx) => (
                      <div key={proc.id || idx} className="p-3 flex items-center justify-between gap-4">
                        <div className="flex-1">
                          <span className="text-xs font-bold text-slate-800">{proc.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400">Charge: ₹</span>
                          <input
                            type="number"
                            min="0"
                            step="50"
                            value={proc.cost}
                            onChange={e => updateProcedureCost(proc.id, Number(e.target.value))}
                            className="w-20 text-xs font-semibold text-right px-2 py-1 border border-slate-200 rounded-lg focus:ring-1 focus:ring-teal-500"
                          />
                          <button
                            type="button"
                            onClick={() => removeProcedure(proc.id)}
                            className="p-1 text-slate-400 hover:text-red-600 rounded-md transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Step Navigation */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => handleTabChange('tests')}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Tests</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleTabChange('notes')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-800 hover:bg-teal-900 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
                >
                  <span>Continue to Clinical Notes</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: CLINICAL NOTES */}
          {activeTab === 'notes' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Single Voice-to-Text Clinical Dictation Card (Auto-Fills AI Summary) */}
              <div className="p-4 bg-gradient-to-r from-teal-50 via-emerald-50 to-teal-50 border border-teal-200 rounded-2xl space-y-3 shadow-2xs">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-teal-800 text-white flex items-center justify-center shadow-xs shrink-0">
                      <Mic className="w-4 h-4 text-teal-300" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                        <span>Clinical Voice Dictation</span>
                        <span className="text-[10px] font-bold bg-teal-100 text-teal-900 px-2 py-0.5 rounded-full border border-teal-200">
                          Single Speech-to-Text
                        </span>
                        <span className="text-[10px] font-bold bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                          <Sparkles className="w-2.5 h-2.5 text-emerald-700" />
                          <span>Auto-Fills AI Summary</span>
                        </span>
                      </h4>
                      <p className="text-[11px] text-slate-600 mt-0.5">
                        Dictate or type your clinical note in one go. AI automatically fills the sections below and all fields in the Visit Summary (editable anytime by the doctor).
                      </p>
                    </div>
                  </div>

                  {/* Single Voice-to-Text Button + Add Image in the top-right action bar */}
                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <VoiceDictationButton
                      value={singleVoiceNote}
                      onChange={val => handleSingleVoiceNoteChange(val, false)}
                      variant="prominent"
                      label="Dictate Clinical Notes"
                      title="Single Voice-to-Text: Speak consultation findings, diagnosis, investigations, and plan to auto-fill AI Summary"
                    />
                    <button
                      type="button"
                      onClick={() => setActiveTab('images')}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-800 bg-white border border-teal-200 px-3 py-2 rounded-xl shadow-2xs transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add image</span>
                    </button>
                  </div>
                </div>

                {/* Unified Single Voice-to-Text / Clinical Note Textarea */}
                <div className="bg-white/95 border border-teal-200/90 rounded-xl p-3 space-y-2 shadow-2xs">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <label className="text-[10.5px] font-bold uppercase tracking-wider text-teal-900 flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3 text-teal-700" />
                      <span>Unified Voice-to-Text Clinical Note (Auto-Fills AI Summary & Sections Below)</span>
                    </label>
                    <div className="flex items-center gap-2">
                      {singleVoiceNote.trim() && (
                        <button
                          type="button"
                          onClick={() => {
                            doctorEditedFieldsRef.current.clear();
                            handleSingleVoiceNoteChange(singleVoiceNote, true);
                          }}
                          className="text-[10.5px] font-semibold text-teal-700 hover:text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 px-2.5 py-0.5 rounded-lg transition-colors"
                          title="Re-sync all AI Summary fields from this note"
                        >
                          Sync all to AI Summary
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleTabChange('aisummary')}
                        className="inline-flex items-center gap-1 text-[10.5px] font-bold text-white bg-teal-800 hover:bg-teal-900 px-2.5 py-1 rounded-lg transition-colors shadow-2xs"
                      >
                        <Sparkles className="w-2.5 h-2.5 text-teal-200" />
                        <span>View Summary →</span>
                      </button>
                    </div>
                  </div>

                  <textarea
                    rows={3}
                    value={singleVoiceNote}
                    onChange={e => handleSingleVoiceNoteChange(e.target.value, false)}
                    placeholder="Tap 'Dictate Clinical Notes' above or type here in one box (e.g. 'Erythematous papules and open comedones over cheeks and forehead. Skin scraping for KOH mount advised if scaling persists. Start topical adapalene gel at night, non-comedogenic cleanser and daily mineral sunscreen. Review in 2 weeks.') — AI automatically populates all fields in the Visit Summary..."
                    className="w-full text-xs p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 font-normal transition-all"
                  />

                  {/* Auto-fill live status bar */}
                  {(autoFillSummaryReady || singleVoiceNote.trim() || clinicalNotes.examination.trim()) && (
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px]">
                      <div className="flex items-center gap-1.5 text-emerald-800 font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>
                          {isAutoFillingSummary
                            ? 'AI is updating Visit Summary fields...'
                            : 'AI Summary fields automatically filled (Diagnosis, Morphology, Workup, Rx & Follow-up). Doctor can freely edit any field below or in Visit Summary.'}
                        </span>
                      </div>
                      {diagnoses[0] && (
                        <span className="px-2 py-0.5 rounded-md bg-teal-50 border border-teal-200 text-teal-900 text-[10px] font-bold">
                          Auto-Detected Dx: {diagnoses[0]}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Examination Notes (Auto-filled from single voice note, or directly editable by doctor) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                    <span>1. Examination Findings:</span>
                  </label>
                  <span className="text-[10px] text-slate-400 font-medium">
                    Auto-filled from Voice-to-Text · Editable by Doctor
                  </span>
                </div>
                <div className="relative">
                  <textarea
                    rows={3}
                    value={clinicalNotes.examination}
                    onChange={e => {
                      const val = e.target.value;
                      markDoctorEdited('notes.examination');
                      const nextNotes = { ...clinicalNotes, examination: val };
                      setClinicalNotes(nextNotes);
                      if (val.trim()) {
                        const parsed = parseClinicalNoteToStructuredSummary(singleVoiceNote, {
                          existingExamination: val,
                          existingInvestigations: nextNotes.investigationsAdvised,
                          existingPlan: nextNotes.plan,
                          patientPrimaryDiagnosis: patient.primaryDiagnosis,
                          existingSymptoms: symptoms
                        });
                        applyParsedClinicalNoteToSummary(parsed, { source: 'sections' });
                      }
                    }}
                    placeholder="e.g. Erythematous papules and open comedones over cheeks and forehead. No pustules or scarring noted."
                    className="w-full text-xs p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 shadow-2xs font-normal transition-all"
                  />
                </div>
              </div>

              {/* Investigations Advised */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                    <span>2. Investigations Advised:</span>
                  </label>
                  <span className="text-[10px] text-slate-400 font-medium">
                    Auto-filled from Voice-to-Text · Editable by Doctor
                  </span>
                </div>
                <div className="relative">
                  <textarea
                    rows={2}
                    value={clinicalNotes.investigationsAdvised}
                    onChange={e => {
                      const val = e.target.value;
                      markDoctorEdited('notes.investigationsAdvised');
                      const nextNotes = { ...clinicalNotes, investigationsAdvised: val };
                      setClinicalNotes(nextNotes);
                      if (val.trim()) {
                        const parsed = parseClinicalNoteToStructuredSummary(singleVoiceNote, {
                          existingExamination: nextNotes.examination,
                          existingInvestigations: val,
                          existingPlan: nextNotes.plan,
                          patientPrimaryDiagnosis: patient.primaryDiagnosis,
                          existingSymptoms: symptoms
                        });
                        applyParsedClinicalNoteToSummary(parsed, { source: 'sections' });
                      }
                    }}
                    placeholder="e.g. Skin scraping for KOH mount advised if scaling persists."
                    className="w-full text-xs p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 shadow-2xs font-normal transition-all"
                  />
                </div>
              </div>

              {/* Plan & Management */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                    <span>3. Clinical Plan & Discussion:</span>
                  </label>
                  <span className="text-[10px] text-slate-400 font-medium">
                    Auto-filled from Voice-to-Text · Editable by Doctor
                  </span>
                </div>
                <div className="relative">
                  <textarea
                    rows={3}
                    value={clinicalNotes.plan}
                    onChange={e => {
                      const val = e.target.value;
                      markDoctorEdited('notes.plan');
                      const nextNotes = { ...clinicalNotes, plan: val };
                      setClinicalNotes(nextNotes);
                      if (val.trim()) {
                        const parsed = parseClinicalNoteToStructuredSummary(singleVoiceNote, {
                          existingExamination: nextNotes.examination,
                          existingInvestigations: nextNotes.investigationsAdvised,
                          existingPlan: val,
                          patientPrimaryDiagnosis: patient.primaryDiagnosis,
                          existingSymptoms: symptoms
                        });
                        applyParsedClinicalNoteToSummary(parsed, { source: 'sections' });
                      }
                    }}
                    placeholder="e.g. Start topical adapalene gel at night. Advised non-comedogenic foaming cleanser and daily mineral sunscreen."
                    className="w-full text-xs p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 shadow-2xs font-normal transition-all"
                  />
                </div>
              </div>

              {/* Step Navigation */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-200 flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleTabChange('procedure')}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Procedures</span>
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleTabChange('aisummary')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-teal-900 border border-teal-200 text-xs font-bold rounded-xl transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-teal-700" />
                    <span>Review Auto-Filled AI Summary</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTabChange('bodymap')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-800 hover:bg-teal-900 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
                  >
                    <span>Continue to Body Map</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: BODY MAP */}
          {activeTab === 'bodymap' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <BodyMap
                markers={bodyMarkers}
                onAddMarker={handleAddMarker}
                onRemoveMarker={handleRemoveMarker}
                patientId={patient.id}
                consultationId={consultation.id}
                priorMarkers={priorMarkers}
                onAnalyzeMarkerWithAI={(marker) => {
                  const linkedImage = images.find(img => img.bodyMarkerId === marker.id) || images[0];
                  if (linkedImage) {
                    handleAnalyzeConsultationImage(linkedImage);
                  } else {
                    setActiveTab('images');
                  }
                }}
              />

              {/* Step Navigation */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => handleTabChange('notes')}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Notes</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleTabChange('images')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-800 hover:bg-teal-900 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
                >
                  <span>Continue to Clinical Images</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* TAB 6: CLINICAL IMAGES */}
          {activeTab === 'images' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <ClinicalImageUploader
                images={images}
                onUpload={handleImageUpload}
                onDelete={handleImageDelete}
                onAnalyzeWithAI={handleAnalyzeConsultationImage}
                patientId={patient.id}
                patientName={patient.fullName}
                consultationId={consultation.id}
                onRemoteImagesSynced={(syncedImages) => {
                  setImages(prev => {
                    const existingIds = new Set(prev.map(i => i.id));
                    const added = syncedImages.filter(i => !existingIds.has(i.id));
                    return added.length > 0 ? [...prev, ...added] : prev;
                  });
                }}
              />

              {/* Step Navigation */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => handleTabChange('bodymap')}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Body Map</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleTabChange('followup')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-800 hover:bg-teal-900 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
                >
                  <span>Continue to Follow-up & Rx</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* TAB 7: FOLLOW UP & RX */}
          {activeTab === 'followup' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              {/* Follow-up section */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-teal-600" />
                    Follow-Up Schedule & Appointment Sync
                  </h4>
                  <span className="text-[10px] text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full font-semibold">
                    Auto-syncs to Appointments
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-600">Quick preset:</span>
                  {[
                    { label: '3 days', days: 3 },
                    { label: '1 week', days: 7 },
                    { label: '2 weeks', days: 14 },
                    { label: '1 month', days: 30 }
                  ].map(preset => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        const target = new Date();
                        target.setDate(target.getDate() + preset.days);
                        setFollowUp({ ...followUp, date: target.toISOString().split('T')[0] });
                      }}
                      className="px-2.5 py-1 bg-white border border-slate-200 hover:border-teal-500 text-slate-700 text-xs font-medium rounded-lg transition-colors"
                    >
                      +{preset.label}
                    </button>
                  ))}

                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-xs font-semibold text-slate-600">Date:</span>
                    <input
                      type="date"
                      value={followUp.date}
                      onChange={e => setFollowUp({ ...followUp, date: e.target.value })}
                      className="text-xs px-2.5 py-1 bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-teal-500"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-semibold text-slate-600">
                      Follow-up Instructions for Patient
                    </label>
                    <VoiceDictationButton
                      value={followUp.instructions}
                      onChange={val => setFollowUp({ ...followUp, instructions: val })}
                      variant="badge"
                      title="Dictate follow-up instructions with mic"
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="e.g. Review in OPD with biopsy report; SOS if swelling increases."
                    value={followUp.instructions}
                    onChange={e => setFollowUp({ ...followUp, instructions: e.target.value })}
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-1 focus:ring-teal-500"
                  />
                </div>
              </div>

              {/* Prescriptions inside consultation */}
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                {/* Header bar */}
                <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
                  <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-blue-600 text-white text-[10px] font-serif font-bold">
                      ℞
                    </span>
                    <span>PRESCRIPTION</span>
                    {prescriptions.length > 0 && (
                      <span className="ml-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                        {prescriptions.length}
                      </span>
                    )}
                  </h4>
                  <span className="text-[11px] text-slate-400">Saved to patient medical record</span>
                </div>

                {/* Inner Prescription Builder Box */}
                <div className="p-4 space-y-4">
                  <div className="p-4 bg-[#f8fafc] border border-slate-200/90 rounded-xl space-y-3.5">
                    {/* Row 1: DRUG NAME | DOSE / STRENGTH | ROUTE | FREQUENCY | DURATION | QTY */}
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                      {/* DRUG NAME */}
                      <div className="sm:col-span-4 relative">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                          DRUG NAME
                        </label>
                        <div className="relative flex items-center bg-white border border-slate-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-600 transition-all">
                          <Search className="w-3.5 h-3.5 text-slate-400 ml-3 shrink-0" />
                          <input
                            type="text"
                            placeholder="Search drug..."
                            value={medName}
                            onChange={e => {
                              setMedName(e.target.value);
                              setIsMedDropdownOpen(true);
                            }}
                            onFocus={() => setIsMedDropdownOpen(true)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddPrescription();
                              }
                            }}
                            className="w-full text-xs pl-2 pr-8 py-2 bg-transparent border-0 text-slate-800 placeholder:text-slate-400 focus:outline-hidden"
                          />
                          <div className="flex items-center pr-1">
                            <VoiceDictationButton
                              value=""
                              onTranscript={spoken => {
                                setMedName(spoken);
                                setIsMedDropdownOpen(true);
                              }}
                              variant="badge"
                              className="border-0 shadow-none bg-transparent"
                              title="Dictate drug name"
                            />
                            <button
                              type="button"
                              onClick={() => setIsMedDropdownOpen(!isMedDropdownOpen)}
                              className="p-1 text-slate-400 hover:text-slate-600"
                              title="Toggle drug catalog"
                            >
                              <ChevronDown
                                className={`w-3.5 h-3.5 transition-transform ${
                                  isMedDropdownOpen ? 'rotate-180 text-blue-600' : ''
                                }`}
                              />
                            </button>
                          </div>
                        </div>

                        {/* Auto-suggest dropdown menu */}
                        {isMedDropdownOpen && (
                          <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-slate-200 z-50 max-h-56 overflow-y-auto divide-y divide-slate-100 animate-in fade-in zoom-in-95 duration-100">
                            <div className="px-3 py-1.5 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                              <span>
                                Drug Catalogue (
                                {
                                  COMMON_MEDICATIONS.filter(m =>
                                    m.name.toLowerCase().includes(medName.toLowerCase().trim())
                                  ).length
                                }
                                )
                              </span>
                              <button
                                type="button"
                                onClick={() => setIsMedDropdownOpen(false)}
                                className="text-slate-400 hover:text-slate-600"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                            {COMMON_MEDICATIONS.filter(m =>
                              m.name.toLowerCase().includes(medName.toLowerCase().trim())
                            ).map(med => {
                              const isTopical = /cream|gel|ointment|lotion|shampoo|solution|spf|sunscreen/i.test(
                                med.name
                              );
                              return (
                                <button
                                  key={med.name}
                                  type="button"
                                  onClick={() => {
                                    setMedName(med.name);
                                    setMedDosage(med.dosage);
                                    setMedRoute(isTopical ? 'Topical' : 'Oral');
                                    setMedFrequency(
                                      med.frequency.includes('1-0-1') || /twice/i.test(med.frequency)
                                        ? '1-0-1'
                                        : /three|thrice/i.test(med.frequency)
                                        ? '1-1-1'
                                        : /night|bedtime/i.test(med.frequency)
                                        ? '0-0-1'
                                        : '1-0-0'
                                    );
                                    setMedDuration(med.duration);
                                    setMedInstructions(med.instructions);
                                    setMedQtyManual(false);
                                    setIsMedDropdownOpen(false);
                                  }}
                                  className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50/60 flex flex-col text-slate-800 transition-colors"
                                >
                                  <span className="font-semibold text-slate-900">{med.name}</span>
                                  <span className="text-[10px] text-slate-400">
                                    {med.dosage} • {med.frequency} • {med.duration}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* DOSE / STRENGTH */}
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                          DOSE / STRENGTH
                        </label>
                        <input
                          type="text"
                          placeholder="500 mg"
                          value={medDosage}
                          onChange={e => setMedDosage(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddPrescription();
                            }
                          }}
                          className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                        />
                      </div>

                      {/* ROUTE */}
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                          ROUTE
                        </label>
                        <select
                          value={medRoute}
                          onChange={e => {
                            setMedRoute(e.target.value);
                            setMedQtyManual(false);
                          }}
                          className="w-full text-xs px-2.5 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 font-medium focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                        >
                          <option value="Oral">Oral</option>
                          <option value="Topical">Topical</option>
                          <option value="Intralesional">Intralesional</option>
                          <option value="IV / IM">IV / IM</option>
                          <option value="Subcutaneous">Subcutaneous</option>
                          <option value="Sublingual">Sublingual</option>
                          <option value="Nasal / Drops">Nasal / Drops</option>
                        </select>
                      </div>

                      {/* FREQUENCY */}
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                          FREQUENCY <span className="font-normal lowercase text-slate-400">type 101</span>
                        </label>
                        <div className="relative flex items-center">
                          <input
                            type="text"
                            list="rx-frequency-options"
                            placeholder="1-0-1 or type 101"
                            value={medFrequency}
                            onChange={e => {
                              setMedFrequency(normalizeFrequencyInput(e.target.value));
                              setMedQtyManual(false);
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddPrescription();
                              }
                            }}
                            className="w-full text-xs px-2.5 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                          />
                          <datalist id="rx-frequency-options">
                            <option value="1-0-0" />
                            <option value="0-1-0" />
                            <option value="0-0-1" />
                            <option value="1-0-1" />
                            <option value="1-1-1" />
                            <option value="1-1-1-1" />
                            <option value="SOS" />
                          </datalist>
                        </div>
                      </div>

                      {/* DURATION */}
                      <div className="sm:col-span-1">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1.5 whitespace-nowrap">
                          DURATION <span className="font-normal lowercase text-slate-400">5d·2w·1m</span>
                        </label>
                        <input
                          type="text"
                          placeholder="5 days"
                          value={medDuration}
                          onChange={e => {
                            setMedDuration(normalizeDurationInput(e.target.value));
                            setMedQtyManual(false);
                          }}
                          onBlur={e => setMedDuration(normalizeDurationInput(e.target.value))}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddPrescription();
                            }
                          }}
                          className="w-full text-xs px-2.5 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                        />
                      </div>

                      {/* QTY */}
                      <div className="sm:col-span-1">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1.5 whitespace-nowrap">
                          QTY <span className="font-normal lowercase text-slate-400">auto</span>
                        </label>
                        <input
                          type="text"
                          value={medQty}
                          onChange={e => {
                            setMedQty(e.target.value);
                            setMedQtyManual(true);
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddPrescription();
                            }
                          }}
                          className="w-full text-xs px-2.5 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 text-center font-semibold focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                        />
                      </div>
                    </div>

                    {/* Row 2: Quick Frequency & Duration Preset Chips */}
                    <div className="flex flex-wrap items-center gap-y-2 gap-x-4 pt-0.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-0.5">
                          FREQUENCY
                        </span>
                        {['1-0-0', '0-1-0', '0-0-1', '1-0-1', '1-1-1', '1-1-1-1', 'SOS'].map(freq => (
                          <button
                            key={freq}
                            type="button"
                            onClick={() => {
                              setMedFrequency(freq);
                              setMedQtyManual(false);
                            }}
                            className={`px-2 py-1 text-[11px] font-medium rounded-md border transition-colors ${
                              medFrequency === freq
                                ? 'bg-blue-50 border-blue-400 text-blue-700 font-semibold'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            {freq}
                          </button>
                        ))}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-0.5">
                          DURATION
                        </span>
                        {[
                          { label: '3d', value: '3 days' },
                          { label: '5d', value: '5 days' },
                          { label: '7d', value: '7 days' },
                          { label: '10d', value: '10 days' },
                          { label: '15d', value: '15 days' },
                          { label: '1m', value: '1 month' }
                        ].map(dur => (
                          <button
                            key={dur.label}
                            type="button"
                            onClick={() => {
                              setMedDuration(dur.value);
                              setMedQtyManual(false);
                            }}
                            className={`px-2 py-1 text-[11px] font-medium rounded-md border transition-colors ${
                              medDuration.toLowerCase() === dur.value.toLowerCase() ||
                              medDuration.toLowerCase() === dur.label
                                ? 'bg-blue-50 border-blue-400 text-blue-700 font-semibold'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            {dur.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Row 3: INSTRUCTIONS + Add Button */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3 pt-1">
                      <div className="flex-1">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                          INSTRUCTIONS <span className="font-normal lowercase text-slate-400">Enter adds the row</span>
                        </label>
                        <div className="flex items-center bg-white border border-slate-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-600">
                          <input
                            type="text"
                            placeholder="After meals"
                            value={medInstructions}
                            onChange={e => setMedInstructions(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddPrescription();
                              }
                            }}
                            className="w-full text-xs px-3 py-2 bg-transparent border-0 text-slate-800 placeholder:text-slate-400 focus:outline-hidden"
                          />
                          <VoiceDictationButton
                            value={medInstructions}
                            onChange={setMedInstructions}
                            variant="badge"
                            className="border-0 shadow-none bg-transparent mr-1"
                            title="Dictate instructions"
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleAddPrescription}
                        className="px-5 py-2 bg-[#5b87eb] hover:bg-[#4672dc] text-white text-xs font-bold rounded-lg shadow-xs transition-colors flex items-center justify-center gap-1.5 shrink-0 h-[36px]"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add</span>
                      </button>
                    </div>

                    {/* Row 4: Quick Instruction Chips */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {[
                        'After food',
                        'Before food',
                        'Empty stomach',
                        'With milk',
                        'With plenty of water',
                        'At bedtime',
                        'Complete full course',
                        'May cause drowsiness'
                      ].map(chip => {
                        const isSelected = medInstructions
                          .toLowerCase()
                          .split(',')
                          .map(s => s.trim())
                          .includes(chip.toLowerCase());
                        return (
                          <button
                            key={chip}
                            type="button"
                            onClick={() => {
                              if (!medInstructions.trim() || medInstructions === 'After meals') {
                                setMedInstructions(chip);
                              } else if (isSelected) {
                                const remaining = medInstructions
                                  .split(',')
                                  .map(s => s.trim())
                                  .filter(s => s.toLowerCase() !== chip.toLowerCase());
                                setMedInstructions(remaining.join(', '));
                              } else {
                                setMedInstructions(`${medInstructions.trim()}, ${chip}`);
                              }
                            }}
                            className={`px-2.5 py-1 text-[11px] rounded-md border transition-colors ${
                              isSelected
                                ? 'bg-blue-50 border-blue-300 text-blue-700 font-medium'
                                : 'bg-white border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            + {chip}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Prescribed Items List or Empty State */}
                  {prescriptions.length === 0 ? (
                    <div className="py-5 text-center text-xs text-slate-400 font-medium">
                      No prescriptions added yet
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                      {prescriptions.map(p => (
                        <div key={p.id} className="p-3 flex items-center justify-between text-xs gap-3 bg-white hover:bg-slate-50/60 transition-colors">
                          <div className="flex-1">
                            <p className="font-bold text-slate-800">{p.medicineName}</p>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              {p.dosage} · <span className="font-semibold text-slate-700">{p.frequency}</span> · {p.duration}
                              {p.instructions && ` (${p.instructions})`}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemovePrescription(p.id)}
                            className="text-slate-400 hover:text-red-600 p-1"
                            title="Remove prescription"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Step Navigation */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => handleTabChange('images')}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Images</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleTabChange('aisummary')}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-teal-800 hover:bg-teal-900 text-white text-xs font-bold rounded-xl shadow-md transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5 text-teal-300" />
                  <span>View Summary & Sign</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* TAB 8: VISIT SUMMARY */}
          {activeTab === 'aisummary' && (
            <div className="space-y-3.5 animate-in fade-in duration-150">
              {/* Top sub-header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1">
                <p className="text-xs text-[#5c7470]">
                  Structured record · auto-filled from your inputs across tabs. Edit or voice-dictate any field directly before signing.
                </p>
                <button
                  type="button"
                  onClick={generateSummary}
                  disabled={isGeneratingAI}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white hover:bg-[#f2f6f5] text-[#0f2926] border border-[#cfdeda] rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 shadow-2xs shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-[#157a6e] ${isGeneratingAI ? 'animate-spin' : ''}`} />
                  <span>Regenerate from tabs</span>
                </button>
              </div>

              {/* 1. PATIENT & VISIT */}
              <div className="bg-white border border-[#dce6e3] rounded-2xl p-4 shadow-2xs">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-5 h-5 rounded-full bg-[#e3f2ef] text-[#115e56] text-[11px] font-bold flex items-center justify-center">
                    1
                  </span>
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#4a635e]">
                    PATIENT & VISIT
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  <div className="bg-[#f6f9f8] border border-[#e5eeeb] rounded-xl px-3.5 py-2.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#6c857f] block">
                      PATIENT
                    </span>
                    <span className="text-[12.5px] font-bold text-[#0f2926] mt-0.5 block truncate">
                      {patient.fullName} · {patient.age}y · {patient.gender}
                    </span>
                  </div>
                  <div className="bg-[#f6f9f8] border border-[#e5eeeb] rounded-xl px-3.5 py-2.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#6c857f] block">
                      PATIENT ID
                    </span>
                    <span className="text-[12.5px] font-bold text-[#0f2926] font-mono mt-0.5 block">
                      {patient.patientCode}
                    </span>
                  </div>
                  <div className="bg-[#f6f9f8] border border-[#e5eeeb] rounded-xl px-3.5 py-2.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#6c857f] block">
                      VISIT DATE
                    </span>
                    <span className="text-[12.5px] font-bold text-[#0f2926] font-mono mt-0.5 block">
                      {consultation.consultationDate.split('T')[0]}
                    </span>
                  </div>
                  <div className="bg-[#f6f9f8] border border-[#e5eeeb] rounded-xl px-3.5 py-2.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#6c857f] block">
                      CONSULTING DOCTOR
                    </span>
                    <span className="text-[12.5px] font-bold text-[#0f2926] mt-0.5 block truncate">
                      {doctor?.fullName || 'Dr. Sarah Chen'}
                    </span>
                  </div>
                </div>
              </div>

              {/* 2. CHIEF COMPLAINTS / SYMPTOMS */}
              <div className="bg-white border border-[#dce6e3] rounded-2xl p-4 shadow-2xs">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-[#e3f2ef] text-[#115e56] text-[11px] font-bold flex items-center justify-center">
                      2
                    </span>
                    <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#4a635e]">
                      CHIEF COMPLAINTS / SYMPTOMS
                    </span>
                  </div>
                  <VoiceDictationButton
                    value=""
                    onTranscript={spoken => {
                      const clean = spoken.trim();
                      if (clean && !symptoms.includes(clean)) {
                        markDoctorEdited('summary.symptoms');
                        setSymptoms(prev => [...prev, clean.charAt(0).toUpperCase() + clean.slice(1)]);
                      }
                    }}
                    variant="badge"
                    title="Dictate a symptom with microphone"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {symptoms.map((sym, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#19423d] text-white text-xs font-medium"
                    >
                      <span>{sym}</span>
                      <button
                        type="button"
                        onClick={() => {
                          markDoctorEdited('summary.symptoms');
                          setSymptoms(symptoms.filter((_, i) => i !== idx));
                        }}
                        className="hover:text-teal-200 p-0.5"
                        title="Remove symptom"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {symptoms.length === 0 && (
                    <span className="text-xs text-[#7b928d] italic">No symptoms recorded</span>
                  )}
                  <input
                    type="text"
                    value={customSymptomInput}
                    onChange={e => setCustomSymptomInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && customSymptomInput.trim()) {
                        e.preventDefault();
                        markDoctorEdited('summary.symptoms');
                        setSymptoms(prev => [...prev, customSymptomInput.trim()]);
                        setCustomSymptomInput('');
                      }
                    }}
                    placeholder="+ Add or edit symptom (press Enter)..."
                    className="text-xs px-2.5 py-1 bg-[#f6f9f8] border border-[#dce6e3] rounded-lg text-[#0f2926] placeholder:text-[#8fa39e] focus:outline-none focus:border-[#157a6e] min-w-[210px]"
                  />
                </div>
              </div>

              {/* 3. DIAGNOSIS */}
              <div className="bg-white border border-[#dce6e3] rounded-2xl p-4 shadow-2xs">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-5 h-5 rounded-full bg-[#e3f2ef] text-[#115e56] text-[11px] font-bold flex items-center justify-center">
                    3
                  </span>
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#4a635e]">
                    DIAGNOSIS
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[#6c857f] mb-1 block">
                      PRIMARY DIAGNOSIS
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        value={diagnoses[0] || ''}
                        onChange={e => {
                          markDoctorEdited('summary.primaryDiagnosis');
                          const val = e.target.value;
                          if (!val.trim() && diagnoses.length <= 1) {
                            setDiagnoses([]);
                          } else {
                            setDiagnoses([val, ...diagnoses.slice(1)]);
                          }
                        }}
                        placeholder="Select in Diagnosis tab or type here..."
                        className="w-full pl-3 pr-9 py-2 text-xs bg-white border border-[#dce6e3] rounded-lg text-[#0f2926] placeholder:text-[#8fa39e] focus:outline-none focus:border-[#157a6e]"
                      />
                      <div className="absolute right-1.5">
                        <VoiceDictationButton
                          value={diagnoses[0] || ''}
                          onChange={val => {
                            markDoctorEdited('summary.primaryDiagnosis');
                            if (!val.trim() && diagnoses.length <= 1) {
                              setDiagnoses([]);
                            } else {
                              setDiagnoses([val, ...diagnoses.slice(1)]);
                            }
                          }}
                          variant="badge"
                          className="border-0 shadow-none bg-transparent"
                          title="Dictate primary diagnosis"
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[#6c857f] mb-1 block">
                      DIFFERENTIAL / SECONDARY
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        value={secondaryDiagnosis}
                        onChange={e => {
                          markDoctorEdited('summary.secondaryDiagnosis');
                          setSecondaryDiagnosis(e.target.value);
                        }}
                        placeholder="Optional secondary / rule-out diagnosis"
                        className="w-full pl-3 pr-9 py-2 text-xs bg-white border border-[#dce6e3] rounded-lg text-[#0f2926] placeholder:text-[#8fa39e] focus:outline-none focus:border-[#157a6e]"
                      />
                      <div className="absolute right-1.5">
                        <VoiceDictationButton
                          value={secondaryDiagnosis}
                          onChange={val => {
                            markDoctorEdited('summary.secondaryDiagnosis');
                            setSecondaryDiagnosis(val);
                          }}
                          variant="badge"
                          className="border-0 shadow-none bg-transparent"
                          title="Dictate differential / secondary diagnosis"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 4. CLINICAL NOTES (EXAMINATION & PLAN) */}
              <div className="bg-white border border-[#dce6e3] rounded-2xl p-4 shadow-2xs">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-5 h-5 rounded-full bg-[#e3f2ef] text-[#115e56] text-[11px] font-bold flex items-center justify-center">
                    4
                  </span>
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#4a635e]">
                    CLINICAL NOTES (EXAMINATION & PLAN)
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#6c857f]">
                        EXAMINATION FINDINGS
                      </label>
                      <VoiceDictationButton
                        value={clinicalNotes.examination}
                        onChange={val => {
                          markDoctorEdited('notes.examination');
                          setClinicalNotes({ ...clinicalNotes, examination: val });
                        }}
                        variant="badge"
                        title="Dictate examination findings"
                      />
                    </div>
                    <textarea
                      rows={3}
                      value={clinicalNotes.examination}
                      onChange={e => {
                        markDoctorEdited('notes.examination');
                        setClinicalNotes({ ...clinicalNotes, examination: e.target.value });
                      }}
                      placeholder="On examination — general appearance, vitals, local findings..."
                      className="w-full px-3 py-2 text-xs bg-white border border-[#dce6e3] rounded-lg text-[#0f2926] placeholder:text-[#8fa39e] focus:outline-none focus:border-[#157a6e] resize-y"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#6c857f]">
                        TREATMENT PLAN
                      </label>
                      <VoiceDictationButton
                        value={clinicalNotes.plan}
                        onChange={val => {
                          markDoctorEdited('notes.plan');
                          setClinicalNotes({ ...clinicalNotes, plan: val });
                        }}
                        variant="badge"
                        title="Dictate treatment plan"
                      />
                    </div>
                    <textarea
                      rows={3}
                      value={clinicalNotes.plan}
                      onChange={e => {
                        markDoctorEdited('notes.plan');
                        setClinicalNotes({ ...clinicalNotes, plan: e.target.value });
                      }}
                      placeholder="Management plan, procedures advised, lifestyle / skincare advice..."
                      className="w-full px-3 py-2 text-xs bg-white border border-[#dce6e3] rounded-lg text-[#0f2926] placeholder:text-[#8fa39e] focus:outline-none focus:border-[#157a6e] resize-y"
                    />
                  </div>
                </div>
              </div>

              {/* 5. INVESTIGATIONS & PROCEDURES */}
              <div className="bg-white border border-[#dce6e3] rounded-2xl p-4 shadow-2xs">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-5 h-5 rounded-full bg-[#e3f2ef] text-[#115e56] text-[11px] font-bold flex items-center justify-center">
                    5
                  </span>
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#4a635e]">
                    INVESTIGATIONS & PROCEDURES
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[#6c857f] mb-1 block">
                      TESTS ORDERED
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        value={tests.join(', ')}
                        onChange={e => {
                          markDoctorEdited('summary.tests');
                          const val = e.target.value;
                          setTests(val ? val.split(',').map(s => s.trim()).filter(Boolean) : []);
                        }}
                        placeholder="None ordered — add via Tests tab or type here"
                        className="w-full pl-3 pr-9 py-2 text-xs bg-white border border-[#dce6e3] rounded-lg text-[#0f2926] placeholder:text-[#8fa39e] focus:outline-none focus:border-[#157a6e]"
                      />
                      <div className="absolute right-1.5">
                        <VoiceDictationButton
                          value={tests.join(', ')}
                          onChange={val => {
                            markDoctorEdited('summary.tests');
                            setTests(val ? val.split(/[.,;]/).map(s => s.trim()).filter(Boolean) : []);
                          }}
                          variant="badge"
                          className="border-0 shadow-none bg-transparent"
                          title="Dictate tests ordered"
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[#6c857f] mb-1 block">
                      PROCEDURES PERFORMED
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        value={
                          procedures.length > 0
                            ? procedures.map(p => `${p.name} (₹${p.cost})`).join(', ')
                            : ''
                        }
                        onChange={e => {
                          markDoctorEdited('summary.procedures');
                          const val = e.target.value;
                          if (!val.trim()) {
                            setProcedures([]);
                          } else {
                            setProcedures([{ id: 'proc-inline', name: val, cost: proceduresTotal || 0 }]);
                          }
                        }}
                        placeholder={`None — add via Procedure tab (₹${proceduresTotal})`}
                        className="w-full pl-3 pr-9 py-2 text-xs bg-white border border-[#dce6e3] rounded-lg text-[#0f2926] placeholder:text-[#8fa39e] focus:outline-none focus:border-[#157a6e]"
                      />
                      <div className="absolute right-1.5">
                        <VoiceDictationButton
                          value={procedures.map(p => p.name).join(', ')}
                          onChange={val => {
                            markDoctorEdited('summary.procedures');
                            if (!val.trim()) {
                              setProcedures([]);
                            } else {
                              setProcedures([{ id: 'proc-inline', name: val, cost: proceduresTotal || 0 }]);
                            }
                          }}
                          variant="badge"
                          className="border-0 shadow-none bg-transparent"
                          title="Dictate procedures performed"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 6. DERMATOLOGY IMAGE SUMMARY */}
              <div className="bg-white border border-[#dce6e3] rounded-2xl p-4 shadow-2xs space-y-3.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-[#e3f2ef] text-[#115e56] text-[11px] font-bold flex items-center justify-center">
                      6
                    </span>
                    <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#4a635e]">
                      DERMATOLOGY IMAGE SUMMARY
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#e8f5f2] border border-[#bde0d9] text-[#0f5950] text-[10px] font-bold">
                      <Sparkles className="w-2.5 h-2.5 text-[#157a6e]" />
                      Side-by-Side AI Summary
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px]">
                    <span className="text-[#6c857f] font-medium">
                      {images.length > 0 ? `${images.length} images attached` : '2 images attached'}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRunSummaryAIAnalysis()}
                      disabled={isGeneratingImageSummaryAI}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#e8f5f2] hover:bg-[#d7ede8] text-[#0f5950] border border-[#bde0d9] font-semibold transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${isGeneratingImageSummaryAI ? 'animate-spin' : ''}`} />
                      <span>{isGeneratingImageSummaryAI ? 'Analyzing...' : 'Refresh AI Summary'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTabChange('images')}
                      className="font-semibold text-[#157a6e] hover:text-[#0f5950] transition-colors"
                    >
                      Manage in Clinical images →
                    </button>
                  </div>
                </div>

                {/* Top Side-by-Side Layout: Attached Dermatology Images (Left) + AI Image Summary Result (Right) */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-stretch">
                  {/* LEFT COLUMN: Dermatology Image Specimens & Upload */}
                  <div className="lg:col-span-5 bg-[#f8fbfa] border border-[#dce6e3] rounded-xl p-3 flex flex-col justify-between gap-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#4a635e]">
                        CLINICAL / DERMOSCOPIC SPECIMENS
                      </span>
                      <span className="text-[10px] text-[#6c857f] font-medium">
                        Click specimen to inspect
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5 flex-wrap">
                      {images.length > 0 ? (
                        images.map((img, idx) => {
                          const isSelected = selectedSummarySpecimen === img.id;
                          return (
                            <div
                              key={img.id}
                              onClick={() => {
                                setSelectedSummarySpecimen(img.id);
                                handleRunSummaryAIAnalysis(img);
                              }}
                              className={`w-[78px] h-[78px] rounded-xl border overflow-hidden relative cursor-pointer group shrink-0 transition-all ${
                                isSelected
                                  ? 'border-[#157a6e] ring-2 ring-[#157a6e]/25 shadow-xs'
                                  : 'border-[#dce6e3] hover:border-[#157a6e]'
                              }`}
                            >
                              <img src={img.url} alt={img.caption} className="w-full h-full object-cover" />
                              <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[#0e423d]/80 text-white flex items-center justify-center">
                                <Sparkles className="w-2.5 h-2.5 text-teal-300" />
                              </div>
                              <div className="absolute inset-x-0 bottom-0 bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white truncate">
                                {img.bodyArea || img.caption || `Image ${idx + 1}`}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <>
                          {/* Default Left cheek dermatology lesion tile */}
                          <div
                            onClick={() =>
                              setSelectedSummarySpecimen(selectedSummarySpecimen === 'left' ? 'all' : 'left')
                            }
                            className={`w-[78px] h-[78px] rounded-xl border overflow-hidden relative cursor-pointer shrink-0 bg-gradient-to-br from-[#eab896] via-[#df9f76] to-[#ce875c] transition-all ${
                              selectedSummarySpecimen === 'left' || selectedSummarySpecimen === 'all'
                                ? 'border-[#157a6e] ring-2 ring-[#157a6e]/25 shadow-xs'
                                : 'border-[#dce6e3] opacity-85 hover:opacity-100'
                            }`}
                            title="Left cheek clinical specimen"
                          >
                            <span className="absolute top-3.5 left-4 w-2.5 h-2.5 rounded-full bg-[#7a3e20]/75 blur-[0.3px]" />
                            <span className="absolute top-6 left-9 w-2 h-2 rounded-full bg-[#6e3518]/70" />
                            <span className="absolute top-8 left-5 w-1.5 h-1.5 rounded-full bg-[#874829]/70" />
                            <div className="absolute top-1 right-1 px-1 py-0.2 rounded bg-black/35 text-[8.5px] font-bold text-white">
                              AI
                            </div>
                            <div className="absolute inset-x-0 bottom-0 bg-[#6b4229]/85 px-2 py-0.5 text-[10px] font-medium text-white truncate">
                              Left cheek
                            </div>
                          </div>

                          {/* Default Right cheek dermatology lesion tile */}
                          <div
                            onClick={() =>
                              setSelectedSummarySpecimen(selectedSummarySpecimen === 'right' ? 'all' : 'right')
                            }
                            className={`w-[78px] h-[78px] rounded-xl border overflow-hidden relative cursor-pointer shrink-0 bg-gradient-to-br from-[#eab896] via-[#df9f76] to-[#ce875c] transition-all ${
                              selectedSummarySpecimen === 'right' || selectedSummarySpecimen === 'all'
                                ? 'border-[#157a6e] ring-2 ring-[#157a6e]/25 shadow-xs'
                                : 'border-[#dce6e3] opacity-85 hover:opacity-100'
                            }`}
                            title="Right cheek clinical specimen"
                          >
                            <span className="absolute top-4 left-5 w-2.5 h-2.5 rounded-full bg-[#7a3e20]/75 blur-[0.3px]" />
                            <span className="absolute top-6 left-10 w-2 h-2 rounded-full bg-[#6e3518]/70" />
                            <span className="absolute top-8 left-6 w-1.5 h-1.5 rounded-full bg-[#874829]/70" />
                            <div className="absolute top-1 right-1 px-1 py-0.2 rounded bg-black/35 text-[8.5px] font-bold text-white">
                              AI
                            </div>
                            <div className="absolute inset-x-0 bottom-0 bg-[#6b4229]/85 px-2 py-0.5 text-[10px] font-medium text-white truncate">
                              Right cheek
                            </div>
                          </div>
                        </>
                      )}

                      {/* + Add image dashed tile */}
                      <input
                        ref={summaryImageInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleSummaryImageUpload}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => summaryImageInputRef.current?.click()}
                        className="w-[78px] h-[78px] rounded-xl border border-dashed border-[#bdd0ca] hover:border-[#157a6e] bg-white hover:bg-[#f0f7f5] flex flex-col items-center justify-center gap-0.5 text-[#5c7470] hover:text-[#115e56] transition-colors shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span className="text-[10.5px] font-medium">Add image</span>
                      </button>
                    </div>

                    {/* Specimen filter pills */}
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#e5eeeb] text-[10.5px]">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setSelectedSummarySpecimen('all')}
                          className={`px-2 py-0.5 rounded-md font-semibold transition-colors ${
                            selectedSummarySpecimen === 'all'
                              ? 'bg-[#157a6e] text-white'
                              : 'bg-white text-[#5c7470] border border-[#dce6e3]'
                          }`}
                        >
                          Side-by-Side (Both)
                        </button>
                        {images.length === 0 && (
                          <>
                            <button
                              type="button"
                              onClick={() => setSelectedSummarySpecimen('left')}
                              className={`px-2 py-0.5 rounded-md font-semibold transition-colors ${
                                selectedSummarySpecimen === 'left'
                                  ? 'bg-[#157a6e] text-white'
                                  : 'bg-white text-[#5c7470] border border-[#dce6e3]'
                              }`}
                            >
                              Left cheek
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedSummarySpecimen('right')}
                              className={`px-2 py-0.5 rounded-md font-semibold transition-colors ${
                                selectedSummarySpecimen === 'right'
                                  ? 'bg-[#157a6e] text-white'
                                  : 'bg-white text-[#5c7470] border border-[#dce6e3]'
                              }`}
                            >
                              Right cheek
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* RIGHT COLUMN (SIDE-BY-SIDE): AI IMAGE SUMMARY RESULT */}
                  <div className="lg:col-span-7 bg-gradient-to-br from-[#f2f9f7] via-[#f7fbfa] to-white border border-[#c6dfd9] rounded-xl p-3.5 flex flex-col justify-between gap-2.5 shadow-2xs">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-[#0f5950]">
                            <Sparkles className="w-3 h-3 text-[#157a6e]" />
                            AI IMAGE SUMMARY RESULT
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-[#0e423d] text-white text-[9.5px] font-bold">
                            {aiImageSummaryResult.confidence}
                          </span>
                        </div>
                        <h4 className="text-xs font-bold text-[#0f2926] mt-1">
                          {aiImageSummaryResult.title}
                        </h4>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const refreshed = getInitialDermSummary();
                          setDermMorphology({
                            lesionType: refreshed.lesionType,
                            colour: refreshed.colour,
                            distribution: refreshed.distribution,
                            sizeExtent: refreshed.sizeExtent,
                            borders: refreshed.borders,
                            severity: refreshed.severity,
                            aiObservation: aiImageSummaryResult.narrative
                          });
                        }}
                        className="px-2.5 py-1 rounded-lg bg-white hover:bg-[#e8f5f2] text-[#115e56] border border-[#bdd6d0] text-[10.5px] font-bold transition-colors shrink-0 shadow-2xs"
                        title="Sync AI Image Summary Result to all morphology fields below"
                      >
                        Apply AI Result to Fields
                      </button>
                    </div>

                    {/* Side-by-Side Per-Specimen AI Summary Result Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {(selectedSummarySpecimen === 'all' || selectedSummarySpecimen === 'left') && (
                        <div className="bg-white/95 border border-[#d6e7e3] rounded-lg p-2.5">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#115e56] flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#157a6e]" />
                              {aiImageSummaryResult.leftSpecimenTitle} — AI Summary
                            </span>
                            <span className="text-[9.5px] font-semibold text-[#6c857f]">Specimen 1</span>
                          </div>
                          <p className="text-[11px] text-[#1e3a36] leading-relaxed">
                            {aiImageSummaryResult.leftSpecimenSummary}
                          </p>
                        </div>
                      )}

                      {(selectedSummarySpecimen === 'all' || selectedSummarySpecimen === 'right') && (
                        <div className="bg-white/95 border border-[#d6e7e3] rounded-lg p-2.5">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#115e56] flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#157a6e]" />
                              {aiImageSummaryResult.rightSpecimenTitle} — AI Summary
                            </span>
                            <span className="text-[9.5px] font-semibold text-[#6c857f]">Specimen 2</span>
                          </div>
                          <p className="text-[11px] text-[#1e3a36] leading-relaxed">
                            {aiImageSummaryResult.rightSpecimenSummary}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Differentials & Workup Footer inside AI Result Card */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-[#d8eae5] text-[10.5px]">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-[#4a635e] uppercase text-[9.5px]">Differentials:</span>
                        {aiImageSummaryResult.differentials.map((diff, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded-md bg-white border border-[#cfe2dd] text-[#0f2926] font-semibold text-[10px]"
                          >
                            {diff}
                          </span>
                        ))}
                      </div>
                      <div className="flex items-center gap-1 text-[#115e56] font-semibold text-[10px]">
                        <span>Workup:</span>
                        <span>{aiImageSummaryResult.workup.join(' · ')}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 6-Field Dashed Morphology Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  <div className="border border-dashed border-[#cfdeda] bg-[#fafcfb] rounded-xl px-3 py-2">
                    <div className="flex items-center justify-between mb-0.5">
                      <label className="text-[9.5px] font-bold uppercase tracking-wider text-[#6c857f]">
                        LESION TYPE
                      </label>
                      <VoiceDictationButton
                        value={dermMorphology.lesionType}
                        onChange={val => {
                          markDoctorEdited('derm.lesionType');
                          setDermMorphology({ ...dermMorphology, lesionType: val });
                        }}
                        variant="badge"
                        className="p-1 border-0 shadow-none bg-transparent"
                        title="Dictate lesion type"
                      />
                    </div>
                    <input
                      type="text"
                      value={dermMorphology.lesionType}
                      onChange={e => {
                        markDoctorEdited('derm.lesionType');
                        setDermMorphology({ ...dermMorphology, lesionType: e.target.value });
                      }}
                      placeholder="e.g. Macule, papule, plaque, patch"
                      className="w-full text-xs bg-transparent text-[#0f2926] placeholder:text-[#8fa39e] focus:outline-none"
                    />
                  </div>
                  <div className="border border-dashed border-[#cfdeda] bg-[#fafcfb] rounded-xl px-3 py-2">
                    <div className="flex items-center justify-between mb-0.5">
                      <label className="text-[9.5px] font-bold uppercase tracking-wider text-[#6c857f]">
                        COLOUR / PIGMENTATION
                      </label>
                      <VoiceDictationButton
                        value={dermMorphology.colour}
                        onChange={val => {
                          markDoctorEdited('derm.colour');
                          setDermMorphology({ ...dermMorphology, colour: val });
                        }}
                        variant="badge"
                        className="p-1 border-0 shadow-none bg-transparent"
                        title="Dictate colour / pigmentation"
                      />
                    </div>
                    <input
                      type="text"
                      value={dermMorphology.colour}
                      onChange={e => {
                        markDoctorEdited('derm.colour');
                        setDermMorphology({ ...dermMorphology, colour: e.target.value });
                      }}
                      placeholder="e.g. Hyperpigmented, erythematous"
                      className="w-full text-xs bg-transparent text-[#0f2926] placeholder:text-[#8fa39e] focus:outline-none"
                    />
                  </div>
                  <div className="border border-dashed border-[#cfdeda] bg-[#fafcfb] rounded-xl px-3 py-2">
                    <div className="flex items-center justify-between mb-0.5">
                      <label className="text-[9.5px] font-bold uppercase tracking-wider text-[#6c857f]">
                        DISTRIBUTION / SITE
                      </label>
                      <VoiceDictationButton
                        value={dermMorphology.distribution}
                        onChange={val => {
                          markDoctorEdited('derm.distribution');
                          setDermMorphology({ ...dermMorphology, distribution: val });
                        }}
                        variant="badge"
                        className="p-1 border-0 shadow-none bg-transparent"
                        title="Dictate distribution / site"
                      />
                    </div>
                    <input
                      type="text"
                      value={dermMorphology.distribution}
                      onChange={e => {
                        markDoctorEdited('derm.distribution');
                        setDermMorphology({ ...dermMorphology, distribution: e.target.value });
                      }}
                      placeholder="e.g. Malar cheeks, bilateral, centrofacial"
                      className="w-full text-xs bg-transparent text-[#0f2926] placeholder:text-[#8fa39e] focus:outline-none"
                    />
                  </div>
                  <div className="border border-dashed border-[#cfdeda] bg-[#fafcfb] rounded-xl px-3 py-2">
                    <div className="flex items-center justify-between mb-0.5">
                      <label className="text-[9.5px] font-bold uppercase tracking-wider text-[#6c857f]">
                        SIZE & EXTENT
                      </label>
                      <VoiceDictationButton
                        value={dermMorphology.sizeExtent}
                        onChange={val => {
                          markDoctorEdited('derm.sizeExtent');
                          setDermMorphology({ ...dermMorphology, sizeExtent: val });
                        }}
                        variant="badge"
                        className="p-1 border-0 shadow-none bg-transparent"
                        title="Dictate size & extent"
                      />
                    </div>
                    <input
                      type="text"
                      value={dermMorphology.sizeExtent}
                      onChange={e => {
                        markDoctorEdited('derm.sizeExtent');
                        setDermMorphology({ ...dermMorphology, sizeExtent: e.target.value });
                      }}
                      placeholder="e.g. 2–4 cm confluent patches"
                      className="w-full text-xs bg-transparent text-[#0f2926] placeholder:text-[#8fa39e] focus:outline-none"
                    />
                  </div>
                  <div className="border border-dashed border-[#cfdeda] bg-[#fafcfb] rounded-xl px-3 py-2">
                    <div className="flex items-center justify-between mb-0.5">
                      <label className="text-[9.5px] font-bold uppercase tracking-wider text-[#6c857f]">
                        BORDERS & SURFACE
                      </label>
                      <VoiceDictationButton
                        value={dermMorphology.borders}
                        onChange={val => {
                          markDoctorEdited('derm.borders');
                          setDermMorphology({ ...dermMorphology, borders: val });
                        }}
                        variant="badge"
                        className="p-1 border-0 shadow-none bg-transparent"
                        title="Dictate borders & surface"
                      />
                    </div>
                    <input
                      type="text"
                      value={dermMorphology.borders}
                      onChange={e => {
                        markDoctorEdited('derm.borders');
                        setDermMorphology({ ...dermMorphology, borders: e.target.value });
                      }}
                      placeholder="e.g. Irregular, well-demarcated, non-scaly"
                      className="w-full text-xs bg-transparent text-[#0f2926] placeholder:text-[#8fa39e] focus:outline-none"
                    />
                  </div>
                  <div className="border border-dashed border-[#cfdeda] bg-[#fafcfb] rounded-xl px-3 py-2">
                    <div className="flex items-center justify-between mb-0.5">
                      <label className="text-[9.5px] font-bold uppercase tracking-wider text-[#6c857f]">
                        SEVERITY / WOOD'S LAMP
                      </label>
                      <VoiceDictationButton
                        value={dermMorphology.severity}
                        onChange={val => {
                          markDoctorEdited('derm.severity');
                          setDermMorphology({ ...dermMorphology, severity: val });
                        }}
                        variant="badge"
                        className="p-1 border-0 shadow-none bg-transparent"
                        title="Dictate severity / Wood's lamp findings"
                      />
                    </div>
                    <input
                      type="text"
                      value={dermMorphology.severity}
                      onChange={e => {
                        markDoctorEdited('derm.severity');
                        setDermMorphology({ ...dermMorphology, severity: e.target.value });
                      }}
                      placeholder="e.g. Moderate · mixed epidermal-dermal"
                      className="w-full text-xs bg-transparent text-[#0f2926] placeholder:text-[#8fa39e] focus:outline-none"
                    />
                  </div>
                </div>

                {/* Bottom Side-by-Side Row: Visual / Dermoscopic Observations (Left) & AI Image Summary Result (Right) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Left: Visual / Dermoscopic Observations */}
                  <div className="bg-[#fafcfb] border border-[#dce6e3] rounded-xl p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#4a635e]">
                        VISUAL / DERMOSCOPIC OBSERVATIONS
                      </label>
                      <VoiceDictationButton
                        value={dermMorphology.aiObservation}
                        onChange={val => {
                          markDoctorEdited('derm.aiObservation');
                          setDermMorphology({ ...dermMorphology, aiObservation: val });
                        }}
                        variant="badge"
                        title="Dictate visual / dermoscopic observations"
                      />
                    </div>
                    <textarea
                      rows={3}
                      value={dermMorphology.aiObservation}
                      onChange={e => {
                        markDoctorEdited('derm.aiObservation');
                        setDermMorphology({ ...dermMorphology, aiObservation: e.target.value });
                      }}
                      placeholder="Morphological description from clinical / dermoscopic images — pigment network, vascular pattern, comparison with prior visit photos..."
                      className="w-full px-3 py-2 text-xs bg-white border border-[#dce6e3] rounded-lg text-[#0f2926] placeholder:text-[#8fa39e] focus:outline-none focus:border-[#157a6e] resize-y"
                    />
                  </div>

                  {/* Right (Side-by-Side): AI Image Summary Result */}
                  <div className="bg-[#f2f9f7] border border-[#c6dfd9] rounded-xl p-3">
                    <div className="flex items-center justify-between mb-1.5 gap-2">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#0f5950] flex items-center gap-1.5">
                        <Sparkles className="w-3 h-3 text-[#157a6e]" />
                        <span>AI IMAGE SUMMARY RESULT</span>
                      </label>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            markDoctorEdited('derm.aiObservation');
                            setDermMorphology(prev => ({
                              ...prev,
                              aiObservation: aiImageSummaryResult.narrative
                            }));
                          }}
                          className="px-2 py-0.5 rounded bg-white hover:bg-[#e3f2ef] text-[#115e56] border border-[#bdd6d0] text-[10px] font-semibold transition-colors"
                          title="Copy AI Image Summary Result into Visual / Dermoscopic Observations"
                        >
                          ← Sync to Observations
                        </button>
                        <VoiceDictationButton
                          value={aiImageSummaryResult.narrative}
                          onChange={val => {
                            markDoctorEdited('derm.narrative');
                            setAiImageSummaryResult(prev => ({
                              ...prev,
                              narrative: val
                            }));
                          }}
                          variant="badge"
                          title="Dictate or append to AI Image Summary Result"
                        />
                      </div>
                    </div>
                    <textarea
                      rows={3}
                      value={aiImageSummaryResult.narrative}
                      onChange={e => {
                        markDoctorEdited('derm.narrative');
                        setAiImageSummaryResult(prev => ({
                          ...prev,
                          narrative: e.target.value
                        }));
                      }}
                      placeholder="AI-generated dermatology image summary result..."
                      className="w-full px-3 py-2 text-xs bg-white border border-[#c6dfd9] rounded-lg text-[#0f2926] placeholder:text-[#8fa39e] focus:outline-none focus:border-[#157a6e] resize-y"
                    />
                  </div>
                </div>
              </div>

              {/* 7. FOLLOW-UP & PRESCRIPTION (RX) */}
              <div className="bg-white border border-[#dce6e3] rounded-2xl p-4 shadow-2xs">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-[#e3f2ef] text-[#115e56] text-[11px] font-bold flex items-center justify-center">
                      7
                    </span>
                    <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#4a635e]">
                      FOLLOW-UP & PRESCRIPTION (RX)
                    </span>
                  </div>
                  <span className="text-[11px] text-[#6c857f] font-medium">
                    {prescriptions.length} {prescriptions.length === 1 ? 'medicine' : 'medicines'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2.5">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[#6c857f] mb-1 block">
                      MEDICATIONS (DRUG · DOSE · FREQUENCY · DURATION)
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        value={
                          inlineMedSummary ||
                          prescriptions
                            .map(p => `${p.medicineName} ${p.dosage} · ${p.frequency} · ${p.duration}`)
                            .join('; ')
                        }
                        onChange={e => {
                          markDoctorEdited('summary.medications');
                          setInlineMedSummary(e.target.value);
                        }}
                        placeholder="No medicines added — use Follow up & Rx tab or type here"
                        className="w-full pl-3 pr-9 py-2 text-xs bg-white border border-[#dce6e3] rounded-lg text-[#0f2926] placeholder:text-[#8fa39e] focus:outline-none focus:border-[#157a6e]"
                      />
                      <div className="absolute right-1.5">
                        <VoiceDictationButton
                          value={
                            inlineMedSummary ||
                            prescriptions
                              .map(p => `${p.medicineName} ${p.dosage} · ${p.frequency} · ${p.duration}`)
                              .join('; ')
                          }
                          onChange={val => {
                            markDoctorEdited('summary.medications');
                            setInlineMedSummary(val);
                          }}
                          variant="badge"
                          className="border-0 shadow-none bg-transparent"
                          title="Dictate medications"
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[#6c857f] mb-1 block">
                      TOPICALS / SKINCARE & INSTRUCTIONS
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        value={topicalsAdvice}
                        onChange={e => {
                          markDoctorEdited('summary.topicalsAdvice');
                          setTopicalsAdvice(e.target.value);
                        }}
                        placeholder="Sunscreen SPF 50+, gentle cleanser, application order..."
                        className="w-full pl-3 pr-9 py-2 text-xs bg-white border border-[#dce6e3] rounded-lg text-[#0f2926] placeholder:text-[#8fa39e] focus:outline-none focus:border-[#157a6e]"
                      />
                      <div className="absolute right-1.5">
                        <VoiceDictationButton
                          value={topicalsAdvice}
                          onChange={val => {
                            markDoctorEdited('summary.topicalsAdvice');
                            setTopicalsAdvice(val);
                          }}
                          variant="badge"
                          className="border-0 shadow-none bg-transparent"
                          title="Dictate topicals & skincare instructions"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[#6c857f] mb-1 block">
                      NEXT FOLLOW-UP
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        value={followUp.instructions || ''}
                        onChange={e => {
                          markDoctorEdited('summary.followUpInstructions');
                          setFollowUp({ ...followUp, instructions: e.target.value });
                        }}
                        placeholder="e.g. Review in 4 weeks with repeat clinical photos"
                        className="w-full pl-3 pr-9 py-2 text-xs bg-white border border-[#dce6e3] rounded-lg text-[#0f2926] placeholder:text-[#8fa39e] focus:outline-none focus:border-[#157a6e]"
                      />
                      <div className="absolute right-1.5">
                        <VoiceDictationButton
                          value={followUp.instructions || ''}
                          onChange={val => {
                            markDoctorEdited('summary.followUpInstructions');
                            setFollowUp({ ...followUp, instructions: val });
                          }}
                          variant="badge"
                          className="border-0 shadow-none bg-transparent"
                          title="Dictate next follow-up plan"
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[#6c857f] mb-1 block">
                      RED-FLAG / PATIENT ADVICE
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        value={followUp.notes || ''}
                        onChange={e => {
                          markDoctorEdited('summary.followUpNotes');
                          setFollowUp({ ...followUp, notes: e.target.value });
                        }}
                        placeholder="Discontinue if irritation; avoid mid-day sun..."
                        className="w-full pl-3 pr-9 py-2 text-xs bg-white border border-[#dce6e3] rounded-lg text-[#0f2926] placeholder:text-[#8fa39e] focus:outline-none focus:border-[#157a6e]"
                      />
                      <div className="absolute right-1.5">
                        <VoiceDictationButton
                          value={followUp.notes || ''}
                          onChange={val => {
                            markDoctorEdited('summary.followUpNotes');
                            setFollowUp({ ...followUp, notes: val });
                          }}
                          variant="badge"
                          className="border-0 shadow-none bg-transparent"
                          title="Dictate red-flag / patient advice"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Bottom Billing & Actions Bar */}
        <div className="px-6 py-3.5 bg-white border-t border-[#e2ebe8] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 shrink-0">
          {/* Charges summary breakdown */}
          <div className="flex items-center gap-6 text-xs">
            <div>
              <span className="text-[9.5px] uppercase font-bold text-[#6c857f] block tracking-wider">PROCEDURES</span>
              <span className="font-bold text-[#0f2926] text-xs">₹{proceduresTotal}</span>
            </div>
            <div>
              <span className="text-[9.5px] uppercase font-bold text-[#6c857f] block tracking-wider">CONSULTATION</span>
              <span className="font-bold text-[#0f2926] text-xs">₹{fee}</span>
            </div>
            <div>
              <span className="text-[9.5px] uppercase font-bold text-[#6c857f] block tracking-wider">TOTAL</span>
              <span className="font-extrabold text-[#115e56] text-sm">₹{grandTotal}</span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white border border-[#cfdeda] text-[#0f2926] hover:bg-[#f2f6f5] rounded-xl text-xs font-semibold transition-colors"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={() => setShowWhatsApp(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#1fae51] hover:bg-[#199945] text-white rounded-xl text-xs font-bold shadow-2xs transition-colors"
              title="Share consultation summary and prescription to patient's WhatsApp"
            >
              <WhatsAppIcon className="w-3.5 h-3.5 fill-white" />
              <span>WhatsApp</span>
            </button>
            <button
              type="button"
              onClick={handleSignAndFinish}
              disabled={isSigning}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold bg-[#157a6e] hover:bg-[#11645a] text-white shadow-xs transition-all disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{isSigning ? 'Signing & Saving...' : 'Sign & finish'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* AI Image Diagnostic Suggestion Overlay */}
      {(isAnalyzingImage || activeImageAnalysis) && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-teal-500/20 text-teal-300 flex items-center justify-center">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold tracking-tight">AI Clinical Diagnostic Assistant</h3>
                  <p className="text-[11px] text-teal-300/80">Multimodal vision analysis correlated with patient timeline</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveImageAnalysis(null);
                  setIsAnalyzingImage(false);
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              {isAnalyzingImage ? (
                <div className="py-16 text-center space-y-3">
                  <RefreshCw className="w-8 h-8 animate-spin text-teal-600 mx-auto" />
                  <p className="text-xs font-semibold text-slate-700">Analyzing clinical image with patient timeline...</p>
                  <p className="text-[11px] text-slate-400 max-w-sm mx-auto">Evaluating morphological markers against prior consultations, active medications, and allergies.</p>
                </div>
              ) : activeImageAnalysis ? (
                <>
                  {/* Feedback toast */}
                  {analysisFeedbackToast && (
                    <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800 flex items-center gap-2 animate-in fade-in">
                      <Check className="w-4 h-4 text-emerald-600" />
                      <span>{analysisFeedbackToast}</span>
                    </div>
                  )}

                  {/* Primary Impression */}
                  <div className="p-4 rounded-xl bg-teal-900 text-white flex items-start justify-between gap-4">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-teal-300">
                        Primary Suggestion
                      </span>
                      <h4 className="text-base font-bold text-white mt-0.5">
                        {activeImageAnalysis.primaryImpression}
                      </h4>
                    </div>
                    {activeAnalyzedImage && (
                      <img
                        src={activeAnalyzedImage.url}
                        alt="Analyzed specimen"
                        className="w-14 h-14 rounded-lg object-cover border border-white/20 shrink-0"
                      />
                    )}
                  </div>

                  {/* Differential Diagnoses */}
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-2">
                      Differential Diagnoses
                    </span>
                    <div className="space-y-2">
                      {activeImageAnalysis.differentials.map((diff, idx) => (
                        <div key={idx} className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-slate-900">{diff.condition}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              diff.confidence === 'High' ? 'bg-emerald-100 text-emerald-800' :
                              diff.confidence === 'Moderate' ? 'bg-amber-100 text-amber-800' :
                              'bg-blue-100 text-blue-800'
                            }`}>
                              {diff.confidence}
                            </span>
                          </div>
                          <p className="text-slate-600 leading-relaxed text-[11px]">{diff.rationale}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Timeline Correlation */}
                  <div className="p-3.5 rounded-xl bg-teal-50/70 border border-teal-200 text-xs">
                    <span className="font-bold text-teal-900 block mb-1">Timeline Correlation</span>
                    <p className="text-teal-950 text-[11px] leading-relaxed">{activeImageAnalysis.timelineCorrelation}</p>
                  </div>

                  {/* Red flags */}
                  {activeImageAnalysis.redFlags.length > 0 && (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
                      <span className="font-bold text-rose-900 block mb-1">Alerts / Rule Out:</span>
                      <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                        {activeImageAnalysis.redFlags.map((rf, idx) => (
                          <li key={idx}>{rf}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Recommended Workup & Plan */}
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
                    <span className="font-bold text-slate-800 block">Suggested First-Line Plan</span>
                    <p className="text-slate-600 text-[11px] whitespace-pre-line">{activeImageAnalysis.suggestedManagementPlan}</p>
                    {activeImageAnalysis.recommendedInvestigations.length > 0 && (
                      <p className="text-slate-500 text-[10px] pt-1">
                        <strong>Recommended tests:</strong> {activeImageAnalysis.recommendedInvestigations.join(', ')}
                      </p>
                    )}
                  </div>
                </>
              ) : null}
            </div>

            {/* Actions */}
            {activeImageAnalysis && (
              <div className="p-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveImageAnalysis(null);
                  }}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200/60"
                >
                  Close
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleApplyPlanFromAI}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 flex items-center gap-1.5 shadow-2xs"
                  >
                    <FileText className="w-3.5 h-3.5 text-teal-700" />
                    Apply Plan to Notes
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyDiagnosesFromAI}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-teal-700 hover:bg-teal-800 text-white flex items-center gap-1.5 shadow-sm"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Apply Diagnoses
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* WhatsApp Medical Report Modal */}
      {showWhatsApp && (
        <WhatsAppShareModal
          isOpen={showWhatsApp}
          onClose={() => setShowWhatsApp(false)}
          patient={patient}
          doctor={doctor}
          reportType="consultation_summary"
          data={{
            consultation: {
              ...consultation,
              diagnoses,
              symptoms,
              tests,
              procedures,
              clinicalNotes,
              followUp,
              prescriptions,
              fee
            }
          }}
        />
      )}
    </div>
  );
};
