import "server-only";
import webPush from "web-push";
import { and, eq, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { householdMemberships, notificationPreferences, notifications, pushSubscriptions, users } from "@/db/schema";
import { isAllowedPushEndpoint } from "./push-security";

let configured = false;
function configurePush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!configured && publicKey && privateKey && subject) {
    webPush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
  }
  return configured;
}

export async function notifyUser(input: { householdId: string; userId: string; type: string; title: string; body: string; targetPath?: string }) {
  const [preference] = await getDb().select().from(notificationPreferences).where(eq(notificationPreferences.userId, input.userId)).limit(1);
  if (input.type === "payment" && preference?.paymentsEnabled === false) return;
  if (input.type === "bill" && preference?.billsEnabled === false) return;
  if (input.type === "balance" && preference?.balanceChangesEnabled === false) return;
  await getDb().insert(notifications).values(input);
  if (!configurePush()) return;
  const subscriptions = await getDb().select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, input.userId));
  await Promise.all(subscriptions.map(async (subscription) => {
    if (!isAllowedPushEndpoint(subscription.endpoint)) {
      await getDb().delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscription.id));
      return;
    }
    try {
      await webPush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({ title: input.title, body: input.body, url: input.targetPath ?? "/" }), { TTL: 86_400, timeout: 10_000 });
    } catch (error) {
      const status = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
      if (status === 404 || status === 410) await getDb().delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscription.id));
      else console.error("Push notification failed", error);
    }
  }));
}

export async function notifyHousehold(input: { householdId: string; excludeUserId?: string; type: "bill" | "payment" | "balance"; title: string; body: string; targetPath?: string }) {
  const recipients = await getDb().select({
    userId: householdMemberships.userId,
    billsEnabled: notificationPreferences.billsEnabled,
    paymentsEnabled: notificationPreferences.paymentsEnabled,
    balanceChangesEnabled: notificationPreferences.balanceChangesEnabled,
  }).from(householdMemberships)
    .innerJoin(users, and(eq(users.id, householdMemberships.userId), eq(users.status, "active")))
    .leftJoin(notificationPreferences, eq(notificationPreferences.userId, householdMemberships.userId))
    .where(input.excludeUserId ? and(eq(householdMemberships.householdId, input.householdId), ne(householdMemberships.userId, input.excludeUserId)) : eq(householdMemberships.householdId, input.householdId));
  for (const recipient of recipients) {
    const enabled = input.type === "bill" ? recipient.billsEnabled !== false : input.type === "payment" ? recipient.paymentsEnabled !== false : recipient.balanceChangesEnabled !== false;
    if (enabled) await notifyUser({ ...input, userId: recipient.userId });
  }
}
