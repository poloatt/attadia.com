import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { handleHqApi, loadDotenv } from "./lib/hqAuth.mjs";

loadDotenv();

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4170);

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function serveStatic(req, res) {
  let pathname = new URL(req.url, "http://localhost").pathname;
  if (pathname === "/") pathname = "/index.html";
  const file = join(root, pathname.replace(/^\/+/, ""));
  const resolved = file;
  if (!resolved.startsWith(root) || !existsSync(resolved)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  const type = types[extname(file)] || "application/octet-stream";
  res.writeHead(200, {
    "Content-Type": type,
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
  });
  res.end(readFileSync(file));
}

const server = createServer(async (req, res) => {
  if (await handleHqApi(req, res)) return;
  if (req.method === "GET" || req.method === "HEAD") {
    serveStatic(req, res);
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(port, () => {
  console.log(`HQ http://localhost:${port}`);
});
