// OpenAI Provider Adapter
import { ProviderAdapter, Model, Message, ChatConfig, StreamCallbacks } from '@/types';
import { calculateCost } from '@/lib/storage';

// Pricing per 1M tokens
const OPENAI_PRICING: Record<string, { input: number; output: number }> = {
    'gpt-4o': { input: 2.50, output: 10.00 },
    'gpt-4o-mini': { input: 0.15, output: 0.60 },
    'gpt-4-turbo': { input: 10.00, output: 30.00 },
    'gpt-4': { input: 30.00, output: 60.00 },
    'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
    'o1': { input: 15.00, output: 60.00 },
    'o1-mini': { input: 3.00, output: 12.00 },
    'o3-mini': { input: 1.10, output: 4.40 },
};

function getModelPricing(modelId: string): { input: number; output: number } {
    for (const [key, pricing] of Object.entries(OPENAI_PRICING)) {
        if (modelId.toLowerCase().includes(key.toLowerCase())) {
            return pricing;
        }
    }
    return { input: 2.50, output: 10.00 }; // Default to gpt-4o pricing
}

function getModelContext(modelId: string): number {
    if (modelId.includes('128k') || modelId.includes('gpt-4-turbo') || modelId.includes('gpt-4o') || modelId.includes('o1')) return 128000;
    if (modelId.includes('32k')) return 32768;
    if (modelId.includes('16k')) return 16384;
    if (modelId.includes('gpt-4')) return 8192;
    if (modelId.includes('gpt-3.5')) return 16385; // Most recent 3.5 turbo
    return 128000; // Default reasonable high limit
}

export const openaiAdapter: ProviderAdapter = {
    providerId: 'openai',

    async fetchModels(apiKey: string): Promise<Model[]> {
        const response = await fetch('https://api.openai.com/v1/models', {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
            },
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch OpenAI models: ${response.statusText}`);
        }

        const data = await response.json();

        // Filter to only chat models
        const chatModels = data.data
            .filter((model: { id: string }) =>
                model.id.includes('gpt') || model.id.includes('o1') || model.id.includes('o3')
            )
            .map((model: { id: string }) => {
                const pricing = getModelPricing(model.id);
                const isLatest = model.id.includes('gpt-4o') || model.id.includes('o1') || model.id.includes('o3');
                const supportsImages = isLatest || model.id.includes('gpt-4-turbo');
                return {
                    id: model.id,
                    name: model.id,
                    providerId: 'openai' as const,
                    contextLength: getModelContext(model.id),
                    pricing,
                    supportsImages,
                    supportsDocuments: supportsImages,
                    supportsCode: true, // Most OpenAI models are great at code
                    supportsFunctionCalling: !model.id.includes('instruct'),
                    description: isLatest ? 'Our most capable and versatile models' : 'Reliable models for general tasks',
                };
            })
            .sort((a: Model, b: Model) => a.id.localeCompare(b.id));

        return chatModels;
    },

    async streamChat(
        messages: Message[],
        config: ChatConfig,
        apiKey: string,
        callbacks: StreamCallbacks,
        signal?: AbortSignal
    ): Promise<void> {
        const chatMessages = messages.map(msg => {
            if (msg.attachments && msg.attachments.length > 0) {
                const content: any[] = [];
                if (msg.content) {
                    content.push({ type: 'text', text: msg.content });
                }
                msg.attachments.forEach(att => {
                    if (att.type === 'image') {
                        content.push({
                            type: 'image_url',
                            image_url: { url: att.data }
                        });
                    }
                });
                return { role: msg.role, content };
            }
            return {
                role: msg.role,
                content: msg.content,
            };
        });

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: config.model,
                messages: chatMessages,
                temperature: config.temperature ?? 0.7,
                max_tokens: config.maxTokens ?? 4096,
                stream: true,
            }),
            signal,
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`OpenAI API error: ${error}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
            throw new Error('No response body');
        }

        const decoder = new TextDecoder();
        let fullResponse = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const jsonStr = line.slice(6);
                        if (jsonStr.trim() === '[DONE]') continue;

                        try {
                            const data = JSON.parse(jsonStr);
                            const text = data.choices?.[0]?.delta?.content;
                            if (text) {
                                fullResponse += text;
                                callbacks.onToken(text);
                            }
                        } catch {
                            // Skip invalid JSON
                        }
                    }
                }
            }
            callbacks.onComplete(fullResponse);
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                callbacks.onComplete(fullResponse);
            } else {
                callbacks.onError(error as Error);
            }
        }
    },

    estimateCost(inputTokens: number, outputTokens: number, modelId: string): number {
        const pricing = getModelPricing(modelId);
        return calculateCost(inputTokens, outputTokens, pricing.input, pricing.output);
    },
};
