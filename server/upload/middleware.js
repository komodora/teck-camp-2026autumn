import { HttpError } from "../httpError.js";
import { createNdjsonStore, defaultUploadDirectory } from "../ingest/ndjsonStore.js";
import { ingestLogText } from "../ingest/pipeline.js";
import { sendJson } from "../sendJson.js";
import { handleUploadRequest } from "./router.js";

export function createUploadMiddleware({
  store = createNdjsonStore(defaultUploadDirectory),
  ingestLogText: ingest = ingestLogText,
  createUploadId,
} = {}) {
  return async function uploadMiddleware(request, response, next) {
    try {
      const handled = await handleUploadRequest(request, response, {
        store,
        ingestLogText: ingest,
        createUploadId,
      });
      if (!handled) next();
    } catch (error) {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      if (error instanceof HttpError) {
        sendJson(response, error.statusCode, { error: error.message });
        return;
      }
      console.error(error);
      sendJson(response, 500, { error: "取り込みに失敗しました。" });
    }
  };
}
