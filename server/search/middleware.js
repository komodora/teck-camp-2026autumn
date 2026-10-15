import { HttpError } from "../httpError.js";
import { createNdjsonStore, defaultUploadDirectory } from "../ingest/ndjsonStore.js";
import { sendJson } from "../sendJson.js";
import { handleSearchRequest } from "./router.js";

export function createSearchMiddleware({ store = createNdjsonStore(defaultUploadDirectory) } = {}) {
  return async function searchMiddleware(request, response, next) {
    try {
      const handled = await handleSearchRequest(request, response, { store });
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
      sendJson(response, 500, { error: "取得に失敗しました。" });
    }
  };
}
