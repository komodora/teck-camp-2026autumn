const countFormat = new Intl.NumberFormat("ja-JP");

const percentFormat = new Intl.NumberFormat("ja-JP", {
  style: "percent",
  maximumFractionDigits: 1,
});

const tokyoDateTime = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export function formatCount(count) {
  return countFormat.format(count);
}

export function formatPercent(ratio) {
  return percentFormat.format(ratio);
}

const tokyoMinute = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function formatMinuteRange(startMs, endMs) {
  const start = minuteParts(startMs);
  const end = minuteParts(endMs);
  if (start.date === end.date) return `${start.date} ${start.time} 〜 ${end.time}`;
  return `${start.date} ${start.time} 〜 ${end.date} ${end.time}`;
}

// 時間帯グラフの目盛り。日付が変わる 0:00 は日付で見せる。
export function formatClock(timestampMs) {
  const { date, time } = minuteParts(timestampMs);
  return time === "00:00" ? date.slice(5) : time;
}

export function formatTimeRange(earliestTimestampMs, latestTimestampMs) {
  if (earliestTimestampMs === null || latestTimestampMs === null) return "—";

  const start = tokyoDateAndTime(earliestTimestampMs);
  const end = tokyoDateAndTime(latestTimestampMs);
  if (start.date === end.date) return `${start.date}\n${start.time} 〜 ${end.time}`;
  return `${start.date} ${start.time}\n${end.date} ${end.time}`;
}

function minuteParts(timestampMs) {
  const parts = tokyoMinute.formatToParts(timestampMs);
  const part = (type) => parts.find((item) => item.type === type)?.value ?? "";
  return {
    date: `${part("year")}/${part("month")}/${part("day")}`,
    time: `${part("hour")}:${part("minute")}`,
  };
}

function tokyoDateAndTime(timestampMs) {
  const parts = tokyoDateTime.formatToParts(timestampMs);
  const part = (type) => parts.find((item) => item.type === type)?.value ?? "";
  return {
    date: `${part("year")}/${part("month")}/${part("day")}`,
    time: `${part("hour")}:${part("minute")}:${part("second")}`,
  };
}
