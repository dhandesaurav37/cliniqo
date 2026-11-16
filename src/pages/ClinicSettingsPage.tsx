import { CheckCircle2, Copy, Loader2, RefreshCw, ShieldAlert, Upload, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AppShellLayout } from '../components/AppShellLayout';
import { useAuth } from '../context/AuthContext';
import { compressImageToDataUrl } from '../lib/imageUtils';
import {
  regenerateJoiningCode,
  revokeJoiningCode,
  updateClinicDetails,
  updateDoctorProfile,
  WORKING_DAYS_OPTIONS,
  type ClinicOnboardingInput,
  type DoctorOnboardingInput,
  type WorkingDay,
} from '../lib/clinicService';
import { getUserFriendlyErrorMessage } from '../lib/errorUtils';

export function ClinicSettingsPage() {
  const { user, clinic, profile, refreshWorkspace } = useAuth();

  const [clinicForm, setClinicForm] = useState<ClinicOnboardingInput>({
    name: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    phone: '',
    email: '',
    logoUrl: '',
    consultationFee: 500,
    openingTime: '09:00',
    closingTime: '20:00',
    workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    appointmentDuration: 15,
    timezone: 'Asia/Kolkata',
    receptionistPermissions: {
      canCreateAppointments: true,
      canCancelAppointments: true,
    },
    whatsappSettings: {
      enabled: true,
      templateConfirmation: '',
      templateReminder24h: '',
      templateReminder2h: '',
      templateReschedule: '',
      templateCancelled: '',
      languageCode: 'en',
    },
  });

  const [doctorForm, setDoctorForm] = useState<DoctorOnboardingInput>({
    fullName: '',
    photoURL: '',
    qualification: '',
    specialization: '',
    registrationNumber: '',
    experience: 0,
    consultationTimings: '',
  });

  const [savingClinic, setSavingClinic] = useState(false);
  const [savingDoctor, setSavingDoctor] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [codeBusy, setCodeBusy] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'regenerate' | 'revoke' | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (clinic) {
      setClinicForm({
        name: clinic.name,
        address: clinic.address,
        city: clinic.city,
        state: clinic.state,
        pincode: clinic.pincode,
        phone: clinic.phone,
        email: clinic.email || '',
        logoUrl: clinic.logoUrl || '',
        consultationFee: clinic.consultationFee,
        openingTime: clinic.openingTime,
        closingTime: clinic.closingTime,
        workingDays: clinic.workingDays,
        appointmentDuration: clinic.appointmentDuration,
        timezone: clinic.timezone || 'Asia/Kolkata',
        receptionistPermissions: {
          canCreateAppointments: clinic.receptionistPermissions?.canCreateAppointments !== false,
          canCancelAppointments: clinic.receptionistPermissions?.canCancelAppointments !== false,
        },
        whatsappSettings: {
          enabled: clinic.whatsappSettings?.enabled !== false,
          templateConfirmation: clinic.whatsappSettings?.templateConfirmation || '',
          templateReminder24h: clinic.whatsappSettings?.templateReminder24h || '',
          templateReminder2h: clinic.whatsappSettings?.templateReminder2h || '',
          templateReschedule: clinic.whatsappSettings?.templateReschedule || '',
          templateCancelled: clinic.whatsappSettings?.templateCancelled || '',
          languageCode: clinic.whatsappSettings?.languageCode || 'en',
        },
      });
    }
  }, [clinic]);

  useEffect(() => {
    if (profile) {
      setDoctorForm({
        fullName: profile.fullName,
        photoURL: profile.photoURL || '',
        qualification: profile.qualification || '',
        specialization: profile.specialization || '',
        registrationNumber: profile.registrationNumber || '',
        experience: profile.experience ?? 0,
        consultationTimings: profile.consultationTimings || '',
      });
    }
  }, [profile]);

  useEffect(() => {
    if (!confirmAction) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !codeBusy) {
        setConfirmAction(null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [confirmAction, codeBusy]);

  const toggleDay = (day: WorkingDay) => {
    const exists = clinicForm.workingDays.includes(day);
    const nextDays = exists
      ? clinicForm.workingDays.filter((d) => d !== day)
      : WORKING_DAYS_OPTIONS.filter((d) => d === day || clinicForm.workingDays.includes(d));
    setClinicForm((prev) => ({ ...prev, workingDays: nextDays }));
  };

  const handleClinicLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploadingLogo(true);
    try {
      const dataUrl = await compressImageToDataUrl(file, 160, 0.8);
      setClinicForm((p) => ({ ...p, logoUrl: dataUrl }));
    } catch (err: unknown) {
      setError(getUserFriendlyErrorMessage(err, 'Unable to process clinic logo.'));
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleDoctorPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploadingPhoto(true);
    try {
      const dataUrl = await compressImageToDataUrl(file, 180, 0.8);
      setDoctorForm((p) => ({ ...p, photoURL: dataUrl }));
    } catch (err: unknown) {
      setError(getUserFriendlyErrorMessage(err, 'Unable to process profile photo.'));
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSaveClinic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinic) return;
    if (clinicForm.name.trim().length < 2 || clinicForm.address.trim().length < 3) {
      setError('Clinic name and address are required.');
      return;
    }
    if (clinicForm.city.trim().length < 2 || clinicForm.state.trim().length < 2) {
      setError('Please enter both city and state.');
      return;
    }
    if (!/^[a-zA-Z0-9\s-]{4,12}$/.test(clinicForm.pincode.trim())) {
      setError('Please enter a valid PIN code.');
      return;
    }
    if (!/^[+\d\s()-]{7,20}$/.test(clinicForm.phone.trim())) {
      setError('Please enter a valid clinic phone number.');
      return;
    }
    if (clinicForm.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clinicForm.email.trim())) {
      setError('Please enter a valid optional clinic email or leave it blank.');
      return;
    }
    if (Number(clinicForm.consultationFee) < 0 || Number(clinicForm.consultationFee) > 100000) {
      setError('Consultation fee must be between 0 and 100,000 INR.');
      return;
    }
    if (!clinicForm.openingTime || !clinicForm.closingTime || clinicForm.openingTime >= clinicForm.closingTime) {
      setError('Opening time must be earlier than closing time.');
      return;
    }
    if (clinicForm.workingDays.length === 0) {
      setError('Select at least one working day.');
      return;
    }

    setError(null);
    setFeedback(null);
    setSavingClinic(true);
    try {
      await updateClinicDetails(clinic.id, clinicForm);
      await refreshWorkspace();
      setFeedback('Clinic details and configuration updated.');
    } catch (err: unknown) {
      setError(getUserFriendlyErrorMessage(err, 'Unable to save clinic changes.'));
    } finally {
      setSavingClinic(false);
    }
  };

  const handleSaveDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (doctorForm.fullName.trim().length < 2) {
      setError('Doctor full name is required.');
      return;
    }
    if (Number(doctorForm.experience) < 0 || Number(doctorForm.experience) > 80) {
      setError('Years of experience must be between 0 and 80.');
      return;
    }
    setError(null);
    setFeedback(null);
    setSavingDoctor(true);
    try {
      await updateDoctorProfile(user.uid, doctorForm);
      await refreshWorkspace();
      setFeedback('Doctor profile updated.');
    } catch (err: unknown) {
      setError(getUserFriendlyErrorMessage(err, 'Unable to save doctor profile.'));
    } finally {
      setSavingDoctor(false);
    }
  };

  const handleConfirmCodeAction = async () => {
    if (!clinic || !user || !confirmAction) return;
    setError(null);
    setFeedback(null);
    setCodeBusy(true);
    try {
      if (confirmAction === 'regenerate') {
        const nextCode = await regenerateJoiningCode(clinic.id, user.uid);
        await refreshWorkspace();
        setFeedback(`New clinic joining code generated: ${nextCode}`);
      } else {
        await revokeJoiningCode(clinic.id);
        await refreshWorkspace();
        setFeedback('Clinic joining code has been revoked.');
      }
      setConfirmAction(null);
    } catch (err: unknown) {
      setError(getUserFriendlyErrorMessage(err, 'Could not update joining code.'));
    } finally {
      setCodeBusy(false);
    }
  };

  const handleCopyCode = async () => {
    if (!clinic?.joiningCode) return;
    try {
      await navigator.clipboard.writeText(clinic.joiningCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <AppShellLayout breadcrumb="Clinic Settings">
      <div className="space-y-8">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#0B192C]">
            Clinic Settings
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Update your clinic configuration, practitioner credentials, or rotate your clinic
            joining code.
          </p>
        </div>

        {feedback && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-sm font-medium text-emerald-800"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            {feedback}
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-800"
          >
            {error}
          </div>
        )}

        {/* Joining Code Management Card */}
        <section className="lucid-glass rounded-3xl p-6 sm:p-8 space-y-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-lg font-bold text-[#0B192C]">
                Clinic Joining Code
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Used strictly to identify your clinic when inviting staff. Never treated as a login
                password.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmAction('regenerate')}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-[#0B192C] hover:bg-slate-50 cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5 text-sky-700" aria-hidden="true" />
                {clinic?.joiningCodeActive ? 'Regenerate Code' : 'Generate New Code'}
              </button>

              {clinic?.joiningCodeActive && (
                <button
                  type="button"
                  onClick={() => setConfirmAction('revoke')}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 cursor-pointer"
                >
                  Revoke Code
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/80 px-5 py-4">
            <span className="font-mono text-xl font-bold tracking-wider text-[#0B192C] tabular-nums">
              {clinic?.joiningCodeActive && clinic.joiningCode
                ? clinic.joiningCode
                : 'No active joining code (Revoked)'}
            </span>
            {clinic?.joiningCodeActive && clinic.joiningCode && (
              <button
                type="button"
                onClick={handleCopyCode}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                {copied ? 'Copied' : 'Copy Code'}
              </button>
            )}
          </div>
        </section>

        {/* Clinic Details & Configuration Form */}
        <form onSubmit={handleSaveClinic} className="lucid-glass rounded-3xl p-6 sm:p-8 space-y-6">
          <h2 className="font-display text-lg font-bold text-[#0B192C]">
            Clinic Details &amp; Hours
          </h2>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="set-name" className="block text-xs font-semibold text-slate-700">
                Clinic name
              </label>
              <input
                id="set-name"
                type="text"
                value={clinicForm.name}
                onChange={(e) => setClinicForm((p) => ({ ...p, name: e.target.value }))}
                className="mt-1.5 w-full min-h-[42px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C]"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="set-addr" className="block text-xs font-semibold text-slate-700">
                Address
              </label>
              <input
                id="set-addr"
                type="text"
                value={clinicForm.address}
                onChange={(e) => setClinicForm((p) => ({ ...p, address: e.target.value }))}
                className="mt-1.5 w-full min-h-[42px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C]"
              />
            </div>

            <div>
              <label htmlFor="set-city" className="block text-xs font-semibold text-slate-700">
                City
              </label>
              <input
                id="set-city"
                type="text"
                value={clinicForm.city}
                onChange={(e) => setClinicForm((p) => ({ ...p, city: e.target.value }))}
                className="mt-1.5 w-full min-h-[42px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C]"
              />
            </div>

            <div>
              <label htmlFor="set-state" className="block text-xs font-semibold text-slate-700">
                State
              </label>
              <input
                id="set-state"
                type="text"
                value={clinicForm.state}
                onChange={(e) => setClinicForm((p) => ({ ...p, state: e.target.value }))}
                className="mt-1.5 w-full min-h-[42px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C]"
              />
            </div>

            <div>
              <label htmlFor="set-pin" className="block text-xs font-semibold text-slate-700">
                PIN code
              </label>
              <input
                id="set-pin"
                type="text"
                value={clinicForm.pincode}
                onChange={(e) => setClinicForm((p) => ({ ...p, pincode: e.target.value }))}
                className="mt-1.5 w-full min-h-[42px] rounded-xl border border-slate-200 bg-white px-3.5 font-mono text-sm text-[#0B192C]"
              />
            </div>

            <div>
              <label htmlFor="set-phone" className="block text-xs font-semibold text-slate-700">
                Phone
              </label>
              <input
                id="set-phone"
                type="tel"
                value={clinicForm.phone}
                onChange={(e) => setClinicForm((p) => ({ ...p, phone: e.target.value }))}
                className="mt-1.5 w-full min-h-[42px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C]"
              />
            </div>

            <div>
              <label htmlFor="set-email" className="block text-xs font-semibold text-slate-700">
                Clinic email (optional)
              </label>
              <input
                id="set-email"
                type="email"
                value={clinicForm.email}
                onChange={(e) => setClinicForm((p) => ({ ...p, email: e.target.value }))}
                placeholder="reception@clinic.in"
                className="mt-1.5 w-full min-h-[42px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C]"
              />
            </div>

            <div>
              <span className="block text-xs font-semibold text-slate-700">
                Clinic logo (letterhead)
              </span>
              <div className="mt-1.5 flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-400">
                  {clinicForm.logoUrl ? (
                    <img
                      src={clinicForm.logoUrl}
                      alt="Clinic logo"
                      className="h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="text-[10px] font-mono">LOGO</span>
                  )}
                </div>
                <label className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-[#0B192C] hover:bg-slate-50 cursor-pointer">
                  <Upload className="h-3.5 w-3.5 text-sky-600" aria-hidden="true" />
                  {uploadingLogo ? 'Processing...' : 'Upload Logo'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleClinicLogoUpload}
                    className="sr-only"
                  />
                </label>
                {clinicForm.logoUrl && (
                  <button
                    type="button"
                    onClick={() => setClinicForm((p) => ({ ...p, logoUrl: '' }))}
                    className="text-xs font-medium text-slate-500 hover:text-rose-600 cursor-pointer"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="set-fee" className="block text-xs font-semibold text-slate-700">
                Consultation fee (INR)
              </label>
              <input
                id="set-fee"
                type="number"
                min={0}
                max={100000}
                value={clinicForm.consultationFee}
                onChange={(e) =>
                  setClinicForm((p) => ({ ...p, consultationFee: Number(e.target.value) }))
                }
                className="mt-1.5 w-full min-h-[42px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C] tabular-nums"
              />
            </div>

            <div>
              <label htmlFor="set-duration" className="block text-xs font-semibold text-slate-700">
                Appointment duration (minutes)
              </label>
              <select
                id="set-duration"
                value={clinicForm.appointmentDuration}
                onChange={(e) =>
                  setClinicForm((p) => ({ ...p, appointmentDuration: Number(e.target.value) }))
                }
                className="mt-1.5 w-full min-h-[42px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C]"
              >
                <option value={10}>10 minutes</option>
                <option value={15}>15 minutes</option>
                <option value={20}>20 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={45}>45 minutes</option>
              </select>
            </div>

            <div>
              <label htmlFor="set-open" className="block text-xs font-semibold text-slate-700">
                Opening time
              </label>
              <input
                id="set-open"
                type="time"
                value={clinicForm.openingTime}
                onChange={(e) => setClinicForm((p) => ({ ...p, openingTime: e.target.value }))}
                className="mt-1.5 w-full min-h-[42px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C]"
              />
            </div>

            <div>
              <label htmlFor="set-close" className="block text-xs font-semibold text-slate-700">
                Closing time
              </label>
              <input
                id="set-close"
                type="time"
                value={clinicForm.closingTime}
                onChange={(e) => setClinicForm((p) => ({ ...p, closingTime: e.target.value }))}
                className="mt-1.5 w-full min-h-[42px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C]"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="set-timezone" className="block text-xs font-semibold text-slate-700">
                Clinic timezone (controls daily queue token reset)
              </label>
              <select
                id="set-timezone"
                value={clinicForm.timezone || 'Asia/Kolkata'}
                onChange={(e) => setClinicForm((p) => ({ ...p, timezone: e.target.value }))}
                className="mt-1.5 w-full min-h-[42px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C]"
              >
                <option value="Asia/Kolkata">Asia/Kolkata (IST, UTC+05:30)</option>
                <option value="Asia/Dubai">Asia/Dubai (GST, UTC+04:00)</option>
                <option value="Asia/Singapore">Asia/Singapore (SGT, UTC+08:00)</option>
                <option value="Europe/London">Europe/London (GMT/BST)</option>
                <option value="America/New_York">America/New_York (ET)</option>
                <option value="America/Los_Angeles">America/Los_Angeles (PT)</option>
              </select>
            </div>

            <div className="sm:col-span-2 space-y-2">
              <span className="block text-xs font-semibold text-slate-700">Working days</span>
              <div className="flex flex-wrap gap-2">
                {WORKING_DAYS_OPTIONS.map((day) => {
                  const selected = clinicForm.workingDays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(day)}
                      className={`min-h-[38px] min-w-[48px] rounded-xl border px-3 text-xs font-semibold cursor-pointer ${
                        selected
                          ? 'border-sky-600 bg-sky-600 text-white'
                          : 'border-slate-200 bg-white text-slate-600'
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Receptionist Appointment Permissions */}
            <div className="sm:col-span-2 rounded-2xl border border-slate-200/80 bg-white/80 p-4 space-y-3">
              <div>
                <h3 className="font-display text-sm font-bold text-[#0B192C]">
                  Receptionist Appointment Permissions
                </h3>
                <p className="text-xs text-slate-500">
                  Control whether approved receptionists can schedule or cancel clinic appointments.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
                <label className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={clinicForm.receptionistPermissions?.canCreateAppointments !== false}
                    onChange={(e) =>
                      setClinicForm((p) => ({
                        ...p,
                        receptionistPermissions: {
                          canCreateAppointments: e.target.checked,
                          canCancelAppointments:
                            p.receptionistPermissions?.canCancelAppointments !== false,
                        },
                      }))
                    }
                    className="h-4 w-4 rounded border-slate-300 text-sky-600"
                  />
                  <span className="font-semibold text-[#0B192C]">
                    Allow receptionists to schedule &amp; reschedule
                  </span>
                </label>

                <label className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={clinicForm.receptionistPermissions?.canCancelAppointments !== false}
                    onChange={(e) =>
                      setClinicForm((p) => ({
                        ...p,
                        receptionistPermissions: {
                          canCreateAppointments:
                            p.receptionistPermissions?.canCreateAppointments !== false,
                          canCancelAppointments: e.target.checked,
                        },
                      }))
                    }
                    className="h-4 w-4 rounded border-slate-300 text-sky-600"
                  />
                  <span className="font-semibold text-[#0B192C]">
                    Allow receptionists to cancel appointments
                  </span>
                </label>
              </div>
            </div>

            {/* WhatsApp Notifications & Approved Meta Template Names */}
            <div className="sm:col-span-2 rounded-2xl border border-slate-200/80 bg-white/80 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-display text-sm font-bold text-[#0B192C]">
                    WhatsApp Appointment Reminders (Meta Cloud API)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Non-secret Meta template names and language code. Access tokens remain strictly in
                    Google Cloud Secret Manager.
                  </p>
                </div>
                <label className="flex items-center gap-2 text-xs font-semibold text-[#0B192C] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={clinicForm.whatsappSettings?.enabled !== false}
                    onChange={(e) =>
                      setClinicForm((p) => ({
                        ...p,
                        whatsappSettings: {
                          ...p.whatsappSettings,
                          enabled: e.target.checked,
                        },
                      }))
                    }
                    className="h-4 w-4 rounded border-slate-300 text-sky-600"
                  />
                  Enable WhatsApp Automation
                </label>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
                <div>
                  <label htmlFor="wa-lang" className="block font-semibold text-slate-700">
                    Template Language
                  </label>
                  <select
                    id="wa-lang"
                    value={clinicForm.whatsappSettings?.languageCode || 'en'}
                    onChange={(e) =>
                      setClinicForm((p) => ({
                        ...p,
                        whatsappSettings: {
                          enabled: p.whatsappSettings?.enabled !== false,
                          ...p.whatsappSettings,
                          languageCode: e.target.value,
                        },
                      }))
                    }
                    className="mt-1 w-full min-h-[38px] rounded-xl border border-slate-200 bg-white px-3 text-xs text-[#0B192C]"
                  >
                    <option value="en">English (en)</option>
                    <option value="en_US">English US (en_US)</option>
                    <option value="en_IN">English India (en_IN)</option>
                    <option value="hi">Hindi (hi)</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="wa-tpl-confirm" className="block font-semibold text-slate-700">
                    Confirmation Template Name
                  </label>
                  <input
                    id="wa-tpl-confirm"
                    type="text"
                    value={clinicForm.whatsappSettings?.templateConfirmation || ''}
                    onChange={(e) =>
                      setClinicForm((p) => ({
                        ...p,
                        whatsappSettings: {
                          enabled: p.whatsappSettings?.enabled !== false,
                          ...p.whatsappSettings,
                          templateConfirmation: e.target.value,
                        },
                      }))
                    }
                    placeholder="cliniqo_appointment_confirmation"
                    className="mt-1 w-full min-h-[38px] rounded-xl border border-slate-200 bg-white px-3 font-mono text-xs text-[#0B192C]"
                  />
                </div>

                <div>
                  <label htmlFor="wa-tpl-24h" className="block font-semibold text-slate-700">
                    24h Reminder Template Name
                  </label>
                  <input
                    id="wa-tpl-24h"
                    type="text"
                    value={clinicForm.whatsappSettings?.templateReminder24h || ''}
                    onChange={(e) =>
                      setClinicForm((p) => ({
                        ...p,
                        whatsappSettings: {
                          enabled: p.whatsappSettings?.enabled !== false,
                          ...p.whatsappSettings,
                          templateReminder24h: e.target.value,
                        },
                      }))
                    }
                    placeholder="cliniqo_appointment_reminder_24h"
                    className="mt-1 w-full min-h-[38px] rounded-xl border border-slate-200 bg-white px-3 font-mono text-xs text-[#0B192C]"
                  />
                </div>

                <div>
                  <label htmlFor="wa-tpl-2h" className="block font-semibold text-slate-700">
                    2h Reminder Template Name
                  </label>
                  <input
                    id="wa-tpl-2h"
                    type="text"
                    value={clinicForm.whatsappSettings?.templateReminder2h || ''}
                    onChange={(e) =>
                      setClinicForm((p) => ({
                        ...p,
                        whatsappSettings: {
                          enabled: p.whatsappSettings?.enabled !== false,
                          ...p.whatsappSettings,
                          templateReminder2h: e.target.value,
                        },
                      }))
                    }
                    placeholder="cliniqo_appointment_reminder_2h"
                    className="mt-1 w-full min-h-[38px] rounded-xl border border-slate-200 bg-white px-3 font-mono text-xs text-[#0B192C]"
                  />
                </div>

                <div>
                  <label htmlFor="wa-tpl-resched" className="block font-semibold text-slate-700">
                    Reschedule Template Name
                  </label>
                  <input
                    id="wa-tpl-resched"
                    type="text"
                    value={clinicForm.whatsappSettings?.templateReschedule || ''}
                    onChange={(e) =>
                      setClinicForm((p) => ({
                        ...p,
                        whatsappSettings: {
                          enabled: p.whatsappSettings?.enabled !== false,
                          ...p.whatsappSettings,
                          templateReschedule: e.target.value,
                        },
                      }))
                    }
                    placeholder="cliniqo_appointment_rescheduled"
                    className="mt-1 w-full min-h-[38px] rounded-xl border border-slate-200 bg-white px-3 font-mono text-xs text-[#0B192C]"
                  />
                </div>

                <div>
                  <label htmlFor="wa-tpl-cancel" className="block font-semibold text-slate-700">
                    Cancellation Template Name
                  </label>
                  <input
                    id="wa-tpl-cancel"
                    type="text"
                    value={clinicForm.whatsappSettings?.templateCancelled || ''}
                    onChange={(e) =>
                      setClinicForm((p) => ({
                        ...p,
                        whatsappSettings: {
                          enabled: p.whatsappSettings?.enabled !== false,
                          ...p.whatsappSettings,
                          templateCancelled: e.target.value,
                        },
                      }))
                    }
                    placeholder="cliniqo_appointment_cancelled"
                    className="mt-1 w-full min-h-[38px] rounded-xl border border-slate-200 bg-white px-3 font-mono text-xs text-[#0B192C]"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end border-t border-slate-200/70 pt-5">
            <button
              type="submit"
              disabled={savingClinic}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-gradient-to-r from-[#0284C7] to-[#0891B2] px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:brightness-105 disabled:opacity-60 cursor-pointer"
            >
              {savingClinic && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Save Clinic Settings
            </button>
          </div>
        </form>

        {/* Doctor Profile Form */}
        <form onSubmit={handleSaveDoctor} className="lucid-glass rounded-3xl p-6 sm:p-8 space-y-6">
          <h2 className="font-display text-lg font-bold text-[#0B192C]">Doctor Profile</h2>

          <div className="flex flex-wrap items-center gap-4 border-b border-slate-200/70 pb-5">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-400">
              {doctorForm.photoURL ? (
                <img
                  src={doctorForm.photoURL}
                  alt="Doctor profile"
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <UserRound className="h-6 w-6" aria-hidden="true" />
              )}
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-700">Profile photo (optional)</p>
              <div className="flex flex-wrap items-center gap-2.5">
                <label className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-[#0B192C] hover:bg-slate-50 cursor-pointer">
                  <Upload className="h-3.5 w-3.5 text-sky-600" aria-hidden="true" />
                  {uploadingPhoto ? 'Processing...' : 'Upload Photo'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleDoctorPhotoUpload}
                    className="sr-only"
                  />
                </label>
                {doctorForm.photoURL && (
                  <button
                    type="button"
                    onClick={() => setDoctorForm((p) => ({ ...p, photoURL: '' }))}
                    className="text-xs font-medium text-slate-500 hover:text-rose-600 cursor-pointer"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="set-doc-name" className="block text-xs font-semibold text-slate-700">
                Full name
              </label>
              <input
                id="set-doc-name"
                type="text"
                value={doctorForm.fullName}
                onChange={(e) => setDoctorForm((p) => ({ ...p, fullName: e.target.value }))}
                className="mt-1.5 w-full min-h-[42px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C]"
              />
            </div>

            <div>
              <label htmlFor="set-doc-qual" className="block text-xs font-semibold text-slate-700">
                Qualification
              </label>
              <input
                id="set-doc-qual"
                type="text"
                value={doctorForm.qualification}
                onChange={(e) => setDoctorForm((p) => ({ ...p, qualification: e.target.value }))}
                className="mt-1.5 w-full min-h-[42px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C]"
              />
            </div>

            <div>
              <label htmlFor="set-doc-spec" className="block text-xs font-semibold text-slate-700">
                Specialization
              </label>
              <input
                id="set-doc-spec"
                type="text"
                value={doctorForm.specialization}
                onChange={(e) => setDoctorForm((p) => ({ ...p, specialization: e.target.value }))}
                className="mt-1.5 w-full min-h-[42px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C]"
              />
            </div>

            <div>
              <label htmlFor="set-doc-reg" className="block text-xs font-semibold text-slate-700">
                Medical registration number
              </label>
              <input
                id="set-doc-reg"
                type="text"
                value={doctorForm.registrationNumber}
                onChange={(e) =>
                  setDoctorForm((p) => ({ ...p, registrationNumber: e.target.value }))
                }
                className="mt-1.5 w-full min-h-[42px] rounded-xl border border-slate-200 bg-white px-3.5 font-mono text-sm text-[#0B192C]"
              />
            </div>

            <div>
              <label htmlFor="set-doc-exp" className="block text-xs font-semibold text-slate-700">
                Years of experience
              </label>
              <input
                id="set-doc-exp"
                type="number"
                min={0}
                max={80}
                value={doctorForm.experience}
                onChange={(e) =>
                  setDoctorForm((p) => ({ ...p, experience: Number(e.target.value) }))
                }
                className="mt-1.5 w-full min-h-[42px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C] tabular-nums"
              />
            </div>

            <div>
              <label
                htmlFor="set-doc-timings"
                className="block text-xs font-semibold text-slate-700"
              >
                Consultation timings
              </label>
              <input
                id="set-doc-timings"
                type="text"
                value={doctorForm.consultationTimings}
                onChange={(e) =>
                  setDoctorForm((p) => ({ ...p, consultationTimings: e.target.value }))
                }
                placeholder="e.g., Mon–Sat · 9:30 AM – 1:30 PM, 5:00 PM – 8:00 PM"
                className="mt-1.5 w-full min-h-[42px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C]"
              />
            </div>
          </div>

          <div className="flex justify-end border-t border-slate-200/70 pt-5">
            <button
              type="submit"
              disabled={savingDoctor || uploadingPhoto}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-2.5 text-sm font-semibold text-[#0B192C] hover:bg-slate-50 disabled:opacity-60 cursor-pointer"
            >
              {savingDoctor && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Update Doctor Profile
            </button>
          </div>
        </form>
      </div>

      {/* Confirmation Dialog for Joining Code Actions */}
      {confirmAction && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget && !codeBusy) setConfirmAction(null);
          }}
        >
          <div className="w-full max-w-md rounded-3xl bg-white p-6 sm:p-7 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3 text-[#0B192C]">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700 border border-amber-200">
                <ShieldAlert className="h-5 w-5" aria-hidden="true" />
              </div>
              <h2 className="font-display text-lg font-bold">
                {confirmAction === 'regenerate'
                  ? 'Regenerate clinic joining code?'
                  : 'Revoke clinic joining code?'}
              </h2>
            </div>

            <p className="text-sm leading-relaxed text-slate-600">
              {confirmAction === 'regenerate'
                ? 'Your previous joining code will immediately become inactive and cannot be used by new staff. Existing clinic members are not affected.'
                : 'Revoking the joining code prevents any new staff from finding or requesting access to your clinic until you generate a new code.'}
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={codeBusy}
                onClick={() => setConfirmAction(null)}
                className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={codeBusy}
                onClick={handleConfirmCodeAction}
                className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white cursor-pointer ${
                  confirmAction === 'revoke'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-[#0B192C] hover:bg-slate-800'
                }`}
              >
                {codeBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                {confirmAction === 'regenerate' ? 'Yes, Regenerate Code' : 'Yes, Revoke Code'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShellLayout>
  );
}
