import type { QueryDocumentSnapshot } from 'firebase/firestore';
import {
  ArrowUpDown,
  CheckCircle2,
  ChevronRight,
  Eye,
  ListPlus,
  Loader2,
  Pencil,
  Search,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AppShellLayout } from '../components/AppShellLayout';
import { useAuth } from '../context/AuthContext';
import { getUserFriendlyErrorMessage } from '../lib/errorUtils';
import {
  fetchPatientStats,
  queryPatientsPage,
  type PatientRecord,
} from '../lib/patientService';
import {
  addPatientToTodayQueue,
  DEFAULT_CLINIC_TIMEZONE,
  getClinicQueueDate,
  subscribeToDailyQueue,
  type DailyQueueEntryRecord,
} from '../lib/queueService';

const PAGE_SIZE = 15;

function formatRegDate(patient: PatientRecord): string {
  const ts = patient.registrationDate || patient.createdAt;
  if (!ts) return '—';
  return ts.toDate().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatGender(gender: PatientRecord['gender']): string {
  if (!gender) return '—';
  if (gender === 'male') return 'Male';
  if (gender === 'female') return 'Female';
  return 'Other';
}

export function PatientsPage() {
  const { user, clinic, profile, membership } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const isReceptionist = membership?.role === 'receptionist';
  const queuePath = isReceptionist ? '/app/reception/queue' : '/app/doctor/queue';
  const timezone = clinic?.timezone || DEFAULT_CLINIC_TIMEZONE;
  const queueDate = getClinicQueueDate(timezone);

  const [totalActive, setTotalActive] = useState<number>(0);
  const [recentPatients, setRecentPatients] = useState<PatientRecord[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);

  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived'>('active');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [queueEntries, setQueueEntries] = useState<DailyQueueEntryRecord[]>([]);
  const [addingQueueId, setAddingQueueId] = useState<string | null>(null);
  const [queueFeedback, setQueueFeedback] = useState<{
    patientName: string;
    tokenLabel: string;
  } | null>(null);

  useEffect(() => {
    if (searchParams.get('focus') === 'search') {
      const timer = window.setTimeout(() => {
        searchInputRef.current?.focus();
      }, 80);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [searchParams]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 220);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!clinic) return;
    let active = true;
    setStatsLoading(true);
    fetchPatientStats(clinic.id)
      .then((res) => {
        if (!active) return;
        setTotalActive(res.totalActive);
        setRecentPatients(res.recentPatients);
      })
      .catch((err) => {
        if (!active) return;
        setError(getUserFriendlyErrorMessage(err, 'Unable to load patient summary.'));
      })
      .finally(() => {
        if (active) setStatsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [clinic]);

  const loadFirstPage = useCallback(async () => {
    if (!clinic) return;
    setError(null);
    setListLoading(true);
    try {
      const res = await queryPatientsPage(clinic.id, {
        searchText: debouncedSearch,
        sortOrder,
        dateFrom,
        dateTo,
        statusFilter,
        pageSize: PAGE_SIZE,
      });
      setPatients(res.patients);
      setLastDoc(res.lastDoc);
      setHasMore(res.hasMore);
    } catch (err: unknown) {
      setError(getUserFriendlyErrorMessage(err, 'Unable to load patients.'));
    } finally {
      setListLoading(false);
    }
  }, [clinic, debouncedSearch, sortOrder, dateFrom, dateTo, statusFilter]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  useEffect(() => {
    if (!clinic) return;
    const unsub = subscribeToDailyQueue(clinic.id, queueDate, setQueueEntries);
    return () => unsub();
  }, [clinic, queueDate]);

  const activeQueueByPatientDocId = useMemo(() => {
    const map = new Map<string, DailyQueueEntryRecord>();
    queueEntries.forEach((entry) => {
      if (['waiting', 'called', 'in_consultation', 'on_hold'].includes(entry.status)) {
        map.set(entry.patientDocumentId, entry);
      }
    });
    return map;
  }, [queueEntries]);

  const handleAddToQueue = async (patient: PatientRecord) => {
    if (!clinic || !user || !membership) return;
    setAddingQueueId(patient.id);
    setError(null);
    setQueueFeedback(null);
    try {
      const res = await addPatientToTodayQueue({
        clinicId: clinic.id,
        clinicOwnerId: clinic.ownerId,
        timezone: clinic.timezone,
        patient,
        actorUid: user.uid,
        actorName: profile?.fullName || user.displayName || 'Clinic Staff',
        actorRole: membership.role,
      });
      setQueueFeedback({ patientName: patient.fullName, tokenLabel: res.tokenLabel });
    } catch (err: unknown) {
      setError(getUserFriendlyErrorMessage(err, 'Unable to add patient to queue.'));
    } finally {
      setAddingQueueId(null);
    }
  };

  const handleLoadMore = async () => {
    if (!clinic || !lastDoc || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await queryPatientsPage(clinic.id, {
        sortOrder,
        dateFrom,
        dateTo,
        statusFilter,
        pageSize: PAGE_SIZE,
        cursor: lastDoc,
      });
      setPatients((prev) => [...prev, ...res.patients]);
      setLastDoc(res.lastDoc);
      setHasMore(res.hasMore);
    } catch (err: unknown) {
      setError(getUserFriendlyErrorMessage(err, 'Unable to load more patients.'));
    } finally {
      setLoadingMore(false);
    }
  };

  const clearFilters = () => {
    setSearchInput('');
    setDebouncedSearch('');
    setDateFrom('');
    setDateTo('');
    setSortOrder('newest');
    setStatusFilter('active');
  };

  const hasActiveFilters = Boolean(
    debouncedSearch || dateFrom || dateTo || statusFilter !== 'active',
  );

  return (
    <AppShellLayout breadcrumb="Patients">
      <div className="space-y-7">
        {/* Top Header & Primary Action */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#0B192C]">
              Patients
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Register new patients, search records by name, mobile, or ID, and view patient
              profiles.
            </p>
          </div>

          <Link
            to="/app/patients/new"
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0284C7] to-[#0891B2] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_-8px_rgba(2,132,199,0.5)] hover:brightness-105 whitespace-nowrap shrink-0"
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Add Patient
          </Link>
        </div>

        {/* Summary & Recently Registered */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <div className="lg:col-span-4 lucid-glass rounded-2xl p-6 flex flex-col justify-between gap-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500">Total Registered Patients</p>
              <Users className="h-4 w-4 text-sky-600" aria-hidden="true" />
            </div>
            <div>
              {statsLoading ? (
                <div className="h-9 w-24 rounded-lg bg-slate-200/70" />
              ) : (
                <p className="font-display text-3xl font-bold text-[#0B192C] tabular-nums">
                  {totalActive.toLocaleString('en-IN')}
                </p>
              )}
              <p className="mt-1 text-xs text-slate-500">
                Active patient records in {clinic?.name}
              </p>
            </div>
          </div>

          <div className="lg:col-span-8 lucid-glass rounded-2xl p-6 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500">Recently Registered Patients</p>
              <Link
                to="/app/patients/new"
                className="text-xs font-semibold text-sky-700 hover:underline whitespace-nowrap"
              >
                Quick Register &rarr;
              </Link>
            </div>

            {statsLoading ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="h-12 rounded-xl bg-slate-100" />
                <div className="h-12 rounded-xl bg-slate-100" />
              </div>
            ) : recentPatients.length === 0 ? (
              <p className="py-2 text-xs text-slate-500">
                No patients registered yet. Click &ldquo;Add Patient&rdquo; to register your first
                patient.
              </p>
            ) : (
              <div className="divide-y divide-slate-200/70">
                {recentPatients.slice(0, 3).map((patient) => (
                  <button
                    key={patient.id}
                    type="button"
                    onClick={() => navigate(`/app/patients/${patient.patientId}`)}
                    className="flex w-full items-center justify-between gap-3 py-2.5 text-left hover:bg-sky-50/50 rounded-lg px-2 -mx-2 transition-colors cursor-pointer"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#0B192C] truncate">
                        {patient.fullName}
                      </p>
                      <p className="text-xs text-slate-500 tabular-nums truncate">
                        <span className="font-mono text-sky-800">{patient.patientId}</span>
                        <span className="mx-1.5" aria-hidden="true">
                          ·
                        </span>
                        <span>{patient.mobile}</span>
                        <span className="mx-1.5" aria-hidden="true">
                          ·
                        </span>
                        <span>{formatRegDate(patient)}</span>
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" aria-hidden="true" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <section className="lucid-glass rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
            <div className="lg:col-span-5 relative">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
                aria-hidden="true"
              />
              <input
                ref={searchInputRef}
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                aria-label="Search patients by name, mobile number, or patient ID"
                placeholder="Search by name, mobile, or PAT-2026-0001..."
                className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-white pl-10 pr-9 text-sm text-[#0B192C] placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput('')}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="lg:col-span-4 grid grid-cols-2 gap-2.5">
              <div>
                <label htmlFor="filter-from" className="sr-only">
                  From registration date
                </label>
                <input
                  id="filter-from"
                  type="date"
                  value={dateFrom}
                  disabled={Boolean(debouncedSearch)}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 text-xs text-[#0B192C] disabled:bg-slate-50 disabled:text-slate-400"
                />
              </div>
              <div>
                <label htmlFor="filter-to" className="sr-only">
                  To registration date
                </label>
                <input
                  id="filter-to"
                  type="date"
                  value={dateTo}
                  disabled={Boolean(debouncedSearch)}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 text-xs text-[#0B192C] disabled:bg-slate-50 disabled:text-slate-400"
                />
              </div>
            </div>

            <div className="lg:col-span-3 flex items-center gap-2 justify-between sm:justify-end">
              <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setStatusFilter('active')}
                  className={`min-h-[34px] rounded-lg px-3 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    statusFilter === 'active'
                      ? 'bg-white text-[#0B192C] shadow-sm'
                      : 'text-slate-600 hover:text-[#0B192C]'
                  }`}
                >
                  Active
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('archived')}
                  className={`min-h-[34px] rounded-lg px-3 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    statusFilter === 'archived'
                      ? 'bg-white text-[#0B192C] shadow-sm'
                      : 'text-slate-600 hover:text-[#0B192C]'
                  }`}
                >
                  Archived
                </button>
              </div>

              <button
                type="button"
                disabled={Boolean(debouncedSearch)}
                onClick={() => setSortOrder((prev) => (prev === 'newest' ? 'oldest' : 'newest'))}
                className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-[#0B192C] hover:bg-slate-50 disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
              >
                <ArrowUpDown className="h-3.5 w-3.5 text-sky-700" aria-hidden="true" />
                {sortOrder === 'newest' ? 'Newest' : 'Oldest'}
              </button>
            </div>
          </div>

          {hasActiveFilters && (
            <div className="flex items-center justify-between border-t border-slate-200/70 pt-3 text-xs text-slate-600">
              <span>
                {debouncedSearch
                  ? `Showing search matches for "${debouncedSearch}"`
                  : 'Filtered patient list'}
              </span>
              <button
                type="button"
                onClick={clearFilters}
                className="font-semibold text-sky-700 hover:underline cursor-pointer"
              >
                Clear Filters
              </button>
            </div>
          )}
        </section>

        {queueFeedback && (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-900"
          >
            <div className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
              <span>
                Added <strong>{queueFeedback.patientName}</strong> to today&rsquo;s queue — Token{' '}
                <span className="font-mono font-bold tabular-nums">#{queueFeedback.tokenLabel}</span>
              </span>
            </div>
            <Link to={queuePath} className="text-xs font-semibold text-sky-800 hover:underline">
              Open Live Queue &rarr;
            </Link>
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

        {/* Patient List: Responsive Table (Desktop) + Compact Cards (Mobile) */}
        <section className="lucid-glass rounded-2xl overflow-hidden">
          {listLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4].map((row) => (
                <div key={row} className="h-11 rounded-xl bg-slate-100/90" />
              ))}
            </div>
          ) : patients.length === 0 ? (
            <div className="px-6 py-14 text-center space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-700 border border-sky-200/70">
                <Users className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <h2 className="font-display text-lg font-bold text-[#0B192C]">
                  {hasActiveFilters ? 'No matching patients found' : 'No patients registered yet'}
                </h2>
                <p className="text-sm text-slate-600 max-w-md mx-auto">
                  {hasActiveFilters
                    ? 'Try adjusting your search query, date range, or active status filter.'
                    : 'Register your clinic patients in under a minute to generate unique patient IDs.'}
                </p>
              </div>
              {hasActiveFilters ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex min-h-[42px] items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-[#0B192C] hover:bg-slate-50 cursor-pointer"
                >
                  Clear Search &amp; Filters
                </button>
              ) : (
                <Link
                  to="/app/patients/new"
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0284C7] to-[#0891B2] px-5 text-sm font-semibold text-white shadow-sm hover:brightness-105"
                >
                  <UserPlus className="h-4 w-4" aria-hidden="true" />
                  Add First Patient
                </Link>
              )}
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200/80 bg-white/50 text-xs font-semibold text-slate-500">
                      <th className="py-3.5 pl-6 pr-4">Patient ID</th>
                      <th className="py-3.5 px-4">Patient Name</th>
                      <th className="py-3.5 px-4">Mobile Number</th>
                      <th className="py-3.5 px-4">Age</th>
                      <th className="py-3.5 px-4">Gender</th>
                      <th className="py-3.5 px-4">Registration Date</th>
                      <th className="py-3.5 pl-4 pr-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/70 text-sm">
                    {patients.map((patient) => {
                      const activeQueue = activeQueueByPatientDocId.get(patient.id);
                      const isAdding = addingQueueId === patient.id;
                      return (
                      <tr
                        key={patient.id}
                        className="hover:bg-sky-50/45 transition-colors"
                      >
                        <td className="py-3.5 pl-6 pr-4 font-mono text-xs font-semibold text-sky-800 tabular-nums whitespace-nowrap">
                          {patient.patientId}
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-[#0B192C]">
                          <Link
                            to={`/app/patients/${patient.patientId}`}
                            className="hover:text-sky-700 hover:underline"
                          >
                            {patient.fullName}
                          </Link>
                        </td>
                        <td className="py-3.5 px-4 text-slate-700 tabular-nums whitespace-nowrap">
                          {patient.mobile}
                        </td>
                        <td className="py-3.5 px-4 text-slate-700 tabular-nums whitespace-nowrap">
                          {patient.age !== null && patient.age !== undefined
                            ? `${patient.age} yrs`
                            : '—'}
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                          {formatGender(patient.gender)}
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 tabular-nums whitespace-nowrap">
                          {formatRegDate(patient)}
                        </td>
                        <td className="py-3.5 pl-4 pr-6 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            {patient.status === 'active' && (
                              activeQueue ? (
                                <Link
                                  to={queuePath}
                                  className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-800 tabular-nums hover:bg-emerald-100"
                                >
                                  Token #{activeQueue.tokenLabel}
                                </Link>
                              ) : (
                                <button
                                  type="button"
                                  disabled={Boolean(addingQueueId)}
                                  onClick={() => void handleAddToQueue(patient)}
                                  className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-gradient-to-r from-[#0284C7] to-[#0891B2] px-2.5 text-xs font-semibold text-white hover:brightness-105 disabled:opacity-60 cursor-pointer"
                                >
                                  {isAdding ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                                  ) : (
                                    <ListPlus className="h-3.5 w-3.5" aria-hidden="true" />
                                  )}
                                  Add to Today&rsquo;s Queue
                                </button>
                              )
                            )}
                            <Link
                              to={`/app/patients/${patient.patientId}`}
                              className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-[#0B192C] hover:bg-slate-50"
                            >
                              <Eye className="h-3.5 w-3.5 text-sky-700" aria-hidden="true" />
                              View
                            </Link>
                            <Link
                              to={`/app/patients/${patient.patientId}/edit`}
                              className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                              Edit
                            </Link>
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Compact Cards */}
              <div className="md:hidden divide-y divide-slate-200/70">
                {patients.map((patient) => {
                  const activeQueue = activeQueueByPatientDocId.get(patient.id);
                  const isAdding = addingQueueId === patient.id;
                  return (
                  <div key={patient.id} className="p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          to={`/app/patients/${patient.patientId}`}
                          className="font-display text-base font-bold text-[#0B192C] hover:underline block truncate"
                        >
                          {patient.fullName}
                        </Link>
                        <p className="mt-0.5 font-mono text-xs font-semibold text-sky-800 tabular-nums">
                          {patient.patientId}
                        </p>
                      </div>
                      <span className="text-xs text-slate-500 tabular-nums shrink-0">
                        {formatRegDate(patient)}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 tabular-nums">
                      <span>{patient.mobile}</span>
                      <span className="mx-1.5" aria-hidden="true">
                        ·
                      </span>
                      <span>
                        {patient.age !== null && patient.age !== undefined
                          ? `${patient.age} yrs`
                          : 'Age —'}
                      </span>
                      <span className="mx-1.5" aria-hidden="true">
                        ·
                      </span>
                      <span>{formatGender(patient.gender)}</span>
                    </p>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {patient.status === 'active' && (
                        activeQueue ? (
                          <Link
                            to={queuePath}
                            className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 text-xs font-semibold text-emerald-800 tabular-nums"
                          >
                            Token #{activeQueue.tokenLabel}
                          </Link>
                        ) : (
                          <button
                            type="button"
                            disabled={Boolean(addingQueueId)}
                            onClick={() => void handleAddToQueue(patient)}
                            className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#0284C7] to-[#0891B2] px-3.5 text-xs font-semibold text-white cursor-pointer disabled:opacity-60"
                          >
                            {isAdding ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                            ) : (
                              <ListPlus className="h-3.5 w-3.5" aria-hidden="true" />
                            )}
                            Add to Today&rsquo;s Queue
                          </button>
                        )
                      )}
                      <Link
                        to={`/app/patients/${patient.patientId}`}
                        className="flex-1 inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-[#0B192C]"
                      >
                        <Eye className="h-3.5 w-3.5 text-sky-700" aria-hidden="true" />
                        Profile
                      </Link>
                      <Link
                        to={`/app/patients/${patient.patientId}/edit`}
                        className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        Edit
                      </Link>
                    </div>
                  </div>
                  );
                })}
              </div>

              {hasMore && (
                <div className="border-t border-slate-200/70 p-4 text-center">
                  <button
                    type="button"
                    disabled={loadingMore}
                    onClick={handleLoadMore}
                    className="inline-flex min-h-[42px] items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-xs font-semibold text-[#0B192C] hover:bg-slate-50 disabled:opacity-60 cursor-pointer"
                  >
                    {loadingMore ? 'Loading more...' : 'Load More Patients'}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </AppShellLayout>
  );
}
