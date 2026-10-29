import type { ChatMessage } from "./llm.ts";
import type { Message } from "./db.ts";

/** Converte o histórico do banco no formato de mensagens do modelo (alternando user/assistant). */
export function toChat(msgs: Message[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of msgs) {
    const role = m.direction === "in" ? "user" : "assistant";
    const text = m.author === "humano" ? `[Equipe respondeu manualmente] ${m.content}` : m.content;
    const last = out[out.length - 1];
    if (last && last.role === role) last.content = `${last.content as string}\n${text}`;
    else out.push({ role, content: text });
  }
  if (out[0]?.role === "assistant") out.unshift({ role: "user", content: "[início da conversa]" });
  return out;
}
