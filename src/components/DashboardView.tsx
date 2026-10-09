import React, { useState, useEffect } from 'react';
import { ClinicStats, Consultation, Patient, Appointment } from '../types';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { api } from '../lib/api';
import {
  UserPlus,
  Users,
  Calendar,
  Pill,
  Sparkles,
  ArrowRight,
  Stethoscope,
  Activity,
  Plus,
  Clock,
  CheckCircle2
} from 'lucide-react';

interface DashboardViewProps {
  onOpenBookAppointment: () => void;
  onOpenWalkIn: () => void;
  onOpenAIAssistant: () => void;
  onSelectPatient: (patientId: string) => void;
  onStartConsultationForPatient: (patient: Patient) => void;
  onNavigateToAppointments?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onOpenBookAppointment,
  onOpenWalkIn,
  onOpenAIAssistant,
  onSelectPatient,
  onStartConsultationForPatient,
  onNavigateToAppointments
}) => {
  const { doctor } = useAuth();
  const { t, language } = useLanguage();
  const [stats, setStats] = useState<ClinicStats | null>(null);
  const [recentVisits, setRecentVisits] = useState<Consultation[]>([]);
  const [recentPatients, setRecentPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.dashboard.getStats(),
      api.appointments.list()
    ])
      .then(([dashRes, apptRes]) => {
        setStats(dashRes.stats);
        setRecentVisits(dashRes.recentVisits);
        setRecentPatients(dashRes.recentPatients);
        setAppointments(apptRes.appointments);
      })
      .catch(err => {
        console.warn('Dashboard data error:', err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  // Compute greeting based on time of day and language
  const hour = new Date().getHours();
  let greeting = 'Good morning';
  if (language === 'hi') {
    greeting = hour >= 12 && hour < 17 ? 'शुभ दोपहर' : hour >= 17 ? 'शुभ संध्या' : 'शुभ प्रभात';
  } else if (language === 'pa') {
    greeting = hour >= 12 && hour < 17 ? 'ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ' : hour >= 17 ? 'ਸ਼ੁਭ ਸ਼ਾਮ' : 'ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ';
  } else {
    if (hour >= 12 && hour < 17) greeting = 'Good afternoon';
    else if (hour >= 17) greeting = 'Good evening';
  }

  const dateString = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  const avatarColors = [
    'bg-rose-500',
    'bg-amber-500',
    'bg-emerald-600',
    'bg-sky-500',
    'bg-indigo-600',
    'bg-purple-600'
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Top Welcome & Actions Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            {greeting}, {doctor?.name || 'Doctor'}.
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            {dateString} • Here&apos;s what&apos;s happening at your clinic today.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={onOpenWalkIn}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 shadow-2xs transition-colors"
          >
            <Users className="w-3.5 h-3.5 text-teal-700" />
            <span>{t('walkIn')}</span>
          </button>

          <button
            type="button"
            onClick={onOpenBookAppointment}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 shadow-2xs transition-colors"
          >
            <Calendar className="w-3.5 h-3.5 text-teal-700" />
            <span>{t('bookAppointment')}</span>
          </button>

          <button
            type="button"
            onClick={onOpenAIAssistant}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-semibold shadow-md transition-all"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{t('aiAssistant')}</span>
          </button>
        </div>
      </div>

      {/* 4 Metrics Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Patients */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
            {t('totalPatients')}
          </span>
          <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
            {stats ? stats.totalPatients : 0}
          </div>
          <span className="text-xs text-slate-500 block">active in your clinic</span>
        </div>

        {/* Visits Today */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
            {t('todayVisits')}
          </span>
          <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
            {stats ? stats.visitsToday : 0}
          </div>
          <span className="text-xs text-slate-500 block">
            {stats ? `${stats.visitsLast7Days} in last 7 days` : 'today'}
          </span>
        </div>

        {/* Follow Ups Due */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
            {t('waitingQueue')}
          </span>
          <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
            {stats ? stats.followUpsDue : 0}
          </div>
          <span className="text-xs text-slate-500 block">require attention</span>
        </div>

        {/* Active Prescriptions */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
            {t('activePrescriptions')}
          </span>
          <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
            {stats ? stats.activePrescriptions : 0}
          </div>
          <span className="text-xs text-slate-500 block">scheduled</span>
        </div>
      </div>

      {/* Upcoming Appointments & Follow-ups Registry Card */}
      {(() => {
        const upcoming = appointments
          .filter(a => a.status === 'scheduled' || a.status === 'checked_in')
          .slice(0, 4);

        if (upcoming.length === 0) return null;

        return (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-teal-50 text-teal-800 flex items-center justify-center">
                  <Calendar className="w-4 h-4" />
                </div>
                <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                  Upcoming Appointments & Follow-ups Due
                </h2>
                <span className="text-xs font-semibold bg-teal-50 text-teal-800 px-2 py-0.5 rounded-full border border-teal-200">
                  {upcoming.length} active
                </span>
              </div>
              {onNavigateToAppointments && (
                <button
                  type="button"
                  onClick={onNavigateToAppointments}
                  className="text-xs font-semibold text-teal-800 hover:text-teal-950 flex items-center gap-1 transition-colors"
                >
                  <span>View all appointments</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {upcoming.map(appt => (
                <div
                  key={appt.id}
                  className="p-3.5 bg-slate-50/70 hover:bg-slate-50 border border-slate-200/80 rounded-xl flex items-center justify-between gap-3 transition-colors"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        onClick={() => onSelectPatient(appt.patientId)}
                        className="font-bold text-xs text-slate-900 hover:text-teal-800 cursor-pointer transition-colors truncate"
                      >
                        {appt.patientName}
                      </span>
                      <span className="text-[10px] font-mono text-teal-800 bg-white border border-slate-200 px-1 rounded">
                        {appt.patientCode}
                      </span>
                      <span className="text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.2 rounded-full capitalize">
                        {appt.type.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500">
                      <span className="font-semibold text-slate-700">{appt.date}</span>
                      <span>•</span>
                      <span>{appt.time || '10:00 AM'}</span>
                    </div>
                    {appt.instructions && (
                      <p className="text-[11px] text-slate-600 truncate">
                        {appt.instructions}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={async () => {
                      const res = await api.patients.get(appt.patientId);
                      onStartConsultationForPatient(res.patient);
                    }}
                    className="p-2 bg-teal-800 hover:bg-teal-900 text-white rounded-lg shadow-2xs transition-colors shrink-0"
                    title="Start Consultation"
                  >
                    <Stethoscope className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Split Section: Recent visits & Recently added */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Visits Column */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 tracking-tight">Recent visits</h2>
            <span className="text-xs text-slate-400">Latest completed encounters</span>
          </div>

          {recentVisits.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
              No recent visits recorded today. Use the Walk-in button to attend your first patient.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentVisits.map((v, i) => (
                <div
                  key={v.id}
                  onClick={() => onSelectPatient(v.patientId)}
                  className="py-3.5 flex items-center justify-between hover:bg-slate-50 -mx-3 px-3 rounded-xl transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-full ${avatarColors[i % avatarColors.length]} text-white text-xs font-bold flex items-center justify-center shrink-0`}>
                      {v.patientName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900 group-hover:text-teal-800 transition-colors">
                        {v.patientName}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {v.diagnoses.length > 0 ? v.diagnoses.join(' / ') : v.symptoms.join(' / ') || 'General consultation'}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-xs font-semibold text-slate-700">
                      {new Date(v.consultationDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      ₹{v.fee}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recently Added Patients Column */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 tracking-tight">Recently added</h2>
            <span className="text-xs text-slate-400">New patient registrations</span>
          </div>

          {recentPatients.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
              No patients registered yet. Patients will appear here once registered via Walk-in or Book Appointment.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentPatients.map((p, i) => (
                <div
                  key={p.id}
                  onClick={() => onSelectPatient(p.id)}
                  className="py-3.5 flex items-center justify-between hover:bg-slate-50 -mx-3 px-3 rounded-xl transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-full ${avatarColors[(i + 2) % avatarColors.length]} text-white text-xs font-bold flex items-center justify-center shrink-0`}>
                      {p.fullName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900 group-hover:text-teal-800 transition-colors">
                        {p.fullName}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {p.patientCode} • {p.primaryDiagnosis || 'no diagnosis recorded'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onStartConsultationForPatient(p);
                      }}
                      title="Start consultation"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-teal-700 hover:bg-teal-50 transition-colors"
                    >
                      <Stethoscope className="w-4 h-4" />
                    </button>
                    <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-slate-600 transition-colors" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
