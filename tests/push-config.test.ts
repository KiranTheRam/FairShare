import assert from "node:assert/strict";
import test from "node:test";
import { configuredVapidPublicKey } from "../lib/push-config";

test("Web Push is exposed only when the complete VAPID configuration is present", () => {
  const complete = { VAPID_SUBJECT: "mailto:admin@example.com", VAPID_PUBLIC_KEY: "public", VAPID_PRIVATE_KEY: "private" };
  assert.equal(configuredVapidPublicKey(complete), "public");
  assert.equal(configuredVapidPublicKey({ ...complete, VAPID_SUBJECT: "" }), null);
  assert.equal(configuredVapidPublicKey({ ...complete, VAPID_PUBLIC_KEY: "" }), null);
  assert.equal(configuredVapidPublicKey({ ...complete, VAPID_PRIVATE_KEY: "" }), null);
});
