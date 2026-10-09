import React, { useState, useEffect } from 'react';
import { Appointment, AppointmentStatus, Patient } from '../types';
import { api } from '../lib/api';
import { useLanguage } from '../context/LanguageContext';
import { ScheduleAppointmentModal } from './ScheduleAppointmentModal';
import {
  Calendar,
  Clock,
  User,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Stethoscope,
  ChevronRight,
  MoreVertical,
  Plus,
  ArrowRight,
  RotateCcw,
  XCircle,
  FileText
} from 'lucide-react';

interface AppointmentsViewProps {
  onSelectPatient: (patientId: string) => void;
  onStartConsultationForPatient: (patient: Patient) => void;
}

type FilterTab = 'all' | 'today' | 'upcoming' | 'follow_ups' | 'completed';

export const AppointmentsView: React.FC<AppointmentsViewProps> = ({
  onSelectPatient,
  onStartConsultationForPatient
}) => {
  const { t } = useLanguage();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [selectedDate, setSelectedDate] = useState<string>('');

  // Modals
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);

  const loadAppointments = () => {
    setIsLoading(true);
    api.appointments.list()
      .then(res => setAppointments(res.appointments))
      .catch(err => console.warn('Failed to load appointments:', err))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    loadAppointments();
  }, []);

  const todayStr = new Date().toISOString().split('T')[0];

  const handleUpdateStatus = async (apptId: string, status: AppointmentStatus) => {
    try {
      await api.appointments.update(apptId, { status });
      setAppointments(prev =>
        prev.map(a => (a.id === apptId ? { ...a, status, updatedAt: new Date().toISOString() } : a))
      );
    } catch (err) {
      console.error('Failed to update appointment status:', err);
    }
  };

  const handleDelete = async (apptId: string) => {
    if (!window.confirm('Are you sure you want to cancel this appointment?')) return;
    try {
      await api.appointments.delete(apptId);
      setAppointments(prev => prev.filter(a => a.id !== apptId));
    } catch (err) {
      console.error('Failed to cancel appointment:', err);
    }
  };

  const handleStartConsultationFromAppt = async (appt: Appointment) => {
    try {
      // First update status to in_progress or checked_in
      await api.appointments.update(appt.id, { status: 'in_progress' });
      // Fetch full patient object
      const res = await api.patients.get(appt.patientId);
      onStartConsultationForPatient(res.patient);
    } catch (err) {
      console.error('Failed to start consultation for appointment:', err);
    }
  };

  // Filtered list
  const filteredAppointments = appointments.filter(a => {
    // Search query
    const matchesSearch =
      a.patientName.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
      a.patientCode.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
      (a.patientMobile && a.patientMobile.includes(searchQuery.trim())) ||
      (a.instructions && a.instructions.toLowerCase().includes(searchQuery.toLowerCase().trim()));

    if (!matchesSearch) return false;

    // Date picker
    if (selectedDate && a.date !== selectedDate) return false;

    // Tab filters
    if (activeTab === 'today') {
      return a.date === todayStr && a.status !== 'cancelled';
    }
    if (activeTab === 'upcoming') {
      return a.date >= todayStr && a.status !== 'completed' && a.status !== 'cancelled';
    }
    if (activeTab === 'follow_ups') {
      return a.type === 'follow_up';
    }
    if (activeTab === 'completed') {
      return a.status === 'completed';
    }

    return true;
  });

  // Metrics
  const todayCount = appointments.filter(a => a.date === todayStr && a.status !== 'cancelled').length;
  const upcomingCount = appointments.filter(a => a.date > todayStr && a.status !== 'completed' && a.status !== 'cancelled').length;
  const followUpsCount = appointments.filter(a => a.type === 'follow_up' && a.status !== 'cancelled').length;
  const completedCount = appointments.filter(a => a.status === 'completed').length;

  const getStatusBadge = (status: AppointmentStatus) => {
    switch (status) {
      case 'scheduled':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
            <Clock className="w-3 h-3" /> Scheduled
          </span>
        );
      case 'checked_in':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">
            <CheckCircle2 className="w-3 h-3" /> Checked In
          </span>
        );
      case 'in_progress':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-teal-50 text-teal-800 border border-teal-300 px-2 py-0.5 rounded-full animate-pulse">
            <Stethoscope className="w-3 h-3" /> In Consultation
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
            <CheckCircle2 className="w-3 h-3" /> Completed
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-full">
            <XCircle className="w-3 h-3" /> Cancelled
          </span>
        );
      default:
        return null;
    }
  };

  const getRelativeDateBadge = (dateStr: string) => {
    if (dateStr === todayStr) {
      return <span className="text-[10px] font-bold uppercase tracking-wider text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-md">Today</span>;
    }
    const today = new Date(todayStr);
    const target = new Date(dateStr);
    const diffTime = target.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      return <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md">Tomorrow</span>;
    }
    if (diffDays > 1 && diffDays <= 7) {
      return <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">In {diffDays} days</span>;
    }
    if (diffDays < 0) {
      return <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md">Overdue ({Math.abs(diffDays)}d)</span>;
    }
    return <span className="text-[10px] font-medium text-slate-400 font-mono">{dateStr}</span>;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <span>{t('appointments')}</span>
            <span className="text-xs font-semibold bg-teal-50 text-teal-900 border border-teal-200 px-2.5 py-0.5 rounded-full">
              Follow-up Engine
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Scheduled appointments and follow-up dates synchronized from clinical consultations
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setEditingAppointment(null);
            setShowScheduleModal(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-800 hover:bg-teal-900 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>{t('scheduleAppointment')}</span>
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Today</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-bold text-slate-900">{todayCount}</span>
            <span className="text-xs font-semibold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-md">Active</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Upcoming</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-bold text-slate-900">{upcomingCount}</span>
            <span className="text-xs font-medium text-slate-500">Next 30 days</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Follow-ups</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-bold text-slate-900">{followUpsCount}</span>
            <span className="text-xs font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md">From visits</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Completed</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-bold text-slate-900">{completedCount}</span>
            <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md">Fulfilled</span>
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Tab buttons */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 text-xs">
            {[
              { id: 'all', label: 'All', count: appointments.length },
              { id: 'today', label: 'Today', count: todayCount },
              { id: 'upcoming', label: 'Upcoming', count: upcomingCount },
              { id: 'follow_ups', label: 'Follow-ups', count: followUpsCount },
              { id: 'completed', label: 'Completed', count: completedCount }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as FilterTab)}
                className={`px-3 py-1.5 rounded-xl font-semibold transition-colors shrink-0 flex items-center gap-1.5 ${
                  activeTab === tab.id
                    ? 'bg-teal-800 text-white shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span>{tab.label}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  activeTab === tab.id ? 'bg-teal-900 text-teal-200' : 'bg-slate-200/80 text-slate-600'
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Date Picker filter */}
          <div className="flex items-center gap-2 shrink-0">
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-1 focus:ring-teal-500 font-medium text-slate-700"
            />
            {selectedDate && (
              <button
                type="button"
                onClick={() => setSelectedDate('')}
                className="text-xs text-slate-400 hover:text-slate-600 p-1"
                title="Clear date filter"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Search input */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by patient name, patient code, mobile number, or clinical instruction..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full text-xs pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all text-slate-800"
          />
        </div>
      </div>

      {/* Appointments List / Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            <div className="w-6 h-6 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            Loading appointments and follow-up schedules...
          </div>
        ) : filteredAppointments.length === 0 ? (
          <div className="p-12 text-center text-slate-500 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center mx-auto shadow-2xs">
              <Calendar className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-slate-700">{t('noAppointments')}</p>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Follow-ups scheduled during clinical consultations automatically appear here, or you can book appointments directly.
            </p>
            <button
              type="button"
              onClick={() => {
                setEditingAppointment(null);
                setShowScheduleModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-teal-800 text-white rounded-xl text-xs font-semibold hover:bg-teal-900 transition-colors shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('scheduleAppointment')}</span>
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredAppointments.map(appt => (
              <div
                key={appt.id}
                className="p-4 sm:p-5 hover:bg-slate-50/70 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                {/* Left Patient & Date Details */}
                <div className="flex items-start gap-3.5 flex-1 min-w-0">
                  <div className="w-11 h-11 rounded-2xl bg-teal-100/70 text-teal-900 font-bold text-sm flex items-center justify-center shrink-0 border border-teal-200">
                    {appt.patientName.charAt(0).toUpperCase()}
                  </div>

                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => onSelectPatient(appt.patientId)}
                        className="text-sm font-bold text-slate-900 hover:text-teal-800 transition-colors tracking-tight text-left"
                      >
                        {appt.patientName}
                      </button>
                      <span className="font-mono text-[10px] text-teal-800 bg-teal-50 px-1.5 py-0.5 rounded font-semibold border border-teal-200/80">
                        {appt.patientCode}
                      </span>
                      {getStatusBadge(appt.status)}
                      <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full capitalize">
                        {appt.type.replace('_', ' ')}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-500 font-medium flex-wrap">
                      <span className="flex items-center gap-1 text-slate-700 font-semibold">
                        <Calendar className="w-3.5 h-3.5 text-teal-700" />
                        {appt.date}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {appt.time || '10:00 AM'}
                      </span>
                      <span>•</span>
                      {getRelativeDateBadge(appt.date)}
                      {appt.patientMobile && (
                        <>
                          <span>•</span>
                          <span>📞 {appt.patientMobile}</span>
                        </>
                      )}
                    </div>

                    {/* Instructions & Originating Consultation note */}
                    {appt.instructions && (
                      <div className="mt-1.5 p-2 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-700 flex items-start gap-2">
                        <FileText className="w-3.5 h-3.5 text-teal-700 shrink-0 mt-0.5" />
                        <span className="text-[11px] leading-relaxed">
                          <strong>Instructions:</strong> {appt.instructions}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Actions Bar */}
                <div className="flex items-center gap-2 self-end md:self-center shrink-0 flex-wrap">
                  {appt.status !== 'completed' && appt.status !== 'cancelled' && (
                    <button
                      type="button"
                      onClick={() => handleStartConsultationFromAppt(appt)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-800 hover:bg-teal-900 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
                      title="Open consultation workspace for this patient"
                    >
                      <Stethoscope className="w-3.5 h-3.5 text-teal-200" />
                      <span>Start Consultation</span>
                    </button>
                  )}

                  {appt.status === 'scheduled' && (
                    <button
                      type="button"
                      onClick={() => handleUpdateStatus(appt.id, 'checked_in')}
                      className="px-2.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors"
                    >
                      Check In
                    </button>
                  )}

                  {appt.status === 'checked_in' && (
                    <button
                      type="button"
                      onClick={() => handleUpdateStatus(appt.id, 'completed')}
                      className="px-2.5 py-1.5 bg-white hover:bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-xl transition-colors"
                    >
                      Mark Done
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onSelectPatient(appt.patientId)}
                    className="px-2.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1"
                  >
                    <span>View Record</span>
                    <ChevronRight className="w-3 h-3 text-slate-400" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setEditingAppointment(appt);
                      setShowScheduleModal(true);
                    }}
                    className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
                    title="Reschedule / Edit"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(appt.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"
                    title="Cancel Appointment"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Schedule / Edit Modal */}
      {showScheduleModal && (
        <ScheduleAppointmentModal
          onClose={() => {
            setShowScheduleModal(false);
            setEditingAppointment(null);
          }}
          initialAppointment={editingAppointment}
          onSuccess={() => {
            setShowScheduleModal(false);
            setEditingAppointment(null);
            loadAppointments();
          }}
        />
      )}
    </div>
  );
};
