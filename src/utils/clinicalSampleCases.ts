/**
 * Clinical Dermatological Test Presets
 * High-fidelity vector specimens representing distinct dermatological conditions
 * with accurate chromophores (erythema, melanin, silvery scale, annular borders, vesicles, pustules, depigmentation).
 */

export interface ClinicalPresetCase {
  id: string;
  name: string;
  shortName: string;
  icdCode: string;
  expectedCondition: string;
  anatomicalSite: string;
  clinicalNote: string;
  badge: string;
  badgeColor: string;
  dataUrl: string;
}

// 1. Atopic Eczema: Diffuse flexural erythema with fine papules and barrier xerosis
const eczemaSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
  <rect width="400" height="300" fill="#f3d1b8" />
  <circle cx="200" cy="150" r="110" fill="#e74c3c" opacity="0.45" />
  <circle cx="180" cy="140" r="85" fill="#c0392b" opacity="0.55" />
  <circle cx="220" cy="165" r="75" fill="#d9534f" opacity="0.60" />
  <!-- Micro-papules and excoriations -->
  <g fill="#962d22" opacity="0.8">
    <circle cx="150" cy="120" r="4" /><circle cx="165" cy="135" r="3.5" /><circle cx="180" cy="115" r="4.5" />
    <circle cx="195" cy="145" r="4" /><circle cx="210" cy="125" r="3" /><circle cx="230" cy="155" r="4.5" />
    <circle cx="170" cy="160" r="3.5" /><circle cx="185" cy="175" r="4" /><circle cx="205" cy="180" r="3.5" />
    <circle cx="225" cy="135" r="4" /><circle cx="240" cy="170" r="3" /><circle cx="160" cy="185" r="4" />
  </g>
  <!-- Scratch excoriation marks -->
  <path d="M140 130 Q170 145 200 135" stroke="#78281f" stroke-width="2.5" fill="none" opacity="0.7" />
  <path d="M160 160 Q190 170 230 165" stroke="#78281f" stroke-width="2.2" fill="none" opacity="0.7" />
  <path d="M180 180 Q210 195 250 185" stroke="#78281f" stroke-width="2.0" fill="none" opacity="0.65" />
</svg>
`.trim();

// 2. Plaque Psoriasis: Indurated salmon-pink plaque with prominent silvery-white micaceous lamellar scales
const psoriasisSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
  <rect width="400" height="300" fill="#f5d6ba" />
  <!-- Salmon pink well-demarcated base plaque -->
  <path d="M110 140 C100 80, 280 70, 290 130 C310 190, 270 235, 190 230 C120 225, 90 190, 110 140 Z" fill="#d9534f" opacity="0.88" />
  <path d="M125 140 C115 95, 265 85, 275 135 C295 185, 255 220, 185 215 C130 210, 105 180, 125 140 Z" fill="#c0392b" opacity="0.92" />
  <!-- Silvery white lamellar scales on top -->
  <g fill="#ffffff" opacity="0.95">
    <ellipse cx="180" cy="130" rx="35" ry="18" fill="#fdfefe" />
    <ellipse cx="220" cy="145" rx="42" ry="22" fill="#ffffff" />
    <ellipse cx="160" cy="165" rx="30" ry="16" fill="#f8f9fa" />
    <ellipse cx="210" cy="180" rx="38" ry="18" fill="#ffffff" />
    <ellipse cx="195" cy="120" rx="25" ry="12" fill="#fdfefe" />
    <!-- Fine cracked scale texture -->
    <path d="M150 130 L230 150 M170 170 L240 140 M190 115 L220 185" stroke="#e5e7eb" stroke-width="2" />
  </g>
</svg>
`.trim();

