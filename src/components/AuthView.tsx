import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { LanguageSelector } from './LanguageSelector';
import { Stethoscope, Lock, Mail, User, ShieldCheck, ArrowRight, AlertCircle, Building } from 'lucide-react';

export const AuthView: React.FC = () => {
  const { login, register } = useAuth();
  const { t } = useLanguage();
  const [isRegisterMode, setIsRegisterMode] = useState(false);

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [speciality, setSpeciality] = useState('Dermatologist & Cosmetologist');
  const [clinicName, setClinicName] = useState('Cliniq Dermatology Center');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid login credentials';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password) {
      setError('Please fill in all required fields.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      await register({
        name,
        email,
        password,
        speciality,
        clinicName
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const fillDemoAccount = () => {
    setEmail('demo@clinicalos.med');
    setPassword('Demo@1234');
    setError(null);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
      {/* Background radial gradient accent */}
      <div className="absolute inset-0 bg-[radial-gradient(#14b8a6_1px,transparent_1px)] [background-size:24px_24px] opacity-15 pointer-events-none" />

      <div className="relative z-10 w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 border border-slate-200">
        {/* Language selector in top right of card */}
        <div className="absolute right-5 top-5">
          <LanguageSelector variant="compact" />
        </div>

        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-teal-800 text-white shadow-lg mb-3">
            <Stethoscope className="w-7 h-7" />
          </div>
          <div className="flex items-center justify-center gap-2">
            <span className="text-2xl font-black tracking-tight text-slate-900 font-sans">Cliniq</span>
            <span className="h-4 w-px bg-slate-300" />
            <span className="text-xs font-extrabold uppercase tracking-widest text-teal-800">
              {t('appName')}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            {t('welcomeBack')}
          </p>
        </div>

        {error && (
          <div className="mb-5 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!isRegisterMode ? (
          /* LOGIN FORM */
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                {t('email')}
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="email"
                  required
                  placeholder="doctor@clinic.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full text-xs pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:bg-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                {t('password')}
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full text-xs pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:bg-white"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 bg-teal-800 hover:bg-teal-900 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <span>{isLoading ? t('loading') : t('doctorSignIn')}</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            {/* Quick Demo Fill button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={fillDemoAccount}
                className="w-full py-2 px-3 bg-teal-50 hover:bg-teal-100 text-teal-800 rounded-xl text-xs font-semibold border border-teal-200 transition-colors flex items-center justify-center gap-1.5"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                {t('oneClickDemo')}
              </button>
            </div>

            <div className="pt-4 border-t border-slate-100 text-center">
              <button
                type="button"
                onClick={() => {
                  setIsRegisterMode(true);
                  setError(null);
                }}
                className="text-xs font-semibold text-slate-600 hover:text-teal-800 transition-colors"
              >
                CREATE DOCTOR ACCOUNT
              </button>
            </div>
          </form>
        ) : (
          /* REGISTRATION FORM */
          <form onSubmit={handleRegister} className="space-y-3.5">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                Full Name *
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  required
                  placeholder="e.g. Dr. Sarah Jenkins"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full text-xs pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:ring-1 focus:ring-teal-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                Email Address *
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="email"
                  required
                  placeholder="sarah@medpractice.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full text-xs pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:ring-1 focus:ring-teal-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Speciality
                </label>
                <input
                  type="text"
                  placeholder="e.g. Dermatology"
                  value={speciality}
                  onChange={e => setSpeciality(e.target.value)}
                  className="w-full text-xs px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:ring-1 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Clinic Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Metro Clinic"
                  value={clinicName}
                  onChange={e => setClinicName(e.target.value)}
                  className="w-full text-xs px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:ring-1 focus:ring-teal-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Password *
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full text-xs px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:ring-1 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Confirm *
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="w-full text-xs px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:ring-1 focus:ring-teal-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 bg-teal-800 hover:bg-teal-900 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
            >
              <span>{isLoading ? 'Creating Account...' : 'REGISTER & SIGN IN'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <div className="pt-3 border-t border-slate-100 text-center">
              <button
                type="button"
                onClick={() => {
                  setIsRegisterMode(false);
                  setError(null);
                }}
                className="text-xs font-semibold text-slate-600 hover:text-teal-800 transition-colors"
              >
                Already have an account? Sign in
              </button>
            </div>
          </form>
        )}
      </div>

      <p className="relative z-10 text-[11px] text-slate-500 mt-6 text-center">
        Clinical OS • Encrypted Physician Authentication & HIPAA-aligned Record Vault
      </p>
    </div>
  );
};
