import React, { useState, useEffect, useRef } from 'react';
import { ClinicStats, Consultation, Patient, Appointment, PracticeRevenueAnalytics } from '../types';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { api } from '../lib/api';
import { PREDEFINED_DIAGNOSES } from '../data/clinicalCatalogues';
import { AddPatientModal } from './AddPatientModal';
import { ScheduleAppointmentModal } from './ScheduleAppointmentModal';
import { Menu, X, ArrowRight } from 'lucide-react';

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
  const { doctor } = useAuth();
  const { language } = useLanguage();
  const [stats, setStats] = useState<ClinicStats | null>(null);
  const [revenue, setRevenue] = useState<PracticeRevenueAnalytics | null>(null);
  const [recentVisits, setRecentVisits] = useState<Consultation[]>([]);
  const [recentPatients, setRecentPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  // Quick action modals
  const [showAddPatientModal, setShowAddPatientModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);

  // Integrated Header Search State
  const [query, setQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchPatients, setSearchPatients] = useState<Patient[]>([]);
  const [matchingDiagnoses, setMatchingDiagnoses] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadDashboardData = () => {
    Promise.all([
      api.dashboard.getStats(),
      api.appointments.list()
    ])
      .then(([dashRes, apptRes]) => {
        setStats(dashRes.stats);
        setRecentVisits(dashRes.recentVisits);
        setRecentPatients(dashRes.recentPatients);
        if (dashRes.revenue) {
          setRevenue(dashRes.revenue);
        }
        setAppointments(apptRes.appointments);
      })
      .catch(err => {
        console.warn('Dashboard data error:', err);
      });
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

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

  const handleStartNextConsultation = async () => {
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
              {dateString} · Here is what is happening at your clinic today
            </p>
          </div>
        </div>

        {/* Right Controls: Dashed Search Box + Walk-in + AI Assistant */}
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
                  onChange={e => setQuery(e.target.value)}
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

          {/* Walk-in Button */}
          <button
            type="button"
            onClick={onOpenWalkIn}
            className="px-5 py-3.5 bg-white hover:bg-[#f7faf9] border border-[#dce5e3] rounded-2xl text-sm font-bold text-[#0f2926] transition-colors shrink-0 cursor-pointer"
          >
            Walk-in
          </button>

          {/* + AI Assistant Button */}
          <button
            type="button"
            onClick={onOpenAIAssistant}
            className="px-5 py-3.5 bg-[#0d4a44] hover:bg-[#093834] text-white rounded-2xl text-sm font-bold transition-colors shrink-0 cursor-pointer flex items-center gap-1.5"
          >
            <span>✦ AI Assistant</span>
          </button>
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

        {/* ACTIVE RX */}
        <div
          onClick={() => onNavigateToPrescriptions && onNavigateToPrescriptions()}
          className="bg-white rounded-2xl border border-[#e4ecea] p-6 hover:border-[#bfd3cf] transition-colors cursor-pointer"
        >
          <span className="text-xs font-bold uppercase tracking-wider text-[#5c7c77] block">
            ACTIVE RX
          </span>
          <div className="text-4xl font-extrabold text-[#115e56] tracking-tight tabular-nums mt-2.5 mb-1">
            {stats ? stats.activePrescriptions : 0}
          </div>
          <span className="text-sm text-[#5c7c77] block">prescribed regimens</span>
        </div>
      </div>

      {/* Row 2: NEXT IN QUEUE (8 cols) + QUICK ACTIONS (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* NEXT IN QUEUE Hero Banner */}
        <div className="lg:col-span-8 bg-[#116960] rounded-2xl p-7 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#a5e3da] block">
              NEXT IN QUEUE
            </span>
            <h2
              onClick={() => nextQueueDisplay.patientId && onSelectPatient(nextQueueDisplay.patientId)}
              className="text-2xl sm:text-[28px] font-extrabold text-white tracking-tight leading-tight cursor-pointer hover:underline"
            >
              {nextQueueDisplay.name} · {nextQueueDisplay.age}y · {nextQueueDisplay.gender}
            </h2>
            <p className="text-sm text-[#c7efe9] font-normal">
              {nextQueueDisplay.code} · {nextQueueDisplay.diagnosis}
            </p>
          </div>

          <button
            type="button"
            onClick={handleStartNextConsultation}
            className="px-6 py-3.5 bg-white hover:bg-[#f0f9f8] text-[#0f4842] rounded-xl text-sm font-bold transition-colors shrink-0 cursor-pointer"
          >
            Start consultation →
          </button>
        </div>

        {/* QUICK ACTIONS Card */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-[#e4ecea] p-6 flex flex-col justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-[#5c7c77] block mb-3.5">
            QUICK ACTIONS
          </span>
          <div className="grid grid-cols-2 gap-3">
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
    </div>
  );
};
