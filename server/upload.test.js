import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { createNdjsonStore } from "./ingest/ndjsonStore.js";
import { createUploadMiddleware } from "./upload/middleware.js";
import { logUploadPath } from "../src/features/log-upload/uploadPath.js";

const sampleLine = [
  "h2",
  "2026-09-17T02:35:51.336941Z",
  "app/example/1",
  "1.2.3.4:1",
  "10.0.0.1:3000",
  "0.001",
  "0.002",
  "0.000",
  "404",
  "404",
  "10",
  "20",
  '"GET https://example.com:443/missing page HTTP/2.0"',
  '"Mozilla/5.0 (test) Browser"',
  "TLS",
  "TLSv1.3",
  "arn",
  '"trace"',
  '"example.com"',
  '"cert"',
  "0",
  "2026-09-17T02:35:51.311000Z",
  '"waf,forward"',
].join(" ");

test("アップロードURLでパースして保存する", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "alb-log-upload-"));
  const store = createNdjsonStore(directory);
  const uploadServer = await startUploadServer(store);

  try {
    const uploaded = await postFile(uploadServer, { fileName: "access.log", body: Buffer.from(`${sampleLine}\n`) });
    assert.equal(uploaded.statusCode, 201);
    assert.equal(uploaded.body.fileName, "access.log");
    assert.equal(uploaded.body.recordCount, 1);
    assert.equal(uploaded.body.skippedLineCount, 0);

    const records = await store.load(uploaded.body.uploadId);
    assert.equal(records[0].http_request, "GET https://example.com:443/missing page HTTP/2.0");
    assert.equal(records[0].waf_action, "waf,forward");
  } finally {
    await closeServer(uploadServer);
    await rm(directory, { recursive: true, force: true });
  }
});

test("gzip をアップロードURLで展開する", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "alb-log-upload-"));
  const store = createNdjsonStore(directory);
  const uploadServer = await startUploadServer(store);
  const later = sampleLine.replace("2026-09-17T02:35:51.336941Z", "2026-09-17T03:00:00.000000Z");
  const earlier = sampleLine.replace("2026-09-17T02:35:51.336941Z", "2026-09-17T01:00:00.000000Z");

  try {
    const uploaded = await postFile(uploadServer, {
      fileName: "access.log.gz",
      body: gzipSync(Buffer.from(`${later}\n${earlier}\n`)),
    });
    assert.equal(uploaded.statusCode, 201);
    assert.equal(uploaded.body.recordCount, 2);

    const records = await store.load(uploaded.body.uploadId);
    assert.deepEqual(
      records.map((record) => record.request_time_utc),
      ["2026-09-17T03:00:00.000000Z", "2026-09-17T01:00:00.000000Z"],
    );
  } finally {
    await closeServer(uploadServer);
    await rm(directory, { recursive: true, force: true });
  }
});

function startUploadServer(store) {
  const middleware = createUploadMiddleware({ store });
  const server = createServer((request, response) => {
    middleware(request, response, () => {
      response.statusCode = 404;
      response.end();
    });
  });
  return new Promise((resolve) => {
    server.listen(0, () => resolve(server));
  });
}

function postFile(server, { fileName, body }) {
  const boundary = "----alb-4xx-ranking";
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
        `Content-Type: application/octet-stream\r\n\r\n`,
    ),
    body,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  return sendJsonRequest(server, {
    method: "POST",
    path: logUploadPath,
    headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`,
      "content-length": payload.length,
    },
    body: payload,
  });
}

function sendJsonRequest(server, { method, path: requestPath, headers, body }) {
  const port = server.address().port;
  return new Promise((resolve, reject) => {
    const request = httpRequest({ method, port, path: requestPath, headers }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({ statusCode: response.statusCode, body: text === "" ? null : JSON.parse(text) });
      });
    });
    request.on("error", reject);
    if (body) request.write(body);
    request.end();
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
