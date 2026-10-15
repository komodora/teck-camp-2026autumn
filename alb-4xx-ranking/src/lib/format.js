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

export function formatTimeRange(earliestTimestampMs, latestTimestampMs) {
  if (earliestTimestampMs === null || latestTimestampMs === null) return "—";

  const start = tokyoDateAndTime(earliestTimestampMs);
  const end = tokyoDateAndTime(latestTimestampMs);
  if (start.date === end.date) return `${start.date}\n${start.time} 〜 ${end.time}`;
  return `${start.date} ${start.time}\n${end.date} ${end.time}`;
}

function tokyoDateAndTime(timestampMs) {
  const parts = tokyoDateTime.formatToParts(timestampMs);
  const part = (type) => parts.find((item) => item.type === type)?.value ?? "";
  return {
    date: `${part("year")}/${part("month")}/${part("day")}`,
    time: `${part("hour")}:${part("minute")}:${part("second")}`,
  };
}
