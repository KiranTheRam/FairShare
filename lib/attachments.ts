import "server-only";

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_BILL = 10;

// Only formats a receipt or invoice realistically arrives in. Each entry is
// verified against the file's leading bytes so a mislabeled upload is rejected.
const SIGNATURES: Record<string, (bytes: Uint8Array) => boolean> = {
  "image/jpeg": (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  "image/webp": (b) => b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  "image/gif": (b) => b.length > 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38,
  "application/pdf": (b) => b.length > 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46,
};

export const ALLOWED_ATTACHMENT_TYPES = Object.keys(SIGNATURES);

export function isAllowedAttachment(contentType: string, bytes: Uint8Array) {
  const check = SIGNATURES[contentType];
  return Boolean(check?.(bytes));
}

export function sanitizeFileName(name: string) {
  const trimmed = name.replace(/[/\\]/g, " ").replace(/[\r\n\t"';]/g, "").trim().slice(0, 160);
  return trimmed || "attachment";
}
