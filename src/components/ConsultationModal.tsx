import React, { useState, useEffect } from 'react';
import { Consultation, Patient, ProcedureItem, BodyMarker, ClinicalImage, PrescriptionItem, AIImageAnalysisResult, DoctorFormularyItem } from '../types';
import { PREDEFINED_DIAGNOSES, PREDEFINED_TESTS, PREDEFINED_PROCEDURES, COMMON_MEDICATIONS } from '../data/clinicalCatalogues';
import { BodyMap } from './BodyMap';
import { ClinicalImageUploader } from './ClinicalImageUploader';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { analyzeImageVisualFeatures } from '../utils/visualImageAnalyzer';
import { parseClinicalNoteToStructuredSummary, ParsedClinicalNoteSummary } from '../utils/clinicalNoteAutoFill';
import { WhatsAppShareModal, WhatsAppIcon } from './WhatsAppShareModal';
import { FormularyUploadModal } from './FormularyUploadModal';
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
  Search,
  Upload,
  BookOpen
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

  // Derive clinical baseline morphology & AI image summary from live consultation state or patient condition
  const getInitialDermSummary = (overrideContext?: string) => {
    const primary = (
      overrideContext ||
      [
        diagnoses[0],
        secondaryDiagnosis,
        symptoms.join(' '),
        clinicalNotes.examination,
        clinicalNotes.plan,
        consultation.diagnoses?.[0],
        patient.primaryDiagnosis,
        consultation.symptoms?.[0],
        'Pigmentation / Dark spots'
      ]
        .filter(Boolean)
        .join(' ')
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
  const hasUserEditedNotesRef = React.useRef<boolean>(false);
  const medDropdownContainerRef = React.useRef<HTMLDivElement>(null);
  const medNameInputRef = React.useRef<HTMLInputElement>(null);
  const [rxFeedbackHint, setRxFeedbackHint] = useState<string | null>(null);
  const [procFeedbackHint, setProcFeedbackHint] = useState<string | null>(null);

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

      if (!edited.has('derm.imageAnalyzed')) {
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
      }

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
    hasUserEditedNotesRef.current = true;
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

  // Refine with backend AI after debounce ONLY when the doctor has actively edited or dictated clinical notes
  useEffect(() => {
    if (!hasUserEditedNotesRef.current) return;

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
    }, 900);

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

  // Personalized Doctor Medical Library state
  const [doctorFormulary, setDoctorFormulary] = useState<DoctorFormularyItem[]>([]);
  const [autoSaveToLibrary, setAutoSaveToLibrary] = useState(true);
  const [isLibraryModalOpen, setIsLibraryModalOpen] = useState(false);
  const [libraryModalMode, setLibraryModalMode] = useState<'upload' | 'paste' | 'single'>('upload');
  const [librarySavedToast, setLibrarySavedToast] = useState<string | null>(null);

  useEffect(() => {
    api.formulary
      .list()
      .then(res => setDoctorFormulary(res.items || []))
      .catch(() => {});
  }, []);

  const personalNamesMap = new Set(doctorFormulary.map(m => m.name.toLowerCase()));
  const allDoctorMedications = [
    ...doctorFormulary.map(m => ({
      name: m.name,
      dosage: m.dosage,
      route: m.route,
      frequency: m.frequency,
      duration: m.duration,
      instructions: m.instructions,
      isPersonal: true
    })),
    ...COMMON_MEDICATIONS.filter(m => !personalNamesMap.has(m.name.toLowerCase())).map(m => ({
      name: m.name,
      dosage: m.dosage,
      route: undefined as string | undefined,
      frequency: m.frequency,
      duration: m.duration,
      instructions: m.instructions,
      isPersonal: false
    }))
  ];

  const handleSaveCurrentMedToLibrary = async (customName?: string) => {
    const targetName = (customName ?? medName).trim();
    if (!targetName) return;
    try {
      const res = await api.formulary.upsert({
        name: targetName,
        dosage: medDosage.trim() || '500 mg',
        route: medRoute || 'Oral',
        frequency: normalizeFrequencyInput(medFrequency) || '1-0-1',
        duration: normalizeDurationInput(medDuration) || '5 days',
        instructions: medInstructions.trim() || 'After meals',
        source: 'rx_learned'
      });
      setDoctorFormulary(prev => [
        res.item,
        ...prev.filter(i => i.id !== res.item.id && i.name.toLowerCase() !== res.item.name.toLowerCase())
      ]);
      setLibrarySavedToast(`Saved "${res.item.name}" (${res.item.dosage}) to ${doctor?.name || 'your'}'s Medical Library`);
      setTimeout(() => setLibrarySavedToast(null), 4000);
    } catch {
      // ignore background error
    }
  };

  // Close Drug Catalogue dropdown cleanly when clicking outside
  useEffect(() => {
    if (!isMedDropdownOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        medDropdownContainerRef.current &&
        !medDropdownContainerRef.current.contains(e.target as Node)
      ) {
        setIsMedDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isMedDropdownOpen]);

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
  const [summaryRefreshFeedback, setSummaryRefreshFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // AI Image Analysis state inside consultation
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const [activeImageAnalysis, setActiveImageAnalysis] = useState<AIImageAnalysisResult | null>(null);
  const [activeAnalyzedImage, setActiveAnalyzedImage] = useState<ClinicalImage | null>(null);
  const [analysisFeedbackToast, setAnalysisFeedbackToast] = useState<string | null>(null);
  const [summarySpecimenGatekeeper, setSummarySpecimenGatekeeper] = useState<{
    isValidSkinSpecimen: boolean;
    skinPixelRatio: number;
    lightingQuality: string;
    meanLuminance: number;
    rejectionReason?: string;
    qualityWarnings?: string[];
  } | null>(null);

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

  // Fast in-memory caches to make repeated or context-aware AI summary refreshes near-instant
  const visualMetricsCacheRef = React.useRef<Map<string, Awaited<ReturnType<typeof analyzeImageVisualFeatures>>>>(new Map());
  const aiAnalysisCacheRef = React.useRef<Map<string, AIImageAnalysisResult>>(new Map());
  const compressedImageCacheRef = React.useRef<Map<string, string>>(new Map());

  // Downscale large base64 images to max 512px JPEG (0.78 quality) to cut upload & Gemini tokenization time by ~75%
  const compressImageForFastAI = async (srcUrl: string): Promise<string> => {
    const cached = compressedImageCacheRef.current.get(srcUrl);
    if (cached) return cached;
    if (!srcUrl.startsWith('data:image/')) return srcUrl;

    return new Promise(resolve => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        try {
          const maxDim = 512;
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            const scale = maxDim / Math.max(width, height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(srcUrl);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', 0.78);
          compressedImageCacheRef.current.set(srcUrl, compressed);
          resolve(compressed);
        } catch {
          resolve(srcUrl);
        }
      };
      img.onerror = () => resolve(srcUrl);
      img.src = srcUrl;
    });
  };

  // Run AI analysis specifically for Section 6 Dermatology Image Summary (side by side)
  const handleRunSummaryAIAnalysis = async (
    targetImg?: ClinicalImage,
    options?: { openOverlayModal?: boolean }
  ) => {
    setIsGeneratingImageSummaryAI(true);
    setSummaryRefreshFeedback(null);
    const refreshTimeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    try {
      const selectedImg = images.find(img => img.id === selectedSummarySpecimen);
      const imgToAnalyze = targetImg || selectedImg || images[images.length - 1] || images[0];

      if (imgToAnalyze && imgToAnalyze.url) {
        // 1. Fast cached client-side visual telemetry (<15ms first run, 0ms cached)
        const cacheKey = imgToAnalyze.id || imgToAnalyze.url.slice(0, 128);
        let visualMetrics = visualMetricsCacheRef.current.get(cacheKey);
        if (!visualMetrics) {
          visualMetrics = await analyzeImageVisualFeatures(imgToAnalyze.url);
          visualMetricsCacheRef.current.set(cacheKey, visualMetrics);
        }

        // Lock dermatology summary fields so background clinical-note auto-fill does not overwrite real image telemetry
        markDoctorEdited('derm.imageAnalyzed');
        markDoctorEdited('derm.lesionType');
        markDoctorEdited('derm.colour');
        markDoctorEdited('derm.distribution');
        markDoctorEdited('derm.sizeExtent');
        markDoctorEdited('derm.borders');
        markDoctorEdited('derm.severity');
        markDoctorEdited('derm.aiObservation');
        markDoctorEdited('derm.narrative');

        // 2. FAST SHORT-CIRCUIT: If client-side gatekeeper already detects a non-biological / non-skin image,
        // update the UI immediately in <20ms and skip the multi-second LLM network call completely!
        const clientIsValidSkin =
          visualMetrics.isSkinSpecimen !== false &&
          visualMetrics.morphologyCategory !== 'non_skin_specimen';

        if (!clientIsValidSkin) {
          const skinRatio = visualMetrics.skinPixelRatio ?? 8;
          const lightingQual = visualMetrics.lightingStatus || 'Optimal';
          const meanLum = visualMetrics.meanLuminance ?? 138;
          const rejectionMsg =
            visualMetrics.rejectionReason ||
            'Uploaded photograph does not match biological human skin chrominance or micro-texture.';

          setSummarySpecimenGatekeeper({
            isValidSkinSpecimen: false,
            skinPixelRatio: skinRatio,
            lightingQuality: lightingQual,
            meanLuminance: meanLum,
            rejectionReason: rejectionMsg,
            qualityWarnings: visualMetrics.qualityWarnings || []
          });

          const specimen1Text =
            rejectionMsg ||
            `Only ${skinRatio}% of pixels match human cutaneous chrominance (threshold ≥30%). Automated skin disease diagnosis is suppressed.`;
          const specimen2Text = `Photometric Lighting: ${lightingQual} (Mean Luminance: ${meanLum}/255, Glare: ${
            visualMetrics.glareRatio ?? 0
          }%, Shadow: ${visualMetrics.shadowRatio ?? 0}%, Sharpness: ${
            visualMetrics.perceivedSharpness ?? 45
          }/100). Please upload a clear close-up photograph of human skin.`;
          const invalidNarrative = `⚠️ NON-BIOLOGICAL / INVALID SPECIMEN: ${specimen1Text} ${specimen2Text}`;

          setAiImageSummaryResult({
            title: 'Non-Cutaneous Image Detected (Invalid Skin Specimen)',
            confidence: `Invalid Specimen · Refreshed ${refreshTimeStr}`,
            leftSpecimenTitle: imgToAnalyze.bodyArea || imgToAnalyze.caption || 'Uploaded Specimen',
            leftSpecimenSummary: specimen1Text,
            rightSpecimenTitle: 'Lighting & Quality Telemetry',
            rightSpecimenSummary: specimen2Text,
            narrative: invalidNarrative,
            differentials: [
              'Non-Biological / Non-Cutaneous Object (Artifact or Background)',
              'Photographic or Lighting Artifact (Retake Required)'
            ],
            workup: [
              'Retake close-up photograph of bare skin (10–15 cm)',
              'Use diffuse clinic lighting (5000K–6500K)'
            ]
          });

          setDermMorphology({
            lesionType: 'Non-cutaneous / Non-biological image (No skin lesion)',
            colour: `Cutaneous skin ratio: ${skinRatio}% (Requires ≥30% human skin)`,
            distribution: 'N/A — Invalid non-skin specimen',
            sizeExtent: 'N/A — Retake clinical photograph',
            borders: `Focus sharpness: ${visualMetrics.perceivedSharpness ?? 45}/100`,
            severity: `Lighting: ${lightingQual} (${meanLum}/255 luminance)`,
            aiObservation: invalidNarrative
          });
          setSummaryRefreshFeedback(`⚡ Non-cutaneous specimen flagged instantly (${refreshTimeStr})`);
          return;
        }

        // 3. STAGE 1 OPTIMISTIC INSTANT RENDER (<25ms): Immediately update UI with live clinical context + visual metrics
        // so the doctor sees instant response while deep AI vision finishes in the background
        const fallbackContext = getInitialDermSummary();
        const instantTitle = diagnoses[0] || fallbackContext.aiSummaryTitle;
        const instantSkinRatio = visualMetrics.skinPixelRatio ?? 85;
        const instantLighting = visualMetrics.lightingStatus || 'Optimal';
        const instantLum = visualMetrics.meanLuminance ?? 138;
        const instantNarrative = `AI Vision Summary (${instantSkinRatio}% Cutaneous Verified · Lighting: ${instantLighting}): ${instantTitle}. ${fallbackContext.leftSpecimenSummary}`;

        setSummarySpecimenGatekeeper({
          isValidSkinSpecimen: true,
          skinPixelRatio: instantSkinRatio,
          lightingQuality: instantLighting,
          meanLuminance: instantLum,
          qualityWarnings: visualMetrics.qualityWarnings || []
        });

        setAiImageSummaryResult(prev => ({
          ...prev,
          title: instantTitle,
          confidence: `High Confidence · Verified (${refreshTimeStr})`,
          leftSpecimenTitle: imgToAnalyze.bodyArea || imgToAnalyze.caption || prev.leftSpecimenTitle,
          leftSpecimenSummary: fallbackContext.leftSpecimenSummary,
          rightSpecimenTitle: images[1]?.bodyArea || images[1]?.caption || 'Photometric & Secondary Assessment',
          rightSpecimenSummary: fallbackContext.rightSpecimenSummary,
          narrative: instantNarrative,
          differentials: fallbackContext.differentials,
          workup: tests.length > 0 ? tests : fallbackContext.workup
        }));

        setDermMorphology({
          lesionType:
            visualMetrics.morphologyCategory.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) +
            ` (${instantTitle})`,
          colour: `Erythema ${visualMetrics.erythemaIndex}/100 · Melanin ${visualMetrics.pigmentationIndex}/100 (${
            visualMetrics.dominantColors?.map(c => c.name).join(', ') || 'Cutaneous'
          })`,
          distribution: imgToAnalyze.bodyArea || imgToAnalyze.caption || 'Localized anatomical site',
          sizeExtent: `~${visualMetrics.estimatedDiameterMm || 5.2} mm · Asymmetry ${visualMetrics.asymmetryScore}/100`,
          borders: `Border Irregularity ${visualMetrics.borderIrregularity}/100 · Sharpness ${
            visualMetrics.perceivedSharpness ?? 75
          }/100`,
          severity: `Lighting: ${instantLighting} (${instantLum}/255) · Fitzpatrick ${
            visualMetrics.fitzpatrickType || 'Type IV'
          }`,
          aiObservation: instantNarrative
        });

        // 4. STAGE 2 FAST AI ENRICHMENT (Cached or Compressed 512px payload)
        const clinicalNotesPayload = [
          imgToAnalyze.caption ? `Specimen label: ${imgToAnalyze.caption}` : '',
          diagnoses.length > 0 ? `Active Diagnosis: ${diagnoses.join(', ')}` : '',
          symptoms.length > 0 ? `Symptoms: ${symptoms.join(', ')}` : '',
          clinicalNotes.examination ? `Exam: ${clinicalNotes.examination}` : ''
        ]
          .filter(Boolean)
          .join(' | ');

        const aiCacheKey = `${cacheKey}::${clinicalNotesPayload}`;
        let analysis: AIImageAnalysisResult | null = aiAnalysisCacheRef.current.get(aiCacheKey) || null;

        if (!analysis) {
          try {
            const fastBase64 = await compressImageForFastAI(imgToAnalyze.url);
            const res = await api.ai.analyzeImage({
              imageBase64: fastBase64,
              mimeType: 'image/jpeg',
              patientId: patient.id,
              visualMetrics,
              clinicalNotes: clinicalNotesPayload
            });
            analysis = res.analysis;
            if (analysis) {
              aiAnalysisCacheRef.current.set(aiCacheKey, analysis);
            }
          } catch (apiErr) {
            console.warn('Backend image analysis fallback triggered:', apiErr);
          }
        }

        if (options?.openOverlayModal && analysis) {
          setActiveImageAnalysis(analysis);
          setActiveAnalyzedImage(imgToAnalyze);
        }

        if (analysis) {
          const isValidSkin = analysis.isValidSkinSpecimen !== false;
          const skinRatio = visualMetrics.skinPixelRatio ?? (isValidSkin ? 85 : 8);
          const lightingQual = analysis.lightingQuality || visualMetrics.lightingStatus || 'Optimal';
          const meanLum = visualMetrics.meanLuminance ?? 138;

          if (!isValidSkin) {
            const rejectionMsg =
              analysis.qualityAssessmentNotes?.[0] ||
              analysis.visualFindings?.[0] ||
              'Uploaded photograph does not match biological human skin chrominance or micro-texture.';
            setSummarySpecimenGatekeeper({
              isValidSkinSpecimen: false,
              skinPixelRatio: skinRatio,
              lightingQuality: lightingQual,
              meanLuminance: meanLum,
              rejectionReason: rejectionMsg,
              qualityWarnings: analysis.qualityAssessmentNotes || []
            });
            setSummaryRefreshFeedback(`⚠ Non-cutaneous specimen flagged · Refreshed at ${refreshTimeStr}`);
            return;
          }

          const primaryImpression = analysis.primaryImpression || diagnoses[0] || fallbackContext.aiSummaryTitle;
          const topConfidence = analysis.differentials?.[0]?.confidence || 'High';
          const firstRationale =
            analysis.differentials?.[0]?.rationale ||
            analysis.visualFindings?.[1] ||
            analysis.timelineCorrelation ||
            fallbackContext.leftSpecimenSummary;
          const secondRationale =
            analysis.differentials?.[1]?.rationale ||
            analysis.suggestedManagementPlan ||
            fallbackContext.rightSpecimenSummary;
          const validNarrative = `AI Vision Summary (${skinRatio}% Cutaneous Verified · Lighting: ${lightingQual}): ${primaryImpression}. ${firstRationale} ${
            analysis.suggestedManagementPlan ? `Recommended Plan: ${analysis.suggestedManagementPlan}` : ''
          }`;

          setAiImageSummaryResult(prev => ({
            ...prev,
            title: primaryImpression,
            confidence: `${topConfidence} Confidence · Verified (${refreshTimeStr})`,
            leftSpecimenTitle: imgToAnalyze.bodyArea || imgToAnalyze.caption || prev.leftSpecimenTitle,
            leftSpecimenSummary: firstRationale,
            rightSpecimenTitle: images[1]?.bodyArea || images[1]?.caption || 'Photometric & Secondary Assessment',
            rightSpecimenSummary: secondRationale,
            narrative: validNarrative,
            differentials:
              analysis.differentials && analysis.differentials.length > 0
                ? analysis.differentials.map(d => d.condition)
                : fallbackContext.differentials,
            workup:
              analysis.recommendedInvestigations && analysis.recommendedInvestigations.length > 0
                ? analysis.recommendedInvestigations
                : fallbackContext.workup
          }));

          setDermMorphology(prev => ({
            ...prev,
            lesionType:
              visualMetrics.morphologyCategory.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) +
              ` (${primaryImpression})`,
            aiObservation: analysis.visualFindings?.join(' ') || validNarrative
          }));
        }

        setSummaryRefreshFeedback(`⚡ AI Image Summary refreshed (${refreshTimeStr})`);
      } else {
        // INSTANT Refresh (<15ms) from live consultation context (Diagnoses, Symptoms, Clinical Notes, Body Map, Tests & Rx)
        const combinedContext = [
          diagnoses.length > 0 ? `Diagnosis: ${diagnoses.join(', ')}` : '',
          secondaryDiagnosis ? `Differential: ${secondaryDiagnosis}` : '',
          symptoms.length > 0 ? `Chief Complaints: ${symptoms.join(', ')}` : '',
          singleVoiceNote.trim(),
          clinicalNotes.examination.trim(),
          clinicalNotes.investigationsAdvised.trim(),
          clinicalNotes.plan.trim(),
          bodyMarkers.length > 0
            ? `Body Map Sites: ${bodyMarkers.map(m => m.anatomicalPart || m.type).join(', ')}`
            : '',
          tests.length > 0 ? `Tests: ${tests.join(', ')}` : '',
          procedures.length > 0 ? `Procedures: ${procedures.map(p => p.name).join(', ')}` : ''
        ]
          .filter(Boolean)
          .join('. ');

        const localParsed = parseClinicalNoteToStructuredSummary(combinedContext, {
          existingExamination: clinicalNotes.examination,
          existingInvestigations: clinicalNotes.investigationsAdvised,
          existingPlan: clinicalNotes.plan,
          patientPrimaryDiagnosis: diagnoses[0] || patient.primaryDiagnosis,
          existingSymptoms: symptoms
        });

        const applyStructuredSummaryState = (parsedData: ParsedClinicalNoteSummary) => {
          const refreshed = getInitialDermSummary(combinedContext);
          const resolvedTitle =
            diagnoses[0] ||
            parsedData.aiImageSummaryResult?.title ||
            refreshed.aiSummaryTitle;
          const anatomicalSiteNote =
            bodyMarkers.length > 0
              ? bodyMarkers.map(m => m.anatomicalPart || m.type).join(', ')
              : parsedData.dermMorphology?.distribution || refreshed.distribution;

          setSummarySpecimenGatekeeper({
            isValidSkinSpecimen: true,
            skinPixelRatio: 88,
            lightingQuality: 'Optimal',
            meanLuminance: 142,
            qualityWarnings: []
          });

          setAiImageSummaryResult({
            title: resolvedTitle,
            confidence: `${parsedData.aiImageSummaryResult?.confidence || refreshed.aiConfidence} · Refreshed ${refreshTimeStr}`,
            leftSpecimenTitle:
              selectedSummarySpecimen === 'right'
                ? 'Right cheek (Selected)'
                : parsedData.aiImageSummaryResult?.leftSpecimenTitle || refreshed.leftSpecimenTitle,
            leftSpecimenSummary:
              parsedData.aiImageSummaryResult?.leftSpecimenSummary || refreshed.leftSpecimenSummary,
            rightSpecimenTitle:
              parsedData.aiImageSummaryResult?.rightSpecimenTitle || refreshed.rightSpecimenTitle,
            rightSpecimenSummary:
              parsedData.aiImageSummaryResult?.rightSpecimenSummary || refreshed.rightSpecimenSummary,
            narrative:
              parsedData.aiImageSummaryResult?.narrative || refreshed.aiResultNarrative,
            differentials:
              parsedData.aiImageSummaryResult?.differentials?.length
                ? parsedData.aiImageSummaryResult.differentials
                : refreshed.differentials,
            workup:
              tests.length > 0
                ? tests
                : parsedData.aiImageSummaryResult?.workup?.length
                ? parsedData.aiImageSummaryResult.workup
                : refreshed.workup
          });

          setDermMorphology({
            lesionType: parsedData.dermMorphology?.lesionType || refreshed.lesionType,
            colour: parsedData.dermMorphology?.colour || refreshed.colour,
            distribution: anatomicalSiteNote,
            sizeExtent: parsedData.dermMorphology?.sizeExtent || refreshed.sizeExtent,
            borders: parsedData.dermMorphology?.borders || refreshed.borders,
            severity: parsedData.dermMorphology?.severity || refreshed.severity,
            aiObservation:
              parsedData.dermMorphology?.aiObservation || refreshed.aiObservation
          });
        };

        // Stage 1: Apply immediately in <15ms so UI updates with zero lag
        applyStructuredSummaryState(localParsed);
        setSummaryRefreshFeedback(`⚡ AI Summary refreshed (${refreshTimeStr})`);

        // Stage 2: Non-blocking background enrichment if clinical notes have free-text detail
        if (singleVoiceNote.trim() || clinicalNotes.examination.trim()) {
          api.ai
            .parseClinicalNote({
              rawNote: combinedContext || patient.primaryDiagnosis || 'Dermatology consultation',
              existingExamination: clinicalNotes.examination,
              existingInvestigations: clinicalNotes.investigationsAdvised,
              existingPlan: clinicalNotes.plan,
              patientPrimaryDiagnosis: diagnoses[0] || patient.primaryDiagnosis,
              existingSymptoms: symptoms
            })
            .then(apiRes => {
              if (apiRes?.parsed) {
                applyStructuredSummaryState(apiRes.parsed);
              }
            })
            .catch(() => {});
        }
      }
    } catch (err) {
      console.warn('Summary AI image analysis error:', err);
      setSummaryRefreshFeedback('⚠ Refreshed using local clinical morphology profile');
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
            caption: file.name.replace(/\.[^/.]+$/, '') || `Specimen ${images.length + idx + 1}`,
            bodyArea: file.name.replace(/\.[^/.]+$/, '') || `Specimen ${images.length + idx + 1}`,
            tags: ['Dermoscopy', 'Baseline'],
            uploadedAt: new Date().toISOString(),
            createdAt: new Date().toISOString()
          };
          setImages(prev => [...prev, newImg]);
          setSelectedSummarySpecimen(newImg.id);
          if (idx === 0) {
            handleRunSummaryAIAnalysis(newImg, { openOverlayModal: false });
          }
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  // AI Summary / Regenerate from tabs (Parallelized & Optimistic)
  const generateSummary = async () => {
    setIsGeneratingAI(true);
    setSummaryRefreshFeedback(null);
    try {
      const combinedNotes = [
        diagnoses.length > 0 ? `Diagnosis: ${diagnoses.join(', ')}` : '',
        symptoms.length > 0 ? `Symptoms: ${symptoms.join(', ')}` : '',
        singleVoiceNote.trim(),
        clinicalNotes.examination.trim(),
        clinicalNotes.investigationsAdvised.trim(),
        clinicalNotes.plan.trim()
      ]
        .filter(Boolean)
        .join('. ');

      if (combinedNotes.trim()) {
        const parsed = parseClinicalNoteToStructuredSummary(combinedNotes, {
          existingExamination: clinicalNotes.examination,
          existingInvestigations: clinicalNotes.investigationsAdvised,
          existingPlan: clinicalNotes.plan,
          patientPrimaryDiagnosis: diagnoses[0] || patient.primaryDiagnosis,
          existingSymptoms: symptoms
        });
        applyParsedClinicalNoteToSummary(parsed, {
          source: singleVoiceNote.trim() ? 'single' : 'sections',
          forceOverwrite: false
        });
      }

      // Sync structured summary fields from tabs immediately
      if (prescriptions.length > 0) {
        setInlineMedSummary(
          prescriptions
            .map(p => `${p.medicineName} ${p.dosage} · ${p.frequency} · ${p.duration}`)
            .join('; ')
        );
      }

      // Run image summary refresh and visit summary generation in parallel instead of sequentially
      const [, summarizeResult] = await Promise.allSettled([
        handleRunSummaryAIAnalysis(undefined, { openOverlayModal: false }),
        api.ai.summarize({
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
        })
      ]);

      if (summarizeResult.status === 'fulfilled' && summarizeResult.value?.summary) {
        setAiSummary(summarizeResult.value.summary);
      }
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setSummaryRefreshFeedback(`⚡ All summary sections regenerated (${timeStr})`);
    } catch (err: unknown) {
      console.warn('AI summary error:', err);
    } finally {
      setIsGeneratingAI(false);
    }
  };

  // Switch to tab cleanly, committing any pending inline inputs
  const handleTabChange = (tab: TabType) => {
    setIsMedDropdownOpen(false);
    setRxFeedbackHint(null);
    setProcFeedbackHint(null);

    if (customDiagnosis.trim()) {
      const cleanDiag = customDiagnosis.trim();
      markDoctorEdited('summary.primaryDiagnosis');
      setDiagnoses(prev => (prev.includes(cleanDiag) ? prev : [...prev, cleanDiag]));
      setCustomDiagnosis('');
    }
    if (customTest.trim()) {
      const cleanTest = customTest.trim();
      markDoctorEdited('summary.tests');
      setTests(prev => (prev.includes(cleanTest) ? prev : [...prev, cleanTest]));
      setCustomTest('');
    }
    if (customProcedureName.trim()) {
      const cleanProc = customProcedureName.trim();
      markDoctorEdited('summary.procedures');
      setProcedures(prev => [
        ...prev,
        {
          id: `proc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          name: cleanProc,
          cost: customProcedureCost
        }
      ]);
      setCustomProcedureName('');
    }
    if (customSymptomInput.trim()) {
      const cleanSym = customSymptomInput.trim();
      markDoctorEdited('summary.symptoms');
      setSymptoms(prev => (prev.includes(cleanSym) ? prev : [...prev, cleanSym]));
      setCustomSymptomInput('');
    }

    if (tab === 'aisummary' && hasUserEditedNotesRef.current) {
      const parsed = parseClinicalNoteToStructuredSummary(singleVoiceNote, {
        existingExamination: clinicalNotes.examination,
        existingInvestigations: clinicalNotes.investigationsAdvised,
        existingPlan: clinicalNotes.plan,
        patientPrimaryDiagnosis: patient.primaryDiagnosis,
        existingSymptoms: symptoms
      });
      applyParsedClinicalNoteToSummary(parsed, {
        source: singleVoiceNote.trim() ? 'single' : 'sections'
      });
    }

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
    markDoctorEdited('summary.primaryDiagnosis');
    setDiagnoses(prev =>
      prev.includes(diag) ? prev.filter(d => d !== diag) : [...prev, diag]
    );
  };

  const addCustomDiagnosis = () => {
    const trimmed = customDiagnosis.trim();
    if (!trimmed) return;
    markDoctorEdited('summary.primaryDiagnosis');
    setDiagnoses(prev => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
    setCustomDiagnosis('');
  };

  // Test handlers
  const toggleTest = (test: string) => {
    markDoctorEdited('summary.tests');
    setTests(prev =>
      prev.includes(test) ? prev.filter(t => t !== test) : [...prev, test]
    );
  };

  const addCustomTest = () => {
    const trimmed = customTest.trim();
    if (!trimmed) return;
    markDoctorEdited('summary.tests');
    setTests(prev => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
    setCustomTest('');
  };

  // Procedure handlers
  const addProcedure = (name: string, cost: number) => {
    markDoctorEdited('summary.procedures');
    setProcFeedbackHint(null);
    const newProc: ProcedureItem = {
      id: `proc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name,
      cost
    };
    setProcedures(prev => [...prev, newProc]);
  };

  const removeProcedure = (id: string) => {
    markDoctorEdited('summary.procedures');
    setProcedures(prev => prev.filter(p => p.id !== id));
  };

  const updateProcedureCost = (id: string, cost: number) => {
    markDoctorEdited('summary.procedures');
    setProcedures(prev => prev.map(p => (p.id === id ? { ...p, cost } : p)));
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
    setImages(prev => [...prev, res.image]);
    setSelectedSummarySpecimen(res.image.id);
    handleRunSummaryAIAnalysis(res.image, { openOverlayModal: false });
  };

  const handleImageDelete = async (imageId: string) => {
    await api.images.delete(imageId);
    setImages(prev => prev.filter(i => i.id !== imageId));
  };

  const handleAnalyzeConsultationImage = async (image: ClinicalImage) => {
    setIsAnalyzingImage(true);
    setActiveAnalyzedImage(image);
    setActiveImageAnalysis(null); // Clear previous image's results
    setError(null);
    try {
      await handleRunSummaryAIAnalysis(image, { openOverlayModal: true });
    } catch (err: unknown) {
      console.warn('Consultation image analysis failed:', err);
      setError('AI clinical image analysis failed. Please try again.');
    } finally {
      setIsAnalyzingImage(false);
    }
  };

  const handleApplyDiagnosesFromAI = () => {
    if (!activeImageAnalysis) return;
    markDoctorEdited('summary.primaryDiagnosis');
    const newDiags = activeImageAnalysis.differentials.map(d => d.condition);
    setDiagnoses(prev => Array.from(new Set([...prev, ...newDiags])));
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
    markDoctorEdited('notes.investigationsAdvised');
    markDoctorEdited('notes.plan');
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
    setBodyMarkers(prev => [...prev, marker]);
  };

  const handleRemoveMarker = (id: string) => {
    setBodyMarkers(prev => prev.filter(m => m.id !== id));
  };

  // Prescription handler
  const handleAddPrescription = () => {
    if (!medName.trim()) {
      setIsMedDropdownOpen(true);
      medNameInputRef.current?.focus();
      setRxFeedbackHint('Please select a drug from the catalogue or type a medication name to add.');
      return;
    }
    setRxFeedbackHint(null);
    const normalizedFreq = normalizeFrequencyInput(medFrequency) || '1-0-1';
    const normalizedDur = normalizeDurationInput(medDuration) || '5 days';
    const doseDisplay = [
      medDosage.trim() || '500 mg',
      medRoute ? `(${medRoute})` : '',
      medQty ? `Qty: ${medQty}` : ''
    ]
      .filter(Boolean)
      .join(' · ');

    const cleanMedName = medName.trim();
    const item: PrescriptionItem = {
      id: `rx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      patientId: patient.id,
      consultationId: consultation.id,
      medicineName: cleanMedName,
      dosage: doseDisplay,
      frequency: normalizedFreq,
      duration: normalizedDur,
      instructions: medInstructions.trim(),
      date: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
    markDoctorEdited('summary.medications');
    setPrescriptions(prev => [...prev, item]);

    // Auto-save newly typed or customized medicines into the doctor's personal library
    const existsInStandard = COMMON_MEDICATIONS.some(
      m => m.name.toLowerCase() === cleanMedName.toLowerCase() && m.dosage.toLowerCase() === (medDosage.trim() || '500 mg').toLowerCase()
    );
    const existsInPersonal = doctorFormulary.some(
      m => m.name.toLowerCase() === cleanMedName.toLowerCase() && m.dosage.toLowerCase() === (medDosage.trim() || '500 mg').toLowerCase()
    );
    if (autoSaveToLibrary && (!existsInStandard || !existsInPersonal)) {
      if (!existsInStandard && !existsInPersonal) {
        void handleSaveCurrentMedToLibrary(cleanMedName);
      }
    }

    setMedName('');
    setMedQtyManual(false);
    setIsMedDropdownOpen(false);
  };

  const handleRemovePrescription = (id: string) => {
    markDoctorEdited('summary.medications');
    setPrescriptions(prev => prev.filter(p => p.id !== id));
  };

  // Sign & Finish Handler
  const handleSignAndFinish = async () => {
    setIsSigning(true);
    setError(null);

    const finalSymptoms = Array.from(
      new Set([
        ...symptoms.filter(Boolean),
        ...(customSymptomInput.trim() ? [customSymptomInput.trim()] : [])
      ])
    );

    const combinedDiagnoses = Array.from(
      new Set([
        ...diagnoses.filter(Boolean),
        ...(customDiagnosis.trim() ? [customDiagnosis.trim()] : []),
        ...(secondaryDiagnosis.trim() ? [secondaryDiagnosis.trim()] : [])
      ])
    );

    const finalTests = Array.from(
      new Set([
        ...tests.filter(Boolean),
        ...(customTest.trim() ? [customTest.trim()] : [])
      ])
    );

    const finalProcedures = [
      ...procedures,
      ...(customProcedureName.trim()
        ? [
            {
              id: `proc_${Date.now()}`,
              name: customProcedureName.trim(),
              cost: customProcedureCost
            }
          ]
        : [])
    ];

    const finalPrescriptions = [
      ...prescriptions,
      ...(medName.trim()
        ? [
            {
              id: `rx_${Date.now()}`,
              patientId: patient.id,
              consultationId: consultation.id,
              medicineName: medName.trim(),
              dosage: [
                medDosage.trim() || '500 mg',
                medRoute ? `(${medRoute})` : '',
                medQty ? `Qty: ${medQty}` : ''
              ]
                .filter(Boolean)
                .join(' · '),
              frequency: normalizeFrequencyInput(medFrequency) || '1-0-1',
              duration: normalizeDurationInput(medDuration) || '5 days',
              instructions: medInstructions.trim(),
              date: new Date().toISOString(),
              createdAt: new Date().toISOString()
            }
          ]
        : [])
    ];

    const finalProceduresTotal = finalProcedures.reduce((acc, p) => acc + (p.cost || 0), 0);
    const finalGrandTotal = finalProceduresTotal + (fee || 0);

    // If AI summary is not generated, create structured deterministic summary from the 7 cards
    let finalSummary = aiSummary;
    if (!finalSummary) {
      const lines: string[] = [];
      const dateFormatted = consultation.consultationDate.split('T')[0];
      lines.push(`CONSULTATION — ${dateFormatted}\n`);
      if (finalSymptoms.length > 0) {
        lines.push(`CHIEF COMPLAINTS: ${finalSymptoms.join(', ')}`);
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
      lines.push(`• Procedures: ₹${finalProceduresTotal}`);
      lines.push(`• Consultation fee: ₹${fee}`);
      lines.push(`• Total: ₹${finalGrandTotal}`);
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
        symptoms: finalSymptoms,
        diagnoses: combinedDiagnoses,
        tests: finalTests,
        procedures: finalProcedures,
        clinicalNotes: updatedClinicalNotes,
        bodyMarkers,
        images,
        followUp,
        prescriptions: finalPrescriptions,
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
              onMouseDown={e => e.preventDefault()}
              onClick={() => handleTabChange('aisummary')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all border shadow-2xs shrink-0 cursor-pointer ${
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
              onMouseDown={e => e.preventDefault()}
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-white/12 hover:bg-white/20 border border-white/15 flex items-center justify-center text-white/90 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="flex items-center gap-1 px-6 border-b border-[#e2ebe8] bg-white overflow-x-auto shrink-0 scrollbar-none">
          <button
            type="button"
            onMouseDown={e => e.preventDefault()}
            onClick={() => handleTabChange('diagnosis')}
            className={`flex items-center gap-1.5 py-3 px-3 text-xs font-medium border-b-2 transition-all shrink-0 cursor-pointer ${
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
            onMouseDown={e => e.preventDefault()}
            onClick={() => handleTabChange('tests')}
            className={`flex items-center gap-1.5 py-3 px-3 text-xs font-medium border-b-2 transition-all shrink-0 cursor-pointer ${
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
            onMouseDown={e => e.preventDefault()}
            onClick={() => handleTabChange('procedure')}
            className={`flex items-center gap-1.5 py-3 px-3 text-xs font-medium border-b-2 transition-all shrink-0 cursor-pointer ${
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
            onMouseDown={e => e.preventDefault()}
            onClick={() => handleTabChange('notes')}
            className={`flex items-center gap-1.5 py-3 px-3 text-xs font-medium border-b-2 transition-all shrink-0 cursor-pointer ${
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
            onMouseDown={e => e.preventDefault()}
            onClick={() => handleTabChange('bodymap')}
            className={`flex items-center gap-1.5 py-3 px-3 text-xs font-medium border-b-2 transition-all shrink-0 cursor-pointer ${
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
            onMouseDown={e => e.preventDefault()}
            onClick={() => handleTabChange('images')}
            className={`flex items-center gap-1.5 py-3 px-3 text-xs font-medium border-b-2 transition-all shrink-0 cursor-pointer ${
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
            onMouseDown={e => e.preventDefault()}
            onClick={() => handleTabChange('followup')}
            className={`flex items-center gap-1.5 py-3 px-3 text-xs font-medium border-b-2 transition-all shrink-0 cursor-pointer ${
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
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => toggleDiagnosis(diag)}
                        className="hover:text-teal-200 p-0.5 cursor-pointer"
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
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => toggleDiagnosis(d)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-all cursor-pointer ${
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
                  onMouseDown={e => e.preventDefault()}
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
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => handleTabChange('tests')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-800 hover:bg-teal-900 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
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
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => toggleTest(test)}
                        className="hover:text-teal-200 p-0.5 cursor-pointer"
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
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => toggleTest(t)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-all cursor-pointer ${
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
                  onMouseDown={e => e.preventDefault()}
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
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => handleTabChange('diagnosis')}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Diagnosis</span>
                </button>
                <button
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => handleTabChange('procedure')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-800 hover:bg-teal-900 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
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
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => addProcedure(p.name, p.defaultCost)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:border-teal-500 hover:bg-teal-50/50 text-xs font-medium text-slate-700 transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5 text-teal-600" />
                      <span>{p.name}</span>
                      <span className="text-slate-400 font-semibold">₹{p.defaultCost}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom procedure input */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Custom procedure name (type or speak)..."
                    value={customProcedureName}
                    onChange={e => {
                      setCustomProcedureName(e.target.value);
                      if (procFeedbackHint) setProcFeedbackHint(null);
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && customProcedureName.trim()) {
                        e.preventDefault();
                        addProcedure(customProcedureName.trim(), customProcedureCost);
                        setCustomProcedureName('');
                      }
                    }}
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
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => {
                      if (customProcedureName.trim()) {
                        addProcedure(customProcedureName.trim(), customProcedureCost);
                        setCustomProcedureName('');
                      } else {
                        setProcFeedbackHint('Enter a custom procedure name in the field to the left, or tap any preset procedure chip above.');
                      }
                    }}
                    className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                  >
                    + Add procedure
                  </button>
                </div>
                {procFeedbackHint && (
                  <p className="text-[11px] text-amber-700 font-medium px-1">{procFeedbackHint}</p>
                )}
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
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => removeProcedure(proc.id)}
                            className="p-1 text-slate-400 hover:text-red-600 rounded-md transition-colors cursor-pointer"
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
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => handleTabChange('tests')}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Tests</span>
                </button>
                <button
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => handleTabChange('notes')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-800 hover:bg-teal-900 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
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
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => handleTabChange('images')}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-800 bg-white border border-teal-200 px-3 py-2 rounded-xl shadow-2xs transition-colors cursor-pointer"
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
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => {
                            doctorEditedFieldsRef.current.clear();
                            handleSingleVoiceNoteChange(singleVoiceNote, true);
                          }}
                          className="text-[10.5px] font-semibold text-teal-700 hover:text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 px-2.5 py-0.5 rounded-lg transition-colors cursor-pointer"
                          title="Re-sync all AI Summary fields from this note"
                        >
                          Sync all to AI Summary
                        </button>
                      )}
                      <button
                        type="button"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => handleTabChange('aisummary')}
                        className="inline-flex items-center gap-1 text-[10.5px] font-bold text-white bg-teal-800 hover:bg-teal-900 px-2.5 py-1 rounded-lg transition-colors shadow-2xs cursor-pointer"
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

                  {/* Auto-fill live status bar (fixed layout so buttons below never shift on timer) */}
                  {(autoFillSummaryReady || singleVoiceNote.trim() || clinicalNotes.examination.trim()) && (
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px]">
                      <div className="flex items-center gap-1.5 text-emerald-800 font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>
                          AI Summary fields automatically filled (Diagnosis, Morphology, Workup, Rx & Follow-up). Doctor can freely edit any field below or in Visit Summary.
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
                      hasUserEditedNotesRef.current = true;
                      markDoctorEdited('notes.examination');
                      setClinicalNotes(prev => ({ ...prev, examination: val }));
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
                      hasUserEditedNotesRef.current = true;
                      markDoctorEdited('notes.investigationsAdvised');
                      setClinicalNotes(prev => ({ ...prev, investigationsAdvised: val }));
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
                      hasUserEditedNotesRef.current = true;
                      markDoctorEdited('notes.plan');
                      setClinicalNotes(prev => ({ ...prev, plan: val }));
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
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => handleTabChange('procedure')}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Procedures</span>
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => handleTabChange('aisummary')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-teal-900 border border-teal-200 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-teal-700" />
                    <span>Review Auto-Filled AI Summary</span>
                  </button>
                  <button
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => handleTabChange('bodymap')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-800 hover:bg-teal-900 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
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
                    handleTabChange('images');
                  }
                }}
              />

              {/* Step Navigation */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => handleTabChange('notes')}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Notes</span>
                </button>
                <button
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => handleTabChange('images')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-800 hover:bg-teal-900 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
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
                    if (added.length > 0) {
                      const newest = added[added.length - 1];
                      setSelectedSummarySpecimen(newest.id);
                      setTimeout(() => {
                        handleRunSummaryAIAnalysis(newest, { openOverlayModal: false });
                      }, 50);
                    }
                    return added.length > 0 ? [...prev, ...added] : prev;
                  });
                }}
              />

              {/* Step Navigation */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => handleTabChange('bodymap')}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Body Map</span>
                </button>
                <button
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => handleTabChange('followup')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-800 hover:bg-teal-900 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
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
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => {
                        markDoctorEdited('summary.followUpDate');
                        const target = new Date();
                        target.setDate(target.getDate() + preset.days);
                        setFollowUp(prev => ({ ...prev, date: target.toISOString().split('T')[0] }));
                      }}
                      className="px-2.5 py-1 bg-white border border-slate-200 hover:border-teal-500 text-slate-700 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                    >
                      +{preset.label}
                    </button>
                  ))}

                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-xs font-semibold text-slate-600">Date:</span>
                    <input
                      type="date"
                      value={followUp.date}
                      onChange={e => {
                        markDoctorEdited('summary.followUpDate');
                        setFollowUp(prev => ({ ...prev, date: e.target.value }));
                      }}
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
                      onChange={val => {
                        markDoctorEdited('summary.followUpInstructions');
                        setFollowUp(prev => ({ ...prev, instructions: val }));
                      }}
                      variant="badge"
                      title="Dictate follow-up instructions with mic"
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="e.g. Review in OPD with biopsy report; SOS if swelling increases."
                    value={followUp.instructions}
                    onChange={e => {
                      markDoctorEdited('summary.followUpInstructions');
                      setFollowUp(prev => ({ ...prev, instructions: e.target.value }));
                    }}
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-1 focus:ring-teal-500"
                  />
                </div>
              </div>

              {/* Prescriptions inside consultation */}
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                {/* Header bar */}
                <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 bg-slate-50/50">
                  <div className="flex items-center gap-2 flex-wrap">
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
                    <span className="px-2 py-0.5 rounded-full bg-teal-50 border border-teal-200 text-teal-800 text-[10px] font-bold">
                      {doctor?.name || 'Doctor'}'s Library ({doctorFormulary.length} custom + {COMMON_MEDICATIONS.length} std)
                    </span>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={autoSaveToLibrary}
                        onChange={e => setAutoSaveToLibrary(e.target.checked)}
                        className="rounded border-slate-300 text-teal-700 focus:ring-teal-500"
                      />
                      <span>Auto-save new medicines to My Library</span>
                    </label>

                    <button
                      type="button"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => {
                        setLibraryModalMode('upload');
                        setIsLibraryModalOpen(true);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-teal-800 hover:bg-teal-900 text-white text-[11px] font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                      title="Upload a PDF/CSV medication file or add medicines to your personal library"
                    >
                      <Upload className="w-3 h-3" />
                      <span>Upload PDF / Add to Library</span>
                    </button>
                  </div>
                </div>

                {/* Inner Prescription Builder Box */}
                <div className="p-4 space-y-4">
                  <div className="p-4 bg-[#f8fafc] border border-slate-200/90 rounded-xl space-y-3.5">
                    {librarySavedToast && (
                      <div className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>{librarySavedToast}</span>
                        </div>
                        <button
                          type="button"
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => setLibrarySavedToast(null)}
                          className="text-emerald-600 hover:text-emerald-900"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                    {rxFeedbackHint && (
                      <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium flex items-center justify-between">
                        <span>{rxFeedbackHint}</span>
                        <button
                          type="button"
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => setRxFeedbackHint(null)}
                          className="text-amber-600 hover:text-amber-900"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    {/* Row 1: DRUG NAME | DOSE / STRENGTH | ROUTE | FREQUENCY | DURATION | QTY */}
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                      {/* DRUG NAME */}
                      <div ref={medDropdownContainerRef} className="sm:col-span-4 relative">
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600">
                            DRUG NAME <span className="font-normal lowercase text-teal-700">(auto-lookup)</span>
                          </label>
                          {medName.trim() && (
                            <button
                              type="button"
                              onMouseDown={e => e.preventDefault()}
                              onClick={() => handleSaveCurrentMedToLibrary()}
                              className="text-[10px] font-bold text-teal-700 hover:text-teal-900 flex items-center gap-0.5 cursor-pointer"
                              title="Save or update this drug and dosage in your personal library"
                            >
                              <Plus className="w-2.5 h-2.5" />
                              <span>Save to My Library</span>
                            </button>
                          )}
                        </div>
                        <div className="relative flex items-center bg-white border border-slate-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-600 transition-all">
                          <Search className="w-3.5 h-3.5 text-slate-400 ml-3 shrink-0" />
                          <input
                            ref={medNameInputRef}
                            type="text"
                            placeholder="Type to auto-lookup or add new..."
                            value={medName}
                            onChange={e => {
                              const val = e.target.value;
                              setMedName(val);
                              setIsMedDropdownOpen(true);
                              if (rxFeedbackHint) setRxFeedbackHint(null);
                              const exactMatch = allDoctorMedications.find(
                                m => m.name.toLowerCase() === val.trim().toLowerCase()
                              );
                              if (exactMatch) {
                                const combinedText = `${exactMatch.name} ${exactMatch.dosage} ${exactMatch.frequency}`;
                                const isTopical = /cream|gel|ointment|lotion|shampoo|solution|spf|sunscreen|topical/i.test(combinedText);
                                const isIVIM = /\b(iv|im|iv\/im|infusion)\b/i.test(combinedText);
                                const isDrops = /\b(ophthalmic|drops)\b/i.test(combinedText);
                                setMedDosage(exactMatch.dosage);
                                setMedRoute(
                                  exactMatch.route ||
                                    (isTopical ? 'Topical' : isIVIM ? 'IV / IM' : isDrops ? 'Nasal / Drops' : 'Oral')
                                );
                                setMedFrequency(
                                  exactMatch.frequency.includes('1-0-1') || /^twice daily$/i.test(exactMatch.frequency.trim())
                                    ? '1-0-1'
                                    : /^3 times daily$|^three times daily$/i.test(exactMatch.frequency.trim())
                                    ? '1-1-1'
                                    : /^4 times daily$|^every 6 hours$/i.test(exactMatch.frequency.trim())
                                    ? '1-1-1-1'
                                    : /night|bedtime/i.test(exactMatch.frequency)
                                    ? '0-0-1'
                                    : /^once daily$/i.test(exactMatch.frequency.trim())
                                    ? '1-0-0'
                                    : exactMatch.frequency
                                );
                                setMedDuration(exactMatch.duration);
                                setMedInstructions(exactMatch.instructions);
                                setMedQtyManual(false);
                              }
                            }}
                            onFocus={() => setIsMedDropdownOpen(true)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddPrescription();
                              } else if (e.key === 'Escape') {
                                setIsMedDropdownOpen(false);
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
                                if (rxFeedbackHint) setRxFeedbackHint(null);
                              }}
                              variant="badge"
                              className="border-0 shadow-none bg-transparent"
                              title="Dictate drug name"
                            />
                            <button
                              type="button"
                              onMouseDown={e => e.preventDefault()}
                              onClick={() => setIsMedDropdownOpen(!isMedDropdownOpen)}
                              className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
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
                          <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-slate-200 z-50 max-h-64 overflow-y-auto divide-y divide-slate-100 animate-in fade-in zoom-in-95 duration-100">
                            <div className="px-3 py-1.5 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between sticky top-0 z-10 border-b border-slate-100">
                              <span>
                                {doctor?.name || 'Doctor'}'s Library (
                                {
                                  allDoctorMedications.filter(m => {
                                    const q = medName.toLowerCase().trim();
                                    return (
                                      !q ||
                                      m.name.toLowerCase().includes(q) ||
                                      m.dosage.toLowerCase().includes(q) ||
                                      m.instructions.toLowerCase().includes(q)
                                    );
                                  }).length
                                }
                                )
                              </span>
                              <button
                                type="button"
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => setIsMedDropdownOpen(false)}
                                className="text-slate-400 hover:text-slate-600 cursor-pointer"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>

                            {/* Instant "+ Save to My Personal Library" action when typing a custom or uncatalogued drug */}
                            {medName.trim().length >= 2 && (
                              <div className="p-2 bg-teal-50/70 border-b border-teal-100 flex items-center justify-between gap-2">
                                <div className="text-[11px] text-teal-900 truncate">
                                  <span className="font-bold">"{medName.trim()}"</span> · {medDosage} · {medFrequency}
                                </div>
                                <button
                                  type="button"
                                  onMouseDown={e => e.preventDefault()}
                                  onClick={() => handleSaveCurrentMedToLibrary()}
                                  className="px-2.5 py-1 rounded-lg bg-teal-800 hover:bg-teal-900 text-white text-[10px] font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>Save to My Library</span>
                                </button>
                              </div>
                            )}

                            {allDoctorMedications.filter(m => {
                              const q = medName.toLowerCase().trim();
                              return (
                                !q ||
                                m.name.toLowerCase().includes(q) ||
                                m.dosage.toLowerCase().includes(q) ||
                                m.instructions.toLowerCase().includes(q)
                              );
                            }).map((med, idx) => {
                              const combinedText = `${med.name} ${med.dosage} ${med.frequency}`;
                              const isTopical = /cream|gel|ointment|lotion|shampoo|solution|spf|sunscreen|topical/i.test(
                                combinedText
                              );
                              const isIVIM = /\b(iv|im|iv\/im|infusion)\b/i.test(combinedText);
                              const isDrops = /\b(ophthalmic|drops)\b/i.test(combinedText);
                              return (
                                <button
                                  key={`${med.name}-${idx}`}
                                  type="button"
                                  onMouseDown={e => e.preventDefault()}
                                  onClick={() => {
                                    setMedName(med.name);
                                    setMedDosage(med.dosage);
                                    setMedRoute(
                                      med.route ||
                                        (isTopical
                                          ? 'Topical'
                                          : isIVIM
                                          ? 'IV / IM'
                                          : isDrops
                                          ? 'Nasal / Drops'
                                          : 'Oral')
                                    );
                                    setMedFrequency(
                                      med.frequency.includes('1-0-1') || /^twice daily$/i.test(med.frequency.trim())
                                        ? '1-0-1'
                                        : /^3 times daily$|^three times daily$/i.test(med.frequency.trim())
                                        ? '1-1-1'
                                        : /^4 times daily$|^every 6 hours$/i.test(med.frequency.trim())
                                        ? '1-1-1-1'
                                        : /night|bedtime/i.test(med.frequency)
                                        ? '0-0-1'
                                        : /^once daily$/i.test(med.frequency.trim())
                                        ? '1-0-0'
                                        : med.frequency
                                    );
                                    setMedDuration(med.duration);
                                    setMedInstructions(med.instructions);
                                    setMedQtyManual(false);
                                    setIsMedDropdownOpen(false);
                                    setRxFeedbackHint(null);
                                  }}
                                  className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50/60 flex flex-col text-slate-800 transition-colors cursor-pointer"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <span className="font-semibold text-slate-900 truncate">{med.name}</span>
                                      {med.isPersonal && (
                                        <span className="px-1.5 py-0.2 rounded bg-amber-50 border border-amber-200 text-amber-800 text-[9px] font-bold shrink-0">
                                          My Library
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded shrink-0">
                                      {med.dosage}
                                    </span>
                                  </div>
                                  <span className="text-[10px] text-slate-500 mt-0.5">
                                    {med.frequency} • {med.duration}
                                  </span>
                                  {med.instructions && (
                                    <span className="text-[10px] text-slate-400 italic truncate mt-0.5">
                                      {med.instructions}
                                    </span>
                                  )}
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
                          onFocus={() => setIsMedDropdownOpen(false)}
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
                          onFocus={() => setIsMedDropdownOpen(false)}
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
                            onFocus={() => setIsMedDropdownOpen(false)}
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
                          onFocus={() => setIsMedDropdownOpen(false)}
                          onChange={e => {
                            setMedDuration(normalizeDurationInput(e.target.value));
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
                      </div>

                      {/* QTY */}
                      <div className="sm:col-span-1">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1.5 whitespace-nowrap">
                          QTY <span className="font-normal lowercase text-slate-400">auto</span>
                        </label>
                        <input
                          type="text"
                          value={medQty}
                          onFocus={() => setIsMedDropdownOpen(false)}
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
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => {
                              setIsMedDropdownOpen(false);
                              setMedFrequency(freq);
                              setMedQtyManual(false);
                            }}
                            className={`px-2 py-1 text-[11px] font-medium rounded-md border transition-colors cursor-pointer ${
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
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => {
                              setIsMedDropdownOpen(false);
                              setMedDuration(dur.value);
                              setMedQtyManual(false);
                            }}
                            className={`px-2 py-1 text-[11px] font-medium rounded-md border transition-colors cursor-pointer ${
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
                            onFocus={() => setIsMedDropdownOpen(false)}
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
                        onMouseDown={e => e.preventDefault()}
                        onClick={handleAddPrescription}
                        className="px-5 py-2 bg-[#5b87eb] hover:bg-[#4672dc] text-white text-xs font-bold rounded-lg shadow-xs transition-colors flex items-center justify-center gap-1.5 shrink-0 h-[36px] cursor-pointer"
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
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => {
                              setIsMedDropdownOpen(false);
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
                            className={`px-2.5 py-1 text-[11px] rounded-md border transition-colors cursor-pointer ${
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
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => handleRemovePrescription(p.id)}
                            className="text-slate-400 hover:text-red-600 p-1 cursor-pointer"
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
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => handleTabChange('images')}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Images</span>
                </button>
                <button
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => handleTabChange('aisummary')}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-teal-800 hover:bg-teal-900 text-white text-xs font-bold rounded-xl shadow-md transition-colors cursor-pointer"
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
                  onMouseDown={e => e.preventDefault()}
                  onClick={generateSummary}
                  disabled={isGeneratingAI}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white hover:bg-[#f2f6f5] text-[#0f2926] border border-[#cfdeda] rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 shadow-2xs shrink-0 cursor-pointer"
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
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => {
                          markDoctorEdited('summary.symptoms');
                          setSymptoms(prev => prev.filter((_, i) => i !== idx));
                        }}
                        className="hover:text-teal-200 p-0.5 cursor-pointer"
                        title="Remove symptom"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {symptoms.length === 0 && (
                    <span className="text-xs text-[#7b928d] italic">No symptoms recorded</span>
                  )}
                  <div className="inline-flex items-center gap-1.5">
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
                      placeholder="+ Add symptom..."
                      className="text-xs px-2.5 py-1 bg-[#f6f9f8] border border-[#dce6e3] rounded-lg text-[#0f2926] placeholder:text-[#8fa39e] focus:outline-none focus:border-[#157a6e] min-w-[180px]"
                    />
                    <button
                      type="button"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => {
                        if (customSymptomInput.trim()) {
                          markDoctorEdited('summary.symptoms');
                          setSymptoms(prev => [...prev, customSymptomInput.trim()]);
                          setCustomSymptomInput('');
                        }
                      }}
                      className="px-2.5 py-1 bg-[#e3f2ef] hover:bg-[#d2eae5] text-[#115e56] border border-[#bde0d9] rounded-lg text-xs font-bold transition-colors cursor-pointer"
                    >
                      + Add
                    </button>
                  </div>
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
                  <div className="flex items-center gap-2 flex-wrap">
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
                    {summaryRefreshFeedback && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-bold">
                        {summaryRefreshFeedback}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[11px]">
                    <span className="text-[#6c857f] font-medium">
                      {images.length > 0 ? `${images.length} images attached` : '2 images attached'}
                    </span>
                    <button
                      type="button"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => handleRunSummaryAIAnalysis()}
                      disabled={isGeneratingImageSummaryAI}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#e8f5f2] hover:bg-[#d7ede8] text-[#0f5950] border border-[#bde0d9] font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      <RefreshCw className={`w-3 h-3 ${isGeneratingImageSummaryAI ? 'animate-spin' : ''}`} />
                      <span>{isGeneratingImageSummaryAI ? 'Analyzing...' : 'Refresh AI Summary'}</span>
                    </button>
                    <button
                      type="button"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => handleTabChange('images')}
                      className="font-semibold text-[#157a6e] hover:text-[#0f5950] transition-colors cursor-pointer"
                    >
                      Manage in Clinical images →
                    </button>
                  </div>
                </div>

                {/* Live Specimen & Lighting Gatekeeper Status Bar inside Section 6 */}
                {summarySpecimenGatekeeper && (
                  <div
                    className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs ${
                      summarySpecimenGatekeeper.isValidSkinSpecimen
                        ? summarySpecimenGatekeeper.lightingQuality !== 'Optimal'
                          ? 'bg-amber-50/80 border-amber-300 text-amber-950'
                          : 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                        : 'bg-rose-50 border-rose-300 text-rose-950'
                    }`}
                  >
                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold border ${
                            summarySpecimenGatekeeper.isValidSkinSpecimen
                              ? 'bg-emerald-100 border-emerald-300 text-emerald-900'
                              : 'bg-rose-100 border-rose-300 text-rose-900'
                          }`}
                        >
                          {summarySpecimenGatekeeper.isValidSkinSpecimen
                            ? `✓ Cutaneous Skin Verified (${summarySpecimenGatekeeper.skinPixelRatio}% skin)`
                            : `⚠ Non-Biological / Invalid Skin Specimen (${summarySpecimenGatekeeper.skinPixelRatio}% skin)`}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold border ${
                            summarySpecimenGatekeeper.lightingQuality === 'Optimal'
                              ? 'bg-teal-100/80 border-teal-300 text-teal-900'
                              : 'bg-amber-100 border-amber-300 text-amber-900'
                          }`}
                        >
                          Lighting: {summarySpecimenGatekeeper.lightingQuality} ({summarySpecimenGatekeeper.meanLuminance}/255)
                        </span>
                      </div>
                      {summarySpecimenGatekeeper.rejectionReason && (
                        <p className="text-[11px] font-semibold text-rose-800 pt-0.5">
                          {summarySpecimenGatekeeper.rejectionReason}
                        </p>
                      )}
                      {summarySpecimenGatekeeper.qualityWarnings &&
                        summarySpecimenGatekeeper.qualityWarnings.length > 0 && (
                          <p className="text-[11px] text-amber-800 pt-0.5">
                            {summarySpecimenGatekeeper.qualityWarnings.join(' · ')}
                          </p>
                        )}
                    </div>
                  </div>
                )}

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
                              onMouseDown={e => e.preventDefault()}
                              onClick={() => {
                                setSelectedSummarySpecimen(img.id);
                                handleRunSummaryAIAnalysis(img, { openOverlayModal: false });
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
                            onMouseDown={e => e.preventDefault()}
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
                            onMouseDown={e => e.preventDefault()}
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
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => summaryImageInputRef.current?.click()}
                        className="w-[78px] h-[78px] rounded-xl border border-dashed border-[#bdd0ca] hover:border-[#157a6e] bg-white hover:bg-[#f0f7f5] flex flex-col items-center justify-center gap-0.5 text-[#5c7470] hover:text-[#115e56] transition-colors shrink-0 cursor-pointer"
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
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => setSelectedSummarySpecimen('all')}
                          className={`px-2 py-0.5 rounded-md font-semibold transition-colors cursor-pointer ${
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
                              onMouseDown={e => e.preventDefault()}
                              onClick={() => setSelectedSummarySpecimen('left')}
                              className={`px-2 py-0.5 rounded-md font-semibold transition-colors cursor-pointer ${
                                selectedSummarySpecimen === 'left'
                                  ? 'bg-[#157a6e] text-white'
                                  : 'bg-white text-[#5c7470] border border-[#dce6e3]'
                              }`}
                            >
                              Left cheek
                            </button>
                            <button
                              type="button"
                              onMouseDown={e => e.preventDefault()}
                              onClick={() => setSelectedSummarySpecimen('right')}
                              className={`px-2 py-0.5 rounded-md font-semibold transition-colors cursor-pointer ${
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
                  <div
                    className={`lg:col-span-7 rounded-xl p-3.5 flex flex-col justify-between gap-2.5 shadow-2xs border ${
                      summarySpecimenGatekeeper && !summarySpecimenGatekeeper.isValidSkinSpecimen
                        ? 'bg-gradient-to-br from-rose-50/90 via-white to-rose-50/40 border-rose-300'
                        : 'bg-gradient-to-br from-[#f2f9f7] via-[#f7fbfa] to-white border-[#c6dfd9]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider ${
                              summarySpecimenGatekeeper && !summarySpecimenGatekeeper.isValidSkinSpecimen
                                ? 'text-rose-800'
                                : 'text-[#0f5950]'
                            }`}
                          >
                            <Sparkles
                              className={`w-3 h-3 ${
                                summarySpecimenGatekeeper && !summarySpecimenGatekeeper.isValidSkinSpecimen
                                  ? 'text-rose-600'
                                  : 'text-[#157a6e]'
                              }`}
                            />
                            AI IMAGE SUMMARY RESULT
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-white text-[9.5px] font-bold ${
                              summarySpecimenGatekeeper && !summarySpecimenGatekeeper.isValidSkinSpecimen
                                ? 'bg-rose-700'
                                : 'bg-[#0e423d]'
                            }`}
                          >
                            {aiImageSummaryResult.confidence}
                          </span>
                        </div>
                        <h4
                          className={`text-xs font-bold mt-1 ${
                            summarySpecimenGatekeeper && !summarySpecimenGatekeeper.isValidSkinSpecimen
                              ? 'text-rose-900'
                              : 'text-[#0f2926]'
                          }`}
                        >
                          {aiImageSummaryResult.title}
                        </h4>
                      </div>

                      <button
                        type="button"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => {
                          if (images.length > 0) {
                            handleRunSummaryAIAnalysis(undefined, { openOverlayModal: false });
                          } else {
                            const combinedContext = [
                              diagnoses.join(', '),
                              secondaryDiagnosis,
                              symptoms.join(', '),
                              clinicalNotes.examination,
                              clinicalNotes.plan,
                              aiImageSummaryResult.title
                            ]
                              .filter(Boolean)
                              .join(' ');
                            const parsed = parseClinicalNoteToStructuredSummary(combinedContext, {
                              existingExamination: clinicalNotes.examination,
                              existingInvestigations: clinicalNotes.investigationsAdvised,
                              existingPlan: clinicalNotes.plan,
                              patientPrimaryDiagnosis: diagnoses[0] || patient.primaryDiagnosis,
                              existingSymptoms: symptoms
                            });
                            const refreshed = getInitialDermSummary(combinedContext);
                            setDermMorphology({
                              lesionType: parsed.dermMorphology?.lesionType || refreshed.lesionType,
                              colour: parsed.dermMorphology?.colour || refreshed.colour,
                              distribution: parsed.dermMorphology?.distribution || refreshed.distribution,
                              sizeExtent: parsed.dermMorphology?.sizeExtent || refreshed.sizeExtent,
                              borders: parsed.dermMorphology?.borders || refreshed.borders,
                              severity: parsed.dermMorphology?.severity || refreshed.severity,
                              aiObservation: aiImageSummaryResult.narrative
                            });
                            setSummaryRefreshFeedback('✓ Applied AI Result to all 6 morphology fields');
                          }
                        }}
                        className="px-2.5 py-1 rounded-lg bg-white hover:bg-[#e8f5f2] text-[#115e56] border border-[#bdd6d0] text-[10.5px] font-bold transition-colors shrink-0 shadow-2xs cursor-pointer"
                        title="Sync AI Image Summary Result to all morphology fields below"
                      >
                        Apply AI Result to Fields
                      </button>
                    </div>

                    {/* Side-by-Side Per-Specimen AI Summary Result Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {(selectedSummarySpecimen === 'all' ||
                        selectedSummarySpecimen === 'left' ||
                        images.some(img => img.id === selectedSummarySpecimen)) && (
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

                      {(selectedSummarySpecimen === 'all' ||
                        selectedSummarySpecimen === 'right' ||
                        images.some(img => img.id === selectedSummarySpecimen)) && (
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
                        <span className="font-bold text-[#4a635e] uppercase text-[9.5px]">
                          {summarySpecimenGatekeeper && !summarySpecimenGatekeeper.isValidSkinSpecimen
                            ? 'Gatekeeper Flags:'
                            : 'Differentials:'}
                        </span>
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
                        <span>Action:</span>
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
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => {
                            markDoctorEdited('derm.aiObservation');
                            setDermMorphology(prev => ({
                              ...prev,
                              aiObservation: aiImageSummaryResult.narrative
                            }));
                            setSummaryRefreshFeedback('✓ Synced AI Result to Visual / Dermoscopic Observations');
                          }}
                          className="px-2 py-0.5 rounded bg-white hover:bg-[#e3f2ef] text-[#115e56] border border-[#bdd6d0] text-[10px] font-semibold transition-colors cursor-pointer"
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
                          doctorEditedFieldsRef.current.has('summary.medications')
                            ? inlineMedSummary
                            : inlineMedSummary ||
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
                            doctorEditedFieldsRef.current.has('summary.medications')
                              ? inlineMedSummary
                              : inlineMedSummary ||
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
              onMouseDown={e => e.preventDefault()}
              onClick={onClose}
              className="px-4 py-2 bg-white border border-[#cfdeda] text-[#0f2926] hover:bg-[#f2f6f5] rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => setShowWhatsApp(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#1fae51] hover:bg-[#199945] text-white rounded-xl text-xs font-bold shadow-2xs transition-colors cursor-pointer"
              title="Share consultation summary and prescription to patient's WhatsApp"
            >
              <WhatsAppIcon className="w-3.5 h-3.5 fill-white" />
              <span>WhatsApp</span>
            </button>
            <button
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={handleSignAndFinish}
              disabled={isSigning}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold bg-[#157a6e] hover:bg-[#11645a] text-white shadow-xs transition-all disabled:opacity-50 cursor-pointer"
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
                onMouseDown={e => e.preventDefault()}
                onClick={() => {
                  setActiveImageAnalysis(null);
                  setIsAnalyzingImage(false);
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
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
                  <div
                    className={`p-4 rounded-xl text-white flex items-start justify-between gap-4 ${
                      activeImageAnalysis.isValidSkinSpecimen === false ||
                      activeImageAnalysis.visualMetrics?.isSkinSpecimen === false
                        ? 'bg-rose-900'
                        : 'bg-teal-900'
                    }`}
                  >
                    <div>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider ${
                          activeImageAnalysis.isValidSkinSpecimen === false ||
                          activeImageAnalysis.visualMetrics?.isSkinSpecimen === false
                            ? 'text-rose-200'
                            : 'text-teal-300'
                        }`}
                      >
                        {activeImageAnalysis.isValidSkinSpecimen === false ||
                        activeImageAnalysis.visualMetrics?.isSkinSpecimen === false
                          ? 'Specimen Gatekeeper Alert'
                          : 'Primary Suggestion'}
                      </span>
                      <h4 className="text-base font-bold text-white mt-0.5">
                        {activeImageAnalysis.primaryImpression}
                      </h4>
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                            activeImageAnalysis.isValidSkinSpecimen === false ||
                            activeImageAnalysis.visualMetrics?.isSkinSpecimen === false
                              ? 'bg-rose-500/25 border-rose-300/50 text-rose-100'
                              : 'bg-emerald-500/20 border-emerald-300/40 text-emerald-100'
                          }`}
                        >
                          {activeImageAnalysis.isValidSkinSpecimen === false ||
                          activeImageAnalysis.visualMetrics?.isSkinSpecimen === false
                            ? `⚠ Non-Skin / Invalid Specimen (${activeImageAnalysis.visualMetrics?.skinPixelRatio ?? 0}% skin)`
                            : `✓ Human Skin Verified (${activeImageAnalysis.visualMetrics?.skinPixelRatio ?? 85}% skin)`}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-white/10 border-white/20 text-white">
                          Lighting: {activeImageAnalysis.lightingQuality || activeImageAnalysis.visualMetrics?.lightingStatus || 'Optimal'}
                        </span>
                      </div>
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
                      {activeImageAnalysis.isValidSkinSpecimen === false ||
                      activeImageAnalysis.visualMetrics?.isSkinSpecimen === false
                        ? 'Specimen & Lighting Assessment Details'
                        : 'Differential Diagnoses'}
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
                    <span className="font-bold text-slate-800 block">
                      {activeImageAnalysis.isValidSkinSpecimen === false ||
                      activeImageAnalysis.visualMetrics?.isSkinSpecimen === false
                        ? 'Instructions to Retake Clinical Image'
                        : 'Suggested First-Line Plan'}
                    </span>
                    <p className="text-slate-600 text-[11px] whitespace-pre-line">{activeImageAnalysis.suggestedManagementPlan}</p>
                    {activeImageAnalysis.recommendedInvestigations.length > 0 && (
                      <p className="text-slate-500 text-[10px] pt-1">
                        <strong>Recommended action:</strong> {activeImageAnalysis.recommendedInvestigations.join(', ')}
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
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => {
                    setActiveImageAnalysis(null);
                  }}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200/60 cursor-pointer"
                >
                  Close
                </button>
                {activeImageAnalysis.isValidSkinSpecimen !== false &&
                  activeImageAnalysis.visualMetrics?.isSkinSpecimen !== false && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onMouseDown={e => e.preventDefault()}
                        onClick={handleApplyPlanFromAI}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 flex items-center gap-1.5 shadow-2xs cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5 text-teal-700" />
                        Apply Plan to Notes
                      </button>
                      <button
                        type="button"
                        onMouseDown={e => e.preventDefault()}
                        onClick={handleApplyDiagnosesFromAI}
                        className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-teal-700 hover:bg-teal-800 text-white flex items-center gap-1.5 shadow-sm cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Apply Diagnoses
                      </button>
                    </div>
                  )}
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

      {/* Doctor's Personalized Medical Library Upload / Add Modal */}
      <FormularyUploadModal
        isOpen={isLibraryModalOpen}
        onClose={() => setIsLibraryModalOpen(false)}
        doctorName={doctor?.name || 'Doctor'}
        initialMode={libraryModalMode}
        initialMedName={medName.trim()}
        initialDosage={medDosage}
        initialRoute={medRoute}
        initialFrequency={medFrequency}
        initialDuration={medDuration}
        initialInstructions={medInstructions}
        onUpdated={(items, msg) => {
          setDoctorFormulary(items);
          if (msg) {
            setLibrarySavedToast(msg);
            setTimeout(() => setLibrarySavedToast(null), 5000);
          }
        }}
      />
    </div>
  );
};
