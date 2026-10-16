import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const MCP_URL = "https://alb-log-mcp-258502436840.asia-northeast1.run.app/mcp";

// alb-query-api(SQL実行)とは別の、集計済みの結果を返すMCPサーバー。APIキーは共通。
let mcpClientPromise = null;
let toolsCache = null;

async function getMcpClient() {
  if (!mcpClientPromise) {
    mcpClientPromise = connectMcpClient().catch((error) => {
      mcpClientPromise = null; // 次回また接続を試せるようにする
      throw error;
    });
  }
  return mcpClientPromise;
}

async function connectMcpClient() {
  const apiKey = process.env.ALB_QUERY_API_KEY;
  if (!apiKey) throw new Error("ALB_QUERY_API_KEY が設定されていません。");

  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    requestInit: { headers: { "X-API-Key": apiKey } },
  });
  const client = new Client({ name: "camp-chat", version: "0.0.1" });
  await client.connect(transport);
  return client;
}

// Anthropicのtool use用の定義一覧。初回だけMCPサーバーに問い合わせて以後は使い回す。
// 接続に失敗した場合はログを出し、ツールなし([])でチャット自体は続けられるようにする。
export async function listMcpTools() {
  if (toolsCache) return toolsCache;
  try {
    const client = await getMcpClient();
    const { tools } = await client.listTools();
    toolsCache = tools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? "",
      input_schema: tool.inputSchema,
    }));
    return toolsCache;
  } catch (error) {
    console.error("alb-log-mcp からツール一覧を取得できませんでした。", error);
    return [];
  }
}

export async function callMcpTool(name, args) {
  console.log(`[alb-log-mcp] request: ${name} ${JSON.stringify(args ?? {})}`);
  const client = await getMcpClient();
  const result = await client.callTool({ name, arguments: args ?? {} });
  const text = extractResultText(result);
  console.log(`[alb-log-mcp] response: ${name} ${text}`);
  return text;
}

function extractResultText(result) {
  const text = (result.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
  return text !== "" ? text : JSON.stringify(result.structuredContent ?? result);
}
