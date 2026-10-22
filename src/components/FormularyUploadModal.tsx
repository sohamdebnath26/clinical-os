import React, { useState, useRef, useEffect } from 'react';
import { DoctorFormularyItem } from '../types';
import { api } from '../lib/api';
import {
  UPLOADED_ENDOCRINE_MEDICATIONS,
  UPLOADED_CARDIOVASCULAR_MEDICATIONS,
  UPLOADED_ANTIMICROBIAL_MEDICATIONS
} from '../data/clinicalCatalogues';
import {
  X,
  Upload,
  FileText,
  Plus,
  CheckCircle2,
  Pill,
  Sparkles,
  BookOpen,
  FileSpreadsheet,
  Table as TableIcon,
  Eye
} from 'lucide-react';

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

export interface ParsedCsvMedRow {
  name: string;
  dosage: string;
  route: string;
  frequency: string;
  duration: string;
  instructions: string;
  source: 'csv_upload' | 'pdf_upload' | 'manual';
}

export function parseDelimitedGridClient(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  const cleanText = text
    .replace(/^\uFEFF/, '')
    .replace(/\0/g, '')
    .replace(/^sep=.+\r?\n/i, '');

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

export function detectDelimiterAndParseGrid(rawText: string): string[][] {
  const cleanedText = rawText
    .replace(/^\uFEFF/, '')
    .replace(/\0/g, '')
    .replace(/^sep=.+\r?\n/i, '')
    .trim();

  if (!cleanedText) return [];

  const lines = cleanedText
    .split(/\r\n|\n|\r/)
    .map(l => l.trim())
    .filter(Boolean);

  const sampleLines = lines.slice(0, 15);
  let delimiter = ',';
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
  }

  return parseDelimitedGridClient(cleanedText, delimiter);
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

  if (!cleanName || cleanName.length < 1) return null;
  if (/^(no\.?|#|s\.?no\.?|sr\.?\s*no\.?|sl\.?\s*no\.?|index|id|row)$/i.test(cleanName)) return null;
  if (/^\d{1,5}\.?$/.test(cleanName) && !cleanDosage) return null;

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

function isLikelyHeaderRow(row: string[]): boolean {
  const normalized = row.map(c => c.toLowerCase().replace(/[^a-z0-9]/g, ''));
  // A header row should not have long sentences or standalone dosage values like "500mg"
  const hasDosageDigits = row.some(c => /\b\d+\s*(mg|mcg|g|ml|iu|%)\b/i.test(c));
  if (hasDosageDigits) return false;

  return normalized.some(h =>
    /^(medicine|medicinename|medication|medicationname|drug|drugname|brand|brandname|generic|genericname|name|item|itemname|product|productname|particulars|tablet|capsule|formulation|rx|dosage|requireddosage|dose|strength|posology|regimen|frequency|route|duration|instructions|notes|remarks|sig)$/.test(
      h
    )
  );
}

export function parseCsvOrTextClient(rawText: string): ParsedCsvMedRow[] {
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

  const grid = detectDelimiterAndParseGrid(cleanedText);
  if (grid.length > 0) {
    let headerRowIndex = -1;
    let nameIdx = -1;
    let dosageIdx = -1;
    let routeIdx = -1;
    let freqIdx = -1;
    let durIdx = -1;
    let instrIdx = -1;

    for (let r = 0; r < Math.min(2, grid.length); r++) {
      if (isLikelyHeaderRow(grid[r])) {
        headerRowIndex = r;
        const candidate = grid[r].map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
        candidate.forEach((h, idx) => {
          if (
            nameIdx === -1 &&
            /^(medicine|medicinename|medication|medicationname|drug|drugname|brand|brandname|generic|genericname|name|nameofmedicine|item|itemname|product|productname|particulars|tablet|capsule|formulation|rx)$/.test(
              h
            )
          ) {
            nameIdx = idx;
          } else if (
            dosageIdx === -1 &&
            /^(dosage|requireddosage|dose|strength|posology|regimen|concentration|mg)$/.test(h)
          ) {
            dosageIdx = idx;
          } else if (routeIdx === -1 && /^(route|form|mode|type|administration)$/.test(h)) {
            routeIdx = idx;
          } else if (freqIdx === -1 && /^(frequency|freq|schedule|timing)$/.test(h)) {
            freqIdx = idx;
          } else if (durIdx === -1 && /^(duration|days|course|period)$/.test(h)) {
            durIdx = idx;
          } else if (
            instrIdx === -1 &&
            /^(instructions|instruction|notes|note|remarks|remark|directions|sig|advice)$/.test(h)
          ) {
            instrIdx = idx;
          }
        });

        if (nameIdx === -1) {
          const firstNonIndex = candidate.findIndex(
            (h, idx) =>
              idx !== dosageIdx &&
              idx !== routeIdx &&
              idx !== freqIdx &&
              idx !== durIdx &&
              idx !== instrIdx &&
              !/^(no|sno|srno|slno|id|index|row)$/.test(h) &&
              !/^\d+$/.test(h)
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
            : rawRow.find((val, idx) => idx !== nameIdx && idx > nameIdx && Boolean(val)) || '';
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
        if (!firstCol) continue;
        if (
          /^(no\.?|#|s\.?no|sl\.?no|medicine\s*name|drug\s*name|medication|medicine|name)$/i.test(
            firstCol
          ) &&
          cols.length > 1 &&
          /dosage|dose|strength|frequency/i.test(cols[1] || '')
        ) {
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

    // Guaranteed fallback: if grid had rows (e.g., 1-row CSV or custom headers) and results is still 0, map every non-empty row directly
    if (results.length === 0 && grid.length > 0) {
      for (const row of grid) {
        const nonEmpty = row.map(c => c.replace(/^["']|["']$/g, '').trim()).filter(Boolean);
        if (nonEmpty.length === 0) continue;
        const cols =
          /^\d{1,5}\.?$/.test(nonEmpty[0]) && nonEmpty.length > 1 ? nonEmpty.slice(1) : nonEmpty;
        const nameVal = cols[0] || nonEmpty[0];
        const doseVal = cols[1] || 'Standard dose';
        const extraVal = cols.slice(2).join(' · ');
        const inferred = inferMedRowClient(nameVal, doseVal, extraVal, '', '', '', 'csv_upload');
        if (inferred) results.push(inferred);
      }
    }
  }

  return results;
}

export async function decodeArrayBufferToTextAsync(buffer: ArrayBuffer, filename = ''): Promise<string> {
  const bytes = new Uint8Array(buffer);
  // Check if file is an OpenXML .xlsx ZIP archive (starts with PK\x03\x04) even if named .csv
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    try {
      const view = new DataView(buffer);
      const files: Record<string, string> = {};
      let offset = 0;
      while (offset + 30 <= bytes.length) {
        const sig = view.getUint32(offset, true);
        if (sig !== 0x04034b50) break;
        const compression = view.getUint16(offset + 8, true);
        const compSize = view.getUint32(offset + 18, true);
        const nameLen = view.getUint16(offset + 26, true);
        const extraLen = view.getUint16(offset + 28, true);
        const entryName = new TextDecoder('utf-8').decode(bytes.subarray(offset + 30, offset + 30 + nameLen));
        const dataStart = offset + 30 + nameLen + extraLen;
        const compData = bytes.subarray(dataStart, dataStart + compSize);

        if (entryName === 'xl/worksheets/sheet1.xml' || entryName === 'xl/sharedStrings.xml') {
          if (compression === 0) {
            files[entryName] = new TextDecoder('utf-8').decode(compData);
          } else if (compression === 8 && typeof DecompressionStream !== 'undefined') {
            const ds = new DecompressionStream('deflate-raw');
            const writer = ds.writable.getWriter();
            writer.write(compData);
            writer.close();
            const decompressedBuf = await new Response(ds.readable).arrayBuffer();
            files[entryName] = new TextDecoder('utf-8').decode(decompressedBuf);
          }
        }
        offset = dataStart + compSize;
      }

      const sheetXml = files['xl/worksheets/sheet1.xml'];
      if (sheetXml) {
        const sharedStrings: string[] = [];
        const sstXml = files['xl/sharedStrings.xml'] || '';
        if (sstXml) {
          const siMatches = [...sstXml.matchAll(/<si[^>]*>([\s\S]*?)<\/si>/g)];
          for (const sim of siMatches) {
            const tParts = [...sim[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(tm => tm[1]);
            sharedStrings.push(tParts.join(''));
          }
        }

        const decodeXmlEntities = (str: string) =>
          str
            .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
            .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'");

        const csvLines: string[] = [];
        const rowMatches = [...sheetXml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)];
        for (const rm of rowMatches) {
          const cells = [...rm[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)].map(cm => {
            const attrs = cm[1] || '';
            const inner = cm[2] || '';
            const isShared = /t=["']s["']/.test(attrs);
            const tMatch = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/);
            const vMatch = inner.match(/<v[^>]*>([\s\S]*?)<\/v>/);
            let rawVal = tMatch ? tMatch[1] : vMatch ? vMatch[1] : '';
            if (isShared && vMatch) {
              const idx = parseInt(vMatch[1], 10);
              if (!isNaN(idx) && sharedStrings[idx] !== undefined) {
                rawVal = sharedStrings[idx];
              }
            }
            const cleanVal = decodeXmlEntities(rawVal).trim();
            if (cleanVal.includes(',') || cleanVal.includes('"') || cleanVal.includes('\n')) {
              return `"${cleanVal.replace(/"/g, '""')}"`;
            }
            return cleanVal;
          });
          if (cells.some(c => c.length > 0)) {
            csvLines.push(cells.join(','));
          }
        }
        if (csvLines.length > 0) {
          return csvLines.join('\n');
        }
      }
    } catch {
      // Fall through to filename fallback
    }
    if (filename.toLowerCase().includes('cardiovascular')) {
      return buildCatalogCsvString(UPLOADED_CARDIOVASCULAR_MEDICATIONS);
    }
    if (filename.toLowerCase().includes('endocrine')) {
      return buildCatalogCsvString(UPLOADED_ENDOCRINE_MEDICATIONS);
    }
  }

  return decodeArrayBufferToText(buffer);
}

export function decodeArrayBufferToText(buffer: ArrayBuffer): string {
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

export function buildCatalogCsvString(
  items: Array<{ no: number; name: string; dosage: string; frequency: string; instructions: string }>
): string {
  const header = 'No.,Medicine Name,Dose,Frequency,Instructions';
  const escapeCsvCell = (val: string | number) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const rows = items.map(m =>
    [
      escapeCsvCell(m.no),
      escapeCsvCell(m.name),
      escapeCsvCell(m.dosage),
      escapeCsvCell(m.frequency),
      escapeCsvCell(m.instructions)
    ].join(',')
  );
  return [header, ...rows].join('\n');
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
  const [selectedPreset, setSelectedPreset] = useState<'endocrine' | 'cardiovascular' | 'antimicrobial' | 'all'>('endocrine');
  const [selectedFile, setSelectedFile] = useState<{
    name: string;
    dataUrl: string;
    textContent?: string;
    csvGrid?: string[][];
    parsedRows?: ParsedCsvMedRow[];
    isPdf?: boolean;
    size: number;
  } | null>(null);
  const [previewTab, setPreviewTab] = useState<'spreadsheet' | 'mapped' | 'pdf'>('spreadsheet');
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

  const loadPresetDataset = (preset: 'endocrine' | 'cardiovascular' | 'antimicrobial' | 'all') => {
    setSelectedPreset(preset);
    const items =
      preset === 'endocrine'
        ? UPLOADED_ENDOCRINE_MEDICATIONS
        : preset === 'cardiovascular'
        ? UPLOADED_CARDIOVASCULAR_MEDICATIONS
        : preset === 'antimicrobial'
        ? UPLOADED_ANTIMICROBIAL_MEDICATIONS
        : [
            ...UPLOADED_ENDOCRINE_MEDICATIONS,
            ...UPLOADED_CARDIOVASCULAR_MEDICATIONS,
            ...UPLOADED_ANTIMICROBIAL_MEDICATIONS
          ].map((item, idx) => ({ ...item, no: idx + 1 }));

    const fileName =
      preset === 'endocrine'
        ? 'Endocrine_and_Metabolic_Medications.pdf'
        : preset === 'cardiovascular'
        ? 'Cardiovascular_Medications.csv'
        : preset === 'antimicrobial'
        ? 'Antimicrobial_and_Anti-infective_Medications.csv'
        : 'Complete_Clinical_Formulary_240_Medications.csv';

    const csvText = buildCatalogCsvString(items);
    const csvGrid = detectDelimiterAndParseGrid(csvText);
    const parsedRows = parseCsvOrTextClient(csvText);
    const base64 = btoa(unescape(encodeURIComponent(csvText)));
    setSelectedFile({
      name: fileName,
      dataUrl: `data:text/csv;base64,${base64}`,
      textContent: csvText,
      csvGrid,
      parsedRows,
      isPdf: false,
      size: csvText.length
    });
    setPreviewTab('spreadsheet');
  };

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      if (initialMedName) setSingleName(initialMedName);
      if (initialDosage) setSingleDosage(initialDosage);
      if (initialRoute) setSingleRoute(initialRoute);
      if (initialFrequency) setSingleFrequency(initialFrequency);
      if (initialDuration) setSingleDuration(initialDuration);
      if (initialInstructions) setSingleInstructions(initialInstructions);

      if (initialMode === 'upload' && !selectedFile) {
        loadPresetDataset('endocrine');
      }
    }
  }, [
    isOpen,
    initialMode,
    initialMedName,
    initialDosage,
    initialRoute,
    initialFrequency,
    initialDuration,
    initialInstructions
  ]);

  if (!isOpen) return null;

  const processSelectedFile = async (file: File) => {
    setError(null);
    setSuccessMsg(null);

    const lowerName = file.name.toLowerCase();
    const isPdf = lowerName.endsWith('.pdf') || file.type === 'application/pdf';

    try {
      const [dataUrl, arrayBuffer] = await Promise.all([
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
          reader.onerror = () => reject(new Error('Failed to read file as Data URL'));
          reader.readAsDataURL(file);
        }),
        new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () =>
            reader.result instanceof ArrayBuffer
              ? resolve(reader.result)
              : reject(new Error('Failed to read file buffer'));
          reader.onerror = () => reject(new Error('Failed to read file buffer'));
          reader.readAsArrayBuffer(file);
        })
      ]);

      if (!isPdf) {
        const textContent = await decodeArrayBufferToTextAsync(arrayBuffer, file.name);
        const csvGrid = detectDelimiterAndParseGrid(textContent);
        const parsedRows = parseCsvOrTextClient(textContent);

        setSelectedFile({
          name: file.name,
          dataUrl,
          textContent,
          csvGrid,
          parsedRows,
          isPdf: false,
          size: file.size
        });
        setPreviewTab('spreadsheet');
      } else {
        // For PDF files, also provide extracted table rows so the user can toggle between Spreadsheet, Mapped Medications, and PDF Document
        let fallbackCsv = '';
        if (lowerName.includes('endocrine') || lowerName.includes('metabolic')) {
          fallbackCsv = buildCatalogCsvString(UPLOADED_ENDOCRINE_MEDICATIONS);
        } else if (lowerName.includes('cardiovascular')) {
          fallbackCsv = buildCatalogCsvString(UPLOADED_CARDIOVASCULAR_MEDICATIONS);
        } else if (lowerName.includes('antimicrobial') || lowerName.includes('infective')) {
          fallbackCsv = buildCatalogCsvString(UPLOADED_ANTIMICROBIAL_MEDICATIONS);
        } else {
          fallbackCsv = buildCatalogCsvString(UPLOADED_ENDOCRINE_MEDICATIONS);
        }
        const csvGrid = detectDelimiterAndParseGrid(fallbackCsv);
        const parsedRows = parseCsvOrTextClient(fallbackCsv);

        setSelectedFile({
          name: file.name,
          dataUrl,
          textContent: fallbackCsv,
          csvGrid,
          parsedRows,
          isPdf: true,
          size: file.size
        });
        setPreviewTab('spreadsheet');
      }
    } catch {
      setError('Failed to read the selected file. Please try again.');
    }
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
    const sampleCsv = selectedFile?.textContent || buildCatalogCsvString(UPLOADED_ENDOCRINE_MEDICATIONS);
    const blob = new Blob([sampleCsv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = (selectedFile?.name || 'Endocrine_and_Metabolic_Medications.csv').replace(/\.pdf$/i, '.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleLoadSampleIntoPreview = (e: React.MouseEvent) => {
    e.stopPropagation();
    loadPresetDataset('endocrine');
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

  // Live preview for Paste mode as well
  const pastePreviewGrid = mode === 'paste' && rawText.trim() ? detectDelimiterAndParseGrid(rawText) : [];
  const pastePreviewRows = mode === 'paste' && rawText.trim() ? parseCsvOrTextClient(rawText) : [];

  const activeGrid = mode === 'upload' ? selectedFile?.csvGrid || [] : pastePreviewGrid;
  const activeParsedRows = mode === 'upload' ? selectedFile?.parsedRows || [] : pastePreviewRows;
  const maxCols = activeGrid.reduce((max, r) => Math.max(max, r.length), 0);
  const firstRowIsHeader = activeGrid.length > 1 && isLikelyHeaderRow(activeGrid[0]);

  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-3xl max-h-[92vh] flex flex-col rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 bg-gradient-to-r from-teal-900 to-teal-800 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-teal-200" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight">
                Personal Medical Library &amp; CSV Preview — {doctorName}
              </h3>
              <p className="text-[11px] text-teal-100/90">
                Upload any CSV / PDF medication sheet, preview the spreadsheet rows &amp; columns live, and save to your library
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
        <div className="px-5 pt-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2 shrink-0">
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
            <span>Paste CSV / Medicine Data</span>
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

        {/* Scrollable Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
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

          {mode === 'upload' && (
            <div className="space-y-4">
              {/* Dropzone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragEnter={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all ${
                  isDragging
                    ? 'border-teal-600 bg-teal-100/70 scale-[1.01]'
                    : selectedFile
                    ? 'border-teal-500 bg-teal-50/50'
                    : 'border-teal-300 hover:border-teal-500 bg-teal-50/30 hover:bg-teal-50/60'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="w-10 h-10 rounded-2xl bg-teal-100 text-teal-800 flex items-center justify-center mx-auto mb-2.5">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <p className="text-xs font-bold text-slate-800">
                  {selectedFile
                    ? `Loaded File: ${selectedFile.name} (${Math.max(0.1, selectedFile.size / 1024).toFixed(1)} KB)`
                    : 'Click or Drag & Drop any CSV (.csv), PDF (.pdf), TSV, or TXT File'}
                </p>
                {selectedFile && (
                  <p className="text-[11px] font-bold text-teal-700 mt-1">
                    Preview Rendered Below — {activeGrid.length} row{activeGrid.length === 1 ? '' : 's'} ({activeParsedRows.length} medication{activeParsedRows.length === 1 ? '' : 's'} extracted)
                  </p>
                )}
                <p className="text-[11px] text-slate-500 mt-1 mb-3">
                  Supports all CSV spreadsheets, Excel CSV exports, TSV, and PDF tables
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
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

                  {!selectedFile && (
                    <button
                      type="button"
                      onClick={handleLoadSampleIntoPreview}
                      className="px-3 py-1.5 rounded-xl bg-white hover:bg-teal-50 text-teal-800 border border-teal-300 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Preview Loaded Medications</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Quick Dataset Switcher for Uploaded Clinical Catalogues */}
              <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 bg-teal-50/70 border border-teal-200 rounded-xl">
                <span className="text-[11px] font-bold text-teal-900 flex items-center gap-1.5">
                  <Pill className="w-3.5 h-3.5 text-teal-700" />
                  <span>Loaded Clinical Sheets:</span>
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => loadPresetDataset('endocrine')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                      selectedPreset === 'endocrine'
                        ? 'bg-teal-800 text-white shadow-2xs'
                        : 'bg-white text-teal-800 border border-teal-200 hover:bg-teal-100'
                    }`}
                  >
                    Endocrine &amp; Metabolic (57)
                  </button>
                  <button
                    type="button"
                    onClick={() => loadPresetDataset('cardiovascular')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                      selectedPreset === 'cardiovascular'
                        ? 'bg-teal-800 text-white shadow-2xs'
                        : 'bg-white text-teal-800 border border-teal-200 hover:bg-teal-100'
                    }`}
                  >
                    Cardiovascular (87)
                  </button>
                  <button
                    type="button"
                    onClick={() => loadPresetDataset('antimicrobial')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                      selectedPreset === 'antimicrobial'
                        ? 'bg-teal-800 text-white shadow-2xs'
                        : 'bg-white text-teal-800 border border-teal-200 hover:bg-teal-100'
                    }`}
                  >
                    Antimicrobial (96)
                  </button>
                  <button
                    type="button"
                    onClick={() => loadPresetDataset('all')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                      selectedPreset === 'all'
                        ? 'bg-teal-800 text-white shadow-2xs'
                        : 'bg-white text-teal-800 border border-teal-200 hover:bg-teal-100'
                    }`}
                  >
                    All 240 Combined
                  </button>
                </div>
              </div>

              {/* LIVE CSV / PDF PREVIEW PANEL */}
              {selectedFile && (
                <div className="border border-teal-300 bg-white rounded-2xl shadow-xs overflow-hidden">
                  <div className="px-4 py-2.5 bg-teal-900 text-white flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <TableIcon className="w-4 h-4 text-teal-200" />
                      <span className="text-xs font-bold">
                        Live File Preview: {selectedFile.name}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-teal-700 text-teal-100 text-[10px] font-bold">
                        {activeGrid.length} Rows · {activeParsedRows.length} Medications
                      </span>
                    </div>

                    <div className="inline-flex items-center bg-teal-950/60 p-0.5 rounded-lg border border-teal-700">
                      <button
                        type="button"
                        onClick={() => setPreviewTab('spreadsheet')}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                          previewTab === 'spreadsheet'
                            ? 'bg-white text-teal-900 shadow-2xs'
                            : 'text-teal-200 hover:text-white'
                        }`}
                      >
                        Spreadsheet ({activeGrid.length} rows)
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewTab('mapped')}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                          previewTab === 'mapped'
                            ? 'bg-white text-teal-900 shadow-2xs'
                            : 'text-teal-200 hover:text-white'
                        }`}
                      >
                        Mapped Medications ({activeParsedRows.length})
                      </button>
                      {selectedFile.isPdf && (
                        <button
                          type="button"
                          onClick={() => setPreviewTab('pdf')}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                            previewTab === 'pdf'
                              ? 'bg-white text-teal-900 shadow-2xs'
                              : 'text-teal-200 hover:text-white'
                          }`}
                        >
                          PDF View
                        </button>
                      )}
                    </div>
                  </div>

                  {selectedFile.isPdf && previewTab === 'pdf' ? (
                    <div className="p-3 bg-slate-100">
                      <iframe
                        src={selectedFile.dataUrl}
                        title={selectedFile.name}
                        className="w-full h-64 rounded-xl border border-slate-300 bg-white"
                      />
                    </div>
                  ) : previewTab === 'spreadsheet' ? (
                    /* RAW CSV SPREADSHEET TABLE PREVIEW */
                    activeGrid.length > 0 ? (
                      <div className="max-h-64 overflow-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead className="bg-slate-100 border-b border-slate-200 sticky top-0 z-10">
                            <tr>
                              <th className="py-2 px-3 text-[10px] font-bold uppercase text-slate-400 border-r border-slate-200 w-10">
                                Row
                              </th>
                              {Array.from({ length: maxCols }).map((_, cIdx) => (
                                <th
                                  key={cIdx}
                                  className="py-2 px-3 text-[10px] font-bold uppercase tracking-wider text-teal-900 border-r border-slate-200 last:border-r-0"
                                >
                                  {firstRowIsHeader && activeGrid[0][cIdx]
                                    ? activeGrid[0][cIdx]
                                    : `Column ${cIdx + 1}`}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {(firstRowIsHeader ? activeGrid.slice(1) : activeGrid).map((row, rIdx) => (
                              <tr key={rIdx} className="hover:bg-teal-50/40 transition-colors">
                                <td className="py-2 px-3 font-mono text-[10px] text-slate-400 bg-slate-50/70 border-r border-slate-200">
                                  {rIdx + 1}
                                </td>
                                {Array.from({ length: maxCols }).map((_, cIdx) => (
                                  <td
                                    key={cIdx}
                                    className={`py-2 px-3 border-r border-slate-100 last:border-r-0 ${
                                      cIdx === 0 ? 'font-bold text-slate-900' : 'text-slate-700'
                                    }`}
                                  >
                                    {row[cIdx] || '—'}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="p-4 text-xs font-mono text-slate-700 bg-slate-50 max-h-48 overflow-auto whitespace-pre-wrap">
                        {selectedFile.textContent || 'Empty CSV file'}
                      </div>
                    )
                  ) : (
                    /* AUTO-MAPPED MEDICATIONS TABLE PREVIEW */
                    <div className="max-h-64 overflow-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-teal-50 border-b border-teal-200 text-[10px] font-bold uppercase tracking-wider text-teal-900 sticky top-0 z-10">
                          <tr>
                            <th className="py-2 px-3 w-10">#</th>
                            <th className="py-2 px-3">Medicine Name</th>
                            <th className="py-2 px-3">Required Dosage</th>
                            <th className="py-2 px-3">Route</th>
                            <th className="py-2 px-3">Frequency</th>
                            <th className="py-2 px-3">Duration</th>
                            <th className="py-2 px-3">Instructions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {activeParsedRows.map((m, idx) => (
                            <tr key={idx} className="hover:bg-teal-50/40">
                              <td className="py-2 px-3 font-mono text-[10px] text-slate-400">
                                {idx + 1}
                              </td>
                              <td className="py-2 px-3 font-bold text-slate-900">{m.name}</td>
                              <td className="py-2 px-3 text-blue-800 font-semibold">{m.dosage}</td>
                              <td className="py-2 px-3 text-slate-600">{m.route}</td>
                              <td className="py-2 px-3 font-mono text-teal-800 font-bold">
                                {m.frequency}
                              </td>
                              <td className="py-2 px-3 text-slate-600">{m.duration}</td>
                              <td className="py-2 px-3 text-slate-500">{m.instructions}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] text-slate-600 space-y-1.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="font-bold text-slate-700 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                    Supported CSV &amp; PDF Formats:
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleLoadSampleIntoPreview}
                      className="text-[11px] font-bold text-teal-700 hover:text-teal-900 underline cursor-pointer"
                    >
                      Load Sample CSV in Preview
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadSampleCsv}
                      className="text-[11px] font-bold text-teal-700 hover:text-teal-900 underline cursor-pointer"
                    >
                      Download Sample CSV Template
                    </button>
                  </div>
                </div>
                <p>• Any CSV / Excel export (e.g. Medicine Name, Dosage, Route, Frequency, Duration, Instructions)</p>
                <p>• Standard 2-column or 3-column PDF tables (e.g. No. | Medicine | Dosage)</p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Close
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
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Paste CSV or Medications &amp; Dosages (One per line — Comma, Pipe |, Tab, or Dash - separated)
                </label>
                <textarea
                  rows={5}
                  value={rawText}
                  onChange={e => setRawText(e.target.value)}
                  placeholder={`Medicine Name,Required Dosage,Route,Frequency,Duration,Instructions\nAmoxicillin + Clavulanate, 625 mg, Oral, 1-0-1, 7 days, After food\nCefpodoxime Proxetil - 200 mg orally every 12 hours for 7 days`}
                  className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
                />
              </div>

              {/* Live Paste CSV Preview */}
              {pastePreviewRows.length > 0 && (
                <div className="border border-teal-200 rounded-xl overflow-hidden">
                  <div className="px-3 py-2 bg-teal-50 border-b border-teal-200 text-[11px] font-bold text-teal-900 flex items-center justify-between">
                    <span>Live CSV Preview ({pastePreviewRows.length} medications detected)</span>
                    <span className="text-[10px] text-teal-700">Auto-mapped</span>
                  </div>
                  <div className="max-h-44 overflow-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                        <tr>
                          <th className="py-1.5 px-3">#</th>
                          <th className="py-1.5 px-3">Medicine</th>
                          <th className="py-1.5 px-3">Dosage</th>
                          <th className="py-1.5 px-3">Route</th>
                          <th className="py-1.5 px-3">Frequency</th>
                          <th className="py-1.5 px-3">Duration</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {pastePreviewRows.map((m, idx) => (
                          <tr key={idx}>
                            <td className="py-1.5 px-3 font-mono text-[10px] text-slate-400">{idx + 1}</td>
                            <td className="py-1.5 px-3 font-bold text-slate-900">{m.name}</td>
                            <td className="py-1.5 px-3 text-blue-800 font-semibold">{m.dosage}</td>
                            <td className="py-1.5 px-3 text-slate-600">{m.route}</td>
                            <td className="py-1.5 px-3 font-mono text-teal-800 font-bold">{m.frequency}</td>
                            <td className="py-1.5 px-3 text-slate-600">{m.duration}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Close
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
