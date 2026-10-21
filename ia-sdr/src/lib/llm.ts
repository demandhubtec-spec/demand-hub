/**
 * Chamada à API da OpenAI (Chat Completions) com function calling.
 */
import { env } from "./env.ts";

export interface Tool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export interface LLMResponse {
  message: { role: "assistant"; content: string | null; tool_calls?: ToolCall[] };
  finish_reason: string;
}

export async function callLLM(opts: {
  system: string;
  messages: ChatMessage[];
  tools?: Tool[];
  maxTokens?: number;
}): Promise<LLMResponse> {
  const body: Record<string, unknown> = {
    model: env.openaiModel,
    messages: [{ role: "system", content: opts.system }, ...opts.messages],
    max_completion_tokens: opts.maxTokens ?? 2000,
  };
  if (env.openaiReasoningEffort) body.reasoning_effort = env.openaiReasoningEffort;
  if (opts.tools?.length) {
    body.tools = opts.tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.input_schema },
    }));
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.openaiKey}` },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const json = (await res.json()) as { choices: LLMResponse[] };
      return json.choices[0];
    }
    if ([429, 500, 502, 503].includes(res.status) && attempt < 2) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    throw new Error(`OpenAI API ${res.status}: ${await res.text()}`);
  }
  throw new Error("OpenAI API: sem resposta");
}

export function parseArgs(call: ToolCall): Record<string, unknown> {
  try {
    return JSON.parse(call.function.arguments || "{}");
  } catch {
    return {};
  }
}
