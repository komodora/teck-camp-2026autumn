import { promisify } from "node:util";
import { gunzip } from "node:zlib";
import { HttpError } from "../httpError.js";

const gunzipAsync = promisify(gunzip);
const MAX_BODY_BYTES = 32 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([".log", ".gz", ".txt"]);

export async function readLogUpload(request) {
  const file = await readMultipartFile(request);
  const extension = fileExtension(file.fileName);
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new HttpError(400, ".log / .gz / .txt を指定してください。");
  }

  return {
    fileName: file.fileName,
    logText: await decodeLogBytes(file.fileName, file.bytes),
  };
}

async function readMultipartFile(request) {
  const boundary = readBoundary(request.headers["content-type"] ?? "");
  const body = await readBody(request);
  const file = extractFilePart(body, boundary);
  if (!file) throw new HttpError(400, "file フィールドがありません。");
  return file;
}

function readBoundary(contentType) {
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i);
  if (!match) throw new HttpError(400, "multipart/form-data が必要です。");
  return match[1] ?? match[2];
}

async function readBody(request) {
  const chunks = [];
  let received = 0;
  for await (const chunk of request) {
    received += chunk.length;
    if (received > MAX_BODY_BYTES) {
      throw new HttpError(413, "ファイルが大きすぎます。");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function extractFilePart(body, boundary) {
  const delimiter = Buffer.from(`--${boundary}`);
  let start = body.indexOf(delimiter);
  while (start !== -1) {
    let partStart = start + delimiter.length;
    if (body[partStart] === 0x2d && body[partStart + 1] === 0x2d) break;
    partStart = skipLineBreak(body, partStart);

    const next = body.indexOf(delimiter, partStart);
    if (next === -1) break;

    const part = body.subarray(partStart, trimTrailingLineBreak(body, next));
    const file = fileFromPart(part);
    if (file) return file;
    start = next;
  }
  return null;
}

function fileFromPart(part) {
  const headerEnd = findHeaderEnd(part);
  if (!headerEnd) return null;

  const headers = part.subarray(0, headerEnd.index).toString("utf8");
  const disposition = headers.match(/content-disposition:[^\r\n]*/i)?.[0] ?? "";
  const name = disposition.match(/name="([^"]*)"/)?.[1];
  if (name !== "file") return null;

  const fileName = disposition.match(/filename="([^"]*)"/)?.[1] || "upload.log";
  return { fileName, bytes: part.subarray(headerEnd.index + headerEnd.length) };
}

function findHeaderEnd(part) {
  const crlf = part.indexOf("\r\n\r\n");
  const lf = part.indexOf("\n\n");
  if (crlf === -1 && lf === -1) return null;
  if (crlf === -1) return { index: lf, length: 2 };
  if (lf === -1 || crlf <= lf) return { index: crlf, length: 4 };
  return { index: lf, length: 2 };
}

function skipLineBreak(body, index) {
  if (body[index] === 0x0d && body[index + 1] === 0x0a) return index + 2;
  if (body[index] === 0x0a) return index + 1;
  return index;
}

function trimTrailingLineBreak(body, index) {
  if (index >= 2 && body[index - 2] === 0x0d && body[index - 1] === 0x0a) return index - 2;
  if (index >= 1 && body[index - 1] === 0x0a) return index - 1;
  return index;
}

function fileExtension(fileName) {
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0) return "";
  return fileName.slice(dot).toLowerCase();
}

async function decodeLogBytes(fileName, bytes) {
  const isGzip = fileName.toLowerCase().endsWith(".gz") || (bytes[0] === 0x1f && bytes[1] === 0x8b);
  if (!isGzip) return new TextDecoder().decode(bytes);

  try {
    const text = await gunzipAsync(bytes);
    return text.toString("utf8");
  } catch {
    throw new HttpError(400, `${fileName} を gzip として展開できませんでした。`);
  }
}
