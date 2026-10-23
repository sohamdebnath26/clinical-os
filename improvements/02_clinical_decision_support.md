# Spec 02: Advanced Clinical Decision Support (CDSS)

## Overview
This specification outlines future clinical decision support enhancements for Clinical OS, designed to safeguard patient safety during prescribing and standardizing clinical outcome scoring.

---

## 1. Automated Drug-Drug Interaction (DDI) & Allergy Checker

### Problem Statement
In outpatient dermatology and internal medicine, polypharmacy can lead to adverse events (e.g., combining oral Retinoids with Tetracyclines causing pseudotumor cerebri, or prescribing Azole antifungals with Statins increasing rhabdomyolysis risk).

### Implementation Plan
1. **Clinical Catalog Augmentation (`src/data/clinicalCatalogues.ts`)**:
   - Add interaction metadata to medication entries:
     ```ts
     export interface DrugInteractionRule {
       drugA: string;
       drugB: string;
       severity: 'severe' | 'moderate' | 'minor';
       mechanism: string;
       clinicalAdvice: string;
     }
     ```
2. **Real-Time Prescription Audit in `ConsultationModal.tsx`**:
   - Whenever a medication is added to the prescription list:
     - Cross-check against the patient's existing `patient.allergies` string.
     - Cross-check all pairs in `prescriptions` array against the interaction rule base.
     - Display an amber (moderate) or red (severe) warning badge before the doctor signs the visit.

---

## 2. Standardized Clinical Severity Calculators

Dermatological treatments (e.g., biologics, systemic immunosuppressants) require standardized quantitative severity scoring for therapy eligibility and monitoring.

### Proposed Calculators:
1. **PASI (Psoriasis Area and Severity Index)**:
   - Evaluates Erythema, Induration, and Desquamation (0–4) across 4 body regions (Head, Upper Extremities, Trunk, Lower Extremities).
   - Generates score (0–72) to track response (e.g., PASI-75 / PASI-90 achievement).
2. **SCORAD (Scoring Atopic Dermatitis)**:
   - Combines extent of eczema (Rule of Nines, 0–100), intensity criteria (erythema, edema, excoriation, lichenification, 0–18), and subjective symptoms (itch, sleep loss, 0–20).
3. **DLQI (Dermatology Life Quality Index)**:
   - 10-question validated patient questionnaire calculating quality of life impairment (0–30).

---

## 3. Multimodal Lab Report & Biopsy Histology Parsing

Allowing doctors to upload laboratory blood reports (CBC, Liver Function Tests, Serum IgE) or histopathology biopsy reports (PDF or photo) directly into the patient record:

### Architecture:
1. **Upload Component**: Doctor drops a PDF or photo in the patient encounter.
2. **Extraction Engine (`server/ai.ts`)**:
   - Uses `gemini-3.8-flash` with document understanding.
   - Extracts:
     - Biopsy site, specimen type, microscopic description, diagnosis (e.g., "Lichenoid interface dermatitis with civatte bodies").
     - Abnormal lab markers flagged in red (e.g., Elevated ALT/AST prior to Methotrexate/Isotretinoin initiation).
3. **Timeline Integration**: Extracted structured findings auto-populate into the patient's chronological timeline.
