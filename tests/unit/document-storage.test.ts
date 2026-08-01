import { describe, expect, it } from "vitest";
import { appointmentDocumentStorage, appointmentDocumentStorageKey, privateAppointmentDocumentStorage, validateAppointmentDocumentSignature, validateAppointmentDocumentUploadMetadata } from "@/lib/server/document-storage";

describe("appointment document storage configuration", () => {
  it("uses an opaque, tenant- and appointment-scoped private storage key", () => {
    const key = appointmentDocumentStorageKey({ organizationId: "org-1", appointmentId: "appointment-1", documentId: "document-1" });
    expect(key).toBe("quarantine/organizations/org-1/appointments/appointment-1/document-1");
    expect(key).not.toContain("customer-file.pdf");
    expect(privateAppointmentDocumentStorage).toMatchObject({ bucket: "appointment-documents" });
    expect(appointmentDocumentStorage.maximumSizeBytes).toBe(10 * 1024 * 1024);
  });

  it("accepts only the configured type, extension, and non-empty size combinations", () => {
    expect(validateAppointmentDocumentUploadMetadata({ originalFilename: "power-of-attorney.pdf", contentType: "application/pdf", sizeBytes: 1024 })).toEqual({ originalFilename: "power-of-attorney.pdf", contentType: "application/pdf", sizeBytes: 1024 });
    expect(validateAppointmentDocumentUploadMetadata({ originalFilename: "id.JPEG", contentType: "image/jpeg", sizeBytes: 1 })).toMatchObject({ contentType: "image/jpeg" });
  });

  it("rejects unsupported, unsafe, mismatched, empty, and oversized metadata", () => {
    expect(() => validateAppointmentDocumentUploadMetadata({ originalFilename: "document.exe", contentType: "application/pdf", sizeBytes: 1 })).toThrow(/extension/i);
    expect(() => validateAppointmentDocumentUploadMetadata({ originalFilename: "../document.pdf", contentType: "application/pdf", sizeBytes: 1 })).toThrow(/unsupported characters/i);
    expect(() => validateAppointmentDocumentUploadMetadata({ originalFilename: "document.pdf", contentType: "image/png", sizeBytes: 1 })).toThrow(/extension/i);
    expect(() => validateAppointmentDocumentUploadMetadata({ originalFilename: "document.pdf", contentType: "application/pdf", sizeBytes: 0 })).toThrow();
    expect(() => validateAppointmentDocumentUploadMetadata({ originalFilename: "document.pdf", contentType: "application/pdf", sizeBytes: appointmentDocumentStorage.maximumSizeBytes + 1 })).toThrow();
  });
});

it("requires PDF, JPEG, and PNG signatures to match the declared type", () => {
  expect(() => validateAppointmentDocumentSignature("application/pdf", new TextEncoder().encode("%PDF-1.7").buffer)).not.toThrow();
  expect(() => validateAppointmentDocumentSignature("image/jpeg", new Uint8Array([0xff, 0xd8, 0xff]).buffer)).not.toThrow();
  expect(() => validateAppointmentDocumentSignature("image/png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer)).not.toThrow();
  expect(() => validateAppointmentDocumentSignature("application/pdf", new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)).toThrow();
});
