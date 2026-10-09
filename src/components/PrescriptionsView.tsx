import React, { useState, useEffect } from 'react';
import { PrescriptionItem, Patient } from '../types';
import { api } from '../lib/api';
import { Pill, Search, Printer, FileText, ArrowRight } from 'lucide-react';
import { PrintRxModal } from './PrintRxModal';
import { useAuth } from '../context/AuthContext';

interface PrescriptionsViewProps {
  onSelectPatient: (patientId: string) => void;
}

export const PrescriptionsView: React.FC<PrescriptionsViewProps> = ({ onSelectPatient }) => {
  const { doctor } = useAuth();
  const [prescriptions, setPrescriptions] = useState<PrescriptionItem[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Print modal state
  const [selectedPatientForPrint, setSelectedPatientForPrint] = useState<Patient | null>(null);
  const [patientPrescriptionsForPrint, setPatientPrescriptionsForPrint] = useState<PrescriptionItem[]>([]);

  useEffect(() => {
    api.prescriptions.list()
      .then(res => setPrescriptions(res.prescriptions))
      .catch(err => console.warn('Failed to load prescriptions:', err))
      .finally(() => setIsLoading(false));
  }, []);

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

  const filtered = prescriptions.filter(p =>
    p.medicineName.toLowerCase().includes(search.toLowerCase()) ||
    p.dosage.toLowerCase().includes(search.toLowerCase()) ||
    p.instructions.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Prescription Registry</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          View all active and historical medication regimens prescribed in your clinic ({filtered.length} entries)
        </p>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search medicine name, dosage, instructions..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full text-xs pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-1 focus:ring-teal-500 focus:bg-white"
          />
        </div>
      </div>

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

      {selectedPatientForPrint && doctor && (
        <PrintRxModal
          patient={selectedPatientForPrint}
          prescriptions={patientPrescriptionsForPrint}
          doctor={doctor}
          onClose={() => setSelectedPatientForPrint(null)}
        />
      )}
    </div>
  );
};
