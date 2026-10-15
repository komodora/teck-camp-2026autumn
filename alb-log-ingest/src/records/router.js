import { HttpError } from "../httpError.js";
import { sendJson } from "../sendJson.js";

const UPLOAD_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$/;

export async function handleRecordsRequest(request, response, { store }) {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (request.method !== "GET" || url.pathname !== "/access-logs") return false;

  const uploadId = url.searchParams.get("uploadId");
  const records = uploadId === null ? await store.loadAll() : await loadUpload(store, uploadId);
  sendJson(response, 200, { records: records.sort(byRequestTime) });
  return true;
}

async function loadUpload(store, uploadId) {
  if (!UPLOAD_ID_PATTERN.test(uploadId)) {
    throw new HttpError(400, "uploadId の形式が不正です。");
  }
  const records = await store.load(uploadId);
  if (records === null) throw new HttpError(404, "指定した取り込みが見つかりません。");
  return records;
}

function byRequestTime(left, right) {
  const timeOrder = Date.parse(left.request_time_utc) - Date.parse(right.request_time_utc);
  if (timeOrder !== 0) return timeOrder;
  return left.request_time_utc.localeCompare(right.request_time_utc);
}
