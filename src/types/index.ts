// Type definitions for the AI Chat Platform

export type ProviderId = 'gemini' | 'anthropic' | 'openai' | 'xai' | 'groq' | 'openrouter';

export interface Provider {
  id: ProviderId;
  name: string;
  baseUrl: string;
  modelsEndpoint?: string;
  supportsModelFetching: boolean;
}

export interface Model {
  id: string;
  name: string;
  providerId: ProviderId;
  contextLength?: number;
  pricing?: {
    input: number;  // per 1M tokens
    output: number; // per 1M tokens
  };
  supportsImages?: boolean;
  supportsDocuments?: boolean;
  supportsCode?: boolean;
  supportsFunctionCalling?: boolean;
  description?: string;
}

export interface Attachment {
  id: string;
  type: string;
  name: string;
  mimeType: string;
  size: number;
  data: string; // base64 data
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  tokenCount?: number;
  timing?: number; // Time taken in seconds
  model?: string; // Model used for generation
  attachments?: Attachment[];
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  providerId: ProviderId;
  modelId: string;
  createdAt: number;
  updatedAt: number;
  totalCost?: number;
  disableSystemPrompt?: boolean;
  pinned?: boolean;
  groupId?: string;
}

export interface ChatGroup {
  id: string;
  title: string;
  collapsed?: boolean;
  order?: number;
}

export interface ChatConfig {
  model: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface ApiKeys {
  gemini?: string;
  anthropic?: string;
  openai?: string;
  xai?: string;
  groq?: string;
  openrouter?: string;
  [key: string]: string | undefined;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  defaultProvider: ProviderId;
  defaultModel?: string;
  systemPrompt?: string;
  username?: string;
  avatar?: string; // base64 or URL
}

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onComplete: (fullResponse: string) => void;
  onError: (error: Error) => void;
}

// Provider adapter interface
export interface ProviderAdapter {
  providerId: ProviderId;
  fetchModels(apiKey: string): Promise<Model[]>;
  streamChat(
    messages: Message[],
    config: ChatConfig,
    apiKey: string,
    callbacks: StreamCallbacks,
    signal?: AbortSignal
  ): Promise<void>;
  estimateCost(inputTokens: number, outputTokens: number, modelId: string): number;
}

// Provider configurations
export const PROVIDERS: Record<ProviderId, Provider> = {
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    modelsEndpoint: '/v1beta/models',
    supportsModelFetching: true,
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic Claude',
    baseUrl: 'https://api.anthropic.com',
    supportsModelFetching: false,
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com',
    modelsEndpoint: '/v1/models',
    supportsModelFetching: true,
  },
  xai: {
    id: 'xai',
    name: 'xAI Grok',
    baseUrl: 'https://api.x.ai',
    modelsEndpoint: '/v1/models',
    supportsModelFetching: true,
  },
  groq: {
    id: 'groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com',
    modelsEndpoint: '/openai/v1/models',
    supportsModelFetching: true,
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai',
    modelsEndpoint: '/api/v1/models',
    supportsModelFetching: true,
  },
};
