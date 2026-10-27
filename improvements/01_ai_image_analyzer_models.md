# Spec 01: AI Image Analyzer & Model Upgrades

## Overview
This specification details the roadmap and code blueprints for upgrading the **AI Clinical Image Analyzer** from basic fast screening to an advanced, multi-modal clinical diagnostic engine capable of nuanced dermatoscopy and lesion progression monitoring.

---

## 1. Upgraded Model Hierarchy

### Current Architecture
Currently, `server/ai.ts` cascades through:
```ts
const models = ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
```
While fast (<1.5s latency), high-throughput models are great for quick triage, specialized clinical image analysis benefits substantially from deep reasoning and high-resolution spatial attention.

### Proposed Multi-Tier Model Ladder
```
Tier 1: Pro Deep Reasoning Model (`gemini-3.1-pro-preview`)
        └── Used for initial complex image analysis, high-suspicion ABCDE lesion evaluations, and differential ranking.
Tier 2: Flash Extended Thinking Model (`gemini-3.8-flash` with `thinkingConfig`)
        └── Used when Pro model exceeds latency timeout or during high-throughput triage.
Tier 3: Standard Fast Model (`gemini-flash-latest`)
        └── Robust fallback ensuring zero downtime.
```

---

## 2. Implementation: Extended Thinking Budget

Enabling `thinkingConfig` instructs the Gemini model to deliberate internally through differential options before generating the final JSON:

```ts
// server/ai.ts upgrade snippet
const response = await ai.models.generateContent({
  model: 'gemini-3.8-flash',
  contents: [
    {
      role: 'user',
      parts: [
        { inlineData: { mimeType, data: imageBase64 } },
        { text: clinicalPrompt }
      ]
    }
  ],
  config: {
    // Enable internal clinical chain-of-thought
    thinkingConfig: {
      thinkingBudget: 2048 // Allocates internal reasoning tokens
    },
    temperature: 0.15,
    responseMimeType: 'application/json'
  }
});
```

### Benefits:
- Reduces diagnostic hallucinations on ambiguous rashes.
- Evaluates atypical presentations (e.g., amelanotic melanoma, hypopigmented mycosis fungoides).
- Balances high-risk conditions vs. benign mimics before finalizing confidence levels.

---

## 3. Dermatoscopic Feature Taxonomy Extraction

Currently, the model outputs broad visual findings. The upgraded pipeline will extract structured dermatoscopy criteria based on the **International Dermoscopy Society (IDS)** 2-step algorithm:

### Structured Criteria To Add:
1. **Pigment Network Structure**:
   - `Typical / Regular` (delicate, uniform meshwork)
   - `Atypical / Broadened` (thickened cords, irregular meshwork)
   - `Absent`
2. **Dots & Globules**:
   - `Regular / Centrally located`
   - `Irregular / Peripheral rim of globules`
3. **Streaks & Pseudopods**:
   - `Radial streaming / Asymmetric starburst pattern`
4. **Blue-White Veil & Regression Structures**:
   - `Confluent blue-gray pigmentation with ground-glass haze`
   - `Peppering / Scar-like depigmentation`
5. **Vascular Morphology**:
   - `Arborizing telangiectasia` (Basal Cell Carcinoma indicator)
   - `Comma vessels` (Intradermal nevus)
   - `Hairpin / Dotted vessels with white halo` (Keratoacanthoma / Warts)
   - `Polymorphous / Milky-red areas` (Melanoma suspicion)

---

## 4. Fitzpatrick Skin Phototype Calibration (Types I–VI)

Dermatological presentations vary significantly across skin tones. For instance, erythema on Fitzpatrick Type I appears bright pink/red, whereas on Type V–VI skin it frequently manifests as violaceous, grayish, or hyperpigmented macules.

### Enhanced Prompt Directive:
```
PATIENT SKIN PHOTOTYPE CONTEXT:
Patient Fitzpatrick Skin Phototype: {patient.fitzpatrickType || 'Not specified'}
- For Fitzpatrick Types IV-VI (Melanin-rich skin):
  - Do NOT expect bright erythema; actively look for hyperpigmentation, violaceous hues, and follicular accentuation.
  - Evaluate risk of Post-Inflammatory Hyperpigmentation (PIH).
  - Screen for conditions with higher prevalence or distinctive morphology in skin of color (e.g., Traction Alopecia, Keloids, Dermatosis Papulosa Nigra).
```

---

## 5. Dual-View Analysis (Clinical Macro + Polarized Dermatoscope)

Clinicians obtain the highest diagnostic accuracy when pairing a macro contextual photo (showing the anatomical body region) with a contact dermatoscope photo.

### Architectural Flow:
1. **Frontend Update (`ImageAnalyzerView.tsx`)**:
   - Dual upload boxes: `Macro / Anatomical View` + `Contact Dermatoscope View`.
2. **Backend Multi-Part Image Ingestion (`server/ai.ts`)**:
   ```ts
   contents: [
     {
       role: 'user',
       parts: [
         { inlineData: { mimeType: 'image/jpeg', data: macroImageBase64 } },
         { text: 'IMAGE A: Clinical macroscopic view showing lesion anatomical context.' },
         { inlineData: { mimeType: 'image/jpeg', data: dermoscopicImageBase64 } },
         { text: 'IMAGE B: High-magnification polarized dermoscopy of the target lesion.' },
         { text: diagnosticPrompt }
       ]
     }
   ]
   ```
3. **Cross-Attention Output**:
   - Macro view evaluates body site, sun damage extent, and background skin status.
   - Dermoscopy view evaluates micro-vascular patterns and pigment network architecture.

---

## 6. Standardized ICD-11 & SNOMED-CT Mapping

Automatically link differential diagnoses to standardized medical ontologies:

```json
{
  "condition": "Basal Cell Carcinoma, Nodular Subtype",
  "confidence": "High",
  "icd11Code": "2C30.0",
  "snomedCtCode": "254701007",
  "urgency": "Urgent",
  "recommendedAction": "Excisional biopsy with 4mm lateral margins"
}
```
