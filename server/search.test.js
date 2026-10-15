import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { accessLogSearchPath } from "../src/features/report/searchPath.js";
import { logUploadPath } from "../src/features/log-upload/uploadPath.js";
import { createNdjsonStore } from "./ingest/ndjsonStore.js";
import { createSearchMiddleware } from "./search/middleware.js";
import { createUploadMiddleware } from "./upload/middleware.js";

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

test("保存済みレコードを request_time_utc の昇順で返す", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "alb-log-search-"));
  const store = createNdjsonStore(directory);
  const server = await startApiServer(store);
  const later = sampleLine.replace("2026-09-17T02:35:51.336941Z", "2026-09-17T03:00:00.000000Z");
  const earlier = sampleLine.replace("2026-09-17T02:35:51.336941Z", "2026-09-17T01:00:00.000000Z");

  try {
    const uploaded = await postFile(server, { fileName: "access.log", body: Buffer.from(`${later}\n${earlier}\n`) });
    assert.equal(uploaded.statusCode, 201);

    const listed = await getJson(server, accessLogSearchPath);
    assert.equal(listed.statusCode, 200);
    assert.deepEqual(
      listed.body.records.map((record) => record.request_time_utc),
      ["2026-09-17T01:00:00.000000Z", "2026-09-17T03:00:00.000000Z"],
    );
    assert.equal(listed.body.records[0].http_request, "GET https://example.com:443/missing page HTTP/2.0");
  } finally {
    await closeServer(server);
    await rm(directory, { recursive: true, force: true });
  }
});

function startApiServer(store) {
  const upload = createUploadMiddleware({ store });
  const search = createSearchMiddleware({ store });
  const server = createServer((request, response) => {
    upload(request, response, () => {
      search(request, response, () => {
        response.statusCode = 404;
        response.end();
      });
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

function getJson(server, requestPath) {
  return sendJsonRequest(server, { method: "GET", path: requestPath });
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
