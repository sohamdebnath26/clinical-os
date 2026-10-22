import React, { useState, useRef } from 'react';
import { DoctorFormularyItem } from '../types';
import { api } from '../lib/api';
import { X, Upload, FileText, Plus, CheckCircle2, Pill, Sparkles, BookOpen } from 'lucide-react';

interface FormularyUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  doctorName?: string;
  initialMode?: 'upload' | 'paste' | 'single';
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
  initialMode = 'upload',
  initialMedName = '',
  initialDosage = '500 mg',
  initialRoute = 'Oral',
  initialFrequency = '1-0-1',
  initialDuration = '5 days',
  initialInstructions = 'After meals',
  onUpdated
}) => {
  const [mode, setMode] = useState<'upload' | 'paste' | 'single'>(initialMode);
  const [selectedFile, setSelectedFile] = useState<{
    name: string;
    dataUrl: string;
    textContent?: string;
    detectedRows?: number;
    size: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [rawText, setRawText] = useState('');

  // Single medicine form state
  const [singleName, setSingleName] = useState(initialMedName);
  const [singleDosage, setSingleDosage] = useState(initialDosage);
  const [singleRoute, setSingleRoute] = useState(initialRoute);
  const [singleFrequency, setSingleFrequency] = useState(initialFrequency);
  const [singleDuration, setSingleDuration] = useState(initialDuration);
  const [singleInstructions, setSingleInstructions] = useState(initialInstructions);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const processSelectedFile = (file: File) => {
    setError(null);
    setSuccessMsg(null);

    const lowerName = file.name.toLowerCase();
    const isTextLike =
      lowerName.endsWith('.csv') ||
      lowerName.endsWith('.tsv') ||
      lowerName.endsWith('.txt') ||
      lowerName.endsWith('.json') ||
      file.type.includes('csv') ||
      file.type.includes('text') ||
      file.type.includes('excel') ||
      file.type.includes('json');

    const dataUrlReader = new FileReader();
    dataUrlReader.onload = () => {
      const dataUrl = typeof dataUrlReader.result === 'string' ? dataUrlReader.result : '';
      if (isTextLike) {
        const textReader = new FileReader();
        textReader.onload = () => {
          const textContent = typeof textReader.result === 'string' ? textReader.result : '';
          const nonEmptyLines = textContent
            .replace(/^\uFEFF/, '')
            .split(/\r?\n/)
            .map(l => l.trim())
            .filter(Boolean);
          const hasHeader =
            nonEmptyLines.length > 1 &&
            /medicine|medication|drug|name|dosage|dose|strength/i.test(nonEmptyLines[0]);
          const detectedRows = Math.max(0, nonEmptyLines.length - (hasHeader ? 1 : 0));

          setSelectedFile({
            name: file.name,
            dataUrl,
            textContent,
            detectedRows,
            size: file.size
          });
        };
        textReader.onerror = () => {
          setSelectedFile({
            name: file.name,
            dataUrl,
            size: file.size
          });
        };
        textReader.readAsText(file, 'UTF-8');
      } else {
        setSelectedFile({
          name: file.name,
          dataUrl,
          size: file.size
        });
      }
    };
    dataUrlReader.onerror = () => {
      setError('Failed to read selected file');
    };
    dataUrlReader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processSelectedFile(file);
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    processSelectedFile(file);
  };

  const handleDownloadSampleCsv = (e: React.MouseEvent) => {
    e.stopPropagation();
    const sampleCsv = [
      'Medicine Name,Required Dosage,Route,Frequency,Duration,Instructions',
      '"Amoxicillin","500 mg every 8 hours","Oral","1-1-1","5 days","After meals"',
      '"Azithromycin","500 mg on Day 1, then 250 mg once daily","Oral","1-0-0","5 days","1 hour before or 2 hours after food"',
      '"Doxycycline","100 mg every 12 hours","Oral","1-0-1","7 days","Take with a full glass of water"',
      '"Mupirocin 2% Ointment","Apply thin film 3 times daily","Topical","1-1-1","10 days","Apply on affected lesion"',
      '"Terbinafine","250 mg once daily","Oral","1-0-0","14 days","After meal"'
    ].join('\n');
    const blob = new Blob([sampleCsv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'sample_doctor_formulary.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportFileOrText = async () => {
    setError(null);
    setSuccessMsg(null);

    if (mode === 'upload' && !selectedFile) {
      setError('Please select or drop a CSV, PDF, TXT, or JSON medication file first.');
      return;
    }
    if (mode === 'paste' && !rawText.trim()) {
      setError('Please paste one or more medication lines first.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.formulary.importData({
        fileDataUrl: mode === 'upload' ? selectedFile?.dataUrl : undefined,
        filename: mode === 'upload' ? selectedFile?.name : undefined,
        rawText: mode === 'paste' ? rawText : selectedFile?.textContent
      });
      const msg = `Imported ${res.importedCount} new and updated ${res.updatedCount} medicines in ${doctorName}'s personal library (${res.totalProcessed} total parsed).`;
      setSuccessMsg(msg);
      onUpdated(res.items, msg);
      setTimeout(() => {
        onClose();
      }, 900);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to import medications');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveSingleMedicine = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!singleName.trim()) {
      setError('Medicine name is required');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.formulary.upsert({
        name: singleName.trim(),
        dosage: singleDosage.trim() || '500 mg',
        route: singleRoute || 'Oral',
        frequency: singleFrequency.trim() || '1-0-1',
        duration: singleDuration.trim() || '5 days',
        instructions: singleInstructions.trim() || 'After meals',
        source: 'manual'
      });
      const listRes = await api.formulary.list();
      const msg = `"${singleName.trim()}" (${singleDosage.trim()}) saved to ${doctorName}'s personal library.`;
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

  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-teal-900 to-teal-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-teal-200" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight">
                Personal Medical Library — {doctorName}
              </h3>
              <p className="text-[11px] text-teal-100/90">
                Upload PDF/CSV drug formularies or add custom medicines for instant auto-lookup while typing
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

        {/* Mode Tabs */}
        <div className="px-5 pt-4 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setMode('upload');
              setError(null);
            }}
            className={`px-3.5 py-2 rounded-t-xl text-xs font-bold flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
              mode === 'upload'
                ? 'bg-white text-teal-800 border-teal-700'
                : 'text-slate-500 border-transparent hover:text-slate-800'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload CSV / PDF File</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('paste');
              setError(null);
            }}
            className={`px-3.5 py-2 rounded-t-xl text-xs font-bold flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
              mode === 'paste'
                ? 'bg-white text-teal-800 border-teal-700'
                : 'text-slate-500 border-transparent hover:text-slate-800'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Paste Medicine Data</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('single');
              setError(null);
            }}
            className={`px-3.5 py-2 rounded-t-xl text-xs font-bold flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
              mode === 'single'
                ? 'bg-white text-teal-800 border-teal-700'
                : 'text-slate-500 border-transparent hover:text-slate-800'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Single Medicine</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
              {error}
            </div>
          )}
          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {mode === 'upload' && (
            <div className="space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragEnter={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
                  isDragging
                    ? 'border-teal-600 bg-teal-100/70 scale-[1.01]'
                    : 'border-teal-300 hover:border-teal-500 bg-teal-50/40 hover:bg-teal-50/70'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.tsv,.txt,.pdf,.json,text/csv,application/csv,application/vnd.ms-excel,text/comma-separated-values,text/plain,application/pdf,application/json"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="w-11 h-11 rounded-2xl bg-teal-100 text-teal-800 flex items-center justify-center mx-auto mb-3">
                  <Upload className="w-5 h-5" />
                </div>
                <p className="text-xs font-bold text-slate-800">
                  {selectedFile
                    ? `Selected: ${selectedFile.name} (${(selectedFile.size / 1024).toFixed(1)} KB)`
                    : 'Click or Drag & Drop CSV, PDF, TXT, or JSON Medication File'}
                </p>
                {selectedFile && typeof selectedFile.detectedRows === 'number' && selectedFile.detectedRows > 0 && (
                  <p className="text-[11px] font-bold text-teal-700 mt-1">
                    Ready to import — {selectedFile.detectedRows} medication row{selectedFile.detectedRows === 1 ? '' : 's'} detected in file
                  </p>
                )}
                <p className="text-[11px] text-slate-500 mt-1">
                  Automatically extracts Medicine Name, Required Dosage, Route, Frequency & Instructions into your personal library
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] text-slate-600 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold text-slate-700 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                    Supported CSV & PDF Formats:
                  </p>
                  <button
                    type="button"
                    onClick={handleDownloadSampleCsv}
                    className="text-[11px] font-bold text-teal-700 hover:text-teal-900 underline cursor-pointer"
                  >
                    Download Sample CSV Template
                  </button>
                </div>
                <p>• Any CSV / Excel export (e.g. Medicine Name, Dosage, Route, Frequency, Duration, Instructions)</p>
                <p>• Standard 2-column or 3-column PDF tables (e.g. No. | Medicine | Dosage)</p>
                <p>• Text lists with "Medicine Name - Dosage" or "Medicine Name | Dosage"</p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleImportFileOrText}
                  disabled={isSubmitting || !selectedFile}
                  className="px-5 py-2 rounded-xl bg-teal-800 hover:bg-teal-900 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{isSubmitting ? 'Extracting & Saving...' : 'Extract & Save to My Library'}</span>
                </button>
              </div>
            </div>
          )}

          {mode === 'paste' && (
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Paste Medications & Dosages (One per line — CSV, Pipe |, Tab, or Dash - separated)
                </label>
                <textarea
                  rows={7}
                  value={rawText}
                  onChange={e => setRawText(e.target.value)}
                  placeholder={`Examples:\nAmoxicillin + Clavulanate | 625 mg | 1-0-1 | 7 days | After food\nCefpodoxime Proxetil - 200 mg orally every 12 hours for 7 days\nTacrolimus 0.1% Ointment | Apply thin layer | 1-0-1 | 14 days | Apply on affected plaques`}
                  className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleImportFileOrText}
                  disabled={isSubmitting || !rawText.trim()}
                  className="px-5 py-2 rounded-xl bg-teal-800 hover:bg-teal-900 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isSubmitting ? 'Importing...' : 'Import into My Library'}</span>
                </button>
              </div>
            </div>
          )}

          {mode === 'single' && (
            <form onSubmit={handleSaveSingleMedicine} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Medicine Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={singleName}
                    onChange={e => setSingleName(e.target.value)}
                    placeholder="e.g. Bilastine 20mg"
                    className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:border-teal-600"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Required Dosage / Strength *
                  </label>
                  <input
                    type="text"
                    required
                    value={singleDosage}
                    onChange={e => setSingleDosage(e.target.value)}
                    placeholder="e.g. 20 mg orally once daily"
                    className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:border-teal-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Route
                  </label>
                  <select
                    value={singleRoute}
                    onChange={e => setSingleRoute(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:border-teal-600"
                  >
                    <option value="Oral">Oral</option>
                    <option value="Topical">Topical</option>
                    <option value="IV / IM">IV / IM</option>
                    <option value="Intralesional">Intralesional</option>
                    <option value="Subcutaneous">Subcutaneous</option>
                    <option value="Nasal / Drops">Nasal / Drops</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Default Frequency
                  </label>
                  <input
                    type="text"
                    value={singleFrequency}
                    onChange={e => setSingleFrequency(e.target.value)}
                    placeholder="1-0-1"
                    className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:border-teal-600"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Default Duration
                  </label>
                  <input
                    type="text"
                    value={singleDuration}
                    onChange={e => setSingleDuration(e.target.value)}
                    placeholder="5 days"
                    className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:border-teal-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Clinical Instructions
                </label>
                <input
                  type="text"
                  value={singleInstructions}
                  onChange={e => setSingleInstructions(e.target.value)}
                  placeholder="e.g. Take 1 hour before meals with water"
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:border-teal-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !singleName.trim()}
                  className="px-5 py-2 rounded-xl bg-teal-800 hover:bg-teal-900 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Pill className="w-3.5 h-3.5" />
                  <span>{isSubmitting ? 'Saving...' : 'Save to My Library'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
