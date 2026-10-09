import { GoogleGenAI } from '@google/genai';
import { Consultation, Patient } from '../src/types/index.js';
import dotenv from 'dotenv';

dotenv.config();

let genAI: GoogleGenAI | null = null;

function getAIClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  if (!genAI) {
    genAI = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
  }
  return genAI;
}

async function generateWithGemini(ai: GoogleGenAI, prompt: string): Promise<string | null> {
  const models = ['gemini-3.1-flash-lite', 'gemini-flash-latest', 'gemini-3.8-flash'];
  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt
      });
      const text = response.text?.trim();
      if (text) return text;
    } catch (err) {
      console.warn(`Attempt with ${model} failed, trying next:`, err);
    }
  }
  return null;
}

export function generateStructuredSummaryFallback(params: {
  date: string;
  symptoms: string[];
  diagnoses: string[];
  tests: string[];
  procedures: { name: string; cost: number }[];
  consultationFee: number;
  clinicalNotes?: { examination?: string; investigationsAdvised?: string; plan?: string };
  prescriptions?: { medicineName: string; dosage: string; frequency: string; duration: string }[];
  followUp?: { date?: string; instructions?: string };
}): string {
  const lines: string[] = [];
  const dateFormatted = params.date ? params.date.split('T')[0] : new Date().toISOString().split('T')[0];

  lines.push(`CONSULTATION — ${dateFormatted}`);
  lines.push('');

  if (params.symptoms && params.symptoms.length > 0) {
    lines.push('CHIEF COMPLAINTS / SYMPTOMS');
    params.symptoms.forEach(s => lines.push(`• ${s}`));
    lines.push('');
  }

  if (params.diagnoses && params.diagnoses.length > 0) {
    lines.push('DIAGNOSIS');
    params.diagnoses.forEach(d => lines.push(`• ${d}`));
    lines.push('');
  }

  if (params.tests && params.tests.length > 0) {
    lines.push('INVESTIGATIONS ORDERED');
    params.tests.forEach(t => lines.push(`• ${t}`));
    lines.push('');
  }

  if (params.clinicalNotes?.examination?.trim()) {
    lines.push('EXAMINATION FINDINGS');
    lines.push(params.clinicalNotes.examination.trim());
    lines.push('');
  }

  if (params.clinicalNotes?.plan?.trim()) {
    lines.push('TREATMENT PLAN');
    lines.push(params.clinicalNotes.plan.trim());
    lines.push('');
  }

  if (params.prescriptions && params.prescriptions.length > 0) {
    lines.push('MEDICATIONS PRESCRIBED');
    params.prescriptions.forEach(p => {
      lines.push(`• ${p.medicineName} — ${p.dosage} (${p.frequency}) for ${p.duration}`);
    });
    lines.push('');
  }

  if (params.followUp?.date) {
    lines.push(`FOLLOW-UP ADVISED: ${params.followUp.date}${params.followUp.instructions ? ` (${params.followUp.instructions})` : ''}`);
    lines.push('');
  }

  const procedureTotal = (params.procedures || []).reduce((acc, p) => acc + (p.cost || 0), 0);
  const total = procedureTotal + (params.consultationFee || 0);

  lines.push('CHARGES');
  lines.push(`• Procedures: ₹${procedureTotal}`);
  lines.push(`• Consultation fee: ₹${params.consultationFee}`);
  lines.push(`• Total: ₹${total}`);

  return lines.join('\n');
}

export async function summarizeConsultationWithAI(data: {
  patient: { name: string; age: number; gender: string; code: string };
  date: string;
  symptoms: string[];
  diagnoses: string[];
  tests: string[];
  procedures: { name: string; cost: number }[];
  consultationFee: number;
  clinicalNotes?: { examination?: string; investigationsAdvised?: string; plan?: string };
}): Promise<string> {
  const fallback = generateStructuredSummaryFallback(data);
  const ai = getAIClient();
  if (!ai) {
    return fallback;
  }

  try {
    const prompt = `You are a conservative medical AI documentation assistant for a clinical EMR system.
Format a succinct, accurate, professional clinical consultation summary based EXCLUSIVELY on the provided inputs.
CRITICAL SAFETY RULES:
1. NEVER fabricate or infer any symptoms, diagnoses, medications, lab values, or findings not explicitly provided.
2. If a section has no data, omit it.
3. Keep the format clean and professional, matching this clinical standard:

CONSULTATION — ${data.date.split('T')[0]}

DIAGNOSIS
${data.diagnoses.length > 0 ? data.diagnoses.map(d => `• ${d}`).join('\n') : '• Pending evaluation'}

${data.symptoms.length > 0 ? `SYMPTOMS\n${data.symptoms.map(s => `• ${s}`).join('\n')}\n` : ''}
${data.procedures.length > 0 ? `PROCEDURES PERFORMED\n${data.procedures.map(p => `• ${p.name} (₹${p.cost})`).join('\n')}\n` : ''}
${data.clinicalNotes?.examination ? `EXAMINATION\n${data.clinicalNotes.examination}\n` : ''}
${data.clinicalNotes?.plan ? `PLAN\n${data.clinicalNotes.plan}\n` : ''}

CHARGES
• Procedures: ₹${data.procedures.reduce((sum, p) => sum + (p.cost || 0), 0)}
• Consultation fee: ₹${data.consultationFee}
• Total: ₹${data.procedures.reduce((sum, p) => sum + (p.cost || 0), 0) + data.consultationFee}

Input Data:
${JSON.stringify(data, null, 2)}
`;

    const text = await generateWithGemini(ai, prompt);
    return text || fallback;
  } catch (error) {
    console.warn('Gemini API call failed, using clinical fallback:', error);
    return fallback;
  }
}

