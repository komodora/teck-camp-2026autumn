import { createUploadMiddleware } from "./middleware.js";

export function logUploadPlugin() {
  const middleware = createUploadMiddleware();
  return {
    name: "log-upload",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