// 3. Tinea Corporis: Figurate annular ring with active red raised scaly border and clear pale center
const tineaSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
  <rect width="400" height="300" fill="#f4d4ba" />
  <!-- Active annular ring border -->
  <circle cx="200" cy="150" r="88" fill="none" stroke="#c0392b" stroke-width="32" opacity="0.85" />
  <circle cx="200" cy="150" r="94" fill="none" stroke="#e74c3c" stroke-width="14" opacity="0.90" />
  <!-- Peripheral scaling collar -->
  <circle cx="200" cy="150" r="102" fill="none" stroke="#fdfefe" stroke-width="4.5" stroke-dasharray="8 6" opacity="0.85" />
  <!-- Central clearing (natural pale skin tone) -->
  <circle cx="200" cy="150" r="68" fill="#f5d6ba" opacity="0.95" />
  <circle cx="200" cy="150" r="50" fill="#f8dfc8" opacity="0.80" />
  <g fill="#b03a2e" opacity="0.85">
    <circle cx="110" cy="150" r="3.5" /><circle cx="290" cy="150" r="3.5" />
    <circle cx="200" cy="60" r="3.5" /><circle cx="200" cy="240" r="3.5" />
    <circle cx="135" cy="88" r="3.5" /><circle cx="265" cy="212" r="3.5" />
  </g>
</svg>
`.trim();

// 4. Melanocytic Nevus: Deep dark brown and black melanin pigment with architectural asymmetry
const nevusSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
  <rect width="400" height="300" fill="#edd0b7" />
  <!-- Peripheral tan pigment network halo -->
  <path d="M120 150 C110 80, 260 70, 280 130 C300 200, 240 240, 170 230 C110 220, 85 180, 120 150 Z" fill="#6e3d1b" opacity="0.75" />
  <!-- Deep dark brown melanin core -->
  <path d="M135 145 C125 95, 245 85, 265 135 C280 190, 230 225, 175 215 C125 205, 105 175, 135 145 Z" fill="#2c1609" opacity="0.92" />
  <!-- Jet black focal melanin globules -->
  <path d="M150 140 C140 110, 220 100, 235 135 C250 170, 210 195, 175 190 C145 185, 130 160, 150 140 Z" fill="#0f0703" opacity="0.98" />
  <circle cx="195" cy="135" r="14" fill="#000000" opacity="0.98" />
  <circle cx="165" cy="165" r="11" fill="#150a04" opacity="0.95" />
</svg>
`.trim();

// 5. Acne Vulgaris: Inflammatory papules and pustules with yellow comedonal micro-heads on facial skin
const acneSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
  <rect width="400" height="300" fill="#f8d7bd" />
  <!-- Pustule 1 -->
  <circle cx="140" cy="110" r="32" fill="#e74c3c" opacity="0.65" />
  <circle cx="140" cy="110" r="18" fill="#c0392b" opacity="0.85" />
  <circle cx="140" cy="110" r="8" fill="#fff9c4" opacity="0.98" />
  <!-- Pustule 2 (Central prominent) -->
  <circle cx="210" cy="160" r="42" fill="#e74c3c" opacity="0.70" />
  <circle cx="210" cy="160" r="24" fill="#c0392b" opacity="0.90" />
  <circle cx="210" cy="160" r="11" fill="#fffde7" opacity="0.98" />
  <!-- Pustule 3 -->
  <circle cx="280" cy="120" r="30" fill="#e74c3c" opacity="0.60" />
  <circle cx="280" cy="120" r="16" fill="#c0392b" opacity="0.80" />
  <circle cx="280" cy="120" r="7" fill="#fff9c4" opacity="0.98" />
  <!-- Inflammatory papule 4 -->
  <circle cx="170" cy="210" r="26" fill="#e74c3c" opacity="0.75" />
  <circle cx="170" cy="210" r="14" fill="#c0392b" opacity="0.90" />
  <!-- Inflammatory papule 5 -->
  <circle cx="260" cy="215" r="24" fill="#e74c3c" opacity="0.70" />
  <circle cx="260" cy="215" r="12" fill="#c0392b" opacity="0.85" />
  <!-- Blackhead comedones -->
  <circle cx="180" cy="125" r="3" fill="#2c3e50" />
  <circle cx="240" cy="140" r="2.8" fill="#2c3e50" />
</svg>
`.trim();

// 6. Acute Urticaria: Edematous smooth wheal with blanched pale center and prominent erythematous flare
const urticariaSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
  <rect width="400" height="300" fill="#f4d4bb" />
  <!-- Intense peripheral vascular flare halo -->
  <ellipse cx="200" cy="150" rx="130" ry="85" fill="#e74c3c" opacity="0.55" />
  <ellipse cx="200" cy="150" rx="110" ry="70" fill="#c0392b" opacity="0.65" />
  <!-- Raised pale edematous central wheal -->
  <ellipse cx="200" cy="150" rx="80" ry="48" fill="#fde8d7" opacity="0.95" />
  <ellipse cx="195" cy="145" rx="65" ry="38" fill="#fff0e1" opacity="0.95" />
  <!-- Adjacent smaller wheal -->
  <ellipse cx="110" cy="110" rx="40" ry="25" fill="#e74c3c" opacity="0.6" />
  <ellipse cx="110" cy="110" rx="25" ry="15" fill="#fff0e1" opacity="0.92" />
</svg>
`.trim();

