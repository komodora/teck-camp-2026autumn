import { randomBytes } from "node:crypto";
import { structureAlbAccessLog } from "../parse/structureAlbAccessLog.js";

export async function ingestLogText({ logText, store, createUploadId = createDefaultUploadId }) {
  const structured = structureAlbAccessLog(logText);
  const uploadId = createUploadId();
  await store.save(uploadId, structured.records);
  return {
    uploadId,
    recordCount: structured.records.length,
    skippedLineCount: structured.skippedLineCount,
  };
}

function createDefaultUploadId(now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const suffix = randomBytes(3).toString("hex");
  return `${stamp}-${suffix}`;
}
