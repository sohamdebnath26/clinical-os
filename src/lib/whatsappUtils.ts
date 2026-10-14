import {
  Patient,
  Doctor,
  PrescriptionItem,
  Consultation,
  AIImageAnalysisResult,
  ProgressionAnalysisResult,
  DifferentialDiagnosis,
  ProcedureItem
} from '../types';

export interface WhatsAppFormatOptions {
  includeHeader?: boolean;
  includeDoctorContact?: boolean;
  includeDisclaimer?: boolean;
  includeCareInstructions?: boolean;
  customNote?: string;
}

/**
 * Clean phone number to valid international digits for wa.me / WhatsApp API
 */
export function cleanPhoneNumber(rawPhone: string, defaultCountryCode: string = '91'): string {
  if (!rawPhone) return '';
  // Remove spaces, dashes, brackets, pluses
  let digits = rawPhone.replace(/\D/g, '');

  // If user included leading 0, strip it
  if (digits.startsWith('0')) {
    digits = digits.replace(/^0+/, '');
  }

  // If phone is 10 digits (common for India, US), attach default country code if missing
  if (digits.length === 10) {
    const cleanCC = defaultCountryCode.replace(/\D/g, '');
    return `${cleanCC}${digits}`;
  }

  return digits;
}

/**
 * Generate direct WhatsApp Web / App universal link
 */
export function generateWhatsAppLink(cleanPhone: string, messageText: string, preferWeb: boolean = false): string {
  const encoded = encodeURIComponent(messageText);
  if (preferWeb) {
    return `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encoded}`;
  }
  return `https://wa.me/${cleanPhone}?text=${encoded}`;
}

/**
 * Generate WhatsApp text for AI / Clinical Image Diagnostic Report
 */
export function formatWhatsAppClinicalReport(params: {
  doctor?: Doctor | null;
  patient?: Patient | null;
  analysis: AIImageAnalysisResult;
  anatomicalSite?: string;
  options?: WhatsAppFormatOptions;
}): string {
  const { doctor, patient, analysis, anatomicalSite, options = {} } = params;
  const parts: string[] = [];

  // Header
  parts.push(`🏥 *${doctor?.clinicName || 'APEX CLINICAL PRACTICE & TELE-DERMATOLOGY'}*`);
  parts.push(`👨‍⚕️ *Dr. ${doctor?.name || 'Attending Physician'}*${doctor?.speciality ? ` (${doctor.speciality})` : ''}`);
  if (doctor?.registrationNumber) {
    parts.push(`📋 Reg No: ${doctor.registrationNumber}`);
  }
  parts.push(`━━━━━━━━━━━━━━━━━━━━━`);

  // Report Title
  parts.push(`🔬 *CLINICAL DERMOSCOPIC & IMAGE ANALYSIS REPORT*`);
  parts.push(`📅 *Date:* ${new Date(analysis.analyzedAt || Date.now()).toLocaleDateString('en-IN', { dateStyle: 'medium' })}`);
  parts.push(`🆔 *Ref ID:* ${analysis.id || 'N/A'}`);

  // Patient Info
  if (patient) {
    parts.push(`\n👤 *PATIENT DETAILS*`);
    parts.push(`• *Name:* ${patient.fullName}`);
    parts.push(`• *UHID / Code:* ${patient.patientCode}`);
    parts.push(`• *Age / Gender:* ${patient.age} Yrs / ${patient.gender}`);
  }
  if (anatomicalSite) {
    parts.push(`• *Lesion Site:* ${anatomicalSite}`);
  }

  // Primary Impression
  parts.push(`\n🎯 *PRIMARY CLINICAL IMPRESSION*`);
  parts.push(`*${analysis.primaryImpression.toUpperCase()}*`);

  // Differentials
  if (analysis.differentials && analysis.differentials.length > 0) {
    parts.push(`\n🔍 *DIFFERENTIAL DIAGNOSES*`);
    analysis.differentials.forEach((d: DifferentialDiagnosis, idx: number) => {
      parts.push(`${idx + 1}. *${d.condition}* (${d.confidence} Confidence)`);
      if (d.rationale) {
        parts.push(`   _${d.rationale}_`);
      }
    });
  }

  // Key Findings
  if (analysis.visualFindings && analysis.visualFindings.length > 0) {
    parts.push(`\n👁️ *VISUAL & DERMOSCOPIC FINDINGS*`);
    analysis.visualFindings.forEach((f: string) => parts.push(`• ${f}`));
  }

  // Red Flags / Precautions
  if (analysis.redFlags && analysis.redFlags.length > 0) {
    parts.push(`\n⚠️ *RED FLAGS & WARNING SIGNS*`);
    analysis.redFlags.forEach((rf: string) => parts.push(`• 🚨 ${rf}`));
  }

  // Recommended Investigations
  if (analysis.recommendedInvestigations && analysis.recommendedInvestigations.length > 0) {
    parts.push(`\n🧪 *RECOMMENDED TESTS / INVESTIGATIONS*`);
    analysis.recommendedInvestigations.forEach((test: string) => parts.push(`• ${test}`));
  }

  // Suggested Management
  if (analysis.suggestedManagementPlan) {
    parts.push(`\n💊 *RECOMMENDED CLINICAL MANAGEMENT*`);
    parts.push(analysis.suggestedManagementPlan);
  }

  // Custom Doctor's Note
  if (options.customNote?.trim()) {
    parts.push(`\n✍️ *DOCTOR'S DIRECT NOTE TO PATIENT:*`);
    parts.push(`"${options.customNote.trim()}"`);
  }

  // Clinic Contact & Disclaimer
  parts.push(`\n━━━━━━━━━━━━━━━━━━━━━`);
  if (doctor?.phone && options.includeDoctorContact !== false) {
    parts.push(`📞 *Clinic Helpline:* ${doctor.phone}`);
  }
  parts.push(`⚖️ *Confidential Medical Record:* Generated via Clinical Decision Support. Always consult with your treating physician prior to modifying treatment.`);

  return parts.join('\n');
}

