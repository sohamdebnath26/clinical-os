import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { LanguageSelector } from './LanguageSelector';
import { AuditLog, Doctor } from '../types';
import { api } from '../lib/api';
import {
  Settings,
  Shield,
  User,
  Building,
  Save,
  CheckCircle2,
  History,
  Globe,
  Moon,
  Sun,
  UserCheck,
  UserCog,
  Mail,
  Trash2,
  ArrowRightLeft,
  KeyRound
} from 'lucide-react';

export const SettingsView: React.FC = () => {
  const { doctor, updateDoctor, switchRoleSession } = useAuth();
  const { t } = useLanguage();
  const { theme, setTheme } = useTheme();
  const isReceptionist = doctor?.role === 'receptionist';

  const [name, setName] = useState(doctor?.name || '');
  const [speciality, setSpeciality] = useState(doctor?.speciality || '');
  const [clinicName, setClinicName] = useState(doctor?.clinicName || '');
  const [registrationNumber, setRegistrationNumber] = useState(doctor?.registrationNumber || '');
  const [phone, setPhone] = useState((doctor?.phone || '').replace(/\D/g, '').slice(-10));
  const [defaultFee, setDefaultFee] = useState(doctor?.defaultConsultationFee || 500);

  // Staff & Email Role Assignment State
  const [staffList, setStaffList] = useState<Doctor[]>([]);
  const [assignEmail, setAssignEmail] = useState('');
  const [assignName, setAssignName] = useState('');
  const [assignRole, setAssignRole] = useState<'doctor' | 'receptionist'>('receptionist');
  const [isAssigningRole, setIsAssigningRole] = useState(false);
  const [isSwitchingView, setIsSwitchingView] = useState(false);

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadStaffAndLogs = () => {
    api.staff
      .list()
      .then(res => {
        if (Array.isArray(res.staff)) setStaffList(res.staff);
      })
      .catch(() => {});

    api.audit
      .list()
      .then(res => setAuditLogs(res.logs))
      .catch(() => {});
  };

  useEffect(() => {
    loadStaffAndLogs();
  }, [doctor?.id]);

  useEffect(() => {
    setName(doctor?.name || '');
    setSpeciality(doctor?.speciality || '');
    setClinicName(doctor?.clinicName || '');
    setRegistrationNumber(doctor?.registrationNumber || '');
    setPhone((doctor?.phone || '').replace(/\D/g, '').slice(-10));
    setDefaultFee(doctor?.defaultConsultationFee || 500);
  }, [doctor]);

  const handleAssignEmailRole = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = assignEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMsg('Please enter a valid email address to assign a role.');
      return;
    }
    setIsAssigningRole(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await api.staff.assign({
        email: cleanEmail,
        name: assignName.trim() || undefined,
        role: assignRole
      });
      if (Array.isArray(res.staff)) {
        setStaffList(res.staff);
      }
      setAssignEmail('');
      setAssignName('');
      setSuccessMsg(
        `Assigned ${cleanEmail} as ${assignRole === 'receptionist' ? 'Front-Desk Receptionist' : 'Doctor'} for ${doctor?.clinicName || 'your clinic'}.`
      );
      setTimeout(() => setSuccessMsg(null), 4000);
      loadStaffAndLogs();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to assign role to email.');
    } finally {
      setIsAssigningRole(false);
    }
  };

  const handleToggleAccountRole = async (staffMember: Doctor) => {
    const nextRole: 'doctor' | 'receptionist' =
      staffMember.role === 'receptionist' ? 'doctor' : 'receptionist';
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await api.staff.updateRole(staffMember.id, nextRole);
      if (Array.isArray(res.staff)) {
        setStaffList(res.staff);
      }
      setSuccessMsg(
        `Updated ${staffMember.email} role to ${nextRole === 'receptionist' ? 'Receptionist' : 'Doctor'}.`
      );
      setTimeout(() => setSuccessMsg(null), 3500);
      loadStaffAndLogs();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update account role.');
    }
  };

  const handleRemoveStaffAccount = async (staffMember: Doctor) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await api.staff.remove(staffMember.id);
      if (Array.isArray(res.staff)) {
        setStaffList(res.staff);
      }
      setSuccessMsg(`Removed ${staffMember.email} from clinic team.`);
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Cannot remove primary or system demo account.');
    }
  };

  const handleSwitchToAccount = async (params: { targetId?: string; targetRole?: 'doctor' | 'receptionist' }) => {
    setIsSwitchingView(true);
    setErrorMsg(null);
    try {
      const switched = await switchRoleSession(params);
      setSuccessMsg(
        `Switched active view to ${switched.name} (${switched.role === 'receptionist' ? 'Receptionist View' : 'Doctor View'}).`
      );
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to switch view.');
    } finally {
      setIsSwitchingView(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = phone.replace(/\D/g, '').slice(0, 10);
    if (cleanPhone.length > 0 && cleanPhone.length !== 10) {
      setErrorMsg('Mobile / hotline number must be exactly 10 digits.');
      return;
    }
    setIsSaving(true);
    setSuccessMsg(null);
    setErrorMsg(null);
    try {
      await updateDoctor({
        name,
        speciality,
        clinicName,
        registrationNumber,
        phone: cleanPhone,
        defaultConsultationFee: Number(defaultFee)
      });
      setSuccessMsg('Doctor profile & clinical defaults updated successfully.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch {
      // ignore
    } finally {
      setIsSaving(false);
    }
  };

  if (isReceptionist) {
    return (
      <div className="p-6 bg-white rounded-2xl border border-slate-200 text-xs text-slate-600">
        Role assignment and clinic settings are restricted to Doctors.
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl animate-in fade-in duration-150">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{t('practiceSettings')}</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Assign email addresses as Doctor or Receptionist, and configure clinic preferences.
          </p>
        </div>
      </div>

      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Doctor-Only Clinic Team & Email Role Assignment (Doctor / Receptionist) */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Shield className="w-4 h-4 text-teal-700" />
              Assign Role by Email Address (Doctor / Receptionist)
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Assign any email address as a Doctor (full clinical, Rx, AI &amp; revenue access) or as a Receptionist (can only add patients and book appointments).
            </p>
          </div>
          <span className="text-[11px] font-semibold text-teal-800 shrink-0">
            Active Role: Doctor (Admin)
          </span>
        </div>

        {/* Doctor-Only Form to Assign an Email Address as Doctor or Receptionist */}
        {!isReceptionist ? (
          <form onSubmit={handleAssignEmailRole} className="bg-slate-50 p-4 rounded-xl border border-slate-200/90 space-y-3 text-xs">
            <div className="font-bold text-slate-800">
              Assign Role to an Email Address
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-5">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Email Address *
                </label>
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="email"
                    required
                    placeholder="e.g. frontdesk@clinic.com or doctor@gmail.com"
                    value={assignEmail}
                    onChange={e => setAssignEmail(e.target.value)}
                    className="w-full text-xs pl-8 pr-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="sm:col-span-3">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Full Name (Optional)
                </label>
                <input
                  type="text"
                  placeholder={assignRole === 'receptionist' ? 'e.g. Priya Sharma' : 'e.g. Dr. Rohan'}
                  value={assignName}
                  onChange={e => setAssignName(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-600 focus:outline-none"
                />
              </div>

              <div className="sm:col-span-4">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Assigned Role *
                </label>
                <select
                  value={assignRole}
                  onChange={e => setAssignRole(e.target.value as 'doctor' | 'receptionist')}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-600 focus:outline-none font-semibold"
                >
                  <option value="receptionist">Receptionist (Front-Desk &amp; Queue)</option>
                  <option value="doctor">Doctor (Full Clinical &amp; Admin)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
              <span className="text-[11px] text-slate-500">
                When this user signs in with their email on the login screen, Clinical OS automatically loads their assigned role and links them to <strong>{doctor?.clinicName || 'your clinic'}</strong>.
              </span>
              <button
                type="submit"
                disabled={isAssigningRole}
                className="px-4 py-2 bg-[#0d3f3b] hover:bg-[#135650] text-white rounded-xl text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 shrink-0"
              >
                {isAssigningRole
                  ? 'Assigning...'
                  : `Assign as ${assignRole === 'receptionist' ? 'Receptionist' : 'Doctor'}`}
              </button>
            </div>
          </form>
        ) : (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="font-bold">Receptionist Access Mode Active</div>
              <p className="text-[11px] mt-0.5">
                You have access to Walk-In Check-In, Patient Registration, Appointments, and Front-Desk Inbox. Role assignment and clinical prescriptions are reserved for Doctors.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleSwitchToAccount({ targetRole: 'doctor' })}
              className="px-3.5 py-2 bg-[#0d3f3b] text-white rounded-lg text-xs font-bold shrink-0 cursor-pointer"
            >
              Switch to Doctor Account
            </button>
          </div>
        )}

        {/* Assigned Clinic Team Accounts Table */}
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            <span>Assigned Clinic Emails &amp; Roles ({staffList.length})</span>
            <span>Role Controls &amp; Live POV Test</span>
          </div>
          <div className="divide-y divide-slate-100">
            {staffList.map(member => {
              const memberIsRec = member.role === 'receptionist';
              const isCurrentUser = member.id === doctor?.id;
              return (
                <div
                  key={member.id}
                  className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:bg-slate-50/70 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-bold ${
                        memberIsRec
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-teal-100 text-teal-900'
                      }`}
                    >
                      {memberIsRec ? (
                        <UserCog className="w-4 h-4" />
                      ) : (
                        <UserCheck className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 truncate">{member.name}</span>
                        <span className="text-slate-400">·</span>
                        <span
                          className={`font-semibold ${
                            memberIsRec ? 'text-emerald-700' : 'text-teal-800'
                          }`}
                        >
                          {memberIsRec ? 'Receptionist' : 'Doctor'}
                        </span>
                        {isCurrentUser && (
                          <span className="text-[10.5px] font-semibold text-slate-500">
                            (Active Session)
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono truncate mt-0.5">
                        {member.email}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap shrink-0">
                    <button
                      type="button"
                      onClick={async () => {
                        const newPass = window.prompt(`Enter new password for ${member.name} (${member.email}) (minimum 6 characters):`);
                        if (!newPass) return;
                        if (newPass.length < 6) {
                          alert('Password must be at least 6 characters long.');
                          return;
                        }
                        try {
                          await api.staff.setPassword(member.id, newPass);
                          setSuccessMsg(`Password successfully updated for ${member.email}.`);
                          setTimeout(() => setSuccessMsg(null), 3500);
                        } catch (err: unknown) {
                          setErrorMsg(err instanceof Error ? err.message : 'Failed to update password');
                        }
                      }}
                      className="px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
                      title="Set or reset dedicated login password"
                    >
                      <KeyRound className="w-3.5 h-3.5 text-slate-500" />
                      <span>Set Password</span>
                    </button>

                    {!isCurrentUser && (
                      <button
                        type="button"
                        onClick={() => handleToggleAccountRole(member)}
                        className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer"
                        title="Change assigned role for this email address"
                      >
                        Set as {memberIsRec ? 'Doctor' : 'Receptionist'}
                      </button>
                    )}

                    {!isCurrentUser &&
                      member.email !== 'demo@clinicalos.med' &&
                      member.email !== 'receptionist@clinicalos.med' && (
                        <button
                          type="button"
                          onClick={() => handleRemoveStaffAccount(member)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                          title="Remove assigned email"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>


      {/* Appearance & Display Theme (Light / Dark Mode) */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            {theme === 'dark' ? (
              <Moon className="w-4 h-4 text-teal-400" />
            ) : (
              <Sun className="w-4 h-4 text-teal-700" />
            )}
            Appearance &amp; Display Theme
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Switch between Clinical Daylight (Light Mode) and Low-Glare Clinical Slate (Dark Mode) for comfortable extended consultations.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <button
            type="button"
            onClick={() => setTheme('light')}
            className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
              theme === 'light'
                ? 'border-teal-700 bg-teal-50/70 text-slate-900 shadow-2xs'
                : 'border-slate-200 bg-slate-50/60 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <Sun className="w-4 h-4" />
              </div>
              <div>
                <div className="font-bold text-slate-900">Light Mode (Clinical Daylight)</div>
                <div className="text-[11px] text-slate-500 mt-0.5">High-clarity white &amp; soft sage canvas</div>
              </div>
            </div>
            {theme === 'light' && <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0" />}
          </button>

          <button
            type="button"
            onClick={() => setTheme('dark')}
            className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
              theme === 'dark'
                ? 'border-teal-500 bg-teal-50/70 text-slate-900 shadow-2xs'
                : 'border-slate-200 bg-slate-50/60 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-slate-800 text-teal-300 flex items-center justify-center shrink-0">
                <Moon className="w-4 h-4" />
              </div>
              <div>
                <div className="font-bold text-slate-900">Dark Mode (Clinical Slate)</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Low-glare dark emerald &amp; slate surfaces</div>
              </div>
            </div>
            {theme === 'dark' && <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />}
          </button>
        </div>
      </div>

      {/* Language Preferences */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <Globe className="w-4 h-4 text-teal-700" />
            {t('languagePreferences')}
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            {t('languageDescription')}
          </p>
        </div>

        <LanguageSelector variant="expanded" />
      </div>

      {/* Doctor & Clinic Profile */}
      <form onSubmit={handleSaveProfile} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <Building className="w-4 h-4 text-teal-700" />
          {t('doctorProfile')}
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block font-bold text-slate-700 uppercase tracking-wide mb-1">{t('doctorName')}</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-1 focus:ring-teal-500"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 uppercase tracking-wide mb-1">{t('regNumber')}</label>
            <input
              type="text"
              value={registrationNumber}
              onChange={e => setRegistrationNumber(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-1 focus:ring-teal-500 font-mono"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 uppercase tracking-wide mb-1">{t('speciality')}</label>
            <input
              type="text"
              value={speciality}
              onChange={e => setSpeciality(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-1 focus:ring-teal-500"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 uppercase tracking-wide mb-1">{t('clinicName')}</label>
            <input
              type="text"
              value={clinicName}
              onChange={e => setClinicName(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-1 focus:ring-teal-500"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 uppercase tracking-wide mb-1">
              {t('clinicHotline')} (10 digits)
            </label>
            <div className="relative flex items-center">
              <input
                type="tel"
                inputMode="numeric"
                pattern="[0-9]{10}"
                maxLength={10}
                placeholder="9876543210"
                value={phone}
                onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                className="w-full text-xs pl-3 pr-11 py-2 bg-white border border-slate-300 rounded-xl focus:ring-1 focus:ring-teal-500 font-mono"
              />
              {phone.length > 0 && (
                <span className="absolute right-2.5 text-[10px] font-mono text-slate-400 pointer-events-none">
                  {phone.length}/10
                </span>
              )}
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 uppercase tracking-wide mb-1">{t('consultationFee')}</label>
            <input
              type="number"
              min="0"
              step="50"
              value={defaultFee}
              onChange={e => setDefaultFee(Number(e.target.value))}
              className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-1 focus:ring-teal-500"
            />
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center gap-1.5 px-5 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving ? t('saving') : t('saveSettings')}</span>
          </button>
        </div>
      </form>

      {/* Security & Audit Trail */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <History className="w-4 h-4 text-teal-700" />
            Security & Clinical Audit Trail (Recent {auditLogs.length} events)
          </h3>
          <span className="text-[11px] font-mono text-slate-400">HIPAA / Data Privacy Compliant</span>
        </div>

        <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 max-h-72 overflow-y-auto">
          {auditLogs.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">No audit logs recorded yet.</div>
          ) : (
            auditLogs.map(log => (
              <div key={log.id} className="p-3 text-xs flex items-center justify-between hover:bg-slate-50">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-teal-800">{log.action}</span>
                    <span className="text-slate-400">•</span>
                    <span className="text-slate-600 font-medium">{log.actorName}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-mono">
                    Resource: {log.resourceType} ({log.resourceId})
                  </p>
                </div>
                <span className="text-[11px] text-slate-400 shrink-0">
                  {new Date(log.timestamp).toLocaleString()}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
