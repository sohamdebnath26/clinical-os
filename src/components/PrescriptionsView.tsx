import React, { useState, useEffect } from 'react';
import { PrescriptionItem, Patient, DoctorFormularyItem } from '../types';
import { api } from '../lib/api';
import { Pill, Search, Printer, FileText, ArrowRight, BookOpen, Upload, Plus, Trash2, Sparkles, CheckCircle2 } from 'lucide-react';
import { PrintRxModal } from './PrintRxModal';
import { WhatsAppShareModal, WhatsAppIcon } from './WhatsAppShareModal';
import { FormularyUploadModal } from './FormularyUploadModal';
import { useAuth } from '../context/AuthContext';
import { COMMON_MEDICATIONS } from '../data/clinicalCatalogues';

interface PrescriptionsViewProps {
  onSelectPatient: (patientId: string) => void;
}

export const PrescriptionsView: React.FC<PrescriptionsViewProps> = ({ onSelectPatient }) => {
  const { doctor } = useAuth();
  const [prescriptions, setPrescriptions] = useState<PrescriptionItem[]>([]);
  const [doctorFormulary, setDoctorFormulary] = useState<DoctorFormularyItem[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState<'formulary' | 'registry'>('formulary');
  const [libraryFilter, setLibraryFilter] = useState<'all' | 'personal' | 'standard'>('all');

  // Upload / Add to Personal Library modal state
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadModalMode, setUploadModalMode] = useState<'upload' | 'paste' | 'single'>('upload');
  const [libraryFeedback, setLibraryFeedback] = useState<string | null>(null);

  // Print modal state
  const [selectedPatientForPrint, setSelectedPatientForPrint] = useState<Patient | null>(null);
  const [patientPrescriptionsForPrint, setPatientPrescriptionsForPrint] = useState<PrescriptionItem[]>([]);

  // WhatsApp modal state
  const [selectedPatientForWhatsApp, setSelectedPatientForWhatsApp] = useState<Patient | null>(null);
  const [patientPrescriptionsForWhatsApp, setPatientPrescriptionsForWhatsApp] = useState<PrescriptionItem[]>([]);

  useEffect(() => {
    Promise.all([
      api.prescriptions.list().catch(() => ({ prescriptions: [] })),
      api.formulary.list().catch(() => ({ items: [] }))
    ])
      .then(([rxRes, formRes]) => {
        setPrescriptions(rxRes.prescriptions || []);
        setDoctorFormulary(formRes.items || []);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const handleDeletePersonalMed = async (id: string, name: string) => {
    try {
      await api.formulary.delete(id);
      setDoctorFormulary(prev => prev.filter(item => item.id !== id));
      setLibraryFeedback(`Removed "${name}" from your personal library.`);
      setTimeout(() => setLibraryFeedback(null), 3500);
    } catch {
      // ignore
    }
  };

  const handlePrintPatientRx = async (patientId: string) => {
    try {
      const patRes = await api.patients.get(patientId);
      const patRxs = prescriptions.filter(p => p.patientId === patientId);
      setSelectedPatientForPrint(patRes.patient);
      setPatientPrescriptionsForPrint(patRxs);
    } catch {
      // ignore
    }
  };

  const handleWhatsAppPatientRx = async (patientId: string) => {
    try {
      const patRes = await api.patients.get(patientId);
      const patRxs = prescriptions.filter(p => p.patientId === patientId);
      setSelectedPatientForWhatsApp(patRes.patient);
      setPatientPrescriptionsForWhatsApp(patRxs);
    } catch {
      // ignore
    }
  };

  const filtered = prescriptions.filter(p =>
    p.medicineName.toLowerCase().includes(search.toLowerCase()) ||
    p.dosage.toLowerCase().includes(search.toLowerCase()) ||
    p.instructions.toLowerCase().includes(search.toLowerCase())
  );

  // Merge doctor's personalized library first, then standard catalogue (deduplicated by name)
  const personalNamesSet = new Set(doctorFormulary.map(m => m.name.toLowerCase()));
  const mergedFormulary = [
    ...doctorFormulary.map(m => ({
      id: m.id,
      name: m.name,
      dosage: m.dosage,
      route: m.route || 'Oral',
      frequency: m.frequency,
      duration: m.duration,
      instructions: m.instructions,
      isPersonal: true,
      source: m.source
    })),
    ...COMMON_MEDICATIONS.filter(m => !personalNamesSet.has(m.name.toLowerCase())).map((m, idx) => ({
      id: `std-${idx}`,
      no: 'no' in m && typeof m.no === 'number' ? m.no : idx + 1,
      name: m.name,
      dosage: m.dosage,
      route: /cream|gel|ointment|lotion|shampoo|solution|spf|sunscreen|topical/i.test(`${m.name} ${m.dosage}`)
        ? 'Topical'
        : /\b(iv|im|iv\/im|infusion)\b/i.test(`${m.name} ${m.dosage}`)
        ? 'IV / IM'
        : 'Oral',
      frequency: m.frequency,
      duration: m.duration,
      instructions: m.instructions,
      isPersonal: false,
      source: 'standard' as const
    }))
  ];

  const filteredFormulary = mergedFormulary.filter(m => {
    if (libraryFilter === 'personal' && !m.isPersonal) return false;
    if (libraryFilter === 'standard' && m.isPersonal) return false;
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      m.name.toLowerCase().includes(q) ||
      m.dosage.toLowerCase().includes(q) ||
      m.frequency.toLowerCase().includes(q) ||
      m.instructions.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            {activeSubTab === 'formulary'
              ? `Personalized Medical Library — ${doctor?.name || 'Doctor'}`
              : 'Prescription Registry'}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {activeSubTab === 'formulary'
              ? `${doctorFormulary.length} custom doctor medications + ${COMMON_MEDICATIONS.length} standard antimicrobial & clinic drugs (${mergedFormulary.length} total auto-lookup items)`
              : `View all active and historical medication regimens prescribed in your clinic (${filtered.length} entries)`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {activeSubTab === 'formulary' && (
            <>
              <button
                type="button"
                onClick={() => {
                  setUploadModalMode('upload');
                  setIsUploadModalOpen(true);
                }}
                className="px-3.5 py-2 rounded-xl bg-teal-800 hover:bg-teal-900 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload CSV / PDF Library</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setUploadModalMode('single');
                  setIsUploadModalOpen(true);
                }}
                className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-teal-800 border border-teal-200 text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Medicine</span>
              </button>
            </>
          )}

          <div className="inline-flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setActiveSubTab('formulary')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeSubTab === 'formulary'
                  ? 'bg-white text-teal-800 shadow-2xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Medical Library ({mergedFormulary.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('registry')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeSubTab === 'registry'
                  ? 'bg-white text-teal-800 shadow-2xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Patient Prescriptions ({prescriptions.length})</span>
            </button>
          </div>
        </div>
      </div>

      {libraryFeedback && (
        <div className="px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{libraryFeedback}</span>
          </div>
          <button
            type="button"
            onClick={() => setLibraryFeedback(null)}
            className="text-emerald-700 hover:text-emerald-950 text-xs font-bold"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search medicine name, required dosage, frequency, instructions..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full text-xs pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-1 focus:ring-teal-500 focus:bg-white"
          />
        </div>

        {activeSubTab === 'formulary' && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setLibraryFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                libraryFilter === 'all'
                  ? 'bg-teal-800 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All ({mergedFormulary.length})
            </button>
            <button
              type="button"
              onClick={() => setLibraryFilter('personal')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                libraryFilter === 'personal'
                  ? 'bg-teal-800 text-white'
                  : 'bg-teal-50 text-teal-800 border border-teal-200 hover:bg-teal-100'
              }`}
            >
              <Sparkles className="w-3 h-3" />
              <span>My Personal Library ({doctorFormulary.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setLibraryFilter('standard')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                libraryFilter === 'standard'
                  ? 'bg-teal-800 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Standard Catalogue ({COMMON_MEDICATIONS.length})
            </button>
          </div>
        )}
      </div>

      {activeSubTab === 'formulary' ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          {filteredFormulary.length === 0 ? (
            <div className="p-10 text-center space-y-3">
              <p className="text-xs text-slate-500">
                {libraryFilter === 'personal'
                  ? 'You have not added any custom medications to your personal library yet. Upload a PDF/CSV or add a medicine above, or type a new medicine during a consultation!'
                  : `No medicines matching "${search}".`}
              </p>
              {search.trim() && (
                <button
                  type="button"
                  onClick={() => {
                    setUploadModalMode('single');
                    setIsUploadModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-800 hover:bg-teal-900 text-white text-xs font-bold shadow-xs cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add "{search.trim()}" to My Personal Library</span>
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="py-3 px-4 w-14">#</th>
                    <th className="py-3 px-4">Medicine Name</th>
                    <th className="py-3 px-4">Required Dosage</th>
                    <th className="py-3 px-4">Frequency & Duration</th>
                    <th className="py-3 px-4">Clinical Instructions</th>
                    <th className="py-3 px-4 text-right">Library Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredFormulary.map((med, idx) => (
                    <tr key={med.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">
                        {'no' in med && typeof med.no === 'number' ? med.no : idx + 1}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                              med.isPersonal ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-teal-50 text-teal-700'
                            }`}
                          >
                            <Pill className="w-3.5 h-3.5" />
                          </div>
                          <span>{med.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-800 font-semibold">
                        <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-100">
                          {med.dosage}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-teal-800 font-semibold">
                        {med.frequency} · <span className="font-sans text-slate-500 font-normal">{med.duration}</span>
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {med.instructions || '—'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {med.isPersonal ? (
                            <>
                              <span className="px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-bold">
                                {med.source === 'csv_upload'
                                  ? 'CSV Upload'
                                  : med.source === 'pdf_upload'
                                  ? 'PDF Upload'
                                  : 'My Library'}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleDeletePersonalMed(med.id, med.name)}
                                className="p-1 text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                                title="Remove from my personal library"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-medium">
                              Standard Formulary
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          {isLoading ? (
            <div className="p-12 text-center text-xs text-slate-400">Loading prescriptions...</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-400">
              No prescriptions recorded yet. Prescriptions are created and attached during consultations.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="py-3 px-4">Medicine Name</th>
                    <th className="py-3 px-4">Dosage</th>
                    <th className="py-3 px-4">Frequency</th>
                    <th className="py-3 px-4">Duration</th>
                    <th className="py-3 px-4">Instructions</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(rx => (
                    <tr key={rx.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-900 flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center shrink-0">
                          <Pill className="w-3.5 h-3.5" />
                        </div>
                        <span>{rx.medicineName}</span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-700 font-medium">
                        {rx.dosage}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-teal-800 font-semibold">
                        {rx.frequency}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600">
                        {rx.duration}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 italic max-w-xs truncate">
                        {rx.instructions || '—'}
                      </td>
                      <td className="py-3.5 px-4 text-slate-400">
                        {new Date(rx.date || rx.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleWhatsAppPatientRx(rx.patientId)}
                            className="px-2.5 py-1 bg-[#25D366] hover:bg-[#1EBE5D] text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                            title="Send Prescription to patient's WhatsApp"
                          >
                            <WhatsAppIcon className="w-3 h-3 fill-white" />
                            <span>WhatsApp</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePrintPatientRx(rx.patientId)}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                          >
                            <Printer className="w-3 h-3 text-teal-700" />
                            Print Rx
                          </button>
                          <button
                            type="button"
                            onClick={() => onSelectPatient(rx.patientId)}
                            className="px-2 py-1 text-teal-700 hover:text-teal-900 text-xs font-semibold flex items-center gap-0.5"
                          >
                            Patient <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <FormularyUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        doctorName={doctor?.name || 'Doctor'}
        initialMode={uploadModalMode}
        initialMedName={search.trim()}
        onUpdated={(items, msg) => {
          setDoctorFormulary(items);
          setActiveSubTab('formulary');
          setLibraryFilter('personal');
          if (msg) {
            setLibraryFeedback(msg);
            setTimeout(() => setLibraryFeedback(null), 6000);
          }
        }}
      />

      {selectedPatientForPrint && doctor && (
        <PrintRxModal
          patient={selectedPatientForPrint}
          prescriptions={patientPrescriptionsForPrint}
          doctor={doctor}
          onClose={() => setSelectedPatientForPrint(null)}
        />
      )}

      {selectedPatientForWhatsApp && doctor && (
        <WhatsAppShareModal
          isOpen={!!selectedPatientForWhatsApp}
          onClose={() => setSelectedPatientForWhatsApp(null)}
          patient={selectedPatientForWhatsApp}
          doctor={doctor}
          reportType="prescription"
          data={{
            prescriptions: patientPrescriptionsForWhatsApp
          }}
        />
      )}
    </div>
  );
};
