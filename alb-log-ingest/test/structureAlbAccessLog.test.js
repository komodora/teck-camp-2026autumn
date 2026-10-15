import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { structureAlbAccessLog } from "../src/parse/structureAlbAccessLog.js";

const sampleLogPath = new URL(
  "../../290477247783_elasticloadbalancing_ap-northeast-1_app.Prd-We-AppAl-4tDe6j6pTNtS.8a25603c2c19db4c_20260917T0240Z_13.112.177.83_3bnumqmt.log",
  import.meta.url,
);

test("サンプルログ先頭行を alb_access_log_min にする", () => {
  const firstLine = readFileSync(sampleLogPath, "utf8").split(/\r?\n/, 1)[0];
  const structured = structureAlbAccessLog(firstLine);

  assert.equal(structured.skippedLineCount, 0);
  assert.deepEqual(structured.records, [
    {
      request_time_utc: "2026-09-17T02:35:51.336941Z",
      client_ip_port: "3.113.248.133:58244",
      target_ip_port: "10.200.3.148:3000",
      alb_status_code: 200,
      target_status_code: 200,
      request_bytes: 516,
      response_bytes: 7595,
      http_request: "GET https://ancar-rec.ntt.com:443/login HTTP/2.0",
      user_agent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/145.0.7632.77 Safari/537.36 CloudWatchSynthetics/arn:aws:synthetics:ap-northeast-1:290477247783:canary:prdwebsynthetic9ef5c6",
      waf_action: "waf,forward",
    },
  ]);
});

test("引用符内の空白は区切らず、ハイフンは null にする", () => {
  const line = [
    "h2",
    "2026-09-17T02:35:51.336941Z",
    "app/example/1",
    "-",
    "-",
    "0.001",
    "0.002",
    "0.000",
    "-",
    "-",
    "-",
    "-",
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
    '"-"',
  ].join(" ");

  const structured = structureAlbAccessLog(line);
  assert.equal(structured.records.length, 1);
  assert.equal(structured.records[0].http_request, "GET https://example.com:443/missing page HTTP/2.0");
  assert.equal(structured.records[0].user_agent, "Mozilla/5.0 (test) Browser");
  assert.equal(structured.records[0].client_ip_port, null);
  assert.equal(structured.records[0].target_ip_port, null);
  assert.equal(structured.records[0].alb_status_code, null);
  assert.equal(structured.records[0].target_status_code, null);
  assert.equal(structured.records[0].request_bytes, null);
  assert.equal(structured.records[0].response_bytes, null);
  assert.equal(structured.records[0].waf_action, null);
});

test("接続種別が ALB でない行は保存しない", () => {
  const structured = structureAlbAccessLog("not a log line\n");
  assert.deepEqual(structured.records, []);
  assert.equal(structured.skippedLineCount, 1);
});
