import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import {
  ShieldCheck,
  ShieldAlert,
  Stethoscope,
  Pill,
  UserCheck,
  Calendar,
  Phone,
  CheckCircle2,
  Loader2,
  ArrowLeft
} from 'lucide-react';

interface PrescriptionVerifyViewProps {
  token: string;
}

export const PrescriptionVerifyView: React.FC<PrescriptionVerifyViewProps> = ({ token }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{
    verified: boolean;
    verificationCode: string;
    signedAt: string;
    clinic: {
      name: string;
      doctorName: string;
      speciality: string;
      registrationNumber: string;
      phone: string;
    };
    patient: {
      name: string;
      patientCode: string;
      demographics: string;
    };
    medications: Array<{
      medicineName: string;
      dosage: string;
      frequency: string;
      duration: string;
      instructions: string;
    }>;
  } | null>(null);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError(null);

    api.prescriptions
      .verifyToken(token)
      .then((res) => {
        if (!isMounted) return;
        setData(res);
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : 'Unable to verify prescription signature.');
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [token]);

  const handleReturnToApp = () => {
    window.location.href = window.location.pathname;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Top Banner */}
        <div className="px-6 py-5 bg-gradient-to-r from-teal-900/80 to-slate-900 border-b border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-teal-600/20 border border-teal-500/40 flex items-center justify-center text-teal-400">
              <Stethoscope className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-white tracking-tight">
                Cliniq Clinical OS · Digital Rx Verification
              </h1>
              <p className="text-xs text-slate-400">
                Cryptographic HMAC-SHA256 Pharmacy & Patient Verification Portal
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleReturnToApp}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Clinic Portal</span>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-teal-400" />
              <p className="text-sm font-medium">Verifying cryptographic prescription signature...</p>
            </div>
          ) : error || !data?.verified ? (
            <div className="p-6 rounded-2xl bg-rose-950/40 border border-rose-500/40 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center mx-auto text-rose-400">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <h2 className="text-base font-bold text-rose-200">
                Signature Verification Failed
              </h2>
              <p className="text-xs text-rose-300/90 max-w-md mx-auto">
                {error || 'This prescription QR token is invalid or has been altered.'}
              </p>
            </div>
          ) : (
            <>
              {/* Verified Status Badge */}
              <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start sm:items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-emerald-200">
                        Authentic Digital Prescription Verified
                      </span>
                      <span className="px-2 py-0.5 text-[11px] font-mono font-bold bg-emerald-500/20 text-emerald-300 rounded-md border border-emerald-500/30">
                        {data.verificationCode}
                      </span>
                    </div>
                    <p className="text-xs text-emerald-300/80 mt-0.5">
                      Signed on {new Date(data.signedAt).toLocaleString()} · Tamper-Evident HMAC-SHA256
                    </p>
                  </div>
                </div>
              </div>

              {/* Prescribing Doctor & Patient Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-slate-800/70 border border-slate-700/80 space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-teal-400 flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5" />
                    Prescribing Physician & Clinic
                  </span>
                  <p className="text-sm font-bold text-white">{data.clinic.doctorName}</p>
                  <p className="text-xs text-slate-300">{data.clinic.speciality}</p>
                  <p className="text-xs font-mono text-teal-300">
                    Reg. No: {data.clinic.registrationNumber}
                  </p>
                  <p className="text-xs text-slate-400 pt-1">{data.clinic.name}</p>
                  {data.clinic.phone && (
                    <p className="text-xs text-slate-400 flex items-center gap-1">
                      <Phone className="w-3 h-3" /> {data.clinic.phone}
                    </p>
                  )}
                </div>

                <div className="p-4 rounded-xl bg-slate-800/70 border border-slate-700/80 space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-teal-400 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    Patient Record Summary
                  </span>
                  <p className="text-sm font-bold text-white">{data.patient.name}</p>
                  <p className="text-xs font-mono text-teal-300">
                    Patient ID: {data.patient.patientCode}
                  </p>
                  {data.patient.demographics && (
                    <p className="text-xs text-slate-300">
                      Demographics: {data.patient.demographics}
                    </p>
                  )}
                  <p className="text-[11px] text-emerald-400 flex items-center gap-1 pt-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Authorized for Pharmacy Dispensing
                  </p>
                </div>
              </div>

              {/* Authorized Medications */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Pill className="w-3.5 h-3.5 text-teal-400" />
                    Authorized Medications ({data.medications.length})
                  </h3>
                </div>

                {data.medications.length === 0 ? (
                  <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700 text-xs text-slate-400 text-center">
                    No active medication items attached to this verification batch.
                  </div>
                ) : (
                  <div className="border border-slate-700/80 rounded-xl overflow-hidden divide-y divide-slate-800 bg-slate-900/60">
                    {data.medications.map((med, idx) => (
                      <div key={idx} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <span className="text-sm font-bold text-white block">
                            {idx + 1}. {med.medicineName}
                          </span>
                          {med.instructions && (
                            <span className="text-xs text-slate-400 block mt-0.5">
                              {med.instructions}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap text-xs">
                          <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-200 font-medium">
                            {med.dosage}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-teal-950/80 border border-teal-700/50 text-teal-300 font-mono font-semibold">
                            {med.frequency}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-300">
                            {med.duration}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
