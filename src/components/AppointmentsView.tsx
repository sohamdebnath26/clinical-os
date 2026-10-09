import React, { useState, useEffect } from 'react';
import { Appointment, AppointmentStatus, Patient } from '../types';
import { api } from '../lib/api';
import { useLanguage } from '../context/LanguageContext';
import {
  Calendar,
  Clock,
  User,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  XCircle,
  FileText,
  Eye,
  Trash2,
  X,
  ArrowRight,
  Phone
} from 'lucide-react';

interface AppointmentsViewProps {
  onSelectPatient: (patientId: string) => void;
  onStartConsultationForPatient?: (patient: Patient) => void;
}

type FilterTab = 'all' | 'today' | 'upcoming' | 'follow_ups' | 'completed';

export const AppointmentsView: React.FC<AppointmentsViewProps> = ({
  onSelectPatient
}) => {
  const { t } = useLanguage();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [selectedDate, setSelectedDate] = useState<string>('');

  // Modals
  const [viewingAppointment, setViewingAppointment] = useState<Appointment | null>(null);
  const [deleteConfirmAppt, setDeleteConfirmAppt] = useState<Appointment | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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

  const handleDelete = async (apptId: string) => {
    setIsDeleting(true);
    try {
      await api.appointments.delete(apptId);
      setAppointments(prev => prev.filter(a => a.id !== apptId));
      if (viewingAppointment?.id === apptId) {
        setViewingAppointment(null);
      }
      setDeleteConfirmAppt(null);
    } catch (err) {
      console.error('Failed to delete appointment:', err);
    } finally {
      setIsDeleting(false);
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
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-teal-50 text-teal-800 border border-teal-300 px-2 py-0.5 rounded-full">
            In Consultation
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
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <span>{t('appointments')}</span>
          <span className="text-xs font-semibold bg-teal-50 text-teal-900 border border-teal-200 px-2.5 py-0.5 rounded-full">
            Follow-up & Visits
          </span>
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Appointments and follow-up dates synchronized from clinical consultations
        </p>
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

      {/* Appointments List */}
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
              Appointments and follow-ups scheduled during clinical consultations automatically appear here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredAppointments.map(appt => (
              <div
                key={appt.id}
                className="p-4 sm:p-5 hover:bg-slate-50/70 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                {/* Left Patient & Date Details - Clicking on patient redirects to patient's details page */}
                <div className="flex items-start gap-3.5 flex-1 min-w-0">
                  <button
                    type="button"
                    onClick={() => onSelectPatient(appt.patientId)}
                    title="Click to view patient details"
                    className="w-11 h-11 rounded-2xl bg-teal-100/70 text-teal-900 font-bold text-sm flex items-center justify-center shrink-0 border border-teal-200 hover:bg-teal-200 hover:scale-105 transition-all cursor-pointer group shadow-2xs"
                  >
                    <span>{appt.patientName.charAt(0).toUpperCase()}</span>
                  </button>

                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => onSelectPatient(appt.patientId)}
                        title="Click to view patient details"
                        className="text-sm font-bold text-slate-900 hover:text-teal-800 hover:underline transition-colors tracking-tight text-left cursor-pointer flex items-center gap-1 group"
                      >
                        <span>{appt.patientName}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-teal-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>

                      <button
                        type="button"
                        onClick={() => onSelectPatient(appt.patientId)}
                        title="Click to view patient details"
                        className="font-mono text-[10px] text-teal-800 bg-teal-50 hover:bg-teal-100 px-1.5 py-0.5 rounded font-semibold border border-teal-200/80 transition-colors cursor-pointer"
                      >
                        {appt.patientCode}
                      </button>

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
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3 text-slate-400" />
                            {appt.patientMobile}
                          </span>
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

                {/* Right Actions Bar - Strictly View and Delete options */}
                <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                  {/* View Appointment Button */}
                  <button
                    type="button"
                    onClick={() => setViewingAppointment(appt)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 hover:border-slate-300 text-slate-700 rounded-xl text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                    title="View appointment details"
                  >
                    <Eye className="w-3.5 h-3.5 text-teal-700" />
                    <span>View</span>
                  </button>

                  {/* Delete Appointment Button */}
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmAppt(appt)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-rose-50 border border-rose-200 hover:border-rose-300 text-rose-700 rounded-xl text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                    title="Delete appointment"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 1. View Appointment Modal */}
      {viewingAppointment && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-teal-100/70 text-teal-800 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-teal-700" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Appointment Details</h3>
                  <p className="text-xs text-slate-500">ID: {viewingAppointment.id}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewingAppointment(null)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 text-xs">
              {/* Patient Banner with Redirect Button */}
              <div className="p-4 bg-teal-50/70 border border-teal-200/80 rounded-2xl flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-teal-800 text-white font-bold text-sm flex items-center justify-center shrink-0 shadow-xs">
                    {viewingAppointment.patientName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-slate-900 text-sm truncate">
                      {viewingAppointment.patientName}
                    </h4>
                    <div className="flex items-center gap-2 text-slate-600 font-mono text-[11px]">
                      <span>{viewingAppointment.patientCode}</span>
                      {viewingAppointment.patientMobile && (
                        <span>• {viewingAppointment.patientMobile}</span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const pid = viewingAppointment.patientId;
                    setViewingAppointment(null);
                    onSelectPatient(pid);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-teal-800 hover:bg-teal-900 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors shrink-0 cursor-pointer"
                >
                  <span>Patient Profile</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Appointment Schedule Details */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Date</span>
                  <div className="flex items-center gap-1.5 font-bold text-slate-800 text-sm">
                    <Calendar className="w-4 h-4 text-teal-700" />
                    <span>{viewingAppointment.date}</span>
                  </div>
                  <div className="pt-0.5">
                    {getRelativeDateBadge(viewingAppointment.date)}
                  </div>
                </div>

                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Time</span>
                  <div className="flex items-center gap-1.5 font-bold text-slate-800 text-sm">
                    <Clock className="w-4 h-4 text-teal-700" />
                    <span>{viewingAppointment.time || '10:00 AM'}</span>
                  </div>
                  <div className="pt-0.5">
                    <span className="text-[10px] font-semibold text-slate-500 capitalize">
                      Type: {viewingAppointment.type.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Status */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider mb-1">Status</span>
                  {getStatusBadge(viewingAppointment.status)}
                </div>
                {viewingAppointment.createdAt && (
                  <div className="text-right text-[11px] text-slate-400">
                    <span className="block font-medium">Created</span>
                    <span>{new Date(viewingAppointment.createdAt).toLocaleDateString()}</span>
                  </div>
                )}
              </div>

              {/* Clinical Instructions / Notes */}
              {viewingAppointment.instructions && (
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                    Doctor&apos;s Instructions
                  </span>
                  <p className="text-slate-700 text-xs leading-relaxed whitespace-pre-wrap">
                    {viewingAppointment.instructions}
                  </p>
                </div>
              )}

              {viewingAppointment.notes && (
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                    Additional Notes
                  </span>
                  <p className="text-slate-600 text-xs italic">
                    {viewingAppointment.notes}
                  </p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  const target = viewingAppointment;
                  setViewingAppointment(null);
                  setDeleteConfirmAppt(target);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-rose-700 hover:bg-rose-50 rounded-xl font-semibold border border-rose-200 hover:border-rose-300 transition-colors"
              >
                <Trash2 className="w-4 h-4 text-rose-600" />
                <span>Delete Appointment</span>
              </button>

              <button
                type="button"
                onClick={() => setViewingAppointment(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Delete Confirmation Modal */}
      {deleteConfirmAppt && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="font-bold text-slate-900 text-base">Delete Appointment?</h3>
              <p className="text-xs text-slate-500">
                Are you sure you want to delete the appointment for{' '}
                <strong className="text-slate-800">{deleteConfirmAppt.patientName}</strong> on{' '}
                <strong className="text-slate-800">{deleteConfirmAppt.date}</strong>? This action cannot be undone.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteConfirmAppt(null)}
                className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={isDeleting}
                onClick={() => handleDelete(deleteConfirmAppt.id)}
                className="py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {isDeleting ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
