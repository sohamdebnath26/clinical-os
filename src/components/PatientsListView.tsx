import React, { useState, useEffect } from 'react';
import { Patient, Gender } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { EditPatientModal } from './EditPatientModal';
import { api } from '../lib/api';
import {
  Search,
  Users,
  Filter,
  Stethoscope,
  ChevronRight,
  UserCheck,
  Phone,
  Pencil
} from 'lucide-react';

interface PatientsListViewProps {
  onSelectPatient: (patientId: string) => void;
  onOpenWalkIn: () => void;
  onStartConsultationForPatient: (patient: Patient) => void;
}

export const PatientsListView: React.FC<PatientsListViewProps> = ({
  onSelectPatient,
  onOpenWalkIn,
  onStartConsultationForPatient
}) => {
  const { t } = useLanguage();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [genderFilter, setGenderFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);

  const fetchPatients = async (query?: string) => {
    setIsLoading(true);
    try {
      const res = await api.patients.list(query);
      setPatients(res.patients);
    } catch (err) {
      console.warn('Failed to fetch patients:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchPatients(searchQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const filteredPatients = patients.filter(p => {
    if (genderFilter !== 'all' && p.gender !== genderFilter) return false;
    return true;
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
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Page Title & Add Button */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{t('patients')}</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            ({filteredPatients.length} {t('patients')})
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenWalkIn}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-teal-800 hover:bg-teal-900 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
          >
            <Users className="w-3.5 h-3.5" />
            <span>{t('walkIn')}</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder={t('searchPlaceholder')}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full text-xs pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-1 focus:ring-teal-500 focus:bg-white"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-xs font-semibold text-slate-600">{t('gender')}:</span>
          <select
            value={genderFilter}
            onChange={e => setGenderFilter(e.target.value)}
            className="text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-1 focus:ring-teal-500"
          >
            <option value="all">{t('filter')}: All</option>
            <option value="Male">{t('male')}</option>
            <option value="Female">{t('female')}</option>
            <option value="Other">{t('other')}</option>
          </select>
        </div>
      </div>

      {/* Patients Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-xs text-slate-500 flex flex-col items-center justify-center">
            <div className="w-6 h-6 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mb-2" />
            <span>{t('loading')}</span>
          </div>
        ) : filteredPatients.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400">
            {t('noPatientsYet')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="py-3 px-4">{t('patientName')}</th>
                  <th className="py-3 px-4">{t('patientId')}</th>
                  <th className="py-3 px-4">{t('age')} / {t('gender')}</th>
                  <th className="py-3 px-4">{t('mobile')}</th>
                  <th className="py-3 px-4">{t('consultation')}</th>
                  <th className="py-3 px-4">{t('diagnosis')}</th>
                  <th className="py-3 px-4 text-right">{t('actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPatients.map((p, idx) => (
                  <tr
                    key={p.id}
                    onClick={() => onSelectPatient(p.id)}
                    className="hover:bg-slate-50/70 transition-colors cursor-pointer group"
                  >
                    <td className="py-3.5 px-4 font-bold text-slate-800 group-hover:text-teal-800">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-full ${avatarColors[idx % avatarColors.length]} text-white text-xs font-bold flex items-center justify-center shrink-0`}>
                          {p.fullName.charAt(0).toUpperCase()}
                        </div>
                        <span>{p.fullName}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono font-semibold text-teal-800">
                      {p.patientCode}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">
                      {p.age}y • {p.gender}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-600">
                      {p.mobile}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500">
                      {p.lastVisitAt
                        ? new Date(p.lastVisitAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : 'Never'}
                    </td>
                    <td className="py-3.5 px-4 text-slate-700">
                      {p.primaryDiagnosis || <span className="text-slate-400 italic">None recorded</span>}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingPatient(p);
                          }}
                          className="p-1.5 text-slate-400 hover:text-teal-700 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Edit patient details"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onStartConsultationForPatient(p);
                          }}
                          className="px-2.5 py-1 bg-teal-50 hover:bg-teal-100 text-teal-800 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                        >
                          <Stethoscope className="w-3.5 h-3.5" />
                          Consult
                        </button>
                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-600" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Patient Modal */}
      {editingPatient && (
        <EditPatientModal
          patient={editingPatient}
          onClose={() => setEditingPatient(null)}
          onPatientUpdated={(updated) => {
            setPatients(prev => prev.map(p => p.id === updated.id ? updated : p));
            setEditingPatient(null);
          }}
        />
      )}
    </div>
  );
};
