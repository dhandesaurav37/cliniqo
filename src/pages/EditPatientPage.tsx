import { ArrowLeft, Loader2, Lock, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AppShellLayout } from '../components/AppShellLayout';
import { useAuth } from '../context/AuthContext';
import { getUserFriendlyErrorMessage } from '../lib/errorUtils';
import {
  calculateAgeFromDob,
  fetchDoctorClinicalNote,
  fetchPatientByIdOrCode,
  updatePatientDemographics,
  updatePatientFullByDoctor,
  type PatientFormInput,
  type PatientGender,
  type PatientRecord,
} from '../lib/patientService';

export function EditPatientPage() {
  const { patientId } = useParams<{ patientId: string }>();
  const { user, clinic, profile, membership } = useAuth();
  const navigate = useNavigate();

  const isDoctorOrOwner = membership?.role === 'owner' || membership?.role === 'doctor';

  const [patient, setPatient] = useState<PatientRecord | null>(null);
  const [form, setForm] = useState<PatientFormInput>({
    fullName: '',
    dateOfBirth: '',
    age: null,
    gender: '',
    mobile: '',
    alternateMobile: '',
    address: '',
    city: '',
    pincode: '',
    allergiesText: '',
    existingConditionsText: '',
    currentMedicationsText: '',
    emergencyName: '',
    emergencyMobile: '',
    emergencyRelation: '',
    medicalNotes: '',
  });
  const [doctorClinicalNotes, setDoctorClinicalNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clinic || !patientId) return;
    let active = true;
    setLoading(true);
    fetchPatientByIdOrCode(clinic.id, patientId)
      .then(async (record) => {
        if (!active) return;
        setPatient(record);
        if (record) {
          setForm({
            fullName: record.fullName,
            dateOfBirth: record.dateOfBirth || '',
            age: record.age ?? null,
            gender: record.gender || '',
            mobile: record.mobile,
            alternateMobile: record.alternateMobile || '',
            address: record.address || '',
            city: record.city || '',
            pincode: record.pincode || '',
            allergiesText: record.allergies.join(', '),
            existingConditionsText: record.existingConditions.join(', '),
            currentMedicationsText: record.currentMedications.join(', '),
            emergencyName: record.emergencyContact?.name || '',
            emergencyMobile: record.emergencyContact?.mobile || '',
            emergencyRelation: record.emergencyContact?.relation || '',
            medicalNotes: record.medicalNotes || '',
          });
          if (isDoctorOrOwner) {
            const note = await fetchDoctorClinicalNote(clinic.id, record.id);
            if (active && note) {
              setDoctorClinicalNotes(note.clinicalNotes);
            }
          }
        }
      })
      .catch((err) => {
        if (!active) return;
        setError(getUserFriendlyErrorMessage(err, 'Unable to load patient details.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [clinic, patientId, isDoctorOrOwner]);

  const handleDobChange = (dobValue: string) => {
    setForm((prev) => ({
      ...prev,
      dateOfBirth: dobValue,
      age: calculateAgeFromDob(dobValue),
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinic || !patient || !user || !membership) return;

    const cleanName = form.fullName.trim();
    const cleanMobile = form.mobile.trim();
    const digits = cleanMobile.replace(/\D/g, '');

    if (cleanName.length < 2) {
      setError('Patient full name is required.');
      return;
    }
    if (!/^[+\d\s()-]{7,24}$/.test(cleanMobile) || digits.length < 7) {
      setError('Please enter a valid mobile number.');
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
    setSaving(true);
    try {
      const actorName = profile?.fullName || user.displayName || 'Clinic Staff';
      if (isDoctorOrOwner) {
        await updatePatientFullByDoctor({
          clinicId: clinic.id,
          patient,
          actorUid: user.uid,
          actorName,
          actorRole: membership.role,
          input: form,
          doctorClinicalNotes,
        });
      } else {
        await updatePatientDemographics({
          clinicId: clinic.id,
          patient,
          actorUid: user.uid,
          actorName,
          actorRole: membership.role,
          input: form,
        });
      }
      navigate(`/app/patients/${patient.patientId}`, { replace: true });
    } catch (err: unknown) {
      setError(getUserFriendlyErrorMessage(err, 'Could not save patient changes.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShellLayout breadcrumb={patient ? `Edit ${patient.patientId}` : 'Edit Patient'}>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <Link
            to={patient ? `/app/patients/${patient.patientId}` : '/app/patients'}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back to Patient Profile
          </Link>
          <h1 className="mt-1.5 font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#0B192C]">
            Edit Patient Information
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {isDoctorOrOwner
              ? 'Update demographic details, medical intake information, and doctor-only clinical notes.'
              : 'Update patient demographic and contact details. Medical and doctor clinical fields are restricted to doctors.'}
          </p>
        </div>

        {loading ? (
          <div className="lucid-glass rounded-3xl p-8 flex items-center gap-3 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin text-sky-600" aria-hidden="true" />
            Loading patient record...
          </div>
        ) : !patient ? (
          <div className="lucid-glass rounded-3xl p-8 text-center space-y-3">
            <p className="font-display text-lg font-bold text-[#0B192C]">Patient not found</p>
            <Link
              to="/app/patients"
              className="inline-flex min-h-[40px] items-center rounded-xl bg-[#0B192C] px-4 text-xs font-semibold text-white"
            >
              Return to Patients
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-6" noValidate>
            {/* Demographic Section (Editable by Receptionist and Doctor) */}
            <section className="lucid-glass rounded-3xl p-6 sm:p-8 space-y-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-lg font-bold text-[#0B192C]">
                  Demographic Details
                </h2>
                <span className="font-mono text-xs font-semibold text-sky-800">
                  {patient.patientId}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="edit-name" className="block text-xs font-semibold text-slate-700">
                    Full name <span className="text-rose-600">*</span>
                  </label>
                  <input
                    id="edit-name"
                    type="text"
                    value={form.fullName}
                    onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))}
                    className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="edit-mobile"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Mobile number <span className="text-rose-600">*</span>
                  </label>
                  <input
                    id="edit-mobile"
                    type="tel"
                    value={form.mobile}
                    onChange={(e) => setForm((p) => ({ ...p, mobile: e.target.value }))}
                    className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C] tabular-nums"
                  />
                </div>

                <div>
                  <label
                    htmlFor="edit-alt-mobile"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Alternate mobile
                  </label>
                  <input
                    id="edit-alt-mobile"
                    type="tel"
                    value={form.alternateMobile}
                    onChange={(e) => setForm((p) => ({ ...p, alternateMobile: e.target.value }))}
                    className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C] tabular-nums"
                  />
                </div>

                <div>
                  <label htmlFor="edit-dob" className="block text-xs font-semibold text-slate-700">
                    Date of birth
                  </label>
                  <input
                    id="edit-dob"
                    type="date"
                    max={new Date().toISOString().split('T')[0]}
                    value={form.dateOfBirth}
                    onChange={(e) => handleDobChange(e.target.value)}
                    className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="edit-age" className="block text-xs font-semibold text-slate-700">
                      Age
                    </label>
                    <input
                      id="edit-age"
                      type="number"
                      min={0}
                      max={130}
                      value={form.age ?? ''}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          age: e.target.value === '' ? null : Number(e.target.value),
                        }))
                      }
                      className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C] tabular-nums"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="edit-gender"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Gender
                    </label>
                    <select
                      id="edit-gender"
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
                  <label
                    htmlFor="edit-address"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Address
                  </label>
                  <input
                    id="edit-address"
                    type="text"
                    value={form.address}
                    onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                    className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C]"
                  />
                </div>

                <div>
                  <label htmlFor="edit-city" className="block text-xs font-semibold text-slate-700">
                    City
                  </label>
                  <input
                    id="edit-city"
                    type="text"
                    value={form.city}
                    onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
                    className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C]"
                  />
                </div>

                <div>
                  <label htmlFor="edit-pin" className="block text-xs font-semibold text-slate-700">
                    PIN code
                  </label>
                  <input
                    id="edit-pin"
                    type="text"
                    value={form.pincode}
                    onChange={(e) => setForm((p) => ({ ...p, pincode: e.target.value }))}
                    className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3.5 font-mono text-sm text-[#0B192C]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="edit-emg-name"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Emergency contact name
                  </label>
                  <input
                    id="edit-emg-name"
                    type="text"
                    value={form.emergencyName}
                    onChange={(e) => setForm((p) => ({ ...p, emergencyName: e.target.value }))}
                    className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="edit-emg-mobile"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Emergency contact mobile
                  </label>
                  <input
                    id="edit-emg-mobile"
                    type="tel"
                    value={form.emergencyMobile}
                    onChange={(e) => setForm((p) => ({ ...p, emergencyMobile: e.target.value }))}
                    className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C]"
                  />
                </div>
              </div>
            </section>

            {/* Medical & Doctor Clinical Notes (Doctor/Owner Editable; Restricted for Receptionists) */}
            {isDoctorOrOwner ? (
              <section className="lucid-glass rounded-3xl p-6 sm:p-8 space-y-5">
                <h2 className="font-display text-lg font-bold text-[#0B192C]">
                  Medical &amp; Clinical Information
                </h2>

                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="edit-allergies"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Known allergies (comma separated)
                    </label>
                    <input
                      id="edit-allergies"
                      type="text"
                      value={form.allergiesText}
                      onChange={(e) => setForm((p) => ({ ...p, allergiesText: e.target.value }))}
                      className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C]"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="edit-conditions"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Existing medical conditions (comma separated)
                    </label>
                    <input
                      id="edit-conditions"
                      type="text"
                      value={form.existingConditionsText}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, existingConditionsText: e.target.value }))
                      }
                      className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C]"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="edit-meds"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Current medications (comma separated)
                    </label>
                    <input
                      id="edit-meds"
                      type="text"
                      value={form.currentMedicationsText}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, currentMedicationsText: e.target.value }))
                      }
                      className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C]"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="edit-intake-notes"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Intake &amp; additional medical notes
                    </label>
                    <textarea
                      id="edit-intake-notes"
                      rows={3}
                      value={form.medicalNotes}
                      onChange={(e) => setForm((p) => ({ ...p, medicalNotes: e.target.value }))}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3.5 text-sm text-[#0B192C]"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="edit-doctor-notes"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Doctor-only clinical notes (hidden from receptionists)
                    </label>
                    <textarea
                      id="edit-doctor-notes"
                      rows={4}
                      value={doctorClinicalNotes}
                      onChange={(e) => setDoctorClinicalNotes(e.target.value)}
                      placeholder="Private clinical observations and practitioner notes"
                      className="mt-1.5 w-full rounded-xl border border-sky-200 bg-sky-50/40 p-3.5 text-sm text-[#0B192C]"
                    />
                  </div>
                </div>
              </section>
            ) : (
              <section className="lucid-glass-subtle rounded-2xl p-5 flex items-start gap-3 text-xs text-slate-600">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
                <div>
                  <p className="font-semibold text-[#0B192C]">
                    Medical &amp; Doctor-Only Notes Restricted
                  </p>
                  <p className="mt-0.5">
                    Receptionists can update demographic and emergency contact details. Allergies,
                    conditions, medications, and clinical notes can only be edited by a doctor.
                  </p>
                </div>
              </section>
            )}

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
                to={`/app/patients/${patient.patientId}`}
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0284C7] to-[#0891B2] px-6 text-sm font-semibold text-white shadow-sm hover:brightness-105 disabled:opacity-60 cursor-pointer"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Saving Changes...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" aria-hidden="true" />
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </AppShellLayout>
  );
}
