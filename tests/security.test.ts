import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { clientIp, requireUuid } from "../lib/http";
import { isAllowedPushEndpoint } from "../lib/push-security";

test("clientIp ignores an untrusted X-Forwarded-For chain", () => {
  const request = new NextRequest("https://fairshare.example.com", {
    headers: { "x-forwarded-for": "203.0.113.10", "x-real-ip": "198.51.100.20" },
  });
  assert.equal(clientIp(request), "198.51.100.20");
});

test("clientIp prefers the Cloudflare-authenticated connecting address", () => {
  const request = new NextRequest("https://fairshare.example.com", {
    headers: { "cf-connecting-ip": "192.0.2.30", "x-real-ip": "198.51.100.20" },
  });
  assert.equal(clientIp(request), "192.0.2.30");
});

test("push endpoints are restricted to HTTPS browser push services", () => {
  assert.equal(isAllowedPushEndpoint("https://fcm.googleapis.com/fcm/send/example"), true);
  assert.equal(isAllowedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/example"), true);
  assert.equal(isAllowedPushEndpoint("https://127.0.0.1/internal"), false);
  assert.equal(isAllowedPushEndpoint("https://fcm.googleapis.com.attacker.example/send"), false);
  assert.equal(isAllowedPushEndpoint("http://fcm.googleapis.com/fcm/send/example"), false);
});

test("route identifiers must be UUIDs", () => {
  assert.equal(requireUuid("9be9a297-7d9b-4b9a-a50b-e843b8b264d7"), "9be9a297-7d9b-4b9a-a50b-e843b8b264d7");
  assert.throws(() => requireUuid("not-a-uuid"), /Invalid identifier/);
});