export async function askAIAssistant(params: {
  question: string;
  patient?: Patient;
  history?: Consultation[];
  allPatients?: Patient[];
  contextType?: 'soap' | 'summary' | 'medications' | 'followup' | 'general';
}): Promise<{ answer: string; isAiPowered: boolean }> {
  const ai = getAIClient();

  // Structured factual response generator from documented records
  if (!params.patient) {
    const patientsList = params.allPatients || [];
    const directoryOverview = patientsList.length > 0
      ? `CURRENT CLINIC PATIENT REGISTRY (${patientsList.length} registered patients):
${patientsList.map(p => `• ${p.fullName} (${p.patientCode}, ${p.gender}, ${p.age}y) — Mobile: ${p.mobile}; Allergies: ${p.allergies || 'None'}; Blood: ${p.bloodGroup || 'N/A'}; Diagnosis: ${p.primaryDiagnosis || 'None'}`).join('\n')}`
      : 'No patients currently in database.';

    if (!ai) {
      if (params.question.toLowerCase().includes('patient') || params.question.toLowerCase().includes('list')) {
        return {
          answer: `### Clinic Patient Directory (${patientsList.length} patients)\n\n${directoryOverview}`,
          isAiPowered: false
        };
      }
      return {
        answer: `Clinical OS AI Assistant: I am ready to assist with clinical documentation, differential diagnoses, or medical protocols. Please select a patient to view grounded clinical insights from their documented record.`,
        isAiPowered: false
      };
    }

    try {
      const prompt = `You are an evidence-based clinical reasoning assistant for doctors in an outpatient clinic.
You have access to the clinic's patient registry:
${directoryOverview}

Answer the physician's query concisely and conservatively. Adhere strictly to verified medical guidelines and documented patient facts.
If the doctor asks about a patient from the list, provide their details accurately.

Query: ${params.question}`;

      const text = await generateWithGemini(ai, prompt);
      if (text) {
        return { answer: text, isAiPowered: true };
      }
      return {
        answer: `### Clinic Patient Directory (${patientsList.length} patients)\n\n${directoryOverview}`,
        isAiPowered: false
      };
    } catch (err) {
      console.warn('AI query error:', err);
      return {
        answer: 'Clinical Assistant is active in offline deterministic mode. Please verify network or API key configuration.',
        isAiPowered: false
      };
    }
  }

  // With Patient context
  const patient = params.patient;
  const history = params.history || [];

  const documentedSummary = `
PATIENT RECORD:
Name: ${patient.fullName} (${patient.gender}, ${patient.age} years old)
Patient Code: ${patient.patientCode}
Blood Group: ${patient.bloodGroup || 'Not recorded'}
Allergies: ${patient.allergies || 'None documented'}
Current Medications: ${patient.currentMedications || 'None documented'}
Known Medical History: ${patient.medicalHistory || 'None documented'}
Total Visits Documented: ${history.length}

RECORDED ENCOUNTERS:
${history.map((h, i) => `
Visit #${history.length - i} on ${h.consultationDate.split('T')[0]}:
- Symptoms: ${h.symptoms.join(', ') || 'None'}
- Diagnoses: ${h.diagnoses.join(', ') || 'None'}
- Tests: ${h.tests.join(', ') || 'None'}
- Procedures: ${h.procedures.map(p => p.name).join(', ') || 'None'}
- Examination: ${h.clinicalNotes?.examination || 'None'}
- Plan: ${h.clinicalNotes?.plan || 'None'}
- Medications: ${h.prescriptions.map(p => `${p.medicineName} (${p.dosage}, ${p.frequency})`).join('; ') || 'None'}
- Follow-up: ${h.followUp?.date || 'None'}
`).join('\n')}
  `.trim();

  // Try Gemini with fallback
  if (ai) {
    try {
      const prompt = `You are Clinical OS AI, a conservative, board-certified clinical assistant.
The physician is reviewing patient ${patient.fullName}.
Answer the physician's prompt accurately, concisely, and with extreme clinical rigor.
STRICT RULE: Only use facts from the DOCUMENTED PATIENT RECORD below. NEVER fabricate symptoms, allergies, lab findings, or treatment outcomes.

${documentedSummary}

PHYSICIAN PROMPT:
${params.question}
`;

      const text = await generateWithGemini(ai, prompt);
      if (text) {
        return {
          answer: text,
          isAiPowered: true
        };
      }
    } catch (err) {
      console.warn('Gemini Assistant error, using deterministic fallback:', err);
    }
  }

  // Deterministic clinical response
  if (params.contextType === 'summary' || params.question.toLowerCase().includes('summarize')) {
    const allDiagnoses = Array.from(new Set(history.flatMap(h => h.diagnoses)));
    const allSymptoms = Array.from(new Set(history.flatMap(h => h.symptoms)));
    return {
      answer: `### Clinical Summary: ${patient.fullName} (${patient.patientCode})
- **Demographics**: ${patient.age}y, ${patient.gender}, Blood Group: ${patient.bloodGroup || 'N/A'}
- **Total Encounters**: ${history.length} visit(s)
- **Documented Diagnoses**: ${allDiagnoses.length > 0 ? allDiagnoses.join(', ') : 'None recorded'}
- **Reported Symptoms**: ${allSymptoms.length > 0 ? allSymptoms.join(', ') : 'None recorded'}
- **Known Allergies**: ${patient.allergies || 'None documented'}
- **Current Medications**: ${patient.currentMedications || 'None documented'}
- **Latest Visit**: ${history[0] ? `${history[0].consultationDate.split('T')[0]} (${history[0].diagnoses.join(', ') || 'Consultation'})` : 'No visits yet'}

*(Generated strictly from documented patient encounters)*`,
      isAiPowered: false
    };
  }

  if (params.contextType === 'soap') {
    const latest = history[0];
    return {
      answer: `### Structured SOAP Note: ${patient.fullName} (${patient.patientCode})
**Subjective (S):**
- Age/Gender: ${patient.age}y ${patient.gender}
- Chief Complaints: ${latest?.symptoms.join(', ') || 'Routine outpatient presentation'}
- Allergies: ${patient.allergies || 'NKDA'}

**Objective (O):**
- Examination Findings: ${latest?.clinicalNotes?.examination || 'Vital signs stable, localized assessment completed.'}
- Diagnostic Tests: ${latest?.tests.join(', ') || 'None ordered today'}

**Assessment (A):**
- Primary Diagnosis: ${latest?.diagnoses.join(', ') || 'Under evaluation'}

**Plan (P):**
- Procedures: ${latest?.procedures.map(p => p.name).join(', ') || 'None'}
- Prescriptions: ${latest?.prescriptions.map(p => `${p.medicineName} ${p.dosage} ${p.frequency}`).join(', ') || 'None'}
- Instructions: ${latest?.clinicalNotes?.plan || 'Patient instructed on skin care hygiene and compliance.'}
- Follow-up: ${latest?.followUp?.date || 'As needed'}`,
      isAiPowered: false
    };
  }

  if (params.contextType === 'medications') {
    const allPrescriptions = history.flatMap(h => h.prescriptions);
    return {
      answer: `### Documented Medications for ${patient.fullName}:
${allPrescriptions.length > 0
  ? allPrescriptions.map(p => `• **${p.medicineName}** — ${p.dosage} (${p.frequency}) for ${p.duration}. *Instructions: ${p.instructions || 'As advised'}*`).join('\n')
  : patient.currentMedications
  ? `• **Ongoing Medications**: ${patient.currentMedications}`
  : 'No active or historical medications recorded for this patient in the system.'}`,
      isAiPowered: false
    };
  }

  if (params.contextType === 'followup') {
    const latest = history[0];
    return {
      answer: `### Follow-up Care Plan for ${patient.fullName}:
- **Scheduled Date**: ${latest?.followUp?.date || 'Not explicitly scheduled'}
- **Specific Clinical Instructions**: ${latest?.followUp?.instructions || latest?.clinicalNotes?.plan || 'Continue prescribed regimen and report back if symptoms flare.'}
- **Monitoring Parameters**: Monitor for symptom resolution or adverse drug reactions.`,
      isAiPowered: false
    };
  }

  return {
    answer: `### Patient Overview (${patient.fullName} · ${patient.patientCode})
${documentedSummary}`,
    isAiPowered: false
  };
}
