'use client';

import { Message } from '@/types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { User, Bot, FileText } from 'lucide-react';

interface ChatMessageProps {
    message: Message;
    isStreaming?: boolean;
    onRetry?: (messageId: string) => void;
}

export function ChatMessage({ message, isStreaming, onRetry }: ChatMessageProps) {
    const isUser = message.role === 'user';

    return (
        <div
            className={cn(
                'flex w-full mb-4',
                isUser ? 'justify-end' : 'justify-start'
            )}
        >
            <div
                className={cn(
                    'max-w-[80%] transition-colors break-words',
                    isUser
                        ? 'text-foreground font-medium text-right'
                        : 'text-foreground/90 text-left'
                )}
            >
                {message.attachments && message.attachments.length > 0 && (
                    <div className={cn("flex flex-wrap gap-2 mb-2", isUser ? "justify-end" : "justify-start")}>
                        {message.attachments.map(att => (
                            <div key={att.id} className="relative rounded-xl overflow-hidden border bg-background/50 shadow-sm transition-all hover:border-border/80">
                                {att.type === 'image' ? (
                                    <img src={att.data} alt={att.name} className="max-h-[240px] w-auto object-contain cursor-pointer transition-opacity hover:opacity-90" />
                                ) : (
                                    <div className="flex items-center gap-2 p-2 px-3 bg-muted/30">
                                        <div className="h-8 w-8 rounded-lg bg-background flex items-center justify-center border">
                                            <FileText className="h-4 w-4 text-muted-foreground" />
                                        </div>
                                        <div className="flex flex-col min-w-0 pr-2">
                                            <span className="text-xs font-semibold truncate max-w-[140px]">{att.name}</span>
                                            <span className="text-[10px] text-muted-foreground">{(att.size / 1024).toFixed(0)} KB</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
                <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                            // Style code blocks
                            pre: ({ children }) => (
                                <pre className="rounded-2xl p-4 overflow-x-auto bg-muted/50 border border-border/40 shadow-sm my-4">
                                    {children}
                                </pre>
                            ),
                            code: ({ className, children, ...props }) => {
                                const isInline = !className;
                                return isInline ? (
                                    <code className="px-1.5 py-0.5 rounded-md text-sm font-semibold bg-muted/50" {...props}>
                                        {children}
                                    </code>
                                ) : (
                                    <code className={className} {...props}>
                                        {children}
                                    </code>
                                );
                            },
                            // Style links
                            a: ({ href, children }) => (
                                <a
                                    href={href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-primary underline transition-opacity hover:opacity-80"
                                >
                                    {children}
                                </a>
                            ),
                            // Style tables
                            table: ({ children }) => (
                                <div className="overflow-x-auto my-6">
                                    <table className="min-w-full border-collapse border border-border/30">
                                        {children}
                                    </table>
                                </div>
                            ),
                        }}
                    >
                        {message.content}
                    </ReactMarkdown>
                    {isStreaming && (
                        <span className="inline-block w-2 h-4 animate-pulse ml-1 align-middle bg-primary" />
                    )}
                </div>
                {!isUser && !isStreaming && message.timing && (
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground/60 select-none">
                        <span>{message.model || 'Unknown Model'}</span>
                        <span>•</span>
                        <span>{message.timing.toFixed(1)}s</span>
                        {message.tokenCount && (
                            <>
                                <span>•</span>
                                <span>{message.tokenCount} tokens</span>
                            </>
                        )}
                    </div>
                )}
                {isUser && onRetry && (
                    <div className="flex justify-end mt-2">
                        <button
                            onClick={() => onRetry(message.id)}
                            className="text-[10px] font-semibold text-muted-foreground/50 hover:text-primary transition-colors flex items-center gap-1 uppercase tracking-wider px-2 py-1 rounded-md hover:bg-primary/5"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-rotate-ccw"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>
                            Retry
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
