# Security Specification — Cliniqo P3 & P4 Multi-Tenant RBAC, Patient Records & Audit Logs

## 1. Data Invariants

1. **No Auto-Join on Code Entry**: Looking up `/clinicCodes/{code}` only returns public clinic display metadata (`publicName`, `publicAddress`, `publicCity`, `publicState`) when `active == true`. It never grants clinic membership or exposes patient records.
2. **Email Verification Gate**: Unverified users cannot submit `/clinicJoinRequests`, create clinics, or read/write clinic or patient workspaces.
3. **Owner-Only Staff Management & Instant Revocation**: Only the clinic owner can approve/reject `/clinicJoinRequests` or revoke `/clinicMemberships`. Revoked users lose all clinic and patient access immediately (`isActiveClinicMember(clinicId)`).
4. **Clinic-to-Clinic Patient Isolation**: All patient documents live under `/clinics/{clinicId}/patients/{patientDocId}` and enforce `clinicId == incoming().clinicId` plus active membership in `clinicId`. No user from Clinic A can read, list, create, or edit patients in Clinic B.
5. **Atomic Patient ID Sequence**: Creating a patient requires incrementing `/clinics/{clinicId}/counters/patientCounter` atomically (`seq == existing().seq + 1` or annual rollover `year > existing().year && seq == 1`) with `updatedAt == request.time`, preventing duplicate `PAT-YYYY-NNNN` IDs under concurrent registrations.
6. **Role-Segregated Patient Updates & Doctor-Only Clinical Notes**:
   - Receptionists can register patients (`status == 'active'`, `registeredBy == request.auth.uid`), edit demographic fields + `emergencyContact`, and archive/restore records, **but cannot modify medical fields** (`allergies`, `existingConditions`, `currentMedications`, `medicalNotes`) after registration.
   - `/clinics/{clinicId}/patients/{patientDocId}/doctorNotes/{noteId}` is strictly gated to `isClinicDoctorOrOwner(clinicId)`—receptionists are denied both read and write access to doctor-only clinical notes.
7. **No Permanent Deletion & Immutable Audit Trail**: `allow delete: if false` on all patient and audit collections. Every registration, demographic update, medical update, and archive/restore writes an immutable `/clinics/{clinicId}/patientAuditLogs/{logId}` entry.

## 2. Adversarial "Dirty Dozen" Attack Payloads (Must Return PERMISSION_DENIED)

1. Unauthenticated user listing `/clinicCodes` or reading `/clinics/c1/patients/p1` -> DENIED
2. Unverified clinic member creating a patient under `/clinics/c1/patients` -> DENIED
3. Active member of Clinic A reading, listing, or creating patients in Clinic B -> DENIED
4. Revoked receptionist attempting to read or list `/clinics/c1/patients` -> DENIED
5. Receptionist attempting to read or write `/clinics/c1/patients/p1/doctorNotes/clinical` -> DENIED
6. Receptionist attempting to update `medicalNotes`, `allergies`, `existingConditions`, or `currentMedications` on an existing `/clinics/c1/patients/p1` -> DENIED
7. Clinic member attempting to change `clinicId`, `patientId`, `registeredBy`, or `createdAt` on `/clinics/c1/patients/p1` -> DENIED
8. Clinic member attempting to create a patient without atomically updating `/clinics/c1/counters/patientCounter` -> DENIED
9. Clinic member attempting to decrement or skip `/clinics/c1/counters/patientCounter.seq` -> DENIED
10. Clinic member attempting to permanently delete `/clinics/c1/patients/p1` -> DENIED
11. Clinic member attempting to forge `actorUid != request.auth.uid` or `actorRole` on `/clinics/c1/patientAuditLogs/{logId}` -> DENIED
12. Clinic member attempting to update or delete `/clinics/c1/patientAuditLogs/{logId}` -> DENIED

## 3. P5 Live Patient Queue Invariants & Adversarial Payloads

