import { HttpError } from "../httpError.js";
import { createAlbQueryApiStore } from "../externalQuery/albQueryApiStore.js";
import { createNdjsonStore, defaultUploadDirectory } from "../ingest/ndjsonStore.js";
import { sendJson } from "../sendJson.js";
import { handleSearchRequest } from "./router.js";

export function createSearchMiddleware({
  storedStore = createNdjsonStore(defaultUploadDirectory),
  externalStore = createAlbQueryApiStore(),
} = {}) {
  return async function searchMiddleware(request, response, next) {
    try {
      const handled = await handleSearchRequest(request, response, { storedStore, externalStore });
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
