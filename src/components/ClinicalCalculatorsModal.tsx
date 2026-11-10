import React, { useState, useMemo } from 'react';
import { Calculator, X, Check, Sparkles, Activity, Info } from 'lucide-react';

export interface ClinicalScoreEntry {
  calculator: 'PASI' | 'SCORAD' | 'DLQI';
  score: number;
  maxScore: number;
  severityLabel: string;
  summaryLine: string;
  detailedBreakdown: string;
}

interface ClinicalCalculatorsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'PASI' | 'SCORAD' | 'DLQI';
  onApplyScore: (entry: ClinicalScoreEntry) => void;
}

interface PasiRegionState {
  area: number; // 0-6 (0%, <10%, 10-29%, 30-49%, 50-69%, 70-89%, 90-100%)
  erythema: number; // 0-4
  induration: number; // 0-4
  desquamation: number; // 0-4
}

const PASI_AREA_LABELS = [
  '0 (0%)',
  '1 (<10%)',
  '2 (10–29%)',
  '3 (30–49%)',
  '4 (50–69%)',
  '5 (70–89%)',
  '6 (90–100%)'
];

const DLQI_QUESTIONS = [
  '1. Over the last week, how itchy, sore, painful or stinging has your skin been?',
  '2. Over the last week, how embarrassed or self-conscious have you been because of your skin?',
  '3. Over the last week, how much has your skin interfered with you going shopping or looking after your home or garden?',
  '4. Over the last week, how much has your skin influenced the clothes you wear?',
  '5. Over the last week, how much has your skin affected any social or leisure activities?',
  '6. Over the last week, how much has your skin made it difficult for you to do any sport?',
  '7. Over the last week, has your skin prevented you from working or studying (or how much of a problem has it been)?',
  '8. Over the last week, how much has your skin created problems with your partner or any of your close friends or relatives?',
  '9. Over the last week, how much has your skin caused any sexual difficulties?',
  '10. Over the last week, how much of a problem has the treatment for your skin been (e.g. making home messy or taking up time)?'
];

