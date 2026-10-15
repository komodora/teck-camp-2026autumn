export const uploadPagePath = "/";
export const reportPagePath = "/report";

export function currentPage() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path === reportPagePath) return "report";
  return "upload";
}
