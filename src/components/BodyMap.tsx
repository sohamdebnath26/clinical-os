import React, { useState, useRef } from 'react';
import { BodyMarker } from '../types';
import { Trash2, X, Plus, Filter, Info } from 'lucide-react';

interface BodyMapProps {
  markers: BodyMarker[];
  onAddMarker?: (marker: Omit<BodyMarker, 'id' | 'createdAt'>) => void;
  onRemoveMarker?: (markerId: string) => void;
  onUpdateMarker?: (markerId: string, updates: Partial<BodyMarker>) => void;
  readOnly?: boolean;
  patientId: string;
  consultationId?: string;
  priorMarkers?: BodyMarker[];
}

export type MarkerType = 'lesion' | 'rash' | 'acne' | 'pigmentation' | 'hair' | 'custom';

export const MARKER_TYPES: { type: MarkerType; label: string; color: string; hex: string }[] = [
  { type: 'lesion', label: 'Lesion', color: 'bg-red-500', hex: '#ef4444' },
  { type: 'rash', label: 'Rash / Plaque', color: 'bg-purple-600', hex: '#9333ea' },
  { type: 'acne', label: 'Acne', color: 'bg-blue-500', hex: '#3b82f6' },
  { type: 'pigmentation', label: 'Pigmentation', color: 'bg-amber-500', hex: '#f59e0b' },
  { type: 'hair', label: 'Hair', color: 'bg-teal-500', hex: '#14b8a6' },
  { type: 'custom', label: 'Other', color: 'bg-slate-600', hex: '#475569' }
];

