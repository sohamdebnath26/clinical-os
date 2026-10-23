import { PrescriptionItem, ProcedureItem } from '../types';

export interface ParsedClinicalNoteSummary {
  examination: string;
  investigationsAdvised: string;
  plan: string;
  symptoms: string[];
  primaryDiagnosis: string;
  secondaryDiagnosis: string;
  tests: string[];
  procedures: ProcedureItem[];
  dermMorphology: {
    lesionType: string;
    colour: string;
    distribution: string;
    sizeExtent: string;
    borders: string;
    severity: string;
    aiObservation: string;
  };
  aiImageSummaryResult: {
    title: string;
    confidence: string;
    leftSpecimenTitle: string;
    leftSpecimenSummary: string;
    rightSpecimenTitle: string;
    rightSpecimenSummary: string;
    narrative: string;
    differentials: string[];
    workup: string[];
  };
  prescriptions: PrescriptionItem[];
  inlineMedSummary: string;
  topicalsAdvice: string;
  followUp: {
    date: string;
    instructions: string;
    notes: string;
  };
  aiSummaryText: string;
}

interface ConditionProfile {
  keywords: RegExp;
  primaryDiagnosis: string;
  secondaryDiagnosis: string;
  symptoms: string[];
  tests: string[];
  lesionType: string;
  colour: string;
  distribution: string;
  sizeExtent: string;
  borders: string;
  severity: string;
  aiObservation: string;
  aiSummaryTitle: string;
  aiConfidence: string;
  leftSpecimenTitle: string;
  leftSpecimenSummary: string;
  rightSpecimenTitle: string;
  rightSpecimenSummary: string;
  aiResultNarrative: string;
  differentials: string[];
  workup: string[];
  defaultMeds: {
    medicineName: string;
    dosage: string;
    frequency: string;
    duration: string;
    instructions: string;
  }[];
  topicalsAdvice: string;
  defaultPlan: string;
  followUpInstructions: string;
  redFlagAdvice: string;
}

