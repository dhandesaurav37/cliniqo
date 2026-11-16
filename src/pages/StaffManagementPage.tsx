import {
  Check,
  CheckCircle2,
  Clock,
  Copy,
  History,
  Loader2,
  RefreshCw,
  ShieldAlert,
  UserCheck,
  UserX,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { AppShellLayout } from '../components/AppShellLayout';
import { useAuth } from '../context/AuthContext';
import {
  approveJoinRequest,
  fetchClinicStaffWorkspace,
  regenerateJoiningCode,
  rejectJoinRequest,
  revokeJoiningCode,
  revokeStaffMembership,
  type ClinicJoinRequestRecord,
  type ClinicMembershipRecord,
  type StaffAuditLogRecord,
} from '../lib/clinicService';
import { getUserFriendlyErrorMessage } from '../lib/errorUtils';

type ConfirmState =
  | { kind: 'approve'; request: ClinicJoinRequestRecord }
  | { kind: 'reject'; request: ClinicJoinRequestRecord }
  | { kind: 'revoke_staff'; membership: ClinicMembershipRecord }
  | { kind: 'regenerate_code' }
  | { kind: 'revoke_code' }
  | null;

export function StaffManagementPage() {
  const { user, clinic, profile, refreshWorkspace } = useAuth();

  const [joinRequests, setJoinRequests] = useState<ClinicJoinRequestRecord[]>([]);
  const [memberships, setMemberships] = useState<ClinicMembershipRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<StaffAuditLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStaffData = useCallback(async () => {
    if (!clinic || !user) return;
    setLoading(true);
    try {
      const data = await fetchClinicStaffWorkspace(clinic.id, user.uid);
      setJoinRequests(data.joinRequests);
      setMemberships(data.memberships);
      setAuditLogs(data.auditLogs);
    } catch (err: unknown) {
      setError(getUserFriendlyErrorMessage(err, 'Unable to load clinic staff records.'));
    } finally {
      setLoading(false);
    }
  }, [clinic, user]);

  useEffect(() => {
    void loadStaffData();
  }, [loadStaffData]);

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

  const handleConfirm = async () => {
    if (!confirmState || !clinic || !user) return;
    setError(null);
    setFeedback(null);
    setBusy(true);
    try {
      if (confirmState.kind === 'approve') {
        await approveJoinRequest({
          request: confirmState.request,
          reviewerUid: user.uid,
        });
        setFeedback(`${confirmState.request.applicantName} has been approved as Receptionist.`);
      } else if (confirmState.kind === 'reject') {
        await rejectJoinRequest({
          request: confirmState.request,
          reviewerUid: user.uid,
        });
        setFeedback(`Request from ${confirmState.request.applicantName} has been declined.`);
      } else if (confirmState.kind === 'revoke_staff') {
        await revokeStaffMembership({
          membership: confirmState.membership,
          clinicName: clinic.name,
          actorUid: user.uid,
        });
        setFeedback(
          `Revoked clinic access for ${confirmState.membership.memberName || confirmState.membership.memberEmail || 'staff member'}.`,
        );
      } else if (confirmState.kind === 'regenerate_code') {
        const nextCode = await regenerateJoiningCode(clinic.id, user.uid);
        await refreshWorkspace();
        setFeedback(`Generated new joining code: ${nextCode}`);
      } else if (confirmState.kind === 'revoke_code') {
        await revokeJoiningCode(clinic.id);
        await refreshWorkspace();
        setFeedback('Clinic joining code has been revoked.');
      }

      setConfirmState(null);
      await loadStaffData();
    } catch (err: unknown) {
      setError(getUserFriendlyErrorMessage(err, 'Could not complete staff action.'));
    } finally {
      setBusy(false);
    }
  };

  const pendingRequests = joinRequests.filter((r) => r.status === 'pending');
  const rejectedRequests = joinRequests.filter((r) => r.status === 'rejected');
  const activeStaff = memberships.filter((m) => m.status === 'active' && m.role !== 'owner');
  const revokedStaff = memberships.filter((m) => m.status === 'revoked');

  const formatDate = (ts?: { toDate: () => Date } | null) =>
    ts
      ? ts.toDate().toLocaleString('en-IN', {
          dateStyle: 'medium',
          timeStyle: 'short',
        })
      : '—';

  return (
    <AppShellLayout breadcrumb="Staff Management">
      <div className="space-y-8">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#0B192C]">
            Staff Management
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Invite receptionists with your clinic joining code, review pending access requests, and
            manage active staff permissions.
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

        {/* Section 1: Clinic Joining Code */}
        <section className="lucid-glass rounded-3xl p-6 sm:p-8 space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-lg font-bold text-[#0B192C]">
                Clinic Joining Code
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Share this code with your receptionist so they can locate your clinic and submit an
                access request.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmState({ kind: 'regenerate_code' })}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-[#0B192C] hover:bg-slate-50 cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5 text-sky-700" aria-hidden="true" />
                {clinic?.joiningCodeActive ? 'Regenerate Code' : 'Generate New Code'}
              </button>
              {clinic?.joiningCodeActive && (
                <button
                  type="button"
                  onClick={() => setConfirmState({ kind: 'revoke_code' })}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 cursor-pointer"
                >
                  Revoke Code
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-200/80 bg-sky-50/65 px-5 py-4">
            <span className="font-mono text-xl font-bold tracking-wider text-[#0B192C] tabular-nums">
              {clinic?.joiningCodeActive && clinic.joiningCode
                ? clinic.joiningCode
                : 'No active joining code (Revoked)'}
            </span>
            {clinic?.joiningCodeActive && clinic.joiningCode && (
              <button
                type="button"
                onClick={handleCopyCode}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-sky-200 bg-white px-3.5 text-xs font-semibold text-sky-800 hover:bg-sky-50 cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    Copy Code
                  </>
                )}
              </button>
            )}
          </div>
        </section>

        {/* Section 2: Pending Access Requests */}
        <section className="lucid-glass rounded-3xl p-6 sm:p-8 space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-lg font-bold text-[#0B192C]">
                Pending Access Requests ({pendingRequests.length})
              </h2>
              <p className="mt-0.5 text-xs text-slate-600">
                Approve or decline staff members who requested to join {clinic?.name}.
              </p>
            </div>
            {loading && <Loader2 className="h-4 w-4 animate-spin text-sky-600" aria-hidden="true" />}
          </div>

          {!loading && pendingRequests.length === 0 ? (
            <div className="rounded-2xl border border-slate-200/80 bg-white/75 px-5 py-8 text-center text-sm text-slate-500">
              No pending joining requests right now.
            </div>
          ) : (
            <div className="space-y-3">
              {pendingRequests.map((req) => (
                <div
                  key={req.id}
                  className="flex flex-col gap-4 rounded-2xl border border-amber-200/80 bg-white/90 p-5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-amber-600 shrink-0" aria-hidden="true" />
                      <h3 className="font-display text-base font-bold text-[#0B192C]">
                        {req.applicantName}
                      </h3>
                      <span className="text-xs font-medium text-slate-500">· Receptionist</span>
                    </div>
                    <p className="text-xs text-slate-600">
                      {req.applicantEmail} · {req.applicantMobile}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Requested {formatDate(req.requestedAt)}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setConfirmState({ kind: 'reject', request: req })}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-4 text-xs font-semibold text-rose-700 hover:bg-rose-100 cursor-pointer"
                    >
                      <UserX className="h-3.5 w-3.5" aria-hidden="true" />
                      Reject
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmState({ kind: 'approve', request: req })}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#0284C7] to-[#0891B2] px-4 text-xs font-semibold text-white shadow-sm hover:brightness-105 cursor-pointer"
                    >
                      <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
                      Approve
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Section 3: Approved / Active Staff */}
        <section className="lucid-glass rounded-3xl p-6 sm:p-8 space-y-5">
          <div>
            <h2 className="font-display text-lg font-bold text-[#0B192C]">
              Active Clinic Team ({activeStaff.length + 1})
            </h2>
            <p className="mt-0.5 text-xs text-slate-600">
              Current members with access to this clinic workspace.
            </p>
          </div>

          <div className="space-y-3">
            {/* Owner Card */}
            <div className="flex flex-col gap-2 rounded-2xl border border-slate-200/80 bg-white/85 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-display text-sm font-bold text-[#0B192C]">
                  {profile?.fullName || 'Clinic Owner'}
                </p>
                <p className="text-xs text-slate-600">
                  {profile?.email} · Clinic Owner &amp; Doctor
                </p>
              </div>
              <span className="text-xs font-semibold text-emerald-700">Active Owner</span>
            </div>

            {activeStaff.map((member) => (
              <div
                key={member.id}
                className="flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white/90 p-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-1">
                  <p className="font-display text-sm font-bold text-[#0B192C]">
                    {member.memberName || member.memberEmail || 'Receptionist'}
                  </p>
                  <p className="text-xs text-slate-600">
                    {member.memberEmail} · {member.memberMobile || 'No phone'} · Receptionist
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Approved {formatDate(member.joinedAt)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmState({ kind: 'revoke_staff', membership: member })}
                  className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-4 text-xs font-semibold text-rose-700 hover:bg-rose-100 cursor-pointer shrink-0"
                >
                  Revoke Access
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Section 4: Rejected & Revoked History + Audit Log */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="lucid-glass-subtle rounded-3xl p-6 space-y-4">
            <h2 className="font-display text-base font-bold text-[#0B192C]">
              Declined &amp; Revoked Staff
            </h2>
            {rejectedRequests.length === 0 && revokedStaff.length === 0 ? (
              <p className="text-xs text-slate-500">No declined requests or revoked staff.</p>
            ) : (
              <div className="space-y-2.5 text-xs">
                {revokedStaff.map((m) => (
                  <div
                    key={m.id}
                    className="rounded-xl border border-slate-200/80 bg-white/80 px-4 py-3 flex items-center justify-between gap-2"
                  >
                    <div>
                      <p className="font-semibold text-[#0B192C]">
                        {m.memberName || m.memberEmail}
                      </p>
                      <p className="text-slate-500">Revoked {formatDate(m.revokedAt)}</p>
                    </div>
                    <span className="font-semibold text-rose-700">Revoked</span>
                  </div>
                ))}
                {rejectedRequests.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-xl border border-slate-200/80 bg-white/80 px-4 py-3 flex items-center justify-between gap-2"
                  >
                    <div>
                      <p className="font-semibold text-[#0B192C]">{r.applicantName}</p>
                      <p className="text-slate-500">Declined {formatDate(r.reviewedAt)}</p>
                    </div>
                    <span className="font-semibold text-slate-600">Rejected</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="lucid-glass-subtle rounded-3xl p-6 space-y-4">
            <h2 className="flex items-center gap-2 font-display text-base font-bold text-[#0B192C]">
              <History className="h-4 w-4 text-sky-700" aria-hidden="true" />
              Staff Audit Log
            </h2>
            {auditLogs.length === 0 ? (
              <p className="text-xs text-slate-500">No staff approval or revocation actions yet.</p>
            ) : (
              <div className="space-y-2.5 text-xs max-h-64 overflow-y-auto pr-1">
                {auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="rounded-xl border border-slate-200/80 bg-white/80 px-4 py-3 flex items-center justify-between gap-2"
                  >
                    <div>
                      <p className="font-semibold text-[#0B192C]">{log.targetName}</p>
                      <p className="text-slate-500">{formatDate(log.createdAt)}</p>
                    </div>
                    <span className="font-medium text-slate-700">
                      {log.action === 'approved_receptionist'
                        ? 'Approved'
                        : log.action === 'rejected_request'
                          ? 'Rejected'
                          : 'Revoked'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Confirmation Dialog */}
      {confirmState && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setConfirmState(null);
          }}
        >
          <div className="w-full max-w-md rounded-3xl bg-white p-6 sm:p-7 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3 text-[#0B192C]">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700 border border-amber-200">
                <ShieldAlert className="h-5 w-5" aria-hidden="true" />
              </div>
              <h2 className="font-display text-lg font-bold">
                {confirmState.kind === 'approve' && 'Approve receptionist access?'}
                {confirmState.kind === 'reject' && 'Decline joining request?'}
                {confirmState.kind === 'revoke_staff' && 'Revoke receptionist access?'}
                {confirmState.kind === 'regenerate_code' && 'Regenerate clinic joining code?'}
                {confirmState.kind === 'revoke_code' && 'Revoke clinic joining code?'}
              </h2>
            </div>

            <p className="text-sm leading-relaxed text-slate-600">
              {confirmState.kind === 'approve' &&
                `${confirmState.request.applicantName} (${confirmState.request.applicantEmail}) will be granted receptionist access to ${clinic?.name}.`}
              {confirmState.kind === 'reject' &&
                `${confirmState.request.applicantName}'s request will be declined and they will not gain access to your clinic.`}
              {confirmState.kind === 'revoke_staff' &&
                `${confirmState.membership.memberName || confirmState.membership.memberEmail} will immediately lose access to ${clinic?.name}. Existing clinic records remain intact.`}
              {confirmState.kind === 'regenerate_code' &&
                'Your previous joining code will become inactive for new requests. Existing approved clinic staff are unaffected.'}
              {confirmState.kind === 'revoke_code' &&
                'Revoking the joining code prevents any new staff from finding or requesting access to your clinic until a new code is generated.'}
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmState(null)}
                className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleConfirm}
                className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white cursor-pointer ${
                  confirmState.kind === 'approve'
                    ? 'bg-gradient-to-r from-[#0284C7] to-[#0891B2] hover:brightness-105'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                {confirmState.kind === 'approve' && 'Confirm Approval'}
                {confirmState.kind === 'reject' && 'Decline Request'}
                {confirmState.kind === 'revoke_staff' && 'Revoke Access'}
                {confirmState.kind === 'regenerate_code' && 'Yes, Regenerate'}
                {confirmState.kind === 'revoke_code' && 'Yes, Revoke Code'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShellLayout>
  );
}
