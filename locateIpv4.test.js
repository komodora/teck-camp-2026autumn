import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { locateIpv4, readIpv4LocationTable } from "./locateIpv4.js";

test("範囲に含まれる公開IPだけ座標を返す", () => {
  const table = readIpv4LocationTable(locationTableBuffer());

  assert.deepEqual(locateIpv4(table, "1.2.3.4"), {
    latitude: 35.6764,
    longitude: 139.65,
    countryCode: "JP",
  });
  assert.equal(locateIpv4(table, "9.9.9.9"), null);
  assert.equal(locateIpv4(table, "10.0.0.1"), null);
  assert.equal(locateIpv4(table, "2001:db8::1"), null);
});

test("東京リージョンのアドレスを日本に置く", () => {
  const table = readIpv4LocationTable(gunzipSync(readFileSync(new URL("./data/ipv4-city.bin.gz", import.meta.url))));
  const location = locateIpv4(table, "3.113.248.133");

  assert.equal(location.countryCode, "JP");
  assert.ok(location.latitude > 34 && location.latitude < 37);
  assert.ok(location.longitude > 139 && location.longitude < 141);
});

function locationTableBuffer() {
  const buffer = new ArrayBuffer(16 + 20 * 2);
  const view = new DataView(buffer);
  new Uint8Array(buffer, 0, 8).set(new TextEncoder().encode("IPLOC1\0\0"));
  view.setUint32(8, 2, true);
  view.setUint32(12, 20, true);
  writeRange(view, 0, ipv4("1.2.3.0"), ipv4("1.2.3.255"), 35.6764, 139.65, "JP");
  writeRange(view, 1, ipv4("10.0.0.0"), ipv4("10.255.255.255"), 0, 0, "US");
  return buffer;
}

function writeRange(view, index, start, end, latitude, longitude, countryCode) {
  const offset = 16 + index * 20;
  view.setUint32(offset, start, true);
  view.setUint32(offset + 4, end, true);
  view.setInt32(offset + 8, Math.round(latitude * 10000), true);
  view.setInt32(offset + 12, Math.round(longitude * 10000), true);
  view.setUint16(offset + 16, countryCode.charCodeAt(0) | (countryCode.charCodeAt(1) << 8), true);
}

function ipv4(address) {
  return address.split(".").reduce((value, octet) => value * 256 + Number(octet), 0);
}
