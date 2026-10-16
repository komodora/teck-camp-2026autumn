import { HttpError } from "./httpError.js";

const MAX_BODY_BYTES = 64 * 1024;

export async function readJsonBody(request) {
  const chunks = [];
  let received = 0;
  for await (const chunk of request) {
    received += chunk.length;
    if (received > MAX_BODY_BYTES) {
      throw new HttpError(413, "リクエストが大きすぎます。");
    }
    chunks.push(chunk);
  }

  const text = Buffer.concat(chunks).toString("utf8");
  if (text.trim() === "") return {};

  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "JSON の形式が不正です。");
  }
}