const CONDITION_PROFILES: ConditionProfile[] = [
  {
    keywords: /\b(acne|comedo|comedones|pimples?|pustules?|adapalene|benzoyl|isotretinoin|nodulocystic|sebaceous)\b/i,
    primaryDiagnosis: 'Acne Vulgaris (Grade II–III)',
    secondaryDiagnosis: 'Papulopustular Rosacea, Pityrosporum Folliculitis',
    symptoms: ['Facial papules & comedones', 'Inflammatory acne breakout'],
    tests: ['Dermoscopy', "Wood's Lamp Examination"],
    lesionType: 'Inflammatory papules, pustules & open/closed comedones',
    colour: 'Erythematous with post-inflammatory hyperpigmented macules',
    distribution: 'Bilateral malar cheeks, forehead & mandibular jawline',
    sizeExtent: '2–5 mm discrete & clustered follicular lesions',
    borders: 'Well-circumscribed follicular papules with mild perilesional erythema',
    severity: 'Moderate Grade II–III · follicular porphyrin fluorescence',
    aiObservation:
      'Follicular-centered erythematous papules and comedones over cheeks and forehead with early post-inflammatory hyperpigmentation; no deep nodulocystic scarring.',
    aiSummaryTitle: 'Acne Vulgaris (Grade II–III Inflammatory & Comedonal)',
    aiConfidence: '95% Match · High',
    leftSpecimenTitle: 'Left cheek & forehead',
    leftSpecimenSummary:
      'Clustered erythematous papules (3–4 mm) and open comedones over malar & forehead region; mild perifollicular erythema.',
    rightSpecimenTitle: 'Right cheek',
    rightSpecimenSummary:
      'Scattered inflammatory papulopustules and residual brown PIH macules over right cheek; orange-red follicular fluorescence on Wood’s lamp.',
    aiResultNarrative:
      'AI Vision & Note Summary: Bilateral facial inflammatory papules and comedones consistent with Acne Vulgaris. Dermoscopy demonstrates follicular keratin plugs and perifollicular erythema. Recommended: Nightly topical retinoid (Adapalene), non-comedogenic cleanser, and broad-spectrum mineral photoprotection.',
    differentials: ['Acne Vulgaris (Grade II–III)', 'Rosacea (Papulopustular)', 'Pityrosporum Folliculitis'],
    workup: ['Dermoscopy', "Wood's Lamp Examination"],
    defaultMeds: [
      {
        medicineName: 'Adapalene 0.1% Gel',
        dosage: 'Pea-sized thin layer',
        frequency: 'Once nightly (HS)',
        duration: '6 weeks',
        instructions: 'Apply on dry face at night'
      },
      {
        medicineName: 'Clindamycin 1% + Nicotinamide Gel',
        dosage: 'Topical spot application',
        frequency: 'Once daily (AM)',
        duration: '4 weeks',
        instructions: 'Apply on active papules in the morning'
      }
    ],
    topicalsAdvice: 'Non-comedogenic foaming cleanser twice daily + Oil-free mineral sunscreen SPF 50+ every morning',
    defaultPlan: 'Start topical adapalene gel at night. Advised non-comedogenic foaming cleanser and daily mineral sunscreen.',
    followUpInstructions: 'Review in 4 weeks to assess comedonal clearance and topical tolerance',
    redFlagAdvice: 'Pause retinoid for 2 days if excessive peeling/erythema occurs; avoid squeezing lesions'
  },
  {
    keywords: /\b(tinea|fungal|ringworm|koh\b|dermatophyt|annular|luliconazole|terbinafine|itraconazole|sertaconazole|scaling)\b/i,
    primaryDiagnosis: 'Tinea Corporis / Faciei (Superficial Dermatophytosis)',
    secondaryDiagnosis: 'Annular Contact Dermatitis, Granuloma Annulare',
    symptoms: ['Pruritic annular scaly patch', 'Expanding ring-like skin lesion'],
    tests: ['KOH Mount (Fungal)', 'Dermoscopy'],
    lesionType: 'Annular erythematous plaque with active scaly border',
    colour: 'Erythematous periphery with central hypopigmented clearing',
    distribution: 'Asymmetrical plaque with centrifugal peripheral spread',
    sizeExtent: '3–5 cm annular polycyclic plaque',
    borders: 'Sharply marginated, raised, advancing scaly border',
    severity: 'Moderate · active peripheral scaling margin',
    aiObservation:
      'Well-demarcated annular plaque with peripheral collarette scaling and central clearing; peripheral dotted vessels on dermoscopy.',
    aiSummaryTitle: 'Superficial Dermatophytosis (Tinea Corporis / Faciei)',
    aiConfidence: '95% Match · High',
    leftSpecimenTitle: 'Primary lesion margin',
    leftSpecimenSummary:
      'Annular erythematous plaque with raised peripheral collarette scale and central clearing; outward centrifugal orientation.',
    rightSpecimenTitle: 'Perilesional zone',
    rightSpecimenSummary:
      'Early satellite erythematous maculopapule with fine peripheral white scale on dermoscopy.',
    aiResultNarrative:
      'AI Vision & Note Summary: Classic annular scaly plaque with advancing raised border and central clearing suggestive of superficial dermatophyte infection. Recommended: 10% KOH mount microscopy and targeted antifungal therapy.',
    differentials: ['Tinea Faciei / Corporis', 'Allergic Contact Dermatitis', 'Granuloma Annulare'],
    workup: ['KOH Mount (Fungal)', 'Dermoscopy'],
    defaultMeds: [
      {
        medicineName: 'Luliconazole 1% Cream',
        dosage: 'Thin layer extending 2cm beyond margin',
        frequency: 'Once daily',
        duration: '2 weeks',
        instructions: 'Continue for 1 week after lesion clears'
      },
      {
        medicineName: 'Levocetirizine 5mg Tablet',
        dosage: '1 tablet',
        frequency: 'Once nightly (HS)',
        duration: '10 days',
        instructions: 'For itching relief'
      }
    ],
    topicalsAdvice: 'Keep affected skin folds clean and dry; strictly avoid OTC steroid-combination creams',
    defaultPlan: 'Skin scraping for 10% KOH mount advised. Start topical antifungal therapy and antihistamine for pruritus.',
    followUpInstructions: 'Review in 2 weeks with KOH report and clinical response evaluation',
    redFlagAdvice: 'Strictly avoid topical steroid creams (prevents Tinea Incognito); wash towels/clothes in hot water'
  },
  {
    keywords: /\b(eczema|atopic|dermatitis|xerosis|lichenified|mometasone|tacrolimus|desonide|itchy|pruritic|pruritus)\b/i,
    primaryDiagnosis: 'Atopic / Eczematous Dermatitis (Subacute Flare)',
    secondaryDiagnosis: 'Allergic Contact Dermatitis, Seborrheic Dermatitis',
    symptoms: ['Itchy erythematous patches', 'Dryness and skin scaling'],
    tests: ['Patch Test (Allergy)', 'Serum Total IgE'],
    lesionType: 'Erythematous scaly patches & subacute eczematous plaques',
    colour: 'Erythematous to dull red with fine xerotic white scale',
    distribution: 'Bilateral symmetrical flexural & facial distribution',
    sizeExtent: '3–6 cm ill-defined coalescing patches',
    borders: 'Ill-defined borders blending into surrounding xerotic skin',
    severity: 'Moderate · epidermal barrier impairment',
    aiObservation:
      'Bilateral erythematous plaques with fine white scaling, excoriation marks, and background xerosis; patchy dotted vessels on dermoscopy.',
    aiSummaryTitle: 'Atopic / Eczematous Dermatitis (Subacute Flare)',
    aiConfidence: '93% Match · High',
    leftSpecimenTitle: 'Left flexural / malar site',
    leftSpecimenSummary:
      'Ill-defined erythematous scaly patch (3.5 cm) with fine fissuring and superficial excoriations.',
    rightSpecimenTitle: 'Contralateral site',
    rightSpecimenSummary:
      'Symmetrical eczematous patch (3.2 cm) with patchy yellow serocrusts and clustered dotted vessels on dermoscopy.',
    aiResultNarrative:
      'AI Vision & Note Summary: Bilateral subacute eczematous patches with xerosis and fine scaling consistent with Eczematous Dermatitis. Recommended: Short-course topical anti-inflammatory therapy paired with intensive ceramide barrier restoration.',
    differentials: ['Atopic Dermatitis', 'Allergic Contact Dermatitis', 'Seborrheic Dermatitis'],
    workup: ['Patch Test (Allergy)', 'Serum Total IgE'],
    defaultMeds: [
      {
        medicineName: 'Mometasone Furoate 0.1% Cream',
        dosage: 'Thin layer on active plaques',
        frequency: 'Once daily',
        duration: '7 days',
        instructions: 'Apply only on red itchy patches'
      },
      {
        medicineName: 'Levocetirizine 5mg Tablet',
        dosage: '1 tablet',
        frequency: 'Once nightly (HS)',
        duration: '7 days',
        instructions: 'At bedtime for nocturnal itching'
      }
    ],
    topicalsAdvice: 'Fragrance-free ceramide moisturizer applied liberally 3 times daily (within 3 mins of lukewarm bath)',
    defaultPlan: 'Short course anti-inflammatory topical therapy with intensive ceramide barrier repair and antihistamine support.',
    followUpInstructions: 'Review in 2 weeks to taper topical steroid to calcineurin inhibitor / emollient maintenance',
    redFlagAdvice: 'Report immediately if oozing, honey-colored crusting, or fever develops; avoid hot showers and harsh soaps'
  },
  {
    keywords: /\b(psoriasis|psoriatic|silvery|micaceous|calcipotriol|clobetasol|auspitz|koebner|plaques?)\b/i,
    primaryDiagnosis: 'Chronic Plaque Psoriasis (Psoriasis Vulgaris)',
    secondaryDiagnosis: 'Lichen Planus, Nummular Eczema',
    symptoms: ['Scaly erythematous plaques', 'Silvery flaking on extensor skin'],
    tests: ['Dermoscopy', 'Skin Biopsy (Punch)'],
    lesionType: 'Well-demarcated indurated plaques with silvery-white lamellar scale',
    colour: 'Salmon-pink to deep erythematous base with silvery scale',
    distribution: 'Symmetrical extensor surfaces (elbows, knees, scalp/trunk)',
    sizeExtent: '3–7 cm sharply circumscribed plaques',
    borders: 'Sharply demarcated, regular elevated margins',
    severity: 'Moderate · positive Auspitz sign & regular dotted vessels',
    aiObservation:
      'Sharply marginated salmon-pink plaques surmounted by silvery-white micaceous scaling; uniform red dotted vessels on dermoscopy.',
    aiSummaryTitle: 'Chronic Plaque Psoriasis (Psoriasis Vulgaris)',
    aiConfidence: '95% Match · High',
    leftSpecimenTitle: 'Primary extensor plaque',
    leftSpecimenSummary:
      'Sharply demarcated erythematous plaque with stratified silvery-white keratin scale and regular dotted vessels.',
    rightSpecimenTitle: 'Secondary plaque',
    rightSpecimenSummary:
      'Symmetrical hyperkeratotic plaque with peripheral erythema and micaceous surface scaling.',
    aiResultNarrative:
      'AI Vision & Note Summary: Well-demarcated erythematous plaques with silvery-white lamellar scaling characteristic of Plaque Psoriasis. Recommended: Fixed-combination topical vitamin D3 analogue + corticosteroid and keratolytic emollient.',
    differentials: ['Plaque Psoriasis', 'Lichen Planus', 'Pityriasis Rosea'],
    workup: ['Dermoscopy', 'ESR / CRP & Metabolic Panel'],
    defaultMeds: [
      {
        medicineName: 'Calcipotriol + Betamethasone Ointment',
        dosage: 'Thin layer on plaques',
        frequency: 'Once daily',
        duration: '4 weeks',
        instructions: 'Apply nightly on thick plaques'
      },
      {
        medicineName: 'Urea 10% + Salicylic Acid Emollient',
        dosage: 'Liberal application',
        frequency: 'Twice daily',
        duration: '4 weeks',
        instructions: 'Apply after bath to soften scales'
      }
    ],
    topicalsAdvice: 'Frequent keratolytic moisturization; avoid picking scales or skin friction (Koebner phenomenon)',
    defaultPlan: 'Start topical Calcipotriol + Betamethasone ointment once daily and Urea emollient twice daily.',
    followUpInstructions: 'Review in 4 weeks to evaluate plaque thickness reduction and PASI response',
    redFlagAdvice: 'Report joint pain/morning stiffness (psoriatic arthritis screen) or sudden generalized pustular flare'
  },
  {
    keywords: /\b(urticaria|wheals?|hives|angioedema|bilastine|fexofenadine|cetirizine|dermographism)\b/i,
    primaryDiagnosis: 'Acute / Spontaneous Urticaria (Wheal & Flare)',
    secondaryDiagnosis: 'Urticarial Drug Eruption, Contact Urticaria',
    symptoms: ['Itchy raised wheals / hives', 'Transient erythematous flares'],
    tests: ['CBC with Differential (Eosinophils)', 'Serum Total IgE'],
    lesionType: 'Transient edematous erythematous wheals (plaques)',
    colour: 'Pale dermal edema center with surrounding erythematous flare',
    distribution: 'Generalized / scattered over trunk and extremities',
    sizeExtent: '1–6 cm migratory polycyclic wheals',
    borders: 'Well-defined geographic borders resolving within <24h per lesion',
    severity: 'Moderate · blanchable dermal edema without purpura',
    aiObservation:
      'Multiple blanchable edematous pink wheals with surrounding axon-reflex erythema; individual lesions resolve without residual bruising.',
    aiSummaryTitle: 'Acute Spontaneous Urticaria (Wheal & Flare Presentation)',
    aiConfidence: '94% Match · High',
    leftSpecimenTitle: 'Trunk / forearm wheals',
    leftSpecimenSummary:
      'Edematous pink-white dermal wheals (2–4 cm) with peripheral erythematous flare; completely blanchable on diascopy.',
    rightSpecimenTitle: 'Contralateral site',
    rightSpecimenSummary:
      'Confluent urticarial plaques with linear dermographism and absence of petechiae or scaling.',
    aiResultNarrative:
      'AI Vision & Note Summary: Classic blanchable edematous wheals with surrounding erythematous flare consistent with Acute Urticaria. Recommended: Second-generation non-sedating H1 antihistamine therapy and trigger avoidance.',
    differentials: ['Acute Spontaneous Urticaria', 'Cutaneous Drug Reaction', 'Urticarial Vasculitis'],
    workup: ['CBC with Eosinophils', 'Serum Total IgE & TSH'],
    defaultMeds: [
      {
        medicineName: 'Bilastine 20mg Tablet',
        dosage: '1 tablet',
        frequency: 'Once daily (empty stomach)',
        duration: '14 days',
        instructions: 'Take 1 hour before food'
      },
      {
        medicineName: 'Calamine + Aloe Soothing Lotion',
        dosage: 'Topical application',
        frequency: 'Twice daily / SOS',
        duration: '14 days',
        instructions: 'Apply cool lotion on itchy wheals'
      }
    ],
    topicalsAdvice: 'Apply cool calamine lotion; wear loose breathable cotton clothes and avoid hot baths',
    defaultPlan: 'Start second-generation non-sedating antihistamine (Bilastine 20mg) and soothing calamine lotion; avoid NSAIDs.',
    followUpInstructions: 'Review in 2 weeks to assess wheal resolution or step-up antihistamine dosing',
    redFlagAdvice: 'Seek emergency care immediately if lip/tongue swelling, hoarseness, or breathing difficulty occurs'
  },
  {
    keywords: /\b(melasma|hyperpigment|pigment|dark\s*spots?|lentigo|kojic|azelaic|tranexamic|hydroquinone|malar\s*patches)\b/i,
    primaryDiagnosis: 'Centrofacial Melasma (Mixed Epidermal–Dermal)',
    secondaryDiagnosis: 'Post-Inflammatory Hyperpigmentation (PIH), Solar Lentigines',
    symptoms: ['Facial pigmentation / dark spots', 'Symmetrical brownish cheek patches'],
    tests: ["Wood's Lamp Examination", 'Dermoscopy'],
    lesionType: 'Macule / Confluent Hyperpigmented Patch',
    colour: 'Hyperpigmented light-to-dark brown',
    distribution: 'Malar cheeks, bilateral centrofacial & forehead',
    sizeExtent: '2–4 cm confluent symmetrical patches',
    borders: 'Irregular, well-demarcated, non-scaly geographic borders',
    severity: 'Moderate (mMASI 6.8) · mixed epidermal-dermal on Wood’s lamp',
    aiObservation:
      'Bilateral symmetrical hyperpigmented macules and patches over malar prominence; accentuated pseudoreticular pigment network with follicular sparing on dermoscopy.',
    aiSummaryTitle: 'Centrofacial Melasma (Mixed Epidermal–Dermal Type)',
    aiConfidence: '94% Match · High',
    leftSpecimenTitle: 'Left cheek',
    leftSpecimenSummary:
      'Confluent brown hyperpigmented macules & patch (3.2 × 2.4 cm) over left malar eminence; regular pseudoreticular pigment network.',
    rightSpecimenTitle: 'Right cheek',
    rightSpecimenSummary:
      'Symmetrical hyperpigmented patch (2.9 × 2.2 cm) over right malar prominence; partial epidermal contrast enhancement on Wood’s lamp.',
    aiResultNarrative:
      'AI Vision & Note Summary: Symmetrical bilateral malar hyperpigmented patches consistent with Centrofacial Melasma. Dermoscopy shows accentuated pseudoreticular brown pigment network sparing follicular openings. Recommended: Broad-spectrum tinted SPF 50+ and tyrosinase inhibitor regimen.',
    differentials: ['Centrofacial Melasma', 'Post-Inflammatory Hyperpigmentation (PIH)', 'Solar Lentigines'],
    workup: ["Wood's Lamp Examination", 'Dermoscopy'],
    defaultMeds: [
      {
        medicineName: 'Azelaic Acid 15% + Kojic Acid Gel',
        dosage: 'Thin layer on pigmented patches',
        frequency: 'Once nightly (HS)',
        duration: '8 weeks',
        instructions: 'Apply at night on dark patches'
      },
      {
        medicineName: 'Tinted Broad-Spectrum Sunscreen SPF 50+ PA++++',
        dosage: '2-finger rule coverage',
        frequency: 'Every 3–4 hours (Daytime)',
        duration: '8 weeks',
        instructions: 'Apply 20 mins before sun/visible light exposure'
      }
    ],
    topicalsAdvice: 'Strict visible-light + UVA/UVB tinted iron-oxide sunscreen SPF 50+ + gentle non-stripping cleanser',
    defaultPlan: 'Start nightly depigmenting tyrosinase-inhibitor gel and strict broad-spectrum tinted SPF 50+ photoprotection.',
    followUpInstructions: 'Review in 4–6 weeks with repeat clinical photography to track mMASI pigment clearance',
    redFlagAdvice: 'Discontinue night cream if marked erythema develops; avoid mid-day direct sunlight and heat exposure'
  }
];