export const BodyMap: React.FC<BodyMapProps> = ({
  markers,
  onAddMarker,
  onRemoveMarker,
  onUpdateMarker,
  readOnly = false,
  patientId,
  consultationId,
  priorMarkers = []
}) => {
  const [view, setView] = useState<'front' | 'back'>('front');
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [selectedMarker, setSelectedMarker] = useState<BodyMarker | null>(null);
  const [pendingPoint, setPendingPoint] = useState<{ x: number; y: number } | null>(null);
  const [pendingType, setPendingType] = useState<MarkerType>('lesion');
  const [pendingNotes, setPendingNotes] = useState('');
  const [pendingPart, setPendingPart] = useState('');
  const [showPriorMarkers, setShowPriorMarkers] = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);

  // Combine current markers and prior markers
  const allDisplayMarkers = [
    ...markers.map(m => ({ ...m, isPrior: false })),
    ...(showPriorMarkers ? priorMarkers.filter(pm => !markers.some(m => m.id === pm.id)).map(m => ({ ...m, isPrior: true })) : [])
  ];

  const filteredMarkers = allDisplayMarkers.filter(m => {
    if (m.view !== view) return false;
    if (activeFilter === 'all') return true;
    return m.type === activeFilter;
  });

  const handleSvgClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (readOnly || !onAddMarker) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    // Estimate anatomical zone
    let zone = 'Torso / Trunk';
    if (y < 16) zone = view === 'front' ? 'Face / Forehead' : 'Occipital Scalp / Neck';
    else if (y < 28) zone = view === 'front' ? 'Chest / Neck' : 'Upper Back / Scapula';
    else if (y < 46) zone = view === 'front' ? 'Abdomen / Arms' : 'Mid Back / Flanks';
    else if (y < 60) zone = 'Pelvis / Upper Thighs';
    else if (y < 82) zone = 'Thighs / Knees';
    else zone = 'Lower Legs / Ankles / Feet';

    setPendingPoint({ x, y });
    setPendingPart(zone);
    setSelectedMarker(null);
  };

  const handleSavePendingMarker = () => {
    if (!pendingPoint || !onAddMarker) return;
    const typeDef = MARKER_TYPES.find(t => t.type === pendingType);
    onAddMarker({
      x: Number(pendingPoint.x.toFixed(1)),
      y: Number(pendingPoint.y.toFixed(1)),
      view,
      bodyPart: pendingPart || 'Anatomical site',
      type: pendingType,
      color: typeDef?.hex || '#ef4444',
      notes: pendingNotes,
      patientId,
      consultationId
    });
    setPendingPoint(null);
    setPendingNotes('');
    setPendingPart('');
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 bg-white p-6 rounded-xl border border-slate-200">
      {/* Left Column: Body Silhouette Canvas */}
      <div className="flex-1 flex flex-col items-center">
        {/* View Switcher */}
        <div className="flex items-center gap-2 mb-4 bg-slate-100 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => { setView('front'); setSelectedMarker(null); setPendingPoint(null); }}
            className={`px-6 py-1.5 text-sm font-semibold rounded-md transition-all ${
              view === 'front'
                ? 'bg-white text-teal-800 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Front View
          </button>
          <button
            type="button"
            onClick={() => { setView('back'); setSelectedMarker(null); setPendingPoint(null); }}
            className={`px-6 py-1.5 text-sm font-semibold rounded-md transition-all ${
              view === 'back'
                ? 'bg-white text-teal-800 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Back View
          </button>
        </div>

        {/* Silhouette Viewport */}
        <div
          ref={containerRef}
          onClick={handleSvgClick}
          className={`relative w-[280px] h-[520px] bg-slate-50/80 rounded-2xl border border-slate-200/80 p-2 flex items-center justify-center select-none ${
            !readOnly ? 'cursor-crosshair' : 'cursor-default'
          }`}
        >
          {/* Anatomical Silhouette SVG */}
          <svg
            viewBox="0 0 200 400"
            className="w-full h-full text-slate-300 drop-shadow-sm pointer-events-none"
            fill="currentColor"
          >
            {/* Head & Neck */}
            <ellipse cx="100" cy="38" rx="20" ry="25" fill="#e2e8f0" stroke="#cbd5e1" strokeWidth="1.5" />
            <path d="M92 62 L90 74 L110 74 L108 62 Z" fill="#e2e8f0" stroke="#cbd5e1" strokeWidth="1.5" />

            {/* Torso & Shoulders */}
            <path
              d="M90 74 C75 76 56 82 48 94 C42 102 38 126 34 160 C32 178 30 196 26 210 C24 216 18 228 22 232 C26 236 30 228 34 218 C40 198 44 176 48 162 L52 144 L54 196 C55 210 58 228 66 244 L78 246 C86 246 94 242 100 240 C106 242 114 246 122 246 L134 244 C142 228 145 210 146 196 L148 144 L152 162 C156 176 160 198 166 218 C170 228 174 236 178 232 C182 228 176 216 174 210 C170 196 168 178 166 160 C162 126 158 102 152 94 C144 82 125 76 110 74 Z"
              fill="#e2e8f0"
              stroke="#cbd5e1"
              strokeWidth="1.5"
            />

            {/* Pelvis & Legs */}
            <path
              d="M66 244 L72 284 C76 312 74 340 76 372 C76 384 72 390 68 392 L94 392 C94 382 92 356 94 326 L96 270 L100 252 L104 270 L106 326 C108 356 106 382 106 392 L132 392 C128 390 124 384 124 372 C126 340 124 312 128 284 L134 244 Z"
              fill="#e2e8f0"
              stroke="#cbd5e1"
              strokeWidth="1.5"
            />

            {/* Details for Front vs Back */}
            {view === 'front' ? (
              <g stroke="#94a3b8" strokeWidth="1" strokeLinecap="round" opacity="0.6">
                {/* Clavicle */}
                <path d="M78 86 Q100 92 122 86" fill="none" />
                {/* Chest contours */}
                <path d="M76 115 Q88 122 96 118" fill="none" />
                <path d="M124 115 Q112 122 104 118" fill="none" />
                {/* Umbilicus */}
                <circle cx="100" cy="168" r="1.5" fill="#94a3b8" />
                {/* Knees */}
                <ellipse cx="84" cy="316" rx="5" ry="4" fill="none" />
                <ellipse cx="116" cy="316" rx="5" ry="4" fill="none" />
              </g>
            ) : (
              <g stroke="#94a3b8" strokeWidth="1" strokeLinecap="round" opacity="0.6">
                {/* Spine line */}
                <path d="M100 80 L100 230" fill="none" strokeDasharray="3 3" />
                {/* Scapulae */}
                <path d="M72 105 Q82 110 84 125" fill="none" />
                <path d="M128 105 Q118 110 116 125" fill="none" />
                {/* Gluteal crease */}
                <path d="M100 240 L100 262" fill="none" />
                <path d="M80 252 Q100 264 120 252" fill="none" />
              </g>
            )}
          </svg>

          {/* Placed Markers */}
          {filteredMarkers.map((marker) => {
            const isSelected = selectedMarker?.id === marker.id;
            return (
              <button
                key={marker.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedMarker(marker);
                  setPendingPoint(null);
                }}
                style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 z-10 p-1 transition-transform hover:scale-125 focus:outline-none`}
                title={`${marker.type.toUpperCase()}: ${marker.bodyPart}${marker.notes ? ` - ${marker.notes}` : ''}`}
              >
                <div
                  style={{ backgroundColor: marker.color }}
                  className={`w-4 h-4 rounded-full border-2 border-white shadow-md flex items-center justify-center ${
                    isSelected ? 'ring-2 ring-teal-600 scale-125' : ''
                  } ${marker.isPrior ? 'opacity-65 ring-1 ring-slate-400' : ''}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-white opacity-80" />
                </div>
              </button>
            );
          })}

          {/* Pending Marker being added */}
          {pendingPoint && (
            <div
              style={{ left: `${pendingPoint.x}%`, top: `${pendingPoint.y}%` }}
              className="absolute -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none"
            >
              <div className="w-5 h-5 rounded-full border-2 border-dashed border-teal-600 bg-teal-400/40 animate-pulse flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-teal-600" />
              </div>
            </div>
          )}
        </div>

        <p className="mt-3 text-xs text-slate-500 text-center max-w-xs">
          {!readOnly ? 'Click on the silhouette to place a lesion or symptom pin.' : 'Interactive anatomical body map'}
        </p>
      </div>

      {/* Right Column: Filters & Details Panel */}
      <div className="w-full lg:w-72 flex flex-col justify-between border-t lg:border-t-0 lg:border-l border-slate-200 lg:pl-6 pt-4 lg:pt-0">
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Filter by type</span>
            <span className="text-xs font-medium text-slate-400">Total: {markers.length}</span>
          </div>

          <div className="space-y-1.5 mb-5">
            <button
              type="button"
              onClick={() => setActiveFilter('all')}
              className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeFilter === 'all'
                  ? 'bg-teal-50 text-teal-800 font-semibold'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <span>All markers</span>
              </div>
              <span className="text-slate-400">({markers.length})</span>
            </button>

            {MARKER_TYPES.map(m => {
              const count = markers.filter(x => x.type === m.type).length;
              return (
                <button
                  key={m.type}
                  type="button"
                  onClick={() => setActiveFilter(m.type)}
                  className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    activeFilter === m.type
                      ? 'bg-teal-50 text-teal-800 font-semibold'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: m.hex }} />
                    <span>{m.label}</span>
                  </div>
                  <span className="text-slate-400">({count})</span>
                </button>
              );
            })}
          </div>

          {priorMarkers.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-slate-600 mb-4 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showPriorMarkers}
                onChange={e => setShowPriorMarkers(e.target.checked)}
                className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              <span>Show {priorMarkers.length} prior visit markers</span>
            </label>
          )}

          {/* Add Pending Marker Form */}
          {pendingPoint && (
            <div className="bg-teal-50/70 border border-teal-200 rounded-xl p-3.5 mb-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-teal-900 uppercase">New Marker</span>
                <button
                  type="button"
                  onClick={() => setPendingPoint(null)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Body Region</label>
                  <input
                    type="text"
                    value={pendingPart}
                    onChange={e => setPendingPart(e.target.value)}
                    className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-md focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Type</label>
                  <select
                    value={pendingType}
                    onChange={e => setPendingType(e.target.value as MarkerType)}
                    className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-md focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                  >
                    {MARKER_TYPES.map(t => (
                      <option key={t.type} value={t.type}>{t.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Clinical Note</label>
                  <input
                    type="text"
                    placeholder="e.g. 3mm papule, erythematous"
                    value={pendingNotes}
                    onChange={e => setPendingNotes(e.target.value)}
                    className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-md focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleSavePendingMarker}
                    className="flex-1 py-1.5 px-3 bg-teal-600 hover:bg-teal-700 text-white rounded-md text-xs font-semibold shadow-sm transition-colors"
                  >
                    Save Pin
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingPoint(null)}
                    className="py-1.5 px-2.5 bg-white border border-slate-300 text-slate-600 hover:bg-slate-100 rounded-md text-xs font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Selected Existing Marker Details */}
          {selectedMarker && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 mb-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: selectedMarker.color }} />
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                    {selectedMarker.type}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedMarker(null)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-1 text-xs text-slate-600 mb-3">
                <p><span className="font-semibold text-slate-700">Location:</span> {selectedMarker.bodyPart}</p>
                <p><span className="font-semibold text-slate-700">View:</span> {selectedMarker.view.toUpperCase()}</p>
                {selectedMarker.notes && (
                  <p><span className="font-semibold text-slate-700">Notes:</span> {selectedMarker.notes}</p>
                )}
                {selectedMarker.consultationId && (
                  <p className="text-[11px] text-slate-400">Linked to consultation</p>
                )}
              </div>

              {!readOnly && onRemoveMarker && (
                <button
                  type="button"
                  onClick={() => {
                    onRemoveMarker(selectedMarker.id);
                    setSelectedMarker(null);
                  }}
                  className="w-full flex items-center justify-center gap-1.5 py-1 px-2 text-xs font-medium text-red-600 hover:bg-red-50 border border-red-200 rounded-md transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove Marker
                </button>
              )}
            </div>
          )}
        </div>

        <div className="pt-2 text-[11px] text-slate-400 flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span>Coordinates and anatomical sites persist with the consultation EMR.</span>
        </div>
      </div>
    </div>
  );
};
