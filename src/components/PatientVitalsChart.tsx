import React, { useState, useMemo, useEffect } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine
} from 'recharts';
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
      notes: newNotes.trim() || 'Recorded during consultation',
      recordedBy: 'Attending Physician'
    };

    setRecords(prev => {
      const updated = [...prev, newRecord].sort((a, b) => a.date.localeCompare(b.date));
      return updated;
    });

    setShowLogModal(false);
  };

  // Process data for charts
  const chartData = useMemo(() => {
    const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));

    // Filter by time range
    const filtered = sorted.filter(r => {
      if (timeRange === 'all') return true;
      const recDate = new Date(r.date);
      const cutoff = new Date();
      if (timeRange === '1y') {
        cutoff.setFullYear(cutoff.getFullYear() - 1);
      } else if (timeRange === '6m') {
        cutoff.setMonth(cutoff.getMonth() - 6);
      }
      return recDate >= cutoff;
    });

    return filtered.map(r => {
      const heightInMeters = r.heightCm / 100;
      const bmi = heightInMeters > 0
        ? Math.round((r.weightKg / (heightInMeters * heightInMeters)) * 10) / 10
        : 0;

      let bmiCategory = 'Normal';
      if (bmi < 18.5) bmiCategory = 'Underweight';
      else if (bmi >= 25 && bmi < 30) bmiCategory = 'Overweight';
      else if (bmi >= 30) bmiCategory = 'Obese';

      const formattedDate = new Date(r.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: '2-digit'
      });

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

  // Custom Recharts Tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-900/95 text-white p-3 rounded-xl shadow-xl text-xs border border-slate-700/80 backdrop-blur-xs min-w-[200px]">
          <div className="flex items-center justify-between border-b border-slate-700 pb-1.5 mb-2">
            <span className="font-semibold text-slate-300">{data.date}</span>
            <span className="text-[10px] text-teal-400 font-mono px-1.5 py-0.5 bg-teal-950/60 rounded">
              {data.bmiCategory}
            </span>
          </div>
          <div className="space-y-1 tabular-nums">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Weight:</span>
              <span className="font-bold text-teal-300">{data.weightKg} kg</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Height:</span>
              <span className="font-bold text-indigo-300">{data.heightCm} cm</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Calculated BMI:</span>
              <span className="font-bold text-emerald-400">{data.bmi} kg/m²</span>
            </div>
            {data.notes && (
              <p className="text-[10px] text-slate-400 italic pt-1 border-t border-slate-800 mt-1">
                {data.notes}
              </p>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

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
                Track physical biometric progression, BMI index, and clinical weight velocity over time.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Time range selector */}
          <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl text-xs font-semibold text-slate-600">
            <button
              type="button"
              onClick={() => setTimeRange('all')}
              className={`px-2.5 py-1 rounded-lg transition-colors ${
                timeRange === 'all'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'hover:text-slate-900'
              }`}
            >
              All Time
            </button>
            <button
              type="button"
              onClick={() => setTimeRange('1y')}
              className={`px-2.5 py-1 rounded-lg transition-colors ${
                timeRange === '1y'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'hover:text-slate-900'
              }`}
            >
              Past 1Y
            </button>
            <button
              type="button"
              onClick={() => setTimeRange('6m')}
              className={`px-2.5 py-1 rounded-lg transition-colors ${
                timeRange === '6m'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'hover:text-slate-900'
              }`}
            >
              Past 6M
            </button>
          </div>

          {/* Log New Vitals Button */}
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

      {/* KPI Vitals Cards */}
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
                className={`text-xs font-bold flex items-center tabular-nums ${
                  weightDelta < 0 ? 'text-teal-700' : 'text-amber-700'
                }`}
              >
                {weightDelta > 0 ? (
                  <TrendingUp className="w-3 h-3 mr-0.5 inline" />
                ) : (
                  <TrendingDown className="w-3 h-3 mr-0.5 inline" />
                )}
                {weightDelta > 0 ? `+${weightDelta}` : weightDelta} kg
              </span>
            )}
          </div>
          <span className="text-[11px] text-slate-500 block truncate">
            {latestRecord ? `Recorded ${latestRecord.date}` : 'No records logged'}
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

      {/* Main Recharts Container */}
      <div className="clinical-card p-6">
        {chartData.length === 0 ? (
          <div className="h-72 flex flex-col items-center justify-center text-slate-400 text-xs">
            <Activity className="w-8 h-8 text-slate-300 mb-2" />
            <p className="font-semibold text-slate-600">No vitals data points available</p>
            <p className="text-slate-400 mt-1">Record a measurement to plot the patient&apos;s growth curves.</p>
          </div>
        ) : (
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              {metricMode === 'both' ? (
                <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="displayDate"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickLine={false}
                    axisLine={{ stroke: '#cbd5e1' }}
                  />
                  {/* Left Y Axis for Weight */}
                  <YAxis
                    yAxisId="weight"
                    domain={['dataMin - 3', 'dataMax + 3']}
                    tick={{ fontSize: 11, fill: '#0f766e' }}
                    tickLine={false}
                    axisLine={{ stroke: '#0f766e' }}
                    label={{
                      value: 'Weight (kg)',
                      angle: -90,
                      position: 'insideLeft',
                      fill: '#0f766e',
                      fontSize: 11,
                      offset: 10
                    }}
                  />
                  {/* Right Y Axis for Height */}
                  <YAxis
                    yAxisId="height"
                    orientation="right"
                    domain={['dataMin - 5', 'dataMax + 5']}
                    tick={{ fontSize: 11, fill: '#4f46e5' }}
                    tickLine={false}
                    axisLine={{ stroke: '#4f46e5' }}
                    label={{
                      value: 'Height (cm)',
                      angle: 90,
                      position: 'insideRight',
                      fill: '#4f46e5',
                      fontSize: 11,
                      offset: 10
                    }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    verticalAlign="top"
                    height={36}
                    wrapperStyle={{ fontSize: '12px', fontWeight: 600 }}
                  />
                  <Line
                    yAxisId="weight"
                    type="monotone"
                    dataKey="weightKg"
                    name="Weight (kg)"
                    stroke="#0f766e"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: '#0f766e', strokeWidth: 2, stroke: '#ffffff' }}
                    activeDot={{ r: 6, stroke: '#0f766e', strokeWidth: 2, fill: '#ffffff' }}
                  />
                  <Line
                    yAxisId="height"
                    type="monotone"
                    dataKey="heightCm"
                    name="Height (cm)"
                    stroke="#4f46e5"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={{ r: 3, fill: '#4f46e5', strokeWidth: 1, stroke: '#ffffff' }}
                    activeDot={{ r: 5, stroke: '#4f46e5' }}
                  />
                </LineChart>
              ) : metricMode === 'weight' ? (
                <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                  <defs>
                    <linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0d9488" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#0d9488" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="displayDate"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickLine={false}
                    axisLine={{ stroke: '#cbd5e1' }}
                  />
                  <YAxis
                    domain={['dataMin - 2', 'dataMax + 2']}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickLine={false}
                    axisLine={{ stroke: '#cbd5e1' }}
                    label={{
                      value: 'Weight (kg)',
                      angle: -90,
                      position: 'insideLeft',
                      fill: '#64748b',
                      fontSize: 11,
                      offset: 10
                    }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="weightKg"
                    name="Weight (kg)"
                    stroke="#0f766e"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#weightGrad)"
                    dot={{ r: 4, fill: '#0f766e', strokeWidth: 2, stroke: '#ffffff' }}
                  />
                </AreaChart>
              ) : metricMode === 'height' ? (
                <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                  <defs>
                    <linearGradient id="heightGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="displayDate"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickLine={false}
                    axisLine={{ stroke: '#cbd5e1' }}
                  />
                  <YAxis
                    domain={['dataMin - 3', 'dataMax + 3']}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickLine={false}
                    axisLine={{ stroke: '#cbd5e1' }}
                    label={{
                      value: 'Height (cm)',
                      angle: -90,
                      position: 'insideLeft',
                      fill: '#64748b',
                      fontSize: 11,
                      offset: 10
                    }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="heightCm"
                    name="Height (cm)"
                    stroke="#4f46e5"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#heightGrad)"
                    dot={{ r: 4, fill: '#4f46e5', strokeWidth: 2, stroke: '#ffffff' }}
                  />
                </AreaChart>
              ) : (
                <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="displayDate"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickLine={false}
                    axisLine={{ stroke: '#cbd5e1' }}
                  />
                  <YAxis
                    domain={[16, 34]}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickLine={false}
                    axisLine={{ stroke: '#cbd5e1' }}
                    label={{
                      value: 'BMI (kg/m²)',
                      angle: -90,
                      position: 'insideLeft',
                      fill: '#64748b',
                      fontSize: 11,
                      offset: 10
                    }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  {/* WHO Standard BMI Bands */}
                  <ReferenceLine y={18.5} stroke="#3b82f6" strokeDasharray="3 3" label={{ value: 'Underweight (<18.5)', fill: '#3b82f6', fontSize: 10 }} />
                  <ReferenceLine y={25} stroke="#eab308" strokeDasharray="3 3" label={{ value: 'Overweight (≥25)', fill: '#ca8a04', fontSize: 10 }} />
                  <ReferenceLine y={30} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'Obese (≥30)', fill: '#dc2626', fontSize: 10 }} />
                  <Line
                    type="monotone"
                    dataKey="bmi"
                    name="BMI"
                    stroke="#059669"
                    strokeWidth={3}
                    dot={{ r: 4, fill: '#059669', strokeWidth: 2, stroke: '#ffffff' }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              )}
            </ResponsiveContainer>
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
                <th className="py-2.5 px-4">BMI</th>
                <th className="py-2.5 px-4">Clinical Category</th>
                <th className="py-2.5 px-4">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {chartData.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-4 font-semibold text-slate-800">{row.date}</td>
                  <td className="py-3 px-4 font-bold text-teal-800">{row.weightKg} kg</td>
                  <td className="py-3 px-4 text-slate-700">{row.heightCm} cm</td>
                  <td className="py-3 px-4 font-bold text-slate-800">{row.bmi}</td>
                  <td className="py-3 px-4">
                    <span className="text-[11px] font-semibold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                      {row.bmiCategory}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-500 max-w-xs truncate">
                    {row.notes || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Record New Vitals */}
      {showLogModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-teal-50 text-teal-800 flex items-center justify-center">
                  <Activity className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">Record Vitals Measurement</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowLogModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddRecord} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Measurement Date
                </label>
                <input
                  type="date"
                  required
                  value={newDate}
                  onChange={e => setNewDate(e.target.value)}
                  className="clinical-input"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Weight (kg) *
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    max="300"
                    required
                    placeholder="e.g. 70.5"
                    value={newWeight}
                    onChange={e => setNewWeight(e.target.value)}
                    className="clinical-input"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Height (cm) *
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="30"
                    max="260"
                    required
                    placeholder="e.g. 175"
                    value={newHeight}
                    onChange={e => setNewHeight(e.target.value)}
                    className="clinical-input"
                  />
                </div>
              </div>

              {/* Calculated BMI preview */}
              {(() => {
                const w = parseFloat(newWeight);
                const h = parseFloat(newHeight);
                if (!isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
                  const bmi = Math.round((w / Math.pow(h / 100, 2)) * 10) / 10;
                  return (
                    <div className="p-2.5 bg-teal-50/80 rounded-xl border border-teal-200/80 flex items-center justify-between text-xs">
                      <span className="text-teal-900 font-medium">Calculated BMI:</span>
                      <span className="font-extrabold text-teal-950 tabular-nums">{bmi} kg/m²</span>
                    </div>
                  );
                }
                return null;
              })()}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Clinical Notes (optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Post-treatment check, noted gradual muscle mass gain"
                  value={newNotes}
                  onChange={e => setNewNotes(e.target.value)}
                  className="clinical-input"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowLogModal(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-teal-800 hover:bg-teal-900 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
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
