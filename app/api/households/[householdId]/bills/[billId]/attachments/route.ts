import { and, count, eq, isNull } from "drizzle-orm";
import { NextRequest } from "next/server";
import { getDb } from "@/db";
import { billAttachments, billChangeHistory, bills } from "@/db/schema";
import { apiRoute } from "@/lib/api";
import { requireMutationUser } from "@/lib/auth";
import { requireFinancialAccess, writeAudit } from "@/lib/access";
import { ApiError, requireUuid } from "@/lib/http";
import { ALLOWED_ATTACHMENT_TYPES, isAllowedAttachment, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_PER_BILL, sanitizeFileName } from "@/lib/attachments";

export async function POST(request: NextRequest, context: { params: Promise<{ householdId: string; billId: string }> }) {
  return apiRoute(async () => {
    const user = await requireMutationUser(request);
    const { householdId, billId } = await context.params;
    await requireFinancialAccess(user, householdId);
    requireUuid(billId, "bill identifier");
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_ATTACHMENT_BYTES + 8_192) throw new ApiError(413, "Attachments are limited to 5 MB", "attachment_too_large");
    const form = await request.formData().catch(() => { throw new ApiError(400, "A multipart file upload is required", "invalid_upload"); });
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "A multipart file upload is required", "invalid_upload");
    if (file.size === 0 || file.size > MAX_ATTACHMENT_BYTES) throw new ApiError(413, "Attachments must be between 1 byte and 5 MB", "attachment_too_large");
    if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type)) throw new ApiError(415, "Only JPEG, PNG, WebP, GIF, and PDF attachments are supported", "unsupported_attachment_type");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!isAllowedAttachment(file.type, bytes)) throw new ApiError(415, "The file content does not match its declared type", "attachment_content_mismatch");
    const fileName = sanitizeFileName(file.name);
    const attachment = await getDb().transaction(async (tx) => {
      const [bill] = await tx.select({ id: bills.id }).from(bills).where(and(eq(bills.id, billId), eq(bills.householdId, householdId), isNull(bills.deletedAt))).limit(1);
      if (!bill) throw new ApiError(404, "Bill not found", "not_found");
      const [existing] = await tx.select({ value: count() }).from(billAttachments).where(eq(billAttachments.billId, billId));
      if (Number(existing?.value ?? 0) >= MAX_ATTACHMENTS_PER_BILL) throw new ApiError(409, `A bill may hold at most ${MAX_ATTACHMENTS_PER_BILL} attachments`, "attachment_limit_reached");
      const [created] = await tx.insert(billAttachments).values({ billId, uploadedByUserId: user.id, fileName, contentType: file.type, sizeBytes: bytes.byteLength, data: Buffer.from(bytes) }).returning({ id: billAttachments.id, fileName: billAttachments.fileName, contentType: billAttachments.contentType, sizeBytes: billAttachments.sizeBytes, createdAt: billAttachments.createdAt });
      await tx.insert(billChangeHistory).values({ billId, changedByUserId: user.id, changeType: "attachment_added", afterValue: { attachmentId: created.id, fileName } });
      return created;
    });
    await writeAudit(request, user, "bill.attachment_added", "bill_attachment", attachment.id, householdId, { fileName, sizeBytes: attachment.sizeBytes });
    return { attachment };
  }, 201);
}
