import { chatPath } from "./chatPath.js";

export async function sendChatMessage({ message, history }) {
  const response = await fetch(chatPath, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, history }),
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
