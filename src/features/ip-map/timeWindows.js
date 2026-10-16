export const TIME_SPAN_OPTIONS = [
  { minutes: 5, label: "5分" },
  { minutes: 15, label: "15分" },
  { minutes: 30, label: "30分" },
  { minutes: 60, label: "1時間" },
];

const MINUTE_MS = 60 * 1000;
// 区間を切り替えるたびに円が出たり消えたりすると再生がかくつく。1分ずつずらし、隣の時点と大半を重ねる。
// 1分刻みで丸2日分まで。それより長いログは、刻みを広げて時点の数を抑える。
const STEP_MINUTE_OPTIONS = [1, 5, 15, 60];
const MAX_WINDOWS = 3000;

// 各時点は「その時刻までの直近 spanMinutes 分」。まだ来ていないリクエストは数えない。
export function buildTimeWindows(earliestTimestampMs, latestTimestampMs, spanMinutes) {
  if (earliestTimestampMs === null || latestTimestampMs === null) return [];

  for (const stepMinutes of STEP_MINUTE_OPTIONS) {
    const stepMs = stepMinutes * MINUTE_MS;
    const spanMs = Math.max(spanMinutes * MINUTE_MS, stepMs);
    // 分単位の区切りは UTC と JST で同じ位置になる。epoch から切ると、表示上も分ちょうどに揃う。
    const firstEndMs = alignDown(earliestTimestampMs, stepMs) + stepMs;
    const lastEndMs = alignDown(latestTimestampMs, stepMs) + stepMs;
    const windowCount = Math.round((lastEndMs - firstEndMs) / stepMs) + 1;
    if (!Number.isFinite(windowCount) || windowCount > MAX_WINDOWS) continue;

    return Array.from({ length: windowCount }, (_, index) => {
      const endMs = firstEndMs + index * stepMs;
      return { startMs: endMs - spanMs, endMs, stepMs };
    });
  }
  return [];
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
    return [...running.values()].map((summary) => ({ ...summary }));
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
