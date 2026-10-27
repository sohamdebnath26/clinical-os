import React from 'react';
import { X, Download, Printer, FileText, CheckCircle2, Sparkles, IndianRupee, ShieldCheck, HelpCircle, Rocket } from 'lucide-react';
import { downloadCoFounderRoadmapPdf } from '../utils/generateCoFounderPdf';

interface CoFounderBriefModalProps {
  onClose: () => void;
}

export const CoFounderBriefModal: React.FC<CoFounderBriefModalProps> = ({ onClose }) => {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-[#dce5e3] overflow-hidden animate-in zoom-in-95 duration-200"
      >
        {/* Top Action Bar */}
        <div className="bg-[#0d3f3b] text-white px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#198276] flex items-center justify-center shrink-0 mt-0.5">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#9fe5db] block">
                CLINIQ (CLINICAL OS) • EXECUTIVE BRIEFING
              </span>
              <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-white">
                Co-Founder Product Roadmap, Pricing & Partner FAQ
              </h2>
              <p className="text-xs text-[#b5dcd6] mt-0.5">
                Non-technical strategy guide for Marketing, Operations, Sales & Medical Co-Founders
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => downloadCoFounderRoadmapPdf()}
              className="px-4 py-2.5 bg-[#198276] hover:bg-[#1f9688] text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Download .PDF</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3.5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Print Document"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">Print</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-[#8abcb5] hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Executive Document Body */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-8 text-[#0f2926]">
          {/* Part 1: Where We Are Today */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-[#116960]">
              <CheckCircle2 className="w-5 h-5" />
              <h3 className="text-base font-extrabold uppercase tracking-wider">
                Part 1: Where We Are Today (100% Live in Production)
              </h3>
            </div>
            <p className="text-xs sm:text-sm text-[#4e6660]">
              Cliniq is an AI-assisted Dermatology Clinic Operating System built specifically for Indian skin and hair practices, with all billing and analytics standardized in <strong>Indian Rupees (₹ / INR)</strong>.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {[
                {
                  title: '1. Zero-Typing QR Walk-In Queue',
                  desc: 'Patients scan a QR code at reception on their own phone to enter name, age, mobile, and chief complaint. Appears immediately in the doctor’s queue.'
                },
                {
                  title: '2. 60-Second Digital Rx & Procedure Pad',
                  desc: 'Pre-loaded with Indian dermatology diagnoses, medicines, dosages, and aesthetic procedures (Chemical Peels, Laser, PRP, Hydrafacial).'
                },
                {
                  title: '3. AI Pre-Visit Brief & Assistant',
                  desc: 'Summarizes the patient’s last visit, active medication course, and allergy flags into 3 quick bullets before they walk into the cabin.'
                },
                {
                  title: '4. AI Skin Vision & Day 0 vs Day 14 Proof',
                  desc: 'Doctors capture clinical photos via phone QR; AI highlights visual patterns and compares Day 0 vs Day 14 recovery side-by-side.'
                },
                {
                  title: '5. Live INR (₹) Billing & CA CSV Export',
                  desc: 'Tracks daily collection, Monthly Recurring Revenue (MRR), procedure vs consultation revenue split, and exports 1-click CSV ledgers.'
                },
                {
                  title: '6. English, Hindi & Punjabi Interface',
                  desc: '1-click language switching so receptionists and doctors can operate the clinic in their preferred language.'
                }
              ].map((item, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-2xl bg-[#f7faf9] border border-[#dce5e3] space-y-1"
                >
                  <h4 className="text-xs font-extrabold text-[#0d3f3b]">{item.title}</h4>
                  <p className="text-xs text-[#4e6660] leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Part 2: 12-Month Product Roadmap */}
          <section className="space-y-4 pt-2 border-t border-slate-200">
            <div className="flex items-center gap-2 text-[#116960]">
              <Rocket className="w-5 h-5" />
              <h3 className="text-base font-extrabold uppercase tracking-wider">
                Part 2: 12-Month Phased Product Roadmap
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Phase 1 */}
              <div className="rounded-2xl border border-[#dce5e3] bg-white p-4 space-y-3">
                <span className="inline-block text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-lg bg-[#e6f4f1] text-[#0d3f3b]">
                  Phase 1 • Months 1–3
                </span>
                <h4 className="text-sm font-extrabold text-[#0f2926]">
                  Clinic Adoption & Frictionless Daily Use
                </h4>
                <ul className="space-y-2 text-xs text-[#4e6660]">
                  <li>• <strong>WhatsApp Rx & Reminders:</strong> Auto-send digital PDF prescriptions & follow-up alerts on WhatsApp.</li>
                  <li>• <strong>Receptionist Front-Desk Mode:</strong> Restricted staff login without access to private clinical notes or profit totals.</li>
                  <li>• <strong>Custom Letterhead Printing:</strong> Calibrated margins & digital stamp for existing clinic pads.</li>
                  <li>• <strong>Voice-to-Rx Dictation:</strong> Speak medicine names aloud to auto-fill the prescription table.</li>
                </ul>
              </div>

              {/* Phase 2 */}
              <div className="rounded-2xl border border-[#dce5e3] bg-white p-4 space-y-3">
                <span className="inline-block text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-lg bg-[#fef3c7] text-[#92400e]">
                  Phase 2 • Months 4–6
                </span>
                <h4 className="text-sm font-extrabold text-[#0f2926]">
                  Clinic Revenue & Inventory Expansion
                </h4>
                <ul className="space-y-2 text-xs text-[#4e6660]">
                  <li>• <strong>In-House Pharmacy Inventory:</strong> Auto-deduct sunscreen/serum stock when prescribed & alert on low stock.</li>
                  <li>• <strong>Multi-Session Aesthetic Packages:</strong> Track 6-session Laser/PRP packages with ₹ paid vs ₹ balance due.</li>
                  <li>• <strong>ABDM / ABHA ID Readiness:</strong> Optional Ayushman Bharat Digital Health ID linking.</li>
                  <li>• <strong>More Regional Languages:</strong> Marathi, Tamil, Telugu, Bengali & Gujarati.</li>
                </ul>
              </div>

              {/* Phase 3 */}
              <div className="rounded-2xl border border-[#dce5e3] bg-white p-4 space-y-3">
                <span className="inline-block text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-lg bg-[#e0e7ff] text-[#1e40af]">
                  Phase 3 • Months 7–12
                </span>
                <h4 className="text-sm font-extrabold text-[#0f2926]">
                  Multi-Clinic Scale & Patient Retention
                </h4>
                <ul className="space-y-2 text-xs text-[#4e6660]">
                  <li>• <strong>Multi-Branch Chain Dashboard:</strong> Compare daily footfall & ₹ revenue across 2–10 clinic locations.</li>
                  <li>• <strong>At-Home Day-7 Recovery Check-In:</strong> Patients upload a Day-7 progress selfie from home for 10-second doctor review.</li>
                  <li>• <strong>Indian Skin Tone Benchmark Library:</strong> Fitzpatrick III–VI reference database for Indian skin conditions.</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Part 3: Monetization & Pricing Model in INR */}
          <section className="space-y-4 pt-2 border-t border-slate-200">
            <div className="flex items-center gap-2 text-[#116960]">
              <IndianRupee className="w-5 h-5" />
              <h3 className="text-base font-extrabold uppercase tracking-wider">
                Part 3: Monetization & Pricing Model (Standardized in ₹ INR)
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              <div className="p-4 rounded-2xl border border-[#dce5e3] bg-[#f7faf9] flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase text-[#5c7c77]">Starter Tier</span>
                  <div className="text-xl font-extrabold text-[#0d3f3b] mt-1">₹0 / mo</div>
                  <p className="text-xs text-[#4e6660] mt-2">
                    Full EMR, QR Walk-In Queue, Digital Rx + <strong>5 Free AI Skin Scans</strong> to experience value risk-free.
                  </p>
                </div>
                <span className="text-[10px] font-semibold text-[#116960] mt-3 block">Lead-Gen Hook</span>
              </div>

              <div className="p-4 rounded-2xl border-2 border-[#116960] bg-white flex flex-col justify-between shadow-xs">
                <div>
                  <span className="text-[10px] font-bold uppercase text-[#116960]">Clinic Pro (Core SaaS)</span>
                  <div className="text-xl font-extrabold text-[#0d3f3b] mt-1">₹3,999 / mo</div>
                  <p className="text-xs text-[#4e6660] mt-2">
                    Unlimited patients & Rx, full ₹ billing ledger, CA export + <strong>150 AI Skin Scans / month</strong>.
                  </p>
                </div>
                <span className="text-[10px] font-semibold text-[#116960] mt-3 block">Primary Recurring Revenue</span>
              </div>

              <div className="p-4 rounded-2xl border border-[#dce5e3] bg-[#f7faf9] flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase text-[#5c7c77]">Instant Scan Top-Up</span>
                  <div className="text-xl font-extrabold text-[#0d3f3b] mt-1">₹999 / pack</div>
                  <p className="text-xs text-[#4e6660] mt-2">
                    One-time add-on for <strong>+100 extra AI Skin Scans</strong> (never expires) for high-volume clinics.
                  </p>
                </div>
                <span className="text-[10px] font-semibold text-[#116960] mt-3 block">80%+ Gross Margin Add-On</span>
              </div>

              <div className="p-4 rounded-2xl border border-[#dce5e3] bg-[#f7faf9] flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase text-[#5c7c77]">Multi-Clinic Chain</span>
                  <div className="text-xl font-extrabold text-[#0d3f3b] mt-1">₹9,999+ / mo</div>
                  <p className="text-xs text-[#4e6660] mt-2">
                    Multi-branch analytics, custom WhatsApp branding, dedicated support + <strong>500+ AI Scans / mo</strong>.
                  </p>
                </div>
                <span className="text-[10px] font-semibold text-[#116960] mt-3 block">Phase 3 Enterprise</span>
              </div>
            </div>
          </section>

          {/* Part 4: Co-Founder & Partner FAQs */}
          <section className="space-y-4 pt-2 border-t border-slate-200">
            <div className="flex items-center gap-2 text-[#116960]">
              <HelpCircle className="w-5 h-5" />
              <h3 className="text-base font-extrabold uppercase tracking-wider">
                Part 4: Non-Technical Co-Founder & Partner FAQs
              </h3>
            </div>

            <div className="space-y-3">
              {[
                {
                  q: '1. Indian doctors are super busy and prefer pen-and-paper. Why will they use Cliniq?',
                  a: 'We never ask doctors to type long paragraphs. The patient enters their own details via the reception QR code, common Indian dermatology medicines are 1-click chips, and the "Day 0 vs Day 14" photo comparison helps doctors convert patients into high-ticket aesthetic procedures (₹3,000–₹15,000+ per session).'
                },
                {
                  q: '2. How are we different from generic platforms like Practo or HealthPlix?',
                  a: 'Generic EMRs are built for general physicians (fever, BP, diabetes). Cliniq is 100% tailored to Dermatology & Aesthetics: visual lesion tracking, Day 0 vs Day 14 photo comparisons, procedure vs consultation revenue split, and AI skin triage.'
                },
                {
                  q: '3. Why do we cap AI scans and sell ₹999 Top-Up packs instead of making AI unlimited for free?',
                  a: 'Every high-resolution AI skin image analysis costs cloud compute. Giving 5 free trial scans, bundling 150 scans in Clinic Pro (₹3,999/mo), and charging ₹999 per 100 extra scans keeps our gross profit margins above 80%.'
                },
                {
                  q: '4. Where does subscription and top-up money go? Does it go into one person’s personal account?',
                  a: 'No. All clinic payments flow into our centralized startup merchant account (Razorpay / Stripe business account linked to our company current bank account), giving all co-founders transparent dashboard access and clean GST accounting.'
                },
                {
                  q: '5. Can we adjust our ₹ pricing plans or offer pilot discounts later without rewriting the app?',
                  a: 'Yes. Pricing and scan quotas are modular—we can run pilot offers, festival promos, or update monthly tiers anytime and deploy live in 2 minutes with zero downtime.'
                },
                {
                  q: '6. Is Cliniq legally replacing the dermatologist or prescribing medicines on its own?',
                  a: 'Strictly NO. Cliniq is a "Clinical Decision Support (CDS) & Practice Management System." Every AI insight is for clinician review, and only the registered doctor can click "Sign & Complete" on a prescription—keeping us compliant with NMC and CDSCO regulations.'
                }
              ].map((faq, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-2xl bg-white border border-[#dce5e3] space-y-1.5"
                >
                  <h4 className="text-xs sm:text-sm font-extrabold text-[#0d3f3b]">{faq.q}</h4>
                  <p className="text-xs text-[#4e6660] leading-relaxed">{faq.a}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Bottom Footer CTA */}
        <div className="bg-[#f2f6f5] border-t border-[#dce5e3] px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 text-xs text-[#4e6660]">
            <ShieldCheck className="w-4 h-4 text-[#116960] shrink-0" />
            <span>Ready to share on WhatsApp or email with your co-founders & medical advisors.</span>
          </div>
          <button
            type="button"
            onClick={() => downloadCoFounderRoadmapPdf()}
            className="px-5 py-2.5 bg-[#0d3f3b] hover:bg-[#155953] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Download Full PDF (Cliniq_CoFounder_Roadmap_and_FAQ.pdf)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
