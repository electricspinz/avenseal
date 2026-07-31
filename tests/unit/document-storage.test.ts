import { describe, expect, it } from "vitest";
import { appointmentDocumentStorage, appointmentDocumentStorageKey, privateAppointmentDocumentStorage, validateAppointmentDocumentUploadMetadata } from "@/lib/server/document-storage";

describe("appointment document storage configuration", () => {
  it("uses an opaque, tenant- and appointment-scoped private storage key", () => {
    const key = appointmentDocumentStorageKey({ organizationId: "org-1", appointmentId: "appointment-1", documentId: "document-1" });
    expect(key).toBe("organizations/org-1/appointments/appointment-1/documents/document-1");
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
