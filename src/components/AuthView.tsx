import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { LanguageSelector } from './LanguageSelector';
import {
  Stethoscope,
  Lock,
  Mail,
  User,
  ShieldCheck,
  ArrowRight,
  AlertCircle,
  Eye,
  EyeOff,
  Landmark,
  Building2,
  CheckCircle2,
  X,
  Hospital,
  Sparkles
} from 'lucide-react';

// Institutional / Organisational preset networks for quick doctor testing
const INSTITUTIONAL_PROVIDERS = [
  {
    id: 'metro-health',
    name: 'Metro Health University Medical Center',
    department: 'Department of Dermatology & Cutaneous Medicine',
    doctorName: 'Dr. Sarah Chen, MD',
    email: 'hospital@metrohealth.org',
    badge: 'University Hospital',
    location: 'Boston, MA'
  },
  {
    id: 'nhs-trust',
    name: 'NHS Foundation Trust Hospitals',
    department: 'Regional Cutaneous Oncology & Phototherapy Unit',
    doctorName: 'Dr. Ayesha Patel, MBChB, FRCP',
    email: 'ayesha.patel@nhs.net',
    badge: 'National Health Service',
    location: 'London, UK'
  },
  {
    id: 'st-jude',
    name: 'St. Jude Academic Medical Network',
    department: 'Pediatric & General Dermatology Division',
    doctorName: 'Dr. Michael Torres, MD',
    email: 'm.torres@stjude-health.edu',
    badge: 'Academic Network',
    location: 'Chicago, IL'
  },
  {
    id: 'apex-health',
    name: 'Apex Health Enterprise System',
    department: 'Outpatient Dermatology & Aesthetics Center',
    doctorName: 'Dr. James Wilson, MD',
    email: 'jwilson@apexhealth.org',
    badge: 'Enterprise Health',
    location: 'San Francisco, CA'
  }
];

