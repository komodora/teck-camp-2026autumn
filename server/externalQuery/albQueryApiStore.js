import { HttpError } from "../httpError.js";

const QUERY_API_URL = "https://alb-query-api-258502436840.asia-northeast1.run.app/query";
const TABLE = "`vi-realtime-300009.rec_gassyuku.alb_access_log_min`";
const PAGE_SIZE = 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// "YYYY-MM-DD" 形式かどうかを検証する。未指定(null/undefined/空文字)はnull、不正な形式はfalseを返す。
export function parseDateParam(value) {
  if (value === null || value === undefined || value === "") return null;
  return DATE_PATTERN.test(value) ? value : false;
}

// アップロードしたログの代わりに、外部のBigQueryクエリAPIから直接レコードを取得するstore。
// ndjsonStoreと同じ loadAll() だけを持つので、search/chat側は呼び出し元を区別しない。
export function createAlbQueryApiStore() {
  return {
    async loadAll({ date } = {}) {
      const apiKey = requireApiKey();
      const records = [];

      for (let offset = 0; ; offset += PAGE_SIZE) {
        const rows = await fetchPage(apiKey, offset, date);
        records.push(...rows);
        if (rows.length < PAGE_SIZE) break;
      }

      return records;
    },
  };
}

function requireApiKey() {
  const apiKey = process.env.ALB_QUERY_API_KEY;
  if (!apiKey) throw new HttpError(500, "ALB_QUERY_API_KEY が設定されていません。");
  return apiKey;
}

async function fetchPage(apiKey, offset, date) {
  // request_time_utc はTIMESTAMP型。DATE()はデフォルトでUTCの日付を返すので、日付指定もUTC基準になる。
  const whereClause = date ? ` WHERE DATE(request_time_utc) = '${date}'` : "";
  // ORDER BY で順序を固定しないと、OFFSETでのページングで行が重複・欠落する。
  const sql = `SELECT * FROM ${TABLE}${whereClause} ORDER BY request_time_utc LIMIT ${PAGE_SIZE} OFFSET ${offset}`;

  let response;
  try {
    response = await fetch(QUERY_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify({ sql }),
    });
  } catch (error) {
    console.error(error);
    throw new HttpError(502, "外部APIへの接続に失敗しました。");
  }

  if (!response.ok) {
    console.error(`alb-query-api returned status ${response.status}`);
    throw new HttpError(502, `外部APIの呼び出しに失敗しました(status ${response.status})。`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload?.rows)) {
    throw new HttpError(502, "外部APIのレスポンス形式が想定と異なります。");
  }
  return payload.rows;
}
