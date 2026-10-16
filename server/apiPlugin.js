import { createChatMiddleware } from "./chat/middleware.js";
import { createSearchMiddleware } from "./search/middleware.js";
import { createUploadMiddleware } from "./upload/middleware.js";

export function accessLogApiPlugin() {
  const upload = createUploadMiddleware();
  const search = createSearchMiddleware();
  const chat = createChatMiddleware();
  return {
    name: "access-log-api",
    configureServer(server) {
      server.middlewares.use(upload);
      server.middlewares.use(search);
      server.middlewares.use(chat);
    },
    configurePreviewServer(server) {
      server.middlewares.use(upload);
      server.middlewares.use(search);
      server.middlewares.use(chat);
    },
  };
}
