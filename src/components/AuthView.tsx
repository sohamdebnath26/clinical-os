import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { LanguageSelector } from './LanguageSelector';
import {
  Stethoscope,
  ShieldCheck,
  ArrowRight,
  AlertCircle,
  Loader2,
  UserCheck,
  UserCog,
  Mail,
  Sparkles,
  CheckCircle2
} from 'lucide-react';

export const AuthView: React.FC = () => {
  const { login, loginWithGoogle } = useAuth();

  // Gmail / Google login state
  const [gmailEmail, setGmailEmail] = useState('sohamdebnath.edu@gmail.com');
  const [doctorName, setDoctorName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeAction, setActiveAction] = useState<'gmail' | 'doctor-demo' | 'receptionist-demo' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Derive doctor name from email if not explicitly provided
  const getDerivedDoctorName = (email: string) => {
    if (doctorName.trim()) return doctorName.trim();
    const prefix = email.split('@')[0] || 'Doctor';
    const cleanWords = prefix
      .replace(/[._-]+/g, ' ')
      .split(' ')
      .filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    return `Dr. ${cleanWords || 'Physician'}`;
  };

  // Sign in with Google / Gmail account
  const handleGmailSignIn = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanEmail = gmailEmail.trim().toLowerCase();

    if (!cleanEmail) {
      setError('Please enter your Google / Gmail address.');
      return;
    }

    if (!cleanEmail.includes('@')) {
      setError('Please provide a valid email address.');
      return;
    }

    setIsLoading(true);
    setActiveAction('gmail');
    setError(null);

    try {
      const derivedName = getDerivedDoctorName(cleanEmail);
      await loginWithGoogle({
        email: cleanEmail,
        name: derivedName
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to sign in with Google account';
      setError(msg);
    } finally {
      setIsLoading(false);
      setActiveAction(null);
    }
  };

  // 1-Click Doctor Demo
  const handleDoctorDemo = async () => {
    setIsLoading(true);
    setActiveAction('doctor-demo');
    setError(null);
    try {
      await login('demo@clinicalos.med', 'Demo@1234');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to launch Doctor Demo';
      setError(msg);
    } finally {
      setIsLoading(false);
      setActiveAction(null);
    }
  };

  // 1-Click Receptionist Demo
  const handleReceptionistDemo = async () => {
    setIsLoading(true);
    setActiveAction('receptionist-demo');
    setError(null);
    try {
      await login('receptionist@clinicalos.med', 'Demo@1234');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to launch Receptionist Demo';
      setError(msg);
    } finally {
      setIsLoading(false);
      setActiveAction(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-4 sm:p-6 relative overflow-hidden select-none">
      {/* Ambient background glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Language Switcher in top corner */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20">
        <LanguageSelector />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-cyan-600 to-indigo-600 shadow-lg shadow-cyan-500/20 mb-3 border border-white/10">
            <Stethoscope className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center justify-center gap-2">
            Cliniq <span className="text-cyan-400 font-medium text-lg">Clinical OS</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Intelligent Outpatient & Dermatology Practice Management
          </p>
        </div>

        {/* Main Clean Login Card */}
        <div className="bg-slate-800/90 backdrop-blur-xl border border-slate-700/80 rounded-2xl p-6 sm:p-7 shadow-2xl shadow-black/40">
          {/* Error Banner */}
          {error && (
            <div className="mb-5 p-3.5 bg-rose-500/15 border border-rose-500/30 rounded-xl flex items-start gap-3 text-rose-300 text-sm animate-in fade-in">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-400" />
              <div className="flex-1 font-medium">{error}</div>
            </div>
          )}

          {/* SECTION 1: Clinic Sign In with Email / Gmail (Doctor or Assigned Receptionist) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-cyan-400" />
                Clinic Sign In (Doctor or Receptionist Email)
              </label>
              <span className="text-[11px] font-medium text-cyan-400/90 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-cyan-400" /> Role-Verified
              </span>
            </div>

            <form onSubmit={handleGmailSignIn} className="space-y-3">
              <div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                  </div>
                  <input
                    type="email"
                    value={gmailEmail}
                    onChange={(e) => setGmailEmail(e.target.value)}
                    placeholder="doctor@gmail.com or frontdesk@clinic.com"
                    disabled={isLoading}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-900/80 border border-slate-700 rounded-xl text-white text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5 ml-1">
                  Doctors can assign any email as <strong className="text-slate-200">Doctor</strong> or <strong className="text-emerald-300">Receptionist</strong> in Settings. Signing in automatically opens your assigned role &amp; shared clinic workspace.
                </p>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2.5 px-4 py-3 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 active:scale-[0.99] text-white font-medium text-sm rounded-xl shadow-lg shadow-cyan-600/20 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isLoading && activeAction === 'gmail' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Signing in to Clinic Account...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                      <path
                        fill="#ffffff"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#ffffff"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#ffffff"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#ffffff"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    <span>Sign in with Email / Gmail</span>
                    <ArrowRight className="w-4 h-4 ml-0.5 opacity-80" />
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Simple Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-700/80" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-slate-800 px-3 text-slate-400 font-semibold tracking-wider">
                Or explore demo accounts
              </span>
            </div>
          </div>

          {/* SECTION 2 & 3: Doctor Demo & Receptionist Demo */}
          <div className="space-y-3">
            {/* Doctor Demo Button */}
            <button
              type="button"
              onClick={handleDoctorDemo}
              disabled={isLoading}
              className="w-full text-left p-3.5 bg-slate-900/60 hover:bg-slate-900 border border-slate-700/80 hover:border-cyan-500/50 rounded-xl transition-all group cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 group-hover:scale-105 transition-transform">
                    {isLoading && activeAction === 'doctor-demo' ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <UserCheck className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white flex items-center gap-1.5">
                      Doctor Demo
                      <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 bg-cyan-500/20 text-cyan-300 rounded">
                        Dr. Demo
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">
                      Full OPD timeline, AI image comparison, prescriptions & billing
                    </p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
              </div>
            </button>

            {/* Receptionist Demo Button */}
            <button
              type="button"
              onClick={handleReceptionistDemo}
              disabled={isLoading}
              className="w-full text-left p-3.5 bg-slate-900/60 hover:bg-slate-900 border border-slate-700/80 hover:border-emerald-500/50 rounded-xl transition-all group cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-transform">
                    {isLoading && activeAction === 'receptionist-demo' ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <UserCog className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white flex items-center gap-1.5">
                      Receptionist Demo
                      <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 bg-emerald-500/20 text-emerald-300 rounded">
                        Emily
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">
                      Front-desk walk-in registration & OPD clinic patient queue
                    </p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
              </div>
            </button>
          </div>
        </div>

        {/* Security & Compliance Footer */}
        <div className="mt-6 text-center text-xs text-slate-500 flex items-center justify-center gap-4">
          <span className="flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400/80" /> 256-bit AES Encrypted
          </span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400/80" /> HIPAA / GDPR Architecture
          </span>
        </div>
      </div>
    </div>
  );
};
