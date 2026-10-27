import React, { useState } from 'react';
import { Patient, AIImageAnalysisResult, BodyMarker } from '../types';
import { MARKER_TYPES, MarkerType } from './BodyMap';
import { api } from '../lib/api';
import {
  X,
  MapPin,
  Check,
  User,
  Sparkles,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

interface PinToBodyMapModalProps {
  patient: Patient;
  analysis?: AIImageAnalysisResult | null;
  anatomicalSite?: string;
  onClose: () => void;
  onSuccess?: (marker: BodyMarker) => void;
}

const COMMON_REGIONS: { name: string; view: 'front' | 'back'; x: number; y: number }[] = [
  { name: 'Face / Cheeks', view: 'front', x: 50, y: 10 },
  { name: 'Neck / Throat', view: 'front', x: 50, y: 16 },
  { name: 'Chest / Sternum', view: 'front', x: 50, y: 24 },
  { name: 'Abdomen', view: 'front', x: 50, y: 38 },
  { name: 'Right Antecubital / Arm', view: 'front', x: 28, y: 35 },
  { name: 'Left Antecubital / Arm', view: 'front', x: 72, y: 35 },
  { name: 'Right Hand / Wrist', view: 'front', x: 22, y: 50 },
  { name: 'Left Hand / Wrist', view: 'front', x: 78, y: 50 },
  { name: 'Right Thigh', view: 'front', x: 42, y: 56 },
  { name: 'Left Thigh', view: 'front', x: 58, y: 56 },
  { name: 'Right Shin / Ankle', view: 'front', x: 42, y: 76 },
  { name: 'Left Shin / Ankle', view: 'front', x: 58, y: 76 },
  { name: 'Upper Back / Scapula', view: 'back', x: 50, y: 24 },
  { name: 'Lower Back / Lumbar', view: 'back', x: 50, y: 40 },
  { name: 'Gluteal Region', view: 'back', x: 50, y: 50 },
  { name: 'Posterior Legs / Calves', view: 'back', x: 50, y: 72 }
];

export const PinToBodyMapModal: React.FC<PinToBodyMapModalProps> = ({
  patient,
  analysis,
  anatomicalSite,
  onClose,
  onSuccess
}) => {
  const [view, setView] = useState<'front' | 'back'>('front');
  const [selectedRegion, setSelectedRegion] = useState<string>(anatomicalSite || 'Face / Cheeks');
  const [markerType, setMarkerType] = useState<MarkerType>(
    analysis?.primaryImpression.toLowerCase().includes('acne')
      ? 'acne'
      : analysis?.primaryImpression.toLowerCase().includes('rash') || analysis?.primaryImpression.toLowerCase().includes('eczema')
      ? 'rash'
      : analysis?.primaryImpression.toLowerCase().includes('pigment') || analysis?.primaryImpression.toLowerCase().includes('melan')
      ? 'pigmentation'
      : 'lesion'
  );

  const [notes, setNotes] = useState<string>(
    analysis
      ? `AI Eval: ${analysis.primaryImpression} (${analysis.differentials[0]?.confidence || 'Evaluated'} confidence)`
      : 'Documented via AI Clinical Image Analyzer'
  );

  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSaveMarker = async () => {
    setIsSaving(true);
    setErrorMsg(null);
    try {
      // Find coordinates for region
      const matched = COMMON_REGIONS.find(r => r.name.toLowerCase() === selectedRegion.toLowerCase()) || {
        view,
        x: 50,
        y: 30
      };

      const res = await api.patients.addMarker(patient.id, {
        view: matched.view || view,
        x: matched.x,
        y: matched.y,
        type: markerType,
        anatomicalPart: selectedRegion,
        notes: notes.trim()
      });

      if (onSuccess) {
        onSuccess(res.marker);
      }
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to pin body marker';
      setErrorMsg(msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-teal-100 text-teal-800">
              <MapPin className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Pin Lesion to Patient Body Map
              </h3>
              <p className="text-[11px] text-slate-500">
                Link this AI analyzed finding to {patient.fullName} ({patient.patientCode})
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-xs">
          {/* Anatomical View Toggle */}
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
              Anatomical Aspect:
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setView('front')}
                className={`py-2 rounded-xl border text-center font-bold text-xs transition ${
                  view === 'front'
                    ? 'bg-teal-800 text-white border-teal-800 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                Anterior (Front View)
              </button>
              <button
                type="button"
                onClick={() => setView('back')}
                className={`py-2 rounded-xl border text-center font-bold text-xs transition ${
                  view === 'back'
                    ? 'bg-teal-800 text-white border-teal-800 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                Posterior (Back View)
              </button>
            </div>
          </div>

          {/* Quick Region Selector */}
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
              Select Anatomical Region:
            </label>
            <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto border border-slate-200 rounded-xl p-2 bg-slate-50/50">
              {COMMON_REGIONS.filter(r => r.view === view).map(r => (
                <button
                  key={r.name}
                  type="button"
                  onClick={() => setSelectedRegion(r.name)}
                  className={`p-2 rounded-lg text-left text-xs font-semibold border transition ${
                    selectedRegion === r.name
                      ? 'bg-teal-50 border-teal-500 text-teal-900 shadow-2xs'
                      : 'bg-white border-slate-200/80 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {r.name}
                </button>
              ))}
            </div>
          </div>

          {/* Marker Classification Type */}
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
              Marker Classification:
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {MARKER_TYPES.map(m => (
                <button
                  key={m.type}
                  type="button"
                  onClick={() => setMarkerType(m.type)}
                  className={`p-2 rounded-lg border text-left text-xs font-semibold flex items-center gap-1.5 transition ${
                    markerType === m.type
                      ? 'border-teal-500 bg-teal-50/80 text-teal-900 shadow-2xs'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: m.hex }}
                  />
                  <span className="truncate">{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Clinical Marker Notes */}
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
              Clinical Findings / Notes:
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-700 resize-none"
              placeholder="e.g. Erythematous plaque, biopsied, etc."
            />
          </div>

          {errorMsg && (
            <div className="p-2.5 rounded-xl bg-red-50 text-red-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-xl hover:bg-slate-200/60 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSaveMarker}
            disabled={isSaving}
            className="px-4 py-2 bg-teal-800 hover:bg-teal-900 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Pinning...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>Save Marker to Body Map</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
