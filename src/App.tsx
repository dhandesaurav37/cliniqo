import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import {
  RequireAccessDenied,
  RequireClinicWorkspace,
  RequireOwnerWorkspace,
  RequirePendingRequest,
  RequireReceptionWorkspace,
  RequireUnverifiedOrAuth,
  RequireVerifiedOnboarding,
} from './components/RouteGuards';
import { AuthProvider } from './context/AuthContext';
import { AccessDeniedPage } from './pages/AccessDeniedPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { HomePage } from './pages/HomePage';
import { JoinClinicPage } from './pages/JoinClinicPage';
import { JoinRequestPendingPage } from './pages/JoinRequestPendingPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';

const AppointmentDetailPage = lazy(() =>
  import('./pages/AppointmentDetailPage').then((m) => ({ default: m.AppointmentDetailPage })),
);
const AppointmentsPage = lazy(() =>
  import('./pages/AppointmentsPage').then((m) => ({ default: m.AppointmentsPage })),
);
const ClinicSettingsPage = lazy(() =>
  import('./pages/ClinicSettingsPage').then((m) => ({ default: m.ClinicSettingsPage })),
);
const ClinicWelcomePage = lazy(() =>
  import('./pages/ClinicWelcomePage').then((m) => ({ default: m.ClinicWelcomePage })),
);
const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const DoctorConsultationPage = lazy(() =>
  import('./pages/DoctorConsultationPage').then((m) => ({ default: m.DoctorConsultationPage })),
);
const DoctorQueuePage = lazy(() =>
  import('./pages/DoctorQueuePage').then((m) => ({ default: m.DoctorQueuePage })),
);
const EditPatientPage = lazy(() =>
  import('./pages/EditPatientPage').then((m) => ({ default: m.EditPatientPage })),
);
const MedicinesManagementPage = lazy(() =>
  import('./pages/MedicinesManagementPage').then((m) => ({ default: m.MedicinesManagementPage })),
);
const NewAppointmentPage = lazy(() =>
  import('./pages/NewAppointmentPage').then((m) => ({ default: m.NewAppointmentPage })),
);
const NewPatientPage = lazy(() =>
  import('./pages/NewPatientPage').then((m) => ({ default: m.NewPatientPage })),
);
const OnboardingClinicPage = lazy(() =>
  import('./pages/OnboardingClinicPage').then((m) => ({ default: m.OnboardingClinicPage })),
);
const OnboardingDoctorPage = lazy(() =>
  import('./pages/OnboardingDoctorPage').then((m) => ({ default: m.OnboardingDoctorPage })),
);
const OnboardingReviewPage = lazy(() =>
  import('./pages/OnboardingReviewPage').then((m) => ({ default: m.OnboardingReviewPage })),
);
const PatientAppointmentsPage = lazy(() =>
  import('./pages/PatientAppointmentsPage').then((m) => ({ default: m.PatientAppointmentsPage })),
);
const PatientProfilePage = lazy(() =>
  import('./pages/PatientProfilePage').then((m) => ({ default: m.PatientProfilePage })),
);
const PatientsPage = lazy(() =>
  import('./pages/PatientsPage').then((m) => ({ default: m.PatientsPage })),
);
const PrescriptionDetailPage = lazy(() =>
  import('./pages/PrescriptionDetailPage').then((m) => ({ default: m.PrescriptionDetailPage })),
);
const PrescriptionsListPage = lazy(() =>
  import('./pages/PrescriptionsListPage').then((m) => ({ default: m.PrescriptionsListPage })),
);
const PrescriptionTemplatesPage = lazy(() =>
  import('./pages/PrescriptionTemplatesPage').then((m) => ({
    default: m.PrescriptionTemplatesPage,
  })),
);
const ReceptionDashboardPage = lazy(() =>
  import('./pages/ReceptionDashboardPage').then((m) => ({ default: m.ReceptionDashboardPage })),
);
const ReceptionQueuePage = lazy(() =>
  import('./pages/ReceptionQueuePage').then((m) => ({ default: m.ReceptionQueuePage })),
);
const StaffManagementPage = lazy(() =>
  import('./pages/StaffManagementPage').then((m) => ({ default: m.StaffManagementPage })),
);

