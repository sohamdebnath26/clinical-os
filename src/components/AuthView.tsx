import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { LanguageSelector } from './LanguageSelector';
import {
  Stethoscope,
  ArrowRight,
  AlertCircle,
  Loader2,
  Mail
} from 'lucide-react';

export const AuthView: React.FC = () => {
  const { login, loginWithGoogle } = useAuth();

  const [email, setEmail] = useState('sohamdebnath.edu@gmail.com');
  const [isLoading, setIsLoading] = useState(false);
  const [activeAction, setActiveAction] = useState<'email' | 'doctor-demo' | 'receptionist-demo' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const getDerivedName = (rawEmail: string) => {
    const prefix = rawEmail.split('@')[0] || 'User';
    const cleanWords = prefix
      .replace(/[._-]+/g, ' ')
      .split(' ')
      .filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    return cleanWords || 'Clinic User';
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }

    setIsLoading(true);
    setActiveAction('email');
    setError(null);

    try {
      await loginWithGoogle({
        email: cleanEmail,
        name: getDerivedName(cleanEmail)
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to sign in';
      setError(msg);
    } finally {
      setIsLoading(false);
      setActiveAction(null);
    }
  };

  const handleQuickDemo = async (role: 'doctor' | 'receptionist') => {
    setIsLoading(true);
    setActiveAction(role === 'doctor' ? 'doctor-demo' : 'receptionist-demo');
    setError(null);
    try {
      const targetEmail =
        role === 'doctor' ? 'demo@clinicalos.med' : 'receptionist@clinicalos.med';
      await login(targetEmail, 'Demo@1234');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to sign in';
      setError(msg);
    } finally {
      setIsLoading(false);
      setActiveAction(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-4 sm:p-6 relative overflow-hidden select-none">
      {/* Language Switcher */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20">
        <LanguageSelector />
      </div>

      <div className="w-full max-w-sm relative z-10">
        {/* Simple Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-teal-600 shadow-lg mb-3">
            <Stethoscope className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Cliniq Clinical OS
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Sign in with your email address to continue
          </p>
        </div>

        {/* Simple Sign In Card */}
        <div className="bg-slate-800/95 border border-slate-700/80 rounded-2xl p-6 shadow-xl">
          {error && (
            <div className="mb-4 p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl flex items-start gap-2.5 text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSignIn} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  disabled={isLoading}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-500 text-white font-semibold text-sm rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-60"
            >
              {isLoading && activeAction === 'email' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Compact Quick Demo Buttons */}
          <div className="mt-5 pt-4 border-t border-slate-700/70">
            <span className="block text-[11px] text-slate-400 text-center mb-2.5">
              Quick Demo Access
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleQuickDemo('doctor')}
                disabled={isLoading}
                className="px-3 py-2 bg-slate-900 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-semibold text-slate-200 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isLoading && activeAction === 'doctor-demo' ? 'Loading...' : 'Doctor Demo'}
              </button>
              <button
                type="button"
                onClick={() => handleQuickDemo('receptionist')}
                disabled={isLoading}
                className="px-3 py-2 bg-slate-900 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-semibold text-slate-200 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isLoading && activeAction === 'receptionist-demo' ? 'Loading...' : 'Receptionist Demo'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
