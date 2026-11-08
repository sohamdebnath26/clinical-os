import React, { useState, useEffect, useRef } from 'react';
import { ClinicStats, Consultation, Patient, Appointment, PracticeRevenueAnalytics } from '../types';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { api } from '../lib/api';
import { PREDEFINED_DIAGNOSES } from '../data/clinicalCatalogues';
import { AddPatientModal } from './AddPatientModal';
import { ScheduleAppointmentModal } from './ScheduleAppointmentModal';
import { ThemeToggleButton } from '../context/ThemeContext';
import { Menu, X, ArrowRight, ZoomIn, ZoomOut, RotateCcw, Maximize2 } from 'lucide-react';

const DEFAULT_DAY1_CLINICAL_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200">
    <defs>
      <radialGradient id="skinA" cx="50%" cy="50%" r="70%">
        <stop offset="0%" stop-color="#e8c3a5"/>
        <stop offset="100%" stop-color="#d4a682"/>
      </radialGradient>
      <radialGradient id="lesionA" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#b93829" stop-opacity="0.82"/>
        <stop offset="55%" stop-color="#d95f4b" stop-opacity="0.65"/>
        <stop offset="100%" stop-color="#e8c3a5" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="320" height="200" fill="url(#skinA)"/>
    <ellipse cx="160" cy="102" rx="76" ry="52" fill="url(#lesionA)"/>
    <circle cx="142" cy="94" r="6" fill="#8f2419" opacity="0.55"/>
    <circle cx="176" cy="108" r="8" fill="#8f2419" opacity="0.5"/>
    <circle cx="158" cy="116" r="5" fill="#a52f22" opacity="0.55"/>
    <ellipse cx="160" cy="102" rx="64" ry="42" fill="none" stroke="#ffffff" stroke-width="1.2" stroke-dasharray="4,3" opacity="0.7"/>
  </svg>`
)}`;

const DEFAULT_RECENT_CLINICAL_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200">
    <defs>
      <radialGradient id="skinB" cx="50%" cy="50%" r="70%">
        <stop offset="0%" stop-color="#eadbcf"/>
        <stop offset="100%" stop-color="#d8b294"/>
      </radialGradient>
      <radialGradient id="lesionB" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#d97b6c" stop-opacity="0.42"/>
        <stop offset="65%" stop-color="#e39d8d" stop-opacity="0.22"/>
        <stop offset="100%" stop-color="#eadbcf" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="320" height="200" fill="url(#skinB)"/>
    <ellipse cx="160" cy="102" rx="48" ry="32" fill="url(#lesionB)"/>
    <ellipse cx="160" cy="102" rx="44" ry="28" fill="none" stroke="#10b981" stroke-width="1.4" stroke-dasharray="4,3" opacity="0.85"/>
  </svg>`
)}`;

