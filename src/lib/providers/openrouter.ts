// OpenRouter Provider Adapter
import { ProviderAdapter, Model, Message, ChatConfig, StreamCallbacks } from '@/types';
import { calculateCost } from '@/lib/storage';

export const openrouterAdapter: ProviderAdapter = {
    providerId: 'openrouter',

    async fetchModels(apiKey: string): Promise<Model[]> {
        const response = await fetch('https://openrouter.ai/api/v1/models', {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
            },
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch OpenRouter models: ${response.statusText}`);
        }

        const data = await response.json();

        return data.data.map((model: {
            id: string;
            name: string;
            context_length?: number;
            pricing?: { prompt: string; completion: string };
            description?: string;
            architecture?: {
                modality?: string;
                input_modalities?: string[];
            };
        }) => {
            // OpenRouter provides pricing in the response
            const inputPrice = model.pricing?.prompt ? parseFloat(model.pricing.prompt) * 1_000_000 : 0;
            const outputPrice = model.pricing?.completion ? parseFloat(model.pricing.completion) * 1_000_000 : 0;

            const supportsImages =
                model.architecture?.modality?.includes('image') ||
                model.architecture?.input_modalities?.includes('image') ||
                model.id.includes('vision');

            const supportsDocuments =
                model.architecture?.modality?.includes('multimodal') ||
                model.architecture?.input_modalities?.includes('document') ||
                model.id.includes('claude-3') || // Claude 3 models support PDFs
                model.id.includes('gemini-1.5'); // Gemini 1.5 models support PDFs

            return {
                id: model.id,
                name: model.name || model.id,
                providerId: 'openrouter' as const,
                contextLength: model.context_length,
                pricing: {
                    input: inputPrice,
                    output: outputPrice,
                },
                supportsImages,
                supportsDocuments,
                supportsCode: true,
                supportsFunctionCalling: true,
                description: model.description || 'OpenRouter model',
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

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : '',
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
            throw new Error(`OpenRouter API error: ${error}`);
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
        // OpenRouter models have dynamic pricing, this is a fallback
        // Real pricing should come from the model data
        console.log(`Cost estimation for ${modelId}`);
        return calculateCost(inputTokens, outputTokens, 1.0, 2.0);
    },
};
