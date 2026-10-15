export function visibleRankingRows(ranking, selectedStatusCode, pathQuery) {
  return ranking
    .map((row) => ({
      ...row,
      count: countForStatus(row, selectedStatusCode),
    }))
    .filter((row) => row.count > 0)
    .filter((row) => matchesPathQuery(row, pathQuery))
    .sort(compareVisibleRows);
}

export function rankingShareTotal(rows, analysis, selectedStatusCode, pathQuery) {
  if (selectedStatusCode !== null) {
    return analysis.statusCounts.find((status) => status.statusCode === selectedStatusCode)?.count ?? 0;
  }
  if (pathQuery === "") return analysis.clientErrorCount;
  return rows.reduce((sum, row) => sum + row.count, 0);
}

export function hostsByCount(hosts) {
  return [...hosts.entries()].sort((left, right) => right[1] - left[1]).map(([host]) => host);
}

export function formatHostList(hosts) {
  if (hosts.length <= 2) return hosts.join(" · ");
  return `${hosts.slice(0, 2).join(" · ")} ほか${hosts.length - 2}`;
}

export function statusChipEntries(row, selectedStatusCode) {
  const entries =
    selectedStatusCode === null
      ? [...row.statusCounts.entries()]
      : [[selectedStatusCode, row.statusCounts.get(selectedStatusCode) ?? 0]];

  return entries.sort((left, right) => right[1] - left[1] || left[0] - right[0]);
}

function countForStatus(row, selectedStatusCode) {
  if (selectedStatusCode === null) return row.count;
  return row.statusCounts.get(selectedStatusCode) ?? 0;
}

function matchesPathQuery(row, pathQuery) {
  if (pathQuery === "") return true;
  return `${row.method} ${row.path}`.toLowerCase().includes(pathQuery);
}

function compareVisibleRows(left, right) {
  if (right.count !== left.count) return right.count - left.count;
  const pathOrder = left.path.localeCompare(right.path, "en");
  if (pathOrder !== 0) return pathOrder;
  return left.method.localeCompare(right.method, "en");
}
