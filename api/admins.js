import { handleHqApi, loadDotenv } from "../lib/hqAuth.mjs";

loadDotenv();

export default async function handler(req, res) {
  const handled = await handleHqApi(req, res);
  if (!handled) {
    res.statusCode = 404;
    res.end();
  }
}
