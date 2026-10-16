export const uploadPagePath = "/";
export const reportPagePath = "/report";
const ipDetailPathPrefix = "/report/ip/";

export function ipDetailPagePath(ip) {
  return `${ipDetailPathPrefix}${encodeURIComponent(ip)}`;
}

export function currentPage() {
  const path = normalizedPath();
  if (path === reportPagePath) return "report";
  if (path.startsWith(ipDetailPathPrefix)) return "ip-detail";
  return "upload";
}

export function currentIpParam() {
  const path = normalizedPath();
  if (!path.startsWith(ipDetailPathPrefix)) return "";
  try {
    return decodeURIComponent(path.slice(ipDetailPathPrefix.length));
  } catch {
    return "";
  }
}

function normalizedPath() {
  return window.location.pathname.replace(/\/+$/, "") || "/";
}
