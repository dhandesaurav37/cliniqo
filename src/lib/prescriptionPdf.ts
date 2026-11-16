import { jsPDF } from 'jspdf';
import type { ClinicRecord, UserProfileRecord } from './clinicService';
import type { ConsultationRecord, PrescriptionRecord } from './consultationService';
import type { PatientRecord } from './patientService';

export interface PrescriptionDocumentData {
  clinic: ClinicRecord;
  doctor: UserProfileRecord | null;
  patient: PatientRecord;
  consultation: ConsultationRecord;
  prescription: PrescriptionRecord;
}

function formatGender(gender?: PatientRecord['gender']): string {
  if (!gender) return '—';
  if (gender === 'male') return 'Male';
  if (gender === 'female') return 'Female';
  return 'Other';
}

function formatDocDate(prescription: PrescriptionRecord): string {
  const ts = prescription.signedAt || prescription.updatedAt || prescription.createdAt;
  const date = ts ? ts.toDate() : new Date();
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function detectImageFormat(dataUrl: string): 'PNG' | 'JPEG' | 'WEBP' | null {
  if (dataUrl.startsWith('data:image/png')) return 'PNG';
  if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) return 'JPEG';
  if (dataUrl.startsWith('data:image/webp')) return 'WEBP';
  return null;
}

