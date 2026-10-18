import React, { useState, useMemo } from 'react';
import { PracticeRevenueAnalytics, DailyRevenuePoint, MonthlyRevenuePoint } from '../types';
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  Users,
  Stethoscope,
  ChevronDown,
  ChevronUp,
  Search,
  Printer,
  FileSpreadsheet,
  Receipt,
  BarChart3,
  ArrowRight
} from 'lucide-react';

interface PracticeRevenueWidgetProps {
  revenue: PracticeRevenueAnalytics | null;
  onSelectPatient: (patientId: string) => void;
  onRefresh?: () => void;
}

// Native high-fidelity SVG Stacked Bar Chart for 14-day daily trend
const DailyStackedBarChart: React.FC<{ data: DailyRevenuePoint[] }> = ({ data }) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const maxVal = useMemo(() => {
    const highest = Math.max(...data.map(d => d.totalRevenue), 0);
    if (highest <= 0) return 1000;
    // Round up to nice number
    if (highest <= 1000) return 1000;
    if (highest <= 2500) return 2500;
    if (highest <= 5000) return 5000;
    return Math.ceil(highest / 1000) * 1000;
  }, [data]);

  const vbWidth = 720;
  const vbHeight = 210;
  const padLeft = 55;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 35;
  const chartW = vbWidth - padLeft - padRight;
  const chartH = vbHeight - padTop - padBottom;

  const count = Math.max(1, data.length);
  const colWidth = chartW / count;
  const barW = Math.min(26, Math.max(14, colWidth * 0.55));

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(ratio => ({
    val: Math.round(maxVal * ratio),
    y: padTop + chartH - chartH * ratio
  }));

  const activeItem = hoveredIndex !== null && data[hoveredIndex] ? data[hoveredIndex] : null;

  return (
    <div className="w-full h-full flex flex-col justify-between select-none">
      <div className="relative w-full h-[185px]">
        <svg
          viewBox={`0 0 ${vbWidth} ${vbHeight}`}
          className="w-full h-full overflow-visible"
          preserveAspectRatio="none"
        >
          {/* Horizontal Grid lines & Y Axis Ticks */}
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
              <text
                x={padLeft - 8}
                y={tick.y + 3.5}
                textAnchor="end"
                className="text-[10px] fill-slate-400 font-mono font-medium"
              >
                ₹{tick.val >= 1000 ? `${(tick.val / 1000).toFixed(tick.val % 1000 === 0 ? 0 : 1)}k` : tick.val}
              </text>
            </g>
          ))}

          {/* Bars */}
          {data.map((d, idx) => {
            const xCenter = padLeft + idx * colWidth + colWidth / 2;
            const xBar = xCenter - barW / 2;

            const consultRatio = Math.min(1, Math.max(0, d.consultationRevenue / maxVal));
            const procRatio = Math.min(1, Math.max(0, d.procedureRevenue / maxVal));

            const hConsult = chartH * consultRatio;
            const hProc = chartH * procRatio;

            const yConsult = padTop + chartH - hConsult;
            const yProc = yConsult - hProc;

            const isHovered = hoveredIndex === idx;

            // Short label (e.g. "Oct 15" or "15")
            const labelParts = d.dayLabel ? d.dayLabel.split(',') : [d.date];
            const shortDay = labelParts[1] ? labelParts[1].trim() : d.date.slice(5);

            return (
              <g
                key={d.date}
                className="cursor-pointer group"
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                {/* Column background hover highlight */}
                <rect
                  x={padLeft + idx * colWidth}
                  y={padTop}
                  width={colWidth}
                  height={chartH}
                  fill={isHovered ? 'rgba(15, 118, 110, 0.08)' : 'transparent'}
                  rx={4}
                  className="transition-colors duration-150"
                />

                {/* Consultation Bar (Bottom - Teal) */}
                {hConsult > 0 && (
                  <rect
                    x={xBar}
                    y={yConsult}
                    width={barW}
                    height={hConsult}
                    fill={isHovered ? '#0d9488' : '#0f766e'}
                    rx={hProc > 0 ? 0 : 3}
                    className="transition-all duration-150"
                  />
                )}

                {/* Procedure Bar (Stacked on top - Amber) */}
                {hProc > 0 && (
                  <rect
                    x={xBar}
                    y={yProc}
                    width={barW}
                    height={hProc}
                    fill={isHovered ? '#fbbf24' : '#f59e0b'}
                    rx={3}
                    className="transition-all duration-150"
                  />
                )}

                {/* Baseline zero dot if 0 revenue */}
                {d.totalRevenue === 0 && (
                  <circle
                    cx={xCenter}
                    cy={padTop + chartH - 2}
                    r={2}
                    fill={isHovered ? '#0f766e' : '#cbd5e1'}
                  />
                )}

                {/* X Axis Date label */}
                <text
                  x={xCenter}
                  y={vbHeight - padBottom + 16}
                  textAnchor="middle"
                  className={`text-[9.5px] font-medium transition-colors ${
                    isHovered ? 'fill-teal-900 font-bold' : 'fill-slate-500'
                  }`}
                >
                  {shortDay}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Dynamic Tooltip on Hover */}
        {activeItem && hoveredIndex !== null && (
          <div
            className="absolute -top-3 z-20 pointer-events-none transform -translate-x-1/2 transition-all duration-150"
            style={{
              left: `${((padLeft + hoveredIndex * colWidth + colWidth / 2) / vbWidth) * 100}%`
            }}
          >
            <div className="bg-slate-900 text-white rounded-xl shadow-xl px-3 py-2 text-xs border border-slate-800 space-y-1 min-w-[150px]">
              <div className="font-bold text-[11px] text-teal-300 border-b border-slate-800 pb-1">
                {activeItem.dayLabel || activeItem.date}
              </div>
              <div className="flex items-center justify-between gap-3 text-[11px]">
                <span className="flex items-center gap-1.5 text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-teal-400 inline-block" />
                  Consultation
                </span>
                <span className="font-mono font-bold text-white">
                  ₹{activeItem.consultationRevenue.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 text-[11px]">
                <span className="flex items-center gap-1.5 text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                  Procedures
                </span>
                <span className="font-mono font-bold text-white">
                  ₹{activeItem.procedureRevenue.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 text-[11px] pt-1 border-t border-slate-800">
                <span className="font-semibold text-slate-200">Daily Total:</span>
                <span className="font-mono font-black text-emerald-400">
                  ₹{activeItem.totalRevenue.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="text-[9.5px] text-slate-400 text-right">
                {activeItem.visitCount} visit(s)
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Interactive Legend */}
      <div className="flex items-center justify-center gap-6 pt-1 text-[11px] font-semibold text-slate-600">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-teal-700 shadow-2xs inline-block" />
          <span>Consultation Fees</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-amber-500 shadow-2xs inline-block" />
          <span>Clinical Procedure Fees</span>
        </div>
      </div>
    </div>
  );
};

// Native high-fidelity SVG Smooth Area Chart for 6-month MRR trend
const MonthlyMRRAreaChart: React.FC<{ data: MonthlyRevenuePoint[] }> = ({ data }) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const maxVal = useMemo(() => {
    const highest = Math.max(...data.map(d => d.totalRevenue), 0);
    if (highest <= 0) return 2000;
    if (highest <= 2000) return 2000;
    if (highest <= 5000) return 5000;
    return Math.ceil(highest / 1000) * 1000;
  }, [data]);

  const vbWidth = 720;
  const vbHeight = 210;
  const padLeft = 55;
  const padRight = 25;
  const padTop = 20;
  const padBottom = 35;
  const chartW = vbWidth - padLeft - padRight;
  const chartH = vbHeight - padTop - padBottom;

  const count = Math.max(1, data.length);
  const stepX = count > 1 ? chartW / (count - 1) : chartW;

  const points = data.map((d, idx) => {
    const x = padLeft + idx * stepX;
    const ratio = Math.min(1, Math.max(0, d.totalRevenue / maxVal));
    const y = padTop + chartH - chartH * ratio;
    return { x, y, d, idx };
  });

  // Build smooth bezier SVG path
  const pathD = useMemo(() => {
    if (points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const cpX1 = p0.x + (p1.x - p0.x) / 2;
      const cpY1 = p0.y;
      const cpX2 = p0.x + (p1.x - p0.x) / 2;
      const cpY2 = p1.y;
      d += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${p1.x} ${p1.y}`;
    }
    return d;
  }, [points]);

  const areaD = useMemo(() => {
    if (points.length < 2) return '';
    const last = points[points.length - 1];
    const first = points[0];
    const baselineY = padTop + chartH;
    return `${pathD} L ${last.x} ${baselineY} L ${first.x} ${baselineY} Z`;
  }, [pathD, points]);

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(ratio => ({
    val: Math.round(maxVal * ratio),
    y: padTop + chartH - chartH * ratio
  }));

  const activePoint = hoveredIndex !== null && points[hoveredIndex] ? points[hoveredIndex] : null;

  return (
    <div className="w-full h-full flex flex-col justify-between select-none">
      <div className="relative w-full h-[185px]">
        <svg
          viewBox={`0 0 ${vbWidth} ${vbHeight}`}
          className="w-full h-full overflow-visible"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="mrrAreaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#0f766e" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#0f766e" stopOpacity={0.02} />
            </linearGradient>
          </defs>

          {/* Horizontal Grid lines */}
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
              <text
                x={padLeft - 8}
                y={tick.y + 3.5}
                textAnchor="end"
                className="text-[10px] fill-slate-400 font-mono font-medium"
              >
                ₹{tick.val >= 1000 ? `${(tick.val / 1000).toFixed(tick.val % 1000 === 0 ? 0 : 1)}k` : tick.val}
              </text>
            </g>
          ))}

          {/* Gradient Area Fill */}
          {areaD && <path d={areaD} fill="url(#mrrAreaGradient)" />}

          {/* Smooth Stroke Line */}
          {pathD && (
            <path
              d={pathD}
              fill="none"
              stroke="#0f766e"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Data Points and Column Hit Areas */}
          {points.map((pt) => {
            const isHovered = hoveredIndex === pt.idx;
            const hitW = chartW / count;

            return (
              <g
                key={pt.d.month}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredIndex(pt.idx)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                {/* Invisible hit column */}
                <rect
                  x={pt.x - hitW / 2}
                  y={padTop}
                  width={hitW}
                  height={chartH + padBottom}
                  fill="transparent"
                />

                {/* Vertical guideline on hover */}
                {isHovered && (
                  <line
                    x1={pt.x}
                    y1={padTop}
                    x2={pt.x}
                    y2={padTop + chartH}
                    stroke="#0f766e"
                    strokeWidth={1.5}
                    strokeDasharray="3 3"
                  />
                )}

                {/* Outer pulse circle when hovered */}
                {isHovered && (
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={9}
                    fill="#0f766e"
                    fillOpacity={0.25}
                    className="animate-ping"
                  />
                )}

                {/* Data point circle */}
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isHovered ? 6 : 4}
                  fill="#ffffff"
                  stroke="#0f766e"
                  strokeWidth={2.5}
                  className="transition-all duration-150"
                />

                {/* Month Label */}
                <text
                  x={pt.x}
                  y={vbHeight - padBottom + 16}
                  textAnchor="middle"
                  className={`text-[10px] font-medium transition-colors ${
                    isHovered ? 'fill-teal-900 font-bold' : 'fill-slate-500'
                  }`}
                >
                  {pt.d.monthLabel || pt.d.month}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Dynamic Tooltip */}
        {activePoint && (
          <div
            className="absolute -top-3 z-20 pointer-events-none transform -translate-x-1/2 transition-all duration-150"
            style={{
              left: `${(activePoint.x / vbWidth) * 100}%`
            }}
          >
            <div className="bg-slate-900 text-white rounded-xl shadow-xl px-3 py-2 text-xs border border-slate-800 space-y-1 min-w-[160px]">
              <div className="font-bold text-[11px] text-teal-300 border-b border-slate-800 pb-1">
                {activePoint.d.monthLabel || activePoint.d.month}
              </div>
              <div className="flex items-center justify-between gap-3 text-[11px]">
                <span className="text-slate-300">Monthly Revenue:</span>
                <span className="font-mono font-black text-emerald-400">
                  ₹{activePoint.d.totalRevenue.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 text-[10px] text-slate-400">
                <span>Consultations:</span>
                <span className="font-mono text-slate-200">
                  ₹{activePoint.d.consultationRevenue.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 text-[10px] text-slate-400">
                <span>Procedures:</span>
                <span className="font-mono text-slate-200">
                  ₹{activePoint.d.procedureRevenue.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 text-[10px] pt-1 border-t border-slate-800 text-slate-400">
                <span>Unique Patients:</span>
                <span className="font-bold text-teal-300">{activePoint.d.uniquePatients}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-6 pt-1 text-[11px] font-semibold text-slate-600">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-teal-700 inline-block" />
          <span className="w-2 h-2 rounded-full border-2 border-teal-700 bg-white inline-block" />
          <span>Monthly Recurring Revenue (MRR) Curve</span>
        </div>
      </div>
    </div>
  );
};

export const PracticeRevenueWidget: React.FC<PracticeRevenueWidgetProps> = ({
  revenue,
  onSelectPatient,
}) => {
  const [activeTab, setActiveTab] = useState<'daily' | 'monthly' | 'mix'>('daily');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'high_value' | 'with_procedures' | 'repeat_visits'>('all');
  const [sortBy, setSortBy] = useState<'revenue_desc' | 'visits_desc' | 'recent' | 'name'>('revenue_desc');
  const [expandedPatientId, setExpandedPatientId] = useState<string | null>(null);

  if (!revenue) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-8 text-center space-y-3">
        <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-xs font-semibold text-slate-600">Calculating practice revenue & patient ledger...</p>
      </div>
    );
  }

  // Filter and sort patient breakdown
  const filteredPatients = useMemo(() => {
    let list = [...(revenue.patientBreakdown || [])];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        p => p.patientName.toLowerCase().includes(q) || p.patientCode.toLowerCase().includes(q)
      );
    }

    if (filterType === 'high_value') {
      list = list.filter(p => p.totalRevenue >= 1500);
    } else if (filterType === 'with_procedures') {
      list = list.filter(p => p.procedureCount > 0);
    } else if (filterType === 'repeat_visits') {
      list = list.filter(p => p.visitCount >= 2);
    }

    list.sort((a, b) => {
      if (sortBy === 'revenue_desc') return b.totalRevenue - a.totalRevenue;
      if (sortBy === 'visits_desc') return b.visitCount - a.visitCount;
      if (sortBy === 'recent') {
        return new Date(b.lastVisitDate || 0).getTime() - new Date(a.lastVisitDate || 0).getTime();
      }
      if (sortBy === 'name') return a.patientName.localeCompare(b.patientName);
      return 0;
    });

    return list;
  }, [revenue.patientBreakdown, searchQuery, filterType, sortBy]);

  // Export itemized CSV
  const handleExportCSV = () => {
    const headers = [
      'Patient Name',
      'Patient Code',
      'Age',
      'Gender',
      'Total Revenue (INR)',
      'Consultation Revenue (INR)',
      'Procedure Revenue (INR)',
      'Visit Count',
      'Procedure Count',
      'Last Visit Date',
      'Procedures Conducted'
    ];

    const rows = (revenue.patientBreakdown || []).map(p => [
      `"${p.patientName}"`,
      `"${p.patientCode}"`,
      p.age,
      p.gender,
      p.totalRevenue,
      p.consultationRevenue,
      p.procedureRevenue,
      p.visitCount,
      p.procedureCount,
      p.lastVisitDate ? p.lastVisitDate.split('T')[0] : 'N/A',
      `"${p.proceduresList.map(pr => `${pr.name} (₹${pr.cost})`).join('; ')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `practice_revenue_ledger_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  const toggleExpand = (patientId: string) => {
    setExpandedPatientId(prev => (prev === patientId ? null : patientId));
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return 'N/A';
    try {
      return new Date(isoString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return isoString;
    }
  };

  // Consultation vs Procedure share
  const totalRev = Math.max(1, revenue.allTimeRevenue);
  const consultPct = Math.round((revenue.totalConsultationsRevenue / totalRev) * 100);
  const procPct = 100 - consultPct;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-6 space-y-6 animate-in fade-in duration-200">
      {/* Widget Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
            <Receipt className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                Practice Revenue & Billing Dashboard
              </h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-200">
                Live Ledger
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Aggregated daily collections, Monthly Recurring Revenue (MRR), and itemized patient billing across past visits and procedures
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold shadow-2xs transition"
            title="Download CSV breakdown"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold shadow-2xs transition"
            title="Print financial summary"
          >
            <Printer className="w-3.5 h-3.5 text-slate-600" />
            <span>Print Ledger</span>
          </button>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        {/* 1. Daily Total Revenue */}
        <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-100/80 space-y-1">
          <div className="flex items-center justify-between text-emerald-800">
            <span className="text-[10px] font-bold uppercase tracking-wider block">
              Daily Total (Today)
            </span>
            <Calendar className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-950 tracking-tight tabular-nums">
            ₹{revenue.dailyTotalRevenue.toLocaleString('en-IN')}
          </div>
          <div className="flex items-center gap-1 text-[11px] font-medium text-emerald-700">
            {revenue.dailyChangePercent >= 0 ? (
              <>
                <TrendingUp className="w-3 h-3 text-emerald-600" />
                <span>+{revenue.dailyChangePercent}% vs y&apos;day</span>
              </>
            ) : (
              <>
                <TrendingDown className="w-3 h-3 text-rose-600" />
                <span>{revenue.dailyChangePercent}% vs y&apos;day</span>
              </>
            )}
          </div>
        </div>

        {/* 2. Monthly Recurring Revenue (MRR) */}
        <div className="p-4 rounded-xl bg-teal-50/50 border border-teal-100/80 space-y-1">
          <div className="flex items-center justify-between text-teal-800">
            <span className="text-[10px] font-bold uppercase tracking-wider block">
              Monthly Recurring (MRR)
            </span>
            <TrendingUp className="w-3.5 h-3.5 text-teal-600" />
          </div>
          <div className="text-2xl font-black text-teal-950 tracking-tight tabular-nums">
            ₹{revenue.monthlyRecurringRevenue.toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] font-medium text-teal-700 truncate">
            {revenue.mrrGrowthPercent >= 0 ? `+${revenue.mrrGrowthPercent}%` : `${revenue.mrrGrowthPercent}%`} rolling 30d retention
          </div>
        </div>

        {/* 3. Current Month Revenue (MTD) */}
        <div className="p-4 rounded-xl bg-indigo-50/50 border border-indigo-100/80 space-y-1">
          <div className="flex items-center justify-between text-indigo-800">
            <span className="text-[10px] font-bold uppercase tracking-wider block">
              Month to Date (MTD)
            </span>
            <Calendar className="w-3.5 h-3.5 text-indigo-600" />
          </div>
          <div className="text-2xl font-black text-indigo-950 tracking-tight tabular-nums">
            ₹{revenue.currentMonthRevenue.toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] font-medium text-indigo-700">
            Current calendar month
          </div>
        </div>

        {/* 4. Procedures Revenue */}
        <div className="p-4 rounded-xl bg-amber-50/50 border border-amber-100/80 space-y-1">
          <div className="flex items-center justify-between text-amber-800">
            <span className="text-[10px] font-bold uppercase tracking-wider block">
              Procedures Billed
            </span>
            <Stethoscope className="w-3.5 h-3.5 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-amber-950 tracking-tight tabular-nums">
            ₹{revenue.totalProceduresRevenue.toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] font-medium text-amber-700">
            {revenue.totalProceduresCount} clinical procedure(s)
          </div>
        </div>

        {/* 5. Avg Revenue Per Patient (ARPP) */}
        <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-100/80 space-y-1 col-span-2 md:col-span-1">
          <div className="flex items-center justify-between text-blue-800">
            <span className="text-[10px] font-bold uppercase tracking-wider block">
              Avg Rev / Patient
            </span>
            <Users className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <div className="text-2xl font-black text-blue-950 tracking-tight tabular-nums">
            ₹{revenue.avgRevenuePerPatient.toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] font-medium text-blue-700">
            Across {revenue.activeBillingPatientsCount} billed patient(s)
          </div>
        </div>
      </div>

      {/* Visual Analytics & Trends Section */}
      <div className="bg-slate-50/70 p-4 rounded-2xl border border-slate-200/80 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-slate-700" />
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Revenue Dynamics & Temporal Breakdown
            </h3>
          </div>

          <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('daily')}
              className={`px-3 py-1 rounded-lg font-semibold transition ${
                activeTab === 'daily'
                  ? 'bg-teal-800 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Daily Trend (14d)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('monthly')}
              className={`px-3 py-1 rounded-lg font-semibold transition ${
                activeTab === 'monthly'
                  ? 'bg-teal-800 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Monthly MRR Trend (6m)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('mix')}
              className={`px-3 py-1 rounded-lg font-semibold transition ${
                activeTab === 'mix'
                  ? 'bg-teal-800 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Service Stream Mix
            </button>
          </div>
        </div>

        {/* Chart View */}
        <div className="h-64 w-full pt-2">
          {activeTab === 'daily' && (
            <DailyStackedBarChart data={revenue.dailyTrend || []} />
          )}

          {activeTab === 'monthly' && (
            <MonthlyMRRAreaChart data={revenue.monthlyTrend || []} />
          )}

          {activeTab === 'mix' && (
            <div className="h-full flex flex-col justify-center space-y-5 px-4 sm:px-12">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-teal-700 inline-block" />
                    Consultation Visits ({consultPct}%)
                  </span>
                  <span className="tabular-nums font-bold text-slate-900">
                    ₹{revenue.totalConsultationsRevenue.toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="w-full h-3 rounded-full bg-slate-200 overflow-hidden flex">
                  <div style={{ width: `${consultPct}%` }} className="h-full bg-teal-700 transition-all duration-500" />
                  <div style={{ width: `${procPct}%` }} className="h-full bg-amber-500 transition-all duration-500" />
                </div>
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-amber-500 inline-block" />
                    Clinical Procedures ({procPct}%)
                  </span>
                  <span className="tabular-nums font-bold text-slate-900">
                    ₹{revenue.totalProceduresRevenue.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs text-slate-600 bg-white p-3.5 rounded-xl border border-slate-200">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">All-time Aggregate Collections</span>
                  <span className="text-base font-extrabold text-slate-900">₹{revenue.allTimeRevenue.toLocaleString('en-IN')}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Procedure Adoption Rate</span>
                  <span className="text-base font-extrabold text-amber-700">{procPct}% of practice revenue</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Itemized Revenue Breakdown Per Individual Patient */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <span>Itemized Revenue Breakdown by Individual Patient</span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                {filteredPatients.length} patient(s)
              </span>
            </h3>
            <p className="text-xs text-slate-500">
              Complete transactional ledger across past visits and procedural interventions
            </p>
          </div>

          {/* Search & Sort Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search patient name, code..."
                className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500 bg-slate-50 focus:bg-white w-48 sm:w-56"
              />
            </div>

            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value as any)}
              className="text-xs border border-slate-200 rounded-xl px-2.5 py-1.5 bg-slate-50 text-slate-700 focus:outline-none focus:border-teal-500 font-medium"
            >
              <option value="all">All Patients</option>
              <option value="high_value">High Spend (≥₹1.5k)</option>
              <option value="with_procedures">With Procedures</option>
              <option value="repeat_visits">Repeat Visits (≥2)</option>
            </select>

            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="text-xs border border-slate-200 rounded-xl px-2.5 py-1.5 bg-slate-50 text-slate-700 focus:outline-none focus:border-teal-500 font-medium"
            >
              <option value="revenue_desc">Highest Revenue</option>
              <option value="visits_desc">Most Visits</option>
              <option value="recent">Most Recent</option>
              <option value="name">Alphabetical</option>
            </select>
          </div>
        </div>

        {/* Patient Itemized Table / List */}
        {filteredPatients.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-2xl">
            No patient records match the selected search or filter criteria.
          </div>
        ) : (
          <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100">
            {/* Table Header */}
            <div className="bg-slate-50 px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 grid grid-cols-12 gap-3 items-center">
              <div className="col-span-4 sm:col-span-3">Patient</div>
              <div className="col-span-3 sm:col-span-2 text-right">Total Revenue</div>
              <div className="hidden sm:block col-span-2 text-center">Visits & Fees</div>
              <div className="hidden sm:block col-span-3">Procedures Performed</div>
              <div className="col-span-5 sm:col-span-2 text-right">Actions</div>
            </div>

            {/* Table Rows */}
            {filteredPatients.map(p => {
              const isExpanded = expandedPatientId === p.patientId;

              return (
                <div key={p.patientId} className="transition-colors hover:bg-slate-50/70">
                  {/* Summary Row */}
                  <div className="px-4 py-3.5 grid grid-cols-12 gap-3 items-center text-xs">
                    {/* Patient Name & Code */}
                    <div className="col-span-4 sm:col-span-3">
                      <div
                        onClick={() => onSelectPatient(p.patientId)}
                        className="font-bold text-slate-900 hover:text-teal-800 cursor-pointer truncate transition-colors"
                      >
                        {p.patientName}
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                        <span className="font-mono text-teal-800 bg-slate-100 px-1 rounded">{p.patientCode}</span>
                        <span>•</span>
                        <span>{p.age}y, {p.gender}</span>
                      </div>
                    </div>

                    {/* Total Revenue */}
                    <div className="col-span-3 sm:col-span-2 text-right">
                      <div className="font-black text-slate-900 tabular-nums text-sm">
                        ₹{p.totalRevenue.toLocaleString('en-IN')}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {p.visitCount} encounter(s)
                      </div>
                    </div>

                    {/* Visits & Fees */}
                    <div className="hidden sm:block col-span-2 text-center">
                      <span className="font-semibold text-slate-700">
                        ₹{p.consultationRevenue.toLocaleString('en-IN')}
                      </span>
                      <span className="text-[11px] text-slate-400 block">
                        from {p.visitCount} consultation(s)
                      </span>
                    </div>

                    {/* Procedures Performed */}
                    <div className="hidden sm:block col-span-3">
                      {p.procedureCount === 0 ? (
                        <span className="text-[11px] text-slate-400 italic">No procedures recorded</span>
                      ) : (
                        <div>
                          <span className="font-semibold text-amber-700">
                            ₹{p.procedureRevenue.toLocaleString('en-IN')}
                          </span>
                          <span className="text-[11px] text-slate-500 block truncate">
                            {p.proceduresList.map(pr => pr.name).join(', ')}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="col-span-5 sm:col-span-2 flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => toggleExpand(p.patientId)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition ${
                          isExpanded
                            ? 'bg-teal-800 text-white shadow-2xs'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                      >
                        <span>{isExpanded ? 'Hide' : 'Itemize'}</span>
                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => onSelectPatient(p.patientId)}
                        className="p-1 text-slate-400 hover:text-teal-800 transition"
                        title="Open Patient Profile"
                      >
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded Itemized Ledger */}
                  {isExpanded && (
                    <div className="p-4 bg-slate-50/90 border-t border-slate-200/80 space-y-4 animate-in fade-in">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                        <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <Receipt className="w-3.5 h-3.5 text-teal-700" />
                          <span>Detailed Billing Ledger for {p.patientName}</span>
                        </span>
                        <span className="text-xs font-bold text-teal-950">
                          Total Patient Spend: ₹{p.totalRevenue.toLocaleString('en-IN')}
                        </span>
                      </div>

                      {/* Chronological Visits Breakdown */}
                      <div className="space-y-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                          Past Visits & Encounter Fees:
                        </span>
                        {p.visits.length === 0 ? (
                          <p className="text-xs text-slate-400 italic">No past visits recorded.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {p.visits.map((v, i) => (
                              <div
                                key={v.consultationId}
                                className="p-3 rounded-xl bg-white border border-slate-200/80 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs"
                              >
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-slate-900">
                                      Visit #{p.visits.length - i} · {formatDate(v.date)}
                                    </span>
                                    <span className="text-[11px] text-slate-500">
                                      Attending: {v.doctorName}
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-slate-500 mt-0.5">
                                    Diagnoses: {v.diagnoses.join(', ') || 'General encounter'}
                                  </div>
                                </div>

                                <div className="text-right sm:text-right flex sm:flex-col items-center sm:items-end justify-between gap-1 pt-1 sm:pt-0 border-t sm:border-0 border-slate-100">
                                  <div className="text-slate-600 text-[11px]">
                                    Consultation Fee: <strong className="text-slate-800 font-bold">₹{v.fee}</strong>
                                    {v.procedures.length > 0 && (
                                      <span> + Procedures: <strong className="text-amber-700 font-bold">₹{v.procedures.reduce((s, pr) => s + pr.cost, 0)}</strong></span>
                                    )}
                                  </div>
                                  <span className="text-xs font-black text-slate-900 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-200">
                                    Visit Total: ₹{v.totalAmount}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Itemized Procedures Breakdown */}
                      {p.proceduresList.length > 0 && (
                        <div className="space-y-2 pt-2 border-t border-slate-200/80">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                            Itemized Procedures Conducted ({p.proceduresList.length}):
                          </span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {p.proceduresList.map(proc => (
                              <div
                                key={proc.id}
                                className="p-2.5 rounded-xl bg-white border border-amber-200/80 flex items-center justify-between text-xs shadow-2xs"
                              >
                                <div>
                                  <div className="font-bold text-slate-800">{proc.name}</div>
                                  <div className="text-[10px] text-slate-400">Date: {formatDate(proc.date)}</div>
                                </div>
                                <div className="text-right">
                                  <span className="font-black text-amber-700 text-xs">₹{proc.cost}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
