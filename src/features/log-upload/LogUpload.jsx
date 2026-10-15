import { useState } from "react";
import { reportPagePath } from "../../pages.js";
import styles from "./LogUpload.module.css";
import { logUploadPath } from "./uploadPath.js";

export function LogUpload() {
  const [isDragging, setIsDragging] = useState(false);
  const [readError, setReadError] = useState("");
  const [savedRecordCount, setSavedRecordCount] = useState(null);

  async function saveSelectedLogs(files) {
    if (files.length === 0) return;

    setReadError("");
    setSavedRecordCount(null);
    try {
      const recordCount = await saveLogFiles(files);
      if (recordCount === 0) {
        setReadError("ALB アクセスログとして読み取れる行がありませんでした。");
        return;
      }
      setSavedRecordCount(recordCount);
    } catch (error) {
      setReadError(error instanceof Error ? error.message : "ログを保存できませんでした。");
    }
  }

  function handleFileInputChange(event) {
    const files = [...event.target.files];
    event.target.value = "";
    saveSelectedLogs(files);
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
    saveSelectedLogs([...event.dataTransfer.files]);
  }

  const dropzoneClassName = isDragging ? `${styles.dropzone} ${styles.dragging}` : styles.dropzone;

  return (
    <section className={styles.upload} aria-labelledby="upload-heading">
      <h2 id="upload-heading" className="visually-hidden">
        ログのアップロード
      </h2>
      <div className={dropzoneClassName} tabIndex={0} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
        <p className={styles.title}>ログファイルをドロップ</p>
        <p className={styles.note}>.log / .gz に対応。複数ファイルはまとめて保存します。</p>
        <label className={styles.fileButton}>
          ファイルを選択
          <input type="file" accept=".log,.gz,.txt,text/plain" multiple onChange={handleFileInputChange} />
        </label>
      </div>
      {savedRecordCount !== null && (
        <p className={styles.saved}>
          {savedRecordCount} 件を保存しました。
          <a href={reportPagePath}>ランキング画面へ</a>
        </p>
      )}
      {readError !== "" && (
        <p className={styles.readError} role="alert">
          {readError}
        </p>
      )}
    </section>
  );
}

async function saveLogFiles(files) {
  let recordCount = 0;
  for (const file of files) {
    recordCount += await saveLogFile(file);
  }
  return recordCount;
}

async function saveLogFile(file) {
  const body = new FormData();
  body.append("file", file, file.name);
  const response = await fetch(logUploadPath, { method: "POST", body });
  const payload = await readUploadResponse(response);
  if (!response.ok) {
    throw new Error(payload?.error ?? `${file.name} をアップロードできませんでした。`);
  }
  return payload?.recordCount ?? 0;
}

async function readUploadResponse(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
