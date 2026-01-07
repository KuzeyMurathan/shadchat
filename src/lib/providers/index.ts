// Provider Registry - exports all provider adapters
import { ProviderAdapter, ProviderId } from '@/types';
import { geminiAdapter } from './gemini';
import { anthropicAdapter } from './anthropic';
import { openaiAdapter } from './openai';
import { xaiAdapter } from './xai';
import { groqAdapter } from './groq';
import { openrouterAdapter } from './openrouter';

export const providerAdapters: Record<ProviderId, ProviderAdapter> = {
    gemini: geminiAdapter,
    anthropic: anthropicAdapter,
    openai: openaiAdapter,
    xai: xaiAdapter,
    groq: groqAdapter,
    openrouter: openrouterAdapter,
};

export function getAdapter(providerId: ProviderId): ProviderAdapter {
    const adapter = providerAdapters[providerId];
    if (!adapter) {
        throw new Error(`Unknown provider: ${providerId}`);
    }
    return adapter;
}

export * from './gemini';
export * from './anthropic';
export * from './openai';
export * from './xai';
export * from './groq';
export * from './openrouter';