### Queue Data Invariants
1. **Clinic-Isolated Daily Counter & Atomic Token Generation**: Queue tokens (`1, 2, 3...`) are generated strictly via atomic Firestore transaction incrementing `/clinics/{clinicId}/dailyQueues/{queueDate}` (`seq == existing().seq + 1` or `seq == 1` on first entry of that `queueDate`) alongside creating `/clinics/{clinicId}/dailyQueues/{queueDate}/entries/{entryId}` with `tokenNumber == getAfter(...).data.seq`.
2. **Doctor-Exclusive Clinical Transitions**: Only `isClinicDoctorOrOwner(clinicId)` (`role in ['owner', 'doctor']`) may transition queue entries to `called`, `in_consultation`, `on_hold`, `skipped`, `completed`, resume `on_hold`/`skipped` back to `waiting`, or assign `priority`.
3. **Concurrent Acceptance Prevention**: Transitioning an entry to `in_consultation` requires `existing().status in ['waiting', 'called']` and `(existing().assignedDoctorId == null || existing().assignedDoctorId == request.auth.uid)`. Concurrent acceptance transactions abort/fail cleanly.
4. **Receptionist Boundary & Safe Cancellation**: Receptionists can create new queue entries (`status == 'waiting'`, `assignedDoctorId == null`, `priority == false`) and cancel mistakenly added non-terminal, non-in-consultation entries (`existing().status in ['waiting', 'called', 'on_hold', 'skipped']` -> `'cancelled'`) with an audit log, but cannot mark consultations completed, accept patients, hold/skip/resume patients, or assign priority.
5. **Terminal State Locks & No Deletion**: `completed` and `cancelled` queue entries cannot transition to any other status, and `allow delete: if false` on all queue and audit collections.
6. **Same-Clinic Verified Queue Notifications**: Notifications with `queue_*` types require `isActiveClinicMember(clinicId)` for the sender and an active membership in the same `clinicId` for `recipientUid`.

### P5 Adversarial Payloads (Must Return PERMISSION_DENIED)
1. Receptionist attempting to update `status` to `'in_consultation'` or `'completed'` -> DENIED
2. Receptionist attempting to set `priority: true` on creation or update -> DENIED
3. Receptionist attempting to cancel an entry whose `status` is `'in_consultation'` or `'completed'` -> DENIED
4. Doctor B attempting to accept an entry already `'in_consultation'` with `assignedDoctorId == doctorA` -> DENIED
5. Clinic member attempting to create a queue entry with an arbitrary `tokenNumber` without incrementing `dailyQueues/{queueDate}` -> DENIED
6. Clinic member attempting to modify a `'completed'` or `'cancelled'` entry -> DENIED
7. Active member of Clinic A attempting to read or mutate Clinic B's `dailyQueues` -> DENIED
8. Clinic member attempting to delete any queue entry or `queueAuditLogs` document -> DENIED

## 4. P6 Doctor Consultation & Smart Prescription Maker Invariants & Adversarial Payloads

### Consultation & Prescription Invariants
1. **Doctor-Only Clinical & Prescription Access**: `/clinics/{clinicId}/consultations`, `/clinics/{clinicId}/prescriptions`, `/clinics/{clinicId}/medicines`, `/clinics/{clinicId}/prescriptionTemplates`, and `/clinics/{clinicId}/prescriptionAuditLogs` require `isClinicDoctorOrOwner(clinicId)` (`role in ['owner', 'doctor']` and active membership). Receptionists are denied both `get` and `list` and all writes.
2. **Draft-Only Creation & Verified Signing**: Prescriptions can only be created as `status == 'draft'` with `signedAt == null` and `signedByUid == null`. Finalization requires `existing().status == 'draft'`, `incoming().status == 'finalized'`, `incoming().signedByUid == request.auth.uid`, `incoming().signedAt == request.time`, `incoming().doctorConfirmedReview == true`, and at least 1 medicine entry.
3. **Immutable Finalized Records & Versioned Amendments**: Once a prescription document reaches `status == 'finalized'`, `allow update` and `allow delete` are permanently denied (`existing().status == 'draft'`). Corrections require creating a new prescription document with `version > 1`, `parentPrescriptionId` pointing to the finalized document, `amendmentReason` (`size() >= 3`), and a corresponding immutable `prescriptionAuditLogs` entry.
4. **Immutable Audit Trail & No Deletion**: `allow delete: if false` on consultations, prescriptions, medicines, and `prescriptionAuditLogs`; `prescriptionAuditLogs` also forbids updates (`allow update, delete: if false`).
5. **Cross-Clinic Isolation**: Every rule verifies `clinicId == incoming().clinicId` / `existing().clinicId == clinicId` and active doctor/owner membership in `clinicId`.

