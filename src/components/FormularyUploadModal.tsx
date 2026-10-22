import React, { useState, useEffect } from 'react';
import { DoctorFormularyItem } from '../types';
import { api } from '../lib/api';
import {
  X,
  Plus,
  CheckCircle2,
  Pill,
  Sparkles,
  BookOpen
} from 'lucide-react';

export interface FormularyUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  doctorName?: string;
  initialMode?: string;
  initialMedName?: string;
  initialDosage?: string;
  initialRoute?: string;
  initialFrequency?: string;
  initialDuration?: string;
  initialInstructions?: string;
  onUpdated: (items: DoctorFormularyItem[], message?: string) => void;
}

export const FormularyUploadModal: React.FC<FormularyUploadModalProps> = ({
  isOpen,
  onClose,
  doctorName = 'Doctor',
  initialMedName = '',
  initialDosage = '500 mg',
  initialRoute = 'Oral',
  initialFrequency = '1-0-1',
  initialDuration = '5 days',
  initialInstructions = 'After meals',
  onUpdated
}) => {
  const [name, setName] = useState(initialMedName);
  const [dosage, setDosage] = useState(initialDosage);
  const [route, setRoute] = useState(initialRoute);
  const [frequency, setFrequency] = useState(initialFrequency);
  const [duration, setDuration] = useState(initialDuration);
  const [instructions, setInstructions] = useState(initialInstructions);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName(initialMedName);
      setDosage(initialDosage || '500 mg');
      setRoute(initialRoute || 'Oral');
      setFrequency(initialFrequency || '1-0-1');
      setDuration(initialDuration || '5 days');
      setInstructions(initialInstructions || 'After meals');
      setError(null);
      setSuccessMsg(null);
    }
  }, [
    isOpen,
    initialMedName,
    initialDosage,
    initialRoute,
    initialFrequency,
    initialDuration,
    initialInstructions
  ]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const cleanName = name.trim();
    if (!cleanName) {
      setError('Please provide a valid medicine name.');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.formulary.upsert({
        name: cleanName,
        dosage: dosage.trim() || '500 mg',
        route: route || 'Oral',
        frequency: frequency.trim() || '1-0-1',
        duration: duration.trim() || '5 days',
        instructions: instructions.trim() || 'After meals',
        category: 'Clinical Formulary',
        source: 'manual'
      });

      const listRes = await api.formulary.list();
      const msg = `"${cleanName}" (${dosage.trim() || '500 mg'}) added to the Clinical Formulary.`;
      setSuccessMsg(msg);
      onUpdated(listRes.items, msg);
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save medication');
    } finally {
      setIsSubmitting(false);
    }
  };

  const dosePresets = ['500 mg', '625 mg', '250 mg', '100 mg', '20 mg', '10 mg', '5 mg', '0.05%', '0.1%', '1%'];
  const freqPresets = [
    { label: '1-0-1', value: '1-0-1' },
    { label: '1-0-0', value: '1-0-0' },
    { label: '0-0-1', value: '0-0-1' },
    { label: '1-1-1', value: '1-1-1' },
    { label: 'SOS', value: 'SOS' }
  ];
  const durationPresets = ['3 days', '5 days', '7 days', '10 days', '14 days', '1 month'];
  const instructionPresets = [
    'After meals',
    'Before meals',
    'Empty stomach',
    'Bedtime',
    'With plenty of water',
    'Apply sparingly to affected area'
  ];

  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-xl max-h-[92vh] flex flex-col rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-teal-900 to-teal-800 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
              <Plus className="w-5 h-5 text-teal-200" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight">
                Add Medicine to Clinical Formulary
              </h3>
              <p className="text-[11px] text-teal-100/90">
                Configure standard dose, route, frequency, and instructions available to all doctors
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-teal-100 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
              {error}
            </div>
          )}
          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-semibold flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{successMsg}</span>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-bold shrink-0 cursor-pointer"
              >
                Done
              </button>
            </div>
          )}

          {/* Medicine Name */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">
              Medicine Name *
            </label>
            <div className="relative">
              <input
                type="text"
                required
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Bilastine 20mg, Amoxicillin + Clavulanate, Fusidic Acid Cream"
                className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
              />
            </div>
          </div>

          {/* Dosage & Route */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                Required Dosage / Strength *
              </label>
              <input
                type="text"
                required
                value={dosage}
                onChange={e => setDosage(e.target.value)}
                placeholder="e.g. 500 mg, 20 mg, 0.05%"
                className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
              />
              <div className="flex flex-wrap items-center gap-1 mt-1.5">
                {dosePresets.slice(0, 5).map(dp => (
                  <button
                    key={dp}
                    type="button"
                    onClick={() => setDosage(dp)}
                    className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-medium transition-colors"
                  >
                    {dp}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                Route
              </label>
              <select
                value={route}
                onChange={e => setRoute(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
              >
                <option value="Oral">Oral</option>
                <option value="Topical">Topical</option>
                <option value="IV / IM">IV / IM</option>
                <option value="Intralesional">Intralesional</option>
                <option value="Subcutaneous">Subcutaneous</option>
                <option value="Sublingual">Sublingual</option>
                <option value="Nasal / Drops">Nasal / Drops</option>
              </select>
            </div>
          </div>

          {/* Frequency & Duration */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                Default Frequency
              </label>
              <input
                type="text"
                value={frequency}
                onChange={e => setFrequency(e.target.value)}
                placeholder="1-0-1"
                className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-mono focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
              />
              <div className="flex flex-wrap items-center gap-1 mt-1.5">
                {freqPresets.map(fp => (
                  <button
                    key={fp.label}
                    type="button"
                    onClick={() => setFrequency(fp.value)}
                    className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-medium transition-colors"
                  >
                    {fp.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                Default Duration
              </label>
              <input
                type="text"
                value={duration}
                onChange={e => setDuration(e.target.value)}
                placeholder="5 days"
                className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
              />
              <div className="flex flex-wrap items-center gap-1 mt-1.5">
                {durationPresets.map(dur => (
                  <button
                    key={dur}
                    type="button"
                    onClick={() => setDuration(dur)}
                    className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-medium transition-colors"
                  >
                    {dur}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Clinical Instructions */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">
              Clinical Instructions
            </label>
            <input
              type="text"
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
              placeholder="e.g. After meals with plenty of water"
              className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
            />
            <div className="flex flex-wrap items-center gap-1 mt-1.5">
              {instructionPresets.map(ins => (
                <button
                  key={ins}
                  type="button"
                  onClick={() => setInstructions(ins)}
                  className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-medium transition-colors"
                >
                  + {ins}
                </button>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="px-5 py-2 rounded-xl bg-teal-800 hover:bg-teal-900 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Adding...' : 'Add Medicine'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const AddMedicineModal = FormularyUploadModal;
