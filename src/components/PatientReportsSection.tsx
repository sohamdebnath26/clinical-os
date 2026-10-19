import React, { useState } from 'react';
import {
  Patient,
  PatientTestReport,
  HistoricalReportSnapshot,
  TestReportCategory,
  TestReportStatus,
  TestResultFlag
} from '../types';
import { api } from '../lib/api';
import { PREDEFINED_TESTS } from '../data/clinicalCatalogues';
import { VoiceDictationButton } from './VoiceDictationButton';
import {
  FlaskConical,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileText,
  Printer,
  Pencil,
  Trash2,
  Sparkles,
  Upload,
  X,
  Eye,
  Microscope,
  Building2,
  Calendar,
  History,
  ChevronDown,
  ChevronUp,
  Archive,
  RefreshCw
} from 'lucide-react';

interface PatientReportsSectionProps {
  patient: Patient;
  reports: PatientTestReport[];
  doctorName?: string;
  onRefresh: () => void;
  onOpenAIWithPrompt?: (prompt: string) => void;
}

const CATEGORIES: TestReportCategory[] = [
  'Laboratory / Blood',
  'Microbiology / Fungal',
  'Histopathology / Biopsy',
  'Allergy / Patch Test',
  "Dermoscopy / Wood's Lamp",
  'Imaging / Other'
];

