import { QUEUE_STATUS_META, type QueueStatus } from '../lib/queueService';

const ORDERED_STATUSES: QueueStatus[] = [
  'waiting',
  'called',
  'in_consultation',
  'on_hold',
  'skipped',
  'completed',
  'cancelled',
];

export function QueueStatusLabel({ status }: { status: QueueStatus }) {
  const meta = QUEUE_STATUS_META[status] || QUEUE_STATUS_META.waiting;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${meta.surfaceClass} ${meta.textClass}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${meta.markerClass}`} aria-hidden="true" />
      <span>{meta.label}</span>
    </span>
  );
}

export function QueueStatusLegend() {
  return (
    <div
      className="lucid-glass-subtle rounded-2xl px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs"
      aria-label="Queue status legend"
    >
      <span className="font-semibold text-slate-500">Status Legend:</span>
      {ORDERED_STATUSES.map((status) => {
        const meta = QUEUE_STATUS_META[status];
        return (
          <span key={status} className="inline-flex items-center gap-1.5 text-slate-700 whitespace-nowrap">
            <span className={`h-2 w-2 rounded-full ${meta.markerClass}`} aria-hidden="true" />
            <span className="font-medium">{meta.label}</span>
          </span>
        );
      })}
    </div>
  );
}
