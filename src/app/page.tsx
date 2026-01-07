'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  Conversation,
  Message,
  Model,
  ProviderId,
  PROVIDERS,
  ChatConfig,
  ApiKeys,
  Attachment,
} from '@/types';
import {
  getApiKeys,
  getConversation,
  saveConversation,
  createNewConversation,
  generateConversationTitle,
  estimateTokens,
  getConversations,
  getPreferences,
  setPreferences,
  togglePinConversation,
  setApiKey,
} from '@/lib/storage';
import { getAdapter } from '@/lib/providers';
import { cn } from '@/lib/utils';
import { Sidebar } from '@/components/sidebar';
import { ChatContainer, ChatInput } from '@/components/chat';
import { SettingsDialog, ThemeToggle } from '@/components/settings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { Loader2, AlertCircle, Plus, ImageIcon, FileText, Code2, Cpu, Info, Search, ExternalLink, ShieldCheck } from 'lucide-react';

export default function ChatPage() {
  // State
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | undefined>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [systemPromptWarningOpen, setSystemPromptWarningOpen] = useState(false);
  const [apiKeyNeededProvider, setApiKeyNeededProvider] = useState<ProviderId | null>(null);
  const [tempApiKey, setTempApiKey] = useState('');

  // Provider/Model state
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>('openai');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [models, setModels] = useState<Model[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelSearch, setModelSearch] = useState('');

  // Cost tracking
  const [sessionCost, setSessionCost] = useState(0);
  const [settingsVersion, setSettingsVersion] = useState(0);

  // Client-side state for API keys (to prevent hydration mismatch)
  const [apiKeys, setApiKeys] = useState<ApiKeys>({});
  const [isClient, setIsClient] = useState(false);

  // Abort controller for streaming
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const prefs = getPreferences();
    setApiKeys(getApiKeys());
    setSelectedProvider(prefs.defaultProvider || 'openai');
    setSelectedModel(prefs.defaultModel || '');
    setIsClient(true);
  }, []);

  // Get available providers (ones with API keys)
  const availableProviders = isClient ? Object.values(PROVIDERS).filter(
    p => apiKeys[p.id]
  ) : [];

  // Load models when provider changes
  useEffect(() => {
    if (!isClient) return; // Don't run on server

    const loadModels = async () => {
      const apiKey = apiKeys[selectedProvider];
      if (!apiKey) {
        setModels([]);
        setSelectedModel('');
        return;
      }

      setLoadingModels(true);
      setError(null);

      try {
        const adapter = getAdapter(selectedProvider);
        const fetchedModels = await adapter.fetchModels(apiKey);
        setModels(fetchedModels);
        setModelSearch(''); // Reset search when provider changes

        // Select first model if none selected
        if (fetchedModels.length > 0 && !selectedModel) {
          setSelectedModel(fetchedModels[0].id);
        }
      } catch (err) {
        console.error('Failed to fetch models:', err);
        setError(`Failed to load models: ${err instanceof Error ? err.message : 'Unknown error'}`);
        setModels([]);
      } finally {
        setLoadingModels(false);
      }
    };

    loadModels();
  }, [selectedProvider, apiKeys[selectedProvider]]);

  // Save selection to preferences
  useEffect(() => {
    if (isClient && selectedProvider && selectedModel) {
      setPreferences({
        defaultProvider: selectedProvider,
        defaultModel: selectedModel,
      });
    }
  }, [selectedProvider, selectedModel, isClient]);

  // Handle new chat
  const handleNewChat = useCallback(() => {
    if (selectedModel) {
      const newConv = createNewConversation(selectedProvider, selectedModel);
      setConversation(newConv);
      setSessionCost(0);
      setError(null);
    }
  }, [selectedProvider, selectedModel]);

  // Handle selecting a conversation
  const handleSelectConversation = useCallback((id: string) => {
    const conv = getConversation(id);
    if (conv) {
      setConversation(conv);
      setSelectedProvider(conv.providerId);
      setSelectedModel(conv.modelId);
      setSessionCost(conv.totalCost || 0);
      setError(null);
    }
  }, []);

  // Stop streaming
  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    setStreamingMessageId(undefined);
  }, []);

  // Pin conversation
  const handlePinConversation = useCallback((id: string) => {
    togglePinConversation(id);
    // Force update of local conversation usage if needed, but mainly Sidebar needs to redraw.
    // We can update the current conversation object if it matches, to trigger redraw.
    if (conversation?.id === id) {
      setConversation(prev => prev ? { ...prev, pinned: !prev.pinned } : null);
    } else {
      // Trigger sidebar update via some other method or just rely on Sidebar usage.
      // But Sidebar needs a trigger. 
      // Let's create a refresh trigger state for sidebar.
    }
  }, [conversation]);

  // Rename conversation
  const handleRenameConversation = useCallback((id: string, newTitle: string) => {
    const conv = getConversation(id);
    if (conv) {
      const updated = { ...conv, title: newTitle, updatedAt: Date.now() };
      saveConversation(updated);

      // Update local state if this is the current conversation
      if (conversation?.id === id) {
        setConversation(updated);
      }
    }
  }, [conversation]);

  // Retry logic without system prompt
  const handleContinueWithoutSystemPrompt = useCallback(async () => {
    setSystemPromptWarningOpen(false);

    if (!conversation) return;

    // Get the last user message to "retry" with, essentially just resuming generation
    // We need to find the pending assistant message (the one that failed)    
    // In our current flow, handleSend added an empty assistant message.
    // We can try to reuse it or just let the new stream fill it.

    const lastMessage = conversation.messages[conversation.messages.length - 1];
    if (lastMessage.role !== 'assistant') return; // Should be the placeholder

    setIsLoading(true);
    setStreamingMessageId(lastMessage.id);
    abortControllerRef.current = new AbortController();
    setError(null);

    try {
      const apiKey = apiKeys[selectedProvider];
      if (!apiKey) throw new Error("No API key");

      const adapter = getAdapter(selectedProvider);
      const config: ChatConfig = {
        model: selectedModel,
        temperature: 0.7,
        maxTokens: 4096,
        // Explicitly NO system prompt here
        systemPrompt: undefined,
      };

      // Exclude the empty assistant message for the API call
      const apiMessages = conversation.messages.slice(0, -1);

      let fullResponse = '';
      const startTime = Date.now();

      await adapter.streamChat(
        apiMessages,
        config,
        apiKey,
        {
          onToken: (token) => {
            fullResponse += token;
            setConversation(prev => {
              if (!prev) return prev;
              const messages = prev.messages.map(m =>
                m.id === lastMessage.id
                  ? { ...m, content: fullResponse }
                  : m
              );
              // Also persist that we disabled system prompts for this chat
              return { ...prev, messages, disableSystemPrompt: true };
            });
          },
          onComplete: (response) => {
            const endTime = Date.now();
            const duration = (endTime - startTime) / 1000;
            const outputTokens = estimateTokens(response);
            const inputTokens = apiMessages.reduce((acc, m) => acc + estimateTokens(m.content), 0);
            const cost = adapter.estimateCost(inputTokens, outputTokens, selectedModel);

            setConversation(prev => {
              if (!prev) return prev;
              const messages = prev.messages.map(m =>
                m.id === lastMessage.id
                  ? {
                    ...m,
                    content: response,
                    tokenCount: outputTokens,
                    timing: duration,
                    model: selectedModel
                  }
                  : m
              );
              const updated = {
                ...prev,
                messages,
                totalCost: (prev.totalCost || 0) + cost,
                disableSystemPrompt: true, // Persist here too to be safe
              };
              saveConversation(updated);
              return updated;
            });

            setSessionCost(prev => prev + cost);
            setIsLoading(false);
            setStreamingMessageId(undefined);
          },
          onError: (err) => {
            setError(err.message);
            setIsLoading(false);
            setStreamingMessageId(undefined);
          },
        },
        abortControllerRef.current.signal
      );
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err.message);
      }
      setIsLoading(false);
      setStreamingMessageId(undefined);
    }
  }, [conversation, selectedProvider, selectedModel, apiKeys]);

  // Send message
  const handleSend = useCallback(async (content: string, attachments?: Attachment[]) => {
    const apiKey = apiKeys[selectedProvider];
    if (!apiKey || !selectedModel) {
      setError('Please configure an API key and select a model');
      return;
    }

    setError(null);
    setIsLoading(true);

    // Create or update conversation
    let currentConv = conversation;
    if (!currentConv) {
      currentConv = createNewConversation(selectedProvider, selectedModel);
    }

    // Add user message
    const userMessage: Message = {
      id: uuidv4(),
      role: 'user',
      content,
      timestamp: Date.now(),
      tokenCount: estimateTokens(content, attachments),
      attachments,
    };

    // Create placeholder for assistant message
    const assistantMessage: Message = {
      id: uuidv4(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };

    const updatedMessages = [...currentConv.messages, userMessage, assistantMessage];

    // Update title if first message
    const title = currentConv.messages.length === 0
      ? generateConversationTitle(content)
      : currentConv.title;

    const updatedConv: Conversation = {
      ...currentConv,
      messages: updatedMessages,
      title,
      updatedAt: Date.now(),
      modelId: selectedModel,
      providerId: selectedProvider,
    };

    setConversation(updatedConv);
    saveConversation(updatedConv); // Save immediately so sidebar updates
    setStreamingMessageId(assistantMessage.id);

    // Set up abort controller
    abortControllerRef.current = new AbortController();

    try {
      const adapter = getAdapter(selectedProvider);
      const config: ChatConfig = {
        model: selectedModel,
        temperature: 0.7,
        maxTokens: 4096,
        systemPrompt: getPreferences().systemPrompt,
      };

      // Build messages for API (exclude the empty assistant message)
      let apiMessages = updatedMessages.slice(0, -1);

      const userSystemPrompt = getPreferences().systemPrompt;
      const systemPrompt = userSystemPrompt && userSystemPrompt.trim().length > 0
        ? userSystemPrompt
        : "You are a friendly and helpful AI assistant. Always try your best to assist the user. If you don't know the answer, just say so. Don't make things up. Don't make promises you can't keep. Don't make up dates or times.";

      // Only add system prompt if NOT disabled for this chat
      if (!currentConv.disableSystemPrompt) {
        apiMessages = [
          {
            id: 'system',
            role: 'system',
            content: systemPrompt,
            timestamp: Date.now(),
          },
          ...apiMessages
        ];
      }

      let fullResponse = '';
      const startTime = Date.now();

      await adapter.streamChat(
        apiMessages,
        config,
        apiKey,
        {
          onToken: (token) => {
            fullResponse += token;
            setConversation(prev => {
              if (!prev) return prev;
              const messages = prev.messages.map(m =>
                m.id === assistantMessage.id
                  ? { ...m, content: fullResponse }
                  : m
              );
              return { ...prev, messages };
            });
          },
          onComplete: (response) => {
            const endTime = Date.now();
            const duration = (endTime - startTime) / 1000;
            const outputTokens = estimateTokens(response);
            const inputTokens = apiMessages.reduce((acc, m) => acc + estimateTokens(m.content, m.attachments), 0);
            const cost = adapter.estimateCost(inputTokens, outputTokens, selectedModel);

            // Generate auto-title if this was the first message
            /* 
             * Auto-title feature removed by user request. 
             * Basic title is set in handleSend via generateConversationTitle (first 50 chars).
             */

            setConversation(prev => {
              if (!prev) return prev;
              const messages = prev.messages.map(m =>
                m.id === assistantMessage.id
                  ? {
                    ...m,
                    content: response,
                    tokenCount: outputTokens,
                    timing: duration,
                    model: selectedModel
                  }
                  : m
              );
              const updated = {
                ...prev,
                messages,
                totalCost: (prev.totalCost || 0) + cost,
              };
              saveConversation(updated);
              return updated;
            });

            setSessionCost(prev => prev + cost);
            setIsLoading(false);
            setStreamingMessageId(undefined);
          },
          onError: (err) => {
            setError(err.message);
            setIsLoading(false);
            setStreamingMessageId(undefined);
          },
        },
        abortControllerRef.current.signal
      );
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        if (err.message.includes('Developer instruction is not enabled')) {
          setSystemPromptWarningOpen(true);
        } else {
          setError(err.message);
        }
      }
      setIsLoading(false);
      setStreamingMessageId(undefined);
    }
  }, [conversation, selectedProvider, selectedModel, apiKeys]);

  // Retry message
  const handleRetry = useCallback(async (messageId: string) => {
    if (!conversation) return;

    const index = conversation.messages.findIndex(m => m.id === messageId);
    if (index === -1) return;

    const apiKey = apiKeys[selectedProvider];
    if (!apiKey || !selectedModel) {
      setError('Please configure an API key and select a model');
      return;
    }

    setError(null);
    setIsLoading(true);

    // Get messages up to the user message
    const apiMessagesFull = conversation.messages.slice(0, index + 1);

    // Create new assistant message placeholder
    const assistantMessage: Message = {
      id: uuidv4(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };

    const updatedConv: Conversation = {
      ...conversation,
      messages: [...apiMessagesFull, assistantMessage],
      updatedAt: Date.now(),
    };

    setConversation(updatedConv);
    saveConversation(updatedConv);
    setStreamingMessageId(assistantMessage.id);

    abortControllerRef.current = new AbortController();

    try {
      const adapter = getAdapter(selectedProvider);
      const config: ChatConfig = {
        model: selectedModel,
        temperature: 0.7,
        maxTokens: 4096,
        systemPrompt: getPreferences().systemPrompt,
      };

      let apiMessages = [...apiMessagesFull];
      const userSystemPrompt = getPreferences().systemPrompt;
      const systemPrompt = userSystemPrompt && userSystemPrompt.trim().length > 0
        ? userSystemPrompt
        : "You are a friendly and helpful AI assistant. Always try your best to assist the user.";

      if (!updatedConv.disableSystemPrompt) {
        apiMessages = [
          {
            id: 'system',
            role: 'system',
            content: systemPrompt,
            timestamp: Date.now(),
          },
          ...apiMessages
        ];
      }

      let fullResponse = '';
      const startTime = Date.now();

      await adapter.streamChat(
        apiMessages,
        config,
        apiKey,
        {
          onToken: (token) => {
            fullResponse += token;
            setConversation(prev => {
              if (!prev) return prev;
              const messages = prev.messages.map(m =>
                m.id === assistantMessage.id
                  ? { ...m, content: fullResponse }
                  : m
              );
              return { ...prev, messages };
            });
          },
          onComplete: (response) => {
            const endTime = Date.now();
            const duration = (endTime - startTime) / 1000;
            const outputTokens = estimateTokens(response);
            const inputTokens = apiMessages.reduce((acc, m) => acc + estimateTokens(m.content, m.attachments), 0);
            const cost = adapter.estimateCost(inputTokens, outputTokens, selectedModel);

            setConversation(prev => {
              if (!prev) return prev;
              const messages = prev.messages.map(m =>
                m.id === assistantMessage.id
                  ? {
                    ...m,
                    content: response,
                    tokenCount: outputTokens,
                    timing: duration,
                    model: selectedModel
                  }
                  : m
              );
              const updated = {
                ...prev,
                messages,
                totalCost: (prev.totalCost || 0) + cost,
              };
              saveConversation(updated);
              return updated;
            });

            setSessionCost(prev => prev + cost);
            setIsLoading(false);
            setStreamingMessageId(undefined);
          },
          onError: (err) => {
            setError(err.message);
            setIsLoading(false);
            setStreamingMessageId(undefined);
          },
        },
        abortControllerRef.current.signal
      );
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err.message);
      }
      setIsLoading(false);
      setStreamingMessageId(undefined);
    }
  }, [conversation, selectedProvider, selectedModel, apiKeys]);

  const handleSaveTempApiKey = () => {
    if (apiKeyNeededProvider && tempApiKey.trim()) {
      setApiKey(apiKeyNeededProvider, tempApiKey.trim());
      setApiKeys(prev => ({ ...prev, [apiKeyNeededProvider]: tempApiKey.trim() }));
      setSelectedProvider(apiKeyNeededProvider);
      setSelectedModel('');
      setApiKeyNeededProvider(null);
      setTempApiKey('');
      setSettingsVersion(v => v + 1);
    }
  };

  // Check if we can send messages
  const canSendMessage = !!apiKeys[selectedProvider] && !!selectedModel && !loadingModels;

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        currentConversationId={conversation?.id}
        lastUpdated={conversation?.updatedAt || settingsVersion}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
        onOpenSettings={() => setSettingsOpen(true)}
        onRename={handleRenameConversation}
        onPin={handlePinConversation}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="px-4 py-3 flex items-center justify-between bg-transparent flex-shrink-0">
          <div className="md:pl-0 pl-12">
            {sessionCost > 0 && (
              <div className="flex items-center gap-3">
                <div className="text-sm font-medium px-3 py-1 bg-muted/50 rounded-full border border-border/50">
                  Est. cost: ${sessionCost.toFixed(4)}
                </div>
                {(() => {
                  const currentModel = models.find(m => m.id === selectedModel);
                  if (currentModel?.contextLength && conversation) {
                    const totalTokens = conversation.messages.reduce(
                      (acc, m) => acc + (m.tokenCount || estimateTokens(m.content, m.attachments)),
                      0
                    );
                    const usagePercent = (totalTokens / currentModel.contextLength) * 100;
                    const isNearLimit = usagePercent > 90;
                    const isAtLimit = usagePercent >= 100;

                    return (
                      <div className={cn(
                        "text-sm font-medium px-3 py-1 rounded-full border flex items-center gap-2",
                        isAtLimit ? "bg-destructive/10 border-destructive text-destructive" :
                          isNearLimit ? "bg-yellow-500/10 border-yellow-500/50 text-yellow-600" :
                            "bg-muted/50 border-border/50"
                      )}>
                        <span>
                          {Math.round(totalTokens / 1000)}k / {Math.round(currentModel.contextLength / 1000)}k tokens
                        </span>
                        {isAtLimit && (
                          <span className="text-xs bg-destructive text-destructive-foreground px-1.5 py-0.5 rounded">FULL</span>
                        )}
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 rounded-full px-4 font-medium border-border/50 hover:bg-muted/50"
              onClick={handleNewChat}
            >
              <Plus className="h-4 w-4" />
              New Chat
            </Button>
            <ThemeToggle />
          </div>
        </header>

        {/* Context Limit Warning */}
        {(() => {
          const currentModel = models.find(m => m.id === selectedModel);
          const totalTokens = conversation?.messages.reduce(
            (acc, m) => acc + (m.tokenCount || estimateTokens(m.content, m.attachments)),
            0
          ) || 0;

          if (currentModel?.contextLength && totalTokens >= currentModel.contextLength) {
            return (
              <div className="mx-4 mt-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2 text-destructive">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <p className="text-sm font-medium">
                  Context limit reached! The AI will not remember previous messages. Please start a new chat.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto border-destructive/30 hover:bg-destructive/20"
                  onClick={handleNewChat}
                >
                  New Chat
                </Button>
              </div>
            );
          }
          return null;
        })()}

        {/* Error Display */}
        {error && (
          <div className="mx-4 mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <p className="text-sm">{error}</p>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={() => setError(null)}
            >
              Dismiss
            </Button>
          </div>
        )}

        {/* No API Key Warning */}
        {isClient && availableProviders.length === 0 && (
          <div className="mx-4 mt-4 p-4 bg-muted rounded-lg text-center">
            <p className="text-muted-foreground mb-2">
              No API keys configured. Add at least one to start chatting.
            </p>
            <Button onClick={() => setSettingsOpen(true)}>
              Open Settings
            </Button>
          </div>
        )}

        {/* Chat Area */}
        <div className="flex-1 min-h-0 flex flex-col">
          <ChatContainer
            messages={conversation?.messages || []}
            streamingMessageId={streamingMessageId}
            onRetry={handleRetry}
          />
        </div>

        {/* Input */}
        <div className="flex-shrink-0">
          <ChatInput
            onSend={handleSend}
            onStop={handleStop}
            isLoading={isLoading}
            disabled={!canSendMessage}
            supportsImages={models.find(m => m.id === selectedModel)?.supportsImages}
            supportsDocuments={models.find(m => m.id === selectedModel)?.supportsDocuments}
            providerSelect={
              <Select
                value={selectedProvider}
                onValueChange={(v) => {
                  const providerId = v as ProviderId;
                  if (!apiKeys[providerId]) {
                    setApiKeyNeededProvider(providerId);
                    setTempApiKey('');
                  } else {
                    setSelectedProvider(providerId);
                    setSelectedModel('');
                  }
                }}
              >
                <SelectTrigger className="border-none bg-transparent shadow-none hover:bg-muted focus:ring-0 w-auto gap-1 text-xs font-semibold h-8 rounded-lg px-2">
                  <SelectValue placeholder="Provider" />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(PROVIDERS).map(provider => (
                    <SelectItem
                      key={provider.id}
                      value={provider.id}
                    >
                      {provider.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
            modelSelect={
              <Select
                value={selectedModel}
                onValueChange={setSelectedModel}
                disabled={loadingModels || models.length === 0}
              >
                <SelectTrigger className="border-none bg-transparent shadow-none hover:bg-muted focus:ring-0 w-auto gap-1 text-xs font-bold h-8 rounded-lg px-2">
                  {loadingModels ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <SelectValue placeholder="Select model" />
                  )}
                </SelectTrigger>
                <SelectContent
                  position="popper"
                  align="start"
                  hideScroll
                  className="max-h-[300px] min-w-[200px] mt-1 [&_[data-slot=select-viewport]]:p-0"
                >
                  <div className="px-2 py-2 border-b sticky top-0 bg-popover z-[20] shadow-sm rounded-t-md">
                    <div className="relative">
                      <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Search models..."
                        className="h-8 pl-8 text-xs bg-muted/50 border-none focus-visible:ring-1 focus-visible:ring-primary/20"
                        value={modelSearch}
                        onChange={(e) => setModelSearch(e.target.value)}
                        onKeyDown={(e) => e.stopPropagation()}
                      />
                    </div>
                  </div>
                  {models.filter(m =>
                    m.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
                    m.id.toLowerCase().includes(modelSearch.toLowerCase())
                  ).map(model => (
                    <Tooltip key={model.id} delayDuration={300}>
                      <TooltipTrigger asChild>
                        <SelectItem value={model.id} className="cursor-help">
                          {model.name}
                        </SelectItem>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="p-3 w-72 bg-card/95 backdrop-blur border text-card-foreground shadow-2xl">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Info className="h-4 w-4 text-primary" />
                            <span className="font-bold text-sm">{model.name}</span>
                          </div>
                          {model.description && (
                            <p className="text-[10px] text-muted-foreground leading-snug">
                              {model.description}
                            </p>
                          )}
                          <div className="grid grid-cols-2 gap-2 text-[10px]">
                            <div className="flex items-center gap-1.5 p-1.5 rounded-md bg-muted/50 border border-border/50">
                              <Cpu className="h-3 w-3 text-blue-500" />
                              <span className="font-medium">{(model.contextLength || 0).toLocaleString()} tokens</span>
                            </div>
                            {model.supportsCode && (
                              <div className="flex items-center gap-1.5 p-1.5 rounded-md bg-muted/50 border border-border/50">
                                <Code2 className="h-3 w-3 text-emerald-500" />
                                <span className="font-medium">Code</span>
                              </div>
                            )}
                            {model.supportsImages && (
                              <div className="flex items-center gap-1.5 p-1.5 rounded-md bg-muted/50 border border-border/50">
                                <ImageIcon className="h-3 w-3 text-purple-500" />
                                <span className="font-medium">Vision</span>
                              </div>
                            )}
                            {model.supportsDocuments && (
                              <div className="flex items-center gap-1.5 p-1.5 rounded-md bg-muted/50 border border-border/50">
                                <FileText className="h-3 w-3 text-amber-500" />
                                <span className="font-medium">Docs</span>
                              </div>
                            )}
                          </div>
                          {model.pricing && (
                            <div className="text-[9px] text-muted-foreground border-t pt-2 flex justify-between">
                              <span>${(model.pricing.input).toFixed(2)}/1M input</span>
                              <span>${(model.pricing.output).toFixed(2)}/1M output</span>
                            </div>
                          )}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                  <div className="h-1" />
                </SelectContent>
              </Select>
            }
          />
        </div>
      </div>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={(open) => {
          setSettingsOpen(open);
          if (!open) setSettingsVersion(v => v + 1);
        }}
      />

      <Dialog open={systemPromptWarningOpen} onOpenChange={setSystemPromptWarningOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>System Prompts Disabled</DialogTitle>
            <DialogDescription>
              The selected model does not support system prompts (developer instructions).
              Would you like to continue without it?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSystemPromptWarningOpen(false)}>
              Choose Different Model
            </Button>
            <Button onClick={handleContinueWithoutSystemPrompt}>
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!apiKeyNeededProvider} onOpenChange={(open) => !open && setApiKeyNeededProvider(null)}>
        <DialogContent className="sm:max-w-md rounded-3xl border-border/40 shadow-2xl">
          <DialogHeader className="space-y-3">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-2">
              <ExternalLink className="h-6 w-6 text-primary" />
            </div>
            <DialogTitle className="text-xl font-bold tracking-tight">
              Configure {apiKeyNeededProvider ? PROVIDERS[apiKeyNeededProvider].name : ''}
            </DialogTitle>
            <DialogDescription className="text-sm">
              You haven't set an API key for this provider yet. Please enter it below to start chatting.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/70 ml-1">API Key</label>
              <div className="relative">
                <Input
                  type="password"
                  placeholder="Paste your API key here..."
                  value={tempApiKey}
                  onChange={(e) => setTempApiKey(e.target.value)}
                  className="h-11 bg-muted/30 border-muted-foreground/20 rounded-xl focus-visible:ring-primary/20 pr-10"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveTempApiKey();
                  }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground px-1">
                Your key is stored locally in your browser and never leaves your device.
              </p>
            </div>
          </div>
          <DialogFooter className="sm:justify-between gap-3 mt-2">
            <Button
              variant="ghost"
              className="rounded-xl text-xs font-bold uppercase tracking-wider"
              onClick={() => setApiKeyNeededProvider(null)}
            >
              Cancel
            </Button>
            <Button
              className="rounded-xl px-6 h-11 text-xs font-bold uppercase tracking-wider bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 border-none"
              onClick={handleSaveTempApiKey}
              disabled={!tempApiKey.trim()}
            >
              Save & Chat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
