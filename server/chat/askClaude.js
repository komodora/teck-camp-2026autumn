import Anthropic from "@anthropic-ai/sdk";
import { HttpError } from "../httpError.js";
import { ACCESS_LOG_SEARCH_TOOL } from "./accessLogSearchTool.js";

const MODEL = "claude-sonnet-5-5";
const MAX_TOKENS = 2000;
const MAX_TOOL_ROUNDS = 5;

let client;
function getClient() {
  if (!client) {
    const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID;
    client = new Anthropic({
      // ANTHROPIC_API_KEY は process.env から自動解決。
      // ワークスペースに紐付かないAPIキーの場合、どのワークスペースを使うか anthropic-workspace-id ヘッダーで明示する必要がある。
      defaultHeaders: workspaceId ? { "anthropic-workspace-id": workspaceId } : undefined,
    });
  }
  return client;
}

export async function askClaude({ message, history, contextForPrompt, searchAccessLogs }) {
  const system = buildSystemPrompt(contextForPrompt);
  const messages = [...history, { role: "user", content: message }];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const response = await createMessage({ system, messages });
    if (response.stop_reason !== "tool_use") return textFromResponse(response);

    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: await resolveToolResults(response.content, searchAccessLogs) });
  }

  throw new HttpError(502, "応答の生成が完了しませんでした。質問を分けて試してください。");
}

async function createMessage({ system, messages }) {
  try {
    return await getClient().messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      output_config: { effort: "low" },
      system,
      messages,
      tools: [ACCESS_LOG_SEARCH_TOOL],
    });
  } catch (error) {
    throw toHttpError(error);
  }
}

async function resolveToolResults(content, searchAccessLogs) {
  const toolUseBlocks = content.filter((block) => block.type === "tool_use");
  const results = [];
  for (const block of toolUseBlocks) {
    const output = await runTool(block, searchAccessLogs);
    results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(output) });
  }
  return results;
}

async function runTool(block, searchAccessLogs) {
  if (block.name !== ACCESS_LOG_SEARCH_TOOL.name) {
    return { error: "unknown tool" };
  }
  return await searchAccessLogs(block.input ?? {});
}

function textFromResponse(response) {
  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function buildSystemPrompt(contextForPrompt) {
  return [
    "あなたはALBアクセスログの400系エラーを調査する社内ツールのアシスタントです。",
    "必ず日本語で回答してください。",
    "以下のJSONは、現在保存されている全アクセスログを集計した結果です。",
    "基本的にはこのJSONの範囲内でわかることを根拠にしてください。",
    "個別リクエストのタイムスタンプ・User-Agent・レスポンスバイト数など、このJSON(集計結果)だけではわからない詳細を聞かれた場合は、search_access_logs ツールで生ログに近い個別リクエストを検索してから回答してください。",
    "ツールを使っても判断できないことは、推測せずに「このデータからはわかりません」と答えてください。",
    "",
    "```json",
    JSON.stringify(contextForPrompt),
    "```",
  ].join("\n");
}

function toHttpError(error) {
  console.error(error);

  if (error instanceof Anthropic.AuthenticationError) {
    return new HttpError(500, "ANTHROPIC_API_KEY が正しく設定されていません。");
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new HttpError(429, "Claude API のリクエストが混み合っています。しばらく待って再度お試しください。");
  }
  if (error instanceof Anthropic.APIError) {
    return new HttpError(502, "Claude API の呼び出しに失敗しました。");
  }
  return new HttpError(500, "応答の生成に失敗しました。");
}
