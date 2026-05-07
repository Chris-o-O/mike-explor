import OpenAI from "openai";
import type {
    StreamChatParams,
    StreamChatResult,
    NormalizedToolCall,
} from "./types";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const MAX_TOKENS = 16384;

function client(override?: string | null): OpenAI {
    return new OpenAI({
        apiKey: override?.trim() || process.env.OPENROUTER_API_KEY || "",
        baseURL: OPENROUTER_BASE,
    });
}

export async function streamOpenRouter(
    params: StreamChatParams,
): Promise<StreamChatResult> {
    const { model, systemPrompt, tools = [], callbacks = {}, runTools, apiKeys } =
        params;
    const maxIter = params.maxIterations ?? 10;
    const openai = client(apiKeys?.openrouter);

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: "system", content: systemPrompt },
        ...params.messages.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
        })),
    ];

    const openaiTools: OpenAI.Chat.ChatCompletionTool[] | undefined =
        tools.length
            ? tools.map((t) => ({
                  type: "function" as const,
                  function: {
                      name: t.function.name,
                      description: t.function.description,
                      parameters: t.function.parameters as Record<string, unknown>,
                  },
              }))
            : undefined;

    let fullText = "";

    for (let iter = 0; iter < maxIter; iter++) {
        const stream = await openai.chat.completions.create({
            model,
            messages,
            tools: openaiTools,
            tool_choice: openaiTools ? "auto" : undefined,
            max_tokens: MAX_TOKENS,
            stream: true,
        });

        let iterText = "";
        let finishReason: string | null = null;
        const toolCallAccumulator = new Map<
            number,
            { id: string; name: string; argumentsRaw: string }
        >();

        for await (const chunk of stream) {
            const choice = chunk.choices[0];
            if (!choice) continue;

            if (choice.finish_reason) finishReason = choice.finish_reason;

            const delta = choice.delta;
            if (!delta) continue;

            if (delta.content) {
                iterText += delta.content;
                callbacks.onContentDelta?.(delta.content);
            }

            if (delta.tool_calls) {
                for (const tc of delta.tool_calls) {
                    const idx = tc.index;
                    if (!toolCallAccumulator.has(idx)) {
                        toolCallAccumulator.set(idx, {
                            id: tc.id ?? "",
                            name: tc.function?.name ?? "",
                            argumentsRaw: "",
                        });
                    }
                    const acc = toolCallAccumulator.get(idx)!;
                    if (tc.id) acc.id = tc.id;
                    if (tc.function?.name) acc.name += tc.function.name;
                    if (tc.function?.arguments) acc.argumentsRaw += tc.function.arguments;
                }
            }
        }

        fullText += iterText;

        if (
            finishReason !== "tool_calls" ||
            toolCallAccumulator.size === 0 ||
            !runTools
        ) {
            break;
        }

        const normalizedCalls: NormalizedToolCall[] = [];
        const openaiToolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[] = [];

        for (const [, acc] of toolCallAccumulator) {
            let input: Record<string, unknown> = {};
            try {
                input = JSON.parse(acc.argumentsRaw);
            } catch {
                // ignore malformed JSON
            }
            const call: NormalizedToolCall = { id: acc.id, name: acc.name, input };
            callbacks.onToolCallStart?.(call);
            normalizedCalls.push(call);
            openaiToolCalls.push({
                id: acc.id,
                type: "function",
                function: { name: acc.name, arguments: acc.argumentsRaw },
            });
        }

        const results = await runTools(normalizedCalls);

        messages.push({
            role: "assistant",
            content: iterText || null,
            tool_calls: openaiToolCalls,
        });

        for (const r of results) {
            messages.push({
                role: "tool",
                tool_call_id: r.tool_use_id,
                content: r.content,
            });
        }
    }

    return { fullText };
}

export async function completeOpenRouterText(params: {
    model: string;
    systemPrompt?: string;
    user: string;
    maxTokens?: number;
    apiKeys?: { openrouter?: string | null };
}): Promise<string> {
    const openai = client(params.apiKeys?.openrouter);
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (params.systemPrompt) {
        messages.push({ role: "system", content: params.systemPrompt });
    }
    messages.push({ role: "user", content: params.user });

    const resp = await openai.chat.completions.create({
        model: params.model,
        messages,
        max_tokens: params.maxTokens ?? 512,
        stream: false,
    });
    return resp.choices[0]?.message?.content ?? "";
}
