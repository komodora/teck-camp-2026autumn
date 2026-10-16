import { sendJson } from "../sendJson.js";
import { HttpError } from "../httpError.js";
import { readJsonBody } from "../readJsonBody.js";
import { chatPath } from "../../src/features/chat/chatPath.js";
import { parseDateParam } from "../externalQuery/albQueryApiStore.js";
import { createAccessLogSearch } from "./accessLogSearchTool.js";
import { buildAnalysisContext } from "./buildAnalysisContext.js";
import { askClaude } from "./askClaude.js";

export async function handleChatRequest(
  request,
  response,
  { storedStore, externalStore, askClaude: ask = askClaude },
) {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (request.method !== "POST" || url.pathname !== chatPath) return false;

  const body = await readJsonBody(request);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (message === "") throw new HttpError(400, "質問を入力してください。");
  const history = Array.isArray(body?.history) ? body.history : [];
  const isExternal = body?.source === "external";
  const store = isExternal ? externalStore : storedStore;
  const date = isExternal ? parseDateParam(body?.date) : null;
  if (date === false) throw new HttpError(400, "日付の形式が正しくありません(YYYY-MM-DD)。");
  const loadOptions = { date };

  const contextForPrompt = await buildAnalysisContext(store, loadOptions);
  const searchAccessLogs = createAccessLogSearch(store, loadOptions);
  const reply = await ask({ message, history, contextForPrompt, searchAccessLogs, includeMcpTools: isExternal });
  sendJson(response, 200, { reply });
  return true;
}
