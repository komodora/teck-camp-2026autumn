import Anthropic from "@anthropic-ai/sdk";
import { HttpError } from "../httpError.js";

const MODEL = "claude-sonnet-5-5";
const MAX_TOKENS = 2000;

let client;
function getClient() {
  if (!client) client = new Anthropic(); // ANTHROPIC_API_KEY を process.env から自動解決
  return client;
}

export async function askClaude({ message, history, contextForPrompt }) {
  try {
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      output_config: { effort: "low" },
      system: buildSystemPrompt(contextForPrompt),
      messages: [...history, { role: "user", content: message }],
    });
    return response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
  } catch (error) {
    throw toHttpError(error);
  }
}

function buildSystemPrompt(contextForPrompt) {
  return [
    "あなたはALBアクセスログの400系エラーを調査する社内ツールのアシスタントです。",
    "必ず日本語で回答してください。",
    "以下のJSONは、現在保存されている全アクセスログを集計した結果です。回答はこのJSONの範囲内でわかることだけを根拠にしてください。",
    "JSONから判断できないことは、推測せずに「このデータからはわかりません」と答えてください。",
    "",
    "```json",
    JSON.stringify(contextForPrompt),
    "```",
  ].join("\n");
}

function toHttpError(error) {
  if (error instanceof Anthropic.AuthenticationError) {
    return new HttpError(500, "ANTHROPIC_API_KEY が正しく設定されていません。");
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new HttpError(429, "Claude API のリクエストが混み合っています。しばらく待って再度お試しください。");
  }
  if (error instanceof Anthropic.APIError) {
    return new HttpError(502, "Claude API の呼び出しに失敗しました。");
  }
  console.error(error);
  return new HttpError(500, "応答の生成に失敗しました。");
}
