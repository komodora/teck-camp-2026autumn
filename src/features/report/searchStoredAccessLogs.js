import { getDataSource, getExternalDate } from "../../lib/dataSource.js";
import { accessLogSearchPath } from "./searchPath.js";

// 画面は保存先を知らない。DB が外部サービスになっても、このリクエスト先を差し替えるだけで同じレコードを受け取れる。
export async function searchStoredAccessLogs() {
  const source = getDataSource();
  const params = new URLSearchParams({ source });
  if (source === "external" && getExternalDate() !== "") {
    params.set("date", getExternalDate());
  }
  const response = await fetch(`${accessLogSearchPath}?${params.toString()}`);
  const payload = await readSearchResponse(response);
  if (!response.ok) {
    throw new Error(payload?.error ?? "保存済みログを取得できませんでした。");
  }
  return payload?.records ?? [];
}

async function readSearchResponse(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
