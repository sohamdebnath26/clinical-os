import React, { useState, useRef } from 'react';
import { ClinicalImage } from '../types';
import { VoiceDictationButton } from './VoiceDictationButton';
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Circle,
  Pencil,
  MapPin,
  Move,
  Undo2,
  Trash2,
  Check,
  Lock,
  Unlock,
  Sparkles,
  Maximize2
} from 'lucide-react';

export interface ImageAreaAnnotation {
  id: string;
  side: 'A' | 'B';
  tool: 'circle' | 'freehand' | 'pin';
  color: string;
  label: string;
  // Normalized coordinates (0 to 100 percentage of image container)
  x: number;
  y: number;
  radiusX?: number;
  radiusY?: number;
  points?: { x: number; y: number }[];
}

interface FullScreenSideBySideModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageA: ClinicalImage | null;
  imageB: ClinicalImage | null;
  visitALabel: string;
  visitBLabel: string;
  visitADate: string;
  visitBDate: string;
  annotations: ImageAreaAnnotation[];
  onChangeAnnotations: (updated: ImageAreaAnnotation[]) => void;
  clinicalNotes: string;
  onChangeClinicalNotes: (notes: string) => void;
  onGenerateSummaryFromModal?: () => void;
}

const ANNOTATION_PRESETS = [
  { color: '#ef4444', name: 'Red Flag / Flare', badgeBg: 'bg-rose-500/20 text-rose-300 border-rose-500/40' },
  { color: '#f59e0b', name: 'Severity / Border Spread', badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
  { color: '#10b981', name: 'Healing / Clearing Area', badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
  { color: '#06b6d4', name: 'Reference Lesion ROI', badgeBg: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' }
];

export const FullScreenSideBySideModal: React.FC<FullScreenSideBySideModalProps> = ({
  isOpen,
  onClose,
  imageA,
  imageB,
  visitALabel,
  visitBLabel,
  visitADate,
  visitBDate,
  annotations,
  onChangeAnnotations,
  clinicalNotes,
  onChangeClinicalNotes,
  onGenerateSummaryFromModal
}) => {
  const [zoomA, setZoomA] = useState<number>(1);
  const [zoomB, setZoomB] = useState<number>(1);
  const [panA, setPanA] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [panB, setPanB] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [syncZoomPan, setSyncZoomPan] = useState<boolean>(true);

  const [activeTool, setActiveTool] = useState<'circle' | 'freehand' | 'pin' | 'pan'>('circle');
  const [selectedColor, setSelectedColor] = useState<string>('#ef4444');
  const [customMarkLabel, setCustomMarkLabel] = useState<string>('Red Flag / Flare');

  // Interactive drawing state
  const [drawingState, setDrawingState] = useState<{
    side: 'A' | 'B';
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    points: { x: number; y: number }[];
  } | null>(null);

  // Panning state
  const [panningState, setPanningState] = useState<{
    side: 'A' | 'B';
    startClientX: number;
    startClientY: number;
    initialPanX: number;
    initialPanY: number;
  } | null>(null);

  const containerARef = useRef<HTMLDivElement>(null);
  const containerBRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const handleZoomChange = (side: 'A' | 'B', nextZoom: number) => {
    const clamped = Math.min(4, Math.max(1, Number(nextZoom.toFixed(2))));
    if (syncZoomPan) {
      setZoomA(clamped);
      setZoomB(clamped);
      if (clamped === 1) {
        setPanA({ x: 0, y: 0 });
        setPanB({ x: 0, y: 0 });
      }
    } else if (side === 'A') {
      setZoomA(clamped);
      if (clamped === 1) setPanA({ x: 0, y: 0 });
    } else {
      setZoomB(clamped);
      if (clamped === 1) setPanB({ x: 0, y: 0 });
    }
  };

  const handleResetView = () => {
    setZoomA(1);
    setZoomB(1);
    setPanA({ x: 0, y: 0 });
    setPanB({ x: 0, y: 0 });
  };

  const getRelativeCoords = (
    e: React.MouseEvent<HTMLDivElement>,
    side: 'A' | 'B'
  ): { x: number; y: number } => {
    const ref = side === 'A' ? containerARef.current : containerBRef.current;
    if (!ref) return { x: 50, y: 50 };
    const rect = ref.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    return { x, y };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>, side: 'A' | 'B') => {
    if (e.button !== 0) return;

    if (activeTool === 'pan') {
      const currentPan = side === 'A' ? panA : panB;
      setPanningState({
        side,
        startClientX: e.clientX,
        startClientY: e.clientY,
        initialPanX: currentPan.x,
        initialPanY: currentPan.y
      });
      return;
    }

    const coords = getRelativeCoords(e, side);

    if (activeTool === 'pin') {
      const newMark: ImageAreaAnnotation = {
        id: `mark_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        side,
        tool: 'pin',
        color: selectedColor,
        label: customMarkLabel.trim() || 'Marked Area',
        x: coords.x,
        y: coords.y
      };
      onChangeAnnotations([...annotations, newMark]);
      return;
    }

    setDrawingState({
      side,
      startX: coords.x,
      startY: coords.y,
      currentX: coords.x,
      currentY: coords.y,
      points: [coords]
    });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>, side: 'A' | 'B') => {
    if (panningState) {
      const dx = e.clientX - panningState.startClientX;
      const dy = e.clientY - panningState.startClientY;
      const nextPan = {
        x: panningState.initialPanX + dx,
        y: panningState.initialPanY + dy
      };
      if (syncZoomPan) {
        setPanA(nextPan);
        setPanB(nextPan);
      } else if (panningState.side === 'A') {
        setPanA(nextPan);
      } else {
        setPanB(nextPan);
      }
      return;
    }

    if (!drawingState || drawingState.side !== side) return;
    const coords = getRelativeCoords(e, side);
    setDrawingState(prev =>
      prev
        ? {
            ...prev,
            currentX: coords.x,
            currentY: coords.y,
            points: [...prev.points, coords]
          }
        : null
    );
  };

  const handleMouseUp = () => {
    if (panningState) {
      setPanningState(null);
      return;
    }

    if (!drawingState) return;

    if (activeTool === 'circle') {
      const rx = Math.max(4, Math.abs(drawingState.currentX - drawingState.startX));
      const ry = Math.max(4, Math.abs(drawingState.currentY - drawingState.startY));
      const centerX = (drawingState.startX + drawingState.currentX) / 2;
      const centerY = (drawingState.startY + drawingState.currentY) / 2;

      const newMark: ImageAreaAnnotation = {
        id: `mark_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        side: drawingState.side,
        tool: 'circle',
        color: selectedColor,
        label: customMarkLabel.trim() || 'Marked Area',
        x: centerX,
        y: centerY,
        radiusX: rx / 2 < 3 ? 6 : rx / 2,
        radiusY: ry / 2 < 3 ? 6 : ry / 2
      };
      onChangeAnnotations([...annotations, newMark]);
    } else if (activeTool === 'freehand' && drawingState.points.length > 2) {
      const newMark: ImageAreaAnnotation = {
        id: `mark_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        side: drawingState.side,
        tool: 'freehand',
        color: selectedColor,
        label: customMarkLabel.trim() || 'Marked Border',
        x: drawingState.points[0].x,
        y: drawingState.points[0].y,
        points: drawingState.points
      };
      onChangeAnnotations([...annotations, newMark]);
    }

    setDrawingState(null);
  };

  const handleUndo = () => {
    if (annotations.length === 0) return;
    onChangeAnnotations(annotations.slice(0, -1));
  };

  const handleClearAll = () => {
    onChangeAnnotations([]);
  };

  const renderSvgOverlay = (side: 'A' | 'B') => {
    const sideMarks = annotations.filter(a => a.side === side);
    const activeDraw = drawingState && drawingState.side === side ? drawingState : null;

    return (
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
      >
        {sideMarks.map((mark, index) => {
          if (mark.tool === 'circle') {
            return (
              <g key={mark.id}>
                <ellipse
                  cx={mark.x}
                  cy={mark.y}
                  rx={mark.radiusX || 7}
                  ry={mark.radiusY || 7}
                  fill={`${mark.color}22`}
                  stroke={mark.color}
                  strokeWidth="0.7"
                  strokeDasharray="1.5,1"
                />
                <rect
                  x={Math.max(1, mark.x - (mark.radiusX || 7))}
                  y={Math.max(2, mark.y - (mark.radiusY || 7) - 4.5)}
                  width={Math.min(42, Math.max(18, mark.label.length * 1.45 + 6))}
                  height="4"
                  rx="1"
                  fill={mark.color}
                />
                <text
                  x={Math.max(2, mark.x - (mark.radiusX || 7) + 1.2)}
                  y={Math.max(4.8, mark.y - (mark.radiusY || 7) - 1.6)}
                  fill="#ffffff"
                  fontSize="2.3"
                  fontWeight="bold"
                >
                  #{index + 1} {mark.label.slice(0, 22)}
                </text>
              </g>
            );
          }

          if (mark.tool === 'freehand' && mark.points && mark.points.length > 1) {
            const pathData = mark.points
              .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`)
              .join(' ');
            const firstPt = mark.points[0];
            return (
              <g key={mark.id}>
                <path
                  d={pathData}
                  fill={`${mark.color}18`}
                  stroke={mark.color}
                  strokeWidth="0.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <text
                  x={Math.max(2, firstPt.x)}
                  y={Math.max(4, firstPt.y - 1.5)}
                  fill={mark.color}
                  fontSize="2.5"
                  fontWeight="bold"
                >
                  #{index + 1} {mark.label.slice(0, 20)}
                </text>
              </g>
            );
          }

          return (
            <g key={mark.id}>
              <circle
                cx={mark.x}
                cy={mark.y}
                r="2.2"
                fill={mark.color}
                stroke="#ffffff"
                strokeWidth="0.5"
              />
              <text
                x={Math.min(78, mark.x + 2.8)}
                y={Math.max(4, mark.y + 0.8)}
                fill="#ffffff"
                fontSize="2.4"
                fontWeight="bold"
                style={{ textShadow: '0px 1px 2px rgba(0,0,0,0.9)' }}
              >
                #{index + 1} {mark.label.slice(0, 20)}
              </text>
            </g>
          );
        })}

        {/* Active drawing preview */}
        {activeDraw && activeTool === 'circle' && (
          <ellipse
            cx={(activeDraw.startX + activeDraw.currentX) / 2}
            cy={(activeDraw.startY + activeDraw.currentY) / 2}
            rx={Math.max(3, Math.abs(activeDraw.currentX - activeDraw.startX) / 2)}
            ry={Math.max(3, Math.abs(activeDraw.currentY - activeDraw.startY) / 2)}
            fill={`${selectedColor}25`}
            stroke={selectedColor}
            strokeWidth="0.7"
            strokeDasharray="1.2,1"
          />
        )}

        {activeDraw && activeTool === 'freehand' && activeDraw.points.length > 1 && (
          <path
            d={activeDraw.points
              .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`)
              .join(' ')}
            fill="none"
            stroke={selectedColor}
            strokeWidth="0.8"
            strokeLinecap="round"
          />
        )}
      </svg>
    );
  };

  return (
    <div className="fixed inset-0 z-[70] bg-slate-950 text-white flex flex-col overflow-hidden animate-in fade-in duration-150">
      {/* Top Clinical Toolbar */}
      <div className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-teal-500/20 border border-teal-500/30 text-teal-300 flex items-center justify-center">
            <Maximize2 className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-tight flex items-center gap-2">
              <span>Full-Screen Side-by-Side Image Inspection &amp; Area Marking</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30 font-semibold">
                {annotations.length} Area(s) Marked
              </span>
            </h2>
            <p className="text-[11px] text-slate-400">
              Zoom in up to 4x and draw/circle lesion borders, flare zones, or clearing areas directly on each visit photo
            </p>
          </div>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-2 bg-slate-800/90 px-3 py-1.5 rounded-xl border border-slate-700">
          <button
            type="button"
            onClick={() => handleZoomChange('A', zoomA - 0.25)}
            className="p-1 hover:bg-slate-700 rounded-lg text-slate-300 hover:text-white transition"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <input
            type="range"
            min="1"
            max="4"
            step="0.1"
            value={zoomA}
            onChange={e => handleZoomChange('A', parseFloat(e.target.value))}
            className="w-24 accent-teal-400 cursor-pointer"
          />
          <span className="text-xs font-mono font-bold text-teal-300 min-w-[42px] text-center">
            {Math.round(zoomA * 100)}%
          </span>
          <button
            type="button"
            onClick={() => handleZoomChange('A', zoomA + 0.25)}
            className="p-1 hover:bg-slate-700 rounded-lg text-slate-300 hover:text-white transition"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setSyncZoomPan(!syncZoomPan)}
            className={`px-2 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 border transition ${
              syncZoomPan
                ? 'bg-teal-500/20 border-teal-500/40 text-teal-300'
                : 'bg-slate-900 border-slate-700 text-slate-400'
            }`}
            title="Synchronize zoom and pan across both visit images"
          >
            {syncZoomPan ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
            <span>Sync Zoom</span>
          </button>
          <button
            type="button"
            onClick={handleResetView}
            className="p-1 hover:bg-slate-700 rounded-lg text-slate-300 hover:text-white transition"
            title="Reset Zoom & Pan"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Done / Close */}
        <div className="flex items-center gap-2">
          {onGenerateSummaryFromModal && (
            <button
              type="button"
              onClick={() => {
                onGenerateSummaryFromModal();
                onClose();
              }}
              className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Save Marks &amp; Generate Summary</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <Check className="w-3.5 h-3.5 text-emerald-400" />
            <span>Done</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg"
            title="Close Full Screen"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Area Marking & Annotation Secondary Bar */}
      <div className="px-4 py-2.5 bg-slate-900/70 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1">
            Mark Areas Tool:
          </span>
          <button
            type="button"
            onClick={() => setActiveTool('circle')}
            className={`px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1.5 border transition ${
              activeTool === 'circle'
                ? 'bg-teal-600 border-teal-500 text-white'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Circle className="w-3.5 h-3.5" />
            <span>Circle Area</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTool('freehand')}
            className={`px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1.5 border transition ${
              activeTool === 'freehand'
                ? 'bg-teal-600 border-teal-500 text-white'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Pencil className="w-3.5 h-3.5" />
            <span>Freehand Outline</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTool('pin')}
            className={`px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1.5 border transition ${
              activeTool === 'pin'
                ? 'bg-teal-600 border-teal-500 text-white'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>Pin Marker</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTool('pan')}
            className={`px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1.5 border transition ${
              activeTool === 'pan'
                ? 'bg-teal-600 border-teal-500 text-white'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Move className="w-3.5 h-3.5" />
            <span>Pan / Move</span>
          </button>

          <div className="h-4 w-px bg-slate-700 mx-1" />

          {/* Color & Clinical Preset Selector */}
          {ANNOTATION_PRESETS.map(preset => (
            <button
              key={preset.color}
              type="button"
              onClick={() => {
                setSelectedColor(preset.color);
                setCustomMarkLabel(preset.name);
              }}
              className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold flex items-center gap-1.5 transition ${
                selectedColor === preset.color
                  ? 'ring-2 ring-white/80 bg-slate-800 border-white'
                  : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: preset.color }}
              />
              <span>{preset.name}</span>
            </button>
          ))}

          <input
            type="text"
            value={customMarkLabel}
            onChange={e => setCustomMarkLabel(e.target.value)}
            placeholder="Custom mark label..."
            className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs w-40 focus:outline-none focus:border-teal-400"
          />
        </div>

        {/* Undo / Clear */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleUndo}
            disabled={annotations.length === 0}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 border border-slate-700 text-slate-300 flex items-center gap-1 transition"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span>Undo</span>
          </button>
          <button
            type="button"
            onClick={handleClearAll}
            disabled={annotations.length === 0}
            className="px-2.5 py-1 rounded-lg bg-rose-950/60 hover:bg-rose-900/70 disabled:opacity-40 border border-rose-800/60 text-rose-300 flex items-center gap-1 transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear All</span>
          </button>
        </div>
      </div>

      {/* Side-by-Side Full Screen Viewports */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3 p-3 overflow-hidden bg-slate-950">
        {/* LEFT VIEWPORT: VISIT A */}
        <div className="flex flex-col bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
          <div className="px-3.5 py-2 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              <span className="font-bold text-white">{visitALabel}</span>
              <span className="text-slate-400">({visitADate})</span>
            </div>
            <span className="text-[11px] text-slate-400">
              {annotations.filter(a => a.side === 'A').length} mark(s) • Zoom {Math.round(zoomA * 100)}%
            </span>
          </div>

          <div
            className="relative flex-1 overflow-hidden bg-black flex items-center justify-center select-none"
            onWheel={e => {
              e.preventDefault();
              const delta = e.deltaY < 0 ? 0.2 : -0.2;
              handleZoomChange('A', zoomA + delta);
            }}
          >
            {imageA ? (
              <div
                ref={containerARef}
                onMouseDown={e => handleMouseDown(e, 'A')}
                onMouseMove={e => handleMouseMove(e, 'A')}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                className={`relative w-full h-full flex items-center justify-center ${
                  activeTool === 'pan' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'
                }`}
                style={{
                  transform: `translate(${panA.x}px, ${panA.y}px) scale(${zoomA})`,
                  transformOrigin: 'center center',
                  transition: drawingState || panningState ? 'none' : 'transform 120ms ease-out'
                }}
              >
                <img
                  src={imageA.url}
                  alt="Visit A Clinical"
                  draggable={false}
                  className="max-w-full max-h-full object-contain pointer-events-none select-none"
                />
                {renderSvgOverlay('A')}
              </div>
            ) : (
              <div className="text-center text-slate-500 text-xs p-6">
                No image selected for Visit A
              </div>
            )}
          </div>
        </div>

        {/* RIGHT VIEWPORT: VISIT B */}
        <div className="flex flex-col bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
          <div className="px-3.5 py-2 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className="font-bold text-white">{visitBLabel}</span>
              <span className="text-slate-400">({visitBDate})</span>
            </div>
            <span className="text-[11px] text-slate-400">
              {annotations.filter(a => a.side === 'B').length} mark(s) • Zoom {Math.round(zoomB * 100)}%
            </span>
          </div>

          <div
            className="relative flex-1 overflow-hidden bg-black flex items-center justify-center select-none"
            onWheel={e => {
              e.preventDefault();
              const delta = e.deltaY < 0 ? 0.2 : -0.2;
              handleZoomChange('B', zoomB + delta);
            }}
          >
            {imageB ? (
              <div
                ref={containerBRef}
                onMouseDown={e => handleMouseDown(e, 'B')}
                onMouseMove={e => handleMouseMove(e, 'B')}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                className={`relative w-full h-full flex items-center justify-center ${
                  activeTool === 'pan' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'
                }`}
                style={{
                  transform: `translate(${panB.x}px, ${panB.y}px) scale(${zoomB})`,
                  transformOrigin: 'center center',
                  transition: drawingState || panningState ? 'none' : 'transform 120ms ease-out'
                }}
              >
                <img
                  src={imageB.url}
                  alt="Visit B Clinical"
                  draggable={false}
                  className="max-w-full max-h-full object-contain pointer-events-none select-none"
                />
                {renderSvgOverlay('B')}
              </div>
            ) : (
              <div className="text-center text-slate-500 text-xs p-6">
                No image selected for Visit B
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Quick Clinical Notes & Voice Dictation Bar inside Full Screen */}
      <div className="px-4 py-3 bg-slate-900 border-t border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-bold text-slate-200">Clinical Notes:</span>
          <VoiceDictationButton
            value={clinicalNotes}
            onChange={onChangeClinicalNotes}
            variant="prominent"
            label="Mic Dictate"
          />
        </div>
        <input
          type="text"
          value={clinicalNotes}
          onChange={e => onChangeClinicalNotes(e.target.value)}
          placeholder="Type or click Mic Dictate to record observations while inspecting full-screen images..."
          className="flex-1 px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-teal-400"
        />
      </div>
    </div>
  );
};
