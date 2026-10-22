import React, { useState, useRef } from 'react';
import { DoctorFormularyItem } from '../types';
import { api } from '../lib/api';
import { X, Upload, FileText, Plus, CheckCircle2, Pill, Sparkles, BookOpen, FileSpreadsheet } from 'lucide-react';

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

interface ParsedCsvMedRow {
  name: string;
  dosage: string;
  route: string;
  frequency: string;
  duration: string;
  instructions: string;
  source: 'csv_upload' | 'pdf_upload' | 'manual';
}

function parseDelimitedGridClient(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  const cleanText = text.replace(/^\uFEFF/, '').replace(/\0/g, '');
  for (let i = 0; i < cleanText.length; i++) {
    const ch = cleanText[i];
    const nextCh = cleanText[i + 1];

    if (ch === '"') {
      if (inQuotes && nextCh === '"') {
        currentCell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === delimiter) {
      currentRow.push(currentCell.trim());
      currentCell = '';
      continue;
    }

    if (!inQuotes && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && nextCh === '\n') {
        i++;
      }
      currentRow.push(currentCell.trim());
      if (currentRow.some(cell => cell.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
      continue;
    }

    currentCell += ch;
  }

  currentRow.push(currentCell.trim());
  if (currentRow.some(cell => cell.length > 0)) {
    rows.push(currentRow);
  }

  return rows;
}

function inferMedRowClient(
  rawName: string,
  rawDosage = '',
  extraInstructions = '',
  explicitRoute = '',
  explicitFrequency = '',
  explicitDuration = '',
  source: 'csv_upload' | 'pdf_upload' | 'manual' = 'csv_upload'
): ParsedCsvMedRow | null {
  let cleanName = rawName.replace(/^["']|["']$/g, '').trim();
  let cleanDosage = rawDosage.replace(/^["']|["']$/g, '').trim();

  if (!cleanName || cleanName.length < 2) return null;
  if (/^(no\.?|#|s\.?no\.?|sr\.?\s*no\.?|index|id|row)$/i.test(cleanName)) return null;

  if (!cleanDosage) {
    const embeddedMatch = cleanName.match(
      /^(.+?)\s+(\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|iu|%)(?:\/[\d.]+\s*(?:mg|mcg|g|ml))?.*)$/i
    );
    if (embeddedMatch) {
      cleanName = embeddedMatch[1].trim();
      cleanDosage = embeddedMatch[2].trim();
    }
  }

  const dLower = `${cleanName} ${cleanDosage} ${extraInstructions} ${explicitRoute} ${explicitFrequency} ${explicitDuration}`.toLowerCase();
  let frequency = explicitFrequency.trim() || '1-0-1';
  if (!explicitFrequency.trim()) {
    if (dLower.includes('every 6 hours') || dLower.includes('4 times daily') || dLower.includes('qid')) {
      frequency = '1-1-1-1';
    } else if (
      dLower.includes('every 8 hours') ||
      dLower.includes('3 times daily') ||
      dLower.includes('three times daily') ||
      dLower.includes('tid') ||
      dLower.includes('tds')
    ) {
      frequency = '1-1-1';
    } else if (
      dLower.includes('every 12 hours') ||
      dLower.includes('twice daily') ||
      dLower.includes('bid') ||
      dLower.includes('bd')
    ) {
      frequency = '1-0-1';
    } else if (dLower.includes('bedtime') || dLower.includes('at night') || dLower.includes('hs')) {
      frequency = '0-0-1';
    } else if (
      dLower.includes('once daily') ||
      dLower.includes('every 24 hours') ||
      dLower.includes('od')
    ) {
      frequency = '1-0-0';
    } else if (dLower.includes('weekly') || dLower.includes('once a week')) {
      frequency = 'Once weekly';
    } else if (dLower.includes('single dose')) {
      frequency = 'Single stat dose';
    }
  }

  let duration = explicitDuration.trim() || '5 days';
  if (!explicitDuration.trim()) {
    const dayMatch = dLower.match(/for\s+(\d+(?:[–-]\d+)?\s*(?:days?|weeks?|months?))/i);
    if (dayMatch) {
      duration = dayMatch[1];
    } else if (dLower.includes('single dose')) {
      duration = '1 day';
    } else if (/topical|cream|gel|ointment|lotion|shampoo|drops/i.test(dLower)) {
      duration = '14 days';
    } else if (/antifungal|terbinafine|itraconazole|fluconazole|griseofulvin/i.test(dLower)) {
      duration = '14 days';
    } else if (/antiviral|acyclovir|valacyclovir|oseltamivir|tenofovir|entecavir/i.test(dLower)) {
      duration = '7 days';
    }
  }

  const route =
    explicitRoute.trim() ||
    (/cream|gel|ointment|lotion|shampoo|solution|spf|sunscreen|topical/i.test(dLower)
      ? 'Topical'
      : /\b(iv|im|iv\/im|infusion|injection)\b/i.test(dLower)
      ? 'IV / IM'
      : /\b(ophthalmic|drops|eye|ear|nasal)\b/i.test(dLower)
      ? 'Nasal / Drops'
      : 'Oral');

  const finalDosage = cleanDosage || 'Standard dose';
  const instructions = extraInstructions.trim() || `Standard regimen: ${finalDosage}`;

  return {
    name: cleanName,
    dosage: finalDosage,
    route,
    frequency,
    duration,
    instructions,
    source
  };
}

function parseCsvOrTextClient(rawText: string): ParsedCsvMedRow[] {
  const results: ParsedCsvMedRow[] = [];
  const cleanedText = rawText
    .replace(/^\uFEFF/, '')
    .replace(/\0/g, '')
    .replace(/^sep=.+\r?\n/i, '')
    .trim();

  if (!cleanedText) return results;

  // Check if JSON array
  if (cleanedText.startsWith('[')) {
    try {
      const arr = JSON.parse(cleanedText);
      if (Array.isArray(arr)) {
        for (const it of arr) {
          const row = inferMedRowClient(
            String(it.name || it.medicineName || it.medication || it.drug || ''),
            String(it.dosage || it.dose || it.strength || ''),
            String(it.instructions || it.notes || ''),
            String(it.route || ''),
            String(it.frequency || ''),
            String(it.duration || ''),
            'csv_upload'
          );
          if (row) results.push(row);
        }
        if (results.length > 0) return results;
      }
    } catch {
      // continue to CSV/text parsing
    }
  }

  const lines = cleanedText
    .split(/\r\n|\n|\r/)
    .map(l => l.trim())
    .filter(Boolean);

  // Inspect first 10 non-empty lines to detect best delimiter
  const sampleLines = lines.slice(0, 10);
  let delimiter: string | null = null;
  if (sampleLines.some(l => l.includes('\t'))) {
    delimiter = '\t';
  } else if (sampleLines.some(l => l.includes('|'))) {
    delimiter = '|';
  } else if (
    sampleLines.some(l => l.includes(';')) &&
    sampleLines.reduce((acc, l) => acc + (l.split(';').length - 1), 0) >
      sampleLines.reduce((acc, l) => acc + (l.split(',').length - 1), 0)
  ) {
    delimiter = ';';
  } else if (sampleLines.some(l => l.includes(','))) {
    delimiter = ',';
  }

  if (delimiter) {
    const grid = parseDelimitedGridClient(cleanedText, delimiter);
    if (grid.length > 0) {
      // Find header row within the first 3 rows (in case row 0 is a document title)
      let headerRowIndex = -1;
      let nameIdx = -1;
      let dosageIdx = -1;
      let routeIdx = -1;
      let freqIdx = -1;
      let durIdx = -1;
      let instrIdx = -1;

      for (let r = 0; r < Math.min(3, grid.length); r++) {
        const candidate = grid[r].map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
        const hasHeaderKeyword = candidate.some(
          h =>
            h.includes('medicin') ||
            h.includes('medicat') ||
            h.includes('drug') ||
            h.includes('brand') ||
            h.includes('generic') ||
            h === 'name' ||
            h.includes('itemname') ||
            h.includes('product') ||
            h.includes('dosage') ||
            h.includes('dose') ||
            h.includes('strength') ||
            h.includes('posology') ||
            h.includes('regimen') ||
            h.includes('frequency')
        );
        if (hasHeaderKeyword) {
          headerRowIndex = r;
          candidate.forEach((h, idx) => {
            if (
              nameIdx === -1 &&
              (h.includes('medicin') ||
                h.includes('medicat') ||
                h.includes('drug') ||
                h.includes('brand') ||
                h.includes('generic') ||
                h === 'name' ||
                h.includes('nameof') ||
                h.includes('item') ||
                h.includes('product') ||
                h === 'rx')
            ) {
              nameIdx = idx;
            } else if (
              dosageIdx === -1 &&
              (h.includes('dosage') ||
                h.includes('dose') ||
                h.includes('strength') ||
                h.includes('posology') ||
                h.includes('regimen') ||
                h === 'mg' ||
                h.includes('conc'))
            ) {
              dosageIdx = idx;
            } else if (
              routeIdx === -1 &&
              (h.includes('route') || h.includes('form') || h.includes('mode') || h === 'type')
            ) {
              routeIdx = idx;
            } else if (
              freqIdx === -1 &&
              (h.includes('freq') || h.includes('schedule') || h.includes('timing'))
            ) {
              freqIdx = idx;
            } else if (
              durIdx === -1 &&
              (h.includes('durat') || h === 'days' || h.includes('course') || h.includes('period'))
            ) {
              durIdx = idx;
            } else if (
              instrIdx === -1 &&
              (h.includes('instruct') ||
                h.includes('note') ||
                h.includes('remark') ||
                h.includes('direct') ||
                h === 'sig' ||
                h.includes('advice'))
            ) {
              instrIdx = idx;
            }
          });

          // If header row was detected (e.g. via "Dosage") but nameIdx wasn't matched, pick first non-index column
          if (nameIdx === -1) {
            const firstNonIndex = candidate.findIndex(
              (h, idx) =>
                idx !== dosageIdx &&
                idx !== routeIdx &&
                idx !== freqIdx &&
                idx !== durIdx &&
                idx !== instrIdx &&
                !/^(no|sno|srno|id|index|row)$/.test(h)
            );
            if (firstNonIndex !== -1) nameIdx = firstNonIndex;
          }
          break;
        }
      }

      const startRow = headerRowIndex !== -1 ? headerRowIndex + 1 : 0;
      for (let r = startRow; r < grid.length; r++) {
        const rawRow = grid[r].map(c => c.replace(/^["']|["']$/g, '').trim());
        if (rawRow.every(c => !c)) continue;

        if (headerRowIndex !== -1 && nameIdx !== -1) {
          const medName = rawRow[nameIdx] || '';
          const medDose =
            dosageIdx !== -1
              ? rawRow[dosageIdx] || ''
              : rawRow.find((_, idx) => idx !== nameIdx && idx > nameIdx) || '';
          const routeVal = routeIdx !== -1 ? rawRow[routeIdx] || '' : '';
          const freqVal = freqIdx !== -1 ? rawRow[freqIdx] || '' : '';
          const durVal = durIdx !== -1 ? rawRow[durIdx] || '' : '';
          const instrVal = instrIdx !== -1 ? rawRow[instrIdx] || '' : '';
          const inferred = inferMedRowClient(
            medName,
            medDose,
            instrVal,
            routeVal,
            freqVal,
            durVal,
            'csv_upload'
          );
          if (inferred) results.push(inferred);
        } else {
          // Positional CSV row (strip leading row number like "1" or "1.")
          const cols =
            /^\d{1,5}\.?$/.test(rawRow[0]) && rawRow.length > 1 ? rawRow.slice(1) : rawRow;
          const firstCol = cols[0] || '';
          if (!firstCol || firstCol.length < 2) continue;
          if (/^(no\.?|#|s\.?no|medicine\s*name|drug\s*name|medication|medicine|name)$/i.test(firstCol)) {
            continue;
          }

          if (cols.length >= 2) {
            const [medName, medDose, freqCol, durCol, instrCol] = cols;
            const inferred = inferMedRowClient(
              medName,
              medDose || '',
              instrCol || '',
              '',
              freqCol || '',
              durCol || '',
              'csv_upload'
            );
            if (inferred) results.push(inferred);
          } else if (cols.length === 1) {
            const dashMatch = firstCol.match(
              /^([A-Za-z0-9\s()/+-]{2,65}?)\s*(?:[-–—:]|\s{2,})\s*(.+)$/
            );
            const inferred = dashMatch
              ? inferMedRowClient(dashMatch[1], dashMatch[2], '', '', '', '', 'csv_upload')
              : inferMedRowClient(firstCol, '', '', '', '', '', 'csv_upload');
            if (inferred) results.push(inferred);
          }
        }
      }
    }
  }

  // Fallback line-by-line parser if delimiter parser yielded 0 rows
  if (results.length === 0) {
    for (const line of lines) {
      if (
        /^(no\.?|#|s\.?no|medicine\s*name|drug\s*name|medication|medicine|name)\b/i.test(line) &&
        /dosage|dose|strength|frequency/i.test(line)
      ) {
        continue;
      }
      const cleanLine = line.replace(/^\d{1,5}[.)]\s*/, '').trim();
      if (!cleanLine || cleanLine.length < 2) continue;

      const dashMatch = cleanLine.match(
        /^([A-Za-z0-9\s()/+-]{2,65}?)\s*(?:[-–—:]|\s{2,})\s*(.+)$/
      );
      if (dashMatch) {
        const inferred = inferMedRowClient(dashMatch[1], dashMatch[2], '', '', '', '', 'csv_upload');
        if (inferred) results.push(inferred);
      } else {
        const inferred = inferMedRowClient(cleanLine, '', '', '', '', '', 'csv_upload');
        if (inferred) results.push(inferred);
      }
    }
  }

  return results;
}

function decodeArrayBufferToText(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(buffer);
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(buffer);
  }
  const utf8Text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  return utf8Text.replace(/\0/g, '');
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
    parsedRows?: ParsedCsvMedRow[];
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
    const isPdf = lowerName.endsWith('.pdf') || file.type === 'application/pdf';

    const dataUrlReader = new FileReader();
    dataUrlReader.onload = () => {
      const dataUrl = typeof dataUrlReader.result === 'string' ? dataUrlReader.result : '';
      if (!isPdf) {
        // Read any non-PDF file (CSV, TSV, TXT, JSON, Excel text export, even unknown MIME types) as ArrayBuffer
        const bufferReader = new FileReader();
        bufferReader.onload = () => {
          const textContent =
            bufferReader.result instanceof ArrayBuffer
              ? decodeArrayBufferToText(bufferReader.result)
              : '';
          const parsedRows = parseCsvOrTextClient(textContent);

          setSelectedFile({
            name: file.name,
            dataUrl,
            textContent,
            parsedRows,
            size: file.size
          });
        };
        bufferReader.onerror = () => {
          setSelectedFile({
            name: file.name,
            dataUrl,
            size: file.size
          });
        };
        bufferReader.readAsArrayBuffer(file);
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
      const clientParsedItems =
        mode === 'upload'
          ? selectedFile?.parsedRows && selectedFile.parsedRows.length > 0
            ? selectedFile.parsedRows
            : undefined
          : parseCsvOrTextClient(rawText);

      const res = await api.formulary.importData({
        fileDataUrl: mode === 'upload' ? selectedFile?.dataUrl : undefined,
        filename: mode === 'upload' ? selectedFile?.name : undefined,
        rawText: mode === 'paste' ? rawText : selectedFile?.textContent,
        items: clientParsedItems && clientParsedItems.length > 0 ? clientParsedItems : undefined
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
                Upload CSV/PDF drug formularies or add custom medicines for instant auto-lookup while typing
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
              {/* Native label + unrestricted file input so no OS file dialog ever greys out .csv files */}
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
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="w-11 h-11 rounded-2xl bg-teal-100 text-teal-800 flex items-center justify-center mx-auto mb-3">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <p className="text-xs font-bold text-slate-800">
                  {selectedFile
                    ? `Selected: ${selectedFile.name} (${(selectedFile.size / 1024).toFixed(1)} KB)`
                    : 'Click or Drag & Drop any CSV (.csv), PDF (.pdf), TXT, or JSON File'}
                </p>
                {selectedFile && selectedFile.parsedRows && selectedFile.parsedRows.length > 0 && (
                  <p className="text-[11px] font-bold text-teal-700 mt-1">
                    Ready to import — {selectedFile.parsedRows.length} medication{selectedFile.parsedRows.length === 1 ? '' : 's'} parsed from CSV/text file
                  </p>
                )}
                <p className="text-[11px] text-slate-500 mt-1 mb-3">
                  All CSV files (.csv), PDF tables (.pdf), TSV, and text lists are supported without file-picker restrictions
                </p>
                <div className="flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-teal-800 hover:bg-teal-900 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{selectedFile ? 'Choose Another CSV / PDF File' : 'Browse CSV / PDF File'}</span>
                  </button>
                </div>
              </div>

              {/* Instant Preview of Parsed CSV Medications */}
              {selectedFile && selectedFile.parsedRows && selectedFile.parsedRows.length > 0 && (
                <div className="border border-teal-200 bg-teal-50/30 rounded-xl overflow-hidden">
                  <div className="px-3 py-2 bg-teal-100/60 border-b border-teal-200 flex items-center justify-between text-[11px] font-bold text-teal-900">
                    <span>Preview ({selectedFile.parsedRows.length} medications ready to import)</span>
                    <span className="text-[10px] font-semibold text-teal-700">Auto-mapped columns</span>
                  </div>
                  <div className="max-h-36 overflow-y-auto divide-y divide-teal-100 text-[11px]">
                    {selectedFile.parsedRows.slice(0, 25).map((m, idx) => (
                      <div key={idx} className="px-3 py-1.5 flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-800 truncate">{m.name}</span>
                        <span className="text-teal-800 font-medium truncate shrink-0">
                          {m.dosage} · {m.frequency}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
                  placeholder={`Examples:\nAmoxicillin + Clavulanate, 625 mg, Oral, 1-0-1, 7 days, After food\nCefpodoxime Proxetil - 200 mg orally every 12 hours for 7 days\nTacrolimus 0.1% Ointment | Apply thin layer | 1-0-1 | 14 days | Apply on affected plaques`}
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