/**
 * Generate WhatsApp text for Prescription (Rx)
 */
export function formatWhatsAppPrescription(params: {
  doctor: Doctor;
  patient: Patient;
  prescriptions: PrescriptionItem[];
  options?: WhatsAppFormatOptions;
}): string {
  const { doctor, patient, prescriptions, options = {} } = params;
  const parts: string[] = [];

  parts.push(`🏥 *${doctor.clinicName.toUpperCase()}*`);
  parts.push(`👨‍⚕️ *Dr. ${doctor.name}* (${doctor.speciality || 'Consultant Physician'})`);
  parts.push(`📋 Reg: ${doctor.registrationNumber}`);
  parts.push(`━━━━━━━━━━━━━━━━━━━━━`);

  parts.push(`💊 *OFFICIAL MEDICAL PRESCRIPTION (Rx)*`);
  parts.push(`📅 *Date:* ${new Date().toLocaleDateString('en-IN', { dateStyle: 'medium' })}`);

  parts.push(`\n👤 *PATIENT:* ${patient.fullName} (${patient.age}y / ${patient.gender})`);
  parts.push(`🆔 *UHID:* ${patient.patientCode}`);

  parts.push(`\n📋 *PRESCRIBED MEDICATIONS:*`);
  if (prescriptions.length === 0) {
    parts.push(`_No active oral or topical medications recorded._`);
  } else {
    prescriptions.forEach((rx: PrescriptionItem, index: number) => {
      parts.push(`\n*${index + 1}. ${rx.medicineName.toUpperCase()}*`);
      parts.push(`   • Dose: ${rx.dosage}`);
      parts.push(`   • Timing / Frequency: *${rx.frequency}*`);
      parts.push(`   • Duration: ${rx.duration}`);
      if (rx.instructions) {
        parts.push(`   • Instructions: _${rx.instructions}_`);
      }
    });
  }

  if (options.customNote?.trim()) {
    parts.push(`\n✍️ *DOCTOR'S ADVICE:*`);
    parts.push(`"${options.customNote.trim()}"`);
  }

  parts.push(`\n━━━━━━━━━━━━━━━━━━━━━`);
  if (doctor.phone) {
    parts.push(`📞 *For queries / clinic pharmacy:* ${doctor.phone}`);
  }
  parts.push(`⚠️ Take medicines strictly as directed. Keep out of reach of children.`);

  return parts.join('\n');
}

