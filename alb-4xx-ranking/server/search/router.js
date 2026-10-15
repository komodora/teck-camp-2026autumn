import { sendJson } from "../sendJson.js";
import { accessLogSearchPath } from "../../src/features/report/searchPath.js";
import { searchAccessLogs } from "./searchAccessLogs.js";

export async function handleSearchRequest(request, response, { store, searchAccessLogs: search = searchAccessLogs }) {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (request.method !== "GET" || url.pathname !== accessLogSearchPath) return false;

  const records = await search(store);
  sendJson(response, 200, { records });
  return true;
}
