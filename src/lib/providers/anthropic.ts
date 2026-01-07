// Anthropic Claude Provider Adapter
import { ProviderAdapter, Model, Message, ChatConfig, StreamCallbacks } from '@/types';
import { calculateCost } from '@/lib/storage';

// Pricing per 1M tokens
const ANTHROPIC_PRICING: Record<string, { input: number; output: number }> = {
    'claude-3-5-sonnet': { input: 3.00, output: 15.00 },
    'claude-3-5-haiku': { input: 1.00, output: 5.00 },
    'claude-3-opus': { input: 15.00, output: 75.00 },
    'claude-3-sonnet': { input: 3.00, output: 15.00 },
    'claude-3-haiku': { input: 0.25, output: 1.25 },
};

// Anthropic doesn't have a models endpoint, so we hardcode available models
const ANTHROPIC_MODELS: Model[] = [
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', providerId: 'anthropic', contextLength: 200000, pricing: { input: 3.00, output: 15.00 }, supportsImages: true, supportsDocuments: true, supportsCode: true, supportsFunctionCalling: true, description: 'Next generation flagship model' },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', providerId: 'anthropic', contextLength: 200000, pricing: { input: 3.00, output: 15.00 }, supportsImages: true, supportsDocuments: true, supportsCode: true, supportsFunctionCalling: true, description: 'Best balance of speed and intelligence' },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', providerId: 'anthropic', contextLength: 200000, pricing: { input: 1.00, output: 5.00 }, supportsImages: true, supportsDocuments: true, supportsCode: true, supportsFunctionCalling: true, description: 'Fastest and most efficient model' },
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', providerId: 'anthropic', contextLength: 200000, pricing: { input: 15.00, output: 75.00 }, supportsImages: true, supportsDocuments: true, supportsCode: true, supportsFunctionCalling: true, description: 'Powerful model for highly complex tasks' },
    { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', providerId: 'anthropic', contextLength: 200000, pricing: { input: 3.00, output: 15.00 }, supportsImages: true, supportsDocuments: true, supportsCode: true, supportsFunctionCalling: true, description: 'Balance of intelligence and speed' },
    { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', providerId: 'anthropic', contextLength: 200000, pricing: { input: 0.25, output: 1.25 }, supportsImages: true, supportsDocuments: true, supportsCode: true, supportsFunctionCalling: true, description: 'Near-instant responsiveness' },
];

function getModelPricing(modelId: string): { input: number; output: number } {
    for (const [key, pricing] of Object.entries(ANTHROPIC_PRICING)) {
        if (modelId.toLowerCase().includes(key.replace('claude-', ''))) {
            return pricing;
        }
    }
    return { input: 3.00, output: 15.00 }; // Default to Sonnet pricing
}

export const anthropicAdapter: ProviderAdapter = {
    providerId: 'anthropic',

    async fetchModels(): Promise<Model[]> {
        // Anthropic doesn't have a public models endpoint
        return ANTHROPIC_MODELS;
    },

    async streamChat(
        messages: Message[],
        config: ChatConfig,
        apiKey: string,
        callbacks: StreamCallbacks,
        signal?: AbortSignal
    ): Promise<void> {
        const systemMessage = messages.find(m => m.role === 'system');
        const chatMessages = messages
            .filter(m => m.role !== 'system')
            .map(msg => {
                if (msg.attachments && msg.attachments.length > 0) {
                    const content: any[] = [];

                    // Add attachments first (recommended for best performance)
                    msg.attachments.forEach(att => {
                        if (att.type === 'image') {
                            const parts_base64 = att.data.split(',');
                            const data = parts_base64.length > 1 ? parts_base64[1] : parts_base64[0];
                            const header = parts_base64.length > 1 ? parts_base64[0] : '';
                            const mimeType = header.match(/:(.*?);/)?.[1] || att.mimeType;

                            content.push({
                                type: 'image',
                                source: {
                                    type: 'base64',
                                    media_type: mimeType,
                                    data: data
                                }
                            });
                        } else if (att.mimeType === 'application/pdf') {
                            const parts_base64 = att.data.split(',');
                            const data = parts_base64.length > 1 ? parts_base64[1] : parts_base64[0];

                            content.push({
                                type: 'document',
                                source: {
                                    type: 'base64',
                                    media_type: 'application/pdf',
                                    data: data
                                }
                            });
                        }
                    });

                    // Add text block last
                    if (msg.content) {
                        content.push({ type: 'text', text: msg.content });
                    }

                    return { role: msg.role, content };
                }
                return {
                    role: msg.role,
                    content: msg.content,
                };
            });

        const requestBody: Record<string, unknown> = {
            model: config.model,
            max_tokens: config.maxTokens ?? 8192,
            messages: chatMessages,
            stream: true,
        };

        if (systemMessage) {
            requestBody.system = systemMessage.content;
        }

        if (config.temperature !== undefined) {
            requestBody.temperature = config.temperature;
        }

        const hasPdf = messages.some(m => m.attachments?.some(a => a.mimeType === 'application/pdf'));
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
        };

        if (hasPdf) {
            headers['anthropic-beta'] = 'pdfs-2024-09-25';
        }

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers,
            body: JSON.stringify(requestBody),
            signal,
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Anthropic API error: ${error}`);
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

                            if (data.type === 'content_block_delta') {
                                const text = data.delta?.text;
                                if (text) {
                                    fullResponse += text;
                                    callbacks.onToken(text);
                                }
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
