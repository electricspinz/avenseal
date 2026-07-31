import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

export const appointmentDocumentStorage = {
  bucket: "appointment-documents",
  maximumSizeBytes: 10 * 1024 * 1024,
  allowedContentTypes: ["application/pdf", "image/jpeg", "image/png"] as const,
  allowedExtensions: [".pdf", ".jpg", ".jpeg", ".png"] as const
} as const;

export type AppointmentDocumentContentType = (typeof appointmentDocumentStorage.allowedContentTypes)[number];
export type AppointmentDocumentUploadMetadata = Readonly<{ originalFilename: string; contentType: AppointmentDocumentContentType; sizeBytes: number }>;

const extensionForContentType: Record<AppointmentDocumentContentType, readonly string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"]
};

function extensionFor(filename: string) {
  const index = filename.lastIndexOf(".");
  return index >= 0 ? filename.slice(index).toLowerCase() : "";
}

const uploadMetadataSchema = z.object({
  originalFilename: z.string().trim().min(1).max(255).refine((filename) => !/[\\/\u0000-\u001f]/.test(filename), "Filename contains unsupported characters."),
  contentType: z.enum(appointmentDocumentStorage.allowedContentTypes),
  sizeBytes: z.number().int().positive().max(appointmentDocumentStorage.maximumSizeBytes)
}).superRefine((input, context) => {
  if (!extensionForContentType[input.contentType].includes(extensionFor(input.originalFilename))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["originalFilename"], message: "Filename extension does not match the content type." });
  }
});

export function validateAppointmentDocumentUploadMetadata(input: unknown): AppointmentDocumentUploadMetadata {
  return uploadMetadataSchema.parse(input);
}

/** Object names are opaque, server-generated paths; customer filenames never control storage location. */
export function appointmentDocumentStorageKey(input: { organizationId: string; appointmentId: string; documentId: string }) {
  return `organizations/${input.organizationId}/appointments/${input.appointmentId}/documents/${input.documentId}`;
}

/** The server-only storage contract for a future upload/download route. This sprint does not invoke it. */
export type PrivateAppointmentDocumentStorage = Readonly<{
  bucket: typeof appointmentDocumentStorage.bucket;
  keyFor: (input: { organizationId: string; appointmentId: string; documentId: string }) => string;
}>;

export const privateAppointmentDocumentStorage: PrivateAppointmentDocumentStorage = {
  bucket: appointmentDocumentStorage.bucket,
  keyFor: appointmentDocumentStorageKey
};

export type AppointmentDocumentObjectStorage = Readonly<{
  upload: (input: { key: string; body: ArrayBuffer; contentType: AppointmentDocumentContentType }) => Promise<void>;
  download: (key: string) => Promise<ArrayBuffer>;
  remove: (key: string) => Promise<void>;
}>;

/** Server-only adapter for the private bucket. No browser caller receives this boundary or an object key. */
export function createSupabaseAppointmentDocumentStorage(supabase: SupabaseClient): AppointmentDocumentObjectStorage {
  return {
    async upload(input) {
      const { error } = await supabase.storage.from(appointmentDocumentStorage.bucket).upload(input.key, input.body, { contentType: input.contentType, upsert: false });
      if (error) throw new Error("Document storage upload failed.");
    },
    async download(key) {
      const { data, error } = await supabase.storage.from(appointmentDocumentStorage.bucket).download(key);
      if (error || !data) throw new Error("Document storage download failed.");
      return data.arrayBuffer();
    },
    async remove(key) {
      const { error } = await supabase.storage.from(appointmentDocumentStorage.bucket).remove([key]);
      if (error) throw new Error("Document storage cleanup failed.");
    }
  };
}
