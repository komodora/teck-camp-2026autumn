export async function searchAccessLogs(store) {
  const records = await store.loadAll();
  return records.sort(byRequestTime);
}

function byRequestTime(left, right) {
  const timeOrder = Date.parse(left.request_time_utc) - Date.parse(right.request_time_utc);
  if (timeOrder !== 0) return timeOrder;
  return left.request_time_utc.localeCompare(right.request_time_utc);
}
