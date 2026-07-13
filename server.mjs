import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, normalize, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import worker from "./dist/server/index.js";

const host = process.env.HOSTNAME || "0.0.0.0";
const port = Number.parseInt(process.env.PORT || "3000", 10);
const clientRoot = resolve("dist/client");

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webmanifest", "application/manifest+json"],
  [".webp", "image/webp"],
  [".woff2", "font/woff2"],
]);

function toSafeFile(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const candidate = resolve(clientRoot, `.${normalize(decoded)}`);
  if (candidate !== clientRoot && !candidate.startsWith(`${clientRoot}${sep}`)) return null;
  return candidate;
}

async function readAsset(request) {
  const url = new URL(request.url);
  const file = toSafeFile(url.pathname);
  if (!file) return new Response("Bad Request", { status: 400 });
  try {
    const info = await stat(file);
    if (!info.isFile()) return new Response("Not Found", { status: 404 });
    const bytes = await import("node:fs/promises").then(({ readFile }) => readFile(file));
    return new Response(bytes, {
      headers: {
        "Content-Length": String(info.size),
        "Content-Type": contentTypes.get(extname(file).toLowerCase()) || "application/octet-stream",
      },
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}

async function serveStatic(req, res, pathname) {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  const file = toSafeFile(pathname);
  if (!file) return false;
  try {
    const info = await stat(file);
    if (!info.isFile()) return false;
    res.statusCode = 200;
    res.setHeader("Content-Type", contentTypes.get(extname(file).toLowerCase()) || "application/octet-stream");
    res.setHeader("Content-Length", String(info.size));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    if (pathname.startsWith("/assets/")) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    if (req.method === "HEAD") return void res.end(), true;
    createReadStream(file).pipe(res);
    return true;
  } catch {
    return false;
  }
}

function requestUrl(req) {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol = typeof forwardedProto === "string" ? forwardedProto.split(",", 1)[0] : "http";
  const authority = req.headers.host || `127.0.0.1:${port}`;
  return new URL(req.url || "/", `${protocol}://${authority}`);
}

function toWebRequest(req, url) {
  const method = req.method || "GET";
  const body = method === "GET" || method === "HEAD" ? undefined : Readable.toWeb(req);
  return new Request(url, { method, headers: req.headers, body, duplex: body ? "half" : undefined });
}

async function sendWebResponse(response, res) {
  res.statusCode = response.status;
  res.statusMessage = response.statusText;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  if (!response.body) return res.end();
  Readable.fromWeb(response.body).pipe(res);
}

const server = createServer(async (req, res) => {
  try {
    const url = requestUrl(req);
    if (await serveStatic(req, res, url.pathname)) return;
    const response = await worker.fetch(
      toWebRequest(req, url),
      { ASSETS: { fetch: readAsset } },
      { waitUntil() {}, passThroughOnException() {} },
    );
    await sendWebResponse(response, res);
  } catch (error) {
    console.error("Request failed", error instanceof Error ? error.message : "Unknown error");
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Internal Server Error");
  }
});

server.listen(port, host, () => console.log(`FairShare listening on http://${host}:${port}`));

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
