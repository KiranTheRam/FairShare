import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { billAttachments, billChangeHistory, bills } from "@/db/schema";
import { apiRoute } from "@/lib/api";
import { requireMutationUser, requireRequestUser } from "@/lib/auth";
import { requireFinancialAccess, writeAudit } from "@/lib/access";
import { ApiError, requireUuid } from "@/lib/http";

async function attachmentForRequest(householdId: string, billId: string, attachmentId: string) {
  requireUuid(billId, "bill identifier");
  requireUuid(attachmentId, "attachment identifier");
  const [row] = await getDb().select({ attachment: billAttachments }).from(billAttachments)
    .innerJoin(bills, and(eq(bills.id, billAttachments.billId), eq(bills.householdId, householdId)))
    .where(and(eq(billAttachments.id, attachmentId), eq(billAttachments.billId, billId))).limit(1);
  if (!row) throw new ApiError(404, "Attachment not found", "not_found");
  return row.attachment;
}

export async function GET(request: NextRequest, context: { params: Promise<{ householdId: string; billId: string; attachmentId: string }> }) {
  try {
    const user = await requireRequestUser(request);
    const { householdId, billId, attachmentId } = await context.params;
    await requireFinancialAccess(user, householdId);
    const attachment = await attachmentForRequest(householdId, billId, attachmentId);
    const inline = attachment.contentType.startsWith("image/");
    return new NextResponse(new Uint8Array(attachment.data), {
      headers: {
        "Content-Type": attachment.contentType,
        "Content-Length": String(attachment.sizeBytes),
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${attachment.fileName.replace(/[^\w.\- ]/g, "_")}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    return apiRoute(async () => { throw error; });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ householdId: string; billId: string; attachmentId: string }> }) {
  return apiRoute(async () => {
    const user = await requireMutationUser(request);
    const { householdId, billId, attachmentId } = await context.params;
    await requireFinancialAccess(user, householdId);
    const attachment = await attachmentForRequest(householdId, billId, attachmentId);
    await getDb().transaction(async (tx) => {
      await tx.delete(billAttachments).where(eq(billAttachments.id, attachmentId));
      await tx.insert(billChangeHistory).values({ billId, changedByUserId: user.id, changeType: "attachment_removed", beforeValue: { attachmentId, fileName: attachment.fileName } });
    });
    await writeAudit(request, user, "bill.attachment_removed", "bill_attachment", attachmentId, householdId, { fileName: attachment.fileName });
    return { ok: true };
  });
}
