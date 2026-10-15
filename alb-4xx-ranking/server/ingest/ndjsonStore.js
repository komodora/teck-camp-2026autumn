import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const UPLOAD_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$/;

export const defaultUploadDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../data/uploads");

export function createNdjsonStore(directory) {
  return {
    async save(uploadId, records) {
      const filePath = uploadFilePath(directory, uploadId);
      await mkdir(directory, { recursive: true });
      const body = records.map((record) => JSON.stringify(record)).join("\n");
      const contents = body === "" ? "" : `${body}\n`;
      await writeFile(filePath, contents, "utf8");
    },

    async load(uploadId) {
      try {
        const contents = await readFile(uploadFilePath(directory, uploadId), "utf8");
        return parseNdjson(contents);
      } catch (error) {
        if (error && error.code === "ENOENT") return null;
        throw error;
      }
    },

    async loadAll() {
      let fileNames;
      try {
        fileNames = await readdir(directory);
      } catch (error) {
        if (error && error.code === "ENOENT") return [];
        throw error;
      }

      const records = [];
      for (const fileName of fileNames) {
        if (!fileName.endsWith(".ndjson")) continue;
        const contents = await readFile(path.join(directory, fileName), "utf8");
        records.push(...parseNdjson(contents));
      }
      return records;
    },
  };
}

function uploadFilePath(directory, uploadId) {
  if (!UPLOAD_ID_PATTERN.test(uploadId)) {
    throw new Error("uploadId の形式が不正です。");
  }
  return path.join(directory, `${uploadId}.ndjson`);
}

function parseNdjson(contents) {
  if (contents.trim() === "") return [];
  return contents
    .split(/\r?\n/)
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line));
}
