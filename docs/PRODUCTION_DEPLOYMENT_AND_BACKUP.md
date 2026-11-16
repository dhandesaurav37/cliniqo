# Cliniqo Production Deployment, Security & Disaster Recovery Runbook

Target Firebase / Google Cloud Project:
- **Project ID:** `cliniqo-ec597` (`Project Number: 858807751903`)
- **Firestore Database ID:** `ai-studio-cliniqo-d8ef6b11-a10b-40c5-a196-2df6be82f24c`
- **Cloud Functions Region:** `asia-south1`

---

## 1. Firestore Indexes & Security Rules Deployment

1. Validate Firestore rules locally before any deployment:
   ```bash
   npx eslint firestore.rules
   ```
2. Deploy security rules and composite/collection-group indexes (`firestore.indexes.json`) to the named database:
   ```bash
   firebase use cliniqo-ec597
   firebase deploy --only firestore:rules,firestore:indexes
   ```

> **Note:** Cloud Functions v2 queries (`processAppointmentReminders` scanning `scheduledAtUtcMs`, `whatsappWebhook` scanning `providerMessageId` and `patientMobileLast10 + status + scheduledAtUtcMs`) require the `COLLECTION_GROUP` indexes defined in `/firestore.indexes.json`.

---

## 2. Firebase Authentication Authorized Domains & Email Delivery

1. Open **Firebase Console → Authentication → Settings → Authorized domains** and verify:
   - Your production domain (e.g., `app.cliniqo.in` / `cliniqo-ec597.web.app`)
   - Preview / staging Cloud Run origins (`*.run.app` or exact preview host)
   - `localhost` (development only)
2. Ensure **Email/Password** sign-in provider is enabled.
3. Configure custom SMTP / sender domain in **Authentication → Templates** (Verify Email & Password Reset) to improve inbox deliverability for clinic doctors and receptionists.

---

## 3. Firebase App Check (Anti-Abuse Protection)

1. In **Firebase Console → App Check → Apps**, register the Web App (`1:858807751903:web:4db54cbf32bb5f22c7c56a`) with **reCAPTCHA Enterprise** (recommended for production).
2. Add the resulting site key to your build environment:
   ```bash
   VITE_FIREBASE_APP_CHECK_SITE_KEY="your-recaptcha-enterprise-site-key"
   ```
   `/src/lib/firebase.ts` automatically initializes App Check when `VITE_FIREBASE_APP_CHECK_SITE_KEY` is present.
3. Monitor App Check request metrics for 48 hours before toggling **Enforce** on Cloud Firestore and Cloud Functions.

---

## 4. Cloud Functions v2 & Meta WhatsApp Business Cloud API Secrets

Never store Meta credentials in `.env` or frontend code. Bind them via Google Cloud Secret Manager:

```bash
firebase functions:secrets:set WHATSAPP_ACCESS_TOKEN
firebase functions:secrets:set WHATSAPP_PHONE_NUMBER_ID
firebase functions:secrets:set WHATSAPP_BUSINESS_ACCOUNT_ID
firebase functions:secrets:set WHATSAPP_WEBHOOK_VERIFY_TOKEN
firebase functions:secrets:set WHATSAPP_APP_SECRET
```

> **Security Requirement:** `WHATSAPP_APP_SECRET` must always be set in production so `/whatsappWebhook` enforces `X-Hub-Signature-256` HMAC verification on all inbound Meta webhook callbacks and rejects forged requests with HTTP `403`.

Deploy functions and set frontend flag `VITE_USE_CLOUD_FUNCTIONS="true"` before building the production bundle:
```bash
cd functions && npm ci && npm run build && cd ..
firebase deploy --only functions
```

---

## 5. Firestore Backup, Point-in-Time Recovery (PITR) & Restore Verification

Because Cliniqo manages clinic patient records, consultations, prescriptions, and appointments, enable both **PITR** and **automated GCS exports**:

### A. Enable Point-in-Time Recovery (PITR)
```bash
gcloud firestore databases update \
  --project=cliniqo-ec597 \
  --database="ai-studio-cliniqo-d8ef6b11-a10b-40c5-a196-2df6be82f24c" \
  --enable-pitr
```

### B. Configure Daily Automated Managed Exports to Cloud Storage
1. Create a dedicated bucket in `asia-south1` with Uniform Bucket-Level Access and versioning/retention policy:
   ```bash
   gcloud storage buckets create gs://cliniqo-ec597-firestore-backups \
     --project=cliniqo-ec597 \
     --location=asia-south1 \
     --uniform-bucket-level-access
   ```
2. Create a daily export schedule (`24h` cadence, `30d` retention):
   ```bash
   gcloud firestore backups schedules create \
     --project=cliniqo-ec597 \
     --database="ai-studio-cliniqo-d8ef6b11-a10b-40c5-a196-2df6be82f24c" \
     --recurrence=daily \
     --retention=30d
   ```
   Or trigger a manual export to GCS at any time:
   ```bash
   gcloud firestore export gs://cliniqo-ec597-firestore-backups/manual-$(date +%Y%m%d) \
     --project=cliniqo-ec597 \
     --database="ai-studio-cliniqo-d8ef6b11-a10b-40c5-a196-2df6be82f24c"
   ```

### C. Monthly Restore Verification Drill
1. Provision a temporary staging database (never restore over live production data directly).
2. Import the latest export into the staging database using `gcloud firestore import`.
3. Verify clinic counts, `patients`, `consultations`, `prescriptions`, and `appointments` integrity, then delete the temporary staging database.

---

## 6. Monitoring, Quotas & Alerting Checklist

Configure Cloud Monitoring alert policies in GCP (`cliniqo-ec597`):
- **Firestore Daily Quota & Latency:** Alert if read/write operations exceed 80% of budget or p95 latency > 500ms.
- **Cloud Functions Errors:** Alert on `severity >= ERROR` in `scheduleClinicAppointment`, `rescheduleClinicAppointment`, `cancelClinicAppointment`, `processAppointmentReminders`, or `whatsappWebhook`.
- **WhatsApp Delivery Failures:** Alert when `notificationLogs` entries with `deliveryStatus == "failed"` spike over a 15-minute window.
- **Auth Anomaly Detection:** Enable Firebase Auth Email Enumeration Protection in Firebase Console → Authentication → Settings.
