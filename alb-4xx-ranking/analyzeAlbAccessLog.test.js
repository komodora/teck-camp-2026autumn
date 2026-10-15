import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { analyzeAlbAccessLog } from "./analyzeAlbAccessLog.js";

const sampleLogPath = new URL(
  "../290477247783_elasticloadbalancing_ap-northeast-1_app.Prd-We-AppAl-4tDe6j6pTNtS.8a25603c2c19db4c_20260917T0240Z_13.112.177.83_3bnumqmt.log",
  import.meta.url,
);

test("サンプルログの400系をメソッドとパスでランキングする", () => {
  const analysis = analyzeAlbAccessLog(readFileSync(sampleLogPath, "utf8"));

  assert.equal(analysis.parsedLineCount, 487);
  assert.equal(analysis.skippedLineCount, 0);
  assert.equal(analysis.clientErrorCount, 388);
  assert.deepEqual(analysis.statusCounts, [
    { statusCode: 403, count: 386 },
    { statusCode: 400, count: 2 },
  ]);

  assert.deepEqual(
    analysis.ranking.slice(0, 4).map((row) => [row.method, row.path, row.count]),
    [
      ["GET", "/", 10],
      ["HEAD", "/", 2],
      ["GET", "/login", 2],
      ["GET", "/robots.txt", 2],
    ],
  );

  const malformedRequest = analysis.ranking.find((row) => row.method === "-");
  assert.equal(malformedRequest.count, 2);
  assert.equal(malformedRequest.path.endsWith(":443-"), true);

  assert.equal(analysis.ipSummaries[0].ip, "185.220.101.30");
  assert.equal(analysis.ipSummaries[0].status4xxCount, 335);
  assert.equal(analysis.ipSummaries[0].status2xxCount, 0);
  const syntheticMonitor = analysis.ipSummaries.find((summary) => summary.ip === "3.113.248.133");
  assert.equal(syntheticMonitor.status2xxCount, 99);
  assert.equal(syntheticMonitor.status4xxCount, 0);
});

test("引用符内の空白をフィールド境界にしない", () => {
  const line = [
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
    '"GET https://example.com:443/missing%20page HTTP/2.0"',
    '"Mozilla/5.0 (test) Browser"',
  ].join(" ");

  const analysis = analyzeAlbAccessLog(line);
  assert.equal(analysis.clientErrorCount, 1);
  assert.equal(analysis.ranking[0].method, "GET");
  assert.equal(analysis.ranking[0].path, "/missing page");
  assert.equal(analysis.ranking[0].statusCounts.get(404), 1);
  assert.deepEqual(analysis.ipSummaries, [{ ip: "1.2.3.4", status2xxCount: 0, status4xxCount: 1 }]);
});