/**
 * Generate WhatsApp text for Consultation Visit Summary
 */
export function formatWhatsAppConsultationSummary(params: {
  doctor?: Doctor | null;
  patient: Patient;
  consultation: Consultation;
  options?: WhatsAppFormatOptions;
}): string {
  const { doctor, patient, consultation, options = {} } = params;
  const parts: string[] = [];

  parts.push(`🏥 *${doctor?.clinicName || 'CLINIC MEDICAL RECORD'}*`);
  parts.push(`👨‍⚕️ *Consultant:* Dr. ${consultation.doctorName || doctor?.name || 'Attending Physician'}`);
  parts.push(`━━━━━━━━━━━━━━━━━━━━━`);

  parts.push(`📋 *CLINICAL VISIT SUMMARY*`);
  parts.push(`📅 *Visit Date:* ${new Date(consultation.consultationDate).toLocaleDateString('en-IN', { dateStyle: 'medium' })}`);
  parts.push(`👤 *Patient:* ${patient.fullName} (${patient.patientCode})`);

  if (consultation.diagnoses && consultation.diagnoses.length > 0) {
    parts.push(`\n🎯 *DIAGNOSIS:*`);
    consultation.diagnoses.forEach((d: string) => parts.push(`• *${d}*`));
  }

  if (consultation.symptoms && consultation.symptoms.length > 0) {
    parts.push(`\n🩺 *CHIEF COMPLAINTS:*`);
    consultation.symptoms.forEach((s: string) => parts.push(`• ${s}`));
  }

  if (consultation.prescriptions && consultation.prescriptions.length > 0) {
    parts.push(`\n💊 *MEDICATIONS PRESCRIBED:*`);
    consultation.prescriptions.forEach((rx: PrescriptionItem, i: number) => {
      parts.push(`${i + 1}. *${rx.medicineName}* (${rx.dosage}) - ${rx.frequency} for ${rx.duration}`);
      if (rx.instructions) {
        parts.push(`   _${rx.instructions}_`);
      }
    });
  }

  if (consultation.procedures && consultation.procedures.length > 0) {
    parts.push(`\n💉 *PROCEDURES PERFORMED:*`);
    consultation.procedures.forEach((p: ProcedureItem) => parts.push(`• ${p.name}`));
  }

  if (consultation.followUp?.date) {
    parts.push(`\n🗓️ *NEXT SCHEDULED FOLLOW-UP:*`);
    parts.push(`*${new Date(consultation.followUp.date).toLocaleDateString('en-IN', { dateStyle: 'full' })}*`);
    if (consultation.followUp.instructions) {
      parts.push(`Note: ${consultation.followUp.instructions}`);
    }
  }

  if (options.customNote?.trim()) {
    parts.push(`\n✍️ *DOCTOR'S NOTE:*`);
    parts.push(`"${options.customNote.trim()}"`);
  }

  parts.push(`\n━━━━━━━━━━━━━━━━━━━━━`);
  if (doctor?.phone) {
    parts.push(`📞 *Clinic Contact:* ${doctor.phone}`);
  }
  parts.push(`🏥 Wishing you good health and a speedy recovery!`);

  return parts.join('\n');
}

/**
 * Generate WhatsApp text for Lesion Progression Assessment
 */
