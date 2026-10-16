const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export const ACCESS_LOG_SEARCH_TOOL = {
  name: "search_access_logs",
  description:
    "保存されているALBアクセスログの個々のリクエスト(生ログに近い情報)を検索する。IP・リクエスト行の部分一致・ステータスコードで絞り込める。" +
    "集計データだけでは答えられない、個別リクエストの詳細(タイムスタンプ・User-Agent・レスポンスバイト数など)が必要なときに使う。",
  input_schema: {
    type: "object",
    properties: {
      ip: { type: "string", description: "クライアントIPで厳密に絞り込む(例: 203.0.113.1)" },
      pathContains: {
        type: "string",
        description: "リクエスト行(メソッド+パス+プロトコル)に含まれる文字列で絞り込む(部分一致・大文字小文字無視)",
      },
      statusCode: { type: "integer", description: "ALBが返したステータスコードで絞り込む(例: 404)" },
      limit: { type: "integer", description: `返す件数の上限(デフォルト${DEFAULT_LIMIT}、最大${MAX_LIMIT})` },
    },
  },
};

export function createAccessLogSearch(store) {
  return async function searchAccessLogs({ ip, pathContains, statusCode, limit } = {}) {
    const records = await store.loadAll();
    const normalizedPathContains = typeof pathContains === "string" ? pathContains.toLowerCase() : null;

    const matched = records.filter((record) => {
      if (typeof ip === "string" && ip !== "" && !matchesIp(record.client_ip_port, ip)) return false;
      if (normalizedPathContains !== null && !matchesPath(record.http_request, normalizedPathContains)) return false;
      if (typeof statusCode === "number" && record.alb_status_code !== statusCode) return false;
      return true;
    });
    matched.sort(byRequestTime);

    const effectiveLimit = clampLimit(limit);
    return {
      matchedCount: matched.length,
      returnedCount: Math.min(matched.length, effectiveLimit),
      records: matched.slice(0, effectiveLimit).map(toRawLogView),
    };
  };
}

function matchesIp(clientIpPort, ip) {
  if (typeof clientIpPort !== "string") return false;
  return clientIpPort === ip || clientIpPort.startsWith(`${ip}:`);
}

function matchesPath(httpRequest, normalizedPathContains) {
  if (typeof httpRequest !== "string") return false;
  return httpRequest.toLowerCase().includes(normalizedPathContains);
}

function byRequestTime(left, right) {
  return (left.request_time_utc ?? "").localeCompare(right.request_time_utc ?? "");
}

function clampLimit(limit) {
  if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.trunc(limit), MAX_LIMIT);
}

function toRawLogView(record) {
  return {
    requestTimeUtc: record.request_time_utc,
    clientIpPort: record.client_ip_port,
    albStatusCode: record.alb_status_code,
    targetStatusCode: record.target_status_code,
    requestBytes: record.request_bytes,
    responseBytes: record.response_bytes,
    httpRequest: record.http_request,
    userAgent: record.user_agent,
    wafAction: record.waf_action,
  };
}
