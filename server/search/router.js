import { sendJson } from "../sendJson.js";
import { HttpError } from "../httpError.js";
import { accessLogSearchPath } from "../../src/features/report/searchPath.js";
import { parseDateParam } from "../externalQuery/albQueryApiStore.js";
import { searchAccessLogs } from "./searchAccessLogs.js";

export async function handleSearchRequest(
  request,
  response,
  { storedStore, externalStore, searchAccessLogs: search = searchAccessLogs },
) {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (request.method !== "GET" || url.pathname !== accessLogSearchPath) return false;

  const isExternal = url.searchParams.get("source") === "external";
  const store = isExternal ? externalStore : storedStore;
  const date = isExternal ? parseDateParam(url.searchParams.get("date")) : null;
  if (date === false) throw new HttpError(400, "日付の形式が正しくありません(YYYY-MM-DD)。");

  const records = await search(store, { date });
  sendJson(response, 200, { records });
  return true;
}
