import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { analyzeAccessLogRecords } from "../../analyzeAlbAccessLog.js";
import { countryName, locateIpv4, readIpv4LocationTable } from "../../locateIpv4.js";

const TOP_IP_COUNT = 50;
const TOP_RANKING_COUNT = 20;

const locationFilePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../data/ipv4-city.bin.gz",
);

let locationTable; // undefined: 未試行, null: 読み込み失敗(以後スキップ), object: 成功
function loadLocationTableOnce() {
  if (locationTable !== undefined) return locationTable;
  try {
    const gzipped = readFileSync(locationFilePath);
    locationTable = readIpv4LocationTable(gunzipSync(gzipped));
  } catch (error) {
    console.error("位置情報データを読み込めませんでした。チャットは位置情報なしで続行します。", error);
    locationTable = null;
  }
  return locationTable;
}

export async function buildAnalysisContext(store, loadOptions) {
  const records = await store.loadAll(loadOptions);
  const analysis = analyzeAccessLogRecords(records);
  const table = loadLocationTableOnce();

  return {
    hasData: analysis.parsedLineCount > 0,
    parsedLineCount: analysis.parsedLineCount,
    skippedLineCount: analysis.skippedLineCount,
    clientErrorCount: analysis.clientErrorCount,
    periodStartUtc: toIso(analysis.earliestTimestampMs),
    periodEndUtc: toIso(analysis.latestTimestampMs),
    statusCounts: analysis.statusCounts,
    topRankingPaths: analysis.ranking.slice(0, TOP_RANKING_COUNT).map((row) => ({
      method: row.method,
      path: row.path,
      count: row.count,
      statusCounts: Object.fromEntries(row.statusCounts),
      hosts: Object.fromEntries(row.hosts),
    })),
    topIpSummaries: analysis.ipSummaries.slice(0, TOP_IP_COUNT).map((summary) => ({
      ip: summary.ip,
      status2xxCount: summary.status2xxCount,
      status4xxCount: summary.status4xxCount,
      location: locationOf(table, summary.ip),
    })),
  };
}

function locationOf(table, ip) {
  if (!table) return null;
  const located = locateIpv4(table, ip);
  if (!located) return null;
  return {
    latitude: located.latitude,
    longitude: located.longitude,
    countryCode: located.countryCode,
    countryName: countryName(located.countryCode),
  };
}

function toIso(timestampMs) {
  return timestampMs === null ? null : new Date(timestampMs).toISOString();
}
