export const TIME_SPAN_OPTIONS = [
  { minutes: 1, label: "1分" },
  { minutes: 5, label: "5分" },
  { minutes: 15, label: "15分" },
  { minutes: 30, label: "30分" },
  { minutes: 60, label: "1時間" },
];

const MINUTE_MS = 60 * 1000;
// 1分幅でも丸2日分は収まる。それ以上は空の枠を大量に作らず、幅を広げるよう案内する。
const MAX_WINDOWS = 3000;

export function buildTimeWindows(earliestTimestampMs, latestTimestampMs, spanMinutes) {
  if (earliestTimestampMs === null || latestTimestampMs === null) return [];

  const spanMs = spanMinutes * MINUTE_MS;
  // 分単位の区切りは UTC と JST で同じ位置になる。epoch から切ると、表示上も 5分・15分・時ちょうどに揃う。
  const firstStartMs = alignDown(earliestTimestampMs, spanMs);
  const lastStartMs = alignDown(latestTimestampMs, spanMs);
  const windowCount = Math.round((lastStartMs - firstStartMs) / spanMs) + 1;
  if (!Number.isFinite(windowCount) || windowCount > MAX_WINDOWS) return [];

  return Array.from({ length: windowCount }, (_, index) => {
    const startMs = firstStartMs + index * spanMs;
    return { startMs, endMs: startMs + spanMs };
  });
}

export function countIpRequestsByWindow(ipRequests, timeWindows) {
  const counts = timeWindows.map(() => new Map());
  if (timeWindows.length === 0) return [];

  const spanMs = timeWindows[0].endMs - timeWindows[0].startMs;
  const originMs = timeWindows[0].startMs;

  for (const request of ipRequests) {
    const windowIndex = Math.floor((request.timestampMs - originMs) / spanMs);
    if (windowIndex < 0 || windowIndex >= counts.length) continue;
    addRequest(counts[windowIndex], request);
  }

  return counts.map((byIp) => [...byIp.values()]);
}

export function largestCircleCount(windowSummaries) {
  let largest = 1;
  for (const summaries of windowSummaries) {
    for (const summary of summaries) {
      if (summary.status4xxCount > largest) largest = summary.status4xxCount;
      if (summary.status2xxCount > largest) largest = summary.status2xxCount;
    }
  }
  return largest;
}

function alignDown(timestampMs, spanMs) {
  return Math.floor(timestampMs / spanMs) * spanMs;
}

function addRequest(byIp, request) {
  const summary = byIp.get(request.ip) ?? {
    ip: request.ip,
    status2xxCount: 0,
    status4xxCount: 0,
  };
  if (request.statusClass === "2xx") summary.status2xxCount += 1;
  if (request.statusClass === "4xx") summary.status4xxCount += 1;
  byIp.set(request.ip, summary);
}
