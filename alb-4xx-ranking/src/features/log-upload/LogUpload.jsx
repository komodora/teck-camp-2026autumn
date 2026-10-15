import { useState } from "react";
import { analyzeAlbAccessLog } from "../../../analyzeAlbAccessLog.js";
import styles from "./LogUpload.module.css";
import { readLogFiles } from "./readLogFiles.js";
import { logUploadPath } from "./uploadPath.js";

export function LogUpload({ onAnalyzed }) {
  const [isDragging, setIsDragging] = useState(false);
  const [readError, setReadError] = useState("");

  async function analyzeSelectedLogs(files) {
    if (files.length === 0) return;

    setReadError("");
    try {
      await uploadLogFiles(files);
      const logText = await readLogFiles(files);
      publishAnalysis(analyzeAlbAccessLog(logText), files.map((file) => file.name));
    } catch (error) {
      setReadError(error instanceof Error ? error.message : "ログを読めませんでした。");
    }
  }

  function publishAnalysis(analysis, fileNames) {
    if (analysis.parsedLineCount === 0) {
      setReadError("ALB アクセスログとして読み取れる行がありませんでした。");
      onAnalyzed(null, []);
      return;
    }

    onAnalyzed(analysis, fileNames);
  }

  function handleFileInputChange(event) {
    const files = [...event.target.files];
    event.target.value = "";
    analyzeSelectedLogs(files);
  }

  function handleDragOver(event) {
    event.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave() {
    setIsDragging(false);
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    analyzeSelectedLogs([...event.dataTransfer.files]);
  }

  const dropzoneClassName = isDragging ? `${styles.dropzone} ${styles.dragging}` : styles.dropzone;

  return (
    <section className={styles.upload} aria-labelledby="upload-heading">
      <h2 id="upload-heading" className="visually-hidden">
        ログのアップロード
      </h2>
      <div className={dropzoneClassName} tabIndex={0} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
        <p className={styles.title}>ログファイルをドロップ</p>
        <p className={styles.note}>.log / .gz に対応。複数ファイルはまとめて集計します。</p>
        <label className={styles.fileButton}>
          ファイルを選択
          <input type="file" accept=".log,.gz,.txt,text/plain" multiple onChange={handleFileInputChange} />
        </label>
      </div>
      {readError !== "" && (
        <p className={styles.readError} role="alert">
          {readError}
        </p>
      )}
    </section>
  );
}

async function uploadLogFiles(files) {
  for (const file of files) {
    await uploadLogFile(file);
  }
}

async function uploadLogFile(file) {
  const body = new FormData();
  body.append("file", file, file.name);
  const response = await fetch(logUploadPath, { method: "POST", body });
  const payload = await readUploadResponse(response);
  if (!response.ok) {
    throw new Error(payload?.error ?? `${file.name} をアップロードできませんでした。`);
  }
}

async function readUploadResponse(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
