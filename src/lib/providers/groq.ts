// Groq Provider Adapter
import { ProviderAdapter, Model, Message, ChatConfig, StreamCallbacks } from '@/types';
import { calculateCost } from '@/lib/storage';

// Groq has generous free tier, pricing for paid tier
const GROQ_PRICING: Record<string, { input: number; output: number }> = {
    'llama-3.3-70b': { input: 0.59, output: 0.79 },
    'llama-3.1-70b': { input: 0.59, output: 0.79 },
    'llama-3.1-8b': { input: 0.05, output: 0.08 },
    'mixtral-8x7b': { input: 0.24, output: 0.24 },
    'gemma2-9b': { input: 0.20, output: 0.20 },
};

function getModelPricing(modelId: string): { input: number; output: number } {
    for (const [key, pricing] of Object.entries(GROQ_PRICING)) {
        if (modelId.toLowerCase().includes(key.toLowerCase())) {
            return pricing;
        }
    }
    return { input: 0.10, output: 0.10 }; // Default low pricing
}

export const groqAdapter: ProviderAdapter = {
    providerId: 'groq',

    async fetchModels(apiKey: string): Promise<Model[]> {
        const response = await fetch('https://api.groq.com/openai/v1/models', {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
            },
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch Groq models: ${response.statusText}`);
        }

        const data = await response.json();

        return data.data
            .filter((model: { id: string }) => !model.id.includes('whisper'))
            .map((model: { id: string; context_window?: number }) => {
                const pricing = getModelPricing(model.id);
                const supportsImages = model.id.toLowerCase().includes('vision');
                return {
                    id: model.id,
                    name: model.id,
                    providerId: 'groq' as const,
                    contextLength: model.context_window,
                    pricing,
                    supportsImages,
                    supportsDocuments: supportsImages,
                    supportsCode: true,
                    supportsFunctionCalling: true,
                    description: 'High-performance inference for open-source models',
                };
            });
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

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
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
            throw new Error(`Groq API error: ${error}`);
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
