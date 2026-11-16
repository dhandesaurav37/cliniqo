import type { FirestoreErrorInfo } from './firebase';

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function tryParseFirestoreErrorInfo(raw: string): FirestoreErrorInfo | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (
      isRecord(parsed) &&
      typeof parsed.error === 'string' &&
      typeof parsed.operationType === 'string' &&
      'authInfo' in parsed
    ) {
      return parsed as unknown as FirestoreErrorInfo;
    }
  } catch {
    return null;
  }
  return null;
}

function mapRawMessageToFriendly(raw: string, fallback: string): string {
  const lower = raw.toLowerCase();

  if (
    lower.includes('missing or insufficient permissions') ||
    lower.includes('permission-denied') ||
    lower.includes('permission denied')
  ) {
    return 'You do not have permission to perform this action, or your clinic access may have changed.';
  }

  if (lower.includes('requires an index') || lower.includes('failed-precondition')) {
    return 'This view is still being indexed. Please retry in a moment or contact clinic support.';
  }

  if (
    lower.includes('the client is offline') ||
    lower.includes('unavailable') ||
    lower.includes('network-request-failed') ||
    lower.includes('failed to fetch')
  ) {
    return 'Unable to reach the server. Please check your internet connection and try again.';
  }

  if (lower.includes('deadline-exceeded') || lower.includes('timeout')) {
    return 'The request took too long to complete. Please try again.';
  }

  if (lower.includes('resource-exhausted') || lower.includes('quota exceeded') || lower.includes('too-many-requests')) {
    return 'Too many requests right now. Please wait a moment and try again.';
  }

  if (lower.includes('unauthenticated') || lower.includes('auth/user-token-expired')) {
    return 'Your session has expired. Please sign in again.';
  }

  if (lower.includes('auth/invalid-credential') || lower.includes('auth/wrong-password') || lower.includes('auth/user-not-found')) {
    return 'Invalid email address or password. Please verify your credentials.';
  }

  if (lower.includes('auth/email-already-in-use')) {
    return 'An account with this email address already exists.';
  }

  if (lower.includes('auth/weak-password')) {
    return 'Password is too weak. Please choose a stronger password.';
  }

  if (lower.includes('not-found')) {
    return 'The requested record could not be found. It may have been updated or removed.';
  }

  if (lower.includes('already-exists')) {
    return 'This slot or record already exists. Please refresh and choose another option.';
  }

  // Never leak Firebase SDK prefixes or JSON payloads into user-facing alerts
  if (raw.startsWith('FirebaseError:') || raw.startsWith('Firebase:') || raw.includes('"authInfo"')) {
    return fallback;
  }

  // Preserve intentional, concise domain validation messages (e.g., from service classes)
  if (raw.length > 0 && raw.length <= 240 && !raw.includes('\n    at ')) {
    return raw;
  }

  return fallback;
}

/**
 * Converts any thrown error—including serialized FirestoreErrorInfo JSON thrown
 * by handleFirestoreError—into a calm, user-friendly message without exposing
 * UIDs, emails, collection paths, or stack traces in the UI.
 */
export function getUserFriendlyErrorMessage(
  error: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  if (!error) return fallback;

  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string'
          ? (error as { message: string }).message
          : '';

  if (!rawMessage.trim()) return fallback;

  const parsedInfo = tryParseFirestoreErrorInfo(rawMessage);
  if (parsedInfo) {
    return mapRawMessageToFriendly(parsedInfo.error, fallback);
  }

  return mapRawMessageToFriendly(rawMessage.trim(), fallback);
}