function extractSection(text: string, labelRegex: RegExp, stopRegex: RegExp): string {
  const match = text.match(labelRegex);
  if (!match || match.index === undefined) return '';
  const start = match.index + match[0].length;
  const rest = text.slice(start);
  const stopMatch = rest.search(stopRegex);
  const extracted = stopMatch !== -1 ? rest.slice(0, stopMatch) : rest;
  return extracted.replace(/^[:\s\-–—]+/, '').trim();
}

export function parseClinicalNoteToStructuredSummary(
  rawNote: string,
  context?: {
    existingExamination?: string;
    existingInvestigations?: string;
    existingPlan?: string;
    patientPrimaryDiagnosis?: string;
    existingSymptoms?: string[];
  }
): ParsedClinicalNoteSummary {
  const combinedRaw = [
    rawNote.trim(),
    context?.existingExamination?.trim() || '',
    context?.existingInvestigations?.trim() || '',
    context?.existingPlan?.trim() || ''
  ]
    .filter(Boolean)
    .join('. ');

  const textLower = combinedRaw.toLowerCase();

  // 1. Match condition profile from keywords in the dictated/typed text (or patient baseline)
  let matchedProfile =
    CONDITION_PROFILES.find(p => p.keywords.test(combinedRaw)) ||
    CONDITION_PROFILES.find(p => p.keywords.test(context?.patientPrimaryDiagnosis || '')) ||
    CONDITION_PROFILES[0];

  // 2. Split or extract Examination, Investigations, and Plan from the single note
  let examination = '';
  let investigationsAdvised = '';
  let plan = '';

  const explicitExam = extractSection(
    rawNote,
    /\b(?:on\s+examination|exam(?:ination)?(?:\s+findings)?|o\/e|findings)\b/i,
    /\b(?:investigations?|tests?|workup|advised|plan|rx|treatment|prescribed|diagnosis|impression|follow[\s-]?up)\b/i
  );
  const explicitInv = extractSection(
    rawNote,
    /\b(?:investigations?(?:\s+advised)?|tests?\s+(?:ordered|advised)|workup|lab(?:s)?)\b/i,
    /\b(?:plan|rx|treatment|prescribed|medications?|follow[\s-]?up)\b/i
  );
  const explicitPlan = extractSection(
    rawNote,
    /\b(?:clinical\s+plan|treatment\s+plan|plan|rx|management|treatment|start|prescribed)\b/i,
    /\b(?:nothing_stop_marker)\b/i
  );

  // Sentence-based intelligent classification when doctor dictates naturally without headers
  const sentences = rawNote
    .split(/(?<=[.!?])\s+|\n+/)
    .map(s => s.trim())
    .filter(Boolean);

  const examSentences: string[] = [];
  const invSentences: string[] = [];
  const planSentences: string[] = [];

  for (const s of sentences) {
    const sLower = s.toLowerCase();
    if (
      /\b(koh\b|scraping|biopsy|blood\s+test|cbc\b|ige\b|dermoscopy|wood'?s\s+lamp|patch\s+test|culture|swab|investigation|thyroid|tsh|hbA1c|lipid)\b/i.test(
        sLower
      ) &&
      !/\b(apply|start|tablet|cream|gel|ointment|twice|nightly)\b/i.test(sLower)
    ) {
      invSentences.push(s);
    } else if (
      /\b(start|apply|prescribe|rx\b|tablet|tab\b|cap\b|capsule|cream|gel|ointment|lotion|shampoo|cleanser|sunscreen|spf|mg\b|once\s+daily|twice\s+daily|nightly|at\s+night|review\s+in|follow[\s-]?up|avoid|advised\s+non-comedogenic|moisturizer)\b/i.test(
        sLower
      )
    ) {
      planSentences.push(s);
    } else {
      examSentences.push(s);
    }
  }

  examination =
    explicitExam ||
    (examSentences.length > 0 ? examSentences.join(' ') : rawNote.trim()) ||
    context?.existingExamination ||
    matchedProfile.aiObservation;

  investigationsAdvised =
    explicitInv ||
    (invSentences.length > 0 ? invSentences.join(' ') : '') ||
    context?.existingInvestigations ||
    `${matchedProfile.workup.join(', ')} advised for diagnostic confirmation.`;

  plan =
    explicitPlan ||
    (planSentences.length > 0 ? planSentences.join(' ') : '') ||
    context?.existingPlan ||
    matchedProfile.defaultPlan;

  // 3. Extract explicit or inferred Primary & Secondary Diagnosis
  let primaryDiagnosis = matchedProfile.primaryDiagnosis;
  const diagMatch = combinedRaw.match(
    /\b(?:diagnosis|impression|dx|diagnosed\s+with|suggestive\s+of|consistent\s+with)\s*[:\-–]?\s*([^.;,\n]+)/i
  );
  if (diagMatch && diagMatch[1]?.trim()) {
    const extractedDiag = diagMatch[1].trim();
    if (extractedDiag.length > 2 && extractedDiag.length < 70) {
      primaryDiagnosis = extractedDiag.charAt(0).toUpperCase() + extractedDiag.slice(1);
    }
  }

  let secondaryDiagnosis = matchedProfile.secondaryDiagnosis;
  const diffMatch = combinedRaw.match(
    /\b(?:differential(?:s)?|ddx|vs\.?|rule\s+out|r\/o)\s*[:\-–]?\s*([^.;\n]+)/i
  );
  if (diffMatch && diffMatch[1]?.trim()) {
    secondaryDiagnosis = diffMatch[1].trim();
  }

  // 4. Extract Chief Complaints / Symptoms
  const extractedSymptoms = new Set<string>(context?.existingSymptoms || []);
  const symMatch = combinedRaw.match(
    /\b(?:complains?\s+of|presenting\s+with|symptoms?|c\/o|history\s+of)\s*[:\-–]?\s*([^.;\n]+)/i
  );
  if (symMatch && symMatch[1]?.trim()) {
    symMatch[1]
      .split(/,|and\b/i)
      .map(s => s.trim())
      .filter(s => s.length > 2 && s.length < 60)
      .forEach(s => extractedSymptoms.add(s.charAt(0).toUpperCase() + s.slice(1)));
  }
  if (/itch|prurit/i.test(textLower)) extractedSymptoms.add('Pruritus / Itching');
  if (/papule|comedo/i.test(textLower)) extractedSymptoms.add('Erythematous papules & comedones');
  if (/scaly|scaling|flak/i.test(textLower)) extractedSymptoms.add('Cutaneous scaling');
  if (/pigment|dark\s+spot|hyperpigment/i.test(textLower)) extractedSymptoms.add('Hyperpigmentation');
  if (/redness|erythema/i.test(textLower)) extractedSymptoms.add('Erythematous skin eruption');
  if (extractedSymptoms.size === 0) {
    matchedProfile.symptoms.forEach(s => extractedSymptoms.add(s));
  }

  // 5. Extract Tests Ordered
  const extractedTests = new Set<string>();
  if (/\bkoh\b|scraping/i.test(textLower)) extractedTests.add('KOH Mount (Fungal)');
  if (/dermoscop/i.test(textLower)) extractedTests.add('Dermoscopy');
  if (/wood'?s\s*lamp/i.test(textLower)) extractedTests.add("Wood's Lamp Examination");
  if (/biopsy/i.test(textLower)) extractedTests.add('Skin Biopsy (4mm Punch)');
  if (/\bcbc\b|complete\s+blood/i.test(textLower)) extractedTests.add('Complete Blood Count (CBC)');
  if (/\bige\b/i.test(textLower)) extractedTests.add('Serum Total IgE');
  if (/patch\s+test/i.test(textLower)) extractedTests.add('Patch Test (Allergy)');
  if (/culture/i.test(textLower)) extractedTests.add('Fungal / Bacterial Culture');
  if (/thyroid|\btsh\b/i.test(textLower)) extractedTests.add('Thyroid Profile (TSH, Free T4)');
  if (extractedTests.size === 0) {
    matchedProfile.tests.forEach(t => extractedTests.add(t));
  }

  // 6. Extract Procedures Performed
  const extractedProcedures: ProcedureItem[] = [];
  if (/comedone\s+extraction/i.test(textLower)) {
    extractedProcedures.push({ id: 'proc-auto-1', name: 'Comedone Extraction', cost: 800 });
  }
  if (/chemical\s+peel|glycolic\s+peel|salicylic\s+peel/i.test(textLower)) {
    extractedProcedures.push({ id: 'proc-auto-2', name: 'Medicated Chemical Peel', cost: 1800 });
  }
  if (/cryotherapy|liquid\s+nitrogen/i.test(textLower)) {
    extractedProcedures.push({ id: 'proc-auto-3', name: 'Cryotherapy (Liquid Nitrogen)', cost: 1200 });
  }
  if (/intralesional|ils\b|triamcinolone/i.test(textLower)) {
    extractedProcedures.push({ id: 'proc-auto-4', name: 'Intralesional Steroid Injection (ILS)', cost: 1000 });
  }
  if (/biopsy/i.test(textLower)) {
    extractedProcedures.push({ id: 'proc-auto-5', name: 'Diagnostic Skin Punch Biopsy', cost: 1500 });
  }

  // 7. Extract Morphology specifics from examination text when present
  let lesionType = matchedProfile.lesionType;
  const lesionMatches: string[] = [];
  if (/papules?/i.test(textLower)) lesionMatches.push('Papules');
  if (/comedones?/i.test(textLower)) lesionMatches.push('open/closed comedones');
  if (/pustules?/i.test(textLower)) {
    if (!/no\s+pustules/i.test(textLower)) lesionMatches.push('pustules');
  }
  if (/plaques?/i.test(textLower)) lesionMatches.push('plaques');
  if (/macules?/i.test(textLower)) lesionMatches.push('macules');
  if (/patches|patch/i.test(textLower)) lesionMatches.push('patches');
  if (/vesicles?/i.test(textLower)) lesionMatches.push('vesicles');
  if (/wheals?/i.test(textLower)) lesionMatches.push('urticarial wheals');
  if (lesionMatches.length > 0) {
    lesionType = lesionMatches.join(', ').replace(/^./, c => c.toUpperCase());
  }

  let colour = matchedProfile.colour;
  const colourMatches: string[] = [];
  if (/erythematous|red\b/i.test(textLower)) colourMatches.push('Erythematous');
  if (/hyperpigment|brown|dark/i.test(textLower)) colourMatches.push('hyperpigmented');
  if (/hypopigment|depigment|white/i.test(textLower)) colourMatches.push('hypopigmented');
  if (/violaceous/i.test(textLower)) colourMatches.push('violaceous');
  if (colourMatches.length > 0) {
    colour = colourMatches.join(' & ').replace(/^./, c => c.toUpperCase());
  }

  let distribution = matchedProfile.distribution;
  const siteMatch = combinedRaw.match(
    /\b(?:over|on|involving|across)\s+((?:bilateral\s+)?(?:cheeks?|forehead|face|neck|trunk|back|arms?|legs?|scalp|chin|jawline|flexures?)(?:\s*(?:,|and)\s*(?:cheeks?|forehead|face|neck|trunk|back|arms?|legs?|scalp|chin|jawline))*)/i
  );
  if (siteMatch && siteMatch[1]?.trim()) {
    const cleanSite = siteMatch[1].trim();
    distribution = cleanSite.charAt(0).toUpperCase() + cleanSite.slice(1);
  }

  // 8. Extract Medications / Prescriptions
  const prescriptions: PrescriptionItem[] = [];
  const nowIso = new Date().toISOString();
  const addMed = (medicineName: string, dosage: string, frequency: string, duration: string, instructions: string) => {
    if (!prescriptions.some(p => p.medicineName.toLowerCase() === medicineName.toLowerCase())) {
      prescriptions.push({
        id: `rx_auto_${prescriptions.length + 1}_${Date.now()}`,
        patientId: '',
        consultationId: '',
        medicineName,
        dosage,
        frequency,
        duration,
        instructions,
        date: nowIso,
        createdAt: nowIso
      });
    }
  };

  if (/adapalene/i.test(textLower)) {
    addMed('Adapalene 0.1% Gel', 'Pea-sized thin layer', 'Once nightly (HS)', '6 weeks', 'Apply at night on dry skin');
  }
  if (/benzoyl\s*peroxide/i.test(textLower)) {
    addMed('Benzoyl Peroxide 2.5% Gel', 'Thin layer', 'Once daily', '6 weeks', 'Short-contact or spot application');
  }
  if (/clindamycin/i.test(textLower)) {
    addMed('Clindamycin 1% Gel', 'Thin layer', 'Twice daily', '4 weeks', 'Apply on active inflammatory lesions');
  }
  if (/doxycycline/i.test(textLower)) {
    addMed('Doxycycline 100mg Capsule', '1 capsule', 'Once daily', '4 weeks', 'Take after meals with full glass of water');
  }
  if (/terbinafine/i.test(textLower)) {
    addMed('Terbinafine 250mg Tablet / 1% Cream', '1 tab / thin layer', 'Once daily', '2 weeks', 'After meals / extend 2cm beyond border');
  }
  if (/luliconazole/i.test(textLower)) {
    addMed('Luliconazole 1% Cream', 'Thin layer', 'Once daily', '2 weeks', 'Apply over lesion and 2cm margin');
  }
  if (/itraconazole/i.test(textLower)) {
    addMed('Itraconazole 100mg Capsule', '1 capsule', 'Twice daily', '2 weeks', 'Take immediately after full meal');
  }
  if (/levocetirizine|cetirizine/i.test(textLower)) {
    addMed('Levocetirizine 5mg Tablet', '1 tablet', 'Once nightly (HS)', '10 days', 'Take at bedtime for itching');
  }
  if (/bilastine/i.test(textLower)) {
    addMed('Bilastine 20mg Tablet', '1 tablet', 'Once daily', '14 days', 'Take 1 hour before food');
  }
  if (/mometasone/i.test(textLower)) {
    addMed('Mometasone Furoate 0.1% Cream', 'Thin layer', 'Once daily', '7 days', 'Apply on active eczematous plaques');
  }
  if (/tacrolimus/i.test(textLower)) {
    addMed('Tacrolimus 0.1% Ointment', 'Thin layer', 'Twice daily', '4 weeks', 'Steroid-sparing maintenance');
  }
  if (/azelaic/i.test(textLower)) {
    addMed('Azelaic Acid 15% Gel', 'Pea-sized amount', 'Once nightly', '8 weeks', 'Apply over hyperpigmented zones');
  }

  if (prescriptions.length === 0) {
    matchedProfile.defaultMeds.forEach((m, idx) => {
      prescriptions.push({
        id: `rx_default_${idx}_${Date.now()}`,
        patientId: '',
        consultationId: '',
        ...m,
        date: nowIso,
        createdAt: nowIso
      });
    });
  }

  const inlineMedSummary = prescriptions
    .map(p => `${p.medicineName} (${p.dosage} · ${p.frequency} · ${p.duration})`)
    .join('; ');

  // 9. Extract Topicals / Skincare Advice
  const topicalParts: string[] = [];
  if (/cleanser|face\s*wash/i.test(textLower)) {
    topicalParts.push('Non-comedogenic gentle foaming cleanser twice daily');
  }
  if (/sunscreen|spf\b/i.test(textLower)) {
    topicalParts.push('Broad-spectrum mineral sunscreen SPF 50+ every morning');
  }
  if (/moisturiz|emollient|ceramide/i.test(textLower)) {
    topicalParts.push('Ceramide barrier-repair moisturizer twice daily');
  }
  const topicalsAdvice =
    topicalParts.length > 0 ? topicalParts.join(' + ') : matchedProfile.topicalsAdvice;

  // 10. Follow-up Date & Instructions
  const targetDate = new Date();
  let daysToAdd = 14;
  const followUpMatch = combinedRaw.match(/\b(?:review|follow[\s-]?up|after|in)\s+(\d+)\s*(day|week|month)s?\b/i);
  if (followUpMatch) {
    const num = parseInt(followUpMatch[1], 10);
    const unit = followUpMatch[2].toLowerCase();
    if (unit.startsWith('day')) daysToAdd = num;
    else if (unit.startsWith('week')) daysToAdd = num * 7;
    else if (unit.startsWith('month')) daysToAdd = num * 30;
  }
  targetDate.setDate(targetDate.getDate() + daysToAdd);
  const followUpDate = targetDate.toISOString().split('T')[0];

  const followUpInstructions = followUpMatch
    ? `Review in ${followUpMatch[1]} ${followUpMatch[2]}${Number(followUpMatch[1]) > 1 ? 's' : ''} — ${matchedProfile.followUpInstructions}`
    : matchedProfile.followUpInstructions;

  const aiObservation =
    examination.length > 15 ? examination : matchedProfile.aiObservation;

  const aiNarrative = `AI Clinical Summary: ${primaryDiagnosis}. Examination shows ${examination.replace(/\.$/, '')}. Workup advised: ${Array.from(
    extractedTests
  ).join(', ')}. Management plan: ${plan}`;

  const aiSummaryText = [
    `PRIMARY DIAGNOSIS: ${primaryDiagnosis}`,
    `DIFFERENTIAL: ${secondaryDiagnosis}`,
    `EXAMINATION: ${examination}`,
    `INVESTIGATIONS ADVISED: ${investigationsAdvised}`,
    `TREATMENT PLAN: ${plan}`,
    `PRESCRIPTION: ${inlineMedSummary}`,
    `SKINCARE & TOPICALS: ${topicalsAdvice}`,
    `FOLLOW-UP: ${followUpInstructions} (${followUpDate})`
  ].join('\n');

  return {
    examination,
    investigationsAdvised,
    plan,
    symptoms: Array.from(extractedSymptoms),
    primaryDiagnosis,
    secondaryDiagnosis,
    tests: Array.from(extractedTests),
    procedures: extractedProcedures,
    dermMorphology: {
      lesionType,
      colour,
      distribution,
      sizeExtent: matchedProfile.sizeExtent,
      borders: matchedProfile.borders,
      severity: matchedProfile.severity,
      aiObservation
    },
    aiImageSummaryResult: {
      title: primaryDiagnosis,
      confidence: matchedProfile.aiConfidence,
      leftSpecimenTitle: matchedProfile.leftSpecimenTitle,
      leftSpecimenSummary: examination || matchedProfile.leftSpecimenSummary,
      rightSpecimenTitle: matchedProfile.rightSpecimenTitle,
      rightSpecimenSummary: plan || matchedProfile.rightSpecimenSummary,
      narrative: aiNarrative,
      differentials: [
        primaryDiagnosis,
        ...secondaryDiagnosis
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
      ].slice(0, 3),
      workup: Array.from(extractedTests)
    },
    prescriptions,
    inlineMedSummary,
    topicalsAdvice,
    followUp: {
      date: followUpDate,
      instructions: followUpInstructions,
      notes: matchedProfile.redFlagAdvice
    },
    aiSummaryText
  };
}
