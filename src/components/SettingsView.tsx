import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { LanguageSelector } from './LanguageSelector';
import { AuditLog } from '../types';
import { api } from '../lib/api';
import { Settings, Shield, User, Building, Save, CheckCircle2, History, Globe } from 'lucide-react';

export const SettingsView: React.FC = () => {
  const { doctor, updateDoctor } = useAuth();
  const { t } = useLanguage();
  const [name, setName] = useState(doctor?.name || '');
  const [speciality, setSpeciality] = useState(doctor?.speciality || '');
  const [clinicName, setClinicName] = useState(doctor?.clinicName || '');
  const [registrationNumber, setRegistrationNumber] = useState(doctor?.registrationNumber || '');
  const [phone, setPhone] = useState(doctor?.phone || '');
  const [defaultFee, setDefaultFee] = useState(doctor?.defaultConsultationFee || 500);

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    api.audit.list()
      .then(res => setAuditLogs(res.logs))
      .catch(() => {});
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSuccessMsg(null);
    try {
      await updateDoctor({
        name,
        speciality,
        clinicName,
        registrationNumber,
        phone,
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

  return (
    <div className="space-y-8 max-w-4xl animate-in fade-in duration-150">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{t('practiceSettings')}</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Configure clinic branding, doctor credentials, interface language, consultation billing defaults, and compliance audit trail.
        </p>
      </div>

      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

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
            <label className="block font-bold text-slate-700 uppercase tracking-wide mb-1">{t('clinicHotline')}</label>
            <input
              type="text"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-1 focus:ring-teal-500 font-mono"
            />
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
