const HEADER_BYTES = 16;
const RECORD_BYTES = 20;
const MAGIC = "IPLOC1";

const regionNames = new Intl.DisplayNames(["ja"], { type: "region" });

export function readIpv4LocationTable(buffer) {
  const bytes = toArrayBuffer(buffer);
  const view = new DataView(bytes);
  const magic = new TextDecoder().decode(new Uint8Array(bytes, 0, MAGIC.length));
  if (magic !== MAGIC) {
    throw new Error("位置情報データの形式が違います。");
  }

  const count = view.getUint32(8, true);
  const recordBytes = view.getUint32(12, true);
  if (recordBytes !== RECORD_BYTES) {
    throw new Error("位置情報データの形式が違います。");
  }
  if (HEADER_BYTES + count * RECORD_BYTES > bytes.byteLength) {
    throw new Error("位置情報データが欠けています。");
  }

  return { view, count };
}

export function locateIpv4(table, ipAddress) {
  const ipValue = ipv4ToUint(ipAddress);
  if (ipValue === null || !isPublicIpv4(ipValue)) return null;

  let low = 0;
  let high = table.count - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const rangeStart = table.view.getUint32(recordOffset(mid), true);
    if (rangeStart <= ipValue) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  if (found < 0) return null;

  const offset = recordOffset(found);
  const rangeEnd = table.view.getUint32(offset + 4, true);
  if (ipValue > rangeEnd) return null;

  return {
    latitude: table.view.getInt32(offset + 8, true) / 10000,
    longitude: table.view.getInt32(offset + 12, true) / 10000,
    countryCode: countryCodeAt(table, offset),
  };
}

export function countryName(countryCode) {
  if (!countryCode) return "";
  try {
    return regionNames.of(countryCode) ?? countryCode;
  } catch {
    return countryCode;
  }
}

let locationTablePromise = null;

export function loadIpv4LocationTable() {
  if (!locationTablePromise) {
    locationTablePromise = fetchIpv4LocationTable().catch((error) => {
      locationTablePromise = null;
      throw error;
    });
  }
  return locationTablePromise;
}

async function fetchIpv4LocationTable() {
  const response = await fetch(new URL("./data/ipv4-city.bin.gz", import.meta.url));
  if (!response.ok) {
    throw new Error("位置情報データを読み込めませんでした。");
  }

  // Vite は .gz を Content-Encoding: gzip で配信し、fetch の時点で展開済みになる。
  // 静的配信では圧縮のまま届くので、先頭バイトを見てから展開する。
  const buffer = await response.arrayBuffer();
  const payload = isGzip(buffer) ? await gunzip(buffer) : buffer;
  return readIpv4LocationTable(payload);
}

function isGzip(buffer) {
  const bytes = new Uint8Array(buffer);
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

async function gunzip(buffer) {
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

function toArrayBuffer(buffer) {
  if (buffer instanceof ArrayBuffer) return buffer;
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function recordOffset(index) {
  return HEADER_BYTES + index * RECORD_BYTES;
}

function countryCodeAt(table, offset) {
  const packed = table.view.getUint16(offset + 16, true);
  if (packed === 0) return "";
  return String.fromCharCode(packed & 0xff, packed >> 8);
}

function ipv4ToUint(ipAddress) {
  const octets = ipAddress.split(".");
  if (octets.length !== 4) return null;

  let value = 0;
  for (const octetText of octets) {
    if (!/^\d{1,3}$/.test(octetText)) return null;
    const octet = Number(octetText);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

function isPublicIpv4(ipValue) {
  const first = ipValue >>> 24;
  const second = (ipValue >>> 16) & 255;
  if (first === 0 || first === 10 || first === 127) return false;
  if (first === 169 && second === 254) return false;
  if (first === 172 && second >= 16 && second <= 31) return false;
  if (first === 192 && second === 168) return false;
  if (first >= 224) return false;
  return true;
}
