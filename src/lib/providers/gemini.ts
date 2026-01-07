// Google Gemini Provider Adapter
import { ProviderAdapter, Model, Message, ChatConfig, StreamCallbacks } from '@/types';
import { calculateCost, estimateTokens } from '@/lib/storage';

// Pricing per 1M tokens (approximate, as of early 2025)
const GEMINI_PRICING: Record<string, { input: number; output: number }> = {
    'gemini-2.5-pro': { input: 1.25, output: 10.00 },
    'gemini-2.5-flash': { input: 0.15, output: 0.60 },
    'gemini-2.0-flash': { input: 0.10, output: 0.40 },
    'gemini-1.5-pro': { input: 1.25, output: 5.00 },
    'gemini-1.5-flash': { input: 0.075, output: 0.30 },
    'gemini-1.0-pro': { input: 0.50, output: 1.50 },
};

function getModelPricing(modelId: string): { input: number; output: number } {
    // Find matching pricing by checking if model ID contains the key
    for (const [key, pricing] of Object.entries(GEMINI_PRICING)) {
        if (modelId.toLowerCase().includes(key.toLowerCase().replace('gemini-', ''))) {
            return pricing;
        }
    }
    // Default to flash pricing
    return { input: 0.15, output: 0.60 };
}

export const geminiAdapter: ProviderAdapter = {
    providerId: 'gemini',

    async fetchModels(apiKey: string): Promise<Model[]> {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
        );

        if (!response.ok) {
            throw new Error(`Failed to fetch Gemini models: ${response.statusText}`);
        }

        const data = await response.json();

        return data.models
            .filter((model: { supportedGenerationMethods?: string[] }) =>
                model.supportedGenerationMethods?.includes('generateContent')
            )
            .map((model: { name: string; displayName: string; inputTokenLimit?: number }) => {
                const modelId = model.name.replace('models/', '');
                const pricing = getModelPricing(modelId);
                const isMultimodal = modelId.includes('1.5') || modelId.includes('2.0') || modelId.includes('2.5');
                const isPro = modelId.includes('pro');
                return {
                    id: modelId,
                    name: model.displayName || modelId,
                    providerId: 'gemini' as const,
                    contextLength: model.inputTokenLimit,
                    pricing,
                    supportsImages: isMultimodal,
                    supportsDocuments: isMultimodal,
                    supportsCode: true,
                    supportsFunctionCalling: true,
                    description: isPro ? 'Highly capable model for complex reasoning' : 'Fast and efficient model for most tasks',
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
        const contents = messages
            .filter(m => m.role !== 'system')
            .map(msg => {
                const parts: any[] = [];

                // Add attachments first (recommended for Gemini)
                if (msg.attachments && msg.attachments.length > 0) {
                    msg.attachments.forEach(att => {
                        const parts_base64 = att.data.split(',');
                        const data = parts_base64.length > 1 ? parts_base64[1] : parts_base64[0];
                        const header = parts_base64.length > 1 ? parts_base64[0] : '';
                        const mimeType = header.match(/:(.*?);/)?.[1] || att.mimeType;

                        parts.push({
                            inline_data: {
                                mime_type: mimeType,
                                data: data
                            }
                        });
                    });
                }

                // Add text part if it exists and is not empty
                if (msg.content && msg.content.trim().length > 0) {
                    parts.push({ text: msg.content });
                }

                return {
                    role: msg.role === 'user' ? 'user' : 'model',
                    parts
                };
            });

        const systemInstruction = messages.find(m => m.role === 'system');

        const requestBody: Record<string, unknown> = {
            contents,
            generationConfig: {
                temperature: config.temperature ?? 0.7,
                maxOutputTokens: config.maxTokens ?? 8192,
            },
            safetySettings: [
                { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
                { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
                { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
                { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
            ],
        };

        if (systemInstruction) {
            requestBody.systemInstruction = {
                parts: [{ text: systemInstruction.content }],
            };
        }

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:streamGenerateContent?alt=sse&key=${apiKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
                signal,
            }
        );

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Gemini API error: ${error}`);
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
                            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
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
