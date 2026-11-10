import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { Patient, PrescriptionItem, Doctor } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { api } from '../lib/api';
import { WhatsAppShareModal, WhatsAppIcon } from './WhatsAppShareModal';
import { X, Printer, Pill, ShieldCheck, ExternalLink } from 'lucide-react';

interface PrintRxModalProps {
  patient: Patient;
  prescriptions: PrescriptionItem[];
  doctor: Doctor;
  onClose: () => void;
}

export const PrintRxModal: React.FC<PrintRxModalProps> = ({
  patient,
  prescriptions,
  doctor,
  onClose
}) => {
  const { t, language, setLanguage, supportedLanguages } = useLanguage();
  const [showWhatsApp, setShowWhatsApp] = useState(false);
  const [verifyQrDataUrl, setVerifyQrDataUrl] = useState<string | null>(null);
  const [verifyUrl, setVerifyUrl] = useState<string>('');
  const [verificationCode, setVerificationCode] = useState<string>('');

  useEffect(() => {
    let isMounted = true;
    const rxIds = prescriptions.map(r => r.id).filter(Boolean);
    const consultationId = prescriptions[0]?.consultationId;

    api.prescriptions
      .signVerificationToken({
        patientId: patient.id,
        consultationId,
        prescriptionIds: rxIds,
        prescriptions: prescriptions.map(r => ({
          medicineName: r.medicineName,
          dosage: r.dosage,
          frequency: r.frequency,
          duration: r.duration,
          instructions: r.instructions
        }))
      })
      .then(async (res) => {
        if (!isMounted) return;
        const link = `${window.location.origin}${window.location.pathname}?verifyRxToken=${encodeURIComponent(res.token)}`;
        setVerifyUrl(link);
        setVerificationCode(res.verificationCode);
        try {
          const qrUrl = await QRCode.toDataURL(link, {
            width: 160,
            margin: 1,
            color: {
              dark: '#0f2926',
              light: '#ffffff'
            }
          });
          if (isMounted) setVerifyQrDataUrl(qrUrl);
        } catch {
          // ignore QR generation error
        }
      })
      .catch(() => {
        // ignore if offline
      });

    return () => {
      isMounted = false;
    };
  }, [patient.id, prescriptions]);

  const handlePrint = () => {
    window.print();
  };

  const currentDate = new Date().toLocaleDateString(language === 'hi' ? 'hi-IN' : language === 'pa' ? 'pa-IN' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[92vh] border border-slate-200">
        {/* Modal Controls Header */}
        <div className="px-6 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50 rounded-t-2xl print:hidden flex-wrap gap-2">
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
            <Pill className="w-4 h-4 text-teal-700" />
            {t('printRx')} (Rx)
          </span>

          <div className="flex items-center gap-2">
            {/* Quick Language Toggle for Slip */}
            <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 text-[11px] font-bold">
              {supportedLanguages.map(l => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => setLanguage(l.code)}
                  className={`px-2 py-0.5 rounded ${
                    language === l.code
                      ? 'bg-teal-700 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {l.nativeName}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowWhatsApp(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#25D366] hover:bg-[#1EBE5D] text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
              title="Send Prescription directly to patient's WhatsApp"
            >
              <WhatsAppIcon className="w-3.5 h-3.5 fill-white" />
              <span>WhatsApp Rx</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              {t('print')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Prescription Body */}
        <div id="printable-rx" className="p-8 space-y-6 overflow-y-auto text-slate-800">
          {/* Clinic & Doctor Letterhead */}
          <div className="border-b-2 border-teal-800 pb-4 flex items-start justify-between">
            <div>
              <h2 className="text-xl font-extrabold text-teal-900 tracking-tight">{doctor.clinicName}</h2>
              <p className="text-sm font-bold text-slate-800 mt-0.5">{doctor.name}</p>
              <p className="text-xs text-slate-600">{doctor.speciality}</p>
              <p className="text-xs text-slate-500 font-mono">{t('regNumber')}: {doctor.registrationNumber}</p>
            </div>
            <div className="text-right text-xs text-slate-500 space-y-0.5">
              <p className="font-semibold text-slate-700">{doctor.clinicName}</p>
              {doctor.phone && <p>{t('phone')}: {doctor.phone}</p>}
              <p>Email: {doctor.email}</p>
              <p className="font-medium text-slate-800 pt-1">{t('registeredOn')}: {currentDate}</p>
            </div>
          </div>

          {/* Patient Details Bar */}
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">{t('patientName')}</span>
              <span className="font-bold text-slate-900">{patient.fullName}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">{t('age')} / {t('gender')}</span>
              <span className="font-semibold text-slate-800">{patient.age}y / {patient.gender}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">{t('patientId')}</span>
              <span className="font-mono font-bold text-teal-800">{patient.patientCode}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">{t('bloodGroup')}</span>
              <span className="font-semibold text-slate-800">{patient.bloodGroup || 'N/A'}</span>
            </div>
          </div>

          {/* Rx Symbol & Medication Table */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-serif font-black italic text-teal-900">℞</span>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {t('medications')}
              </span>
            </div>

            {prescriptions.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-6 text-center border border-dashed border-slate-200 rounded-xl">
                No medications currently recorded on this prescription.
              </p>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                <div className="bg-slate-50 px-4 py-2 grid grid-cols-12 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <div className="col-span-5">{t('medicineName')}</div>
                  <div className="col-span-2">{t('dosage')}</div>
                  <div className="col-span-2">{t('frequency')}</div>
                  <div className="col-span-3">{t('duration')} & {t('instructions')}</div>
                </div>
                {prescriptions.map((rx, idx) => (
                  <div key={rx.id || idx} className="px-4 py-3 grid grid-cols-12 text-xs items-center gap-2">
                    <div className="col-span-5">
                      <span className="font-bold text-slate-900 block">{rx.medicineName}</span>
                    </div>
                    <div className="col-span-2 text-slate-700">{rx.dosage}</div>
                    <div className="col-span-2 font-mono text-teal-800 font-semibold">{rx.frequency}</div>
                    <div className="col-span-3 text-slate-600 text-[11px]">
                      <span className="font-medium text-slate-800 block">{rx.duration}</span>
                      {rx.instructions && <span>{rx.instructions}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Advice / Note, Digital Verification QR & Doctor Signature */}
          <div className="pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4">
            <div className="text-[11px] text-slate-500 max-w-xs space-y-1">
              <p className="font-bold text-slate-700">{t('instructions')}:</p>
              {language === 'hi' ? (
                <>
                  <p>• दवाएं केवल डॉक्टर के निर्देशानुसार ही लें। बिना परामर्श के बंद न करें।</p>
                  <p>• कोई भी अप्रत्याशित चकत्ते या एलर्जी होने पर तुरंत सूचित करें।</p>
                </>
              ) : language === 'pa' ? (
                <>
                  <p>• ਦਵਾਈਆਂ ਕੇਵਲ ਡਾਕਟਰ ਦੀਆਂ ਹਦਾਇਤਾਂ ਅਨੁਸਾਰ ਹੀ ਲਓ। ਬਿਨਾਂ ਸਲਾਹ ਬੰਦ ਨਾ ਕਰੋ।</p>
                  <p>• ਕੋਈ ਵੀ ਅਣਕਿਆਸੀ ਐਲਰਜੀ ਜਾਂ ਖ਼ਾਰਸ਼ ਹੋਣ 'ਤੇ ਤੁਰੰਤ ਸੂਚਿਤ ਕਰੋ।</p>
                </>
              ) : (
                <>
                  <p>• Take medications strictly as directed. Do not discontinue without consultation.</p>
                  <p>• Report immediately if any unexpected rash or allergic reaction develops.</p>
                </>
              )}
            </div>

            {verifyQrDataUrl && (
              <div className="flex items-center gap-2.5 p-2 rounded-xl border border-teal-200 bg-teal-50/50">
                <img
                  src={verifyQrDataUrl}
                  alt="Digital Rx Verification QR"
                  className="w-16 h-16 rounded-lg border border-slate-200 bg-white p-0.5 shrink-0"
                />
                <div className="text-[10px] text-slate-600 space-y-0.5">
                  <span className="font-bold text-teal-900 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-teal-700" />
                    Digital Rx Verified
                  </span>
                  <span className="font-mono font-bold text-slate-800 block">
                    {verificationCode}
                  </span>
                  <span className="text-[9px] text-slate-500 block">
                    Scan QR at pharmacy to verify authenticity
                  </span>
                  {verifyUrl && (
                    <a
                      href={verifyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-teal-700 hover:underline print:hidden"
                    >
                      <span>Verify Portal</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}
                </div>
              </div>
            )}

            <div className="text-right self-end">
              <div className="w-40 border-b border-slate-400 pb-1 mb-1 font-serif italic text-sm text-slate-700">
                {doctor.name}
              </div>
              <p className="text-xs font-bold text-slate-800">{doctor.name}</p>
              <p className="text-[10px] text-slate-500">{doctor.speciality}</p>
              <p className="text-[10px] text-slate-400 font-mono">{t('regNumber')}: {doctor.registrationNumber}</p>
            </div>
          </div>
        </div>
      </div>

      {showWhatsApp && (
        <WhatsAppShareModal
          isOpen={showWhatsApp}
          onClose={() => setShowWhatsApp(false)}
          patient={patient}
          doctor={doctor}
          reportType="prescription"
          data={{
            prescriptions
          }}
        />
      )}
    </div>
  );
};
