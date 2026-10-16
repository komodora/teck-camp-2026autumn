import { getDataSource, getExternalDate } from "../../lib/dataSource.js";
import { chatPath } from "./chatPath.js";

export async function sendChatMessage({ message, history }) {
  const source = getDataSource();
  const date = source === "external" ? getExternalDate() : "";
  const response = await fetch(chatPath, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, history, source, date }),
  });
  const payload = await readChatResponse(response);
  if (!response.ok) {
    throw new Error(payload?.error ?? "応答を取得できませんでした。");
  }
  return payload?.reply ?? "";
}

async function readChatResponse(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
