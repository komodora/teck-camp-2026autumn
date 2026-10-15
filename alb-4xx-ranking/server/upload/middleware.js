import path from "node:path";
import { fileURLToPath } from "node:url";
import { HttpError } from "../../../alb-log-ingest/src/httpError.js";
import { ingestLogText } from "../../../alb-log-ingest/src/ingest/pipeline.js";
import { sendJson } from "../../../alb-log-ingest/src/sendJson.js";
import { createNdjsonStore } from "../../../alb-log-ingest/src/store/ndjsonStore.js";
import { handleUploadRequest } from "./router.js";

const defaultDataDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../alb-log-ingest/data");

export function createUploadMiddleware({
  store = createNdjsonStore(defaultDataDirectory),
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