### P6 Adversarial Payloads (Must Return PERMISSION_DENIED)
1. Receptionist attempting to `get`, `list`, `create`, or `update` `/clinics/c1/consultations/{id}` -> DENIED
2. Receptionist attempting to `get`, `list`, `create`, or `update` `/clinics/c1/prescriptions/{id}` -> DENIED
3. Doctor attempting to `create` a prescription directly with `status: 'finalized'` and forged `signedAt` -> DENIED
4. Doctor attempting to `update` an already `finalized` prescription (silent overwrite of medicines or notes) -> DENIED
5. Doctor attempting to `finalize` a prescription while setting `signedByUid` to another doctor's UID -> DENIED
6. Doctor attempting to `delete` a consultation, prescription, medicine, or `prescriptionAuditLogs` entry -> DENIED
7. Doctor from Clinic A attempting to read or write medicines, templates, consultations, or prescriptions in Clinic B -> DENIED
8. Doctor attempting to create an amendment (`version > 1`) without `amendmentReason` or `parentPrescriptionId` -> DENIED

## 5. P7 Follow-up Appointments, Availability Locks & WhatsApp Audit Invariants

### Appointment & Notification Invariants
1. **Clinic Isolation & Active Membership Gate**: All appointment collections (`/clinics/{clinicId}/appointments`, `appointmentSlots`, `appointmentLogs`, `notificationLogs`, `patientCommPrefs`) require `isVerifiedUser()`, `isActiveClinicMember(clinicId)`, and `clinicId == incoming().clinicId`.
2. **Receptionist Authorization Enforcement**: Clinic owners can configure `receptionistPermissions.canCreateAppointments` and `receptionistPermissions.canCancelAppointments` on `/clinics/{clinicId}`. Both Cloud Functions and `firestore.rules` deny receptionist creation/rescheduling when `canCreateAppointments == false` or receptionist cancellation when `canCancelAppointments == false`.
3. **Doctor-Only Clinical Consultation Linkage & Completion**: Consultation records remain strictly restricted to doctors/owners. Receptionists can view/manage appointments and WhatsApp delivery logs without ever accessing consultation or prescription data.
4. **Atomic Conflict Slot Locking**: Scheduling or rescheduling acquires an atomic lock document at `/clinics/{clinicId}/appointmentSlots/{doctorId}_{appointmentDate}_{HHmm}` (`active == true`, `appointmentId`), rejecting concurrent conflicting bookings at both the rule and transaction layers.
5. **No Fake WhatsApp Delivery Statuses**: Client writes to `/clinics/{clinicId}/notificationLogs` are strictly prohibited from setting `deliveryStatus in ['sent', 'delivered', 'read']` or any non-null `providerMessageId`. Only verified server-side Admin SDK Cloud Functions (after genuine Meta Cloud API confirmation or webhook status event) may record `'sent'`, `'delivered'`, `'read'`, or Meta `wamid` IDs.
6. **Consent-Respecting Messaging & Zero Secret Exposure**: Patient consent preferences live in `/clinics/{clinicId}/patientCommPrefs/{patientDocId}`. Meta access tokens, app secrets, and webhook verify tokens are stored exclusively in Google Cloud Secret Manager (`defineSecret`), never in Firestore or client bundles.
7. **Immutable Appointment & Notification History**: `allow delete: if false` on appointments, `appointmentLogs`, `notificationLogs`, and `patientCommPrefs`; `appointmentLogs` also forbids updates (`allow update, delete: if false`).

### P7 Adversarial Payloads (Must Return PERMISSION_DENIED)
1. Unauthenticated or revoked member reading or writing `/clinics/c1/appointments` -> DENIED
2. Active member of Clinic A reading or creating appointments in Clinic B -> DENIED
3. Receptionist creating an appointment when `clinic.receptionistPermissions.canCreateAppointments == false` -> DENIED
4. Receptionist cancelling an appointment when `clinic.receptionistPermissions.canCancelAppointments == false` -> DENIED
5. Client attempting to forge `deliveryStatus: 'sent'` or a fake `providerMessageId: 'wamid.fake'` in `/clinics/c1/notificationLogs` -> DENIED
6. Client attempting to double-book an already active `/clinics/c1/appointmentSlots/{slotKey}` -> DENIED
7. Clinic member attempting to update or delete `/clinics/c1/appointmentLogs/{logId}` -> DENIED
8. Clinic member attempting to delete any appointment or `notificationLogs` record -> DENIED
