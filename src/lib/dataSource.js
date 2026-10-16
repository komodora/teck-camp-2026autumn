const STORAGE_KEY = "camp.dataSource";
const DATE_STORAGE_KEY = "camp.externalDate";

export const DATA_SOURCES = [
  { value: "stored", label: "アップロード済みのログ" },
  { value: "external", label: "外部API(BigQuery)" },
];

const DEFAULT_SOURCE = "stored";

export function getDataSource() {
  if (typeof window === "undefined") return DEFAULT_SOURCE;
  const value = window.localStorage.getItem(STORAGE_KEY);
  return DATA_SOURCES.some((source) => source.value === value) ? value : DEFAULT_SOURCE;
}

export function setDataSource(value) {
  window.localStorage.setItem(STORAGE_KEY, value);
}

// 外部API(BigQuery)から取得する日付(UTC、YYYY-MM-DD)。空文字なら絞り込まず全期間を取得する。
export function getExternalDate() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(DATE_STORAGE_KEY) ?? "";
}

export function setExternalDate(value) {
  window.localStorage.setItem(DATE_STORAGE_KEY, value);
}
