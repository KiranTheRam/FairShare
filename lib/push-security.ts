import { ApiError } from "./http";

const DEFAULT_PUSH_HOSTS = [
  "fcm.googleapis.com",
  ".push.services.mozilla.com",
  "web.push.apple.com",
  ".notify.windows.com",
];

function allowedHosts() {
  const configured = (process.env.PUSH_ALLOWED_HOSTS ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  return [...DEFAULT_PUSH_HOSTS, ...configured];
}

function matchesHost(hostname: string, allowed: string) {
  return allowed.startsWith(".") ? hostname.endsWith(allowed) && hostname.length > allowed.length : hostname === allowed;
}

export function isAllowedPushEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    const hostname = url.hostname.toLowerCase();
    return url.protocol === "https:"
      && !url.username
      && !url.password
      && (!url.port || url.port === "443")
      && allowedHosts().some((allowed) => matchesHost(hostname, allowed));
  } catch {
    return false;
  }
}

export function requireAllowedPushEndpoint(endpoint: string) {
  if (!isAllowedPushEndpoint(endpoint)) throw new ApiError(400, "Unsupported push service endpoint", "invalid_push_endpoint");
}
