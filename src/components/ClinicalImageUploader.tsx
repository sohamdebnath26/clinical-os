import React, { useState, useRef, useEffect } from 'react';
import { ClinicalImage } from '../types';
import { api } from '../lib/api';
import QRCode from 'qrcode';
import {
  Camera,
  Upload,
  Trash2,
  Eye,
  X,
  Image as ImageIcon,
  Sparkles,
  QrCode,
  Smartphone,
  CheckCircle2,
  Copy,
  RefreshCw,
  Loader2
} from 'lucide-react';

interface ClinicalImageUploaderProps {
  images: ClinicalImage[];
  onUpload: (dataUrl: string, filename: string, caption?: string) => Promise<void>;
  onDelete?: (imageId: string) => Promise<void>;
  onAnalyzeWithAI?: (image: ClinicalImage) => void;
  readOnly?: boolean;
  patientId?: string;
  patientName?: string;
  consultationId?: string;
  onRemoteImagesSynced?: (syncedImages: ClinicalImage[]) => void;
}

export const ClinicalImageUploader: React.FC<ClinicalImageUploaderProps> = ({
  images,
  onUpload,
  onDelete,
  onAnalyzeWithAI,
  readOnly = false,
  patientId,
  patientName,
  consultationId,
  onRemoteImagesSynced
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [previewImage, setPreviewImage] = useState<ClinicalImage | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Mobile QR Code Upload State
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [mobileUploadUrl, setMobileUploadUrl] = useState<string>('');
  const [mobileSessionToken, setMobileSessionToken] = useState<string | null>(null);
  const [isGeneratingQr, setIsGeneratingQr] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [mobileSyncedCount, setMobileSyncedCount] = useState(0);
  const [isQrExpanded, setIsQrExpanded] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const knownImageIdsRef = useRef<Set<string>>(new Set(images.map(i => i.id)));

  useEffect(() => {
    images.forEach(img => knownImageIdsRef.current.add(img.id));
  }, [images]);

  const startMobileQrSession = async () => {
    if (!patientId) {
      setErrorMsg('Patient context is required to generate a mobile upload QR code.');
      return;
    }

    setErrorMsg(null);
    setShowQrModal(true);
    setIsGeneratingQr(true);
    setCopiedLink(false);

    try {
      const res = await api.images.createMobileSession({
        patientId,
        consultationId
      });

      const token = res.session.token;
      setMobileSessionToken(token);

      const url = `${window.location.origin}${window.location.pathname}?mobileUploadToken=${encodeURIComponent(token)}`;
      setMobileUploadUrl(url);

      const generatedQr = await QRCode.toDataURL(url, {
        width: 380,
        margin: 2,
        color: {
          dark: '#0f2926',
          light: '#ffffff'
        }
      });
      setQrDataUrl(generatedQr);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to generate QR code';
      setErrorMsg(message);
    } finally {
      setIsGeneratingQr(false);
    }
  };

  // Poll the active mobile session so images uploaded from the phone appear automatically on desktop
  useEffect(() => {
    if (!mobileSessionToken) return;

    const interval = setInterval(async () => {
      try {
        const res = await api.images.getMobileSession(mobileSessionToken);
        const sessionImages = res.session.uploadedImages || [];

        const newRemoteImages = sessionImages.filter(img => !knownImageIdsRef.current.has(img.id));
        if (newRemoteImages.length > 0) {
          newRemoteImages.forEach(img => knownImageIdsRef.current.add(img.id));
          setMobileSyncedCount(prev => prev + newRemoteImages.length);
          if (onRemoteImagesSynced) {
            onRemoteImagesSynced(sessionImages);
          }
        }
      } catch {
        // Ignore transient polling errors
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [mobileSessionToken, onRemoteImagesSynced]);

  const handleCopyMobileUrl = async () => {
    if (!mobileUploadUrl) return;
    try {
      await navigator.clipboard.writeText(mobileUploadUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      // ignore
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setErrorMsg('Only JPG and PNG images are supported.');
      return;
    }

    if (file.size > 4 * 1024 * 1024) {
      setErrorMsg('Image size exceeds 4 MB limit.');
      return;
    }

    setErrorMsg(null);
    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await onUpload(reader.result as string, file.name);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Upload failed';
        setErrorMsg(message);
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  const startCamera = async () => {
    setCameraError(null);
    setShowCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err) {
      console.warn('Camera access denied or unavailable:', err);
      setCameraError('Unable to access camera. Please check camera permissions or upload an image file.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setShowCamera(false);
    setCameraError(null);
  };

  const capturePhoto = async () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);

    stopCamera();
    setIsUploading(true);
    try {
      await onUpload(dataUrl, `capture_${Date.now()}.jpg`, 'Captured via camera');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Photo upload failed';
      setErrorMsg(message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header & Upload Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
        <div>
          <h4 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <span>Clinical Documentation Images</span>
            {mobileSyncedCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200">
                <Smartphone className="w-3 h-3 text-emerald-700" />
                {mobileSyncedCount} synced from mobile
              </span>
            )}
          </h4>
          <p className="text-xs text-slate-500">
            Upload from computer, take photo with webcam, or scan QR code to upload directly from your mobile phone.
          </p>
        </div>

        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              className="hidden"
            />
            {patientId && (
              <button
                type="button"
                onClick={startMobileQrSession}
                disabled={isUploading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 hover:bg-teal-100 border border-teal-300 rounded-lg text-xs font-bold text-teal-900 shadow-2xs transition-colors disabled:opacity-50"
              >
                <QrCode className="w-3.5 h-3.5 text-teal-700" />
                <span>Scan QR from Mobile</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 shadow-sm transition-colors disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5 text-slate-500" />
              Upload file
            </button>
            <button
              type="button"
              onClick={startCamera}
              disabled={isUploading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
            >
              <Camera className="w-3.5 h-3.5" />
              Upload / Take photo
            </button>
          </div>
        )}
      </div>

      {/* Inline Mobile QR Code Card (Quick-access banner inside Clinical Images section) */}
      {!readOnly && patientId && (
        <div className="bg-gradient-to-r from-teal-50/90 via-emerald-50/60 to-slate-50 border border-teal-200/90 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-700 text-white flex items-center justify-center shrink-0 shadow-xs">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h5 className="text-xs font-bold text-slate-900">
                  Upload Clinical Photos from Doctor&apos;s Mobile Phone
                </h5>
                <span className="text-[10px] font-bold bg-white text-teal-800 px-2 py-0.5 rounded-full border border-teal-200">
                  Instant Live Sync
                </span>
              </div>
              <p className="text-[11px] text-slate-600 mt-0.5">
                Generate a secure one-time QR code, scan it with your phone camera, and snap or select lesion photos — they appear here automatically.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={startMobileQrSession}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-teal-800 hover:bg-teal-900 text-white rounded-xl text-xs font-bold shadow-xs transition-colors shrink-0 self-end sm:self-center"
          >
            <QrCode className="w-4 h-4 text-teal-200" />
            <span>Generate QR Code</span>
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center justify-between">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Mobile QR Code Scanner Modal */}
      {showQrModal && (
        <div
          onClick={() => setShowQrModal(false)}
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 backdrop-blur-xs"
        >
          <div
            onClick={e => e.stopPropagation()}
            className={`bg-white border border-slate-200 rounded-2xl w-full shadow-2xl overflow-hidden transition-all duration-150 ease-out ${
              isQrExpanded ? 'max-w-lg' : 'max-w-md'
            }`}
          >
            <div className="bg-[#0d3f3b] text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-teal-500/20 border border-teal-400/30 flex items-center justify-center text-teal-300">
                  <QrCode className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold leading-tight">Scan QR to Upload from Mobile</h3>
                  <p className="text-[11px] text-teal-200">
                    {patientName ? `Patient: ${patientName}` : 'Direct Mobile-to-Consultation Sync'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="text-teal-200 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 flex flex-col items-center text-center space-y-4">
              {isGeneratingQr ? (
                <div className="w-60 h-60 flex flex-col items-center justify-center bg-slate-50 rounded-2xl border border-slate-200">
                  <Loader2 className="w-8 h-8 text-teal-700 animate-spin mb-2" />
                  <span className="text-xs font-semibold text-slate-600">Generating secure QR code...</span>
                </div>
              ) : qrDataUrl ? (
                <button
                  type="button"
                  onClick={() => setIsQrExpanded(prev => !prev)}
                  title={isQrExpanded ? 'Click to shrink QR code' : 'Click to expand QR code'}
                  className="group p-3 bg-white rounded-2xl border-2 border-teal-600/30 hover:border-teal-600 shadow-md transition-all duration-150 ease-out cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-600/25"
                >
                  <img
                    src={qrDataUrl}
                    alt="Scan QR code with mobile phone to upload clinical images"
                    className={`object-contain transition-all duration-150 ease-out ${
                      isQrExpanded ? 'w-80 h-80' : 'w-56 h-56'
                    }`}
                  />
                  <span className="block text-[10px] font-medium text-slate-400 group-hover:text-teal-700 mt-1">
                    {isQrExpanded ? 'Click QR to shrink' : 'Click QR to expand'}
                  </span>
                </button>
              ) : null}

              <div className="space-y-1.5 max-w-xs">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Waiting for mobile photos (Live Sync Active)</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  1. Open your phone&apos;s camera and point it at this QR code.<br />
                  2. Tap the link that appears to take or select photos.<br />
                  3. Uploaded photos appear automatically in this consultation.
                </p>
              </div>

              {images.length > 0 && (
                <div className="w-full bg-teal-50/70 border border-teal-200 rounded-xl p-2.5 flex items-center justify-between text-xs text-teal-900">
                  <span className="font-semibold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-teal-700" />
                    <span>{images.length} image{images.length === 1 ? '' : 's'} in consultation</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowQrModal(false)}
                    className="text-xs font-bold text-teal-800 underline"
                  >
                    View Images
                  </button>
                </div>
              )}

              {/* Copy link / Regenerate controls */}
              <div className="w-full pt-2 border-t border-slate-200 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={handleCopyMobileUrl}
                  className="flex-1 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                >
                  {copiedLink ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Mobile Link Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                      <span>Copy Mobile Link</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={startMobileQrSession}
                  disabled={isGeneratingQr}
                  className="py-2 px-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                  title="Generate a fresh QR code"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                  <span>Refresh QR</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowQrModal(false)}
                  className="py-2 px-4 bg-teal-800 hover:bg-teal-900 text-white rounded-xl text-xs font-bold transition"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Live Camera Viewfinder Modal */}
      {showCamera && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden max-w-md w-full shadow-2xl p-4 flex flex-col items-center">
            <div className="w-full flex items-center justify-between pb-3 text-white">
              <span className="text-sm font-semibold flex items-center gap-2">
                <Camera className="w-4 h-4 text-teal-400" /> Clinical Camera Viewfinder
              </span>
              <button
                type="button"
                onClick={stopCamera}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {cameraError ? (
              <div className="p-6 text-center text-red-400 text-xs">
                {cameraError}
              </div>
            ) : (
              <div className="relative rounded-xl overflow-hidden bg-black w-full aspect-4/3 flex items-center justify-center">
                <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                <div className="absolute inset-0 border-2 border-white/20 pointer-events-none rounded-xl" />
              </div>
            )}

            <div className="flex gap-3 w-full mt-4">
              <button
                type="button"
                onClick={stopCamera}
                className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
              {!cameraError && (
                <button
                  type="button"
                  onClick={capturePhoto}
                  className="flex-1 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 shadow-lg"
                >
                  <Camera className="w-4 h-4" />
                  Capture Photo
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Uploaded Images Grid */}
      {images.length === 0 ? (
        <div className="border border-dashed border-slate-300 rounded-xl p-8 text-center bg-slate-50/50">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-2 text-slate-400">
            <ImageIcon className="w-6 h-6" />
          </div>
          <p className="text-xs font-medium text-slate-600">No images yet — upload from desktop or scan QR with mobile</p>
          <p className="text-[11px] text-slate-400 mt-1">Clinical photos document the visit</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {images.map(img => (
            <div
              key={img.id}
              className="group relative bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow transition-all"
            >
              <div
                onClick={() => setPreviewImage(img)}
                className="aspect-square bg-slate-100 cursor-pointer overflow-hidden flex items-center justify-center"
              >
                <img
                  src={img.url}
                  alt={img.caption || 'Clinical documentation'}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                />
              </div>

              <div className="p-2">
                <p className="text-[11px] font-medium text-slate-700 truncate">
                  {img.caption || img.filename}
                </p>
                <p className="text-[10px] text-slate-400">
                  {new Date(img.createdAt).toLocaleDateString()}
                </p>
              </div>

              {/* Hover actions */}
              <div className="absolute top-1.5 right-1.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 rounded-md p-1 backdrop-blur-xs">
                {onAnalyzeWithAI && (
                  <button
                    type="button"
                    onClick={() => onAnalyzeWithAI(img)}
                    title="Analyze with AI"
                    className="text-amber-300 hover:text-amber-200 p-0.5"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPreviewImage(img)}
                  title="View full size"
                  className="text-white hover:text-teal-300 p-0.5"
                >
                  <Eye className="w-3.5 h-3.5" />
                </button>
                {!readOnly && onDelete && (
                  <button
                    type="button"
                    onClick={() => onDelete(img.id)}
                    title="Delete image"
                    className="text-white hover:text-red-400 p-0.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Fullsize Image Preview Modal */}
      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
          >
            <div className="p-3 border-b border-slate-200 flex items-center justify-between">
              <div>
                <span className="text-sm font-semibold text-slate-800">{previewImage.filename}</span>
                <span className="text-xs text-slate-500 block">
                  {new Date(previewImage.createdAt).toLocaleString()} · {(previewImage.sizeBytes / 1024).toFixed(0)} KB
                </span>
              </div>
              <div className="flex items-center gap-2">
                {onAnalyzeWithAI && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = previewImage;
                      setPreviewImage(null);
                      onAnalyzeWithAI(target);
                    }}
                    className="px-3 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                    <span>Analyze with AI</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPreviewImage(null)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="bg-slate-900 p-2 flex items-center justify-center overflow-auto max-h-[70vh]">
              <img
                src={previewImage.url}
                alt="Clinical photo full preview"
                className="max-h-[65vh] w-auto object-contain rounded-md"
              />
            </div>
            {previewImage.caption && (
              <div className="p-3 bg-slate-50 text-xs text-slate-700 border-t border-slate-200">
                <span className="font-semibold">Notes:</span> {previewImage.caption}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