export const PatientReportsSection: React.FC<PatientReportsSectionProps> = ({
  patient,
  reports,
  doctorName,
  onRefresh,
  onOpenAIWithPrompt
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'pending' | 'flagged'>('all');
  const [viewMode, setViewMode] = useState<'all_with_history' | 'previous_archive'>('all_with_history');

  // Track which report cards have their "Previous Stored Reports" section expanded (default expanded so doctors see stored previous reports immediately)
  const [expandedHistoryMap, setExpandedHistoryMap] = useState<Record<string, boolean>>({});

  // Form / Modal state for adding, updating, or storing a previous report
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'new' | 'edit' | 'repeat' | 'previous'>('new');
  const [editingReport, setEditingReport] = useState<PatientTestReport | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<{ url: string; title: string } | null>(null);

  // Form fields
  const [testName, setTestName] = useState('');
  const [category, setCategory] = useState<TestReportCategory>('Laboratory / Blood');
  const [orderedDate, setOrderedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [reportDate, setReportDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [status, setStatus] = useState<TestReportStatus>('completed');
  const [resultFlag, setResultFlag] = useState<TestResultFlag>('normal');
  const [resultValue, setResultValue] = useState('');
  const [unit, setUnit] = useState('');
  const [referenceRange, setReferenceRange] = useState('');
  const [specimenType, setSpecimenType] = useState('');
  const [labName, setLabName] = useState('In-Clinic Diagnostics Lab');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [attachmentName, setAttachmentName] = useState('');

  const isHistoryExpanded = (reportId: string) => {
    return expandedHistoryMap[reportId] ?? true;
  };

  const toggleHistoryExpand = (reportId: string) => {
    setExpandedHistoryMap(prev => ({
      ...prev,
      [reportId]: !(prev[reportId] ?? true)
    }));
  };

  const autoFillTestDefaults = (selectedTest: string) => {
    setTestName(selectedTest);
    const lower = selectedTest.toLowerCase();
    if (lower.includes('koh') || lower.includes('fungal') || lower.includes('tzanck') || lower.includes('culture')) {
      setCategory('Microbiology / Fungal');
      setSpecimenType('Skin scraping / lesional swab');
      setReferenceRange('Negative / No fungal hyphae');
      setLabName('In-Clinic Dermatology Microscopy Lab');
    } else if (lower.includes('biopsy') || lower.includes('histopath') || lower.includes('immunofluorescence')) {
      setCategory('Histopathology / Biopsy');
      setSpecimenType('4mm Punch Skin Biopsy');
      setReferenceRange('Normal epidermal-dermal architecture');
      setLabName('Cutaneous Histopathology Reference Lab');
    } else if (lower.includes('patch') || lower.includes('ige') || lower.includes('allerg') || lower.includes('prick')) {
      setCategory('Allergy / Patch Test');
      setSpecimenType(lower.includes('ige') ? 'Venous Blood (Serum)' : 'Epicutaneous Patch Chambers');
      setReferenceRange(lower.includes('ige') ? '< 100 IU/mL' : 'Negative (0)');
      if (lower.includes('ige')) setUnit('IU/mL');
      setLabName('Allergy & Contact Dermatitis Unit');
    } else if (lower.includes('wood') || lower.includes('dermoscop') || lower.includes('trichoscop')) {
      setCategory("Dermoscopy / Wood's Lamp");
      setSpecimenType('Optical / 365nm UV Examination');
      setReferenceRange('Normal pigment network / No abnormal fluorescence');
      setLabName('In-Clinic Optical Dermoscopy Suite');
    } else {
      setCategory('Laboratory / Blood');
      setSpecimenType('Venous Blood (EDTA / Serum)');
      setReferenceRange('Within normal reference interval');
      setLabName('Central Clinical Diagnostics Lab');
    }
  };

  const openAddForm = (asPrevious = false, presetReport?: PatientTestReport) => {
    setEditingReport(presetReport || null);
    setFormMode(asPrevious ? 'previous' : presetReport ? 'repeat' : 'new');
    const pastDefaultDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const todayDate = new Date().toISOString().split('T')[0];

    setTestName(presetReport ? presetReport.testName : '');
    setCategory(presetReport ? presetReport.category : 'Laboratory / Blood');
    setOrderedDate(asPrevious ? pastDefaultDate : todayDate);
    setReportDate(asPrevious ? pastDefaultDate : todayDate);
    setStatus('completed');
    setResultFlag('normal');
    setResultValue('');
    setUnit(presetReport?.unit || '');
    setReferenceRange(presetReport?.referenceRange || '');
    setSpecimenType(presetReport?.specimenType || 'Venous Blood / Skin Specimen');
    setLabName(presetReport?.labName || (asPrevious ? 'External / Prior Diagnostic Lab' : 'In-Clinic Diagnostics Lab'));
    setClinicalNotes('');
    setAttachmentUrl('');
    setAttachmentName('');
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditForm = (rep: PatientTestReport) => {
    setEditingReport(rep);
    setFormMode('edit');
    setTestName(rep.testName);
    setCategory(rep.category);
    setOrderedDate(rep.orderedDate ? rep.orderedDate.split('T')[0] : new Date().toISOString().split('T')[0]);
    setReportDate(rep.reportDate ? rep.reportDate.split('T')[0] : new Date().toISOString().split('T')[0]);
    setStatus(rep.status);
    setResultFlag(rep.resultFlag);
    setResultValue(rep.resultValue || '');
    setUnit(rep.unit || '');
    setReferenceRange(rep.referenceRange || '');
    setSpecimenType(rep.specimenType || '');
    setLabName(rep.labName || '');
    setClinicalNotes(rep.clinicalNotes || '');
    setAttachmentUrl(rep.attachmentUrl || '');
    setAttachmentName(rep.attachmentName || '');
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleAttachmentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAttachmentUrl(reader.result);
        setAttachmentName(file.name);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testName.trim()) {
      setFormError('Please enter or select a test / report name.');
      return;
    }

    setIsSaving(true);
    setFormError(null);
    try {
      const payload: Partial<PatientTestReport> & { archiveCurrentAsPrevious?: boolean } = {
        testName: testName.trim(),
        category,
        orderedDate,
        reportDate: status === 'completed' ? reportDate : undefined,
        status,
        resultFlag: status === 'pending' ? 'pending' : resultFlag,
        resultValue:
          resultValue.trim() ||
          (status === 'pending' ? 'Awaiting laboratory report' : 'Normal / Within reference limits'),
        unit: unit.trim(),
        referenceRange: referenceRange.trim(),
        specimenType: specimenType.trim(),
        labName: labName.trim(),
        orderedByDoctor: editingReport?.orderedByDoctor || doctorName || 'Attending Physician',
        clinicalNotes: clinicalNotes.trim(),
        attachmentUrl,
        attachmentName,
        isPreviousReport: formMode === 'previous'
      };

      if (formMode === 'edit' && editingReport) {
        await api.reports.update(editingReport.id, payload);
      } else if (formMode === 'repeat' && editingReport) {
        await api.reports.update(editingReport.id, {
          ...payload,
          archiveCurrentAsPrevious: true
        });
      } else {
        await api.patients.addReport(patient.id, payload);
      }

      setIsFormOpen(false);
      setEditingReport(null);
      onRefresh();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to save report result');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteReport = async (id: string) => {
    try {
      await api.reports.delete(id);
      onRefresh();
    } catch (err) {
      console.warn('Error deleting report:', err);
    }
  };

  const handleDeletePreviousSnapshot = async (parentReport: PatientTestReport, snapshotId: string) => {
    try {
      const updatedPrev = (parentReport.previousResults || []).filter(p => p.id !== snapshotId);
      await api.reports.update(parentReport.id, {
        previousResults: updatedPrev,
        archiveCurrentAsPrevious: false
      } as any);
      onRefresh();
    } catch (err) {
      console.warn('Error deleting previous snapshot:', err);
    }
  };

  // Filtered reports
  const filteredReports = reports.filter(r => {
    if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
    if (statusFilter === 'completed' && r.status !== 'completed') return false;
    if (statusFilter === 'pending' && r.status !== 'pending') return false;
    if (
      statusFilter === 'flagged' &&
      r.resultFlag !== 'abnormal' &&
      r.resultFlag !== 'positive' &&
      r.resultFlag !== 'critical'
    ) {
      return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const inName = r.testName.toLowerCase().includes(q);
      const inVal = r.resultValue?.toLowerCase().includes(q);
      const inNotes = r.clinicalNotes?.toLowerCase().includes(q);
      const inLab = r.labName?.toLowerCase().includes(q);
      const inCat = r.category.toLowerCase().includes(q);
      const inPrev = (r.previousResults || []).some(
        pr =>
          pr.resultValue?.toLowerCase().includes(q) ||
          pr.clinicalNotes?.toLowerCase().includes(q) ||
          pr.labName?.toLowerCase().includes(q)
      );
      return inName || inVal || inNotes || inLab || inCat || inPrev;
    }

    return true;
  });

  // Flatten all stored previous reports for the "Previous Reports Archive" view
  const allPreviousRecords: {
    parentReport: PatientTestReport;
    snapshot: HistoricalReportSnapshot;
  }[] = [];

  filteredReports.forEach(rep => {
    if (rep.previousResults && rep.previousResults.length > 0) {
      rep.previousResults.forEach(snap => {
        allPreviousRecords.push({ parentReport: rep, snapshot: snap });
      });
    }
    if (rep.isPreviousReport) {
      allPreviousRecords.push({
        parentReport: rep,
        snapshot: {
          id: rep.id,
          orderedDate: rep.orderedDate,
          reportDate: rep.reportDate,
          resultFlag: rep.resultFlag,
          resultValue: rep.resultValue,
          unit: rep.unit,
          referenceRange: rep.referenceRange,
          specimenType: rep.specimenType,
          labName: rep.labName,
          orderedByDoctor: rep.orderedByDoctor,
          clinicalNotes: rep.clinicalNotes,
          attachmentUrl: rep.attachmentUrl,
          attachmentName: rep.attachmentName,
          archivedAt: rep.createdAt
        }
      });
    }
  });

  allPreviousRecords.sort(
    (a, b) =>
      new Date(b.snapshot.reportDate || b.snapshot.orderedDate).getTime() -
      new Date(a.snapshot.reportDate || a.snapshot.orderedDate).getTime()
  );

  const totalPreviousStoredCount = reports.reduce(
    (acc, r) => acc + (r.previousResults?.length || 0) + (r.isPreviousReport ? 1 : 0),
    0
  );
  const totalAllStoredCount =
    reports.length + reports.reduce((acc, r) => acc + (r.previousResults?.length || 0), 0);
  const completedCount = reports.filter(r => r.status === 'completed').length;
  const flaggedCount = reports.filter(
    r => r.resultFlag === 'abnormal' || r.resultFlag === 'positive' || r.resultFlag === 'critical'
  ).length;

  const getFlagBadge = (flag: TestResultFlag, statusVal: TestReportStatus = 'completed') => {
    if (statusVal === 'pending' || flag === 'pending') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
          <Clock className="w-3 h-3" />
          Pending Result
        </span>
      );
    }
    switch (flag) {
      case 'normal':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Normal
          </span>
        );
      case 'negative':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-50 text-teal-800 border border-teal-200">
            <CheckCircle2 className="w-3 h-3 text-teal-600" />
            Negative
          </span>
        );
      case 'abnormal':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
            <AlertTriangle className="w-3 h-3 text-amber-700" />
            Abnormal / Elevated
          </span>
        );
      case 'positive':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
            <AlertTriangle className="w-3 h-3 text-rose-600" />
            Positive Finding
          </span>
        );
      case 'critical':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-900 border border-red-300">
            <AlertTriangle className="w-3 h-3 text-red-700" />
            Critical Alert
          </span>
        );
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-150">
      {/* Top Summary Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
            TOTAL STORED REPORTS
          </span>
          <div className="text-2xl font-extrabold text-[#0f2926] mt-1">{totalAllStoredCount}</div>
          <span className="text-[11px] text-slate-500">Current + previous history</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 block">
            LATEST TEST RESULTS
          </span>
          <div className="text-2xl font-extrabold text-emerald-800 mt-1">{completedCount}</div>
          <span className="text-[11px] text-slate-500">Active clinical panels</span>
        </div>

        <div
          onClick={() => setViewMode(viewMode === 'previous_archive' ? 'all_with_history' : 'previous_archive')}
          className="bg-white p-4 rounded-2xl border border-teal-200/80 hover:border-teal-500 shadow-2xs cursor-pointer transition-colors"
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-teal-800 flex items-center gap-1">
            <History className="w-3 h-3 text-teal-600" />
            PREVIOUS REPORTS STORED
          </span>
          <div className="text-2xl font-extrabold text-teal-900 mt-1">{totalPreviousStoredCount}</div>
          <span className="text-[11px] text-teal-700 font-medium">Click to view archive</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 block">
            FLAGGED / POSITIVE
          </span>
          <div className="text-2xl font-extrabold text-rose-700 mt-1">{flaggedCount}</div>
          <span className="text-[11px] text-slate-500">Requires clinical review</span>
        </div>
      </div>

      {/* Main Toolbar Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#e3f2ef] text-[#116960] flex items-center justify-center shrink-0">
              <FlaskConical className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#0f2926]">
                Patient Diagnostic &amp; Laboratory Report Results
              </h3>
              <p className="text-xs text-slate-500">
                Current test results and permanently stored previous reports for{' '}
                <strong className="text-slate-700">{patient.fullName}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-teal-700" />
              <span>Print Reports</span>
            </button>

            <button
              type="button"
              onClick={() => openAddForm(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-teal-50 hover:bg-teal-100 border border-teal-200 text-teal-900 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              <History className="w-3.5 h-3.5 text-teal-700" />
              <span>+ Store Previous Report</span>
            </button>

            <button
              type="button"
              onClick={() => openAddForm(false)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0d4a44] hover:bg-[#093834] text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add New Report Result</span>
            </button>
          </div>
        </div>

        {/* View Switcher Tabs: All Reports (with Previous History) vs Previous Reports Archive */}
        <div className="flex items-center gap-2 pt-2 border-t border-slate-100 flex-wrap">
          <button
            type="button"
            onClick={() => setViewMode('all_with_history')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'all_with_history'
                ? 'bg-[#0d4a44] text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:text-slate-900'
            }`}
          >
            <FlaskConical className="w-3.5 h-3.5" />
            <span>Current &amp; Stored History ({reports.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('previous_archive')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'previous_archive'
                ? 'bg-[#0d4a44] text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:text-slate-900'
            }`}
          >
            <Archive className="w-3.5 h-3.5" />
            <span>Previous Reports Archive ({totalPreviousStoredCount})</span>
          </button>
        </div>

        {/* Search & Filter Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
          <div className="relative flex-1 flex items-center">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search current or previous reports by test name, result value, lab, or notes..."
              className="w-full pl-8 pr-10 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-teal-600"
            />
            <div className="absolute right-1.5">
              <VoiceDictationButton
                currentValue={searchQuery}
                onUpdate={setSearchQuery}
                size="sm"
                title="Dictate report search"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 bg-slate-50 text-slate-700 focus:outline-none focus:border-teal-600"
            >
              <option value="all">All Categories</option>
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-xs">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'completed', label: 'Completed' },
                  { id: 'pending', label: 'Pending' },
                  { id: 'flagged', label: 'Abnormal / Flagged' }
                ] as const
              ).map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setStatusFilter(opt.id)}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                    statusFilter === opt.id
                      ? 'bg-white text-teal-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Add / Edit / Store Previous Report Drawer Card */}
      {isFormOpen && (
        <form
          onSubmit={handleSaveReport}
          className="bg-white rounded-2xl border-2 border-[#116960] shadow-lg p-6 space-y-5 animate-in fade-in duration-150"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              {formMode === 'previous' ? (
                <History className="w-5 h-5 text-[#116960]" />
              ) : (
                <Microscope className="w-5 h-5 text-[#116960]" />
              )}
              <div>
                <h4 className="text-sm font-extrabold text-[#0f2926]">
                  {formMode === 'previous'
                    ? 'Store Previous / Historical Report Result'
                    : formMode === 'repeat' && editingReport
                    ? `Log Repeat Test Result for ${editingReport.testName} (Previous Result Auto-Stored)`
                    : formMode === 'edit' && editingReport
                    ? `Update Report Result: ${editingReport.testName}`
                    : 'Record New Test / Report Result'}
                </h4>
                <p className="text-[11px] text-slate-500">
                  {formMode === 'previous'
                    ? 'Store a past lab or diagnostic report into the patient’s permanent historical report archive.'
                    : 'If a previous report exists for this test, it will automatically be preserved in Previous Stored Reports.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {formError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">
              {formError}
            </div>
          )}

          {/* Quick-Select Preset Dermatology & Lab Tests */}
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
              Quick-Select Common Clinical &amp; Dermatology Tests:
            </span>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 bg-slate-50 rounded-xl border border-slate-200/80">
              {PREDEFINED_TESTS.slice(0, 18).map(tName => (
                <button
                  key={tName}
                  type="button"
                  onClick={() => autoFillTestDefaults(tName)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
                    testName === tName
                      ? 'bg-[#0d4a44] text-white border-[#0d4a44]'
                      : 'bg-white hover:bg-teal-50 text-slate-700 border-slate-200'
                  }`}
                >
                  {tName}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Test Name */}
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                Test / Investigation Name *
              </label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  required
                  value={testName}
                  onChange={e => setTestName(e.target.value)}
                  placeholder="e.g., KOH Mount (Fungal), Skin Biopsy, CBC, Serum IgE..."
                  className="w-full px-3 py-2 pr-10 text-xs rounded-xl border border-slate-300 focus:outline-none focus:border-teal-600"
                />
                <div className="absolute right-1.5">
                  <VoiceDictationButton
                    currentValue={testName}
                    onUpdate={setTestName}
                    size="sm"
                    title="Dictate test name"
                  />
                </div>
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                Report Category
              </label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value as TestReportCategory)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:border-teal-600"
              >
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Report Status */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                Completion Status
              </label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as TestReportStatus)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:border-teal-600"
              >
                <option value="completed">Completed (Result Ready)</option>
                <option value="pending">Pending (Awaiting Lab)</option>
              </select>
            </div>

            {/* Clinical Flag / Interpretation */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                Result Interpretation Flag
              </label>
              <select
                value={resultFlag}
                onChange={e => setResultFlag(e.target.value as TestResultFlag)}
                disabled={status === 'pending'}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:border-teal-600 disabled:opacity-50"
              >
                <option value="normal">Normal / Within Limits</option>
                <option value="negative">Negative</option>
                <option value="abnormal">Abnormal / Elevated</option>
                <option value="positive">Positive Finding</option>
                <option value="critical">Critical Alert</option>
              </select>
            </div>

            {/* Report Date */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                {formMode === 'previous' ? 'Previous Report Date *' : 'Report / Result Date'}
              </label>
              <input
                type="date"
                value={reportDate}
                onChange={e => {
                  setReportDate(e.target.value);
                  if (formMode === 'previous') setOrderedDate(e.target.value);
                }}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:border-teal-600"
              />
            </div>

            {/* Result Value */}
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                Result Finding / Measured Value *
              </label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={resultValue}
                  onChange={e => setResultValue(e.target.value)}
                  placeholder="e.g., Fungal hyphae detected / 168 IU/mL / Hyperkeratosis with benign margins"
                  className="w-full px-3 py-2 pr-10 text-xs rounded-xl border border-slate-300 focus:outline-none focus:border-teal-600"
                />
                <div className="absolute right-1.5">
                  <VoiceDictationButton
                    currentValue={resultValue}
                    onUpdate={setResultValue}
                    size="sm"
                    title="Dictate result finding"
                  />
                </div>
              </div>
            </div>

            {/* Unit */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                Unit (Optional)
              </label>
              <input
                type="text"
                value={unit}
                onChange={e => setUnit(e.target.value)}
                placeholder="e.g., IU/mL, mg/dL, %, mm/hr"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:border-teal-600"
              />
            </div>

            {/* Reference Range */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                Normal Reference Range
              </label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={referenceRange}
                  onChange={e => setReferenceRange(e.target.value)}
                  placeholder="e.g., < 100 IU/mL or Negative"
                  className="w-full px-3 py-2 pr-10 text-xs rounded-xl border border-slate-300 focus:outline-none focus:border-teal-600"
                />
                <div className="absolute right-1.5">
                  <VoiceDictationButton
                    currentValue={referenceRange}
                    onUpdate={setReferenceRange}
                    size="sm"
                    title="Dictate reference range"
                  />
                </div>
              </div>
            </div>

            {/* Specimen Type */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                Specimen / Sample Type
              </label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={specimenType}
                  onChange={e => setSpecimenType(e.target.value)}
                  placeholder="e.g., Skin scraping, Venous blood, 4mm Punch Biopsy"
                  className="w-full px-3 py-2 pr-10 text-xs rounded-xl border border-slate-300 focus:outline-none focus:border-teal-600"
                />
                <div className="absolute right-1.5">
                  <VoiceDictationButton
                    currentValue={specimenType}
                    onUpdate={setSpecimenType}
                    size="sm"
                    title="Dictate specimen type"
                  />
                </div>
              </div>
            </div>

            {/* Performing Lab */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                Performing Diagnostic Lab
              </label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={labName}
                  onChange={e => setLabName(e.target.value)}
                  placeholder="e.g., In-Clinic Derm Lab / Metro Pathology"
                  className="w-full px-3 py-2 pr-10 text-xs rounded-xl border border-slate-300 focus:outline-none focus:border-teal-600"
                />
                <div className="absolute right-1.5">
                  <VoiceDictationButton
                    currentValue={labName}
                    onUpdate={setLabName}
                    size="sm"
                    title="Dictate lab name"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Clinical Notes / Pathologist Remarks */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600">
                Clinical Interpretation &amp; Pathologist Remarks
              </label>
              <VoiceDictationButton
                currentValue={clinicalNotes}
                onUpdate={setClinicalNotes}
                size="sm"
                label="Dictate"
                title="Dictate clinical interpretation"
              />
            </div>
            <textarea
              rows={2}
              value={clinicalNotes}
              onChange={e => setClinicalNotes(e.target.value)}
              placeholder="Enter detailed microscopic findings, comparison with previous reports, or clinical correlation notes..."
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:border-teal-600"
            />
          </div>

          {/* Attach Report Scan / Photo */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer transition-colors">
                <Upload className="w-3.5 h-3.5 text-teal-700" />
                <span>{attachmentUrl ? 'Replace Report Scan' : 'Attach Report Scan / Image'}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAttachmentUpload}
                  className="hidden"
                />
              </label>
              {attachmentName && (
                <span className="text-xs text-teal-800 font-medium truncate max-w-[200px]">
                  {attachmentName}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 justify-end">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2 rounded-xl bg-[#0d4a44] hover:bg-[#093834] text-white text-xs font-bold shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {isSaving
                  ? 'Saving...'
                  : formMode === 'previous'
                  ? 'Store Previous Report'
                  : formMode === 'repeat'
                  ? 'Save Repeat Result & Archive Previous'
                  : formMode === 'edit'
                  ? 'Update Result (Store Previous)'
                  : 'Save Report Result'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* VIEW MODE 2: DEDICATED PREVIOUS REPORTS ARCHIVE */}
      {viewMode === 'previous_archive' ? (
        allPreviousRecords.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <Archive className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-700">No previous reports stored yet</p>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                Click &quot;+ Store Previous Report&quot; to upload past lab/biopsy reports, or log repeat test results to automatically archive earlier findings.
              </p>
            </div>
            <button
              type="button"
              onClick={() => openAddForm(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0d4a44] hover:bg-[#093834] text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
            >
              <History className="w-3.5 h-3.5" />
              <span>+ Store Previous Report</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3.5">
            {allPreviousRecords.map(({ parentReport, snapshot }) => (
              <div
                key={snapshot.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden"
              >
                <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-teal-900 text-white">
                      <History className="w-3 h-3" />
                      Stored Previous Report
                    </span>
                    <span className="font-bold text-sm text-[#0f2926]">{parentReport.testName}</span>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-slate-200/70 text-slate-700">
                      {parentReport.category}
                    </span>
                    {getFlagBadge(snapshot.resultFlag, 'completed')}
                  </div>

                  <span className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-teal-700" />
                    Report Date:{' '}
                    {new Date(snapshot.reportDate || snapshot.orderedDate).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </span>
                </div>

                <div className="p-5 space-y-3 text-xs">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        PREVIOUS STORED RESULT ({new Date(snapshot.reportDate || snapshot.orderedDate).toLocaleDateString()})
                      </span>
                      <div className="text-sm font-extrabold text-slate-800 mt-1">
                        {snapshot.resultValue}
                        {snapshot.unit ? <span className="ml-1 text-teal-800">{snapshot.unit}</span> : null}
                      </div>
                      {snapshot.clinicalNotes && (
                        <p className="text-[11px] text-slate-500 mt-1.5">{snapshot.clinicalNotes}</p>
                      )}
                    </div>

                    <div className="p-3.5 rounded-xl bg-[#f4f7f6] border border-[#dce5e3]">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#116960] block">
                        LATEST RESULT FOR COMPARISON ({new Date(parentReport.reportDate || parentReport.orderedDate).toLocaleDateString()})
                      </span>
                      <div className="text-sm font-extrabold text-[#0f2926] mt-1">
                        {parentReport.resultValue}
                        {parentReport.unit ? <span className="ml-1 text-teal-800">{parentReport.unit}</span> : null}
                      </div>
                      {parentReport.referenceRange && (
                        <p className="text-[11px] text-slate-500 mt-1.5">
                          Reference Interval: {parentReport.referenceRange}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : /* VIEW MODE 1: CURRENT REPORTS WITH EXPANDABLE STORED PREVIOUS REPORTS */
      filteredReports.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <FlaskConical className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-700">
              {reports.length === 0
                ? 'No test or diagnostic report results recorded yet'
                : 'No report results match your current filter'}
            </p>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Tests ordered during consultations automatically sync here, and all previous reports are permanently stored for longitudinal comparison.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={() => openAddForm(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-50 hover:bg-teal-100 border border-teal-200 text-teal-900 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              <History className="w-3.5 h-3.5" />
              <span>+ Store Previous Report</span>
            </button>
            <button
              type="button"
              onClick={() => openAddForm(false)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0d4a44] hover:bg-[#093834] text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add First Report Result</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredReports.map(rep => {
            const isFlagged =
              rep.resultFlag === 'abnormal' ||
              rep.resultFlag === 'positive' ||
              rep.resultFlag === 'critical';
            const prevList = rep.previousResults || [];
            const showPrevSection = isHistoryExpanded(rep.id);

            return (
              <div
                key={rep.id}
                className={`bg-white rounded-2xl border transition-all shadow-2xs overflow-hidden ${
                  isFlagged ? 'border-amber-300/90' : 'border-slate-200'
                }`}
              >
                {/* Card Header */}
                <div className="px-5 py-3.5 bg-slate-50/70 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-bold text-sm text-[#0f2926]">{rep.testName}</span>
                    <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-slate-200/70 text-slate-700">
                      {rep.category}
                    </span>
                    {getFlagBadge(rep.resultFlag, rep.status)}
                    {prevList.length > 0 && (
                      <button
                        type="button"
                        onClick={() => toggleHistoryExpand(rep.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#e3f2ef] text-[#116960] border border-[#b8dcd6] hover:bg-[#d2ebe6] transition-colors cursor-pointer"
                      >
                        <History className="w-3 h-3" />
                        <span>
                          {prevList.length} Previous {prevList.length === 1 ? 'Report' : 'Reports'} Stored
                        </span>
                        {showPrevSection ? (
                          <ChevronUp className="w-3 h-3" />
                        ) : (
                          <ChevronDown className="w-3 h-3" />
                        )}
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 self-end sm:self-center flex-wrap">
                    <button
                      type="button"
                      onClick={() => openAddForm(false, rep)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#f4f7f6] hover:bg-[#e3f2ef] text-[#0f2926] border border-[#dce5e3] text-[11px] font-semibold transition-colors cursor-pointer"
                      title="Record a new repeat test result and automatically store the current result in Previous Reports"
                    >
                      <RefreshCw className="w-3 h-3 text-[#116960]" />
                      <span>Log Repeat Result</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => openAddForm(true, rep)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-semibold transition-colors cursor-pointer"
                      title="Add an older previous report for this test"
                    >
                      <History className="w-3 h-3 text-teal-700" />
                      <span>+ Previous Report</span>
                    </button>

                    {onOpenAIWithPrompt && (
                      <button
                        type="button"
                        onClick={() =>
                          onOpenAIWithPrompt(
                            `Interpret the ${rep.testName} report result and compare with previous reports for ${patient.fullName}: Latest Result = "${rep.resultValue} ${rep.unit || ''}" (${rep.reportDate || rep.orderedDate}). Previous Stored Results = ${
                              prevList.length > 0
                                ? prevList.map(p => `"${p.resultValue}" on ${p.reportDate || p.orderedDate}`).join('; ')
                                : 'None'
                            }.`
                          )
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-900 border border-teal-200 text-[11px] font-semibold transition-colors cursor-pointer"
                        title="Ask AI Assistant to interpret this result and compare with previous reports"
                      >
                        <Sparkles className="w-3 h-3 text-teal-600" />
                        <span>AI Interpret</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => openEditForm(rep)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-semibold transition-colors cursor-pointer"
                    >
                      <Pencil className="w-3 h-3 text-teal-700" />
                      <span>{rep.status === 'pending' ? 'Enter Result' : 'Edit'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteReport(rep.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                      title="Delete report"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-5 space-y-4 text-xs">
                  {/* Result Value, Reference Range & Specimen Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div
                      className={`p-3.5 rounded-xl border ${
                        isFlagged
                          ? 'bg-amber-50/50 border-amber-200'
                          : 'bg-[#f4f7f6] border-[#dce5e3]'
                      }`}
                    >
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                        LATEST REPORT RESULT ({new Date(rep.reportDate || rep.orderedDate).toLocaleDateString()})
                      </span>
                      <div className="text-sm font-extrabold text-[#0f2926] mt-1 leading-snug">
                        {rep.resultValue || 'Pending laboratory result'}
                        {rep.unit ? <span className="ml-1 text-teal-800">{rep.unit}</span> : null}
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        REFERENCE INTERVAL / NORMAL
                      </span>
                      <div className="text-xs font-semibold text-slate-700 mt-1">
                        {rep.referenceRange || 'Standard clinical reference'}
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        SPECIMEN &amp; DIAGNOSTIC CENTER
                      </span>
                      <div className="text-xs font-semibold text-slate-700 mt-1">
                        {rep.specimenType || 'Clinical specimen'}
                      </div>
                      {rep.labName && (
                        <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate">{rep.labName}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Clinical Interpretation / Pathologist Notes */}
                  {rep.clinicalNotes && (
                    <div className="p-3 rounded-xl bg-slate-50/70 border border-slate-200/60">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                        CLINICAL INTERPRETATION &amp; REMARKS
                      </span>
                      <p className="text-xs text-slate-700 leading-relaxed">{rep.clinicalNotes}</p>
                    </div>
                  )}

                  {/* Footer Metadata & Attachment */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 text-[11px] text-slate-500">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        Ordered:{' '}
                        <strong className="text-slate-700">
                          {new Date(rep.orderedDate).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </strong>
                      </span>
                      {rep.reportDate && (
                        <>
                          <span>•</span>
                          <span>
                            Reported:{' '}
                            <strong className="text-slate-700">
                              {new Date(rep.reportDate).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric'
                              })}
                            </strong>
                          </span>
                        </>
                      )}
                      {rep.orderedByDoctor && (
                        <>
                          <span>•</span>
                          <span>
                            Ordered by:{' '}
                            <strong className="text-slate-700">
                              Dr. {rep.orderedByDoctor.replace(/^Dr\.\s*/i, '')}
                            </strong>
                          </span>
                        </>
                      )}
                    </div>

                    {rep.attachmentUrl && (
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewAttachment({
                            url: rep.attachmentUrl!,
                            title: `${rep.testName} — ${patient.fullName}`
                          })
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-900 border border-teal-200 text-xs font-semibold self-start sm:self-auto cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5 text-teal-700" />
                        <span>View Attached Report Scan</span>
                      </button>
                    )}
                  </div>

                  {/* STORED PREVIOUS REPORTS TIMELINE SECTION */}
                  {prevList.length > 0 && showPrevSection && (
                    <div className="pt-3.5 mt-2 border-t border-dashed border-slate-200 space-y-2.5 animate-in fade-in duration-150">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#116960] flex items-center gap-1.5">
                          <History className="w-3.5 h-3.5" />
                          <span>Stored Previous Reports &amp; Historical Results ({prevList.length})</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => openAddForm(true, rep)}
                          className="text-[11px] font-bold text-[#116960] hover:underline cursor-pointer"
                        >
                          + Add Earlier Report
                        </button>
                      </div>

                      <div className="space-y-2 pl-3 border-l-2 border-[#b8dcd6]">
                        {prevList.map((prev, idx) => (
                          <div
                            key={prev.id || idx}
                            className="p-3 rounded-xl bg-slate-50/90 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="px-2 py-0.5 rounded bg-slate-200/80 text-slate-700 font-bold text-[10px]">
                                  Previous #{prevList.length - idx}
                                </span>
                                <span className="font-bold text-slate-800 text-xs">
                                  {new Date(prev.reportDate || prev.orderedDate).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric'
                                  })}
                                </span>
                                {getFlagBadge(prev.resultFlag, 'completed')}
                                {prev.labName && (
                                  <span className="text-[11px] text-slate-500">· {prev.labName}</span>
                                )}
                              </div>

                              <div className="text-xs font-extrabold text-[#0f2926]">
                                Result: {prev.resultValue}
                                {prev.unit ? <span className="ml-1 text-teal-800">{prev.unit}</span> : null}
                              </div>

                              {prev.clinicalNotes && (
                                <p className="text-[11px] text-slate-500">{prev.clinicalNotes}</p>
                              )}
                            </div>

                            <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                              {prev.attachmentUrl && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPreviewAttachment({
                                      url: prev.attachmentUrl!,
                                      title: `Previous ${rep.testName} (${new Date(
                                        prev.reportDate || prev.orderedDate
                                      ).toLocaleDateString()})`
                                    })
                                  }
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-teal-800 text-[11px] font-semibold hover:bg-teal-50 cursor-pointer"
                                >
                                  <Eye className="w-3 h-3" />
                                  <span>View Scan</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDeletePreviousSnapshot(rep, prev.id)}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded"
                                title="Remove this historical snapshot"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox Modal for Attached Report Scan */}
      {previewAttachment && (
        <div
          onClick={() => setPreviewAttachment(null)}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
          >
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-teal-700" />
                <span className="text-sm font-bold text-slate-900">{previewAttachment.title}</span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewAttachment(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 flex items-center justify-center bg-slate-900">
              <img
                src={previewAttachment.url}
                alt={previewAttachment.title}
                className="max-h-[75vh] w-auto object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