export function formatWhatsAppProgressionReport(params: {
  doctor?: Doctor | null;
  patient: Patient;
  progression: ProgressionAnalysisResult;
  options?: WhatsAppFormatOptions;
}): string {
  const { doctor, patient, progression, options = {} } = params;
  const parts: string[] = [];

  parts.push(`🏥 *${doctor?.clinicName || 'DERMATOLOGY CARE'}*`);
  parts.push(`👨‍⚕️ *Dr. ${doctor?.name || 'Attending Physician'}*`);
  parts.push(`━━━━━━━━━━━━━━━━━━━━━`);

  parts.push(`📈 *LESION PROGRESSION & HEALING REPORT*`);
  parts.push(`📅 *Assessment Date:* ${new Date(progression.analyzedAt || Date.now()).toLocaleDateString('en-IN', { dateStyle: 'medium' })}`);
  parts.push(`👤 *Patient:* ${patient.fullName} (${patient.patientCode})`);

  parts.push(`\n📊 *CLINICAL STATUS:* *${progression.overallProgression.toUpperCase()}*`);
  parts.push(`Healing Index: ${progression.progressionScore}/100`);

  if (progression.treatmentResponseSummary) {
    parts.push(`\n📝 *TREATMENT RESPONSE:*`);
    parts.push(progression.treatmentResponseSummary);
  }

  if (progression.visualComparisonObservations && progression.visualComparisonObservations.length > 0) {
    parts.push(`\n👁️ *OBSERVATIONS:*`);
    progression.visualComparisonObservations.forEach((obs: string) => parts.push(`• ${obs}`));
  }

  if (progression.recommendedAdjustments && progression.recommendedAdjustments.length > 0) {
    parts.push(`\n💊 *REGIMEN RECOMMENDATIONS:*`);
    progression.recommendedAdjustments.forEach((adj: string) => parts.push(`• ${adj}`));
  }

  if (options.customNote?.trim()) {
    parts.push(`\n✍️ *DOCTOR'S DIRECT NOTE:*`);
    parts.push(`"${options.customNote.trim()}"`);
  }

  parts.push(`\n━━━━━━━━━━━━━━━━━━━━━`);
  parts.push(`⚖️ *Apex Clinical EMR* • Please follow prescribed skincare and medical routine.`);

  return parts.join('\n');
}

/**
 * Generate WhatsApp text for Overall Patient Summary
 */
export function formatWhatsAppPatientSummary(params: {
  doctor?: Doctor | null;
  patient: Patient;
  activePrescriptions?: PrescriptionItem[];
  recentConsultation?: Consultation | null;
  options?: WhatsAppFormatOptions;
}): string {
  const { doctor, patient, activePrescriptions = [], recentConsultation, options = {} } = params;
  const parts: string[] = [];

  parts.push(`🏥 *${doctor?.clinicName || 'CLINIC MEDICAL RECORD'}*`);
  parts.push(`👨‍⚕️ *Dr. ${doctor?.name || 'Attending Physician'}*`);
  parts.push(`━━━━━━━━━━━━━━━━━━━━━`);

  parts.push(`📋 *PATIENT MEDICAL RECORD SUMMARY*`);
  parts.push(`📅 *Generated:* ${new Date().toLocaleDateString('en-IN', { dateStyle: 'medium' })}`);

  parts.push(`\n👤 *PATIENT PROFILE:*`);
  parts.push(`• Name: *${patient.fullName}*`);
  parts.push(`• UHID: *${patient.patientCode}*`);
  parts.push(`• Age/Gender: ${patient.age}y / ${patient.gender}`);
  if (patient.bloodGroup) parts.push(`• Blood Group: ${patient.bloodGroup}`);
  if (patient.allergies) parts.push(`• ⚠️ Allergies: *${patient.allergies}*`);
  if (patient.primaryDiagnosis) parts.push(`• Primary Condition: ${patient.primaryDiagnosis}`);

  if (activePrescriptions.length > 0) {
    parts.push(`\n💊 *CURRENT MEDICATIONS (${activePrescriptions.length}):*`);
    activePrescriptions.forEach((rx: PrescriptionItem, idx: number) => {
      parts.push(`${idx + 1}. ${rx.medicineName} (${rx.dosage}) - ${rx.frequency}`);
    });
  }

  if (recentConsultation) {
    parts.push(`\n🩺 *LATEST VISIT:* ${new Date(recentConsultation.consultationDate).toLocaleDateString('en-IN', { dateStyle: 'medium' })}`);
    if (recentConsultation.diagnoses?.length) {
      parts.push(`Diagnosis: ${recentConsultation.diagnoses.join(', ')}`);
    }
  }

  if (options.customNote?.trim()) {
    parts.push(`\n✍️ *DOCTOR'S NOTE:*`);
    parts.push(`"${options.customNote.trim()}"`);
  }

  parts.push(`\n━━━━━━━━━━━━━━━━━━━━━`);
  if (doctor?.phone) parts.push(`📞 *Clinic Phone:* ${doctor.phone}`);

  return parts.join('\n');
}
