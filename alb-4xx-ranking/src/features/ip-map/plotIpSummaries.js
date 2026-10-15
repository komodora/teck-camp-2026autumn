import { locateIpv4 } from "../../../locateIpv4.js";

export function plotIpSummaries(ipSummaries, locationTable) {
  const circles = [];
  const unlocated = [];

  for (const summary of ipSummaries) {
    const location = locateIpv4(locationTable, summary.ip);
    if (!location) {
      unlocated.push(summary);
      continue;
    }
    if (summary.status4xxCount > 0) {
      circles.push({ ...summary, ...location, statusClass: "4xx", count: summary.status4xxCount });
    }
    if (summary.status2xxCount > 0) {
      circles.push({ ...summary, ...location, statusClass: "2xx", count: summary.status2xxCount });
    }
  }

  return { circles, unlocated };
}
