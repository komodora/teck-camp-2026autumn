// steps は集計の幅(minutes)の約1/3の刻みで時点を進めるための候補(常にminutesの約数で、最後はminutes自身)。
// 刻みが細かすぎると、集計の幅が広いときに再生が遅く感じる。粗すぎると円の出入りがかくつく。
export const TIME_SPAN_OPTIONS = [
  { minutes: 5, label: "5分", steps: [1, 5] },
  { minutes: 15, label: "15分", steps: [5, 15] },
  { minutes: 30, label: "30分", steps: [10, 15, 30] },
  { minutes: 60, label: "1時間", steps: [20, 30, 60] },
];

const MINUTE_MS = 60 * 1000;
const MAX_WINDOWS = 3000;

// 各時点は「その時刻までの直近 spanMinutes 分」。まだ来ていないリクエストは数えない。
export function buildTimeWindows(earliestTimestampMs, latestTimestampMs, spanMinutes) {
  if (earliestTimestampMs === null || latestTimestampMs === null) return [];

  const steps = TIME_SPAN_OPTIONS.find((option) => option.minutes === spanMinutes)?.steps ?? [spanMinutes];
  // 候補の刻みでも時点が多すぎる(ログが長期間に及ぶ)場合向けの最終手段として60分刻みも試す。
  const stepMinutesCandidates = steps.includes(60) ? steps : [...steps, 60];

  for (const stepMinutes of stepMinutesCandidates) {
    const windows = buildTimeWindowsForStep(earliestTimestampMs, latestTimestampMs, spanMinutes, stepMinutes * MINUTE_MS);
    if (windows) return windows;
  }
  return [];
}

function buildTimeWindowsForStep(earliestTimestampMs, latestTimestampMs, spanMinutes, stepMs) {
  const spanMs = Math.max(spanMinutes * MINUTE_MS, stepMs);
  // 分単位の区切りは UTC と JST で同じ位置になる。epoch から切ると、表示上も分ちょうどに揃う。
  const firstEndMs = alignDown(earliestTimestampMs, stepMs) + stepMs;
  const lastEndMs = alignDown(latestTimestampMs, stepMs) + stepMs;
  const windowCount = Math.round((lastEndMs - firstEndMs) / stepMs) + 1;
  if (!Number.isFinite(windowCount) || windowCount > MAX_WINDOWS) return null;

  return Array.from({ length: windowCount }, (_, index) => {
    const endMs = firstEndMs + index * stepMs;
    return { startMs: endMs - spanMs, endMs, stepMs };
  });
}

export function countIpRequestsByWindow(ipRequests, timeWindows) {
  if (timeWindows.length === 0) return [];

  const { stepMs } = timeWindows[0];
  const stepsPerWindow = Math.round((timeWindows[0].endMs - timeWindows[0].startMs) / stepMs);
  const originMs = timeWindows[0].endMs - stepMs;

  // 刻みごとに数えてから、直近の刻みを足し、窓から外れた刻みを引いて送る。
  const steps = timeWindows.map(() => new Map());
  for (const request of ipRequests) {
    const stepIndex = Math.floor((request.timestampMs - originMs) / stepMs);
    if (stepIndex < 0 || stepIndex >= steps.length) continue;
    addCounts(steps[stepIndex], request.ip, countsOf(request), 1);
  }

  const running = new Map();
  return steps.map((entering, index) => {
    for (const summary of entering.values()) addCounts(running, summary.ip, summary, 1);
    const leaving = steps[index - stepsPerWindow];
    if (leaving) {
      for (const summary of leaving.values()) addCounts(running, summary.ip, summary, -1);
    }
    // latest*Count はこの時点で新しく数えた刻みの件数。円は直近の合計、波紋は新しく来た分で出す。
    return [...running.values()].map((summary) => ({
      ...summary,
      latest2xxCount: entering.get(summary.ip)?.status2xxCount ?? 0,
      latest4xxCount: entering.get(summary.ip)?.status4xxCount ?? 0,
    }));
  });
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

function countsOf(request) {
  return {
    status2xxCount: request.statusClass === "2xx" ? 1 : 0,
    status4xxCount: request.statusClass === "4xx" ? 1 : 0,
  };
}

function addCounts(byIp, ip, counts, sign) {
  const summary = byIp.get(ip) ?? { ip, status2xxCount: 0, status4xxCount: 0 };
  summary.status2xxCount += counts.status2xxCount * sign;
  summary.status4xxCount += counts.status4xxCount * sign;
  if (summary.status2xxCount === 0 && summary.status4xxCount === 0) {
    byIp.delete(ip);
    return;
  }
  byIp.set(ip, summary);
}