export const ClinicalCalculatorsModal: React.FC<ClinicalCalculatorsModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'PASI',
  onApplyScore
}) => {
  const [activeCalc, setActiveCalc] = useState<'PASI' | 'SCORAD' | 'DLQI'>(initialTab);

  // 1. PASI State (Head 0.1, Upper Limbs 0.2, Trunk 0.3, Lower Limbs 0.4)
  const [pasiRegions, setPasiRegions] = useState<Record<'head' | 'upper' | 'trunk' | 'lower', PasiRegionState>>({
    head: { area: 1, erythema: 2, induration: 1, desquamation: 2 },
    upper: { area: 2, erythema: 2, induration: 2, desquamation: 2 },
    trunk: { area: 2, erythema: 2, induration: 2, desquamation: 1 },
    lower: { area: 2, erythema: 2, induration: 2, desquamation: 2 }
  });

  // 2. SCORAD State
  const [scoradBsa, setScoradBsa] = useState<number>(18); // A: 0-100%
  const [scoradIntensity, setScoradIntensity] = useState({
    erythema: 2,
    edema: 1,
    oozing: 1,
    excoriation: 2,
    lichenification: 1,
    dryness: 2
  }); // B: 6 items, 0-3 each (max 18)
  const [scoradPruritus, setScoradPruritus] = useState<number>(6); // 0-10 VAS
  const [scoradSleepLoss, setScoradSleepLoss] = useState<number>(4); // 0-10 VAS

  // 3. DLQI State (10 items, 0-3 each)
  const [dlqiAnswers, setDlqiAnswers] = useState<number[]>([2, 2, 1, 2, 1, 0, 1, 1, 0, 1]);

  // Compute PASI Score (0 - 72)
  const pasiResult = useMemo<ClinicalScoreEntry>(() => {
    const calcSub = (r: PasiRegionState, weight: number) =>
      weight * r.area * (r.erythema + r.induration + r.desquamation);

    const headSub = calcSub(pasiRegions.head, 0.1);
    const upperSub = calcSub(pasiRegions.upper, 0.2);
    const trunkSub = calcSub(pasiRegions.trunk, 0.3);
    const lowerSub = calcSub(pasiRegions.lower, 0.4);
    const total = Number((headSub + upperSub + trunkSub + lowerSub).toFixed(1));

    const severityLabel =
      total < 5
        ? 'Mild Psoriasis (< 5)'
        : total <= 10
        ? 'Moderate Psoriasis (5–10)'
        : 'Moderate-to-Severe Psoriasis (> 10 · Systemic/Biologic Candidate)';

    return {
      calculator: 'PASI',
      score: total,
      maxScore: 72,
      severityLabel,
      summaryLine: `PASI Score: ${total}/72 (${severityLabel})`,
      detailedBreakdown: `PASI Score: ${total}/72 [${severityLabel}] — Head: ${headSub.toFixed(1)}, Upper Limbs: ${upperSub.toFixed(1)}, Trunk: ${trunkSub.toFixed(1)}, Lower Limbs: ${lowerSub.toFixed(1)}.`
    };
  }, [pasiRegions]);

  // Compute SCORAD Score (A/5 + 7B/2 + C, max 103)
  const scoradResult = useMemo<ClinicalScoreEntry>(() => {
    const A = Math.min(100, Math.max(0, scoradBsa));
    const B =
      scoradIntensity.erythema +
      scoradIntensity.edema +
      scoradIntensity.oozing +
      scoradIntensity.excoriation +
      scoradIntensity.lichenification +
      scoradIntensity.dryness;
    const C = scoradPruritus + scoradSleepLoss;
    const total = Number((A / 5 + (7 * B) / 2 + C).toFixed(1));

    const severityLabel =
      total < 25
        ? 'Mild Atopic Dermatitis (< 25)'
        : total <= 50
        ? 'Moderate Atopic Dermatitis (25–50)'
        : 'Severe Atopic Dermatitis (> 50 · Systemic Immunomodulator / Dupilumab Candidate)';

    return {
      calculator: 'SCORAD',
      score: total,
      maxScore: 103,
      severityLabel,
      summaryLine: `SCORAD Score: ${total}/103 (${severityLabel})`,
      detailedBreakdown: `SCORAD Score: ${total}/103 [${severityLabel}] — BSA Extent (A): ${A}%, Intensity Sum (B): ${B}/18, Subjective Pruritus+Sleep Loss (C): ${C}/20.`
    };
  }, [scoradBsa, scoradIntensity, scoradPruritus, scoradSleepLoss]);

  // Compute DLQI Score (0 - 30)
  const dlqiResult = useMemo<ClinicalScoreEntry>(() => {
    const total = dlqiAnswers.reduce((acc, v) => acc + v, 0);
    const severityLabel =
      total <= 1
        ? 'No effect on patient life (0–1)'
        : total <= 5
        ? 'Small effect on quality of life (2–5)'
        : total <= 10
        ? 'Moderate effect on quality of life (6–10)'
        : total <= 20
        ? 'Very large effect on quality of life (11–20)'
        : 'Extremely large effect on quality of life (21–30)';

    return {
      calculator: 'DLQI',
      score: total,
      maxScore: 30,
      severityLabel,
      summaryLine: `DLQI Score: ${total}/30 (${severityLabel})`,
      detailedBreakdown: `DLQI (Dermatology Life Quality Index): ${total}/30 [${severityLabel}].`
    };
  }, [dlqiAnswers]);

  if (!isOpen) return null;

  const activeEntry =
    activeCalc === 'PASI' ? pasiResult : activeCalc === 'SCORAD' ? scoradResult : dlqiResult;

  const updatePasiField = (
    region: 'head' | 'upper' | 'trunk' | 'lower',
    field: keyof PasiRegionState,
    val: number
  ) => {
    setPasiRegions(prev => ({
      ...prev,
      [region]: { ...prev[region], [field]: val }
    }));
  };

  return (
    <div
      className="fixed inset-0 z-[90] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-teal-900 via-teal-800 to-emerald-900 text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center border border-white/20">
              <Calculator className="w-5 h-5 text-teal-200" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight flex items-center gap-2">
                <span>Standardized Clinical Severity Calculators</span>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-teal-400/20 text-teal-100 border border-teal-300/30">
                  CDSS Validated Indices
                </span>
              </h3>
              <p className="text-xs text-teal-100/80 mt-0.5">
                Quantitative scoring for Psoriasis (PASI), Atopic Dermatitis (SCORAD), and Quality of Life (DLQI)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-teal-100 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Calculator Selector Tabs */}
        <div className="px-5 pt-3 pb-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            {([
              { id: 'PASI', label: 'PASI (Psoriasis · 0–72)', badge: pasiResult.score },
              { id: 'SCORAD', label: 'SCORAD (Eczema · 0–103)', badge: scoradResult.score },
              { id: 'DLQI', label: 'DLQI (Quality of Life · 0–30)', badge: dlqiResult.score }
            ] as const).map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveCalc(tab.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                  activeCalc === tab.id
                    ? 'bg-teal-800 text-white shadow-xs'
                    : 'bg-white text-slate-700 border border-slate-200 hover:border-teal-400'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono ${
                    activeCalc === tab.id ? 'bg-teal-950/60 text-teal-200' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {tab.badge}
                </span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <Info className="w-3.5 h-3.5 text-teal-600" />
            <span>Scores insert directly into Clinical Notes &amp; Visit Summary</span>
          </div>
        </div>

        {/* Body Content */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {activeCalc === 'PASI' && (
            <div className="space-y-4">
              <div className="p-3 bg-teal-50/70 border border-teal-200 rounded-xl text-xs text-teal-950 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <span className="font-bold">Psoriasis Area and Severity Index (PASI):</span> Grade Erythema (Redness), Induration (Thickness), and Desquamation (Scaling) from <span className="font-bold">0 (None) to 4 (Very Severe)</span> across 4 anatomical regions.
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setPasiRegions({
                      head: { area: 0, erythema: 0, induration: 0, desquamation: 0 },
                      upper: { area: 0, erythema: 0, induration: 0, desquamation: 0 },
                      trunk: { area: 0, erythema: 0, induration: 0, desquamation: 0 },
                      lower: { area: 0, erythema: 0, induration: 0, desquamation: 0 }
                    })
                  }
                  className="px-2.5 py-1 rounded-lg bg-white border border-teal-200 text-[11px] font-semibold text-teal-800 hover:bg-teal-100 cursor-pointer shrink-0"
                >
                  Reset to 0
                </button>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 text-slate-700 uppercase text-[10px] font-bold">
                    <tr>
                      <th className="p-3">Body Region (Weight)</th>
                      <th className="p-3">Surface Area (0–6)</th>
                      <th className="p-3">Erythema (0–4)</th>
                      <th className="p-3">Induration (0–4)</th>
                      <th className="p-3">Scaling (0–4)</th>
                      <th className="p-3 text-right">Sub-Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {([
                      { key: 'head', label: 'Head & Neck (0.1)', weight: 0.1 },
                      { key: 'upper', label: 'Upper Extremities (0.2)', weight: 0.2 },
                      { key: 'trunk', label: 'Trunk / Axial (0.3)', weight: 0.3 },
                      { key: 'lower', label: 'Lower Extremities (0.4)', weight: 0.4 }
                    ] as const).map(reg => {
                      const st = pasiRegions[reg.key];
                      const sub = (reg.weight * st.area * (st.erythema + st.induration + st.desquamation)).toFixed(1);
                      return (
                        <tr key={reg.key} className="hover:bg-slate-50/80">
                          <td className="p-3 font-bold text-slate-800">{reg.label}</td>
                          <td className="p-3">
                            <select
                              value={st.area}
                              onChange={e => updatePasiField(reg.key, 'area', Number(e.target.value))}
                              className="px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium"
                            >
                              {PASI_AREA_LABELS.map((lbl, idx) => (
                                <option key={idx} value={idx}>
                                  {lbl}
                                </option>
                              ))}
                            </select>
                          </td>
                          {(['erythema', 'induration', 'desquamation'] as const).map(field => (
                            <td key={field} className="p-3">
                              <div className="flex items-center gap-1">
                                {[0, 1, 2, 3, 4].map(val => (
                                  <button
                                    key={val}
                                    type="button"
                                    onClick={() => updatePasiField(reg.key, field, val)}
                                    className={`w-6 h-6 rounded-md text-[11px] font-bold border transition-colors cursor-pointer ${
                                      st[field] === val
                                        ? 'bg-teal-800 text-white border-teal-800'
                                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                                    }`}
                                  >
                                    {val}
                                  </button>
                                ))}
                              </div>
                            </td>
                          ))}
                          <td className="p-3 text-right font-mono font-bold text-teal-900">{sub}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeCalc === 'SCORAD' && (
            <div className="space-y-4">
              {/* Part A: Extent */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800">
                    Part A: Extent — Body Surface Area (BSA %) Involved (Rule of Nines)
                  </label>
                  <span className="px-2.5 py-0.5 rounded-full bg-teal-800 text-white text-xs font-mono font-bold">
                    {scoradBsa}% BSA
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={scoradBsa}
                  onChange={e => setScoradBsa(Number(e.target.value))}
                  className="w-full accent-teal-700 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500 font-medium">
                  <span>0% (Clear)</span>
                  <span>25%</span>
                  <span>50%</span>
                  <span>75%</span>
                  <span>100% (Erythrodermic)</span>
                </div>
              </div>

              {/* Part B: Intensity */}
              <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">
                    Part B: Intensity Criteria (0 = Absent, 1 = Mild, 2 = Moderate, 3 = Severe)
                  </span>
                  <span className="text-xs font-mono font-bold text-teal-800">
                    Sum B ={' '}
                    {scoradIntensity.erythema +
                      scoradIntensity.edema +
                      scoradIntensity.oozing +
                      scoradIntensity.excoriation +
                      scoradIntensity.lichenification +
                      scoradIntensity.dryness}
                    /18
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {([
                    { key: 'erythema', label: 'Erythema (Redness)' },
                    { key: 'edema', label: 'Edema / Papulation' },
                    { key: 'oozing', label: 'Oozing / Crusting' },
                    { key: 'excoriation', label: 'Excoriation (Scratching)' },
                    { key: 'lichenification', label: 'Lichenification' },
                    { key: 'dryness', label: 'Dryness / Xerosis (Uninvolved skin)' }
                  ] as const).map(item => (
                    <div key={item.key} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                      <span className="block text-[11px] font-bold text-slate-700 mb-1.5">{item.label}</span>
                      <div className="grid grid-cols-4 gap-1">
                        {[0, 1, 2, 3].map(val => (
                          <button
                            key={val}
                            type="button"
                            onClick={() =>
                              setScoradIntensity(prev => ({
                                ...prev,
                                [item.key]: val
                              }))
                            }
                            className={`py-1 rounded-md text-xs font-bold border transition-colors cursor-pointer ${
                              scoradIntensity[item.key] === val
                                ? 'bg-teal-800 text-white border-teal-800'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {val}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Part C: Subjective Symptoms */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                  <div className="flex justify-between text-xs font-bold text-slate-800">
                    <span>Pruritus / Itch VAS (Last 3 days)</span>
                    <span className="font-mono text-teal-800">{scoradPruritus}/10</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    value={scoradPruritus}
                    onChange={e => setScoradPruritus(Number(e.target.value))}
                    className="w-full accent-teal-700 cursor-pointer"
                  />
                </div>
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                  <div className="flex justify-between text-xs font-bold text-slate-800">
                    <span>Sleeplessness VAS (Last 3 nights)</span>
                    <span className="font-mono text-teal-800">{scoradSleepLoss}/10</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    value={scoradSleepLoss}
                    onChange={e => setScoradSleepLoss(Number(e.target.value))}
                    className="w-full accent-teal-700 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {activeCalc === 'DLQI' && (
            <div className="space-y-2.5">
              <div className="p-3 bg-teal-50/70 border border-teal-200 rounded-xl text-xs text-teal-950">
                <span className="font-bold">Dermatology Life Quality Index (DLQI):</span> Rate each question over the past 7 days (<span className="font-bold">0 = Not at all</span>, <span className="font-bold">1 = A little</span>, <span className="font-bold">2 = A lot</span>, <span className="font-bold">3 = Very much</span>).
              </div>
              <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl bg-white">
                {DLQI_QUESTIONS.map((q, qIdx) => (
                  <div key={qIdx} className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <span className="text-xs font-medium text-slate-800 flex-1">{q}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {[
                        { val: 0, lbl: '0 · Not at all' },
                        { val: 1, lbl: '1 · A little' },
                        { val: 2, lbl: '2 · A lot' },
                        { val: 3, lbl: '3 · Very much' }
                      ].map(opt => (
                        <button
                          key={opt.val}
                          type="button"
                          onClick={() =>
                            setDlqiAnswers(prev => prev.map((v, i) => (i === qIdx ? opt.val : v)))
                          }
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                            dlqiAnswers[qIdx] === opt.val
                              ? 'bg-teal-800 text-white border-teal-800'
                              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {opt.lbl}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Live Result & Apply Bar */}
        <div className="px-5 py-3.5 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="px-3 py-1.5 rounded-xl bg-teal-500/20 border border-teal-400/30 flex items-center gap-2">
              <Activity className="w-4 h-4 text-teal-300" />
              <span className="text-sm font-mono font-bold text-teal-200">
                {activeEntry.calculator}: {activeEntry.score}/{activeEntry.maxScore}
              </span>
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-white truncate">{activeEntry.severityLabel}</div>
              <div className="text-[11px] text-slate-300 truncate">{activeEntry.detailedBreakdown}</div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onApplyScore(activeEntry);
                onClose();
              }}
              className="px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 shadow-md transition-colors cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Insert {activeEntry.calculator} Score into Chart</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
