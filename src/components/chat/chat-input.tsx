'use client';

import { useState, useRef, useEffect } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
    CornerDownLeft,
    Square,
    Loader2,
    Sparkles,
    Paperclip,
    X,
    Image as ImageIcon,
    FileText
} from 'lucide-react';
import { Attachment } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import { cn } from '@/lib/utils';

interface ChatInputProps {
    onSend: (message: string, attachments?: Attachment[]) => void;
    onStop: () => void;
    isLoading: boolean;
    disabled?: boolean;
    providerSelect?: React.ReactNode;
    modelSelect?: React.ReactNode;
    supportsImages?: boolean;
    supportsDocuments?: boolean;
}

export function ChatInput({
    onSend,
    onStop,
    isLoading,
    disabled,
    providerSelect,
    modelSelect,
    supportsImages,
    supportsDocuments,
}: ChatInputProps) {
    const [message, setMessage] = useState('');
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Auto-resize textarea
    useEffect(() => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = `${Math.max(36, Math.min(textarea.scrollHeight, 400))}px`;
        }
    }, [message]);

    const handleSubmit = () => {
        if ((!message.trim() && attachments.length === 0) || isLoading || disabled || isUploading) return;
        onSend(message.trim(), attachments.length > 0 ? attachments : undefined);
        setMessage('');
        setAttachments([]);
        if (textareaRef.current) {
            textareaRef.current.style.height = '36px';
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        setIsUploading(true);
        const newAttachments: Attachment[] = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];

            // Limit file size (e.g., 20MB)
            if (file.size > 20 * 1024 * 1024) {
                alert(`File ${file.name} is too large. Max size is 20MB.`);
                continue;
            }

            try {
                const base64 = await fileToBase64(file);
                newAttachments.push({
                    id: uuidv4(),
                    type: file.type.startsWith('image/') ? 'image' : 'file',
                    name: file.name,
                    mimeType: file.type,
                    size: file.size,
                    data: base64
                });
            } catch (err) {
                console.error('Error reading file:', err);
            }
        }

        setAttachments(prev => [...prev, ...newAttachments]);
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const fileToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
                const result = reader.result as string;
                // Remove prefix if needed? No, usually APIs want the full data URL or just the base64.
                // OpenAI wants the full data URL. Anthropic wants just the base64.
                // We'll store the full data URL and strip it in the adapter if needed.
                resolve(result);
            };
            reader.onerror = error => reject(error);
        });
    };

    const removeAttachment = (id: string) => {
        setAttachments(prev => prev.filter(a => a.id !== id));
    };

    return (
        <div className="p-3 pb-8 bg-transparent">
            <div className="max-w-4xl mx-auto relative flex flex-col rounded-[2rem] border bg-card/50 backdrop-blur shadow-xl focus-within:ring-2 focus-within:ring-primary/20 transition-all p-4">

                {/* File Previews */}
                {attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                        {attachments.map((file) => (
                            <div key={file.id} className="relative group rounded-xl overflow-hidden border bg-background/50 h-16 w-16 flex items-center justify-center">
                                {file.type === 'image' ? (
                                    <img src={file.data} alt={file.name} className="h-full w-full object-cover" />
                                ) : (
                                    <FileText className="h-6 w-6 text-muted-foreground" />
                                )}
                                <button
                                    onClick={() => removeAttachment(file.id)}
                                    className="absolute top-1 right-1 h-5 w-5 rounded-full bg-background/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground shadow-sm"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                                <div className="absolute bottom-0 left-0 right-0 bg-background/60 text-[8px] px-1 truncate py-0.5">
                                    {file.name}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Unified Selectors Bar */}
                <div className="flex items-center gap-1 mb-1 select-none">
                    {providerSelect}
                    <div className="h-4 w-px bg-border/50 mx-2" />
                    {modelSelect}

                    <div className="ml-auto flex items-center gap-1">
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileSelect}
                            multiple
                            className="hidden"
                            accept={cn(
                                supportsImages && "image/*",
                                (supportsDocuments || supportsImages) && "application/pdf,text/*"
                            ) || ""}
                        />
                        {(supportsImages || supportsDocuments) && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-full hover:bg-muted"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={disabled || isUploading}
                                title={cn(
                                    supportsImages && "Upload images",
                                    supportsDocuments && "Upload documents"
                                )}
                            >
                                {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                            </Button>
                        )}
                    </div>
                </div>

                {/* Completely Transparent Textarea */}
                <Textarea
                    ref={textareaRef}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask anything..."
                    disabled={disabled}
                    className="w-full border-none shadow-none focus-visible:ring-0 bg-transparent p-0 text-base resize-none min-h-[36px] placeholder:text-muted-foreground/50 transition-all dark:bg-transparent"
                />

                {/* Action Row */}
                <div className="flex items-center justify-end mt-2">
                    {isLoading ? (
                        <Button
                            size="icon"
                            variant="destructive"
                            onClick={onStop}
                            className="h-9 w-9 rounded-full flex-shrink-0 shadow-lg hover:rotate-90 transition-transform duration-300"
                        >
                            <Square className="h-3 w-3" />
                        </Button>
                    ) : (
                        <Button
                            size="icon"
                            onClick={handleSubmit}
                            disabled={(!message.trim() && attachments.length === 0) || disabled || isUploading}
                            className="h-9 w-9 rounded-full flex-shrink-0 shadow-xl group bg-primary hover:scale-105 transition-all"
                        >
                            {disabled || isUploading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <CornerDownLeft className="h-4 w-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                            )}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
