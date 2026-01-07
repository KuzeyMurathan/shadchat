'use client';

import { useEffect, useRef } from 'react';
import { Message } from '@/types';
import { ChatMessage } from './chat-message';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquare } from 'lucide-react';

interface ChatContainerProps {
    messages: Message[];
    streamingMessageId?: string;
    onRetry?: (messageId: string) => void;
}

export function ChatContainer({ messages, streamingMessageId, onRetry }: ChatContainerProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, streamingMessageId]);

    if (messages.length === 0) {
        return <div className="flex-1" />;
    }

    return (
        <ScrollArea className="flex-1 h-full w-full min-h-0" ref={scrollRef}>
            <div className="max-w-4xl mx-auto p-6 space-y-6">
                {messages.map((message) => (
                    <ChatMessage
                        key={message.id}
                        message={message}
                        isStreaming={message.id === streamingMessageId}
                        onRetry={onRetry}
                    />
                ))}
                <div className="h-20" /> {/* Spacer for floating input */}
                <div ref={bottomRef} />
            </div>
        </ScrollArea>
    );
}
