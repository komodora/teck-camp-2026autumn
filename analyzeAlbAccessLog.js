const CLIENT_IP_INDEX = 3;
const ELB_STATUS_CODE_INDEX = 8;
const REQUEST_LINE_INDEX = 12;
const TIMESTAMP_INDEX = 1;

const CLIENT_ERROR_STATUS_MIN = 400;
const CLIENT_ERROR_STATUS_MAX = 499;

// 末尾フィールドは時期によって増える。先頭側の並びは ALB アクセスログの仕様として固定。
const MIN_FIELD_COUNT = REQUEST_LINE_INDEX + 1;

const ALB_CONNECTION_TYPES = new Set(["http", "https", "h2", "grpcs", "ws", "wss"]);

export function analyzeAlbAccessLog(logText) {
  const entries = [];
  let skippedLineCount = 0;

  for (const line of logText.split(/\r?\n/)) {
    if (line.trim() === "") continue;

    const entry = parseAlbAccessLogLine(line);
    if (!entry) {
      skippedLineCount += 1;
      continue;
    }
    entries.push(entry);
  }

  return summarizeEntries(entries, skippedLineCount);
}

export function analyzeAccessLogRecords(records) {
  const entries = [];
  let skippedRecordCount = 0;

  for (const record of records) {
    const entry = entryFromAccessLogRecord(record);
    if (!entry) {
      skippedRecordCount += 1;
      continue;
    }
    entries.push(entry);
  }

  return summarizeEntries(entries, skippedRecordCount);
}

function summarizeEntries(entries, skippedLineCount) {
  const rankingByRequest = new Map();
  const statusCounts = new Map();
  const ipSummaries = new Map();
  const ipRequests = [];
  let clientErrorCount = 0;
  let earliestTimestampMs = null;
  let latestTimestampMs = null;

  for (const entry of entries) {
    earliestTimestampMs = earlierTimestamp(earliestTimestampMs, entry.timestampMs);
    latestTimestampMs = laterTimestamp(latestTimestampMs, entry.timestampMs);
    addIpStatus(ipSummaries, ipRequests, entry);

    if (!isClientErrorStatus(entry.elbStatusCode)) continue;

    clientErrorCount += 1;
    incrementCount(statusCounts, entry.elbStatusCode);
    addClientError(rankingByRequest, entry);
  }

  return {
    parsedLineCount: entries.length,
    skippedLineCount,
    clientErrorCount,
    earliestTimestampMs,
    latestTimestampMs,
    statusCounts: toStatusCountList(statusCounts),
    ranking: [...rankingByRequest.values()].sort(compareRankingRows),
    ipSummaries: [...ipSummaries.values()].sort(compareIpSummaries),
    ipRequests,
  };
}

function entryFromAccessLogRecord(record) {
  if (typeof record.alb_status_code !== "number") return null;
  if (typeof record.http_request !== "string") return null;

  const request = parseHttpRequestLine(record.http_request);
  if (!request) return null;

  return {
    elbStatusCode: record.alb_status_code,
    clientIp: parseClientIp(record.client_ip_port ?? ""),
    timestampMs: parseTimestamp(record.request_time_utc ?? ""),
    method: request.method,
    path: request.path,
    host: request.host,
  };
}

function parseAlbAccessLogLine(line) {
  const fields = splitAlbLogFields(line);
  if (fields.length < MIN_FIELD_COUNT) return null;
  if (!ALB_CONNECTION_TYPES.has(fields[0])) return null;

  const elbStatusCode = parseStatusCode(fields[ELB_STATUS_CODE_INDEX]);
  if (elbStatusCode === null) return null;

  const clientIp = parseClientIp(fields[CLIENT_IP_INDEX]);

  const request = parseHttpRequestLine(fields[REQUEST_LINE_INDEX]);
  if (!request) return null;

  return {
    elbStatusCode,
    clientIp,
    timestampMs: parseTimestamp(fields[TIMESTAMP_INDEX]),
    method: request.method,
    path: request.path,
    host: request.host,
  };
}

function splitAlbLogFields(line) {
  const fields = [];
  let index = 0;

  while (index < line.length) {
    if (line[index] === " ") {
      index += 1;
      continue;
    }

    if (line[index] === '"') {
      const quoted = readQuotedField(line, index + 1);
      fields.push(quoted.value);
      index = quoted.nextIndex;
      continue;
    }

    const nextSpace = line.indexOf(" ", index);
    const end = nextSpace === -1 ? line.length : nextSpace;
    fields.push(line.slice(index, end));
    index = end;
  }

  return fields;
}

