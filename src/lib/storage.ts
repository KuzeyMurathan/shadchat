'use client';

import { ApiKeys, Conversation, UserPreferences, ProviderId, ChatGroup } from '@/types';
import { v4 as uuidv4 } from 'uuid';

const STORAGE_KEYS = {
    API_KEYS: 'ai-chat-api-keys',
    CONVERSATIONS: 'ai-chat-conversations',
    PREFERENCES: 'ai-chat-preferences',
    GROUPS: 'ai-chat-groups',
} as const;

// API Keys
export function getApiKeys(): ApiKeys {
    if (typeof window === 'undefined') return {};
    const stored = localStorage.getItem(STORAGE_KEYS.API_KEYS);
    return stored ? JSON.parse(stored) : {};
}

export function setApiKey(providerId: ProviderId, key: string): void {
    const keys = getApiKeys();
    keys[providerId] = key;
    localStorage.setItem(STORAGE_KEYS.API_KEYS, JSON.stringify(keys));
}

export function removeApiKey(providerId: ProviderId): void {
    const keys = getApiKeys();
    delete keys[providerId];
    localStorage.setItem(STORAGE_KEYS.API_KEYS, JSON.stringify(keys));
}

export function hasApiKey(providerId: ProviderId): boolean {
    const keys = getApiKeys();
    return !!keys[providerId];
}

// Conversations
export function getConversations(): Conversation[] {
    if (typeof window === 'undefined') return [];
    const stored = localStorage.getItem(STORAGE_KEYS.CONVERSATIONS);
    return stored ? JSON.parse(stored) : [];
}

export function getConversation(id: string): Conversation | undefined {
    return getConversations().find(c => c.id === id);
}

export function saveConversation(conversation: Conversation): void {
    const conversations = getConversations();
    const index = conversations.findIndex(c => c.id === conversation.id);

    if (index >= 0) {
        conversations[index] = conversation;
    } else {
        conversations.unshift(conversation);
    }

    localStorage.setItem(STORAGE_KEYS.CONVERSATIONS, JSON.stringify(conversations));
}

export function deleteConversation(id: string): void {
    const conversations = getConversations().filter(c => c.id !== id);
    localStorage.setItem(STORAGE_KEYS.CONVERSATIONS, JSON.stringify(conversations));
}

export function togglePinConversation(id: string): void {
    const conv = getConversation(id);
    if (conv) {
        conv.pinned = !conv.pinned;
        // Also update updatedAt so it might float to top? No, pinned section is separate.
        saveConversation(conv);
    }
}

// Groups
export function getGroups(): ChatGroup[] {
    if (typeof window === 'undefined') return [];
    const stored = localStorage.getItem(STORAGE_KEYS.GROUPS);
    return stored ? JSON.parse(stored) : [];
}

export function saveGroups(groups: ChatGroup[]): void {
    localStorage.setItem(STORAGE_KEYS.GROUPS, JSON.stringify(groups));
}

export function createGroup(title: string): ChatGroup {
    const newGroup: ChatGroup = {
        id: uuidv4(),
        title,
        collapsed: false,
        order: Date.now(),
    };
    const groups = getGroups();
    groups.push(newGroup);
    saveGroups(groups);
    return newGroup;
}

export function deleteGroup(id: string): void {
    const groups = getGroups().filter(g => g.id !== id);
    saveGroups(groups);

    // Ungroup conversations
    const conversations = getConversations();
    let changed = false;
    conversations.forEach(c => {
        if (c.groupId === id) {
            delete c.groupId;
            changed = true;
        }
    });
    if (changed) {
        localStorage.setItem(STORAGE_KEYS.CONVERSATIONS, JSON.stringify(conversations));
    }
}

export function renameGroup(id: string, newTitle: string): void {
    const groups = getGroups();
    const group = groups.find(g => g.id === id);
    if (group) {
        group.title = newTitle;
        saveGroups(groups);
    }
}

export function toggleGroupCollapse(id: string): void {
    const groups = getGroups();
    const group = groups.find(g => g.id === id);
    if (group) {
        group.collapsed = !group.collapsed;
        saveGroups(groups);
    }
}

export function moveConversationToGroup(conversationId: string, groupId: string | undefined): void {
    const conversations = getConversations();
    const index = conversations.findIndex(c => c.id === conversationId);
    if (index >= 0) {
        if (groupId) {
            conversations[index].groupId = groupId;
        } else {
            delete conversations[index].groupId;
        }
        localStorage.setItem(STORAGE_KEYS.CONVERSATIONS, JSON.stringify(conversations));
    }
}


export function createNewConversation(providerId: ProviderId, modelId: string): Conversation {
    return {
        id: uuidv4(),
        title: 'New Chat',
        messages: [],
        providerId,
        modelId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        totalCost: 0,
    };
}

export function generateConversationTitle(firstMessage: string): string {
    // Take first 50 characters of the message as title
    const title = firstMessage.slice(0, 50).trim();
    return title.length < firstMessage.length ? `${title}...` : title;
}

// User Preferences
export function getPreferences(): UserPreferences {
    if (typeof window === 'undefined') {
        return { theme: 'system', defaultProvider: 'openai', systemPrompt: '', username: 'User' };
    }
    const stored = localStorage.getItem(STORAGE_KEYS.PREFERENCES);
    return stored ? JSON.parse(stored) : { theme: 'system', defaultProvider: 'openai', systemPrompt: '', username: 'User' };
}

export function setPreferences(preferences: Partial<UserPreferences>): void {
    const current = getPreferences();
    const updated = { ...current, ...preferences };
    localStorage.setItem(STORAGE_KEYS.PREFERENCES, JSON.stringify(updated));
}

// Token counting (approximate)
export function estimateTokens(text: string, attachments?: any[]): number {
    // Rough approximation: ~4 characters per token for English text
    let tokens = Math.ceil(text.length / 4);

    // Add tokens for attachments (rough average)
    if (attachments && attachments.length > 0) {
        tokens += attachments.length * 1000;
    }

    return tokens;
}

// Cost calculation
export function calculateCost(
    inputTokens: number,
    outputTokens: number,
    inputPricePerMillion: number,
    outputPricePerMillion: number
): number {
    const inputCost = (inputTokens / 1_000_000) * inputPricePerMillion;
    const outputCost = (outputTokens / 1_000_000) * outputPricePerMillion;
    return inputCost + outputCost;
}
