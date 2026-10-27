import { jsPDF } from 'jspdf';

export function downloadCoFounderRoadmapPdf() {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;
  let y = 0;

  const addPageFooter = (pageNum: number, totalPages: number) => {
    doc.setDrawColor(220, 229, 227);
    doc.setLineWidth(0.3);
    doc.line(margin, pageHeight - 14, pageWidth - margin, pageHeight - 14);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 125, 120);
    doc.text(
      'Cliniq (Clinical OS) — Executive Product Roadmap, Pricing & Co-Founder FAQ (Confidential)',
      margin,
      pageHeight - 9
    );
    doc.text(
      `Page ${pageNum} of ${totalPages}`,
      pageWidth - margin,
      pageHeight - 9,
      { align: 'right' }
    );
  };

  const checkPageBreak = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - 20) {
      doc.addPage();
      // Top mini header on continuation pages
      doc.setFillColor(13, 63, 59);
      doc.rect(0, 0, pageWidth, 12, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(255, 255, 255);
      doc.text('CLINIQ (CLINICAL OS)  |  CO-FOUNDER STRATEGY & PRODUCT ROADMAP', margin, 8);
      y = 20;
    }
  };

  const drawSectionHeader = (badge: string, title: string, subtitle?: string) => {
    checkPageBreak(22);
    y += 3;
    doc.setFillColor(240, 247, 246);
    doc.setDrawColor(195, 220, 216);
    doc.setLineWidth(0.35);
    doc.roundedRect(margin, y, contentWidth, subtitle ? 16 : 12, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(21, 122, 110);
    doc.text(badge.toUpperCase(), margin + 4, y + 4.8);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(15, 41, 38);
    doc.text(title, margin + 4, y + 9.8);

    if (subtitle) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(80, 105, 100);
      doc.text(subtitle, margin + 4, y + 14);
      y += 20;
    } else {
      y += 16;
    }
  };

  const drawBulletItem = (heading: string, body: string) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.2);
    const wrappedBody = doc.splitTextToSize(body, contentWidth - 8);
    const blockHeight = 5 + wrappedBody.length * 4.2 + 2.5;
    checkPageBreak(blockHeight);

    // Teal bullet dot
    doc.setFillColor(21, 122, 110);
    doc.circle(margin + 2.2, y + 2.5, 1.1, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 41, 38);
    doc.text(heading, margin + 6, y + 3.5);
    y += 5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(55, 75, 72);
    doc.text(wrappedBody, margin + 6, y + 3);
    y += wrappedBody.length * 4.2 + 2.2;
  };

  const drawFaqItem = (question: string, answer: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    const wrappedQ = doc.splitTextToSize(`Q: ${question}`, contentWidth - 6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const wrappedA = doc.splitTextToSize(answer, contentWidth - 6);

    const totalH = wrappedQ.length * 4.3 + wrappedA.length * 4.1 + 6;
    checkPageBreak(totalH);

    // Subtle left accent line
    doc.setDrawColor(21, 122, 110);
    doc.setLineWidth(0.8);
    doc.line(margin + 1, y, margin + 1, y + totalH - 3);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(13, 63, 59);
    doc.text(wrappedQ, margin + 4.5, y + 3.5);
    y += wrappedQ.length * 4.3 + 1;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(50, 70, 67);
    doc.text(wrappedA, margin + 4.5, y + 3);
    y += wrappedA.length * 4.1 + 4;
  };

  // =========================================================================
  // PAGE 1: HERO BANNER & PART 1 (WHERE WE ARE TODAY)
  // =========================================================================
  doc.setFillColor(13, 63, 59);
  doc.rect(0, 0, pageWidth, 42, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(159, 229, 219);
  doc.text('CLINIQ (CLINICAL OS)  •  CO-FOUNDER BRIEFING & STRATEGY DOCUMENT', margin, 13);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.setTextColor(255, 255, 255);
  doc.text('Product Roadmap, Pricing & Partner FAQ', margin, 23);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(210, 235, 231);
  doc.text(
    'Prepared for Co-Founders in Marketing, Clinical Operations, Medical Leadership & Growth',
    margin,
    30.5
  );
  doc.setFontSize(8.5);
  doc.setTextColor(159, 229, 219);
  doc.text(
    `Live Platform: https://clinical-os.onrender.com   |   Currency Standard: INR (Rs.)   |   Updated: ${new Date().toLocaleDateString('en-IN')}`,
    margin,
    37
  );

  y = 49;

  // PART 1
  drawSectionHeader(
    'Part 1 • Live Platform Today',
    'Where We Are Today (100% Built & Live in Production)',
    'Cliniq is an AI-assisted Dermatology Clinic Operating System built for Indian skin & hair practices.'
  );

  drawBulletItem(
    '1. Zero-Typing QR Walk-In Queue',
    'Patients scan a QR code at the reception desk on their own smartphone to enter their name, age, mobile number, and skin concern. They appear immediately in the doctor’s live queue with zero front-desk typing.'
  );
  drawBulletItem(
    '2. 60-Second Digital Consultation & Rx Pad',
    'Pre-loaded with Indian dermatology diagnoses, medicines, dosages, and aesthetic procedures (Chemical Peels, Laser Toning, PRP, Hydrafacial) so doctors finish charting in under 60 seconds.'
  );
  drawBulletItem(
    '3. AI Pre-Visit Brief & Clinical Assistant',
    'Before a repeat patient walks into the cabin, the doctor sees a 3-bullet summary of their last visit, active medicines, and allergy warnings so no context is ever missed.'
  );
  drawBulletItem(
    '4. AI Skin Image Analyzer & Visual Progress Comparison',
    'Doctors snap a clinical photo via phone QR or webcam; AI highlights visual skin patterns and tracks Day 0 vs. Day 14 improvement side-by-side—turning sceptical patients into loyal repeat visitors.'
  );
  drawBulletItem(
    '5. Live INR (Rs.) Billing & Practice Ledger',
    'Every consultation fee and procedure cost is tracked in Indian Rupees (INR / Rs.) with daily revenue, Monthly Recurring Revenue (MRR), procedure vs. consultation mix, and 1-click CSV export for the clinic CA.'
  );
  drawBulletItem(
    '6. Trilingual Interface (English, Hindi & Punjabi)',
    'Reception staff and doctors can switch the entire workspace between English, Hindi, and Punjabi in one click.'
  );

  // =========================================================================
  // PART 2: 12-MONTH PRODUCT ROADMAP
  // =========================================================================
  drawSectionHeader(
    'Part 2 • 12-Month Execution Plan',
    'Phased Product Roadmap (Months 1 to 12)',
    'Prioritized to maximize clinic stickiness first, then expand clinic revenue, then scale to multi-branch chains.'
  );

  // Phase 1 Subheader
  checkPageBreak(10);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(21, 122, 110);
  doc.text('Phase 1 (Months 1–3): Clinic Adoption & Frictionless Daily Use', margin, y + 4);
  y += 7;

  drawBulletItem(
    'Automated WhatsApp Prescription & Follow-Up Delivery',
    'As soon as the doctor signs a consultation, the patient automatically receives their digital PDF prescription, medicine schedule, and next follow-up reminder directly on WhatsApp.'
  );
  drawBulletItem(
    'Dedicated Receptionist Login & Front-Desk Mode',
    'A restricted staff login where receptionists can manage walk-ins, appointments, and fee collection without seeing private clinical notes or full clinic profit analytics.'
  );
  drawBulletItem(
    'Custom-Branded Print & Letterhead Templates',
    '1-click printing tailored to the clinic’s existing physical letterhead pad (custom top/bottom margins, clinic logo, and digital signature stamp).'
  );
  drawBulletItem(
    'Voice-to-Prescription (Dictation Mode)',
    'Doctors speak naturally ("Tab Doxycycline 100mg twice daily after meals for 14 days") and Cliniq auto-fills the structured prescription table.'
  );

  // Phase 2 Subheader
  checkPageBreak(10);
  y += 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(21, 122, 110);
  doc.text('Phase 2 (Months 4–6): Clinic Revenue & Inventory Expansion', margin, y + 4);
  y += 7;

  drawBulletItem(
    'In-House Pharmacy & Cosmeceutical Inventory Tracker',
    'Most dermatologists earn 40–50% of their profit from in-clinic sunscreens, serums, and medicated creams. Prescribing an item will automatically deduct stock and alert the clinic before high-margin items run out.'
  );
  drawBulletItem(
    'Multi-Session Aesthetic Package Tracker',
    'Track 6-session Laser Hair Reduction or 4-session PRP packages (e.g., "Session 3 of 6 completed — Rs. 18,000 paid, Rs. 6,000 balance due") with automated reminders.'
  );
  drawBulletItem(
    'ABDM (Ayushman Bharat Digital Mission) Readiness',
    'Optional ABHA Health ID linking so partner clinics stay ahead of upcoming Indian digital health standards.'
  );
  drawBulletItem(
    'Regional Language Expansion',
    'Adding Marathi, Tamil, Telugu, Bengali, and Gujarati for pan-India clinic onboarding.'
  );

  // Phase 3 Subheader
  checkPageBreak(10);
  y += 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(21, 122, 110);
  doc.text('Phase 3 (Months 7–12): Multi-Clinic Scale & Patient Retention', margin, y + 4);
  y += 7;

  drawBulletItem(
    'Multi-Branch Chain Dashboard',
    'A single owner view for dermatologists running 2–10 clinics to compare daily footfall, procedure revenue, and doctor performance across branches.'
  );
  drawBulletItem(
    'At-Home Patient Recovery Check-In Link',
    'Patients receive a Day-7 link to upload a quick progress selfie from home; the doctor reviews it in 10 seconds and approves continuation or books an early visit.'
  );
  drawBulletItem(
    'Indian Skin Tone (Fitzpatrick III–VI) Benchmark Library',
    'Specialized clinical reference library calibrated specifically for Indian skin pigmentation, melasma, acne scarring, and fungal dermatoses.'
  );

  // =========================================================================
  // PART 3: MONETIZATION & PRICING MODEL (INR)
  // =========================================================================
  drawSectionHeader(
    'Part 3 • SaaS + Usage Revenue Model',
    'Monetization & Pricing Tiers (100% Standardized in INR)',
    'Low-friction SaaS subscription paired with high-margin AI Scan Top-Up packs collected centrally.'
  );

  const pricingTiers = [
    {
      plan: '1. Starter Tier (Free Trial)',
      price: 'Rs. 0 / month',
      target: 'Solo clinics testing the platform',
      details:
        'Full EMR, Walk-In QR Queue, Digital Prescriptions, Revenue Ledger + 5 Free AI Skin Scans to experience the value risk-free.'
    },
    {
      plan: '2. Clinic Pro Subscription',
      price: 'Rs. 3,999 / month (per clinic)',
      target: 'Established single-doctor dermatology & aesthetic practices',
      details:
        'Unlimited patients, unlimited digital prescriptions, full INR billing & CA export, priority support + 150 AI Skin Scans / month.'
    },
    {
      plan: '3. Instant Scan Top-Up Pack',
      price: 'Rs. 999 one-time add-on',
      target: 'High-volume clinics needing extra AI scans mid-month',
      details:
        'Adds +100 AI Skin Scans immediately (never expires). Protects our AI unit economics while scaling revenue with heavy users.'
    },
    {
      plan: '4. Multi-Clinic Enterprise (Phase 3)',
      price: 'Rs. 9,999+ / month',
      target: 'Multi-doctor chains & aesthetic centers (3+ branches)',
      details:
        'Multi-branch analytics, custom WhatsApp business branding, dedicated account manager + 500+ AI Skin Scans / month.'
    }
  ];

  pricingTiers.forEach((tier) => {
    checkPageBreak(22);
    doc.setFillColor(250, 252, 251);
    doc.setDrawColor(210, 225, 222);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, y, contentWidth, 19, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.8);
    doc.setTextColor(13, 63, 59);
    doc.text(tier.plan, margin + 3.5, y + 5.2);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.8);
    doc.setTextColor(21, 122, 110);
    doc.text(tier.price, pageWidth - margin - 3.5, y + 5.2, { align: 'right' });

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.3);
    doc.setTextColor(90, 110, 106);
    doc.text(`Ideal for: ${tier.target}`, margin + 3.5, y + 9.8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.6);
    doc.setTextColor(45, 65, 62);
    const splitDetails = doc.splitTextToSize(tier.details, contentWidth - 7);
    doc.text(splitDetails, margin + 3.5, y + 14.2);

    y += 22;
  });

  // =========================================================================
  // PART 4: NON-TECHNICAL CO-FOUNDER FAQS
  // =========================================================================
  drawSectionHeader(
    'Part 4 • Co-Founder & Partner FAQ',
    'Frequently Asked Questions (Non-Technical Guide)',
    'Clear answers for Marketing, Sales, Medical Advisors, and Operations Co-Founders.'
  );

  drawFaqItem(
    'Indian doctors are super busy and prefer pen-and-paper. Why will they use Cliniq?',
    'We never ask doctors to type long paragraphs. First, the patient fills their own details via the reception QR code. Second, common Indian dermatology medicines and procedures are 1-click chips. Third, the "Day 0 vs Day 14" visual photo comparison helps doctors convince patients to buy high-ticket aesthetic procedures (Rs. 3,000–Rs. 15,000+ per session)—so Cliniq directly makes the doctor more money.'
  );

  drawFaqItem(
    'What if the clinic receptionist is not tech-savvy or only reads Hindi/Punjabi?',
    'Cliniq has built-in 1-click language switching between English, Hindi, and Punjabi. A receptionist only needs to point patients to the Walk-In QR code or click a single button to check them in.'
  );

  drawFaqItem(
    'Does the clinic need to install heavy software or buy expensive computers?',
    'Zero installation. Cliniq runs in any web browser on the doctor’s existing laptop, iPad/tablet, or smartphone. When the doctor wants to take a close-up skin photo, they scan a QR code on their screen and snap the photo straight from their phone camera.'
  );

  drawFaqItem(
    'How are we different from generic platforms like Practo or HealthPlix?',
    'Generic EMRs are built for general physicians (fever, BP, diabetes) and feel cluttered for skin clinics. Cliniq is purpose-built for Dermatology & Aesthetics: visual lesion tracking, Day 0 vs Day 14 photo comparisons, procedure vs consultation revenue split, and AI skin triage.'
  );

  drawFaqItem(
    'Why do we cap AI scans and sell Top-Up packs instead of making AI unlimited for free?',
    'Every high-resolution AI skin image analysis costs us cloud compute. By giving 5 free trial scans, bundling 150 scans in Clinic Pro (Rs. 3,999/mo), and charging Rs. 999 per 100 extra scans, our gross margins stay above 80% even when a clinic scans 50 patients a day.'
  );

  drawFaqItem(
    'Where does subscription and top-up money go? Does it go into one person’s personal bank account?',
    'No. All clinic payments are collected through a centralized startup merchant account (Razorpay / Stripe business account linked to our company current account), giving all co-founders transparent dashboard access, automated GST invoicing, and clean audit trails.'
  );

  drawFaqItem(
    'Can we adjust our INR pricing plans or run promotional discounts for early pilot clinics without rewriting the app?',
    'Yes. Our subscription and top-up pricing is modular. We can offer founding-doctor discounts, festival promos, or revise monthly tiers anytime and push updates live in under 2 minutes with zero clinic downtime.'
  );

  drawFaqItem(
    'Is Cliniq legally replacing the dermatologist or prescribing medicines on its own?',
    'Strictly NO. Cliniq is positioned as a "Clinical Decision Support (CDS) & Practice Management System." Every AI insight is labeled for clinician review, and no prescription is finalized until the registered doctor clicks "Sign & Complete." This keeps us compliant with National Medical Commission (NMC) and CDSCO guidelines.'
  );

  drawFaqItem(
    'How do we update the live app when a pilot doctor requests a new feature?',
    'Our cloud pipeline is connected directly to our code repository. Whenever we add a feature or refine pricing, we push the update and our cloud server builds and deploys the new version live in ~2 minutes without deleting any clinic or patient records.'
  );

  // Add page numbers to all generated pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addPageFooter(i, totalPages);
  }

  doc.save('Cliniq_CoFounder_Roadmap_and_FAQ.pdf');
}
