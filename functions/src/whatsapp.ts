import { defineSecret } from 'firebase-functions/params';
import {
  verifyHmacSha256Signature,
  verifyTimingSafeSecretMatch,
} from './whatsappCrypto.js';

export const WHATSAPP_ACCESS_TOKEN = defineSecret('WHATSAPP_ACCESS_TOKEN');
export const WHATSAPP_PHONE_NUMBER_ID = defineSecret('WHATSAPP_PHONE_NUMBER_ID');
export const WHATSAPP_BUSINESS_ACCOUNT_ID = defineSecret('WHATSAPP_BUSINESS_ACCOUNT_ID');
export const WHATSAPP_WEBHOOK_VERIFY_TOKEN = defineSecret('WHATSAPP_WEBHOOK_VERIFY_TOKEN');
export const WHATSAPP_APP_SECRET = defineSecret('WHATSAPP_APP_SECRET');

export const WHATSAPP_SECRETS = [
  WHATSAPP_ACCESS_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID,
  WHATSAPP_BUSINESS_ACCOUNT_ID,
  WHATSAPP_WEBHOOK_VERIFY_TOKEN,
  WHATSAPP_APP_SECRET,
];

export type WhatsAppMessageType =
  | 'confirmation'
  | 'reminder_24h'
  | 'reminder_2h'
  | 'reschedule'
  | 'cancellation';

export interface ClinicWhatsAppTemplateConfig {
  enabled?: boolean;
  languageCode?: string;
  templateConfirmation?: string;
  templateReminder24h?: string;
  templateReminder2h?: string;
  templateReschedule?: string;
  templateCancelled?: string;
}

export interface WhatsAppDispatchResult {
  deliveryStatus: 'sent' | 'failed' | 'skipped_not_configured';
  providerMessageId: string | null;
  templateName: string;
  errorMessage: string | null;
}

export function normalizeE164Phone(rawMobile: string): string {
  const digits = String(rawMobile || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) {
    return `91${digits}`;
  }
  return digits;
}

