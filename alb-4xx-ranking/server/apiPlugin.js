import { createSearchMiddleware } from "./search/middleware.js";
import { createUploadMiddleware } from "./upload/middleware.js";

export function accessLogApiPlugin() {
  const upload = createUploadMiddleware();
  const search = createSearchMiddleware();
  return {
    name: "access-log-api",
    configureServer(server) {
      server.middlewares.use(upload);
      server.middlewares.use(search);
    },
    configurePreviewServer(server) {
      server.middlewares.use(upload);
      server.middlewares.use(search);
    },
  };
}
