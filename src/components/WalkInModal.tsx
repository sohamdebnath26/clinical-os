import React, { useState, useEffect, useRef } from 'react';
import { Patient, Gender, Consultation } from '../types';
import { PREDEFINED_SYMPTOMS } from '../data/clinicalCatalogues';
import { api, subscribeToMobileSessionRealtimeEvents } from '../lib/api';
import {
  X,
  Search,
  UserPlus,
  Smartphone,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Check,
  Plus,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  User,
  Scale,
  Stethoscope,
  Phone,
  Activity,
  Send,
  Copy,
  QrCode,
  MessageSquare,
  CheckCircle2,
  Loader2,
  ExternalLink
} from 'lucide-react';
import { VoiceDictationButton } from './VoiceDictationButton';

interface WalkInModalProps {
  onClose: () => void;
  onStartConsultation?: (consultation: Consultation, patient: Patient) => void;
  onPatientCreated?: (patient: Patient) => void;
  /** If 'register', skips the initial "Walk-in patient" search popup and opens the Add patient interface directly */
  initialStep?: 'search' | 'register';
}

const COUNTRY_CODES = [
  { code: '+91', label: '+91', country: 'India' },
  { code: '+1', label: '+1', country: 'US / Canada' },
  { code: '+44', label: '+44', country: 'UK' },
  { code: '+971', label: '+971', country: 'UAE' },
  { code: '+65', label: '+65', country: 'Singapore' },
  { code: '+61', label: '+61', country: 'Australia' },
];