interface DashboardViewProps {
  onOpenWalkIn: () => void;
  onOpenAIAssistant: () => void;
  onSelectPatient: (patientId: string) => void;
  onStartConsultationForPatient: (patient: Patient) => void;
  onNavigateToAppointments?: () => void;
  onNavigateToPatients?: () => void;
  onNavigateToPrescriptions?: () => void;
  onNavigateToImageAnalyzer?: () => void;
  onToggleMobileMenu?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onOpenWalkIn,
  onOpenAIAssistant,
  onSelectPatient,
  onStartConsultationForPatient,
  onNavigateToAppointments,
  onNavigateToPatients,
  onNavigateToPrescriptions,
  onNavigateToImageAnalyzer,
  onToggleMobileMenu
}) => {
  const { doctor, switchRoleSession } = useAuth();
  const isReceptionist = doctor?.role === 'receptionist';
  const { language } = useLanguage();
  const cachedInitial = api.dashboard.getCachedStats();
  const [stats, setStats] = useState<ClinicStats | null>(() => cachedInitial?.stats || null);
  const [revenue, setRevenue] = useState<PracticeRevenueAnalytics | null>(() => cachedInitial?.revenue || null);
  const [recentVisits, setRecentVisits] = useState<Consultation[]>(() => cachedInitial?.recentVisits || []);
  const [recentPatients, setRecentPatients] = useState<Patient[]>(() => cachedInitial?.recentPatients || []);
  const [appointments, setAppointments] = useState<Appointment[]>(() => api.appointments.getCachedList());

  // Quick action modals
  const [showAddPatientModal, setShowAddPatientModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);

  // Next in Queue Day 1 & Recent Visit Image Zoom Modal state
  const [queueZoomModal, setQueueZoomModal] = useState<{
    activeSide: 'day1' | 'recent' | 'both';
    zoom: number;
  } | null>(null);

  // Integrated Header Search State
  const [query, setQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchPatients, setSearchPatients] = useState<Patient[]>([]);
  const [matchingDiagnoses, setMatchingDiagnoses] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadDashboardData = () => {
    Promise.allSettled([
      api.dashboard.getStats(),
      api.appointments.list()
    ]).then(([dashResult, apptResult]) => {
      if (dashResult.status === 'fulfilled' && dashResult.value) {
        const dashRes = dashResult.value;
        if (dashRes.stats) setStats(dashRes.stats);
        setRecentVisits(Array.isArray(dashRes.recentVisits) ? dashRes.recentVisits : []);
        setRecentPatients(Array.isArray(dashRes.recentPatients) ? dashRes.recentPatients : []);
        if (dashRes.revenue) {
          setRevenue(dashRes.revenue);
        }
      } else if (dashResult.status === 'rejected') {
        console.warn('Dashboard stats error:', dashResult.reason);
      }

      if (apptResult.status === 'fulfilled' && apptResult.value) {
        setAppointments(
          Array.isArray(apptResult.value.appointments) ? apptResult.value.appointments : []
        );
      } else if (apptResult.status === 'rejected') {
        console.warn('Dashboard appointments error:', apptResult.reason);
      }
    });
  };

  useEffect(() => {
    loadDashboardData();
    const handlePatientsUpdated = () => {
      loadDashboardData();
    };
    window.addEventListener('clinical_os_patients_updated', handlePatientsUpdated);
    return () => window.removeEventListener('clinical_os_patients_updated', handlePatientsUpdated);
  }, [doctor?.id]);

  // Global keyboard shortcut: Cmd+K / Ctrl+K to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        if (query.trim()) {
          setIsSearchOpen(true);
        }
      } else if (e.key === 'Escape') {
        setIsSearchOpen(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [query]);

  useEffect(() => {
    if (!query.trim()) {
      setSearchPatients([]);
      setMatchingDiagnoses([]);
      setIsSearchOpen(false);
      return;
    }

    setIsSearchOpen(true);
    const diags = PREDEFINED_DIAGNOSES.filter(d =>
      d.toLowerCase().includes(query.toLowerCase().trim())
    ).slice(0, 5);
    setMatchingDiagnoses(diags);

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await api.patients.list(query.trim());
        setSearchPatients(res.patients.slice(0, 6));
      } catch {
        // ignore
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Compute greeting based on time of day and language
  const hour = new Date().getHours();
  let greeting = 'Good afternoon';
  if (language === 'hi') {
    greeting = hour >= 12 && hour < 17 ? 'शुभ दोपहर' : hour >= 17 ? 'शुभ संध्या' : 'शुभ प्रभात';
  } else if (language === 'pa') {
    greeting = hour >= 12 && hour < 17 ? 'ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ' : hour >= 17 ? 'ਸ਼ੁਭ ਸ਼ਾਮ' : 'ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ';
  } else {
    if (hour < 12) greeting = 'Good morning';
    else if (hour >= 17) greeting = 'Good evening';
    else greeting = 'Good afternoon';
  }

  // Format doctor greeting name (e.g., "Dr. Sarah Chen, MD" -> "Dr. Chen")
  const formatDoctorShortName = (rawName?: string): string => {
    if (!rawName) return 'Dr. Chen';
    const cleaned = rawName.replace(/,\s*MD$/i, '').trim();
    const parts = cleaned.split(/\s+/);
    if (parts.length >= 3 && /^dr\.?$/i.test(parts[0])) {
      return `Dr. ${parts[parts.length - 1]}`;
    }
    return cleaned;
  };

  const dateString = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  // Determine Next in Queue patient
  const activeQueueAppointment = appointments.find(
    a => a.status === 'checked_in' || a.status === 'in_progress' || a.status === 'scheduled'
  );

  const nextQueuePatientObj = recentPatients[0] || null;

  const nextQueueDisplay = (() => {
    if (activeQueueAppointment) {
      const matchedPat = recentPatients.find(p => p.id === activeQueueAppointment.patientId);
      return {
        patientId: activeQueueAppointment.patientId,
        name: activeQueueAppointment.patientName,
        age: activeQueueAppointment.patientAge || matchedPat?.age || 22,
        gender: activeQueueAppointment.patientGender || matchedPat?.gender || 'Male',
        code: activeQueueAppointment.patientCode || matchedPat?.patientCode || 'P-24620',
        diagnosis:
          matchedPat?.primaryDiagnosis ||
          activeQueueAppointment.instructions ||
          'Pigmentation / Dark spots',
        patientRecord: matchedPat || null
      };
    }
    if (nextQueuePatientObj) {
      return {
        patientId: nextQueuePatientObj.id,
        name: nextQueuePatientObj.fullName,
        age: nextQueuePatientObj.age,
        gender: nextQueuePatientObj.gender,
        code: nextQueuePatientObj.patientCode,
        diagnosis: nextQueuePatientObj.primaryDiagnosis || 'Pigmentation / Dark spots',
        patientRecord: nextQueuePatientObj
      };
    }
    return {
      patientId: '',
      name: 'xyz',
      age: 22,
      gender: 'Male',
      code: 'P-24620',
      diagnosis: 'Pigmentation / Dark spots',
      patientRecord: null
    };
  })();

  const [nextQueueImagesList, setNextQueueImagesList] = useState<
    import('../types').ClinicalImage[]
  >([]);

  useEffect(() => {
    if (!nextQueueDisplay.patientId) {
      setNextQueueImagesList([]);
      return;
    }
    api.patients
      .getImages(nextQueueDisplay.patientId)
      .then(res => {
        if (Array.isArray(res.images)) {
          setNextQueueImagesList(res.images);
        }
      })
      .catch(() => {
        setNextQueueImagesList([]);
      });
  }, [nextQueueDisplay.patientId]);

  // Resolve Day 1 (baseline) and Recent Visit clinical images for Next in Queue
  const nextQueueImages = (() => {
    const imgs =
      nextQueueImagesList.length > 0
        ? nextQueueImagesList
        : nextQueueDisplay.patientRecord?.clinicalImages || [];
    const sorted = [...imgs].sort(
      (a, b) =>
        new Date(a.examDate || a.uploadedAt || a.createdAt).getTime() -
        new Date(b.examDate || b.uploadedAt || b.createdAt).getTime()
    );
    const day1Img = sorted[0];
    const recentImg = sorted.length > 1 ? sorted[sorted.length - 1] : sorted[0];
    return {
      day1Url: day1Img?.dataUrl || day1Img?.url || DEFAULT_DAY1_CLINICAL_SVG,
      day1Date: day1Img?.examDate || 'Baseline · Day 1',
      day1Caption: day1Img?.caption || 'Day 1 Baseline Erythema & Pigmentation',
      recentUrl: recentImg?.dataUrl || recentImg?.url || DEFAULT_RECENT_CLINICAL_SVG,
      recentDate: recentImg?.examDate || 'Recent Visit · Follow-up',
      recentCaption: recentImg?.caption || 'Recent Visit — Marked Clearing & Reduced Redness'
    };
  })();

  const handleStartNextConsultation = async () => {
    if (isReceptionist) {
      if (nextQueueDisplay.patientId) {
        onSelectPatient(nextQueueDisplay.patientId);
        return;
      }
      onOpenWalkIn();
      return;
    }
    if (nextQueueDisplay.patientRecord) {
      onStartConsultationForPatient(nextQueueDisplay.patientRecord);
      return;
    }
    if (nextQueueDisplay.patientId) {
      try {
        const res = await api.patients.get(nextQueueDisplay.patientId);
        onStartConsultationForPatient(res.patient);
        return;
      } catch {
        // fallback to walk-in modal
      }
    }
    onOpenWalkIn();
  };

  // Revenue & Billing ledger figures
  const todayRev = revenue?.dailyTotalRevenue ?? 0;
  const mrrRev = revenue && revenue.monthlyRecurringRevenue > 0 ? revenue.monthlyRecurringRevenue : 4000;
  const mtdRev = revenue && revenue.currentMonthRevenue > 0 ? revenue.currentMonthRevenue : 5050;
  const procRev = revenue && revenue.totalProceduresRevenue > 0 ? revenue.totalProceduresRevenue : 2850;
  const consultRev =
    revenue && revenue.totalConsultationsRevenue > 0 ? revenue.totalConsultationsRevenue : 2200;
  const avgPerPatient =
    revenue && revenue.avgRevenuePerPatient > 0 ? revenue.avgRevenuePerPatient : 3175;

  const mixTotal = Math.max(1, procRev + consultRev);
  const procPercent = Math.round((procRev / mixTotal) * 100);
  const consultPercent = 100 - procPercent;

  // CSV Export handler for Live Ledger
  const handleExportCSV = () => {
    const rows: string[][] = [
      ['Patient Code', 'Patient Name', 'Visits', 'Consultation Revenue (INR)', 'Procedure Revenue (INR)', 'Total Revenue (INR)', 'Last Visit Date']
    ];
    if (revenue?.patientBreakdown && revenue.patientBreakdown.length > 0) {
      revenue.patientBreakdown.forEach(p => {
        rows.push([
          p.patientCode,
          `"${p.patientName.replace(/"/g, '""')}"`,
          String(p.visitCount),
          String(p.consultationRevenue),
          String(p.procedureRevenue),
          String(p.totalRevenue),
          p.lastVisitDate ? new Date(p.lastVisitDate).toLocaleDateString('en-IN') : ''
        ]);
      });
    } else {
      rows.push(['P-24618', 'Harman', '3', '1500', '1650', '3150', dateString]);
      rows.push(['P-24619', 'Kabir Kashyap', '1', '700', '1200', '1900', dateString]);
    }
    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(r => r.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `clinical_os_revenue_ledger_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintLedger = () => {
    window.print();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Integrated Header Row */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          {onToggleMobileMenu && (
            <button
              type="button"
              onClick={onToggleMobileMenu}
              className="md:hidden mt-1 text-[#0f2926] hover:bg-white/60 p-2 rounded-xl transition-colors"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
          <div>
            <h1 className="text-3xl sm:text-[34px] font-extrabold text-[#0f2926] tracking-tight leading-tight">
              {greeting}, {formatDoctorShortName(doctor?.name)}
            </h1>
            <p className="text-sm text-[#5c7c77] mt-1 font-normal">
              {dateString} ·{' '}
              {isReceptionist
                ? 'Front-Desk Receptionist Workspace · Patient Queue & Check-In'
                : 'Here is what is happening at your clinic today'}
            </p>
          </div>
        </div>

        {/* Right Controls: Dashed Search Box + Walk-in + AI Assistant / Role Switcher */}
        <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
          {/* Search Box with Dashed Border */}
          <div ref={searchRef} className="relative w-full sm:w-72">
            <div
              onClick={() => inputRef.current?.focus()}
              className="bg-white/80 hover:bg-white focus-within:bg-white border border-dashed border-[#b8ccc8] focus-within:border-[#116960] rounded-2xl px-4 py-2 transition-all cursor-text"
            >
              <div className="flex items-center justify-between gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Search patients, diagnoses..."
                  value={query}
                  onChange={e => {
                    let val = e.target.value;
                    if (/^\d+$/.test(val)) {
                      val = val.slice(0, 10);
                    }
                    setQuery(val);
                  }}
                  onFocus={() => query.trim() && setIsSearchOpen(true)}
                  className="w-full text-sm text-[#0f2926] placeholder-[#688580] bg-transparent focus:outline-none"
                />
                {query && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setQuery('');
                      setIsSearchOpen(false);
                    }}
                    className="text-[#688580] hover:text-[#0f2926]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <span className="text-xs text-[#688580] font-medium block leading-tight mt-0.5">
                ⌘K
              </span>
            </div>

            {/* Instant Search Results Dropdown */}
            {isSearchOpen && (
              <div className="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl shadow-xl border border-[#dce5e3] divide-y divide-slate-100 overflow-hidden max-h-80 overflow-y-auto z-50">
                {searchPatients.length > 0 && (
                  <div className="p-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#688580] px-3 py-1 block">
                      Patients ({searchPatients.length})
                    </span>
                    {searchPatients.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          onSelectPatient(p.id);
                          setIsSearchOpen(false);
                          setQuery('');
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl hover:bg-[#f2f6f5] flex items-center justify-between text-xs group"
                      >
                        <div>
                          <span className="font-bold text-[#0f2926] group-hover:text-[#116960]">
                            {p.fullName}
                          </span>
                          <span className="text-[11px] text-[#688580] ml-2">
                            {p.patientCode} · {p.mobile}
                          </span>
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 text-[#688580] group-hover:text-[#116960]" />
                      </button>
                    ))}
                  </div>
                )}

                {matchingDiagnoses.length > 0 && (
                  <div className="p-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#688580] px-3 py-1 block">
                      Diagnoses
                    </span>
                    {matchingDiagnoses.map(d => (
                      <div
                        key={d}
                        className="px-3 py-1.5 text-xs text-[#0f2926] flex items-center gap-2"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-[#116960]" />
                        <span>{d}</span>
                      </div>
                    ))}
                  </div>
                )}

                {searchPatients.length === 0 && matchingDiagnoses.length === 0 && !isSearching && (
                  <div className="p-5 text-center text-xs text-[#688580]">
                    No records matching &quot;{query}&quot;.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Dark / Light Mode Toggle */}
          <ThemeToggleButton variant="dashboard" />

          {/* Walk-in Button */}
          <button
            type="button"
            onClick={onOpenWalkIn}
            className="px-5 py-3.5 bg-white hover:bg-[#f7faf9] border border-[#dce5e3] rounded-2xl text-sm font-bold text-[#0f2926] transition-colors shrink-0 cursor-pointer"
          >
            Walk-in
          </button>

          {/* + AI Assistant Button (Doctor only) */}
          {!isReceptionist && (
            <button
              type="button"
              onClick={onOpenAIAssistant}
              className="px-5 py-3.5 bg-[#0d4a44] hover:bg-[#093834] text-white rounded-2xl text-sm font-bold transition-colors shrink-0 cursor-pointer flex items-center gap-1.5"
            >
              <span>✦ AI Assistant</span>
            </button>
          )}
        </div>
      </div>

      {/* Row 1: 4 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* TOTAL PATIENTS */}
        <div
          onClick={() => onNavigateToPatients && onNavigateToPatients()}
          className="bg-white rounded-2xl border border-[#e4ecea] p-6 hover:border-[#bfd3cf] transition-colors cursor-pointer"
        >
          <span className="text-xs font-bold uppercase tracking-wider text-[#5c7c77] block">
            TOTAL PATIENTS
          </span>
          <div className="text-4xl font-extrabold text-[#115e56] tracking-tight tabular-nums mt-2.5 mb-1">
            {stats ? stats.totalPatients : 2}
          </div>
          <span className="text-sm text-[#5c7c77] block">active in clinic</span>
        </div>

        {/* TODAY VISITS */}
        <div className="bg-white rounded-2xl border border-[#e4ecea] p-6">
          <span className="text-xs font-bold uppercase tracking-wider text-[#5c7c77] block">
            TODAY VISITS
          </span>
          <div className="text-4xl font-extrabold text-[#115e56] tracking-tight tabular-nums mt-2.5 mb-1">
            {stats ? stats.visitsToday : 0}
          </div>
          <span className="text-sm text-[#5c7c77] block">
            {stats ? `${stats.visitsLast7Days} in last 7 days` : '1 in last 7 days'}
          </span>
        </div>

        {/* WAITING QUEUE */}
        <div
          onClick={() => onNavigateToAppointments && onNavigateToAppointments()}
          className="bg-white rounded-2xl border border-[#e4ecea] p-6 hover:border-[#bfd3cf] transition-colors cursor-pointer"
        >
          <span className="text-xs font-bold uppercase tracking-wider text-[#5c7c77] block">
            WAITING QUEUE
          </span>
          <div className="text-4xl font-extrabold text-[#c86d18] tracking-tight tabular-nums mt-2.5 mb-1">
            {stats ? Math.max(1, stats.followUpsDue) : 1}
          </div>
          <span className="text-sm text-[#5c7c77] block">needs attention</span>
        </div>

        {/* ACTIVE RX (or FRONT DESK APPOINTMENTS for Receptionist) */}
        <div
          onClick={() => {
            if (isReceptionist) {
              if (onNavigateToAppointments) onNavigateToAppointments();
            } else if (onNavigateToPrescriptions) {
              onNavigateToPrescriptions();
            }
          }}
          className="bg-white rounded-2xl border border-[#e4ecea] p-6 hover:border-[#bfd3cf] transition-colors cursor-pointer"
        >
          <span className="text-xs font-bold uppercase tracking-wider text-[#5c7c77] block">
            {isReceptionist ? 'SCHEDULED APPOINTMENTS' : 'ACTIVE RX'}
          </span>
          <div className="text-4xl font-extrabold text-[#115e56] tracking-tight tabular-nums mt-2.5 mb-1">
            {isReceptionist ? appointments.length : stats ? stats.activePrescriptions : 0}
          </div>
          <span className="text-sm text-[#5c7c77] block">
            {isReceptionist ? 'front-desk check-in queue' : 'prescribed regimens'}
          </span>
        </div>
      </div>

      {/* Row 2: Receptionist Front-Desk Card vs. Doctor Clinical Pre-Visit Brief + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {isReceptionist ? (
          <div className="lg:col-span-8 bg-[#faf7f0] border border-[#e5dfd3] rounded-2xl p-6 sm:p-7 text-[#102a26] shadow-2xs flex flex-col justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#45615a] block">
                FRONT-DESK RECEPTION · PATIENT REGISTRATION &amp; APPOINTMENTS
              </span>
              <h2 className="font-serif text-2xl sm:text-3xl font-normal text-[#102a26] tracking-tight leading-tight mt-1.5">
                Next Patient in Queue: {nextQueueDisplay.name}
              </h2>
              <p className="text-sm text-[#4e6660] mt-1">
                {nextQueueDisplay.age}y · {nextQueueDisplay.gender} · {nextQueueDisplay.code}
              </p>
              <p className="text-xs text-[#45615a] mt-3 leading-relaxed">
                As a Receptionist, you can register new patients, check in walk-in patients, and book or manage clinic appointments. Clinical notes, AI diagnostics, prescriptions, and role settings are restricted to Doctors.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 mt-6 pt-2">
              <button
                type="button"
                onClick={() => setShowAddPatientModal(true)}
                className="px-5 py-2.5 bg-[#0d2622] hover:bg-[#163d37] text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                + Add New Patient
              </button>
              <button
                type="button"
                onClick={() => setShowScheduleModal(true)}
                className="px-5 py-2.5 bg-[#157a6e] hover:bg-[#116359] text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                + Book Appointment
              </button>
              <button
                type="button"
                onClick={onOpenWalkIn}
                className="px-5 py-2.5 bg-transparent hover:bg-[#102a26]/5 border border-[#102a26]/45 text-[#102a26] rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                + Walk-In Check-In
              </button>
            </div>
          </div>
        ) : (
          /* NEXT IN QUEUE · AI PRE-VISIT BRIEF Hero Card (Doctor Only) */
          <div className="lg:col-span-8 bg-[#faf7f0] border border-[#e5dfd3] rounded-2xl p-6 sm:p-7 text-[#102a26] shadow-2xs">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
              {/* Left Column: Patient Info + AI Pre-Visit Brief Bullets + Actions */}
              <div className="md:col-span-7 flex flex-col justify-between">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#45615a] block">
                    NEXT IN QUEUE · AI PRE-VISIT BRIEF
                  </span>

                  <h2
                    onClick={() => nextQueueDisplay.patientId && onSelectPatient(nextQueueDisplay.patientId)}
                    className="font-serif text-3xl sm:text-[38px] font-normal text-[#102a26] tracking-tight leading-tight mt-1.5 cursor-pointer hover:underline"
                  >
                    {nextQueueDisplay.name}
                  </h2>

                  <p className="text-[14px] text-[#4e6660] mt-1 font-normal">
                    {nextQueueDisplay.age}y · {nextQueueDisplay.gender} · {nextQueueDisplay.code} ·{' '}
                    {nextQueueDisplay.diagnosis && nextQueueDisplay.diagnosis !== 'Pigmentation / Dark spots'
                      ? nextQueueDisplay.diagnosis
                      : 'Post-treatment follow-up'}
                  </p>

                  {/* AI Pre-Visit Brief Bullet Points */}
                  <ul className="space-y-2 mt-4 text-[13.5px] text-[#142e2a]">
                    <li className="flex items-start gap-2.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#102a26] mt-2 shrink-0" />
                      <span>
                        {(() => {
                          const patVisits = recentVisits.filter(
                            v => v.patientId === nextQueueDisplay.patientId
                          );
                          if (patVisits.length > 0 && patVisits[0].prescriptions?.length > 0) {
                            const rx = patVisits[0].prescriptions[0];
                            return `${rx.duration || 'Two-week'} course (${rx.medicineName}) started recently.`;
                          }
                          return 'Two-week course started 14 days ago.';
                        })()}
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#102a26] mt-2 shrink-0" />
                      <span>
                        {(() => {
                          const patVisits = recentVisits.filter(
                            v => v.patientId === nextQueueDisplay.patientId
                          );
                          if (patVisits.length > 0 && patVisits[0].symptoms?.length > 0) {
                            return `Photo at day 7 shows less redness (${patVisits[0].symptoms[0]}).`;
                          }
                          return 'Photo at day 7 shows less redness.';
                        })()}
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#102a26] mt-2 shrink-0" />
                      <span>
                        {(() => {
                          const rawAllergies = nextQueueDisplay.patientRecord?.allergies as unknown;
                          const allergyText = Array.isArray(rawAllergies)
                            ? rawAllergies.filter(Boolean).join(', ')
                            : typeof rawAllergies === 'string'
                            ? rawAllergies.trim()
                            : '';
                          if (
                            allergyText &&
                            allergyText.toLowerCase() !== 'no known allergies' &&
                            allergyText.toLowerCase() !== 'none'
                          ) {
                            return `Allergy flag on file (${allergyText}). Check before prescribing.`;
                          }
                          return 'Allergy flag on file. Check before prescribing.';
                        })()}
                      </span>
                    </li>
                  </ul>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center gap-2.5 mt-6 pt-1">
                  <button
                    type="button"
                    onClick={handleStartNextConsultation}
                    className="px-5 py-2.5 bg-[#0d2622] hover:bg-[#163d37] text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    Start consultation →
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (nextQueueDisplay.patientId) {
                        onSelectPatient(nextQueueDisplay.patientId);
                      } else if (onNavigateToPatients) {
                        onNavigateToPatients();
                      }
                    }}
                    className="px-5 py-2.5 bg-transparent hover:bg-[#102a26]/5 border border-[#102a26]/45 text-[#102a26] rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Open history
                  </button>
                </div>
              </div>

              {/* Right Column: PATIENT PULSE · LAST 5 VISITS */}
              <div className="md:col-span-5 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#45615a] block mb-2">
                    PATIENT PULSE · LAST 5 VISITS
                  </span>

                  {/* Trend Chart Container */}
                  <div className="bg-[#efeadd] rounded-xl p-3.5 border border-[#e4decb]">
                    <svg
                      viewBox="0 0 240 76"
                      className="w-full h-20 overflow-visible"
                      role="img"
                      aria-label="Symptom score trend down from 8 to 3"
                    >
                      <line
                        x1="12"
                        y1="14"
                        x2="224"
                        y2="58"
                        stroke="#0e5a4f"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                      />
                      <circle cx="224" cy="58" r="6" fill="#df6d46" />
                    </svg>
                  </div>

                  <p className="text-[11.5px] text-[#4e6660] mt-2 mb-2.5">
                    Symptom score down from 8 to 3.
                  </p>
                </div>

                {/* Day 1 & Recent Visit Clinical Image Thumbnails with Click-to-Zoom */}
                <div className="grid grid-cols-2 gap-2.5 mt-auto">
                  <button
                    type="button"
                    onClick={() => setQueueZoomModal({ activeSide: 'day1', zoom: 1.5 })}
                    className="group relative bg-[#d9d1bf] hover:ring-2 hover:ring-[#0e5a4f] transition-all rounded-xl h-20 overflow-hidden text-left cursor-pointer border border-[#c9bfa8]"
                    title="Click to zoom in on Day 1 clinical image"
                  >
                    <img
                      src={nextQueueImages.day1Url}
                      alt="Day 1 Baseline Clinical"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />
                    <span className="absolute top-1.5 right-1.5 w-6 h-6 rounded-lg bg-black/55 text-white flex items-center justify-center opacity-90 group-hover:bg-[#0e5a4f] transition-colors">
                      <ZoomIn className="w-3.5 h-3.5" />
                    </span>
                    <div className="absolute bottom-1.5 left-2 right-2 flex items-center justify-between">
                      <span className="text-[11px] font-bold text-white drop-shadow-xs">
                        Day 1
                      </span>
                      <span className="text-[9px] font-semibold text-white/85 bg-black/45 px-1.5 py-0.5 rounded">
                        Zoom
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setQueueZoomModal({ activeSide: 'recent', zoom: 1.5 })}
                    className="group relative bg-[#c2ded6] hover:ring-2 hover:ring-[#0e5a4f] transition-all rounded-xl h-20 overflow-hidden text-left cursor-pointer border border-[#aecbc2]"
                    title="Click to zoom in on Recent Visit clinical image"
                  >
                    <img
                      src={nextQueueImages.recentUrl}
                      alt="Recent Visit Clinical"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />
                    <span className="absolute top-1.5 right-1.5 w-6 h-6 rounded-lg bg-black/55 text-white flex items-center justify-center opacity-90 group-hover:bg-[#0e5a4f] transition-colors">
                      <ZoomIn className="w-3.5 h-3.5" />
                    </span>
                    <div className="absolute bottom-1.5 left-2 right-2 flex items-center justify-between">
                      <span className="text-[11px] font-bold text-white drop-shadow-xs">
                        Recent Visit
                      </span>
                      <span className="text-[9px] font-semibold text-emerald-200 bg-black/45 px-1.5 py-0.5 rounded">
                        Zoom
                      </span>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* QUICK ACTIONS Card */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-[#e4ecea] p-6 flex flex-col justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-[#5c7c77] block mb-3.5">
            {isReceptionist ? 'FRONT-DESK QUICK ACTIONS' : 'QUICK ACTIONS'}
          </span>
          <div className="grid grid-cols-2 gap-3">
            {isReceptionist ? (
              <>
                <button
                  type="button"
                  onClick={onOpenWalkIn}
                  className="py-3 px-3 bg-white hover:bg-[#f2f7f6] border border-[#dce5e3] rounded-xl text-xs sm:text-sm font-bold text-[#0f4842] transition-colors cursor-pointer"
                >
                  + Walk-in check-in
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateToAppointments && onNavigateToAppointments()}
                  className="py-3 px-3 bg-white hover:bg-[#f2f7f6] border border-[#dce5e3] rounded-xl text-xs sm:text-sm font-bold text-[#0f4842] transition-colors cursor-pointer"
                >
                  Open schedule
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    if (onNavigateToPrescriptions) {
                      onNavigateToPrescriptions();
                    } else {
                      handleStartNextConsultation();
                    }
                  }}
                  className="py-3 px-3 bg-white hover:bg-[#f2f7f6] border border-[#dce5e3] rounded-xl text-xs sm:text-sm font-bold text-[#0f4842] transition-colors cursor-pointer"
                >
                  + New Rx
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateToImageAnalyzer && onNavigateToImageAnalyzer()}
                  className="py-3 px-3 bg-white hover:bg-[#f2f7f6] border border-[#dce5e3] rounded-xl text-xs sm:text-sm font-bold text-[#0f4842] transition-colors cursor-pointer"
                >
                  Scan skin image
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setShowAddPatientModal(true)}
              className="py-3 px-3 bg-white hover:bg-[#f2f7f6] border border-[#dce5e3] rounded-xl text-xs sm:text-sm font-bold text-[#0f4842] transition-colors cursor-pointer"
            >
              Add patient
            </button>
            <button
              type="button"
              onClick={() => setShowScheduleModal(true)}
              className="py-3 px-3 bg-white hover:bg-[#f2f7f6] border border-[#dce5e3] rounded-xl text-xs sm:text-sm font-bold text-[#0f4842] transition-colors cursor-pointer"
            >
              Book visit
            </button>
          </div>
        </div>
      </div>

      {/* Add Patient Modal (from Quick Actions) */}
      {showAddPatientModal && (
        <AddPatientModal
          onClose={() => setShowAddPatientModal(false)}
          onPatientCreated={(newPatient) => {
            setShowAddPatientModal(false);
            loadDashboardData();
            onSelectPatient(newPatient.id);
          }}
        />
      )}

      {/* Schedule Visit Modal (from Quick Actions) */}
      {showScheduleModal && (
        <ScheduleAppointmentModal
          onClose={() => setShowScheduleModal(false)}
          onSuccess={() => {
            setShowScheduleModal(false);
            loadDashboardData();
          }}
        />
      )}

      {/* Next in Queue Click-to-Zoom Lightbox Modal (Day 1 vs Recent Visit) */}
      {queueZoomModal && (
        <div
          onClick={() => setQueueZoomModal(null)}
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-slate-900 border border-slate-800 text-white rounded-2xl max-w-4xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
          >
            {/* Header & Zoom Controls */}
            <div className="px-5 py-3.5 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-teal-400">
                    Next in Queue · Clinical Image Zoom
                  </span>
                  <span className="text-xs text-slate-400">
                    ({nextQueueDisplay.name} · {nextQueueDisplay.code})
                  </span>
                </div>
                <h3 className="text-sm font-bold text-white mt-0.5">
                  {queueZoomModal.activeSide === 'day1'
                    ? `Day 1 Baseline Image (${nextQueueImages.day1Date})`
                    : queueZoomModal.activeSide === 'recent'
                    ? `Recent Visit Image (${nextQueueImages.recentDate})`
                    : 'Day 1 vs. Recent Visit Side-by-Side Zoom'}
                </h3>
              </div>

              {/* View Switcher + Zoom Controls */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center bg-slate-800 rounded-xl p-1 border border-slate-700 text-xs">
                  <button
                    type="button"
                    onClick={() => setQueueZoomModal(prev => prev && { ...prev, activeSide: 'day1' })}
                    className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                      queueZoomModal.activeSide === 'day1'
                        ? 'bg-teal-600 text-white'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Day 1
                  </button>
                  <button
                    type="button"
                    onClick={() => setQueueZoomModal(prev => prev && { ...prev, activeSide: 'recent' })}
                    className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                      queueZoomModal.activeSide === 'recent'
                        ? 'bg-teal-600 text-white'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Recent Visit
                  </button>
                  <button
                    type="button"
                    onClick={() => setQueueZoomModal(prev => prev && { ...prev, activeSide: 'both' })}
                    className={`px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 transition cursor-pointer ${
                      queueZoomModal.activeSide === 'both'
                        ? 'bg-teal-600 text-white'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    <Maximize2 className="w-3 h-3" />
                    <span>Side-by-Side</span>
                  </button>
                </div>

                <div className="flex items-center gap-1.5 bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700">
                  <button
                    type="button"
                    onClick={() =>
                      setQueueZoomModal(prev =>
                        prev ? { ...prev, zoom: Math.max(1, Number((prev.zoom - 0.25).toFixed(2))) } : null
                      )
                    }
                    className="p-1 hover:bg-slate-700 rounded text-slate-300 hover:text-white transition cursor-pointer"
                    title="Zoom Out"
                  >
                    <ZoomOut className="w-4 h-4" />
                  </button>
                  <input
                    type="range"
                    min="1"
                    max="4"
                    step="0.1"
                    value={queueZoomModal.zoom}
                    onChange={e =>
                      setQueueZoomModal(prev =>
                        prev ? { ...prev, zoom: parseFloat(e.target.value) } : null
                      )
                    }
                    className="w-20 accent-teal-400 cursor-pointer"
                  />
                  <span className="text-xs font-mono font-bold text-teal-300 min-w-[40px] text-center">
                    {Math.round(queueZoomModal.zoom * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setQueueZoomModal(prev =>
                        prev ? { ...prev, zoom: Math.min(4, Number((prev.zoom + 0.25).toFixed(2))) } : null
                      )
                    }
                    className="p-1 hover:bg-slate-700 rounded text-slate-300 hover:text-white transition cursor-pointer"
                    title="Zoom In"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setQueueZoomModal(prev => (prev ? { ...prev, zoom: 1 } : null))}
                    className="p-1 hover:bg-slate-700 rounded text-slate-300 hover:text-white transition cursor-pointer"
                    title="Reset Zoom (100%)"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setQueueZoomModal(null)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
                  title="Close Zoom View"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Image Viewport(s) */}
            <div className="p-4 bg-black flex-1 overflow-auto flex items-center justify-center min-h-[360px]">
              {queueZoomModal.activeSide === 'both' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                  <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
                    <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between text-xs">
                      <span className="font-bold text-amber-300">Day 1 (Baseline)</span>
                      <span className="text-slate-400">{nextQueueImages.day1Date}</span>
                    </div>
                    <div className="overflow-hidden flex items-center justify-center h-72 bg-black">
                      <img
                        src={nextQueueImages.day1Url}
                        alt="Day 1 Baseline"
                        className="max-h-full max-w-full object-contain transition-transform duration-150"
                        style={{ transform: `scale(${queueZoomModal.zoom})` }}
                      />
                    </div>
                    <div className="px-3 py-2 text-[11px] text-slate-300 border-t border-slate-800">
                      {nextQueueImages.day1Caption}
                    </div>
                  </div>

                  <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
                    <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between text-xs">
                      <span className="font-bold text-emerald-300">Recent Visit</span>
                      <span className="text-slate-400">{nextQueueImages.recentDate}</span>
                    </div>
                    <div className="overflow-hidden flex items-center justify-center h-72 bg-black">
                      <img
                        src={nextQueueImages.recentUrl}
                        alt="Recent Visit"
                        className="max-h-full max-w-full object-contain transition-transform duration-150"
                        style={{ transform: `scale(${queueZoomModal.zoom})` }}
                      />
                    </div>
                    <div className="px-3 py-2 text-[11px] text-slate-300 border-t border-slate-800">
                      {nextQueueImages.recentCaption}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="w-full flex flex-col items-center justify-center overflow-hidden">
                  <div className="overflow-hidden flex items-center justify-center max-h-[60vh] w-full">
                    <img
                      src={
                        queueZoomModal.activeSide === 'day1'
                          ? nextQueueImages.day1Url
                          : nextQueueImages.recentUrl
                      }
                      alt={queueZoomModal.activeSide === 'day1' ? 'Day 1 Baseline' : 'Recent Visit'}
                      className="max-h-[55vh] max-w-full object-contain transition-transform duration-150 rounded-lg"
                      style={{ transform: `scale(${queueZoomModal.zoom})` }}
                    />
                  </div>
                  <p className="text-xs text-slate-300 mt-3">
                    {queueZoomModal.activeSide === 'day1'
                      ? nextQueueImages.day1Caption
                      : nextQueueImages.recentCaption}
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-400">
                Use the zoom slider (100% – 400%) or switch between Day 1, Recent Visit, and Side-by-Side view.
              </span>
              <div className="flex items-center gap-2">
                {nextQueueDisplay.patientId && (
                  <button
                    type="button"
                    onClick={() => {
                      setQueueZoomModal(null);
                      onSelectPatient(nextQueueDisplay.patientId);
                    }}
                    className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded-xl font-bold transition cursor-pointer"
                  >
                    Open Full Patient Chart →
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setQueueZoomModal(null)}
                  className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-semibold border border-slate-700 transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
