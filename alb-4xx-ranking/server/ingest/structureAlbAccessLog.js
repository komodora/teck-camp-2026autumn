import { splitAlbLogFields } from "./splitAlbLogFields.js";

const CONNECTION_TYPE_INDEX = 0;
const REQUEST_TIME_INDEX = 1;
const CLIENT_IP_PORT_INDEX = 3;
const TARGET_IP_PORT_INDEX = 4;
const ALB_STATUS_CODE_INDEX = 8;
const TARGET_STATUS_CODE_INDEX = 9;
const REQUEST_BYTES_INDEX = 10;
const RESPONSE_BYTES_INDEX = 11;
const HTTP_REQUEST_INDEX = 12;
const USER_AGENT_INDEX = 13;
const WAF_ACTION_INDEX = 22;

const MIN_FIELD_COUNT = HTTP_REQUEST_INDEX + 1;
const ALB_CONNECTION_TYPES = new Set(["http", "https", "h2", "grpcs", "ws", "wss"]);
const REQUEST_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

export function structureAlbAccessLog(logText) {
  const records = [];
  let skippedLineCount = 0;

  for (const line of logText.split(/\r?\n/)) {
    if (line.trim() === "") continue;

    const record = structureAlbAccessLogLine(line);
    if (!record) {
      skippedLineCount += 1;
      continue;
    }
    records.push(record);
  }

  return { records, skippedLineCount };
}

function structureAlbAccessLogLine(line) {
  const fields = splitAlbLogFields(line);
  if (fields.length < MIN_FIELD_COUNT) return null;
  if (!ALB_CONNECTION_TYPES.has(fields[CONNECTION_TYPE_INDEX])) return null;

  const requestTimeUtc = parseRequestTimeUtc(fields[REQUEST_TIME_INDEX]);
  if (requestTimeUtc === null) return null;

  return {
    request_time_utc: requestTimeUtc,
    client_ip_port: optionalText(fields[CLIENT_IP_PORT_INDEX]),
    target_ip_port: optionalText(fields[TARGET_IP_PORT_INDEX]),
    alb_status_code: optionalStatusCode(fields[ALB_STATUS_CODE_INDEX]),
    target_status_code: optionalStatusCode(fields[TARGET_STATUS_CODE_INDEX]),
    request_bytes: optionalInteger(fields[REQUEST_BYTES_INDEX]),
    response_bytes: optionalInteger(fields[RESPONSE_BYTES_INDEX]),
    http_request: optionalText(fields[HTTP_REQUEST_INDEX]),
    user_agent: optionalText(fields[USER_AGENT_INDEX]),
    waf_action: optionalText(fields[WAF_ACTION_INDEX]),
  };
}

function parseRequestTimeUtc(field) {
  if (!REQUEST_TIME_PATTERN.test(field)) return null;
  if (Number.isNaN(Date.parse(field))) return null;
  return field;
}

function optionalText(field) {
  if (field === undefined || field === "" || field === "-") return null;
  return field;
}

function optionalStatusCode(field) {
  if (!/^\d{3}$/.test(field ?? "")) return null;
  return Number(field);
}

function optionalInteger(field) {
  if (!/^\d+$/.test(field ?? "")) return null;
  return Number(field);
}
