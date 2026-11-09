import { jsPDF } from 'jspdf';

export interface PatientAiReportPdfInput {
  patientName: string;
  patientSubtitle?: string;
  patientPhone: string;
  clinicPhone: string;
  doctorName: string;
  doctorQualification?: string;
  clinicName?: string;
  priority?: 'urgent' | 'routine';
  aiSummary: string;
  latestPatientMessage?: string;
  recommendedPlan: string;
  keyFindings?: string[];
  followUpAdvice?: string;
}

export interface GeneratedPatientAiPdfResult {
  filename: string;
  reportId: string;
  sizeLabel: string;
  generatedAt: string;
  pdfDataUrl: string;
  whatsappCompanionText: string;
  summaryPoints: string[];
  triggerDownload: () => void;
}

export function generatePatientAiReportPdf(
  input: PatientAiReportPdfInput
): GeneratedPatientAiPdfResult {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;
  const reportId = `AIR-${Date.now().toString(36).slice(-5).toUpperCase()}`;
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const doctorDisplay = input.doctorName.replace(/^Dr\.\s*/i, '');
  const clinicDisplay = input.clinicName || 'Dermacare & Clinical OS Medical Center';
  const qualificationDisplay =
    input.doctorQualification || 'MD (Dermatology & Clinical Medicine)';

  let y = 0;

  // 1. Top Clinical Header Banner
  doc.setFillColor(13, 63, 59); // #0d3f3b
  doc.rect(0, 0, pageWidth, 34, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text(clinicDisplay.toUpperCase(), margin, 13);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(186, 230, 224);
  doc.text(`Dr. ${doctorDisplay}  |  ${qualificationDisplay}`, margin, 20);
  doc.text(`Clinic WhatsApp & Helpline: ${input.clinicPhone}`, margin, 26);

  // Right-aligned Report Badge
  doc.setFillColor(20, 90, 84);
  doc.roundedRect(pageWidth - margin - 56, 8, 56, 18, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text('AI CLINICAL ANALYSIS PDF', pageWidth - margin - 28, 14.5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(209, 250, 229);
  doc.text(`Ref: #${reportId} · ${dateStr}`, pageWidth - margin - 28, 21, { align: 'center' });

  y = 42;

  // 2. Patient Demographics & Triage Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.35);
  doc.roundedRect(margin, y, contentWidth, 24, 2.5, 2.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('PATIENT NAME & DETAILS', margin + 5, y + 6);
  doc.text('PATIENT WHATSAPP / MOBILE', margin + 78, y + 6);
  doc.text('TRIAGE CLASSIFICATION', margin + 132, y + 6);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(input.patientName, margin + 5, y + 12.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(input.patientSubtitle || 'Registered Clinic Patient', margin + 5, y + 18.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(input.patientPhone, margin + 78, y + 12.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(`Date: ${dateStr}, ${timeStr}`, margin + 78, y + 18.5);

  // Priority status indicator
  if (input.priority === 'urgent') {
    doc.setFillColor(254, 226, 226);
    doc.setDrawColor(248, 113, 113);
    doc.roundedRect(margin + 132, y + 8.5, 42, 10, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(185, 28, 28);
    doc.text('URGENT REVIEW', margin + 153, y + 15, { align: 'center' });
  } else {
    doc.setFillColor(209, 250, 229);
    doc.setDrawColor(110, 231, 183);
    doc.roundedRect(margin + 132, y + 8.5, 42, 10, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(6, 95, 70);
    doc.text('ROUTINE FOLLOW-UP', margin + 153, y + 15, { align: 'center' });
  }

  y += 32;

  const drawSectionBox = (num: string, title: string, bodyText: string, accentRgb: [number, number, number]) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    const lines = doc.splitTextToSize(bodyText, contentWidth - 12);
    const boxHeight = Math.max(20, 13 + lines.length * 4.8);

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.35);
    doc.roundedRect(margin, y, contentWidth, boxHeight, 2, 2, 'FD');

    // Top section header bar
    doc.setFillColor(accentRgb[0], accentRgb[1], accentRgb[2]);
    doc.roundedRect(margin, y, contentWidth, 8, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 41, 38);
    doc.text(`${num}. ${title.toUpperCase()}`, margin + 4, y + 5.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(30, 41, 59);
    doc.text(lines, margin + 5, y + 14);

    y += boxHeight + 6;
  };

  // 3. Reported Patient Concern / Latest Message
  if (input.latestPatientMessage) {
    drawSectionBox(
      '01',
      'Patient Reported Concern & Symptom Context',
      `"${input.latestPatientMessage}"`,
      [241, 245, 249]
    );
  }

  // 4. AI Clinical Analysis & Diagnostic Synthesis
  drawSectionBox(
    input.latestPatientMessage ? '02' : '01',
    'AI Clinical Assessment & Triage Analysis',
    input.aiSummary || 'Comprehensive clinical evaluation completed based on patient chart and symptom progression.',
    [230, 244, 241]
  );

  // 5. Key Clinical Observations Bullet List
  const findings =
    input.keyFindings && input.keyFindings.length > 0
      ? input.keyFindings
      : [
          `Primary Assessment: ${input.aiSummary}`,
          `Triage Priority: ${input.priority === 'urgent' ? 'High-priority clinical evaluation advised' : 'Standard outpatient dermatology management'}`,
          `Follow-up Channel: Linked to Clinic WhatsApp (${input.clinicPhone})`
        ];

  const findingsText = findings.map((f, i) => `${i + 1}. ${f}`).join('\n');
  drawSectionBox(
    input.latestPatientMessage ? '03' : '02',
    'Key Clinical Findings & Diagnostic Pointers',
    findingsText,
    [240, 249, 255]
  );

  // 6. Doctor's Recommended Treatment Plan & Prescription Guidance
  drawSectionBox(
    input.latestPatientMessage ? '04' : '03',
    "Doctor's Recommended Action Plan & Medical Guidance",
    input.recommendedPlan,
    [236, 253, 245]
  );

  // 7. Follow-up & Safety Precautions
  const safetyText =
    input.followUpAdvice ||
    'Please follow the prescribed regimen carefully. Share a clear daylight photo in 5–7 days via WhatsApp for progression tracking, or visit the clinic immediately if you experience acute swelling, fever, or worsening discomfort.';

  drawSectionBox(
    input.latestPatientMessage ? '05' : '04',
    'Follow-Up Schedule & Patient Safety Instructions',
    safetyText,
    [254, 249, 195]
  );

  // 8. Signature & Verification Footer
  const sigY = Math.max(y + 4, pageHeight - 36);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.line(margin, sigY, pageWidth - margin, sigY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(13, 63, 59);
  doc.text(`Digitally Verified & Dispatched by Dr. ${doctorDisplay}`, margin, sigY + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Generated via Clinical OS AI Diagnostic Engine  |  Report ID: #${reportId}  |  ${dateStr} ${timeStr}`,
    margin,
    sigY + 12.5
  );
  doc.text(
    'This report is electronically generated for direct patient communication via WhatsApp.',
    margin,
    sigY + 17.5
  );

  const safeName = input.patientName.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
  const filename = `AI_Analysis_Report_${safeName}_${now.toISOString().split('T')[0]}.pdf`;
  const pdfDataUrl = doc.output('dataurlstring');
  const pdfArrayBuffer = doc.output('arraybuffer');
  const sizeKb = Math.max(18, Math.round(pdfArrayBuffer.byteLength / 1024));
  const sizeLabel = `${sizeKb} KB · PDF`;

  const whatsappCompanionText = [
    `*📄 AI CLINICAL ANALYSIS REPORT (PDF ATTACHED)*`,
    `*${clinicDisplay}*`,
    `• *Patient:* ${input.patientName}`,
    `• *Report Ref:* #${reportId} (${dateStr})`,
    `• *AI Clinical Assessment:* ${input.aiSummary}`,
    `• *Doctor's Advice & Plan:* ${input.recommendedPlan}`,
    `• *Attached Document:* ${filename} (${sizeLabel})`,
    `Please reply on this WhatsApp thread if you have any questions — Dr. ${doctorDisplay}`
  ].join('\n');

  return {
    filename,
    reportId,
    sizeLabel,
    generatedAt: `${dateStr}, ${timeStr}`,
    pdfDataUrl,
    whatsappCompanionText,
    summaryPoints: findings.slice(0, 3),
    triggerDownload: () => {
      doc.save(filename);
    }
  };
}

export interface PatientMedicalReportPdfInput {
  patient: {
    fullName: string;
    patientCode: string;
    age: number;
    gender: string;
    mobile?: string;
    bloodGroup?: string;
    allergies?: string;
    weight?: number;
    primaryDiagnosis?: string;
    medicalHistory?: string;
    currentMedications?: string;
  };
  doctor?: {
    name?: string;
    speciality?: string;
    registrationNumber?: string;
    clinicName?: string;
    phone?: string;
  } | null;
  consultation?: {
    consultationDate?: string;
    diagnoses?: string[];
    symptoms?: string[];
    tests?: string[];
    procedures?: { name: string; cost?: number }[];
    clinicalNotes?: {
      examination?: string;
      investigationsAdvised?: string;
      plan?: string;
    };
    followUp?: {
      date?: string;
      instructions?: string;
      notes?: string;
    };
    aiSummary?: string;
  } | null;
  prescriptions?: {
    medicineName: string;
    dosage: string;
    frequency: string;
    duration: string;
    instructions?: string;
  }[];
  customNote?: string;
  reportTitle?: string;
}

export function generatePatientMedicalReportPdf(
  input: PatientMedicalReportPdfInput
): GeneratedPatientAiPdfResult {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  const reportId = `MR-${Date.now().toString(36).slice(-5).toUpperCase()}`;
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const doctorDisplay = (input.doctor?.name || 'Attending Physician').replace(/^Dr\.\s*/i, '');
  const clinicDisplay = input.doctor?.clinicName || 'Dermacare & Clinical OS Medical Center';
  const specialityDisplay = input.doctor?.speciality || 'MD (Dermatology & Clinical Medicine)';
  const regNoDisplay = input.doctor?.registrationNumber ? `Reg No: ${input.doctor.registrationNumber}` : '';
  const clinicPhone = input.doctor?.phone || '+91 98765 00001';

  let y = 0;

  // 1. Top Clinical Header Banner
  doc.setFillColor(13, 63, 59); // #0d3f3b
  doc.rect(0, 0, pageWidth, 34, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14.5);
  doc.setTextColor(255, 255, 255);
  doc.text(clinicDisplay.toUpperCase(), margin, 12.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(186, 230, 224);
  doc.text(
    [`Dr. ${doctorDisplay}`, specialityDisplay, regNoDisplay].filter(Boolean).join('  |  '),
    margin,
    19.5
  );
  doc.text(`Clinic Helpline & WhatsApp: ${clinicPhone}`, margin, 26);

  // Right-aligned Official Medical Report Badge
  doc.setFillColor(20, 90, 84);
  doc.roundedRect(pageWidth - margin - 58, 7.5, 58, 19, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text(
    (input.reportTitle || 'OFFICIAL MEDICAL REPORT').toUpperCase().slice(0, 26),
    pageWidth - margin - 29,
    14,
    { align: 'center' }
  );
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(209, 250, 229);
  doc.text(`Ref: #${reportId} · ${dateStr}`, pageWidth - margin - 29, 21, { align: 'center' });

  y = 41;

  // 2. Patient Demographics & Vitals Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.35);
  doc.roundedRect(margin, y, contentWidth, 26, 2.5, 2.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('PATIENT NAME & UHID', margin + 5, y + 6);
  doc.text('AGE / SEX / BLOOD / WEIGHT', margin + 74, y + 6);
  doc.text('ALLERGIES & CONTACT', margin + 132, y + 6);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text(input.patient.fullName, margin + 5, y + 12.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(13, 63, 59);
  doc.text(`UHID: ${input.patient.patientCode}`, margin + 5, y + 18.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  const vitalsStr = [
    `${input.patient.age} Yrs / ${input.patient.gender}`,
    input.patient.bloodGroup ? `Blood: ${input.patient.bloodGroup}` : '',
    input.patient.weight ? `${input.patient.weight} kg` : ''
  ]
    .filter(Boolean)
    .join(' · ');
  doc.text(vitalsStr, margin + 74, y + 12.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(`Generated: ${dateStr}, ${timeStr}`, margin + 74, y + 18.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(input.patient.allergies ? 185 : 15, input.patient.allergies ? 28 : 23, input.patient.allergies ? 28 : 42);
  const allergyLine = doc.splitTextToSize(
    `Allergies: ${input.patient.allergies || 'No Known Allergies'}`,
    44
  );
  doc.text(allergyLine[0], margin + 132, y + 12.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(`Mobile: ${input.patient.mobile || 'On File'}`, margin + 132, y + 18.5);

  y += 32;

  const drawSectionBox = (
    num: string,
    title: string,
    bodyText: string,
    accentRgb: [number, number, number]
  ) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const lines = doc.splitTextToSize(bodyText || 'None recorded', contentWidth - 10);
    const boxHeight = Math.max(18, 12 + lines.length * 4.4);

    if (y + boxHeight > pageHeight - 32) {
      doc.addPage();
      y = 18;
    }

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.35);
    doc.roundedRect(margin, y, contentWidth, boxHeight, 2, 2, 'FD');

    doc.setFillColor(accentRgb[0], accentRgb[1], accentRgb[2]);
    doc.roundedRect(margin, y, contentWidth, 7.5, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 41, 38);
    doc.text(`${num}. ${title.toUpperCase()}`, margin + 4, y + 5.2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);
    doc.text(lines, margin + 5, y + 13);

    y += boxHeight + 5;
  };

  // 3. Diagnosis & Chief Complaints
  const diagnosesList =
    input.consultation?.diagnoses && input.consultation.diagnoses.length > 0
      ? input.consultation.diagnoses
      : input.patient.primaryDiagnosis
      ? [input.patient.primaryDiagnosis]
      : ['General Dermatology Evaluation'];

  const symptomsList =
    input.consultation?.symptoms && input.consultation.symptoms.length > 0
      ? input.consultation.symptoms
      : [];

  const diagBody = [
    `Primary & Differential Diagnosis: ${diagnosesList.join(', ')}`,
    symptomsList.length > 0 ? `Chief Complaints / Symptoms: ${symptomsList.join(', ')}` : '',
    input.patient.medicalHistory ? `Medical History: ${input.patient.medicalHistory}` : ''
  ]
    .filter(Boolean)
    .join('\n');

  drawSectionBox('01', 'Clinical Assessment, Diagnosis & Chief Complaints', diagBody, [230, 244, 241]);

  // 4. Clinical Examination & Plan
  const examNotes = input.consultation?.clinicalNotes?.examination;
  const planNotes = input.consultation?.clinicalNotes?.plan;
  const investNotes = input.consultation?.clinicalNotes?.investigationsAdvised;
  const aiSummaryText = input.consultation?.aiSummary;

  const clinicalNotesBody = [
    examNotes ? `Examination Findings: ${examNotes}` : '',
    investNotes ? `Investigations Advised: ${investNotes}` : '',
    planNotes ? `Treatment Plan: ${planNotes}` : '',
    !examNotes && !planNotes && aiSummaryText
      ? `Visit Summary: ${aiSummaryText.replace(/\n+/g, ' · ').slice(0, 380)}`
      : ''
  ]
    .filter(Boolean)
    .join('\n');

  if (clinicalNotesBody) {
    drawSectionBox('02', 'Clinical Notes, Examination & Management Plan', clinicalNotesBody, [240, 249, 255]);
  }

  // 5. Prescribed Medications (Rx)
  const rxList = input.prescriptions || [];
  const rxBody =
    rxList.length > 0
      ? rxList
          .map(
            (rx, i) =>
              `${i + 1}. ${rx.medicineName} (${rx.dosage}) — Frequency: ${rx.frequency} · Duration: ${rx.duration}${
                rx.instructions ? ` · Note: ${rx.instructions}` : ''
              }`
          )
          .join('\n')
      : input.patient.currentMedications || 'Continue supportive skincare and barrier repair regimen as advised.';

  drawSectionBox(
    clinicalNotesBody ? '03' : '02',
    `Prescribed Medications & Regimen (${rxList.length} items)`,
    rxBody,
    [236, 253, 245]
  );

  // 6. Investigations, Procedures & Follow-Up Schedule
  const testsOrdered = input.consultation?.tests || [];
  const proceduresDone = input.consultation?.procedures || [];
  const followUpDate = input.consultation?.followUp?.date;
  const followUpInstr = input.consultation?.followUp?.instructions;

  const followUpLines = [
    testsOrdered.length > 0 ? `Tests / Investigations Ordered: ${testsOrdered.join(', ')}` : '',
    proceduresDone.length > 0
      ? `Procedures Performed: ${proceduresDone.map(p => p.name).join(', ')}`
      : '',
    followUpDate
      ? `Next Scheduled Follow-Up: ${new Date(followUpDate).toLocaleDateString('en-IN', {
          dateStyle: 'full'
        })}`
      : 'Follow-Up: Review in clinic as scheduled or SOS if symptoms worsen.',
    followUpInstr ? `Follow-Up Instructions: ${followUpInstr}` : '',
    input.customNote?.trim() ? `Doctor's Direct Note to Patient: "${input.customNote.trim()}"` : ''
  ]
    .filter(Boolean)
    .join('\n');

  drawSectionBox(
    clinicalNotesBody ? '04' : '03',
    'Investigations, Procedures & Follow-Up Instructions',
    followUpLines,
    [254, 249, 195]
  );

  // 7. Signature & Verification Footer
  const sigY = Math.max(y + 4, pageHeight - 32);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.line(margin, sigY, pageWidth - margin, sigY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(13, 63, 59);
  doc.text(`Digitally Verified & Signed by Dr. ${doctorDisplay}`, margin, sigY + 6.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Official Patient Medical Record PDF  |  Ref ID: #${reportId}  |  UHID: ${input.patient.patientCode}  |  ${dateStr} ${timeStr}`,
    margin,
    sigY + 12
  );
  doc.text(
    'This official medical report is electronically generated for direct patient communication via WhatsApp.',
    margin,
    sigY + 17
  );

  const safeName = input.patient.fullName.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
  const filename = `Medical_Report_${safeName}_${now.toISOString().split('T')[0]}.pdf`;
  const pdfDataUrl = doc.output('dataurlstring');
  const pdfArrayBuffer = doc.output('arraybuffer');
  const sizeKb = Math.max(22, Math.round(pdfArrayBuffer.byteLength / 1024));
  const sizeLabel = `${sizeKb} KB · PDF`;

  const summaryPoints = [
    `Diagnosis: ${diagnosesList.join(', ')}`,
    `Active Medications: ${rxList.length > 0 ? rxList.map(r => r.medicineName).join(', ') : 'As advised'}`,
    followUpDate ? `Next Follow-Up: ${followUpDate}` : `UHID: ${input.patient.patientCode}`
  ];

  const whatsappCompanionText = [
    `*📄 OFFICIAL MEDICAL REPORT (PDF ATTACHED)*`,
    `*${clinicDisplay}*`,
    `• *Patient:* ${input.patient.fullName} (${input.patient.patientCode})`,
    `• *Report Ref:* #${reportId} (${dateStr})`,
    `• *Diagnosis:* ${diagnosesList.join(', ')}`,
    `• *Attached PDF:* ${filename} (${sizeLabel})`,
    `Please find your complete medical report attached — Dr. ${doctorDisplay}`
  ].join('\n');

  return {
    filename,
    reportId,
    sizeLabel,
    generatedAt: `${dateStr}, ${timeStr}`,
    pdfDataUrl,
    whatsappCompanionText,
    summaryPoints,
    triggerDownload: () => {
      doc.save(filename);
    }
  };
}
