"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.WHATSAPP_SECRETS = exports.WHATSAPP_APP_SECRET = exports.WHATSAPP_WEBHOOK_VERIFY_TOKEN = exports.WHATSAPP_BUSINESS_ACCOUNT_ID = exports.WHATSAPP_PHONE_NUMBER_ID = exports.WHATSAPP_ACCESS_TOKEN = void 0;
exports.normalizeE164Phone = normalizeE164Phone;
exports.extractMobileLast10 = extractMobileLast10;
exports.formatReadableDate = formatReadableDate;
exports.formatReadableTime = formatReadableTime;
exports.resolveTemplateName = resolveTemplateName;
exports.sendWhatsAppTemplateMessage = sendWhatsAppTemplateMessage;
exports.verifyMetaWebhookSignature = verifyMetaWebhookSignature;
exports.verifyWebhookTokenMatch = verifyWebhookTokenMatch;
const crypto = __importStar(require("node:crypto"));
const params_1 = require("firebase-functions/params");
exports.WHATSAPP_ACCESS_TOKEN = (0, params_1.defineSecret)('WHATSAPP_ACCESS_TOKEN');
exports.WHATSAPP_PHONE_NUMBER_ID = (0, params_1.defineSecret)('WHATSAPP_PHONE_NUMBER_ID');
exports.WHATSAPP_BUSINESS_ACCOUNT_ID = (0, params_1.defineSecret)('WHATSAPP_BUSINESS_ACCOUNT_ID');
exports.WHATSAPP_WEBHOOK_VERIFY_TOKEN = (0, params_1.defineSecret)('WHATSAPP_WEBHOOK_VERIFY_TOKEN');
exports.WHATSAPP_APP_SECRET = (0, params_1.defineSecret)('WHATSAPP_APP_SECRET');
exports.WHATSAPP_SECRETS = [
    exports.WHATSAPP_ACCESS_TOKEN,
    exports.WHATSAPP_PHONE_NUMBER_ID,
    exports.WHATSAPP_BUSINESS_ACCOUNT_ID,
    exports.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    exports.WHATSAPP_APP_SECRET,
];
function normalizeE164Phone(rawMobile) {
    const digits = String(rawMobile || '').replace(/\D/g, '');
    if (!digits)
        return '';
    if (digits.length === 10) {
        return `91${digits}`;
    }
    return digits;
}
function extractMobileLast10(rawMobile) {
    const digits = String(rawMobile || '').replace(/\D/g, '');
    return digits.length >= 10 ? digits.slice(-10) : digits;
}
function formatReadableDate(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    if (!y || !m || !d)
        return dateStr;
    const utc = new Date(Date.UTC(y, m - 1, d));
    return utc.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
    });
}
function formatReadableTime(timeStr) {
    const [hh, mm] = timeStr.split(':').map(Number);
    if (Number.isNaN(hh) || Number.isNaN(mm))
        return timeStr;
    const suffix = hh >= 12 ? 'PM' : 'AM';
    const hour12 = hh % 12 === 0 ? 12 : hh % 12;
    return `${hour12}:${String(mm).padStart(2, '0')} ${suffix}`;
}
function resolveTemplateName(type, config) {
    const fallbackMap = {
        confirmation: 'cliniqo_appointment_confirmation',
        reminder_24h: 'cliniqo_appointment_reminder_24h',
        reminder_2h: 'cliniqo_appointment_reminder_2h',
        reschedule: 'cliniqo_appointment_rescheduled',
        cancellation: 'cliniqo_appointment_cancelled',
    };
    if (!config)
        return fallbackMap[type];
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
function readSecretSafe(secret) {
    try {
        return String(secret.value() || '').trim();
    }
    catch {
        return '';
    }
}
/**
 * Sends a structured, privacy-safe Meta WhatsApp Business Cloud API template message.
 * NEVER includes diagnoses, symptoms, or prescription contents.
 * NEVER fabricates a 'sent' status if the Meta Graph API does not confirm with a message ID.
 */
async function sendWhatsAppTemplateMessage(params) {
    const templateName = resolveTemplateName(params.messageType, params.clinicConfig);
    const accessToken = readSecretSafe(exports.WHATSAPP_ACCESS_TOKEN);
    const phoneNumberId = readSecretSafe(exports.WHATSAPP_PHONE_NUMBER_ID);
    if (!accessToken || !phoneNumberId) {
        return {
            deliveryStatus: 'skipped_not_configured',
            providerMessageId: null,
            templateName,
            errorMessage: 'Meta WhatsApp Cloud API secrets (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID) are not configured in Secret Manager.',
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
    const bodyComponents = templateName === 'hello_world'
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
        const response = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(phoneNumberId)}/messages`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        const json = (await response.json().catch(() => ({})));
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
    }
    catch (err) {
        return {
            deliveryStatus: 'failed',
            providerMessageId: null,
            templateName,
            errorMessage: err instanceof Error ? err.message.slice(0, 380) : 'Network failure contacting Meta Graph API',
        };
    }
}
function verifyMetaWebhookSignature(rawBody, signatureHeader) {
    const appSecret = readSecretSafe(exports.WHATSAPP_APP_SECRET);
    if (!appSecret) {
        // Allow sandbox verification if WHATSAPP_APP_SECRET has not been provisioned yet
        return true;
    }
    if (!rawBody || !signatureHeader || !signatureHeader.startsWith('sha256=')) {
        return false;
    }
    const providedHex = signatureHeader.slice('sha256='.length).trim();
    const expectedHex = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
    const providedBuf = Buffer.from(providedHex, 'hex');
    const expectedBuf = Buffer.from(expectedHex, 'hex');
    if (providedBuf.length !== expectedBuf.length) {
        return false;
    }
    return crypto.timingSafeEqual(providedBuf, expectedBuf);
}
function verifyWebhookTokenMatch(candidateToken) {
    const expected = readSecretSafe(exports.WHATSAPP_WEBHOOK_VERIFY_TOKEN);
    if (!expected || !candidateToken)
        return false;
    const a = Buffer.from(expected);
    const b = Buffer.from(candidateToken);
    if (a.length !== b.length)
        return false;
    return crypto.timingSafeEqual(a, b);
}
//# sourceMappingURL=whatsapp.js.map