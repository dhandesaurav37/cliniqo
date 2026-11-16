import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  ListPlus,
  Loader2,
  UserPlus,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AppShellLayout } from '../components/AppShellLayout';
import { useAuth } from '../context/AuthContext';
import { getUserFriendlyErrorMessage } from '../lib/errorUtils';
import {
  calculateAgeFromDob,
  fetchPatientByIdOrCode,
  findDuplicatePatientsByMobile,
  registerClinicPatient,
  type PatientFormInput,
  type PatientGender,
  type PatientRecord,
} from '../lib/patientService';
import { addPatientToTodayQueue } from '../lib/queueService';

export function NewPatientPage() {
  const { user, clinic, profile, membership } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queueIntentDefault = searchParams.get('queue') === '1';

  const [form, setForm] = useState<PatientFormInput>({
    fullName: '',
    dateOfBirth: '',
    age: null,
    gender: '',
    mobile: '',
    alternateMobile: '',
    address: '',
    city: clinic?.city || '',
    pincode: '',
    allergiesText: '',
    existingConditionsText: '',
    currentMedicationsText: '',
    emergencyName: '',
    emergencyMobile: '',
    emergencyRelation: '',
    medicalNotes: '',
  });

  const [showMedicalSection, setShowMedicalSection] = useState(false);
  const [duplicateMatches, setDuplicateMatches] = useState<PatientRecord[]>([]);
  const [duplicateAcknowledged, setDuplicateAcknowledged] = useState(false);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingQueueAfterSave, setPendingQueueAfterSave] = useState(queueIntentDefault);
  const [error, setError] = useState<string | null>(null);

  const handleDobChange = (dobValue: string) => {
    const calculated = calculateAgeFromDob(dobValue);
    setForm((prev) => ({
      ...prev,
      dateOfBirth: dobValue,
      age: calculated,
    }));
  };

  const handleMobileChange = (mobileValue: string) => {
    setForm((prev) => ({ ...prev, mobile: mobileValue }));
    setDuplicateAcknowledged(false);
    if (duplicateMatches.length > 0) {
      setDuplicateMatches([]);
    }
  };

  const handleMobileBlur = async () => {
    if (!clinic) return;
    const digits = form.mobile.replace(/\D/g, '');
    if (digits.length < 7) return;
    setCheckingDuplicates(true);
    try {
      const matches = await findDuplicatePatientsByMobile(clinic.id, form.mobile);
      setDuplicateMatches(matches);
    } catch {
      // Non-blocking pre-check
    } finally {
      setCheckingDuplicates(false);
    }
  };

  const validateAndSubmit = async (bypassDuplicatePrompt: boolean, addToQueue: boolean) => {
    if (!clinic || !user || !membership) return;

    const cleanName = form.fullName.trim();
    const cleanMobile = form.mobile.trim();
    const digits = cleanMobile.replace(/\D/g, '');

    if (cleanName.length < 2) {
      setError('Patient full name is required (at least 2 characters).');
      return;
    }
    if (!/^[+\d\s()-]{7,24}$/.test(cleanMobile) || digits.length < 7) {
      setError('Please enter a valid mobile number (at least 7 digits).');
      return;
    }
    if (form.alternateMobile.trim() && !/^[+\d\s()-]{7,24}$/.test(form.alternateMobile.trim())) {
      setError('Please enter a valid alternate mobile number.');
      return;
    }
    if (
      !form.dateOfBirth &&
      form.age !== null &&
      (Number.isNaN(form.age) || form.age < 0 || form.age > 130)
    ) {
      setError('Patient age must be between 0 and 130 years.');
      return;
    }
    if (
      (form.emergencyName.trim() && form.emergencyMobile.trim().replace(/\D/g, '').length < 7) ||
      (!form.emergencyName.trim() && form.emergencyMobile.trim())
    ) {
      setError('Emergency contact requires both a name and valid mobile number.');
      return;
    }

    setError(null);
    setPendingQueueAfterSave(addToQueue);

    if (!bypassDuplicatePrompt && !duplicateAcknowledged) {
      setCheckingDuplicates(true);
      try {
        const matches = await findDuplicatePatientsByMobile(clinic.id, cleanMobile);
        if (matches.length > 0) {
          setDuplicateMatches(matches);
          return;
        }
      } finally {
        setCheckingDuplicates(false);
      }
    }

    setSaving(true);
    try {
      const actorName = profile?.fullName || user.displayName || 'Clinic Staff';
      const result = await registerClinicPatient({
        clinicId: clinic.id,
        actorUid: user.uid,
        actorName,
        actorRole: membership.role,
        input: form,
      });

      if (addToQueue) {
        const createdPatient = await fetchPatientByIdOrCode(clinic.id, result.docId);
        if (createdPatient) {
          await addPatientToTodayQueue({
            clinicId: clinic.id,
            clinicOwnerId: clinic.ownerId,
            timezone: clinic.timezone,
            patient: createdPatient,
            actorUid: user.uid,
            actorName,
            actorRole: membership.role,
          });
          navigate(
            membership.role === 'receptionist' ? '/app/reception/queue' : '/app/doctor/queue',
            { replace: true },
          );
          return;
        }
      }

      navigate(`/app/patients/${result.patientId}`, { replace: true });
    } catch (err: unknown) {
      setError(
        getUserFriendlyErrorMessage(err, 'Could not register patient. Please try again.'),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void validateAndSubmit(false, pendingQueueAfterSave);
  };

  return (
    <AppShellLayout breadcrumb="Register Patient">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Link
              to="/app/patients"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 hover:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Back to Patients
            </Link>
            <h1 className="mt-1.5 font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#0B192C]">
              Register New Patient
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Enter core patient details for quick check-in. Patient ID is generated automatically.
            </p>
          </div>
        </div>

        {/* Duplicate Mobile Number Alert */}
        {duplicateMatches.length > 0 && !duplicateAcknowledged && (
          <div
            role="alert"
            className="rounded-2xl border border-amber-300 bg-amber-50/90 p-5 space-y-4"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
              <div className="space-y-1">
                <h2 className="font-display text-base font-bold text-[#0B192C]">
                  We found a patient with similar details.
                </h2>
                <p className="text-xs text-slate-700">
                  A patient with this mobile number already exists in {clinic?.name}. Open the
                  existing profile, or continue if registering a family member sharing this phone.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {duplicateMatches.map((match) => (
                <div
                  key={match.id}
                  className="flex flex-col gap-3 rounded-xl border border-amber-200/80 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="text-xs space-y-0.5">
                    <p className="font-semibold text-[#0B192C] text-sm">{match.fullName}</p>
                    <p className="text-slate-600 tabular-nums">
                      <span className="font-mono font-semibold text-sky-800">
                        {match.patientId}
                      </span>
                      <span className="mx-1.5" aria-hidden="true">
                        ·
                      </span>
                      <span>{match.mobile}</span>
                    </p>
                  </div>
                  <Link
                    to={`/app/patients/${match.patientId}`}
                    className="inline-flex min-h-[38px] items-center justify-center rounded-xl bg-[#0B192C] px-4 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
                  >
                    Open Existing Patient
                  </Link>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setDuplicateAcknowledged(true);
                  void validateAndSubmit(true, pendingQueueAfterSave);
                }}
                className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-amber-300 bg-white px-4 text-xs font-semibold text-[#0B192C] hover:bg-amber-50 cursor-pointer"
              >
                Continue Creating a New Patient
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
          {/* Section 1: Personal & Contact Details */}
          <section className="lucid-glass rounded-3xl p-6 sm:p-8 space-y-5">
            <h2 className="font-display text-lg font-bold text-[#0B192C]">
              Personal &amp; Contact Details
            </h2>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="pat-name" className="block text-xs font-semibold text-slate-700">
                  Full name <span className="text-rose-600">*</span>
                </label>
                <input
                  id="pat-name"
                  type="text"
                  required
                  value={form.fullName}
                  onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))}
                  placeholder="Rohan Kulkarni"
                  className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C] focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                />
              </div>

              <div>
                <label htmlFor="pat-mobile" className="block text-xs font-semibold text-slate-700">
                  Mobile number <span className="text-rose-600">*</span>
                </label>
                <input
                  id="pat-mobile"
                  type="tel"
                  required
                  value={form.mobile}
                  onChange={(e) => handleMobileChange(e.target.value)}
                  onBlur={() => void handleMobileBlur()}
                  placeholder="+91 98200 12345"
                  className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C] tabular-nums focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                />
                {checkingDuplicates && (
                  <p className="mt-1 text-[11px] text-slate-500">Checking existing patients...</p>
                )}
              </div>

              <div>
                <label htmlFor="pat-alt-mobile" className="block text-xs font-semibold text-slate-700">
                  Alternate mobile number (optional)
                </label>
                <input
                  id="pat-alt-mobile"
                  type="tel"
                  value={form.alternateMobile}
                  onChange={(e) => setForm((p) => ({ ...p, alternateMobile: e.target.value }))}
                  placeholder="Optional secondary contact"
                  className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C] tabular-nums"
                />
              </div>

              <div>
                <label htmlFor="pat-dob" className="block text-xs font-semibold text-slate-700">
                  Date of birth
                </label>
                <input
                  id="pat-dob"
                  type="date"
                  max={new Date().toISOString().split('T')[0]}
                  value={form.dateOfBirth}
                  onChange={(e) => handleDobChange(e.target.value)}
                  className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="pat-age" className="block text-xs font-semibold text-slate-700">
                    Age (years)
                  </label>
                  <input
                    id="pat-age"
                    type="number"
                    min={0}
                    max={130}
                    readOnly={Boolean(form.dateOfBirth)}
                    value={form.age ?? ''}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        age: e.target.value === '' ? null : Number(e.target.value),
                      }))
                    }
                    placeholder="Auto"
                    className={`mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 px-3.5 text-sm text-[#0B192C] tabular-nums ${
                      form.dateOfBirth ? 'bg-slate-50 text-slate-600 cursor-default' : 'bg-white'
                    }`}
                  />
                  {form.dateOfBirth && (
                    <p className="mt-1 text-[10px] text-slate-500">Auto-calculated from DOB</p>
                  )}
                </div>

                <div>
                  <label htmlFor="pat-gender" className="block text-xs font-semibold text-slate-700">
                    Gender
                  </label>
                  <select
                    id="pat-gender"
                    value={form.gender}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, gender: e.target.value as PatientGender | '' }))
                    }
                    className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 text-sm text-[#0B192C]"
                  >
                    <option value="">Select</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="pat-address" className="block text-xs font-semibold text-slate-700">
                  Address
                </label>
                <input
                  id="pat-address"
                  type="text"
                  value={form.address}
                  onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                  placeholder="House/Flat no., Street, Locality"
                  className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C]"
                />
              </div>

              <div>
                <label htmlFor="pat-city" className="block text-xs font-semibold text-slate-700">
                  City
                </label>
                <input
                  id="pat-city"
                  type="text"
                  value={form.city}
                  onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
                  placeholder="Pune"
                  className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C]"
                />
              </div>

              <div>
                <label htmlFor="pat-pin" className="block text-xs font-semibold text-slate-700">
                  PIN code
                </label>
                <input
                  id="pat-pin"
                  type="text"
                  value={form.pincode}
                  onChange={(e) => setForm((p) => ({ ...p, pincode: e.target.value }))}
                  placeholder="411004"
                  className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3.5 font-mono text-sm text-[#0B192C]"
                />
              </div>
            </div>
          </section>

          {/* Section 2: Expandable Basic Medical Information */}
          <section className="lucid-glass rounded-3xl p-6 sm:p-8 space-y-4">
            <button
              type="button"
              onClick={() => setShowMedicalSection((prev) => !prev)}
              aria-expanded={showMedicalSection}
              className="flex w-full items-center justify-between gap-4 text-left cursor-pointer"
            >
              <div>
                <h2 className="font-display text-lg font-bold text-[#0B192C]">
                  Basic Medical Information (Optional)
                </h2>
                <p className="mt-0.5 text-xs text-slate-600">
                  Expand to add known allergies, existing conditions, current medications, or
                  emergency contact.
                </p>
              </div>
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600">
                {showMedicalSection ? (
                  <ChevronUp className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                )}
              </span>
            </button>

            {showMedicalSection && (
              <div className="grid grid-cols-1 gap-5 border-t border-slate-200/70 pt-5 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="pat-allergies"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Known allergies (comma separated)
                  </label>
                  <input
                    id="pat-allergies"
                    type="text"
                    value={form.allergiesText}
                    onChange={(e) => setForm((p) => ({ ...p, allergiesText: e.target.value }))}
                    placeholder="e.g., Penicillin, Sulfa drugs, Peanuts"
                    className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="pat-conditions"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Existing medical conditions (comma separated)
                  </label>
                  <input
                    id="pat-conditions"
                    type="text"
                    value={form.existingConditionsText}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, existingConditionsText: e.target.value }))
                    }
                    placeholder="e.g., Hypertension, Type 2 Diabetes"
                    className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C]"
                  />
                </div>

                <div>
                  <label htmlFor="pat-meds" className="block text-xs font-semibold text-slate-700">
                    Current medications (comma separated)
                  </label>
                  <input
                    id="pat-meds"
                    type="text"
                    value={form.currentMedicationsText}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, currentMedicationsText: e.target.value }))
                    }
                    placeholder="e.g., Metformin 500mg, Amlodipine 5mg"
                    className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="pat-emg-name"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Emergency contact name (optional)
                  </label>
                  <input
                    id="pat-emg-name"
                    type="text"
                    value={form.emergencyName}
                    onChange={(e) => setForm((p) => ({ ...p, emergencyName: e.target.value }))}
                    placeholder="Contact person name"
                    className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="pat-emg-mobile"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Emergency contact mobile (optional)
                  </label>
                  <input
                    id="pat-emg-mobile"
                    type="tel"
                    value={form.emergencyMobile}
                    onChange={(e) => setForm((p) => ({ ...p, emergencyMobile: e.target.value }))}
                    placeholder="+91 98200 54321"
                    className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C]"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="pat-notes" className="block text-xs font-semibold text-slate-700">
                    Additional notes
                  </label>
                  <textarea
                    id="pat-notes"
                    rows={3}
                    value={form.medicalNotes}
                    onChange={(e) => setForm((p) => ({ ...p, medicalNotes: e.target.value }))}
                    placeholder="Patient intake remarks or communication preferences"
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3.5 text-sm text-[#0B192C]"
                  />
                </div>
              </div>
            )}
          </section>

          {/* Section 3: Registration Metadata */}
          <section className="lucid-glass-subtle rounded-2xl p-5">
            <h2 className="text-xs font-semibold text-slate-500">Registration Metadata</h2>
            <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
              <div>
                <dt className="text-slate-500">Patient ID</dt>
                <dd className="mt-0.5 font-mono font-semibold text-[#0B192C]">
                  Auto-generated (PAT-YYYY-NNNN)
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Registered By</dt>
                <dd className="mt-0.5 font-semibold text-[#0B192C]">
                  {profile?.fullName || user?.displayName || 'Clinic Staff'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Clinic Workspace</dt>
                <dd className="mt-0.5 font-semibold text-[#0B192C]">{clinic?.name}</dd>
              </div>
            </dl>
          </section>

          {error && (
            <div
              role="alert"
              className="rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-800"
            >
              {error}
            </div>
          )}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
            <Link
              to="/app/patients"
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </Link>
            <button
              type="button"
              disabled={saving || checkingDuplicates}
              onClick={() => void validateAndSubmit(false, false)}
              className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-[#0B192C] hover:bg-slate-50 disabled:opacity-60 cursor-pointer"
            >
              {saving && !pendingQueueAfterSave ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Registering...
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4 text-sky-700" aria-hidden="true" />
                  Register Patient
                </>
              )}
            </button>
            <button
              type="button"
              disabled={saving || checkingDuplicates}
              onClick={() => void validateAndSubmit(false, true)}
              className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0284C7] to-[#0891B2] px-6 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_-8px_rgba(2,132,199,0.5)] hover:brightness-105 disabled:opacity-60 cursor-pointer"
            >
              {saving && pendingQueueAfterSave ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Registering &amp; Queuing...
                </>
              ) : (
                <>
                  <ListPlus className="h-4 w-4" aria-hidden="true" />
                  Register &amp; Add to Today&rsquo;s Queue
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </AppShellLayout>
  );
}
