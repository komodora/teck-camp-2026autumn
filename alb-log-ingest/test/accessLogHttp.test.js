import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { startServer } from "../src/server.js";
import { createNdjsonStore } from "../src/store/ndjsonStore.js";

test("アップロードURLは取り込みサーバーに無い", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "alb-log-ingest-"));
  const server = await startServer({ port: 0, store: createNdjsonStore(directory) });
  try {
    const response = await sendJsonRequest(server, { method: "POST", path: "/ingest/uploads" });
    assert.equal(response.statusCode, 404);
  } finally {
    await closeServer(server);
    await rm(directory, { recursive: true, force: true });
  }
});

test("保存済みレコードは request_time_utc の昇順で返す", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "alb-log-ingest-"));
  const store = createNdjsonStore(directory);
  await store.save("later", [recordAt("2026-09-17T03:00:00.000000Z")]);
  await store.save("earlier", [recordAt("2026-09-17T01:00:00.000000Z")]);
  const server = await startServer({ port: 0, store });

  try {
    const listed = await sendJsonRequest(server, { method: "GET", path: "/access-logs" });
    assert.deepEqual(
      listed.body.records.map((record) => record.request_time_utc),
      ["2026-09-17T01:00:00.000000Z", "2026-09-17T03:00:00.000000Z"],
    );
  } finally {
    await closeServer(server);
    await rm(directory, { recursive: true, force: true });
  }
});

function recordAt(requestTimeUtc) {
  return {
    request_time_utc: requestTimeUtc,
    client_ip_port: null,
    target_ip_port: null,
    alb_status_code: null,
    target_status_code: null,
    request_bytes: null,
    response_bytes: null,
    http_request: null,
    user_agent: null,
    waf_action: null,
  };
}

function sendJsonRequest(server, { method, path: requestPath }) {
  const port = server.address().port;
  return new Promise((resolve, reject) => {
    const request = httpRequest({ method, port, path: requestPath }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({ statusCode: response.statusCode, body: text === "" ? null : JSON.parse(text) });
      });
    });
    request.on("error", reject);
    request.end();
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
