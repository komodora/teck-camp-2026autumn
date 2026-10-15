import { sendJson } from "../sendJson.js";
import { logUploadPath } from "../../src/features/log-upload/uploadPath.js";
import { readLogUpload } from "./readLogUpload.js";

export async function handleUploadRequest(request, response, { store, ingestLogText, createUploadId }) {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (request.method !== "POST" || url.pathname !== logUploadPath) return false;

  const uploaded = await readLogUpload(request);
  const saved = await ingestLogText({ logText: uploaded.logText, store, createUploadId });
  sendJson(response, 201, { ...saved, fileName: uploaded.fileName });
  return true;
}
