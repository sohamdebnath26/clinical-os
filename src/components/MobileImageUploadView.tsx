import React, { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { ClinicalImage } from '../types';
import {
  Camera,
  Upload,
  CheckCircle2,
  Smartphone,
  ShieldCheck,
  AlertCircle,
  Loader2,
  Image as ImageIcon,
  Plus
} from 'lucide-react';

interface MobileImageUploadViewProps {
  token: string;
}

export const MobileImageUploadView: React.FC<MobileImageUploadViewProps> = ({ token }) => {
  const [session, setSession] = useState<{
    token: string;
    patientId: string;
    patientName: string;
    patientCode: string;
    consultationId?: string;
    doctorName: string;
    clinicName: string;
    expiresAt: string;
    uploadedImages: ClinicalImage[];
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccessMsg, setUploadSuccessMsg] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [uploadedList, setUploadedList] = useState<ClinicalImage[]>([]);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    api.images
      .getMobileSession(token)
      .then(res => {
        if (!mounted) return;
        setSession(res.session);
        setUploadedList(res.session.uploadedImages || []);
        setError(null);
      })
      .catch(err => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Unable to load QR upload session');
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [token]);

  // Compress/resize image on mobile before uploading so large 12MP mobile photos upload quickly and cleanly
  const processAndCompressFile = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Failed to read image file'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Invalid image file'));
        img.onload = () => {
          const maxDim = 1600;
          let width = img.width;
          let height = img.height;

          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(reader.result as string);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
          resolve(compressedDataUrl);
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setError(null);
    setUploadSuccessMsg(null);
    setIsUploading(true);

    let successCount = 0;
    const newlyUploaded: ClinicalImage[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const dataUrl = await processAndCompressFile(file);
        const res = await api.images.uploadViaMobileSession(token, {
          dataUrl,
          filename: file.name || `mobile_photo_${Date.now()}.jpg`,
          caption: caption.trim() || 'Uploaded from doctor mobile via QR scan'
        });
        newlyUploaded.push(res.image);
        successCount++;
      }

      setUploadedList(prev => [...newlyUploaded, ...prev]);
      setCaption('');
      setUploadSuccessMsg(
        successCount === 1
          ? '1 clinical photo uploaded! It is now visible on your consultation screen.'
          : `${successCount} clinical photos uploaded! They are now visible on your consultation screen.`
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to upload photo');
    } finally {
      setIsUploading(false);
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      if (galleryInputRef.current) galleryInputRef.current.value = '';
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 text-center">
        <Loader2 className="w-10 h-10 text-teal-400 animate-spin mb-3" />
        <p className="text-sm font-bold">Connecting to Consultation Session...</p>
        <p className="text-xs text-slate-400 mt-1">Verifying secure QR upload token</p>
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 mb-4">
          <AlertCircle className="w-7 h-7" />
        </div>
        <h1 className="text-base font-bold">QR Upload Link Expired or Invalid</h1>
        <p className="text-xs text-slate-300 mt-2 max-w-xs leading-relaxed">{error}</p>
        <p className="text-[11px] text-slate-400 mt-4">
          Please click &ldquo;Scan QR from Mobile&rdquo; in the Clinical Images section on your computer to generate a fresh QR code.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f2f6f5] text-slate-900 pb-12">
      {/* Top Clinical Banner */}
      <div className="bg-[#0d3f3b] text-white px-5 py-4 shadow-md">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-500/20 border border-teal-400/30 flex items-center justify-center text-teal-300">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-teal-300 block">
                {session?.clinicName || 'Clinical OS'}
              </span>
              <h1 className="text-sm font-bold leading-tight">Mobile Clinical Image Upload</h1>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2.5 py-1 rounded-full">
            <ShieldCheck className="w-3.5 h-3.5" />
            Live Sync
          </span>
        </div>
      </div>

      <div className="max-w-md mx-auto p-4 space-y-4">
        {/* Patient Context Card */}
        {session && (
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Active Consultation Patient
              </span>
              <span className="text-[11px] font-mono font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200">
                {session.patientCode}
              </span>
            </div>
            <div className="text-base font-extrabold text-slate-900">{session.patientName}</div>
            <div className="text-xs text-slate-500 flex items-center justify-between pt-1 border-t border-slate-100">
              <span>Attending: {session.doctorName}</span>
              <span className="text-emerald-700 font-semibold">Auto-syncs to Desktop</span>
            </div>
          </div>
        )}

        {/* Optional Note / Anatomical Site Input */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Lesion Location / Photo Caption (Optional)
            </label>
            <input
              type="text"
              value={caption}
              onChange={e => setCaption(e.target.value)}
              placeholder="e.g. Left malar cheek plaque, Dermoscopy view..."
              className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-600 focus:bg-white"
            />
          </div>

          {/* Hidden File Inputs for Native Mobile Camera & Photo Library */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFilesSelected}
            className="hidden"
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFilesSelected}
            className="hidden"
          />

          {/* Primary Action Buttons */}
          <div className="grid grid-cols-1 gap-3 pt-1">
            <button
              type="button"
              disabled={isUploading}
              onClick={() => cameraInputRef.current?.click()}
              className="w-full py-3.5 px-4 bg-teal-700 hover:bg-teal-800 active:bg-teal-900 text-white rounded-xl font-bold text-sm shadow-md flex items-center justify-center gap-2.5 transition disabled:opacity-50"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Uploading to Consultation...</span>
                </>
              ) : (
                <>
                  <Camera className="w-5 h-5" />
                  <span>Take Clinical Photo with Camera</span>
                </>
              )}
            </button>

            <button
              type="button"
              disabled={isUploading}
              onClick={() => galleryInputRef.current?.click()}
              className="w-full py-3 px-4 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 border border-slate-300 rounded-xl font-bold text-xs shadow-2xs flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              <Upload className="w-4 h-4 text-teal-700" />
              <span>Choose from Phone Gallery (Multiple Allowed)</span>
            </button>
          </div>
        </div>

        {/* Feedback Banners */}
        {uploadSuccessMsg && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs font-semibold flex items-start gap-2.5 shadow-2xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p>{uploadSuccessMsg}</p>
              <p className="text-[11px] text-emerald-700 font-normal mt-0.5">
                You can take another photo below or close this page on your phone.
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Uploaded Photos in this Session */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5 text-teal-700" />
              <span>Synced Consultation Images ({uploadedList.length})</span>
            </h2>
            {uploadedList.length > 0 && (
              <button
                type="button"
                disabled={isUploading}
                onClick={() => cameraInputRef.current?.click()}
                className="text-xs font-bold text-teal-700 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Another</span>
              </button>
            )}
          </div>

          {uploadedList.length === 0 ? (
            <div className="border border-dashed border-slate-200 rounded-xl p-6 text-center text-slate-400">
              <Camera className="w-6 h-6 mx-auto mb-1.5 opacity-60" />
              <p className="text-xs font-medium text-slate-500">No photos uploaded yet</p>
              <p className="text-[11px] mt-0.5">
                Photos you capture here appear immediately in the doctor&apos;s Clinical Images tab.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {uploadedList.map(img => (
                <div
                  key={img.id}
                  className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50"
                >
                  <div className="aspect-square bg-slate-100 overflow-hidden">
                    <img
                      src={img.url}
                      alt={img.caption || img.filename}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-2">
                    <p className="text-[11px] font-semibold text-slate-700 truncate">
                      {img.caption || img.filename}
                    </p>
                    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 font-semibold">
                      <CheckCircle2 className="w-3 h-3" /> Synced
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
