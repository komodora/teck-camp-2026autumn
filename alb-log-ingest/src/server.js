import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { HttpError } from "./httpError.js";
import { handleRecordsRequest } from "./records/router.js";
import { sendJson } from "./sendJson.js";
import { createNdjsonStore } from "./store/ndjsonStore.js";

const DEFAULT_PORT = 8787;

export function createRequestListener({ store } = {}) {
  return async function handleRequest(request, response) {
    try {
      const handledRecords = await handleRecordsRequest(request, response, { store });
      if (handledRecords) return;

      sendJson(response, 404, { error: "見つかりません。" });
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

export function startServer({ port = DEFAULT_PORT, store } = {}) {
  const dataDirectory = store ? null : path.join(path.dirname(fileURLToPath(import.meta.url)), "../data");
  const server = createServer(createRequestListener({ store: store ?? createNdjsonStore(dataDirectory) }));
  return new Promise((resolve) => {
    server.listen(port, () => resolve(server));
  });
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  const server = await startServer({ port });
  const address = server.address();
  console.log(`alb-log-ingest listening on ${address.port}`);
}