function readQuotedField(line, startIndex) {
  let value = "";
  let index = startIndex;

  while (index < line.length) {
    const character = line[index];
    if (character === "\\" && index + 1 < line.length) {
      value += line[index + 1];
      index += 2;
      continue;
    }
    if (character === '"') {
      return { value, nextIndex: index + 1 };
    }
    value += character;
    index += 1;
  }

  return { value, nextIndex: index };
}

function parseClientIp(clientField) {
  if (clientField === "" || clientField === "-") return "";
  if (clientField.startsWith("[")) {
    const closingBracket = clientField.indexOf("]");
    return closingBracket > 1 ? clientField.slice(1, closingBracket) : "";
  }

  const colon = clientField.lastIndexOf(":");
  if (colon <= 0) return clientField;
  const port = clientField.slice(colon + 1);
  if (/^\d+$/.test(port)) return clientField.slice(0, colon);
  return clientField;
}

function parseStatusCode(field) {
  if (!/^\d{3}$/.test(field)) return null;
  return Number(field);
}

function parseTimestamp(field) {
  const timestampMs = Date.parse(field);
  return Number.isNaN(timestampMs) ? null : timestampMs;
}

function parseHttpRequestLine(requestLine) {
  const match = requestLine.match(/^(\S+)\s+(\S+)\s+\S+$/);
  if (!match) return null;

  const method = match[1];
  const requestTarget = match[2];
  const target = parseRequestTarget(requestTarget);

  return {
    method,
    path: target.path,
    host: target.host,
  };
}

function parseRequestTarget(requestTarget) {
  try {
    const url = new URL(requestTarget);
    return {
      host: url.host,
      path: decodePath(url.pathname === "" ? "/" : url.pathname),
    };
  } catch {
    // ポートが壊れているなど、URL として解釈できないリクエストはパスに混ぜずそのまま出す。
    return { host: "", path: requestTarget };
  }
}

function decodePath(path) {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

function isClientErrorStatus(statusCode) {
  return statusCode >= CLIENT_ERROR_STATUS_MIN && statusCode <= CLIENT_ERROR_STATUS_MAX;
}

function isSuccessStatus(statusCode) {
  return statusCode >= 200 && statusCode <= 299;
}

function addIpStatus(ipSummaries, ipRequests, entry) {
  if (entry.clientIp === "") return;
  const isClientError = isClientErrorStatus(entry.elbStatusCode);
  const isSuccess = isSuccessStatus(entry.elbStatusCode);
  if (!isClientError && !isSuccess) return;

  const summary = ipSummaries.get(entry.clientIp) ?? {
    ip: entry.clientIp,
    status2xxCount: 0,
    status4xxCount: 0,
  };
  if (isSuccess) summary.status2xxCount += 1;
  if (isClientError) summary.status4xxCount += 1;
  ipSummaries.set(entry.clientIp, summary);

  if (entry.timestampMs === null) return;
  ipRequests.push({
    ip: entry.clientIp,
    timestampMs: entry.timestampMs,
    statusClass: isClientError ? "4xx" : "2xx",
  });
}

function compareIpSummaries(left, right) {
  if (right.status4xxCount !== left.status4xxCount) return right.status4xxCount - left.status4xxCount;
  if (right.status2xxCount !== left.status2xxCount) return right.status2xxCount - left.status2xxCount;
  return left.ip.localeCompare(right.ip, "en");
}

function addClientError(rankingByRequest, entry) {
  const requestKey = `${entry.method} ${entry.path}`;
  const row = rankingByRequest.get(requestKey) ?? {
    method: entry.method,
    path: entry.path,
    count: 0,
    statusCounts: new Map(),
    hosts: new Map(),
  };

  row.count += 1;
  incrementCount(row.statusCounts, entry.elbStatusCode);
  if (entry.host !== "") incrementCount(row.hosts, entry.host);
  rankingByRequest.set(requestKey, row);
}

function incrementCount(counts, key) {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function toStatusCountList(statusCounts) {
  return [...statusCounts.entries()]
    .map(([statusCode, count]) => ({ statusCode, count }))
    .sort((left, right) => right.count - left.count || left.statusCode - right.statusCode);
}

function compareRankingRows(left, right) {
  if (right.count !== left.count) return right.count - left.count;
  const pathOrder = left.path.localeCompare(right.path, "en");
  if (pathOrder !== 0) return pathOrder;
  return left.method.localeCompare(right.method, "en");
}

function earlierTimestamp(currentMs, candidateMs) {
  if (candidateMs === null) return currentMs;
  if (currentMs === null || candidateMs < currentMs) return candidateMs;
  return currentMs;
}

function laterTimestamp(currentMs, candidateMs) {
  if (candidateMs === null) return currentMs;
  if (currentMs === null || candidateMs > currentMs) return candidateMs;
  return currentMs;
}
