import { History } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AppShellLayout } from '../components/AppShellLayout';
import { ReceptionQueueSection } from '../components/ReceptionQueueSection';
import { useAuth } from '../context/AuthContext';
import {
  DEFAULT_CLINIC_TIMEZONE,
  formatQueueTime,
  getClinicQueueDate,
  subscribeToQueueAuditLogs,
  type QueueAuditLogRecord,
} from '../lib/queueService';

export function ReceptionQueuePage() {
  const { clinic } = useAuth();
  const timezone = clinic?.timezone || DEFAULT_CLINIC_TIMEZONE;
  const queueDate = getClinicQueueDate(timezone);
  const [auditLogs, setAuditLogs] = useState<QueueAuditLogRecord[]>([]);

  useEffect(() => {
    if (!clinic) return;
    const unsub = subscribeToQueueAuditLogs(clinic.id, queueDate, setAuditLogs);
    return () => unsub();
  }, [clinic, queueDate]);

  return (
    <AppShellLayout breadcrumb="Live Queue">
      <div className="space-y-8">
        <ReceptionQueueSection />

        <section className="lucid-glass-subtle rounded-3xl p-6 space-y-4">
          <h2 className="flex items-center gap-2 font-display text-base font-bold text-[#0B192C]">
            <History className="h-4 w-4 text-sky-700" aria-hidden="true" />
            Today&rsquo;s Queue Activity Log
          </h2>
          {auditLogs.length === 0 ? (
            <p className="text-xs text-slate-500">
              Queue check-ins and live doctor updates will appear here automatically.
            </p>
          ) : (
            <div className="divide-y divide-slate-200/70 text-xs">
              {auditLogs.slice(0, 20).map((log) => (
                <div
                  key={log.id}
                  className="py-2.5 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium text-[#0B192C]">
                      {log.summary} · <span className="text-slate-600">{log.actorName}</span> (
                      {log.actorRole})
                    </p>
                    {log.reason && (
                      <p className="text-[11px] text-slate-500">Note: {log.reason}</p>
                    )}
                  </div>
                  <span className="text-slate-500 tabular-nums shrink-0">
                    {formatQueueTime(log.createdAt, timezone)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShellLayout>
  );
}
