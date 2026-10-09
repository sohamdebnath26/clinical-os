import React, { useState, useRef } from 'react';
import { ClinicalImage } from '../types';
import { Camera, Upload, Trash2, Eye, X, Image as ImageIcon } from 'lucide-react';

interface ClinicalImageUploaderProps {
  images: ClinicalImage[];
  onUpload: (dataUrl: string, filename: string, caption?: string) => Promise<void>;
  onDelete?: (imageId: string) => Promise<void>;
  readOnly?: boolean;
}

export const ClinicalImageUploader: React.FC<ClinicalImageUploaderProps> = ({
  images,
  onUpload,
  onDelete,
  readOnly = false
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [previewImage, setPreviewImage] = useState<ClinicalImage | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

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
          <h4 className="text-sm font-semibold text-slate-800">Clinical Documentation Images</h4>
          <p className="text-xs text-slate-500">Upload or take clinical photos. JPG/PNG, up to 4MB each.</p>
        </div>

        {!readOnly && (
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              className="hidden"
            />
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

      {errorMsg && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center justify-between">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg(null)}><X className="w-4 h-4" /></button>
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
          <p className="text-xs font-medium text-slate-600">No images yet — click to upload</p>
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
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
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
