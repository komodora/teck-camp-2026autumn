const tokyoHour = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  hourCycle: "h23",
});

export function buildHourlyPattern(timestampsMs) {
  const counts = new Array(24).fill(0);
  for (const timestampMs of timestampsMs) {
    counts[hourOfDay(timestampMs)] += 1;
  }
  return counts.map((count, hour) => ({ hour, count }));
}

function hourOfDay(timestampMs) {
  const part = tokyoHour.formatToParts(timestampMs).find((item) => item.type === "hour");
  return Number(part?.value ?? 0);
}