export function generatePrescriptionA4Pdf(data: PrescriptionDocumentData): void {
  const { clinic, doctor, patient, consultation, prescription } = data;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = 16;

  const ensureSpace = (neededMm: number) => {
    if (y + neededMm > pageHeight - 24) {
      pdf.addPage();
      y = 18;
    }
  };

  // Draft Watermark Warning if unsigned
  if (prescription.status !== 'finalized') {
    pdf.setFillColor(254, 243, 199);
    pdf.rect(margin, y - 4, contentWidth, 8, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    pdf.setTextColor(146, 64, 14);
    pdf.text('UNSIGNED DRAFT — NOT FINALIZED FOR CLINICAL DISPENSING', margin + 3, y + 1);
    y += 10;
  }

  // Clinic & Doctor Header
  let headerLeftX = margin;
  if (clinic.logoUrl) {
    const fmt = detectImageFormat(clinic.logoUrl);
    if (fmt) {
      try {
        pdf.addImage(clinic.logoUrl, fmt, margin, y - 1, 14, 14);
        headerLeftX = margin + 17;
      } catch {
        // Skip logo rendering if data URL fails to parse
      }
    }
  }

  const clinicNameMaxWidth = Math.max(70, 180 - (headerLeftX - margin) - 76);
  pdf.setTextColor(11, 25, 44);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13.5);
  const clinicNameLines = pdf.splitTextToSize(clinic.name || 'Clinic', clinicNameMaxWidth);
  pdf.text(clinicNameLines, headerLeftX, y + 3);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  pdf.setTextColor(71, 85, 105);
  const afterNameY = y + 3 + (clinicNameLines.length - 1) * 5 + 4.5;
  const clinicAddr = `${clinic.address}, ${clinic.city}, ${clinic.state} ${clinic.pincode}`.trim();
  const addrLines = pdf.splitTextToSize(clinicAddr, Math.min(95, clinicNameMaxWidth));
  pdf.text(addrLines, headerLeftX, afterNameY);
  const afterAddrY = afterNameY + addrLines.length * 3.8;
  const telLines = pdf.splitTextToSize(
    `Tel: ${clinic.phone}${clinic.email ? ` | ${clinic.email}` : ''}`,
    Math.min(95, clinicNameMaxWidth),
  );
  pdf.text(telLines, headerLeftX, afterAddrY);
  const afterTelY = afterAddrY + telLines.length * 3.8;

  // Doctor Details (Right column)
  const rightX = pageWidth - margin;
  const docName = doctor?.fullName || prescription.doctorName || 'Doctor';
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.setTextColor(11, 25, 44);
  const docNameLines = pdf.splitTextToSize(`Dr. ${docName.replace(/^Dr\.?\s*/i, '')}`, 72);
  pdf.text(docNameLines, rightX, y + 3, { align: 'right' });

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  pdf.setTextColor(71, 85, 105);
  let docMetaY = y + 3 + (docNameLines.length - 1) * 4.4 + 4.5;
  if (doctor?.qualification || doctor?.specialization) {
    const cred = [doctor?.qualification, doctor?.specialization].filter(Boolean).join(' · ');
    const credLines = pdf.splitTextToSize(cred, 72);
    pdf.text(credLines, rightX, docMetaY, { align: 'right' });
    docMetaY += credLines.length * 3.8 + 0.5;
  }
  if (doctor?.registrationNumber) {
    const regLines = pdf.splitTextToSize(`Reg. No: ${doctor.registrationNumber}`, 72);
    pdf.text(regLines, rightX, docMetaY, { align: 'right' });
    docMetaY += regLines.length * 3.8 + 0.5;
  }
  const rxLines = pdf.splitTextToSize(
    `Rx: ${prescription.prescriptionNumber} (v${prescription.version})`,
    72,
  );
  pdf.text(rxLines, rightX, docMetaY, { align: 'right' });
  docMetaY += rxLines.length * 3.8;

  y = Math.max(afterTelY + 3, docMetaY + 3, y + 18);

  // Header Divider
  pdf.setDrawColor(2, 132, 199);
  pdf.setLineWidth(0.5);
  pdf.line(margin, y, pageWidth - margin, y);
  y += 5;

  // Patient Information Band (dynamically sized to prevent collisions)
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9.5);
  const patientNameLines = pdf.splitTextToSize(`Patient: ${patient.fullName}`, contentWidth - 6);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  const ageStr =
    patient.age !== null && patient.age !== undefined ? `${patient.age} yrs` : 'Age —';
  const metaLines = pdf.splitTextToSize(
    `Patient ID: ${patient.patientId}   |   ${ageStr} / ${formatGender(patient.gender)}   |   Date: ${formatDocDate(prescription)}`,
    contentWidth - 6,
  );

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8.3);
  const allergyLines =
    patient.allergies.length > 0
      ? pdf.splitTextToSize(`Allergies: ${patient.allergies.join(', ')}`, contentWidth - 6)
      : [];

  const bandHeight =
    6 +
    patientNameLines.length * 4.3 +
    metaLines.length * 4.0 +
    (allergyLines.length > 0 ? allergyLines.length * 3.9 + 1.5 : 0);

  pdf.setFillColor(244, 248, 253);
  pdf.setDrawColor(203, 213, 225);
  pdf.setLineWidth(0.25);
  pdf.roundedRect(margin, y, contentWidth, bandHeight, 1.5, 1.5, 'FD');

  let bandY = y + 5.2;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9.5);
  pdf.setTextColor(11, 25, 44);
  pdf.text(patientNameLines, margin + 3, bandY);
  bandY += patientNameLines.length * 4.3 + 0.8;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  pdf.setTextColor(51, 65, 85);
  pdf.text(metaLines, margin + 3, bandY);
  bandY += metaLines.length * 4.0 + 0.8;

  if (allergyLines.length > 0) {
    pdf.setTextColor(185, 28, 28);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.3);
    pdf.text(allergyLines, margin + 3, bandY);
  }
  y += bandHeight + 5;

  // Consultation Summary (Diagnosis & Recorded Clinical Observations)
  const diagParts = [
    consultation.primaryDiagnosis,
    consultation.additionalDiagnosis,
  ].filter(Boolean);
  const obsEntries: string[] = [];
  if (consultation.observations.bloodPressure) obsEntries.push(`BP: ${consultation.observations.bloodPressure}`);
  if (consultation.observations.pulseRate) obsEntries.push(`Pulse: ${consultation.observations.pulseRate}`);
  if (consultation.observations.temperature) obsEntries.push(`Temp: ${consultation.observations.temperature}`);
  if (consultation.observations.oxygenSaturation) obsEntries.push(`SpO2: ${consultation.observations.oxygenSaturation}`);
  if (consultation.observations.weight) obsEntries.push(`Wt: ${consultation.observations.weight}`);
  if (consultation.observations.height) obsEntries.push(`Ht: ${consultation.observations.height}`);

  if (diagParts.length > 0 || obsEntries.length > 0) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(11, 25, 44);
    if (diagParts.length > 0) {
      const diagLines = pdf.splitTextToSize(`Diagnosis: ${diagParts.join(' · ')}`, contentWidth);
      ensureSpace(diagLines.length * 4.2 + 2);
      pdf.text(diagLines, margin, y);
      y += diagLines.length * 4.2 + 1.5;
    }
    if (obsEntries.length > 0) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8.5);
      pdf.setTextColor(71, 85, 105);
      const obsLines = pdf.splitTextToSize(`Clinical Observations: ${obsEntries.join('  |  ')}`, contentWidth);
      ensureSpace(obsLines.length * 4 + 2);
      pdf.text(obsLines, margin, y);
      y += obsLines.length * 4 + 2;
    }
    y += 2;
  }

  // Rx Section Heading
  ensureSpace(14);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13);
  pdf.setTextColor(2, 132, 199);
  pdf.text('Rx', margin, y + 1);
  pdf.setFontSize(9.5);
  pdf.setTextColor(11, 25, 44);
  pdf.text('Prescribed Medicines', margin + 9, y + 1);
  y += 5;

  // Table Header
  pdf.setFillColor(241, 245, 249);
  pdf.rect(margin, y, contentWidth, 7, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(51, 65, 85);
  pdf.text('#', margin + 2, y + 4.7);
  pdf.text('Medicine & Strength', margin + 8, y + 4.7);
  pdf.text('Dosage / Frequency / Timing', margin + 80, y + 4.7);
  pdf.text('Duration', margin + 136, y + 4.7);
  pdf.text('Qty', margin + 162, y + 4.7);
  y += 9;

  // Medicines Rows
  prescription.medicines.forEach((med, idx) => {
    const titleText = `${med.medicineName}${med.strength ? ` (${med.strength})` : ''}`;
    const subMeta = [med.dosageForm, med.route].filter(Boolean).join(' · ');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    const titleLines = pdf.splitTextToSize(titleText, 69);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.8);
    const subLines = subMeta ? pdf.splitTextToSize(subMeta, 69) : [];

    const regimeText = `${med.dosageDisplay} — ${med.frequencyLabel}\n${med.timing}`;
    const regimeLines = pdf.splitTextToSize(regimeText, 53);

    const durLines = pdf.splitTextToSize(med.durationText || 'As directed', 24);
    const qtyLines = pdf.splitTextToSize(med.quantityDisplay || '—', 24);

    const instrLines = med.specialInstructions
      ? pdf.splitTextToSize(`Instructions: ${med.specialInstructions}`, contentWidth - 10)
      : [];

    const medColLineCount = titleLines.length + subLines.length;
    const maxLines = Math.max(medColLineCount, regimeLines.length, durLines.length, qtyLines.length);
    const rowHeight = maxLines * 3.9 + (instrLines.length > 0 ? instrLines.length * 3.7 + 1.5 : 0) + 4;
    ensureSpace(rowHeight + 2);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    pdf.setTextColor(11, 25, 44);
    pdf.text(`${idx + 1}.`, margin + 2, y + 3.5);
    pdf.text(titleLines, margin + 8, y + 3.5);

    if (subLines.length > 0) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.8);
      pdf.setTextColor(71, 85, 105);
      pdf.text(subLines, margin + 8, y + 3.5 + titleLines.length * 3.8);
    }

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.3);
    pdf.setTextColor(15, 23, 42);
    pdf.text(regimeLines, margin + 80, y + 3.5);
    pdf.text(durLines, margin + 136, y + 3.5);

    pdf.setFont('helvetica', 'bold');
    pdf.text(qtyLines, margin + 162, y + 3.5);

    if (instrLines.length > 0) {
      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(7.8);
      pdf.setTextColor(71, 85, 105);
      pdf.text(instrLines, margin + 8, y + maxLines * 3.9 + 2);
    }

    y += rowHeight;
    pdf.setDrawColor(226, 232, 240);
    pdf.setLineWidth(0.2);
    pdf.line(margin, y - 1, pageWidth - margin, y - 1);
    y += 1.5;
  });

  // General Instructions & Advice
  if (prescription.generalInstructions.length > 0 || consultation.doctorAdvice?.trim()) {
    y += 3;
    ensureSpace(16);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(11, 25, 44);
    pdf.text('General Instructions & Advice', margin, y);
    y += 4.5;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(51, 65, 85);

    prescription.generalInstructions.forEach((instr) => {
      const lines = pdf.splitTextToSize(`• ${instr}`, contentWidth);
      ensureSpace(lines.length * 4 + 1);
      pdf.text(lines, margin, y);
      y += lines.length * 4 + 0.8;
    });

    if (consultation.doctorAdvice?.trim()) {
      const advLines = pdf.splitTextToSize(`Doctor Advice: ${consultation.doctorAdvice.trim()}`, contentWidth);
      ensureSpace(advLines.length * 4 + 2);
      pdf.text(advLines, margin, y);
      y += advLines.length * 4 + 1.5;
    }
  }

  // Follow-up Recommendation
  if (prescription.followUpRecommendation || prescription.followUpDate) {
    y += 2;
    ensureSpace(12);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.8);
    pdf.setTextColor(2, 132, 199);
    const fuParts = [
      prescription.followUpRecommendation,
      prescription.followUpDate ? `Scheduled date: ${prescription.followUpDate}` : '',
    ].filter(Boolean);
    const fuLines = pdf.splitTextToSize(`Follow-up: ${fuParts.join(' · ')}`, contentWidth);
    pdf.text(fuLines, margin, y);
    y += fuLines.length * 4 + 3;
  }

  // Signature / Verification Footer
  ensureSpace(26);
  const footerY = Math.max(y + 8, pageHeight - 36);
  pdf.setDrawColor(203, 213, 225);
  pdf.setLineWidth(0.3);
  pdf.line(margin, footerY, pageWidth - margin, footerY);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.8);
  pdf.setTextColor(100, 116, 139);
  if (prescription.status === 'finalized' && prescription.signedAt) {
    pdf.text(
      `Confirmed & finalized in Cliniqo by Dr. ${docName.replace(/^Dr\.?\s*/i, '')} (${prescription.signedByUid || prescription.doctorId})`,
      margin,
      footerY + 5,
    );
    pdf.text(
      `Finalized Timestamp: ${prescription.signedAt.toDate().toLocaleString('en-IN')}`,
      margin,
      footerY + 9,
    );
  } else {
    pdf.text('Status: Draft Prescription (Awaiting doctor review & confirmation)', margin, footerY + 5);
  }

  if (prescription.amendmentReason) {
    pdf.text(`Amendment Note (v${prescription.version}): ${prescription.amendmentReason}`, margin, footerY + 13);
  }

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.setTextColor(11, 25, 44);
  pdf.text(`Dr. ${docName.replace(/^Dr\.?\s*/i, '')}`, rightX, footerY + 7, { align: 'right' });
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.8);
  pdf.setTextColor(71, 85, 105);
  if (doctor?.registrationNumber) {
    pdf.text(`Reg. No: ${doctor.registrationNumber}`, rightX, footerY + 11, { align: 'right' });
  }

  const safeFilename = `Prescription_${prescription.prescriptionNumber}_${patient.patientId}.pdf`;
  pdf.save(safeFilename);
}