export function extractMobileLast10(rawMobile: string): string {
  const digits = String(rawMobile || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

export function formatReadableDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const utc = new Date(Date.UTC(y, m - 1, d));
  return utc.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatReadableTime(timeStr: string): string {
  const [hh, mm] = timeStr.split(':').map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return timeStr;
  const suffix = hh >= 12 ? 'PM' : 'AM';
  const hour12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${hour12}:${String(mm).padStart(2, '0')} ${suffix}`;
}

export function resolveTemplateName(
  type: WhatsAppMessageType,
  config?: ClinicWhatsAppTemplateConfig | null,
): string {
  const fallbackMap: Record<WhatsAppMessageType, string> = {
    confirmation: 'cliniqo_appointment_confirmation',
    reminder_24h: 'cliniqo_appointment_reminder_24h',
    reminder_2h: 'cliniqo_appointment_reminder_2h',
    reschedule: 'cliniqo_appointment_rescheduled',
    cancellation: 'cliniqo_appointment_cancelled',
  };

  if (!config) return fallbackMap[type];
  if (type === 'confirmation' && config.templateConfirmation?.trim()) {
    return config.templateConfirmation.trim();
  }
  if (type === 'reminder_24h' && config.templateReminder24h?.trim()) {
    return config.templateReminder24h.trim();
  }
  if (type === 'reminder_2h' && config.templateReminder2h?.trim()) {
    return config.templateReminder2h.trim();
  }
  if (type === 'reschedule' && config.templateReschedule?.trim()) {
    return config.templateReschedule.trim();
  }
  if (type === 'cancellation' && config.templateCancelled?.trim()) {
    return config.templateCancelled.trim();
  }
  return fallbackMap[type];
}

function readSecretSafe(secret: { value: () => string }): string {
  try {
    return String(secret.value() || '').trim();
  } catch {
    return '';
  }
}

/**
 * Sends a structured, privacy-safe Meta WhatsApp Business Cloud API template message.
 * NEVER includes diagnoses, symptoms, or prescription contents.
 * NEVER fabricates a 'sent' status if the Meta Graph API does not confirm with a message ID.
 */
export async function sendWhatsAppTemplateMessage(params: {
  recipientMobile: string;
  messageType: WhatsAppMessageType;
  patientName: string;
  clinicName: string;
  doctorName: string;
  appointmentDate: string;
  appointmentTime: string;
  clinicConfig?: ClinicWhatsAppTemplateConfig | null;
}): Promise<WhatsAppDispatchResult> {
  const templateName = resolveTemplateName(params.messageType, params.clinicConfig);
  const accessToken = readSecretSafe(WHATSAPP_ACCESS_TOKEN);
  const phoneNumberId = readSecretSafe(WHATSAPP_PHONE_NUMBER_ID);

  if (!accessToken || !phoneNumberId) {
    return {
      deliveryStatus: 'skipped_not_configured',
      providerMessageId: null,
      templateName,
      errorMessage:
        'Meta WhatsApp Cloud API secrets (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID) are not configured in Secret Manager.',
    };
  }

  const normalizedPhone = normalizeE164Phone(params.recipientMobile);
  if (normalizedPhone.length < 10) {
    return {
      deliveryStatus: 'failed',
      providerMessageId: null,
      templateName,
      errorMessage: 'Invalid recipient phone number for WhatsApp delivery.',
    };
  }

  const languageCode = params.clinicConfig?.languageCode?.trim() || 'en';
  const doctorLabel = params.doctorName.startsWith('Dr.')
    ? params.doctorName
    : `Dr. ${params.doctorName}`;

  const bodyComponents =
    templateName === 'hello_world'
      ? []
      : [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: params.patientName.slice(0, 60) },
              { type: 'text', text: params.clinicName.slice(0, 60) },
              { type: 'text', text: doctorLabel.slice(0, 60) },
              { type: 'text', text: formatReadableDate(params.appointmentDate) },
              { type: 'text', text: formatReadableTime(params.appointmentTime) },
            ],
          },
        ];

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: normalizedPhone,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(bodyComponents.length > 0 ? { components: bodyComponents } : {}),
    },
  };

  try {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(phoneNumberId)}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
    );

    const json = (await response.json().catch(() => ({}))) as {
      messages?: Array<{ id?: string }>;
      error?: { message?: string; code?: number; error_subcode?: number };
    };

    const providerMessageId = json.messages?.[0]?.id ? String(json.messages[0].id) : null;

    if (!response.ok || !providerMessageId) {
      const apiErr = json.error?.message
        ? `${json.error.message} (code ${json.error.code ?? response.status})`
        : `Meta Graph API returned HTTP ${response.status}`;
      return {
        deliveryStatus: 'failed',
        providerMessageId: null,
        templateName,
        errorMessage: apiErr.slice(0, 380),
      };
    }

    return {
      deliveryStatus: 'sent',
      providerMessageId,
      templateName,
      errorMessage: null,
    };
  } catch (err: unknown) {
    return {
      deliveryStatus: 'failed',
      providerMessageId: null,
      templateName,
      errorMessage:
        err instanceof Error ? err.message.slice(0, 380) : 'Network failure contacting Meta Graph API',
    };
  }
}

export function verifyMetaWebhookSignature(
  rawBody: Buffer | undefined,
  signatureHeader: string | undefined,
): boolean {
  const appSecret = readSecretSafe(WHATSAPP_APP_SECRET);
  return verifyHmacSha256Signature(rawBody, signatureHeader, appSecret);
}

export function verifyWebhookTokenMatch(candidateToken: string): boolean {
  const expected = readSecretSafe(WHATSAPP_WEBHOOK_VERIFY_TOKEN);
  return verifyTimingSafeSecretMatch(expected, candidateToken);
}
