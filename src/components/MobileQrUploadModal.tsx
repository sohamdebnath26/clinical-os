import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { api } from '../lib/api';
import { ClinicalImage } from '../types';
import {
  QrCode,
  X,
  Smartphone,
  Copy,
  CheckCircle2,
  RefreshCw,
  Loader2,
  Sparkles,
  Camera,
  ExternalLink
} from 'lucide-react';

interface MobileQrUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientId?: string;
  patientName?: string;
  consultationId?: string;
  title?: string;
  subtitle?: string;
  slotLabel?: string;
  onImageUploaded: (image: ClinicalImage) => void;
}

export const MobileQrUploadModal: React.FC<MobileQrUploadModalProps> = ({
  isOpen,
  onClose,
  patientId,
  patientName,
  consultationId,
  title = 'Scan QR to Upload from Mobile',
  subtitle,
  slotLabel,
  onImageUploaded
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [mobileUploadUrl, setMobileUploadUrl] = useState<string>('');
  const [mobileSessionToken, setMobileSessionToken] = useState<string | null>(null);
  const [isGeneratingQr, setIsGeneratingQr] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isQrExpanded, setIsQrExpanded] = useState(false);
  const [syncedImages, setSyncedImages] = useState<ClinicalImage[]>([]);

  const knownImageIdsRef = useRef<Set<string>>(new Set());

  // Generate QR session when opened
  useEffect(() => {
    if (!isOpen) {
      setQrDataUrl(null);
      setMobileSessionToken(null);
      setMobileUploadUrl('');
      setSyncedImages([]);
      knownImageIdsRef.current = new Set();
      return;
    }

    let isMounted = true;
    setIsGeneratingQr(true);
    setErrorMsg(null);
    setCopiedLink(false);

    api.images
      .createMobileSession({
        patientId,
        consultationId
      })
      .then(async (res) => {
        if (!isMounted) return;
        const token = res.session.token;
        setMobileSessionToken(token);

        // Pre-populate already existing images so we only fire onImageUploaded for genuinely newly uploaded photos
        if (res.session.uploadedImages) {
          res.session.uploadedImages.forEach((img) => knownImageIdsRef.current.add(img.id));
        }

        const url = `${window.location.origin}${window.location.pathname}?mobileUploadToken=${encodeURIComponent(token)}`;
        setMobileUploadUrl(url);

        try {
          const generated = await QRCode.toDataURL(url, {
            width: 360,
            margin: 2,
            color: {
              dark: '#0f2926',
              light: '#ffffff'
            }
          });
          if (isMounted) setQrDataUrl(generated);
        } catch {
          // Fallback to QR Server API if local canvas fails
          const fallbackUrl = `https://api.qrserver.com/v1/create-qr-code/?size=360x360&data=${encodeURIComponent(url)}`;
          if (isMounted) setQrDataUrl(fallbackUrl);
        }
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : 'Failed to generate mobile upload QR';
        setErrorMsg(msg);
      })
      .finally(() => {
        if (isMounted) setIsGeneratingQr(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, patientId, consultationId]);

  // Live poll mobile session every 2 seconds
  useEffect(() => {
    if (!isOpen || !mobileSessionToken) return;

    const interval = setInterval(async () => {
      try {
        const res = await api.images.getMobileSession(mobileSessionToken);
        const sessionImages = res.session.uploadedImages || [];

        const newlyUploaded = sessionImages.filter((img) => !knownImageIdsRef.current.has(img.id));
        if (newlyUploaded.length > 0) {
          newlyUploaded.forEach((img) => {
            knownImageIdsRef.current.add(img.id);
            onImageUploaded(img);
          });
          setSyncedImages((prev) => [...newlyUploaded, ...prev]);
        }
      } catch {
        // Ignore transient network errors
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [isOpen, mobileSessionToken, onImageUploaded]);

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

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`bg-white border border-slate-200 rounded-2xl w-full shadow-2xl overflow-hidden transition-all duration-150 ease-out ${
          isQrExpanded ? 'max-w-lg' : 'max-w-md'
        }`}
      >
        {/* Header */}
        <div className="bg-[#0d3f3b] text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-500/20 border border-teal-400/30 flex items-center justify-center text-teal-300">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold leading-tight">{title}</h3>
              <p className="text-[11px] text-teal-200">
                {subtitle || (patientName ? `Patient: ${patientName}` : 'Instant Phone Camera Sync')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onClose}
            className="text-teal-200 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col items-center text-center space-y-4">
          {slotLabel && (
            <div className="w-full bg-teal-50/80 border border-teal-200 rounded-xl px-3 py-1.5 flex items-center justify-between text-xs text-teal-900">
              <span className="font-semibold flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-teal-700" />
                <span>Target: {slotLabel}</span>
              </span>
              <span className="text-[10px] bg-teal-200/60 text-teal-800 font-bold px-2 py-0.5 rounded-full">
                Auto-Selects
              </span>
            </div>
          )}

          {errorMsg && (
            <div className="w-full p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs text-left">
              {errorMsg}
            </div>
          )}

          {isGeneratingQr ? (
            <div className="w-60 h-60 flex flex-col items-center justify-center bg-slate-50 rounded-2xl border border-slate-200">
              <Loader2 className="w-8 h-8 text-teal-700 animate-spin mb-2" />
              <span className="text-xs font-semibold text-slate-600">Generating secure QR code...</span>
            </div>
          ) : qrDataUrl ? (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setIsQrExpanded((prev) => !prev)}
              title={isQrExpanded ? 'Click to shrink QR code' : 'Click to expand QR code'}
              className="group p-3 bg-white rounded-2xl border-2 border-teal-600/30 hover:border-teal-600 shadow-md transition-all duration-150 ease-out cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-600/25"
            >
              <img
                src={qrDataUrl}
                alt="Scan QR code with phone to upload"
                className={`object-contain transition-all duration-150 ease-out ${
                  isQrExpanded ? 'w-80 h-80' : 'w-56 h-56'
                }`}
              />
              <span className="block text-[10px] font-medium text-slate-400 group-hover:text-teal-700 mt-1">
                {isQrExpanded ? 'Click QR to shrink' : 'Click QR to expand'}
              </span>
            </button>
          ) : null}

          {/* Live Sync Status indicator */}
          <div className="space-y-1.5 max-w-xs">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Waiting for mobile photos (Live Sync Active)</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              1. Open your phone&apos;s camera and point it at this QR code.<br />
              2. Tap the link to snap or select clinical lesion photos.<br />
              3. The photo appears on your screen instantly.
            </p>
          </div>

          {/* Synced images banner */}
          {syncedImages.length > 0 && (
            <div className="w-full bg-emerald-50/90 border border-emerald-200 rounded-xl p-3 text-left">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900 mb-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>
                  {syncedImages.length} photo{syncedImages.length === 1 ? '' : 's'} received from phone!
                </span>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {syncedImages.map((img) => (
                  <div
                    key={img.id}
                    className="w-14 h-14 rounded-lg overflow-hidden border border-emerald-300 shrink-0 relative bg-slate-100"
                  >
                    <img src={img.url} alt={img.caption} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Controls Footer */}
          <div className="w-full pt-2 border-t border-slate-200 flex items-center justify-between gap-2">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleCopyMobileUrl}
              className="flex-1 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              {copiedLink ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700">Link Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-500" />
                  <span>Copy Link</span>
                </>
              )}
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (mobileUploadUrl) {
                  window.open(mobileUploadUrl, '_blank');
                }
              }}
              className="py-2 px-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition cursor-pointer"
              title="Open test upload window"
            >
              <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
              <span>Test</span>
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onClose}
              className="py-2 px-4 bg-teal-800 hover:bg-teal-900 text-white rounded-xl text-xs font-bold transition cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
