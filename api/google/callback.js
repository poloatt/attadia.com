import { handleHqApi, loadDotenv } from "../../lib/hqAuth.mjs";

loadDotenv();

export default async function handler(req, res) {
  if (!req.url || !String(req.url).includes("/api/google/callback")) {
    const q = req.url && req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    req.url = "/api/google/callback" + q;
  }
  const handled = await handleHqApi(req, res);
  if (!handled) {
    res.statusCode = 404;
    res.end();
  }
}
