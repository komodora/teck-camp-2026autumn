"""DB-IP City Lite の IPv4 CSV から、範囲・座標・国コードだけを残した検索用ファイルを作る。"""

import csv
import gzip
import socket
import struct
import sys
from pathlib import Path

RECORD_SIZE = 20
HEADER = struct.Struct("<8sII")
RECORD = struct.Struct("<IIiiHH")


def ipv4_to_int(text):
    return struct.unpack("!I", socket.inet_aton(text))[0]


def country_code(text):
    if len(text) == 2 and text.isalpha():
        return ord(text[0]) | (ord(text[1]) << 8)
    return 0


def build(source_path, destination_path):
    bin_path = destination_path.with_suffix(".bin")
    count = 0
    previous_start = -1

    with gzip.open(source_path, "rt", newline="") as source, bin_path.open("wb") as output:
        output.write(HEADER.pack(b"IPLOC1\0\0", 0, RECORD_SIZE))
        for row in csv.reader(source):
            if len(row) < 9 or row[7] == "" or row[8] == "":
                continue
            start = ipv4_to_int(row[0])
            end = ipv4_to_int(row[1])
            if start < previous_start:
                raise SystemExit(f"IP範囲が昇順ではありません: {row[0]}")
            previous_start = start
            output.write(
                RECORD.pack(
                    start,
                    end,
                    round(float(row[7]) * 10000),
                    round(float(row[8]) * 10000),
                    country_code(row[2]),
                    0,
                )
            )
            count += 1
        output.seek(8)
        output.write(struct.pack("<I", count))

    with bin_path.open("rb") as raw, gzip.open(destination_path, "wb", compresslevel=9) as compressed:
        while chunk := raw.read(1024 * 1024):
            compressed.write(chunk)
    bin_path.unlink()
    return count


if __name__ == "__main__":
    source = Path(sys.argv[1])
    destination = Path(sys.argv[2])
    destination.parent.mkdir(parents=True, exist_ok=True)
    row_count = build(source, destination)
    print(f"rows={row_count} bytes={destination.stat().st_size}")
