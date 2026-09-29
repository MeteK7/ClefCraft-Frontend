import { HttpErrorResponse } from '@angular/common/http';

/**
 * Calendar attachment upload limits. Mirrors AttachmentLimits in ClefCraft.Application
 * (Features/Calendar/Commands/UploadCalendarAttachment) — the server enforces them; this copy
 * only lets the dialog explain a rejection before the user saves. Any file type is allowed.
 */
export const ATTACHMENT_LIMITS = {
  maxFilesPerUpload: 10,
  maxFileSizeBytes: 100 * 1024 * 1024,
  maxUploadSizeBytes: 500 * 1024 * 1024
} as const;

const MB = 1024 * 1024;

/**
 * Splits newly picked files into those that can join the already-staged ones and a message for
 * any that can't. Files are taken in order until a limit would be exceeded.
 */
export function stageWithinLimits(staged: File[], picked: File[]): { accepted: File[]; error: string | null } {
  const accepted: File[] = [];
  const problems: string[] = [];
  let count = staged.length;
  let total = staged.reduce((sum, f) => sum + f.size, 0);

  for (const file of picked) {
    if (file.size === 0) {
      problems.push(`"${file.name}" is empty.`);
    } else if (file.size > ATTACHMENT_LIMITS.maxFileSizeBytes) {
      problems.push(`"${file.name}" is larger than ${ATTACHMENT_LIMITS.maxFileSizeBytes / MB} MB.`);
    } else if (count + 1 > ATTACHMENT_LIMITS.maxFilesPerUpload) {
      problems.push(`You can upload at most ${ATTACHMENT_LIMITS.maxFilesPerUpload} files at a time.`);
    } else if (total + file.size > ATTACHMENT_LIMITS.maxUploadSizeBytes) {
      problems.push(`An upload can be at most ${ATTACHMENT_LIMITS.maxUploadSizeBytes / MB} MB in total.`);
    } else {
      accepted.push(file);
      count++;
      total += file.size;
    }
  }

  return { accepted, error: problems.length ? [...new Set(problems)].join(' ') : null };
}

/** A readable reason for a rejected upload, from the API's problem response when it has one. */
export function uploadFailureMessage(err: HttpErrorResponse): string {
  const errors = err.error?.errors as Record<string, string[]> | null | undefined;
  const firstError = errors ? Object.values(errors).flat()[0] : undefined;

  if (firstError) return `Attachments not uploaded: ${firstError}`;
  if (err.status === 413) return 'Attachments not uploaded: the upload is too large.';
  return 'Attachments could not be uploaded. Please try again.';
}
