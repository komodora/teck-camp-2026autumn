import { useState } from "react";
import styles from "./Chat.module.css";
import { sendChatMessage } from "./sendChatMessage.js";

export function Chat() {
  const [isOpen, setIsOpen] = useState(false);
  const [history, setHistory] = useState([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    const message = input.trim();
    if (message === "" || isSending) return;

    setSendError("");
    setIsSending(true);
    setInput("");
    const historyBeforeReply = [...history, { role: "user", content: message }];
    setHistory(historyBeforeReply);

    try {
      const reply = await sendChatMessage({ message, history });
      setHistory([...historyBeforeReply, { role: "assistant", content: reply }]);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "応答を取得できませんでした。");
    } finally {
      setIsSending(false);
    }
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        className={styles.openButton}
        onClick={() => setIsOpen(true)}
        aria-label="AI に質問する"
      >
        AI に質問する
      </button>
    );
  }

  return (
    <section className={styles.chat} aria-labelledby="chat-heading">
      <div className={styles.header}>
        <h2 id="chat-heading" className={styles.heading}>
          AI に質問する
        </h2>
        <button
          type="button"
          className={styles.closeButton}
          onClick={() => setIsOpen(false)}
          aria-label="チャットを閉じる"
        >
          ×
        </button>
      </div>
      <div className={styles.messages}>
        {history.map((entry, index) => (
          <p key={index} className={entry.role === "user" ? styles.userMessage : styles.assistantMessage}>
            {entry.content}
          </p>
        ))}
      </div>
      <form className={styles.form} onSubmit={handleSubmit}>
        <input
          type="text"
          className={styles.input}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="例: どのパスが一番多く400を返していますか?"
          disabled={isSending}
        />
        <button type="submit" className={styles.submitButton} disabled={isSending || input.trim() === ""}>
          {isSending ? "送信しています" : "送信"}
        </button>
      </form>
      {sendError !== "" && (
        <p className={styles.sendError} role="alert">
          {sendError}
        </p>
      )}
    </section>
  );
}