function RouteLoadingFallback() {
  return (
    <div className="min-h-screen bg-[#F4F8FD] flex items-center justify-center p-6">
      <div className="lucid-glass rounded-2xl px-6 py-4 text-sm font-medium text-slate-600">
        Loading workspace...
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<RouteLoadingFallback />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/join-clinic" element={<JoinClinicPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />

            <Route
              path="/verify-email"
              element={
                <RequireUnverifiedOrAuth>
                  <VerifyEmailPage />
                </RequireUnverifiedOrAuth>
              }
            />

            <Route
              path="/join-request-pending"
              element={
                <RequirePendingRequest>
                  <JoinRequestPendingPage />
                </RequirePendingRequest>
              }
            />

            <Route
              path="/access-denied"
              element={
                <RequireAccessDenied>
                  <AccessDeniedPage />
                </RequireAccessDenied>
              }
            />

            <Route
              path="/onboarding/doctor"
              element={
                <RequireVerifiedOnboarding>
                  <OnboardingDoctorPage />
                </RequireVerifiedOnboarding>
              }
            />
            <Route
              path="/onboarding/clinic"
              element={
                <RequireVerifiedOnboarding>
                  <OnboardingClinicPage />
                </RequireVerifiedOnboarding>
              }
            />
            <Route
              path="/onboarding/review"
              element={
                <RequireVerifiedOnboarding>
                  <OnboardingReviewPage />
                </RequireVerifiedOnboarding>
              }
            />

            <Route
              path="/app/welcome"
              element={
                <RequireOwnerWorkspace>
                  <ClinicWelcomePage />
                </RequireOwnerWorkspace>
              }
            />
            <Route path="/app/dashboard" element={<Navigate to="/app/doctor/dashboard" replace />} />
            <Route
              path="/app/doctor/dashboard"
              element={
                <RequireOwnerWorkspace>
                  <DashboardPage />
                </RequireOwnerWorkspace>
              }
            />
            <Route
              path="/app/doctor/queue"
              element={
                <RequireOwnerWorkspace>
                  <DoctorQueuePage />
                </RequireOwnerWorkspace>
              }
            />
            <Route
              path="/app/doctor/consultation/:consultationId"
              element={
                <RequireOwnerWorkspace>
                  <DoctorConsultationPage />
                </RequireOwnerWorkspace>
              }
            />
            <Route
              path="/app/doctor/prescriptions"
              element={
                <RequireOwnerWorkspace>
                  <PrescriptionsListPage />
                </RequireOwnerWorkspace>
              }
            />
            <Route
              path="/app/doctor/prescriptions/:prescriptionId"
              element={
                <RequireOwnerWorkspace>
                  <PrescriptionDetailPage />
                </RequireOwnerWorkspace>
              }
            />
            <Route
              path="/app/doctor/medicines"
              element={
                <RequireOwnerWorkspace>
                  <MedicinesManagementPage />
                </RequireOwnerWorkspace>
              }
            />
            <Route
              path="/app/doctor/prescription-templates"
              element={
                <RequireOwnerWorkspace>
                  <PrescriptionTemplatesPage />
                </RequireOwnerWorkspace>
              }
            />
            <Route
              path="/app/reception/dashboard"
              element={
                <RequireReceptionWorkspace>
                  <ReceptionDashboardPage />
                </RequireReceptionWorkspace>
              }
            />
            <Route
              path="/app/reception/queue"
              element={
                <RequireReceptionWorkspace>
                  <ReceptionQueuePage />
                </RequireReceptionWorkspace>
              }
            />
            <Route
              path="/app/settings/clinic"
              element={
                <RequireOwnerWorkspace>
                  <ClinicSettingsPage />
                </RequireOwnerWorkspace>
              }
            />
            <Route
              path="/app/settings/staff"
              element={
                <RequireOwnerWorkspace>
                  <StaffManagementPage />
                </RequireOwnerWorkspace>
              }
            />
            <Route
              path="/app/patients"
              element={
                <RequireClinicWorkspace>
                  <PatientsPage />
                </RequireClinicWorkspace>
              }
            />
            <Route
              path="/app/patients/new"
              element={
                <RequireClinicWorkspace>
                  <NewPatientPage />
                </RequireClinicWorkspace>
              }
            />
            <Route
              path="/app/patients/:patientId/edit"
              element={
                <RequireClinicWorkspace>
                  <EditPatientPage />
                </RequireClinicWorkspace>
              }
            />
            <Route
              path="/app/patients/:patientId/appointments"
              element={
                <RequireClinicWorkspace>
                  <PatientAppointmentsPage />
                </RequireClinicWorkspace>
              }
            />
            <Route
              path="/app/patients/:patientId"
              element={
                <RequireClinicWorkspace>
                  <PatientProfilePage />
                </RequireClinicWorkspace>
              }
            />
            <Route
              path="/app/appointments"
              element={
                <RequireClinicWorkspace>
                  <AppointmentsPage />
                </RequireClinicWorkspace>
              }
            />
            <Route
              path="/app/appointments/new"
              element={
                <RequireClinicWorkspace>
                  <NewAppointmentPage />
                </RequireClinicWorkspace>
              }
            />
            <Route
              path="/app/appointments/:appointmentId"
              element={
                <RequireClinicWorkspace>
                  <AppointmentDetailPage />
                </RequireClinicWorkspace>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
