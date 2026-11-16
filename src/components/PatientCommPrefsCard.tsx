import { CheckCircle2, Loader2, MessageSquare, PhoneCall } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import type { PreferredCommMethod } from '../lib/appointmentLogic';
import {
  fetchPatientCommPrefs,
  upsertPatientCommPrefs,
  type PatientCommPrefsRecord,
} from '../lib/appointmentService';
import { getUserFriendlyErrorMessage } from '../lib/errorUtils';

interface PatientCommPrefsCardProps {
  clinicId: string;
  patientDocId: string;
  patientId: string;
  patientName: string;
  mobile: string;
  compact?: boolean;
  onUpdated?: (prefs: PatientCommPrefsRecord) => void;
}

export function PatientCommPrefsCard({
  clinicId,
  patientDocId,
  patientId,
  patientName,
  mobile,
  compact = false,
  onUpdated,
}: PatientCommPrefsCardProps) {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [whatsappConsent, setWhatsappConsent] = useState(false);
  const [whatsappEnabled, setWhatsappEnabled] = useState(true);
  const [preferredMethod, setPreferredMethod] = useState<PreferredCommMethod>('whatsapp');
  const [prefs, setPrefs] = useState<PatientCommPrefsRecord | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPatientCommPrefs(clinicId, patientDocId)
      .then((res) => {
        if (cancelled) return;
        setPrefs(res);
        if (res) {
          setWhatsappConsent(res.whatsappConsent);
          setWhatsappEnabled(res.whatsappEnabled);
          setPreferredMethod(res.preferredMethod);
        } else {
          setWhatsappConsent(false);
          setWhatsappEnabled(true);
          setPreferredMethod('phone');
        }
      })
      .catch(() => {
        if (!cancelled) setError('Could not load communication preferences.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clinicId, patientDocId]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setError(null);
    setSavedNotice(null);
    try {
      const updated = await upsertPatientCommPrefs({
        clinicId,
        patientDocId,
        patientId,
        mobile,
        whatsappConsent,
        preferredMethod,
        whatsappEnabled: whatsappConsent ? whatsappEnabled : false,
        actorUid: user.uid,
        actorName: profile?.fullName || user.displayName || 'Clinic Staff',
      });
      setPrefs(updated);
      setWhatsappEnabled(updated.whatsappEnabled);
      onUpdated?.(updated);
      setSavedNotice('Communication preferences saved.');
      window.setTimeout(() => setSavedNotice(null), 3000);
    } catch (err: unknown) {
      setError(getUserFriendlyErrorMessage(err, 'Unable to save preferences.'));
    } finally {
      setSaving(false);
    }
  };

  const consentTimeLabel = prefs?.consentTimestamp
    ? prefs.consentTimestamp.toDate().toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : null;

  return (
    <section
      className={`${
        compact ? 'rounded-2xl border border-slate-200/80 bg-white/85 p-4' : 'lucid-glass rounded-3xl p-6'
      } space-y-4`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-display text-sm sm:text-base font-bold text-[#0B192C]">
            <MessageSquare className="h-4 w-4 text-sky-700" aria-hidden="true" />
            WhatsApp &amp; Reminder Consent
          </h3>
          <p className="mt-0.5 text-xs text-slate-600">
            Explicit patient opt-in for appointment confirmations &amp; scheduled reminders ({mobile}).
          </p>
        </div>

        <span
          className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${
            prefs?.whatsappConsent && prefs?.whatsappEnabled && prefs?.preferredMethod !== 'none'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-amber-200 bg-amber-50 text-amber-800'
          }`}
        >
          {prefs?.whatsappConsent && prefs?.whatsappEnabled && prefs?.preferredMethod !== 'none'
            ? 'WhatsApp Active'
            : 'No Active WhatsApp Opt-in'}
        </span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-2 text-xs text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-600" aria-hidden="true" />
          Loading communication preferences...
        </div>
      ) : (
        <div className="space-y-3 text-xs">
          <label className="flex items-start gap-2.5 rounded-xl border border-slate-200/80 bg-white p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={whatsappConsent}
              onChange={(e) => {
                const checked = e.target.checked;
                setWhatsappConsent(checked);
                if (checked && preferredMethod === 'none') {
                  setPreferredMethod('whatsapp');
                  setWhatsappEnabled(true);
                }
              }}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600"
            />
            <div>
              <span className="font-semibold text-[#0B192C] block">
                {patientName} consents to receive WhatsApp appointment updates
              </span>
              <span className="text-slate-500">
                Includes booking confirmation and 24-hour / 2-hour visit reminders only (no clinical
                details shared).
              </span>
            </div>
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Preferred Contact Method
              </label>
              <div className="mt-1 relative">
                <PhoneCall
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400"
                  aria-hidden="true"
                />
                <select
                  value={preferredMethod}
                  onChange={(e) => setPreferredMethod(e.target.value as PreferredCommMethod)}
                  className="w-full min-h-[38px] rounded-xl border border-slate-200 bg-white pl-8 pr-3 text-xs text-[#0B192C]"
                >
                  <option value="whatsapp">WhatsApp (Recommended)</option>
                  <option value="phone">Phone Call Only</option>
                  <option value="none">Do Not Contact</option>
                </select>
              </div>
            </div>

            <div className="flex items-end">
              <label className="flex w-full min-h-[38px] items-center justify-between rounded-xl border border-slate-200 bg-white px-3 cursor-pointer">
                <span className="font-semibold text-[#0B192C]">Enable WhatsApp Reminders</span>
                <input
                  type="checkbox"
                  disabled={!whatsappConsent}
                  checked={whatsappConsent && whatsappEnabled}
                  onChange={(e) => setWhatsappEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 disabled:opacity-50"
                />
              </label>
            </div>
          </div>

          {consentTimeLabel && (
            <p className="text-[11px] text-slate-500 tabular-nums">
              Consent recorded on: <span className="font-medium text-slate-700">{consentTimeLabel}</span>
            </p>
          )}

          {savedNotice && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              {savedNotice}
            </p>
          )}
          {error && <p className="text-xs font-medium text-rose-700">{error}</p>}

          <div className="flex justify-end">
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-[#0B192C] px-4 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              Save Communication Preferences
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
