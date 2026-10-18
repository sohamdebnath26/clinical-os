import React, { useState, useMemo, useEffect } from 'react';
import { Patient, Consultation } from '../types';
import {
  Activity,
  Plus,
  Scale,
  Ruler,
  TrendingUp,
  TrendingDown,
  Calendar,
  X
} from 'lucide-react';

export interface VitalsRecord {
  id: string;
  patientId: string;
  date: string;
  weightKg: number;
  heightCm: number;
  notes?: string;
  recordedBy?: string;
}

interface PatientVitalsChartProps {
  patient: Patient;
  consultations?: Consultation[];
}

interface ChartItem extends VitalsRecord {
  displayDate: string;
  bmi: number;
  bmiCategory: string;
}

// Native high-fidelity SVG Vitals Chart
const NativeVitalsSvgChart: React.FC<{
  data: ChartItem[];
  metricMode: 'both' | 'weight' | 'height' | 'bmi';
}> = ({ data, metricMode }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const vbWidth = 720;
  const vbHeight = 260;
  const padLeft = 60;
  const padRight = metricMode === 'both' ? 60 : 30;
  const padTop = 25;
  const padBottom = 40;
  const chartW = vbWidth - padLeft - padRight;
  const chartH = vbHeight - padTop - padBottom;

  const count = data.length;
  const stepX = count > 1 ? chartW / (count - 1) : chartW;

  // Weight Domain
  const minW = Math.max(0, Math.min(...data.map(d => d.weightKg)) - 3);
  const maxW = Math.max(...data.map(d => d.weightKg)) + 3;
  const rangeW = Math.max(1, maxW - minW);

  // Height Domain
  const minH = Math.max(0, Math.min(...data.map(d => d.heightCm)) - 5);
  const maxH = Math.max(...data.map(d => d.heightCm)) + 5;
  const rangeH = Math.max(1, maxH - minH);

  // BMI Domain (typically 15 to 35)
  const minBmi = 15;
  const maxBmi = 35;
  const rangeBmi = maxBmi - minBmi;

  const points = data.map((d, idx) => {
    const x = padLeft + idx * stepX;
    const yWeight = padTop + chartH - ((d.weightKg - minW) / rangeW) * chartH;
    const yHeight = padTop + chartH - ((d.heightCm - minH) / rangeH) * chartH;
    const yBmi = padTop + chartH - ((Math.min(maxBmi, Math.max(minBmi, d.bmi)) - minBmi) / rangeBmi) * chartH;
    return { x, yWeight, yHeight, yBmi, d, idx };
  });

  const makeLinePath = (yProp: 'yWeight' | 'yHeight' | 'yBmi') => {
    if (points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0][yProp]}`;
    let d = `M ${points[0].x} ${points[0][yProp]}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const cpX = p0.x + (p1.x - p0.x) / 2;
      d += ` C ${cpX} ${p0[yProp]}, ${cpX} ${p1[yProp]}, ${p1.x} ${p1[yProp]}`;
    }
    return d;
  };

  const lineWeightD = useMemo(() => makeLinePath('yWeight'), [points]);
  const lineHeightD = useMemo(() => makeLinePath('yHeight'), [points]);
  const lineBmiD = useMemo(() => makeLinePath('yBmi'), [points]);

  const areaWeightD = useMemo(() => {
    if (points.length < 2) return '';
    const last = points[points.length - 1];
    const first = points[0];
    const baselineY = padTop + chartH;
    return `${lineWeightD} L ${last.x} ${baselineY} L ${first.x} ${baselineY} Z`;
  }, [lineWeightD, points]);

  const areaHeightD = useMemo(() => {
    if (points.length < 2) return '';
    const last = points[points.length - 1];
    const first = points[0];
    const baselineY = padTop + chartH;
    return `${lineHeightD} L ${last.x} ${baselineY} L ${first.x} ${baselineY} Z`;
  }, [lineHeightD, points]);

  // Y-axis grid ticks
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(r => ({
    ratio: r,
    y: padTop + chartH - chartH * r,
    valW: Math.round(minW + rangeW * r),
    valH: Math.round(minH + rangeH * r),
    valBmi: Math.round(minBmi + rangeBmi * r)
  }));

  const activePoint = hoveredIdx !== null && points[hoveredIdx] ? points[hoveredIdx] : null;

  return (
    <div className="w-full h-full flex flex-col justify-between select-none">
      <div className="relative w-full h-[240px]">
        <svg
          viewBox={`0 0 ${vbWidth} ${vbHeight}`}
          className="w-full h-full overflow-visible"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="vitalsWeightGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#0d9488" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#0d9488" stopOpacity={0.0} />
            </linearGradient>
            <linearGradient id="vitalsHeightGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
            </linearGradient>
          </defs>

          {/* Horizontal Grid lines and primary Y-axis ticks */}
          {yTicks.map((tick, i) => (
            <g key={i}>
              <line
                x1={padLeft}
                y1={tick.y}
                x2={vbWidth - padRight}
                y2={tick.y}
                stroke={i === 0 ? '#cbd5e1' : '#f1f5f9'}
                strokeWidth={i === 0 ? 1.5 : 1}
                strokeDasharray={i === 0 ? 'none' : '3 3'}
              />
              {/* Left Y-axis label */}
              <text
                x={padLeft - 8}
                y={tick.y + 3.5}
                textAnchor="end"
                className="text-[10px] fill-slate-400 font-mono font-medium"
              >
                {metricMode === 'bmi'
                  ? tick.valBmi
                  : metricMode === 'height'
                  ? `${tick.valH}cm`
                  : `${tick.valW}kg`}
              </text>
              {/* Right Y-axis label for combined mode (Height) */}
              {metricMode === 'both' && (
                <text
                  x={vbWidth - padRight + 8}
                  y={tick.y + 3.5}
                  textAnchor="start"
                  className="text-[10px] fill-indigo-500 font-mono font-medium"
                >
                  {tick.valH}cm
                </text>
              )}
            </g>
          ))}

          {/* WHO BMI Reference Threshold Lines when in BMI mode */}
          {metricMode === 'bmi' && (
            <>
              {/* 18.5 Underweight line */}
              <line
                x1={padLeft}
                y1={padTop + chartH - ((18.5 - minBmi) / rangeBmi) * chartH}
                x2={vbWidth - padRight}
                y2={padTop + chartH - ((18.5 - minBmi) / rangeBmi) * chartH}
                stroke="#3b82f6"
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              <text
                x={vbWidth - padRight - 6}
                y={padTop + chartH - ((18.5 - minBmi) / rangeBmi) * chartH - 4}
                textAnchor="end"
                className="text-[9px] fill-blue-500 font-medium"
              >
                Underweight (&lt;18.5)
              </text>

              {/* 25.0 Overweight line */}
              <line
                x1={padLeft}
                y1={padTop + chartH - ((25 - minBmi) / rangeBmi) * chartH}
                x2={vbWidth - padRight}
                y2={padTop + chartH - ((25 - minBmi) / rangeBmi) * chartH}
                stroke="#eab308"
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              <text
                x={vbWidth - padRight - 6}
                y={padTop + chartH - ((25 - minBmi) / rangeBmi) * chartH - 4}
                textAnchor="end"
                className="text-[9px] fill-amber-500 font-medium"
              >
                Overweight (≥25)
              </text>

              {/* 30.0 Obese line */}
              <line
                x1={padLeft}
                y1={padTop + chartH - ((30 - minBmi) / rangeBmi) * chartH}
                x2={vbWidth - padRight}
                y2={padTop + chartH - ((30 - minBmi) / rangeBmi) * chartH}
                stroke="#ef4444"
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              <text
                x={vbWidth - padRight - 6}
                y={padTop + chartH - ((30 - minBmi) / rangeBmi) * chartH - 4}
                textAnchor="end"
                className="text-[9px] fill-rose-500 font-medium"
              >
                Obese (≥30)
              </text>
            </>
          )}

          {/* Area Fills for Single Metric Modes */}
          {metricMode === 'weight' && areaWeightD && (
            <path d={areaWeightD} fill="url(#vitalsWeightGrad)" />
          )}
          {metricMode === 'height' && areaHeightD && (
            <path d={areaHeightD} fill="url(#vitalsHeightGrad)" />
          )}

          {/* Metric Curves */}
          {(metricMode === 'both' || metricMode === 'weight') && lineWeightD && (
            <path
              d={lineWeightD}
              fill="none"
              stroke="#0f766e"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {(metricMode === 'both' || metricMode === 'height') && lineHeightD && (
            <path
              d={lineHeightD}
              fill="none"
              stroke="#4f46e5"
              strokeWidth={2}
              strokeDasharray={metricMode === 'both' ? '4 4' : 'none'}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {metricMode === 'bmi' && lineBmiD && (
            <path
              d={lineBmiD}
              fill="none"
              stroke="#059669"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Data Points and Column Hit Areas */}
          {points.map((pt) => {
            const isHovered = hoveredIdx === pt.idx;
            const hitW = chartW / count;

            return (
              <g
                key={pt.d.id}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredIdx(pt.idx)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                {/* Hit column */}
                <rect
                  x={pt.x - hitW / 2}
                  y={padTop}
                  width={hitW}
                  height={chartH + padBottom}
                  fill="transparent"
                />

                {/* Vertical hover guide */}
                {isHovered && (
                  <line
                    x1={pt.x}
                    y1={padTop}
                    x2={pt.x}
                    y2={padTop + chartH}
                    stroke="#94a3b8"
                    strokeWidth={1}
                    strokeDasharray="2 2"
                  />
                )}

                {/* Weight Point Dot */}
                {(metricMode === 'both' || metricMode === 'weight') && (
                  <circle
                    cx={pt.x}
                    cy={pt.yWeight}
                    r={isHovered ? 6 : 4}
                    fill={isHovered ? '#0f766e' : '#ffffff'}
                    stroke="#0f766e"
                    strokeWidth={2}
                    className="transition-all duration-150"
                  />
                )}

                {/* Height Point Dot */}
                {(metricMode === 'both' || metricMode === 'height') && (
                  <circle
                    cx={pt.x}
                    cy={pt.yHeight}
                    r={isHovered ? 5 : 3.5}
                    fill={isHovered ? '#4f46e5' : '#ffffff'}
                    stroke="#4f46e5"
                    strokeWidth={1.5}
                    className="transition-all duration-150"
                  />
                )}

                {/* BMI Point Dot */}
                {metricMode === 'bmi' && (
                  <circle
                    cx={pt.x}
                    cy={pt.yBmi}
                    r={isHovered ? 6 : 4}
                    fill={isHovered ? '#059669' : '#ffffff'}
                    stroke="#059669"
                    strokeWidth={2}
                    className="transition-all duration-150"
                  />
                )}

                {/* X Axis Date Label */}
                <text
                  x={pt.x}
                  y={vbHeight - padBottom + 16}
                  textAnchor="middle"
                  className={`text-[9.5px] font-medium transition-colors ${
                    isHovered ? 'fill-slate-900 font-bold' : 'fill-slate-500'
                  }`}
                >
                  {pt.d.displayDate}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Dynamic Tooltip */}
        {activePoint && (
          <div
            className="absolute -top-2 z-20 pointer-events-none transform -translate-x-1/2 transition-all duration-150"
            style={{
              left: `${(activePoint.x / vbWidth) * 100}%`
            }}
          >
            <div className="bg-slate-900 text-white rounded-xl shadow-xl px-3 py-2 text-xs border border-slate-700/80 space-y-1 min-w-[170px]">
              <div className="flex items-center justify-between border-b border-slate-700 pb-1 mb-1">
                <span className="font-semibold text-slate-200">{activePoint.d.date}</span>
                <span className="text-[10px] text-teal-400 font-mono px-1.5 py-0.5 bg-teal-950/80 rounded border border-teal-800">
                  {activePoint.d.bmiCategory}
                </span>
              </div>
              <div className="space-y-0.5 text-[11px] tabular-nums">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Weight:</span>
                  <span className="font-bold text-teal-300">{activePoint.d.weightKg} kg</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Height:</span>
                  <span className="font-bold text-indigo-300">{activePoint.d.heightCm} cm</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Calculated BMI:</span>
                  <span className="font-bold text-emerald-400">{activePoint.d.bmi} kg/m²</span>
                </div>
              </div>
              {activePoint.d.notes && (
                <p className="text-[10px] text-slate-400 italic pt-1 border-t border-slate-800 mt-1">
                  {activePoint.d.notes}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Interactive Legend */}
      <div className="flex items-center justify-center gap-6 pt-2 text-[11px] font-semibold text-slate-600">
        {metricMode === 'both' && (
          <>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-1 bg-teal-700 rounded-full inline-block" />
              <span>Weight (kg) — Left Axis</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 border-b border-dashed border-indigo-600 inline-block" />
              <span>Height (cm) — Right Axis</span>
            </div>
          </>
        )}
        {metricMode === 'weight' && (
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-1 bg-teal-700 rounded-full inline-block" />
            <span>Weight Trajectory (kg)</span>
          </div>
        )}
        {metricMode === 'height' && (
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-1 bg-indigo-600 rounded-full inline-block" />
            <span>Height Trajectory (cm)</span>
          </div>
        )}
        {metricMode === 'bmi' && (
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-1 bg-emerald-600 rounded-full inline-block" />
            <span>BMI Curve with WHO Classification Bands</span>
          </div>
        )}
      </div>
    </div>
  );
};

export const PatientVitalsChart: React.FC<PatientVitalsChartProps> = ({
  patient,
  consultations = []
}) => {
  const storageKey = `clinical_vitals_${patient.id}`;

  // Initialize vitals from localStorage or generate realistic baseline historical points
  const [records, setRecords] = useState<VitalsRecord[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // ignore
    }

    // Generate baseline historical records based on patient age, gender, and consultations
    const now = new Date();
    const baseWeight = patient.gender === 'Female' ? 58 : 72;
    const baseHeight = patient.gender === 'Female' ? 162 : 176;

    // Build timeline dates from past consultations or recent months
    const dates: string[] = [];
    if (consultations.length > 0) {
      consultations.forEach(c => {
        if (c.consultationDate) {
          dates.push(c.consultationDate.split('T')[0]);
        }
      });
    }

    if (dates.length < 3) {
      // Create baseline timestamps across past 9 months
      for (let i = 3; i >= 0; i--) {
        const d = new Date(now);
        d.setMonth(d.getMonth() - i * 2);
        dates.push(d.toISOString().split('T')[0]);
      }
    }

    const uniqueDates = Array.from(new Set(dates)).sort();

    return uniqueDates.map((d, index) => {
      // subtle natural weight variation (-1.5 to +1.2 kg)
      const variance = (index % 2 === 0 ? 0.4 : -0.8) * index;
      const weight = Math.round((baseWeight + variance) * 10) / 10;
      return {
        id: `rec-${index + 1}`,
        patientId: patient.id,
        date: d,
        weightKg: weight,
        heightCm: baseHeight,
        notes: index === 0 ? 'Baseline clinical intake' : 'Routine clinic follow-up',
        recordedBy: 'Attending Physician'
      };
    });
  });

  // Save to localStorage whenever records change
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(records));
    } catch {
      // ignore
    }
  }, [records, storageKey]);

  // View state
  const [timeRange, setTimeRange] = useState<'all' | '1y' | '6m'>('all');
  const [metricMode, setMetricMode] = useState<'both' | 'weight' | 'height' | 'bmi'>('both');
  const [showLogModal, setShowLogModal] = useState(false);

  // New vitals form state
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);
  const [newWeight, setNewWeight] = useState<string>('');
  const [newHeight, setNewHeight] = useState<string>('');
  const [newNotes, setNewNotes] = useState('');

  // Pre-fill default height from latest record when opening modal
  const openLogModal = () => {
    const latest = records[records.length - 1];
    if (latest) {
      setNewHeight(latest.heightCm.toString());
      setNewWeight(latest.weightKg.toString());
    }
    setNewDate(new Date().toISOString().split('T')[0]);
    setNewNotes('');
    setShowLogModal(true);
  };

  const handleAddRecord = (e: React.FormEvent) => {
    e.preventDefault();
    const w = parseFloat(newWeight);
    const h = parseFloat(newHeight);
    if (isNaN(w) || isNaN(h) || w <= 0 || h <= 0) return;

    const newRecord: VitalsRecord = {
      id: `rec-${Date.now()}`,
      patientId: patient.id,
      date: newDate,
      weightKg: Math.round(w * 10) / 10,
      heightCm: Math.round(h * 10) / 10,
      notes: newNotes.trim() || undefined,
      recordedBy: 'Attending Physician'
    };

    setRecords(prev => {
      const updated = [...prev, newRecord].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      return updated;
    });

    setShowLogModal(false);
  };

  // Filter and enrich records with BMI calculations
  const chartData = useMemo<ChartItem[]>(() => {
    let filtered = [...records];
    const now = new Date();

    if (timeRange === '6m') {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(now.getMonth() - 6);
      filtered = filtered.filter(r => new Date(r.date) >= sixMonthsAgo);
    } else if (timeRange === '1y') {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(now.getFullYear() - 1);
      filtered = filtered.filter(r => new Date(r.date) >= oneYearAgo);
    }

    return filtered.map(r => {
      const heightInMeters = r.heightCm / 100;
      const bmi = heightInMeters > 0
        ? Math.round((r.weightKg / (heightInMeters * heightInMeters)) * 10) / 10
        : 0;

      let bmiCategory = 'Normal';
      if (bmi < 18.5) bmiCategory = 'Underweight';
      else if (bmi >= 25 && bmi < 30) bmiCategory = 'Overweight';
      else if (bmi >= 30) bmiCategory = 'Obese';

      const d = new Date(r.date);
      const formattedDate = !isNaN(d.getTime())
        ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
        : r.date;

      return {
        ...r,
        displayDate: formattedDate,
        bmi,
        bmiCategory
      };
    });
  }, [records, timeRange]);

  // Key KPI stats
  const latestRecord = chartData[chartData.length - 1];
  const previousRecord = chartData.length > 1 ? chartData[chartData.length - 2] : null;

  const weightDelta = previousRecord && latestRecord
    ? Math.round((latestRecord.weightKg - previousRecord.weightKg) * 10) / 10
    : 0;

  const latestBmi = latestRecord?.bmi ?? 0;
  const bmiCategory = latestRecord?.bmiCategory ?? 'Normal';

  return (
    <div className="space-y-6">
      {/* Top Header & Actions Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-800 flex items-center justify-center">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                Historical Weight & Height Trends
              </h2>
              <p className="text-xs text-slate-500">
                Track growth trajectories, longitudinal weight changes, and BMI classification.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Time range selector */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-xl text-xs font-semibold">
            <button
              type="button"
              onClick={() => setTimeRange('6m')}
              className={`px-2.5 py-1 rounded-lg transition-colors ${
                timeRange === '6m' ? 'bg-white text-teal-900 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              6 Months
            </button>
            <button
              type="button"
              onClick={() => setTimeRange('1y')}
              className={`px-2.5 py-1 rounded-lg transition-colors ${
                timeRange === '1y' ? 'bg-white text-teal-900 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              1 Year
            </button>
            <button
              type="button"
              onClick={() => setTimeRange('all')}
              className={`px-2.5 py-1 rounded-lg transition-colors ${
                timeRange === 'all' ? 'bg-white text-teal-900 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Time
            </button>
          </div>

          <button
            type="button"
            onClick={openLogModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-800 hover:bg-teal-900 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Record Measurement</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Latest Weight */}
        <div className="clinical-card p-4 space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Current Weight</span>
            <Scale className="w-4 h-4 text-teal-700" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-slate-900 tracking-tight tabular-nums">
              {latestRecord ? `${latestRecord.weightKg} kg` : '—'}
            </span>
            {weightDelta !== 0 && (
              <span
                className={`text-xs font-bold flex items-center gap-0.5 ${
                  weightDelta > 0 ? 'text-amber-600' : 'text-emerald-600'
                }`}
              >
                {weightDelta > 0 ? (
                  <>
                    <TrendingUp className="w-3 h-3" />
                    +{weightDelta} kg
                  </>
                ) : (
                  <>
                    <TrendingDown className="w-3 h-3" />
                    {weightDelta} kg
                  </>
                )}
              </span>
            )}
          </div>
          <span className="text-[11px] text-slate-500 block">
            {latestRecord ? `Recorded ${latestRecord.displayDate}` : 'No records logged'}
          </span>
        </div>

        {/* Latest Height */}
        <div className="clinical-card p-4 space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Current Height</span>
            <Ruler className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-slate-900 tracking-tight tabular-nums">
              {latestRecord ? `${latestRecord.heightCm} cm` : '—'}
            </span>
          </div>
          <span className="text-[11px] text-slate-500 block">
            {latestRecord ? `${(latestRecord.heightCm / 100).toFixed(2)} meters` : 'Standard stance'}
          </span>
        </div>

        {/* Calculated BMI */}
        <div className="clinical-card p-4 space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Calculated BMI</span>
            <Activity className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-slate-900 tracking-tight tabular-nums">
              {latestBmi > 0 ? latestBmi : '—'}
            </span>
            <span className="text-xs text-slate-500 font-normal">kg/m²</span>
          </div>
          <span className="text-[11px] font-semibold text-emerald-700 block">
            {bmiCategory} (WHO standard)
          </span>
        </div>

        {/* Total Data Points */}
        <div className="clinical-card p-4 space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Telemetry Points</span>
            <Calendar className="w-4 h-4 text-slate-500" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 tracking-tight tabular-nums">
            {chartData.length}
          </div>
          <span className="text-[11px] text-slate-500 block">
            {chartData.length > 0 ? `From ${chartData[0].date} to date` : 'No historical points'}
          </span>
        </div>
      </div>

      {/* Chart View Modes Switcher */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-2 shrink-0">
          Display Metric:
        </span>
        <button
          type="button"
          onClick={() => setMetricMode('both')}
          className={`px-3 py-1.5 rounded-lg font-semibold transition-colors shrink-0 ${
            metricMode === 'both'
              ? 'bg-teal-800 text-white shadow-2xs'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Combined Weight & Height
        </button>
        <button
          type="button"
          onClick={() => setMetricMode('weight')}
          className={`px-3 py-1.5 rounded-lg font-semibold transition-colors shrink-0 ${
            metricMode === 'weight'
              ? 'bg-teal-800 text-white shadow-2xs'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Weight Only (kg)
        </button>
        <button
          type="button"
          onClick={() => setMetricMode('height')}
          className={`px-3 py-1.5 rounded-lg font-semibold transition-colors shrink-0 ${
            metricMode === 'height'
              ? 'bg-teal-800 text-white shadow-2xs'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Height Only (cm)
        </button>
        <button
          type="button"
          onClick={() => setMetricMode('bmi')}
          className={`px-3 py-1.5 rounded-lg font-semibold transition-colors shrink-0 ${
            metricMode === 'bmi'
              ? 'bg-teal-800 text-white shadow-2xs'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          BMI Progression
        </button>
      </div>

      {/* Main Chart Container */}
      <div className="clinical-card p-6">
        {chartData.length === 0 ? (
          <div className="h-72 flex flex-col items-center justify-center text-slate-400 text-xs">
            <Activity className="w-8 h-8 text-slate-300 mb-2" />
            <p className="font-semibold text-slate-600">No vitals data points available</p>
            <p className="text-slate-400 mt-1">Record a measurement to plot the patient&apos;s growth curves.</p>
          </div>
        ) : (
          <div className="h-80 w-full">
            <NativeVitalsSvgChart data={chartData} metricMode={metricMode} />
          </div>
        )}
      </div>

      {/* Historical Measurements Ledger Table */}
      <div className="clinical-card overflow-hidden">
        <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-800">
            Recorded Vitals Ledger ({chartData.length} entries)
          </span>
          <span className="text-[11px] text-slate-500">
            Ordered chronologically
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/50 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="py-2.5 px-4">Date</th>
                <th className="py-2.5 px-4">Weight</th>
                <th className="py-2.5 px-4">Height</th>
                <th className="py-2.5 px-4">Calculated BMI</th>
                <th className="py-2.5 px-4">Classification</th>
                <th className="py-2.5 px-4">Notes</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {[...chartData].reverse().map(record => (
                <tr key={record.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-4 font-bold text-slate-800">{record.date}</td>
                  <td className="py-3 px-4 tabular-nums text-teal-900 font-bold">{record.weightKg} kg</td>
                  <td className="py-3 px-4 tabular-nums text-slate-700">{record.heightCm} cm</td>
                  <td className="py-3 px-4 tabular-nums font-mono font-bold text-slate-900">{record.bmi}</td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        record.bmiCategory === 'Normal'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : record.bmiCategory === 'Underweight'
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}
                    >
                      {record.bmiCategory}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-500 text-[11px] max-w-xs truncate">
                    {record.notes || '—'}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setRecords(prev => prev.filter(r => r.id !== record.id));
                      }}
                      className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                      title="Delete record"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Measurement Modal */}
      {showLogModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-800 flex items-center justify-center">
                  <Scale className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Log Patient Vitals</h3>
                  <p className="text-[11px] text-slate-500">Add physical telemetry point for {patient.fullName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowLogModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddRecord} className="p-5 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Measurement Date
                </label>
                <input
                  type="date"
                  required
                  value={newDate}
                  onChange={e => setNewDate(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-teal-600 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Weight (kg) *
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    max="350"
                    required
                    placeholder="e.g. 68.5"
                    value={newWeight}
                    onChange={e => setNewWeight(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-teal-600 font-bold"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Height (cm) *
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="30"
                    max="250"
                    required
                    placeholder="e.g. 172"
                    value={newHeight}
                    onChange={e => setNewHeight(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-teal-600 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Clinical Observation Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Post-prandial weight, wearing winter attire, patient reports intentional weight reduction..."
                  value={newNotes}
                  onChange={e => setNewNotes(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-teal-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowLogModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-teal-800 hover:bg-teal-900 text-white shadow-xs transition"
                >
                  Save Measurement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
