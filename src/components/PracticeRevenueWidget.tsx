import React, { useState, useMemo } from 'react';
import { PracticeRevenueAnalytics, PatientRevenueBreakdown } from '../types';
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  Users,
  Stethoscope,
  ChevronDown,
  ChevronUp,
  Search,
  Filter,
  Download,
  Printer,
  DollarSign,
  Activity,
  Layers,
  ArrowRight,
  Sparkles,
  Receipt,
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  PieChart as PieChartIcon,
  BarChart3
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  AreaChart,
  Area,
  CartesianGrid
} from 'recharts';

interface PracticeRevenueWidgetProps {
  revenue: PracticeRevenueAnalytics | null;
  onSelectPatient: (patientId: string) => void;
  onRefresh?: () => void;
}

export const PracticeRevenueWidget: React.FC<PracticeRevenueWidgetProps> = ({
  revenue,
  onSelectPatient,
  onRefresh
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
              Aggregated daily collections, Monthly Recurring Revenue (MRR), and itemized patient billing across consultations and procedures
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold shadow-2xs transition"
            title="Download itemized CSV ledger"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
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
            <Activity className="w-3.5 h-3.5 text-emerald-600" />
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
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenue.dailyTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="dayLabel" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={v => `₹${v}`} />
                <Tooltip
                  formatter={(val: any, name: any) => [`₹${Number(val).toLocaleString('en-IN')}`, name === 'consultationRevenue' ? 'Consultations' : 'Procedures']}
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '0.75rem', color: '#fff', fontSize: '11px' }}
                />
                <Legend
                  formatter={value => (value === 'consultationRevenue' ? 'Consultation Fees' : 'Procedure Fees')}
                  wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                />
                <Bar dataKey="consultationRevenue" stackId="a" fill="#0f766e" radius={[0, 0, 0, 0]} />
                <Bar dataKey="procedureRevenue" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}

          {activeTab === 'monthly' && (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenue.monthlyTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0f766e" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#0f766e" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="monthLabel" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={v => `₹${v}`} />
                <Tooltip
                  formatter={(val: any) => [`₹${Number(val).toLocaleString('en-IN')}`, 'Monthly Total Revenue']}
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '0.75rem', color: '#fff', fontSize: '11px' }}
                />
                <Area type="monotone" dataKey="totalRevenue" stroke="#0f766e" strokeWidth={2.5} fillOpacity={1} fill="url(#colorTotal)" />
              </AreaChart>
            </ResponsiveContainer>
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
