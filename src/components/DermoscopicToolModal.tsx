import React, { useState, useRef } from 'react';
import { Patient, ABCDEScoreResult } from '../types';
import { api } from '../lib/api';
import {
  X,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Sparkles,
  Ruler,
  AlertTriangle,
  CheckCircle2,
  Info,
  ShieldAlert,
  Copy,
  Check,
  RotateCcw
} from 'lucide-react';

interface DermoscopicToolModalProps {
  imageSrc: string;
  patient?: Patient | null;
  initialDiameterMm?: number;
  onClose: () => void;
  onApplyScore?: (score: ABCDEScoreResult) => void;
}

export const DermoscopicToolModal: React.FC<DermoscopicToolModalProps> = ({
  imageSrc,
  patient,
  initialDiameterMm = 5.0,
  onClose,
  onApplyScore
}) => {
  // Zoom & Pan state
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Caliper measurements (mm)
  const [caliperWidthMm, setCaliperWidthMm] = useState<number>(initialDiameterMm);
  const [caliperHeightMm, setCaliperHeightMm] = useState<number>(initialDiameterMm * 0.85);
  const [showGrid, setShowGrid] = useState<boolean>(true);

  // ABCDE Scores
  const [asymmetry, setAsymmetry] = useState<number>(1);
  const [border, setBorder] = useState<number>(1);
  const [color, setColor] = useState<number>(1);
  const [evolution, setEvolution] = useState<number>(0);

  // AI assessment state
  const [isAiAssessing, setIsAiAssessing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<ABCDEScoreResult | null>(null);
  const [copied, setCopied] = useState(false);

  // Computed diameter score: >=6mm is 1, else 0
  const maxDiameter = Math.max(caliperWidthMm, caliperHeightMm);
  const diameterScore = maxDiameter >= 6.0 ? 1 : 0;
  const totalScore = asymmetry + border + color + diameterScore + evolution;

  let riskCategory: ABCDEScoreResult['riskLevel'] = 'Low Risk / Benign Characteristics';
  if (totalScore >= 5) {
    riskCategory = 'High Suspicion / Urgent Dermoscopy or Biopsy';
  } else if (totalScore >= 3) {
    riskCategory = 'Moderate Risk / Dysplastic / Follow-up Needed';
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomLevel <= 1) return;
    setIsPanning(true);
    panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    setPan({
      x: e.clientX - panStartRef.current.x,
      y: e.clientY - panStartRef.current.y
    });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const handleResetView = () => {
    setZoomLevel(1);
    setPan({ x: 0, y: 0 });
  };

  // Run AI ABCDE assessment
  const handleRunAiABCDE = async () => {
    setIsAiAssessing(true);
    setAiError(null);
    try {
      const res = await api.ai.assessABCDE({
        imageBase64: imageSrc,
        patientId: patient?.id,
        estimatedDiameterMm: maxDiameter,
        clinicalNotes: `Doctor inspecting with digital caliper (Width: ${caliperWidthMm}mm, Height: ${caliperHeightMm}mm).`
      });

      const abcde = res.abcde;
      setAiResult(abcde);
      setAsymmetry(abcde.asymmetryScore);
      setBorder(abcde.borderScore);
      setColor(abcde.colorScore);
      setEvolution(abcde.evolutionScore);
      if (abcde.diameterMm) {
        setCaliperWidthMm(abcde.diameterMm);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'AI ABCDE analysis failed';
      setAiError(message);
    } finally {
      setIsAiAssessing(false);
    }
  };

  const handleCopySummary = () => {
    const summary = [
      `DERMOSCOPIC ABCDE ASSESSMENT REPORT`,
      patient ? `Patient: ${patient.fullName} (${patient.patientCode})` : 'Unlinked Specimen',
      `Date: ${new Date().toLocaleDateString()}`,
      `Measured Dimensions: ${caliperWidthMm.toFixed(1)} mm x ${caliperHeightMm.toFixed(1)} mm (Max Diameter: ${maxDiameter.toFixed(1)} mm)`,
      `ABCDE Score Breakdown:`,
      `• Asymmetry (A): ${asymmetry}/2`,
      `• Border (B): ${border}/2`,
      `• Color (C): ${color}/2`,
      `• Diameter >=6mm (D): ${diameterScore}/1`,
      `• Evolution (E): ${evolution}/2`,
      `TOTAL ABCDE SCORE: ${totalScore}/9`,
      `RISK STRATIFICATION: ${riskCategory}`,
      aiResult ? `AI Recommendations: ${aiResult.recommendations.join('; ')}` : ''
    ].filter(Boolean).join('\n');

    navigator.clipboard.writeText(summary).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleApply = () => {
    const scoreObj: ABCDEScoreResult = aiResult || {
      id: `abcde_${Date.now()}`,
      asymmetryScore: asymmetry,
      asymmetryNotes: asymmetry === 0 ? 'Symmetric' : asymmetry === 1 ? '1-axis asymmetry' : '2-axis asymmetry',
      borderScore: border,
      borderNotes: border === 0 ? 'Regular' : border === 1 ? 'Uneven/scalloped' : 'Ragged/abrupt',
      colorScore: color,
      colorNotes: color === 0 ? 'Monochromatic' : color === 1 ? '2-3 colors' : 'Variegated (4+ colors)',
      diameterMm: maxDiameter,
      diameterScore,
      diameterNotes: `${maxDiameter.toFixed(1)} mm`,
      evolutionScore: evolution,
      evolutionNotes: evolution === 0 ? 'Stable' : 'Changing morphology',
      totalScore,
      riskLevel: riskCategory,
      recommendations: totalScore >= 5 ? ['Urgent biopsy recommended'] : ['Follow-up in 3 months'],
      disclaimer: 'Dermoscopic decision support evaluation.',
      isAiPowered: false,
      analyzedAt: new Date().toISOString()
    };

    if (onApplyScore) {
      onApplyScore(scoreObj);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-5xl shadow-2xl flex flex-col max-h-[94vh] border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white rounded-t-2xl flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 rounded-lg bg-teal-500/20 text-teal-400 border border-teal-500/30">
              <Ruler className="w-4 h-4" />
            </span>
            <div>
              <h2 className="text-sm font-bold tracking-tight text-white flex items-center gap-2">
                Dermoscopic Caliper & ABCDE Risk Scoring Suite
                <span className="text-[10px] px-2 py-0.5 rounded bg-teal-800 text-teal-200 font-semibold">
                  Step 4 Tool
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                High-magnification dermoscopy inspection, mm lesion caliper, and dermatological ABCDE risk criteria
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Workspace Body */}
        <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 overflow-hidden divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
          {/* LEFT: Interactive Magnifier & Digital Caliper (7 cols) */}
          <div className="lg:col-span-7 p-4 sm:p-6 flex flex-col bg-slate-950 text-white select-none">
            {/* Viewer Controls */}
            <div className="flex items-center justify-between mb-3 bg-slate-900/80 p-2 rounded-xl border border-slate-800 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">
                  Magnification:
                </span>
                {[1, 2, 3, 4].map(lvl => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setZoomLevel(lvl)}
                    className={`px-2.5 py-1 rounded text-xs font-bold transition ${
                      zoomLevel === lvl
                        ? 'bg-teal-500 text-slate-950'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {lvl}x
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowGrid(!showGrid)}
                  className={`px-2 py-1 rounded text-[11px] font-semibold border transition ${
                    showGrid
                      ? 'border-teal-500/50 bg-teal-950/60 text-teal-300'
                      : 'border-slate-800 bg-slate-800/60 text-slate-400'
                  }`}
                >
                  {showGrid ? 'Grid: ON' : 'Grid: OFF'}
                </button>
                <button
                  type="button"
                  onClick={handleResetView}
                  className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition"
                  title="Reset view"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Image Canvas Box */}
            <div
              className="relative flex-1 min-h-[300px] sm:min-h-[380px] bg-black/60 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center cursor-move"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              <div
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoomLevel})`,
                  transition: isPanning ? 'none' : 'transform 0.15s ease-out'
                }}
                className="max-w-full max-h-full flex items-center justify-center relative"
              >
                <img
                  src={imageSrc}
                  alt="Dermoscopic view"
                  className="max-h-[360px] object-contain rounded"
                  draggable={false}
                />

                {/* Optional Millimeter Grid Overlay */}
                {showGrid && (
                  <div
                    className="absolute inset-0 pointer-events-none opacity-25"
                    style={{
                      backgroundImage:
                        'linear-gradient(to right, rgba(45, 212, 191, 0.4) 1px, transparent 1px), linear-gradient(to bottom, rgba(45, 212, 191, 0.4) 1px, transparent 1px)',
                      backgroundSize: '24px 24px'
                    }}
                  />
                )}

                {/* Digital Caliper Overlay Reticle */}
                <div
                  className="absolute border-2 border-teal-400/80 rounded pointer-events-none flex items-center justify-center shadow-lg"
                  style={{
                    width: `${Math.min(260, caliperWidthMm * 20)}px`,
                    height: `${Math.min(220, caliperHeightMm * 20)}px`,
                    boxShadow: '0 0 15px rgba(20, 184, 166, 0.3)'
                  }}
                >
                  {/* Crosshairs */}
                  <div className="absolute w-full h-[1px] bg-teal-400/40" />
                  <div className="absolute h-full w-[1px] bg-teal-400/40" />
                  {/* Caliper Measurement Badge */}
                  <div className="absolute -top-7 bg-teal-500 text-slate-950 font-mono text-[10px] font-black px-2 py-0.5 rounded shadow">
                    {caliperWidthMm.toFixed(1)} mm × {caliperHeightMm.toFixed(1)} mm
                  </div>
                </div>
              </div>

              {zoomLevel > 1 && (
                <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-xs text-[10px] text-slate-400 px-2 py-1 rounded">
                  Drag with mouse to pan inspection area
                </div>
              )}
            </div>

            {/* Caliper Sliders */}
            <div className="mt-4 p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <Ruler className="w-3.5 h-3.5 text-teal-400" />
                  Lesion Caliper Dimension Controls:
                </span>
                <span className="font-mono text-teal-300 font-bold">
                  Max Diameter: {maxDiameter.toFixed(1)} mm {maxDiameter >= 6.0 ? '(≥6mm Criterion Met)' : '(<6mm)'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-1">
                <div>
                  <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                    <span>Width (Axis 1):</span>
                    <span className="text-white font-mono">{caliperWidthMm.toFixed(1)} mm</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="25"
                    step="0.5"
                    value={caliperWidthMm}
                    onChange={e => setCaliperWidthMm(parseFloat(e.target.value))}
                    className="w-full accent-teal-400 cursor-pointer h-1.5 bg-slate-700 rounded-lg"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                    <span>Height (Axis 2):</span>
                    <span className="text-white font-mono">{caliperHeightMm.toFixed(1)} mm</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="25"
                    step="0.5"
                    value={caliperHeightMm}
                    onChange={e => setCaliperHeightMm(parseFloat(e.target.value))}
                    className="w-full accent-teal-400 cursor-pointer h-1.5 bg-slate-700 rounded-lg"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: ABCDE Scoring & AI Analysis (5 cols) */}
          <div className="lg:col-span-5 p-5 overflow-y-auto space-y-4 bg-slate-50 flex flex-col justify-between">
            <div className="space-y-4">
              {/* AI Auto-Evaluation Action */}
              <div className="bg-white p-3.5 rounded-xl border border-teal-200/80 shadow-2xs">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-teal-900">
                    <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                    Multimodal Vision ABCDE AI
                  </div>
                  <button
                    type="button"
                    onClick={handleRunAiABCDE}
                    disabled={isAiAssessing}
                    className="px-3 py-1.5 bg-teal-800 hover:bg-teal-900 text-white rounded-lg text-xs font-bold shadow-xs transition flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isAiAssessing ? (
                      <>
                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Evaluating...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3 h-3" />
                        <span>Auto-Assess with AI</span>
                      </>
                    )}
                  </button>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Let Gemini inspect lesion symmetry, borders, color variegation, and surface morphology to suggest clinical criteria.
                </p>
                {aiError && (
                  <p className="text-[11px] text-red-600 mt-1 font-semibold">{aiError}</p>
                )}
              </div>

              {/* ABCDE Interactive Criteria Checklist */}
              <div className="space-y-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Clinical ABCDE Criteria Matrix
                </h3>

                {/* A: Asymmetry */}
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-slate-900">
                      A — Asymmetry
                    </span>
                    <span className="text-[11px] font-mono font-bold text-teal-800">
                      Score: {asymmetry}/2
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-[11px]">
                    {[
                      { val: 0, label: 'Symmetric (0)' },
                      { val: 1, label: '1-Axis (1)' },
                      { val: 2, label: '2-Axes (2)' }
                    ].map(opt => (
                      <button
                        key={opt.val}
                        type="button"
                        onClick={() => setAsymmetry(opt.val)}
                        className={`p-1.5 rounded-lg border text-center font-medium transition ${
                          asymmetry === opt.val
                            ? 'bg-teal-50 border-teal-500 text-teal-900 font-bold'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {aiResult?.asymmetryNotes && (
                    <p className="text-[10px] text-slate-500 italic mt-1.5">
                      AI Note: {aiResult.asymmetryNotes}
                    </p>
                  )}
                </div>

                {/* B: Border */}
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-slate-900">
                      B — Border Irregularity
                    </span>
                    <span className="text-[11px] font-mono font-bold text-teal-800">
                      Score: {border}/2
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-[11px]">
                    {[
                      { val: 0, label: 'Regular (0)' },
                      { val: 1, label: 'Scalloped (1)' },
                      { val: 2, label: 'Ragged (2)' }
                    ].map(opt => (
                      <button
                        key={opt.val}
                        type="button"
                        onClick={() => setBorder(opt.val)}
                        className={`p-1.5 rounded-lg border text-center font-medium transition ${
                          border === opt.val
                            ? 'bg-teal-50 border-teal-500 text-teal-900 font-bold'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {aiResult?.borderNotes && (
                    <p className="text-[10px] text-slate-500 italic mt-1.5">
                      AI Note: {aiResult.borderNotes}
                    </p>
                  )}
                </div>

                {/* C: Color */}
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-slate-900">
                      C — Color Variegation
                    </span>
                    <span className="text-[11px] font-mono font-bold text-teal-800">
                      Score: {color}/2
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-[11px]">
                    {[
                      { val: 0, label: 'Uniform (0)' },
                      { val: 1, label: '2-3 Colors (1)' },
                      { val: 2, label: '4+ Colors (2)' }
                    ].map(opt => (
                      <button
                        key={opt.val}
                        type="button"
                        onClick={() => setColor(opt.val)}
                        className={`p-1.5 rounded-lg border text-center font-medium transition ${
                          color === opt.val
                            ? 'bg-teal-50 border-teal-500 text-teal-900 font-bold'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {aiResult?.colorNotes && (
                    <p className="text-[10px] text-slate-500 italic mt-1.5">
                      AI Note: {aiResult.colorNotes}
                    </p>
                  )}
                </div>

                {/* D: Diameter (from caliper) */}
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">
                        D — Diameter Threshold
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Measured Max: {maxDiameter.toFixed(1)} mm
                      </span>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                      diameterScore === 1 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      Score: {diameterScore}/1 {diameterScore === 1 ? '(≥6mm)' : '(<6mm)'}
                    </span>
                  </div>
                </div>

                {/* E: Evolution */}
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-slate-900">
                      E — Evolution / Dynamics
                    </span>
                    <span className="text-[11px] font-mono font-bold text-teal-800">
                      Score: {evolution}/2
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[11px]">
                    {[
                      { val: 0, label: 'Stable / Unchanged (0)' },
                      { val: 2, label: 'Enlarging / Symptomatic (2)' }
                    ].map(opt => (
                      <button
                        key={opt.val}
                        type="button"
                        onClick={() => setEvolution(opt.val)}
                        className={`p-1.5 rounded-lg border text-center font-medium transition ${
                          evolution === opt.val
                            ? 'bg-teal-50 border-teal-500 text-teal-900 font-bold'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Total Score Gauge & Risk Banner */}
              <div
                className={`p-4 rounded-xl border shadow-xs transition-colors ${
                  totalScore >= 5
                    ? 'bg-rose-50 border-rose-300 text-rose-950'
                    : totalScore >= 3
                    ? 'bg-amber-50 border-amber-300 text-amber-950'
                    : 'bg-emerald-50 border-emerald-300 text-emerald-950'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-black uppercase tracking-wider">
                    Total ABCDE Risk Score
                  </span>
                  <span className="text-xl font-black font-mono">
                    {totalScore} / 9
                  </span>
                </div>
                <div className="text-xs font-extrabold flex items-center gap-1.5 mt-0.5">
                  {totalScore >= 5 ? (
                    <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                  ) : totalScore >= 3 ? (
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  )}
                  <span>{riskCategory}</span>
                </div>
                <p className="text-[11px] mt-1.5 leading-relaxed opacity-90">
                  {totalScore >= 5
                    ? 'Urgent dermatological referral or excisional biopsy strongly indicated for histopathologic evaluation.'
                    : totalScore >= 3
                    ? 'Atypical melanocytic lesion features noted. Recommend short-term digital dermoscopy follow-up (3 months).'
                    : 'Reassuring benign dermoscopic pattern. Routine patient self-monitoring advised.'}
                </p>
              </div>
            </div>

            {/* Actions Bar */}
            <div className="pt-3 border-t border-slate-200 flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopySummary}
                className="flex-1 px-3 py-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 transition flex items-center justify-center gap-1.5 shadow-2xs"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy Summary'}</span>
              </button>

              <button
                type="button"
                onClick={handleApply}
                className="flex-1 px-3 py-2 bg-teal-800 hover:bg-teal-900 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-teal-300" />
                <span>Apply Findings</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