// 7. Herpes Zoster: Grouped tense vesicles on erythematous base along a unilateral dermatome
const shinglesSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
  <rect width="400" height="300" fill="#f5d5bc" />
  <!-- Erythematous inflammatory plaque base -->
  <path d="M70 180 Q160 120 250 140 T340 110" stroke="#c0392b" stroke-width="75" fill="none" opacity="0.85" stroke-linecap="round" />
  <path d="M70 180 Q160 120 250 140 T340 110" stroke="#e74c3c" stroke-width="45" fill="none" opacity="0.90" stroke-linecap="round" />
  <!-- Cluster of tense fluid-filled vesicles with highlights -->
  <g fill="#e0f7fa" stroke="#b2ebf2" stroke-width="1.5" opacity="0.95">
    <circle cx="110" cy="165" r="14" /><circle cx="106" cy="162" r="4" fill="#ffffff" />
    <circle cx="135" cy="150" r="16" /><circle cx="131" cy="146" r="4.5" fill="#ffffff" />
    <circle cx="160" cy="160" r="15" /><circle cx="156" cy="156" r="4.2" fill="#ffffff" />
    <circle cx="185" cy="140" r="18" /><circle cx="180" cy="135" r="5" fill="#ffffff" />
    <circle cx="215" cy="145" r="16" /><circle cx="210" cy="140" r="4.5" fill="#ffffff" />
    <circle cx="240" cy="135" r="17" /><circle cx="235" cy="130" r="4.8" fill="#ffffff" />
    <circle cx="265" cy="145" r="15" /><circle cx="261" cy="141" r="4" fill="#ffffff" />
    <circle cx="290" cy="125" r="16" /><circle cx="285" cy="120" r="4.5" fill="#ffffff" />
    <circle cx="315" cy="115" r="13" /><circle cx="311" cy="111" r="3.5" fill="#ffffff" />
  </g>
</svg>
`.trim();

// 8. Vitiligo Vulgaris: Stark chalk-white depigmentation macules on melanin skin baseline
const vitiligoSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
  <rect width="400" height="300" fill="#a4724b" />
  <!-- Stark amelanotic chalk-white macule with scalloped borders -->
  <path d="M120 140 C110 80, 240 70, 280 120 C310 170, 270 230, 200 225 C130 220, 80 180, 120 140 Z" fill="#ffffff" opacity="0.98" />
  <!-- Hyperpigmented marginal border accentuation -->
  <path d="M120 140 C110 80, 240 70, 280 120 C310 170, 270 230, 200 225 C130 220, 80 180, 120 140 Z" fill="none" stroke="#6e3d1b" stroke-width="3.5" opacity="0.75" />
  <!-- Satellite depigmented macule -->
  <circle cx="310" cy="200" r="22" fill="#ffffff" opacity="0.98" stroke="#6e3d1b" stroke-width="2" />
  <circle cx="95" cy="100" r="16" fill="#ffffff" opacity="0.98" stroke="#6e3d1b" stroke-width="2" />
</svg>
`.trim();

function toDataUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const CLINICAL_SAMPLE_CASES: ClinicalPresetCase[] = [
  {
    id: 'case_eczema',
    name: 'Atopic Eczema (Atopic Dermatitis)',
    shortName: 'Atopic Eczema (Atopic Dermatitis)',
    icdCode: 'L20.9',
    expectedCondition: 'Atopic Eczema (Atopic Dermatitis)',
    anatomicalSite: 'Antecubital fossae and volar forearms',
    clinicalNote: 'Pruritic erythematous flare with xerosis and scratch excoriation marks for 2 weeks.',
    badge: 'Eczematous',
    badgeColor: 'bg-rose-50 text-rose-700 border-rose-200',
    dataUrl: toDataUrl(eczemaSvg)
  },
  {
    id: 'case_psoriasis',
    name: 'Plaque Psoriasis (Psoriasis Vulgaris)',
    shortName: 'Plaque Psoriasis (Psoriasis Vulgaris)',
    icdCode: 'L40.0',
    expectedCondition: 'Plaque Psoriasis (Psoriasis Vulgaris)',
    anatomicalSite: 'Bilateral extensor elbows and knees',
    clinicalNote: 'Sharply demarcated salmon-pink plaque surmounted by thick silvery micaceous scales.',
    badge: 'Plaque / Scaly',
    badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
    dataUrl: toDataUrl(psoriasisSvg)
  },
  {
    id: 'case_tinea',
    name: 'Ringworm (Tinea Corporis)',
    shortName: 'Ringworm (Tinea Corporis)',
    icdCode: 'B35.4',
    expectedCondition: 'Ringworm (Tinea Corporis)',
    anatomicalSite: 'Left lateral thoracic torso',
    clinicalNote: 'Annular ring with leading raised scaly erythematous margin and central clearing.',
    badge: 'Annular Fungal',
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dataUrl: toDataUrl(tineaSvg)
  },
  {
    id: 'case_nevus',
    name: 'Atypical Mole (Dysplastic Nevus)',
    shortName: 'Atypical Mole (Dysplastic Nevus)',
    icdCode: 'D22.9',
    expectedCondition: 'Atypical Mole (Dysplastic Nevus)',
    anatomicalSite: 'Upper posterior interscapular back',
    clinicalNote: 'Dark brown and black pigmented macule with irregular contours under dermoscopy review.',
    badge: 'Melanocytic',
    badgeColor: 'bg-stone-100 text-stone-800 border-stone-300',
    dataUrl: toDataUrl(nevusSvg)
  },
  {
    id: 'case_acne',
    name: 'Acne (Acne Vulgaris)',
    shortName: 'Acne (Acne Vulgaris)',
    icdCode: 'L70.0',
    expectedCondition: 'Acne (Acne Vulgaris)',
    anatomicalSite: 'Centrofacial cheeks and chin',
    clinicalNote: 'Inflammatory erythematous papules, pustules, and open comedones in sebaceous zone.',
    badge: 'Follicular / Acne',
    badgeColor: 'bg-orange-50 text-orange-700 border-orange-200',
    dataUrl: toDataUrl(acneSvg)
  },
  {
    id: 'case_urticaria',
    name: 'Hives (Acute Urticaria)',
    shortName: 'Hives (Acute Urticaria)',
    icdCode: 'L50.9',
    expectedCondition: 'Hives (Acute Urticaria)',
    anatomicalSite: 'Dispersed over torso and extremities',
    clinicalNote: 'Transient raised edematous wheals with pale centers and intense surrounding erythema flare.',
    badge: 'Urticarial',
    badgeColor: 'bg-pink-50 text-pink-700 border-pink-200',
    dataUrl: toDataUrl(urticariaSvg)
  },
  {
    id: 'case_shingles',
    name: 'Shingles (Herpes Zoster)',
    shortName: 'Shingles (Herpes Zoster)',
    icdCode: 'B02.9',
    expectedCondition: 'Shingles (Herpes Zoster)',
    anatomicalSite: 'Left T5 thoracic dermatomal band',
    clinicalNote: 'Grouped tense umbilicated vesicles on an erythematous base with unilateral neuropathic burning pain.',
    badge: 'Vesicular / Blister',
    badgeColor: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    dataUrl: toDataUrl(shinglesSvg)
  },
  {
    id: 'case_vitiligo',
    name: 'Vitiligo (Vitiligo Vulgaris)',
    shortName: 'Vitiligo (Vitiligo Vulgaris)',
    icdCode: 'L80',
    expectedCondition: 'Vitiligo / White Patch Disease (Vitiligo Vulgaris)',
    anatomicalSite: 'Dorsal hands and peri-articular fingers',
    clinicalNote: 'Completely amelanotic, chalk-white depigmented macules with scalloped hyperpigmented border.',
    badge: 'Depigmented',
    badgeColor: 'bg-slate-100 text-slate-800 border-slate-300',
    dataUrl: toDataUrl(vitiligoSvg)
  }
];

