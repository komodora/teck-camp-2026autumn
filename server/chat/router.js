import { sendJson } from "../sendJson.js";
import { HttpError } from "../httpError.js";
import { readJsonBody } from "../readJsonBody.js";
import { chatPath } from "../../src/features/chat/chatPath.js";
import { buildAnalysisContext } from "./buildAnalysisContext.js";
import { askClaude } from "./askClaude.js";

export async function handleChatRequest(request, response, { store, askClaude: ask = askClaude }) {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (request.method !== "POST" || url.pathname !== chatPath) return false;

  const body = await readJsonBody(request);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (message === "") throw new HttpError(400, "質問を入力してください。");
  const history = Array.isArray(body?.history) ? body.history : [];

  const contextForPrompt = await buildAnalysisContext(store);
  const reply = await ask({ message, history, contextForPrompt });
  sendJson(response, 200, { reply });
  return true;
}
