import React from 'react';
import { Patient, PrescriptionItem, Doctor } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { X, Printer, Pill, Globe } from 'lucide-react';

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

          {/* Advice / Note & Doctor Signature */}
          <div className="pt-8 border-t border-slate-200 flex items-end justify-between">
            <div className="text-[11px] text-slate-500 max-w-sm space-y-1">
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

            <div className="text-right">
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
    </div>
  );
};