export const WalkInModal: React.FC<WalkInModalProps> = ({
  onClose,
  onStartConsultation,
  onPatientCreated,
  initialStep = 'search'
}) => {
  // Two-step flow:
  // 1) 'search': Older "Walk-in patient" popup ("Find or add them, then go straight into the consultation.")
  // 2) 'register': Current "Add patient" interface (with "Hand to patient" + "Send Link to Mobile")
  const [step, setStep] = useState<'search' | 'register'>(initialStep);

  // Mode inside 'register': 'doctor' ("Add patient" window) vs 'patient' ("Hand to patient" self-intake view)
  const [mode, setMode] = useState<'doctor' | 'patient'>('doctor');

  // Step 1 ('search') states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Patient[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Shared Patient Details (synced across Doctor view, Hand-to-Patient view, and Mobile Link session)
  const [fullName, setFullName] = useState('');
  const [sex, setSex] = useState<'Not specified' | 'Female' | 'Male' | 'Other'>('Not specified');
  const [age, setAge] = useState<string>('');
  const [countryCode, setCountryCode] = useState('+91');
  const [mobile, setMobile] = useState('');
  const [weight, setWeight] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [noKnownAllergies, setNoKnownAllergies] = useState(false);
  const [consentAccepted, setConsentAccepted] = useState(true);

  // Discount / panel collapsible section
  const [showDiscountPanel, setShowDiscountPanel] = useState(false);
  const [discountPanel, setDiscountPanel] = useState('');

  // Symptoms (entered by patient in "Hand to patient" or via Mobile Link, or added by doctor)
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [symptomSearch, setSymptomSearch] = useState('');
  const [customSymptom, setCustomSymptom] = useState('');

  // Existing patient lookup inside 'register' step
  const [matchingPatients, setMatchingPatients] = useState<Patient[]>([]);
  const [existingDuplicatePatient, setExistingDuplicatePatient] = useState<Patient | null>(null);
  const [patientIntakeCompleted, setPatientIntakeCompleted] = useState(false);

  // Mobile Link Session state (for sending link to patient's registered mobile number)
  const [mobileSessionToken, setMobileSessionToken] = useState<string | null>(null);
  const [showMobileLinkPanel, setShowMobileLinkPanel] = useState(false);
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [mobileSessionSubmittedAt, setMobileSessionSubmittedAt] = useState<string | null>(null);
  const [isQrExpanded, setIsQrExpanded] = useState(false);

  // Validation & Loading
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tabbed workflow inside 'register' (Doctor mode): 1. Details -> 2. Symptoms & Notes -> 3. Mobile / Self Check-In
  type RegisterTab = 'details' | 'clinical' | 'mobile';
  const [registerTab, setRegisterTab] = useState<RegisterTab>('details');
  const [tabAdvanceNotice, setTabAdvanceNotice] = useState<string | null>(null);

  // Refs for smooth Enter-to-next-field & Enter-to-next-tab navigation
  const fullNameInputRef = useRef<HTMLInputElement>(null);
  const sexSelectRef = useRef<HTMLSelectElement>(null);
  const ageInputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const symptomSearchInputRef = useRef<HTMLInputElement>(null);
  const customSymptomInputRef = useRef<HTMLInputElement>(null);
  const notesInputRef = useRef<HTMLTextAreaElement>(null);

  const isDetailsTabComplete =
    fullName.trim().length >= 2 &&
    sex !== 'Not specified' &&
    age.trim() !== '' &&
    Number(age) > 0 &&
    mobile.replace(/\D/g, '').length === 10;

  const isClinicalTabComplete =
    selectedSymptoms.length > 0 && notes.trim().length > 0;

  const handleSwitchRegisterTab = (next: RegisterTab, viaEnter = false) => {
    setRegisterTab(next);
    if (viaEnter) {
      const label =
        next === 'details'
          ? '1. Patient Details'
          : next === 'clinical'
          ? '2. Symptoms & Notes'
          : '3. Mobile / Check-In';
      setTabAdvanceNotice(`Moved to ${label}`);
      setTimeout(() => setTabAdvanceNotice(null), 2200);
    }
    setTimeout(() => {
      if (next === 'details') {
        fullNameInputRef.current?.focus();
      } else if (next === 'clinical') {
        symptomSearchInputRef.current?.focus();
      }
    }, 40);
  };

  // Smart Enter handler in Tab 1 (Patient Details):
  // If all fields in Tab 1 are filled, pressing Enter moves to Tab 2 (Symptoms & Notes).
  // Otherwise, pressing Enter moves focus to the next unfilled field in Tab 1.
  const handleDetailsEnterKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    e.stopPropagation();
    if (isDetailsTabComplete) {
      handleSwitchRegisterTab('clinical', true);
      return;
    }
    if (fullName.trim().length < 2) {
      fullNameInputRef.current?.focus();
    } else if (sex === 'Not specified') {
      sexSelectRef.current?.focus();
    } else if (!age.trim() || Number(age) <= 0) {
      ageInputRef.current?.focus();
    } else if (mobile.replace(/\D/g, '').length !== 10) {
      mobileInputRef.current?.focus();
    }
  };

  // Step 1: Search patients as user types in the initial "Walk-in patient" popup
  useEffect(() => {
    if (step !== 'search') return;
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await api.patients.list(searchQuery.trim());
        setSearchResults(res.patients);
      } catch (err) {
        console.warn('Patient search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery, step]);

  // Step 2: Search existing patients when typing name in Doctor mode
  useEffect(() => {
    if (step !== 'register' || mode !== 'doctor' || fullName.trim().length < 2) {
      setMatchingPatients([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await api.patients.list(fullName.trim());
        setMatchingPatients(res.patients.slice(0, 4));
      } catch {
        // ignore
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [fullName, mode, step]);

  // Real-time SSE subscription + fallback poll for mobile walk-in patient intake
  useEffect(() => {
    if (!mobileSessionToken) return;

    const applySubmittedSession = (s: any) => {
      if (s && s.status === 'submitted' && s.submittedAt && s.submittedAt !== mobileSessionSubmittedAt) {
        setMobileSessionSubmittedAt(s.submittedAt);
        if (s.fullName) setFullName(s.fullName);
        if (s.sex === 'Female' || s.sex === 'Male' || s.sex === 'Other' || s.sex === 'Not specified') {
          setSex(s.sex);
        }
        if (s.age) setAge(s.age);
        if (s.mobile) setMobile(s.mobile);
        if (s.countryCode) setCountryCode(s.countryCode);
        if (s.weight) setWeight(s.weight);
        if (Array.isArray(s.symptoms) && s.symptoms.length > 0) {
          setSelectedSymptoms(s.symptoms);
        }
        if (s.notes) setNotes(s.notes);
        setNoKnownAllergies(Boolean(s.noKnownAllergies));
        setPatientIntakeCompleted(true);
      }
    };

    const unsubscribe = subscribeToMobileSessionRealtimeEvents(mobileSessionToken, (evt) => {
      if (evt.type === 'walkin:session_submitted' && evt.session) {
        applySubmittedSession(evt.session);
      }
    });

    const interval = setInterval(async () => {
      try {
        const res = await api.walkin.getMobileSession(mobileSessionToken);
        applySubmittedSession(res.session);
      } catch {
        // ignore transient polling error
      }
    }, 5000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [mobileSessionToken, mobileSessionSubmittedAt]);

  // Transition from Step 1 ("Walk-in patient" search popup) to Step 2 ("Add patient" current walk-in interface)
  const handleProceedToRegister = () => {
    const trimmed = searchQuery.trim();
    if (trimmed) {
      const digitsOnly = trimmed.replace(/\D/g, '');
      const isPhoneQuery = /^[\d\s+\-()]+$/.test(trimmed) && digitsOnly.length > 0;
      if (isPhoneQuery) {
        handleMobileChange(digitsOnly.slice(0, 10));
      } else {
        setFullName(trimmed);
      }
    }
    setError(null);
    setStep('register');
  };

  // Phone input handler with duplicate check
  const handleMobileChange = async (val: string) => {
    const rawDigits = val.replace(/\D/g, '');
    const cleaned = rawDigits.length > 10 ? rawDigits.slice(-10) : rawDigits.slice(0, 10);
    setMobile(cleaned);
    setExistingDuplicatePatient(null);

    if (cleaned.length === 10) {
      try {
        const check = await api.patients.checkMobile(cleaned);
        if (check.exists && check.patient) {
          setExistingDuplicatePatient(check.patient);
        }
      } catch {
        // ignore
      }
    }
  };

  // Generate or retrieve the mobile walk-in link for the patient's phone
  const ensureMobileSessionLink = async (): Promise<string | null> => {
    if (mobileSessionToken) {
      return `${window.location.origin}/?walkInToken=${encodeURIComponent(mobileSessionToken)}`;
    }
    setIsGeneratingLink(true);
    setError(null);
    try {
      const res = await api.walkin.createMobileSession({
        mobile: mobile.trim(),
        countryCode,
        fullName: fullName.trim(),
        sex,
        age,
        weight,
        symptoms: selectedSymptoms,
        notes: noKnownAllergies ? 'No known allergies' : notes.trim(),
        noKnownAllergies,
        discountPanel
      });
      setMobileSessionToken(res.session.token);
      return `${window.location.origin}/?walkInToken=${encodeURIComponent(res.session.token)}`;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate mobile walk-in link');
      return null;
    } finally {
      setIsGeneratingLink(false);
    }
  };

  const handleOpenSendLinkPanel = async () => {
    setShowMobileLinkPanel(true);
    await ensureMobileSessionLink();
  };

  const handleSendWhatsAppToPatient = async () => {
    const cleanPhone = mobile.replace(/\D/g, '').slice(0, 10);
    if (cleanPhone.length !== 10) {
      setError('Please enter a valid 10-digit patient phone number first to send the mobile link.');
      return;
    }

    const dialPrefix = countryCode.replace(/\D/g, '') || '91';
    const recipient = `${dialPrefix}${cleanPhone}`;

    // If token is already ready, launch synchronously; otherwise open tab synchronously first so popup blocker never blocks it
    if (mobileSessionToken) {
      const existingUrl = `${window.location.origin}/?walkInToken=${encodeURIComponent(mobileSessionToken)}`;
      const message = `Hello${fullName.trim() ? ` ${fullName.trim()}` : ''}, please complete your walk-in patient check-in details (Name, Age, Gender, Weight & Symptoms) on your mobile using this secure link:\n\n${existingUrl}`;
      const whatsappUrl = `https://wa.me/${recipient}?text=${encodeURIComponent(message)}`;
      window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
      api.whatsapp
        .send({
          patientName: fullName.trim() || 'Walk-in Patient',
          recipientMobile: recipient,
          reportType: 'walkin_registration_link',
          messageText: message
        })
        .catch(() => {});
      return;
    }

    const url = await ensureMobileSessionLink();
    if (!url) {
      return;
    }

    const message = `Hello${fullName.trim() ? ` ${fullName.trim()}` : ''}, please complete your walk-in patient check-in details (Name, Age, Gender, Weight & Symptoms) on your mobile using this secure link:\n\n${url}`;

    try {
      await api.whatsapp.send({
        patientName: fullName.trim() || 'Walk-in Patient',
        recipientMobile: recipient,
        reportType: 'walkin_registration_link',
        messageText: message
      });
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 3000);
    } catch {
      // ignore
    }
  };

  const handleSendSmsToPatient = async () => {
    const cleanPhone = mobile.replace(/\D/g, '').slice(0, 10);
    if (cleanPhone.length !== 10) {
      setError('Please enter a valid 10-digit patient phone number first to send the SMS link.');
      return;
    }
    const url = await ensureMobileSessionLink();
    if (!url) return;

    const message = `Complete your walk-in patient check-in on your mobile: ${url}`;
    window.location.href = `sms:${countryCode}${cleanPhone}?body=${encodeURIComponent(message)}`;
  };

  const handleCopyMobileLink = async () => {
    const url = await ensureMobileSessionLink();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    } catch {
      // ignore
    }
  };

  // Start consultation immediately for an existing patient
  const handleSelectExistingPatient = async (patient: Patient) => {
    if (!onStartConsultation) {
      onPatientCreated?.(patient);
      onClose();
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await api.consultations.create({
        patientId: patient.id,
        symptoms: selectedSymptoms
      });
      onStartConsultation(res.consultation, patient);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to start consultation');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleSymptom = (sym: string) => {
    if (selectedSymptoms.includes(sym)) {
      setSelectedSymptoms(selectedSymptoms.filter(s => s !== sym));
    } else {
      setSelectedSymptoms([...selectedSymptoms, sym]);
    }
  };

  const handleAddCustomSymptom = () => {
    const trimmed = customSymptom.trim();
    if (!trimmed) return;
    if (!selectedSymptoms.includes(trimmed)) {
      setSelectedSymptoms([...selectedSymptoms, trimmed]);
    }
    setCustomSymptom('');
  };

  // Create patient (and optionally start consultation if invoked as Walk-In)
  const handleSavePatient = async (
    forceCreate = false,
    actionMode: 'auto' | 'save_only' | 'start_consultation' = 'auto'
  ) => {
    if (!fullName.trim()) {
      setError("Please enter the patient's full name.");
      return;
    }
    const parsedAge = age.trim() !== '' ? Number(age) : 0;
    if (age.trim() !== '' && (Number.isNaN(parsedAge) || parsedAge < 0 || parsedAge > 130)) {
      setError('Please enter a valid age in years (0–130).');
      return;
    }
    const cleanPhone = mobile.replace(/\D/g, '');
    if (cleanPhone.length > 0 && cleanPhone.length !== 10) {
      setError('Please enter a valid 10-digit mobile number (or leave phone blank).');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const resolvedGender: Gender =
      sex === 'Female'
        ? 'Female'
        : sex === 'Male'
        ? 'Male'
        : sex === 'Other'
        ? 'Other'
        : 'Prefer not to say';

    const combinedNotes = [
      notes.trim(),
      discountPanel.trim() ? `Discount/Panel: ${discountPanel.trim()}` : ''
    ]
      .filter(Boolean)
      .join(' | ');

    const allergiesText = noKnownAllergies
      ? 'No Known Allergies'
      : notes.trim()
      ? notes.trim()
      : '';

    try {
      const patientRes = await api.patients.create(
        {
          fullName: fullName.trim(),
          age: parsedAge,
          gender: resolvedGender,
          mobile: cleanPhone,
          countryCode,
          weight: weight ? Number(weight) : undefined,
          notes: combinedNotes || undefined,
          discountPanel: discountPanel.trim() || undefined,
          allergies: allergiesText,
          primaryDiagnosis:
            selectedSymptoms.length > 0 ? selectedSymptoms[0] : 'General Consultation'
        },
        true
      );

      const shouldOnlySave =
        actionMode === 'save_only' || (!onStartConsultation && actionMode === 'auto');

      if (shouldOnlySave) {
        onPatientCreated?.(patientRes.patient);
        onClose();
        return;
      }

      if (onStartConsultation) {
        onPatientCreated?.(patientRes.patient);
        const consultationRes = await api.consultations.create({
          patientId: patientRes.patient.id,
          symptoms: selectedSymptoms
        });
        onStartConsultation(consultationRes.consultation, patientRes.patient);
      } else {
        onPatientCreated?.(patientRes.patient);
        onClose();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add patient');
    } finally {
      setIsSubmitting(false);
    }
  };

  // When patient finishes filling their details in "Hand to Patient" mode
  const handleCompletePatientSelfIntake = (andSubmitImmediately = false) => {
    if (mobile.length !== 10) {
      setError('Please enter your 10-digit mobile number.');
      return;
    }
    if (!fullName.trim()) {
      setError('Please enter your full name.');
      return;
    }
    if (!age || Number(age) <= 0 || Number(age) > 130) {
      setError('Please enter your age in years.');
      return;
    }
    setError(null);
    setPatientIntakeCompleted(true);
    if (andSubmitImmediately) {
      handleSavePatient(false);
    } else {
      setMode('doctor');
    }
  };

  const filteredSymptoms = PREDEFINED_SYMPTOMS.filter(s =>
    s.toLowerCase().includes(symptomSearch.toLowerCase().trim())
  );

  const avatarColors = [
    'bg-rose-500',
    'bg-amber-500',
    'bg-emerald-500',
    'bg-sky-500',
    'bg-indigo-500',
    'bg-purple-500'
  ];

  const mobileWalkInUrl = mobileSessionToken
    ? `${window.location.origin}/?walkInToken=${encodeURIComponent(mobileSessionToken)}`
    : '';

  // ============================================================================
  // STEP 1: OLDER "WALK-IN PATIENT" POPUP (Image 1)
  // ============================================================================
  if (step === 'search') {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
        <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="p-6 border-b border-slate-100 flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-teal-700" />
                Walk-in patient
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                {onStartConsultation
                  ? 'Find or add them, then go straight into the consultation.'
                  : 'Find or register the walk-in patient and check them into the front-desk queue.'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-5">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </span>
                <button type="button" onClick={() => setError(null)}>
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                  FIND THE PATIENT
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    autoFocus
                    placeholder="Name, code, or mobile number..."
                    value={searchQuery}
                    onChange={e => {
                      let val = e.target.value;
                      if (/^\d+$/.test(val)) {
                        val = val.slice(0, 10);
                      }
                      setSearchQuery(val);
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (searchResults.length === 1) {
                          handleSelectExistingPatient(searchResults[0]);
                        } else {
                          handleProceedToRegister();
                        }
                      }
                    }}
                    className="w-full text-sm pl-10 pr-14 py-2.5 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-teal-600 shadow-2xs"
                  />
                  {/^\d+$/.test(searchQuery) && searchQuery.length > 0 && (
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] font-mono font-semibold text-slate-400">
                      {searchQuery.length}/10
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">
                  A name or a 10-digit mobile number — either finds them.
                </p>
              </div>

              {/* Search Results Dropdown */}
              {searchQuery.trim().length > 0 && (
                <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 bg-white shadow-2xs max-h-60 overflow-y-auto">
                  {searchResults.length > 0 ? (
                    searchResults.map((pat, idx) => (
                      <button
                        key={pat.id}
                        type="button"
                        onClick={() => handleSelectExistingPatient(pat)}
                        disabled={isSubmitting}
                        className="w-full p-3 flex items-center justify-between text-left hover:bg-slate-50 transition-colors group"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-8 h-8 rounded-full ${
                              avatarColors[idx % avatarColors.length]
                            } text-white text-xs font-bold flex items-center justify-center shrink-0`}
                          >
                            {pat.fullName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-800 group-hover:text-teal-800">
                              {pat.fullName}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              {pat.patientCode} • {pat.mobile} • {pat.gender} • {pat.age}y
                            </p>
                          </div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-teal-700 transition-colors" />
                      </button>
                    ))
                  ) : !isSearching ? (
                    <div className="p-6 text-center text-xs text-slate-500">
                      No matching patients found with &quot;{searchQuery}&quot;.
                    </div>
                  ) : (
                    <div className="p-4 text-center text-xs text-slate-400">Searching...</div>
                  )}
                </div>
              )}

              {/* Action to switch to registration (opens the current walk-in "Add patient" interface) */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleProceedToRegister}
                  className="w-full py-2.5 px-4 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors flex items-center justify-center gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  {onStartConsultation ? 'Register & start consultation' : 'Register & check-in patient'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // STEP 2, MODE B: "HAND TO PATIENT" LOGICAL SELF-INTAKE MODE (ON DEVICE)
  // ============================================================================
  if (mode === 'patient') {
    const isPhoneComplete = mobile.replace(/\D/g, '').length === 10;

    return (
      <div className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
        <div className="bg-[#f8f7f4] rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden border border-slate-200/80 animate-in fade-in zoom-in-95 duration-200 my-auto">
          {/* Patient Self-Intake Header */}
          <div className="px-6 pt-6 pb-4 bg-[#3f6f66] text-white flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0 mt-0.5">
                <Smartphone className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest bg-white/20 px-2 py-0.5 rounded-full">
                    Patient Self Check-In
                  </span>
                </div>
                <h2 className="text-xl font-bold tracking-tight mt-1">
                  Welcome! Please enter your details
                </h2>
                <p className="text-xs text-teal-100 mt-0.5">
                  Start with your mobile number, then fill in your name, gender, age, weight &amp; symptoms.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setMode('doctor');
              }}
              className="text-teal-100 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors text-xs font-medium flex items-center gap-1"
              title="Return to Doctor View"
            >
              <ArrowLeft className="w-4 h-4" />
              Doctor View
            </button>
          </div>

          <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center justify-between">
                <span className="flex items-center gap-2 font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </span>
                <button type="button" onClick={() => setError(null)}>
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* STEP 1: MOBILE NUMBER */}
            <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#3f6f66] text-white text-[11px] flex items-center justify-center font-bold">
                    1
                  </span>
                  <Phone className="w-3.5 h-3.5 text-[#3f6f66]" />
                  Your Mobile Number <span className="text-rose-500">*</span>
                </label>
                {isPhoneComplete && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    <Check className="w-3 h-3" /> Verified 10 digits
                  </span>
                )}
              </div>

              <div className="flex items-stretch rounded-xl border border-slate-300 bg-white overflow-hidden focus-within:border-[#3f6f66] focus-within:ring-2 focus-within:ring-[#3f6f66]/15 transition-all">
                <select
                  value={countryCode}
                  onChange={e => setCountryCode(e.target.value)}
                  className="px-3 py-2.5 bg-slate-50 border-r border-slate-200 text-sm font-medium text-slate-800 focus:outline-none"
                >
                  {COUNTRY_CODES.map(c => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <input
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]{10}"
                  autoFocus={!isPhoneComplete}
                  placeholder="9876543210 (10 digits)"
                  value={mobile}
                  onChange={e => handleMobileChange(e.target.value)}
                  maxLength={10}
                  className="flex-1 px-3.5 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none"
                />
                {mobile.length > 0 && (
                  <span className="self-center mr-3 text-[11px] font-mono text-slate-400">
                    {mobile.length}/10
                  </span>
                )}
              </div>

              {existingDuplicatePatient && (
                <div className="p-2.5 bg-teal-50/90 border border-teal-200 rounded-lg flex items-center justify-between gap-2">
                  <div className="text-xs text-teal-900">
                    Welcome back, <span className="font-bold">{existingDuplicatePatient.fullName}</span>!
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setFullName(existingDuplicatePatient.fullName);
                      setAge(String(existingDuplicatePatient.age));
                      setSex(
                        existingDuplicatePatient.gender === 'Prefer not to say'
                          ? 'Not specified'
                          : existingDuplicatePatient.gender
                      );
                      if (existingDuplicatePatient.weight) {
                        setWeight(String(existingDuplicatePatient.weight));
                      }
                    }}
                    className="px-2.5 py-1 bg-[#3f6f66] text-white rounded-lg text-[11px] font-semibold hover:bg-[#335c54] shrink-0"
                  >
                    Auto-fill My Info
                  </button>
                </div>
              )}
            </div>

            {/* STEP 2: PERSONAL & VITALS DETAILS (Name, Gender, Age, Weight) */}
            <div
              className={`bg-white p-4 rounded-xl border transition-all space-y-4 ${
                isPhoneComplete
                  ? 'border-slate-200/90 shadow-2xs opacity-100'
                  : 'border-slate-200/60 opacity-90'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#3f6f66] text-white text-[11px] flex items-center justify-center font-bold">
                    2
                  </span>
                  <User className="w-3.5 h-3.5 text-[#3f6f66]" />
                  Personal Details (Name, Gender, Age &amp; Weight)
                </span>
                {!isPhoneComplete && (
                  <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 font-medium">
                    Enter 10-digit mobile above first
                  </span>
                )}
              </div>

              {/* Full Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    placeholder="Enter your full name"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    className="w-full px-3.5 py-2.5 pr-10 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#3f6f66] focus:ring-2 focus:ring-[#3f6f66]/15"
                  />
                  <div className="absolute right-2">
                    <VoiceDictationButton
                      value={fullName}
                      onChange={setFullName}
                      variant="badge"
                      className="border-0 shadow-none bg-transparent"
                      title="Speak your full name"
                    />
                  </div>
                </div>
              </div>

              {/* Gender selection pills */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Gender <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['Female', 'Male', 'Other'] as const).map(g => {
                    const active = sex === g;
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setSex(g)}
                        className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all flex items-center justify-center gap-1.5 ${
                          active
                            ? 'bg-[#3f6f66] text-white border-[#3f6f66] shadow-2xs'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {active && <Check className="w-3.5 h-3.5" />}
                        {g}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Age & Weight side-by-side */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
                    <Activity className="w-3.5 h-3.5 text-[#3f6f66]" />
                    Age (years) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="125"
                    placeholder="e.g. 28"
                    value={age}
                    onChange={e => setAge(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#3f6f66] focus:ring-2 focus:ring-[#3f6f66]/15"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
                    <Scale className="w-3.5 h-3.5 text-[#3f6f66]" />
                    Weight (kg) <span className="text-[11px] font-normal text-slate-400">(optional)</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="300"
                    step="0.5"
                    placeholder="e.g. 64"
                    value={weight}
                    onChange={e => setWeight(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#3f6f66] focus:ring-2 focus:ring-[#3f6f66]/15"
                  />
                </div>
              </div>
            </div>

            {/* STEP 3: SYMPTOMS / REASON FOR VISIT */}
            <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#3f6f66] text-white text-[11px] flex items-center justify-center font-bold">
                    3
                  </span>
                  <Stethoscope className="w-3.5 h-3.5 text-[#3f6f66]" />
                  Symptoms / Reason for Visit
                </label>
                {selectedSymptoms.length > 0 && (
                  <span className="text-[11px] font-semibold text-[#3f6f66] bg-teal-50 px-2 py-0.5 rounded-full">
                    {selectedSymptoms.length} selected
                  </span>
                )}
              </div>

              {selectedSymptoms.length > 0 && (
                <div className="flex flex-wrap gap-1.5 p-2.5 bg-teal-50/60 rounded-xl border border-teal-100">
                  {selectedSymptoms.map(sym => (
                    <span
                      key={sym}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#3f6f66] text-white"
                    >
                      {sym}
                      <button
                        type="button"
                        onClick={() => toggleSymptom(sym)}
                        className="hover:text-teal-200"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-0.5">
                {filteredSymptoms.slice(0, 14).map(s => {
                  const isSelected = selectedSymptoms.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleSymptom(s)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                        isSelected
                          ? 'bg-[#3f6f66] text-white border-[#3f6f66] font-semibold'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-[#3f6f66]'
                      }`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  placeholder="Describe any other symptom (or tap mic)..."
                  value={customSymptom}
                  onChange={e => setCustomSymptom(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCustomSymptom();
                    }
                  }}
                  className="flex-1 text-xs px-3.5 py-2 bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-[#3f6f66]"
                />
                <VoiceDictationButton
                  value={customSymptom}
                  onChange={setCustomSymptom}
                  variant="badge"
                  title="Speak symptom"
                />
                <button
                  type="button"
                  onClick={handleAddCustomSymptom}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </div>
            </div>

            {/* STEP 4: ALLERGIES CONFIRMATION */}
            <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#3f6f66] text-white text-[11px] flex items-center justify-center font-bold">
                    4
                  </span>
                  Known Allergies / Notes <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={noKnownAllergies}
                    onChange={e => {
                      setNoKnownAllergies(e.target.checked);
                      if (e.target.checked) setNotes('No known allergies');
                      else if (notes === 'No known allergies') setNotes('');
                    }}
                    className="rounded border-slate-300 text-[#3f6f66] focus:ring-[#3f6f66]"
                  />
                  No known allergies
                </label>
              </div>
              <input
                type="text"
                disabled={noKnownAllergies}
                placeholder="Any drug/food allergies or preferred language"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#3f6f66] disabled:bg-slate-50 disabled:text-slate-400"
              />
            </div>

            {/* Footer actions for Patient Self-Intake */}
            <div className="flex flex-col sm:flex-row items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => handleCompletePatientSelfIntake(false)}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors"
              >
                Done — Review in Doctor Window
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => handleCompletePatientSelfIntake(true)}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#3f6f66] hover:bg-[#335c54] text-white text-xs font-semibold shadow-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                {isSubmitting ? 'Saving...' : 'Submit & Hand Back to Doctor'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // STEP 2, MODE A: DOCTOR / CLINIC "ADD PATIENT" WINDOW (Tabbed + Enter-to-Next-Tab)
  // ============================================================================
  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onKeyDown={e => {
        if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
        const target = e.target as HTMLElement | null;
        if (target?.tagName === 'BUTTON') return;
        if (registerTab === 'details' && isDetailsTabComplete) {
          e.preventDefault();
          handleSwitchRegisterTab('clinical', true);
        } else if (registerTab === 'clinical' && isClinicalTabComplete) {
          e.preventDefault();
          handleSwitchRegisterTab('mobile', true);
        }
      }}
    >
      <div className="bg-[#f9f8f6] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden border border-slate-200/90 animate-in fade-in zoom-in-95 duration-200 my-auto">
        {/* Header */}
        <div className="px-7 pt-6 pb-3 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              {initialStep === 'search' && (
                <button
                  type="button"
                  onClick={() => setStep('search')}
                  className="text-slate-400 hover:text-slate-700 p-1 -ml-1 rounded-lg hover:bg-slate-200/50 transition-colors"
                  title="Back to Find Patient"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
              )}
              <h2 className="text-[22px] font-bold text-slate-900 tracking-tight leading-snug">
                Add patient
              </h2>
              {tabAdvanceNotice && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-teal-700 text-white text-[11px] font-bold shadow-xs animate-in fade-in zoom-in-95 duration-150">
                  <CheckCircle2 className="w-3 h-3 text-emerald-300" />
                  {tabAdvanceNotice}
                </span>
              )}
            </div>
            <p className="text-[13px] text-slate-500 mt-0.5 leading-relaxed">
              Fill fields in each tab — pressing <kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded text-[10px] font-mono font-bold text-slate-700">Enter ↵</kbd> moves to the next tab when complete.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/50 transition-colors -mr-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Segmented Tab Bar */}
        <div className="px-7 pb-2">
          <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-200/75 rounded-xl border border-slate-200/90">
            <button
              type="button"
              onClick={() => handleSwitchRegisterTab('details')}
              className={`py-2 px-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                registerTab === 'details'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : isDetailsTabComplete
                  ? 'text-emerald-800 hover:bg-white/60'
                  : 'text-slate-600 hover:bg-white/50'
              }`}
            >
              {isDetailsTabComplete ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              ) : (
                <span className="w-4 h-4 rounded-full bg-slate-300/80 text-slate-700 text-[10px] flex items-center justify-center font-bold shrink-0">
                  1
                </span>
              )}
              <span className="truncate">Details</span>
            </button>

            <button
              type="button"
              onClick={() => handleSwitchRegisterTab('clinical')}
              className={`py-2 px-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                registerTab === 'clinical'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : isClinicalTabComplete
                  ? 'text-emerald-800 hover:bg-white/60'
                  : 'text-slate-600 hover:bg-white/50'
              }`}
            >
              {isClinicalTabComplete ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              ) : (
                <span className="w-4 h-4 rounded-full bg-slate-300/80 text-slate-700 text-[10px] flex items-center justify-center font-bold shrink-0">
                  2
                </span>
              )}
              <span className="truncate">Symptoms &amp; Notes</span>
            </button>

            <button
              type="button"
              onClick={() => {
                handleSwitchRegisterTab('mobile');
                if (!mobileSessionToken) {
                  ensureMobileSessionLink();
                }
              }}
              className={`py-2 px-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                registerTab === 'mobile'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : patientIntakeCompleted
                  ? 'text-emerald-800 hover:bg-white/60'
                  : 'text-slate-600 hover:bg-white/50'
              }`}
            >
              {patientIntakeCompleted ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              ) : (
                <span className="w-4 h-4 rounded-full bg-slate-300/80 text-slate-700 text-[10px] flex items-center justify-center font-bold shrink-0">
                  3
                </span>
              )}
              <span className="truncate">Mobile / Review</span>
            </button>
          </div>

          {/* Live Ready / Press Enter Banner */}
          {registerTab === 'details' && isDetailsTabComplete && (
            <div className="mt-2 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-between text-[11px] text-emerald-900 font-semibold animate-in fade-in duration-150">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                All patient details filled!
              </span>
              <button
                type="button"
                onClick={() => handleSwitchRegisterTab('clinical', true)}
                className="inline-flex items-center gap-1 text-emerald-800 hover:text-emerald-950 font-bold cursor-pointer"
              >
                <span>Press Enter ↵ → Symptoms &amp; Notes</span>
              </button>
            </div>
          )}

          {registerTab === 'clinical' && isClinicalTabComplete && (
            <div className="mt-2 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-between text-[11px] text-emerald-900 font-semibold animate-in fade-in duration-150">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                Symptoms &amp; notes complete!
              </span>
              <button
                type="button"
                onClick={() => handleSwitchRegisterTab('mobile', true)}
                className="inline-flex items-center gap-1 text-emerald-800 hover:text-emerald-950 font-bold cursor-pointer"
              >
                <span>Press Enter ↵ → Mobile / Review</span>
              </button>
            </div>
          )}
        </div>

        {/* Form Body */}
        <div className="px-7 pb-6 pt-2 space-y-4 max-h-[78vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center justify-between">
              <span className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </span>
              <button type="button" onClick={() => setError(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Banner if patient just completed self-intake (via Hand-to-Patient OR Mobile Link) */}
          {patientIntakeCompleted && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-900">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  <strong className="font-semibold">Patient check-in received!</strong>{' '}
                  {weight ? `Weight: ${weight} kg` : ''}{' '}
                  {selectedSymptoms.length > 0
                    ? `• Symptoms: ${selectedSymptoms.join(', ')}`
                    : ''}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMode('patient')}
                className="text-[11px] font-semibold text-emerald-800 underline hover:text-emerald-950 shrink-0 ml-2"
              >
                Edit intake
              </button>
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 1: PATIENT DETAILS (Name, Sex, Age, Phone)                    */}
          {/* ================================================================= */}
          {registerTab === 'details' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* 1. Patient name */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[13px] font-semibold text-slate-800">
                    Patient name <span className="text-rose-500">*</span>
                  </label>
                  {fullName.trim().length >= 2 && (
                    <span className="text-[10px] font-bold text-emerald-700 flex items-center gap-0.5">
                      <Check className="w-3 h-3" /> Filled
                    </span>
                  )}
                </div>
                <div className="relative">
                  <input
                    ref={fullNameInputRef}
                    type="text"
                    autoFocus
                    placeholder="Patient's full name (Press Enter for next field)"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    onKeyDown={handleDetailsEnterKey}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300/90 rounded-xl text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#3f6f66] focus:ring-2 focus:ring-[#3f6f66]/15 transition-all"
                  />
                </div>

                {/* Quick matching existing patients dropdown if found */}
                {matchingPatients.length > 0 && !patientIntakeCompleted && (
                  <div className="mt-1.5 bg-white border border-slate-200 rounded-xl shadow-sm divide-y divide-slate-100 overflow-hidden">
                    <div className="px-3 py-1.5 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Existing patients matching &ldquo;{fullName}&rdquo; — click to start consultation
                    </div>
                    {matchingPatients.map(pat => (
                      <button
                        key={pat.id}
                        type="button"
                        onClick={() => handleSelectExistingPatient(pat)}
                        className="w-full px-3 py-2 text-left hover:bg-teal-50/60 flex items-center justify-between text-xs transition-colors"
                      >
                        <div>
                          <span className="font-semibold text-slate-800">{pat.fullName}</span>
                          <span className="text-slate-400 ml-2">
                            {pat.patientCode} • {pat.mobile} • {pat.age}y {pat.gender}
                          </span>
                        </div>
                        <span className="text-[11px] font-semibold text-[#3f6f66]">
                          Select →
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 2. Sex & Age (years) side-by-side */}
              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-[13px] font-semibold text-slate-800">
                      Sex <span className="text-rose-500">*</span>
                    </label>
                    {sex !== 'Not specified' && (
                      <span className="text-[10px] font-bold text-emerald-700 flex items-center gap-0.5">
                        <Check className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                  <select
                    ref={sexSelectRef}
                    value={sex}
                    onChange={e =>
                      setSex(e.target.value as 'Not specified' | 'Female' | 'Male' | 'Other')
                    }
                    onKeyDown={handleDetailsEnterKey}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300/90 rounded-xl text-[14px] text-slate-800 focus:outline-none focus:border-[#3f6f66] focus:ring-2 focus:ring-[#3f6f66]/15 transition-all"
                  >
                    <option value="Not specified">Not specified</option>
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-[13px] font-semibold text-slate-800">
                      Age (years) <span className="text-rose-500">*</span>
                    </label>
                    {age.trim() !== '' && Number(age) > 0 && (
                      <span className="text-[10px] font-bold text-emerald-700 flex items-center gap-0.5">
                        <Check className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                  <input
                    ref={ageInputRef}
                    type="number"
                    min="0"
                    max="125"
                    placeholder="Age in years"
                    value={age}
                    onChange={e => setAge(e.target.value)}
                    onKeyDown={handleDetailsEnterKey}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300/90 rounded-xl text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#3f6f66] focus:ring-2 focus:ring-[#3f6f66]/15 transition-all"
                  />
                </div>
              </div>

              {/* 3. Patient phone */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[13px] font-semibold text-slate-800">
                    Patient phone <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      handleSwitchRegisterTab('mobile');
                      handleOpenSendLinkPanel();
                    }}
                    className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[#3f6f66] hover:text-[#2f564f] underline underline-offset-2"
                  >
                    <Send className="w-3 h-3" />
                    Send walk-in link to patient&apos;s mobile
                  </button>
                </div>
                <div className="flex items-stretch gap-2">
                  <select
                    value={countryCode}
                    onChange={e => setCountryCode(e.target.value)}
                    className="w-24 px-3 py-2.5 bg-white border border-slate-300/90 rounded-xl text-[14px] text-slate-800 focus:outline-none focus:border-[#3f6f66] focus:ring-2 focus:ring-[#3f6f66]/15 transition-all"
                  >
                    {COUNTRY_CODES.map(c => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                  </select>

                  <div className="relative flex-1 flex items-center">
                    <input
                      ref={mobileInputRef}
                      type="tel"
                      inputMode="numeric"
                      pattern="[0-9]{10}"
                      placeholder="9876543210 (10 digits — Enter advances tab)"
                      value={mobile}
                      onChange={e => handleMobileChange(e.target.value)}
                      onKeyDown={handleDetailsEnterKey}
                      maxLength={10}
                      className="w-full pl-3.5 pr-12 py-2.5 bg-white border border-slate-300/90 rounded-xl text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#3f6f66] focus:ring-2 focus:ring-[#3f6f66]/15 transition-all"
                    />
                    {mobile.length > 0 && (
                      <span className="absolute right-3 text-[11px] font-mono text-slate-400 pointer-events-none">
                        {mobile.length}/10
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-[11.5px] text-slate-500 mt-1.5 leading-snug">
                  Defaults to India (+91) — once all 4 fields above are filled, press <strong className="text-slate-700">Enter ↵</strong> to jump to Symptoms &amp; Notes.
                </p>

                {existingDuplicatePatient && (
                  <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-2 text-xs">
                    <div className="text-amber-900">
                      Phone matches <span className="font-bold">{existingDuplicatePatient.fullName}</span> ({existingDuplicatePatient.patientCode})
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSelectExistingPatient(existingDuplicatePatient)}
                      className="px-2.5 py-1 bg-[#3f6f66] text-white rounded-lg font-semibold hover:bg-[#335c54] shrink-0"
                    >
                      Use Existing
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 2: SYMPTOMS, CLINICAL NOTES & DISCOUNT/WEIGHT                 */}
          {/* ================================================================= */}
          {registerTab === 'clinical' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Symptoms / Reason */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="block text-[11.5px] font-bold uppercase tracking-wider text-slate-500">
                    SYMPTOMS / REASON FOR VISIT
                  </label>
                  {selectedSymptoms.length > 0 && (
                    <span className="text-[11px] font-semibold text-[#3f6f66] bg-teal-50 px-2 py-0.5 rounded-full">
                      {selectedSymptoms.length} selected
                    </span>
                  )}
                </div>

                {selectedSymptoms.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 p-2 bg-teal-50/60 rounded-xl border border-teal-100">
                    {selectedSymptoms.map(sym => (
                      <span
                        key={sym}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#3f6f66] text-white"
                      >
                        {sym}
                        <button
                          type="button"
                          onClick={() => toggleSymptom(sym)}
                          className="hover:text-teal-200"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    ref={symptomSearchInputRef}
                    type="text"
                    placeholder={`Search ${PREDEFINED_SYMPTOMS.length} symptoms (Press Enter to select or advance)...`}
                    value={symptomSearch}
                    onChange={e => setSymptomSearch(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        e.stopPropagation();
                        if (symptomSearch.trim() && filteredSymptoms.length > 0) {
                          const topSym = filteredSymptoms[0];
                          if (!selectedSymptoms.includes(topSym)) {
                            setSelectedSymptoms(prev => [...prev, topSym]);
                          }
                          setSymptomSearch('');
                        } else if (isClinicalTabComplete) {
                          handleSwitchRegisterTab('mobile', true);
                        } else if (selectedSymptoms.length > 0 && !notes.trim()) {
                          notesInputRef.current?.focus();
                        }
                      }
                    }}
                    className="w-full pl-8 pr-3 py-2 bg-white border border-slate-300/90 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#3f6f66] focus:ring-2 focus:ring-[#3f6f66]/15 transition-all"
                  />
                  {symptomSearch && (
                    <button
                      type="button"
                      onClick={() => setSymptomSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto py-0.5">
                  {(symptomSearch.trim() ? filteredSymptoms : filteredSymptoms.slice(0, 16)).map(sym => {
                    const isSelected = selectedSymptoms.includes(sym);
                    return (
                      <button
                        key={sym}
                        type="button"
                        onClick={() => toggleSymptom(sym)}
                        className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                          isSelected
                            ? 'bg-[#3f6f66] text-white border-[#3f6f66] font-semibold shadow-2xs'
                            : 'bg-slate-50/80 text-slate-700 border-slate-200/90 hover:border-slate-300 hover:bg-slate-100/70'
                        }`}
                      >
                        {sym}
                      </button>
                    );
                  })}
                  {filteredSymptoms.length === 0 && (
                    <span className="text-xs text-slate-400 py-1">
                      No matching symptom found. Add it below as a custom symptom.
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    ref={customSymptomInputRef}
                    type="text"
                    placeholder="Add a custom symptom (press Enter)"
                    value={customSymptom}
                    onChange={e => setCustomSymptom(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        e.stopPropagation();
                        if (customSymptom.trim()) {
                          handleAddCustomSymptom();
                        } else if (isClinicalTabComplete) {
                          handleSwitchRegisterTab('mobile', true);
                        } else {
                          notesInputRef.current?.focus();
                        }
                      }
                    }}
                    className="flex-1 px-3 py-2 bg-white border border-slate-300/90 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#3f6f66] focus:ring-2 focus:ring-[#3f6f66]/15 transition-all"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomSymptom}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl inline-flex items-center gap-1 transition-colors shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                </div>
              </div>

              {/* Notes */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[13px] font-semibold text-slate-800">
                    Notes / Allergies
                  </label>
                  <span className="text-[10px] text-slate-400">
                    Press Enter ↵ to advance to Mobile / Review tab
                  </span>
                </div>
                <textarea
                  ref={notesInputRef}
                  rows={2}
                  placeholder="Anything worth recording — e.g. allergies mentioned, preferred language"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      e.stopPropagation();
                      if (isClinicalTabComplete) {
                        handleSwitchRegisterTab('mobile', true);
                      } else if (selectedSymptoms.length === 0) {
                        symptomSearchInputRef.current?.focus();
                      }
                    }
                  }}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300/90 rounded-xl text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#3f6f66] focus:ring-2 focus:ring-[#3f6f66]/15 transition-all resize-none"
                />
              </div>

              {/* Collapsible "> Add discount / panel" */}
              <div className="pt-0.5">
                <button
                  type="button"
                  onClick={() => setShowDiscountPanel(prev => !prev)}
                  className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-600 hover:text-slate-900 transition-colors"
                >
                  {showDiscountPanel ? (
                    <ChevronDown className="w-4 h-4 text-slate-500" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-500" />
                  )}
                  Add discount / panel &amp; weight
                </button>

                {showDiscountPanel && (
                  <div className="mt-2.5 pl-1 grid grid-cols-1 sm:grid-cols-2 gap-3 animate-in fade-in duration-150">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Discount / Corporate Panel
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. CGHS, Senior Citizen 10%, Staff"
                        value={discountPanel}
                        onChange={e => setDiscountPanel(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#3f6f66]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Weight (kg) <span className="font-normal text-slate-400">(optional)</span>
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="300"
                        step="0.5"
                        placeholder="e.g. 65"
                        value={weight}
                        onChange={e => setWeight(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#3f6f66]"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 3: MOBILE SELF CHECK-IN LINK & PATIENT SUMMARY REVIEW         */}
          {/* ================================================================= */}
          {registerTab === 'mobile' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Summary Card of Entered Details */}
              <div className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-2 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Patient Registration Summary
                  </span>
                  <button
                    type="button"
                    onClick={() => handleSwitchRegisterTab('details')}
                    className="text-[11px] font-semibold text-[#3f6f66] hover:underline"
                  >
                    Edit details
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Full Name</span>
                    <span className="font-bold text-slate-900">{fullName.trim() || 'Not entered'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Sex &amp; Age</span>
                    <span className="font-semibold text-slate-800">
                      {sex} • {age ? `${age} yrs` : 'Age not set'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Mobile</span>
                    <span className="font-mono font-semibold text-slate-800">
                      {mobile ? `${countryCode} ${mobile}` : 'Not entered'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Symptoms</span>
                    <span className="font-semibold text-teal-800">
                      {selectedSymptoms.length > 0 ? selectedSymptoms.join(', ') : 'General Consultation'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Mobile Link Share Panel */}
              <div className="p-3.5 bg-teal-50/70 border border-teal-200/90 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-[#3f6f66]" />
                    <span className="text-xs font-bold text-slate-800">
                      Open Walk-In Screen on Patient&apos;s Mobile
                    </span>
                  </div>
                  {mobileSessionToken && !mobileSessionSubmittedAt && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-teal-800 bg-white px-2 py-0.5 rounded-full border border-teal-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-teal-600 animate-pulse" />
                      Waiting for patient...
                    </span>
                  )}
                  {mobileSessionSubmittedAt && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300">
                      <CheckCircle2 className="w-3 h-3" />
                      Synced from mobile
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Send a self check-in link to{' '}
                  <strong className="text-slate-800">
                    {mobile.length === 10 ? `${countryCode} ${mobile}` : 'the patient’s mobile'}
                  </strong>
                  . When opened on their phone, their submitted details auto-fill this screen.
                </p>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={isGeneratingLink}
                    onClick={handleSendWhatsAppToPatient}
                    className="px-3 py-1.5 rounded-lg bg-[#25D366] hover:bg-[#1ebe5a] text-white text-xs font-bold shadow-2xs transition-colors inline-flex items-center gap-1.5"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    Send via WhatsApp
                  </button>

                  <button
                    type="button"
                    disabled={isGeneratingLink}
                    onClick={handleSendSmsToPatient}
                    className="px-3 py-1.5 rounded-lg bg-[#3f6f66] hover:bg-[#325a52] text-white text-xs font-bold shadow-2xs transition-colors inline-flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Send SMS Link
                  </button>

                  <button
                    type="button"
                    disabled={isGeneratingLink}
                    onClick={handleCopyMobileLink}
                    className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-semibold transition-colors inline-flex items-center gap-1.5"
                  >
                    {linkCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copy Link
                      </>
                    )}
                  </button>

                  {!showMobileLinkPanel && (
                    <button
                      type="button"
                      onClick={handleOpenSendLinkPanel}
                      className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-semibold transition-colors inline-flex items-center gap-1.5"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      Show QR
                    </button>
                  )}
                </div>

                {/* Optional QR Code & Direct Preview Link */}
                {mobileWalkInUrl && (
                  <div
                    className={`pt-2.5 border-t border-teal-200/70 transition-all duration-150 ease-out ${
                      isQrExpanded
                        ? 'flex flex-col items-center text-center gap-2.5'
                        : 'flex items-center gap-3'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setIsQrExpanded(prev => !prev)}
                      title={isQrExpanded ? 'Click to shrink QR code' : 'Click to expand QR code'}
                      className="group relative rounded-xl border border-slate-200 bg-white p-1.5 shrink-0 shadow-2xs hover:border-[#3f6f66] transition-all duration-150 ease-out cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#3f6f66]/25"
                    >
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(
                          mobileWalkInUrl
                        )}`}
                        alt="Patient Mobile Walk-In QR"
                        className={`object-contain transition-all duration-150 ease-out ${
                          isQrExpanded ? 'w-52 h-52' : 'w-20 h-20'
                        }`}
                      />
                      <span className="block text-[9.5px] font-medium text-slate-400 group-hover:text-[#3f6f66] mt-0.5">
                        {isQrExpanded ? 'Click to shrink' : 'Click to expand'}
                      </span>
                    </button>
                    <div className="space-y-1.5 text-[11px] text-slate-600 min-w-0 flex-1 w-full">
                      <div className="font-semibold text-slate-800">
                        Or let patient scan this QR on their phone
                      </div>
                      <div className="truncate font-mono text-[10px] bg-white px-2 py-1 rounded border border-slate-200 text-slate-500">
                        {mobileWalkInUrl}
                      </div>
                      <a
                        href={mobileWalkInUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[#3f6f66] font-bold hover:underline"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Open mobile walk-in screen preview
                      </a>
                    </div>
                  </div>
                )}

                {isGeneratingLink && (
                  <div className="flex items-center gap-1.5 text-[11px] text-teal-800">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Preparing secure mobile walk-in link...
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Clinical Informed Consent & Regulatory Notice */}
          <div className="pt-2.5 pb-1">
            <label className="flex items-start gap-2.5 cursor-pointer text-[11.5px] text-slate-600 select-none">
              <input
                type="checkbox"
                checked={consentAccepted}
                onChange={e => setConsentAccepted(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-[#3f6f66] focus:ring-[#3f6f66] w-4 h-4 cursor-pointer"
              />
              <span className="leading-tight">
                Patient has provided informed consent for medical examination, electronic medical records storage, and digital prescriptions.
              </span>
            </label>
          </div>

          {/* Footer Action Row: Cancel | Hand to patient | Next Tab / Save / Add patient */}
          <div className="pt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/80">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 rounded-xl text-[12.5px] font-semibold text-slate-600 hover:bg-slate-200/60 transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setMode('patient');
                }}
                className="px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-[12.5px] font-semibold shadow-2xs transition-all inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Smartphone className="w-3.5 h-3.5 text-slate-600" />
                Hand to patient
              </button>
            </div>

            <div className="flex items-center gap-2">
              {registerTab !== 'mobile' && (
                <button
                  type="button"
                  onClick={() =>
                    handleSwitchRegisterTab(
                      registerTab === 'details' ? 'clinical' : 'mobile',
                      true
                    )
                  }
                  className="px-3.5 py-2 rounded-xl border border-teal-200 bg-teal-50/80 hover:bg-teal-100 text-teal-900 text-[12.5px] font-bold transition-all inline-flex items-center gap-1 cursor-pointer"
                >
                  <span>Next Tab</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}

              {onStartConsultation ? (
                <>
                  <button
                    type="button"
                    disabled={isSubmitting || !consentAccepted}
                    onClick={() => handleSavePatient(false, 'save_only')}
                    className="px-3.5 py-2 rounded-xl border border-[#3f6f66] bg-white hover:bg-teal-50/70 text-[#3f6f66] text-[12.5px] font-semibold shadow-2xs transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {isSubmitting ? 'Saving...' : 'Save patient'}
                  </button>
                  <button
                    type="button"
                    disabled={isSubmitting || !consentAccepted}
                    onClick={() => handleSavePatient(false, 'start_consultation')}
                    className="px-4 py-2 rounded-xl bg-[#3f6f66] hover:bg-[#335c54] text-white text-[12.5px] font-semibold shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {isSubmitting ? 'Saving...' : 'Add & Consult'}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={isSubmitting || !consentAccepted}
                  onClick={() => handleSavePatient(false, 'save_only')}
                  className="px-4 py-2 rounded-xl bg-[#3f6f66] hover:bg-[#335c54] text-white text-[13px] font-semibold shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? 'Saving...' : 'Add patient'}
                </button>
              )}
            </div>
          </div>

          {/* Bottom Caption */}
          <p className="text-center text-[11px] text-slate-500 pt-0.5">
            Tip: When all fields in a tab are filled, pressing <strong>Enter ↵</strong> automatically moves to the next tab.
          </p>
        </div>
      </div>
    </div>
  );
};