export const AuthView: React.FC = () => {
  const { login, loginWithSSO, loginWithGoogle, register } = useAuth();
  const { t } = useLanguage();
  const [isRegisterMode, setIsRegisterMode] = useState(false);

  // Form states for login
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // SSO state
  const [showSSOSelector, setShowSSOSelector] = useState(false);
  const [customOrgDomain, setCustomOrgDomain] = useState('');

  // Forgot password modal
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);

  // Form states for registration
  const [name, setName] = useState('');
  const [registerAccountType, setRegisterAccountType] = useState<'individual' | 'organisational'>('individual');
  const [speciality, setSpeciality] = useState('Dermatologist & Cosmetologist');
  const [clinicName, setClinicName] = useState('Cliniq Dermatology Center');
  const [regNumber, setRegNumber] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Handle standard email & password login
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

  // Handle Google individual login
  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await loginWithGoogle({
        name: 'Dr. Alex Mercer',
        email: 'dr.alex.mercer@gmail.com'
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Google authentication failed';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle SSO / Organisational login
  const handleSSOLogin = async (preset?: typeof INSTITUTIONAL_PROVIDERS[0]) => {
    setIsLoading(true);
    setError(null);
    try {
      if (preset) {
        await loginWithSSO({
          organization: preset.name,
          email: preset.email,
          name: preset.doctorName,
          department: preset.department
        });
      } else {
        const domain = customOrgDomain.trim() || 'hospital@metrohealth.org';
        const orgTitle = domain.includes('@') ? domain.split('@')[1].toUpperCase() + ' Health Network' : domain;
        await loginWithSSO({
          organization: orgTitle,
          email: domain.includes('@') ? domain : `staff@${domain}`,
          name: 'Dr. Sarah Chen, MD',
          department: 'Department of Dermatology'
        });
      }
      setShowSSOSelector(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Institutional SSO sign-in failed';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Registration
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
        clinicName,
        registrationNumber: regNumber || undefined
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  // Quick fill individual demo doctor
  const fillIndividualDemo = () => {
    setEmail('demo@clinicalos.med');
    setPassword('Demo@1234');
    setError(null);
    setSuccessNotice('Filled Individual Doctor credentials (Dr. Demo • Cliniq Center)');
    setTimeout(() => setSuccessNotice(null), 3500);
  };

  // Quick fill organizational demo doctor
  const fillOrganisationalDemo = () => {
    setEmail('hospital@metrohealth.org');
    setPassword('Demo@1234');
    setError(null);
    setSuccessNotice('Filled Organisational Doctor credentials (Dr. Sarah Chen • Metro Health)');
    setTimeout(() => setSuccessNotice(null), 3500);
  };

  // Quick fill receptionist demo
  const fillReceptionistDemo = () => {
    setEmail('receptionist@clinicalos.med');
    setPassword('Demo@1234');
    setError(null);
    setSuccessNotice('Filled Receptionist credentials (Emily • Front Desk)');
    setTimeout(() => setSuccessNotice(null), 3500);
  };

  // Handle forgot password request
  const handleForgotPasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) return;
    setForgotSent(true);
    setTimeout(() => {
      setShowForgotModal(false);
      setForgotSent(false);
      setForgotEmail('');
      setSuccessNotice('Secure reset link dispatched to your clinical mailbox.');
      setTimeout(() => setSuccessNotice(null), 4000);
    }, 1800);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 relative overflow-x-hidden font-sans">
      {/* Background radial medical dot pattern accent */}
      <div className="absolute inset-0 bg-[radial-gradient(#14b8a6_1px,transparent_1px)] [background-size:24px_24px] opacity-15 pointer-events-none" />

      {/* Main Authentication Card */}
      <div className="relative z-10 w-full max-w-[440px] bg-white rounded-2xl shadow-2xl p-7 border border-slate-200">
        {/* Language selector in top right of card */}
        <div className="absolute right-5 top-5">
          <LanguageSelector variant="compact" />
        </div>

        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-teal-800 text-white shadow-md mb-2.5">
            <Stethoscope className="w-6 h-6" />
          </div>
          <div className="flex items-center justify-center gap-2">
            <span className="text-2xl font-black tracking-tight text-slate-900 font-sans">Cliniq</span>
            <span className="h-4 w-px bg-slate-300" />
            <span className="text-xs font-extrabold uppercase tracking-widest text-teal-800">
              {t('appName')}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Clinical Practice & Hospital Management EMR
          </p>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Success Notice */}
        {successNotice && (
          <div className="mb-4 p-3 bg-teal-50 border border-teal-200 text-teal-800 text-xs rounded-xl flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-teal-600" />
            <span>{successNotice}</span>
          </div>
        )}

        {!isRegisterMode ? (
          /* ======================================================== */
          /* UNIFIED LOGIN VIEW (INDIVIDUAL & ORGANISATIONAL LOGIN)   */
          /* ======================================================== */
          <div className="space-y-4">
            {/* Top Individual Identity: Log in with Google */}
            <div>
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={isLoading}
                className="w-full py-2.5 px-4 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-xs font-semibold shadow-2xs hover:shadow transition-all flex items-center justify-center gap-3 active:scale-[0.99] disabled:opacity-60"
              >
                {/* Official Google multicolored icon */}
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
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
                <span>Log in with Google</span>
              </button>
            </div>

            {/* Divider: OR */}
            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-slate-200"></div>
              <span className="shrink-0 mx-3 text-[11px] font-bold text-slate-400 tracking-wider">
                OR
              </span>
              <div className="flex-grow border-t border-slate-200"></div>
            </div>

            {/* Individual Standard Credentials Form */}
            <form onSubmit={handleLogin} className="space-y-3.5">
              {/* Email */}
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  required
                  placeholder="doctor@clinic.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full text-xs px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 text-slate-900 transition-all placeholder:text-slate-400"
                />
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-800">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotEmail(email);
                      setShowForgotModal(true);
                    }}
                    className="text-xs text-slate-500 hover:text-slate-800 hover:underline transition-colors"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full text-xs pl-3.5 pr-10 py-2.5 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 text-slate-900 transition-all placeholder:text-slate-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 focus:outline-none"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Log in Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 px-4 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-sm hover:shadow transition-all flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-50 mt-1"
              >
                <span>{isLoading ? 'Signing in...' : 'Log in'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            {/* Quick Demo Fill Buttons for Testing Both Accounts */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={fillIndividualDemo}
                className="py-1.5 px-2 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg text-[11px] font-medium border border-slate-200 transition-colors flex items-center justify-center gap-1.5 truncate"
                title="Prefill Individual Doctor (Private Practice)"
              >
                <User className="w-3 h-3 text-teal-700 shrink-0" />
                <span className="truncate">Individual Demo</span>
              </button>

              <button
                type="button"
                onClick={fillOrganisationalDemo}
                className="py-1.5 px-2 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg text-[11px] font-medium border border-slate-200 transition-colors flex items-center justify-center gap-1.5 truncate"
                title="Prefill Organisational Doctor (Hospital Network)"
              >
                <Building2 className="w-3 h-3 text-indigo-700 shrink-0" />
                <span className="truncate">Hospital Demo</span>
              </button>

              <button
                type="button"
                onClick={fillReceptionistDemo}
                className="col-span-2 py-1.5 px-2 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded-lg text-[11px] font-medium border border-amber-200 transition-colors flex items-center justify-center gap-1.5 truncate"
                title="Prefill Receptionist Account"
              >
                <User className="w-3 h-3 text-amber-700 shrink-0" />
                <span className="truncate">Receptionist Demo (receptionist@clinicalos.med)</span>
              </button>
            </div>

            {/* Divider: OR */}
            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-slate-200"></div>
              <span className="shrink-0 mx-3 text-[11px] font-bold text-slate-400 tracking-wider">
                OR
              </span>
              <div className="flex-grow border-t border-slate-200"></div>
            </div>

            {/* Organisational / Institutional SSO Section */}
            <div className="pt-0.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800">
                  Work/university single sign-on
                </span>
                <span className="text-[10px] text-teal-700 font-bold bg-teal-50 border border-teal-200/60 px-1.5 py-0.5 rounded">
                  Hospital SSO
                </span>
              </div>

              <button
                type="button"
                onClick={() => setShowSSOSelector(!showSSOSelector)}
                disabled={isLoading}
                className="w-full py-2.5 px-4 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-xl text-xs font-semibold shadow-2xs hover:shadow transition-all flex items-center justify-center gap-2.5 active:scale-[0.99] disabled:opacity-60"
              >
                <Landmark className="w-4 h-4 text-slate-700 shrink-0" />
                <span>Log in with SSO</span>
              </button>
            </div>

            {/* Expandable Organisational SSO Drawer / Modal Selector */}
            {showSSOSelector && (
              <div className="mt-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-3 animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <Hospital className="w-3.5 h-3.5 text-teal-700" />
                    Select Hospital / Academic Network
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowSSOSelector(false)}
                    className="text-slate-400 hover:text-slate-600 p-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Preconfigured Hospital Networks for 1-Click Verification */}
                <div className="space-y-1.5">
                  {INSTITUTIONAL_PROVIDERS.map(inst => (
                    <button
                      key={inst.id}
                      type="button"
                      onClick={() => handleSSOLogin(inst)}
                      disabled={isLoading}
                      className="w-full p-2 bg-white hover:bg-teal-50/70 border border-slate-200 hover:border-teal-300 rounded-lg text-left transition-all flex items-center justify-between group"
                    >
                      <div className="min-w-0 pr-2">
                        <p className="text-xs font-bold text-slate-800 group-hover:text-teal-900 truncate">
                          {inst.name}
                        </p>
                        <p className="text-[10px] text-slate-500 truncate">
                          {inst.doctorName} • {inst.location}
                        </p>
                      </div>
                      <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold bg-slate-100 text-slate-600 group-hover:bg-teal-100 group-hover:text-teal-800 shrink-0">
                        {inst.badge}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Or Custom Domain Input */}
                <div className="pt-1">
                  <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                    Or enter work/institutional email domain:
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      placeholder="e.g. physician@hopkinsmedicine.org"
                      value={customOrgDomain}
                      onChange={e => setCustomOrgDomain(e.target.value)}
                      className="flex-1 text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleSSOLogin()}
                      disabled={isLoading}
                      className="px-3 py-1.5 bg-teal-800 hover:bg-teal-900 text-white rounded-lg text-xs font-bold shadow-2xs shrink-0"
                    >
                      Connect
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Footer: Register Link */}
            <div className="pt-3 border-t border-slate-100 text-center">
              <p className="text-xs text-slate-600">
                Don&apos;t have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setIsRegisterMode(true);
                    setError(null);
                  }}
                  className="font-bold text-slate-900 hover:text-teal-800 hover:underline transition-colors"
                >
                  Register
                </button>
              </p>
            </div>
          </div>
        ) : (
          /* ======================================================== */
          /* REGISTRATION VIEW                                        */
          /* ======================================================== */
          <form onSubmit={handleRegister} className="space-y-3.5">
            {/* Account Type Selector: Individual vs Organisational */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Account Type
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRegisterAccountType('individual');
                    setClinicName('Cliniq Private Practice');
                  }}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    registerAccountType === 'individual'
                      ? 'border-teal-700 bg-teal-50 text-teal-900 shadow-2xs'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <User className="w-3.5 h-3.5" />
                  <span>Individual Doctor</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setRegisterAccountType('organisational');
                    setClinicName('University Hospital Health System');
                  }}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    registerAccountType === 'organisational'
                      ? 'border-indigo-700 bg-indigo-50 text-indigo-900 shadow-2xs'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>Organisational / Hospital</span>
                </button>
              </div>
            </div>

            {/* Full Name */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                Full Physician Name *
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  required
                  placeholder="e.g. Dr. Sarah Jenkins, MD"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full text-xs pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                {registerAccountType === 'organisational' ? 'Work / Hospital Email *' : 'Email Address *'}
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="email"
                  required
                  placeholder={registerAccountType === 'organisational' ? 'doctor@hospital.org' : 'doctor@practice.com'}
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full text-xs pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>
            </div>

            {/* Speciality & Practice / Hospital Name */}
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
                  className="w-full text-xs px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                  {registerAccountType === 'organisational' ? 'Hospital / System' : 'Clinic Name'}
                </label>
                <input
                  type="text"
                  placeholder={registerAccountType === 'organisational' ? 'e.g. Metro Hospital' : 'e.g. Metro Clinic'}
                  value={clinicName}
                  onChange={e => setClinicName(e.target.value)}
                  className="w-full text-xs px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>
            </div>

            {/* Registration License / ID */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                Medical License / Registration No. (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. MED-REG-104829"
                value={regNumber}
                onChange={e => setRegNumber(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>

            {/* Passwords */}
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
                  className="w-full text-xs px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-teal-500"
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
                  className="w-full text-xs px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-teal-500"
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

      {/* Forgot Password Recovery Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Lock className="w-4 h-4 text-teal-700" />
                Reset Physician Password
              </h3>
              <button
                type="button"
                onClick={() => setShowForgotModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              Enter your clinical email address. We will verify your credentials and dispatch a secure password reset link.
            </p>

            {forgotSent ? (
              <div className="p-3 bg-teal-50 border border-teal-200 text-teal-800 rounded-xl text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
                <span>Reset link sent! Please check your email inbox.</span>
              </div>
            ) : (
              <form onSubmit={handleForgotPasswordSubmit} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="doctor@clinic.com"
                    value={forgotEmail}
                    onChange={e => setForgotEmail(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(false)}
                    className="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl shadow-2xs"
                  >
                    Send Reset Link
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Security & Vault Compliance Footer */}
      <p className="relative z-10 text-[11px] text-slate-400 mt-6 text-center">
        Clinical OS • Encrypted Physician Authentication • Individual & Organisational SSO
      </p>
    </div>
  );
};
