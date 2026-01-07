'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { ProviderId, PROVIDERS, ApiKeys, Conversation } from '@/types';
import { getApiKeys, setApiKey, removeApiKey, getPreferences, setPreferences, getConversations } from '@/lib/storage';
import { Textarea } from '@/components/ui/textarea';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Eye, EyeOff, Check, X, ExternalLink, User, Camera, BarChart3, ShieldCheck } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
    ChartConfig,
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from "@/components/ui/chart";
import { Bar, BarChart, XAxis, YAxis, Cell } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface SettingsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const PROVIDER_DOCS: Record<ProviderId, string> = {
    gemini: 'https://aistudio.google.com/apikey',
    anthropic: 'https://console.anthropic.com/settings/keys',
    openai: 'https://platform.openai.com/api-keys',
    xai: 'https://console.x.ai/',
    groq: 'https://console.groq.com/keys',
    openrouter: 'https://openrouter.ai/keys',
};

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
    const [keys, setKeys] = useState<ApiKeys>({});
    const [visibleKeys, setVisibleKeys] = useState<Set<ProviderId>>(new Set());
    const [editingKeys, setEditingKeys] = useState<Partial<ApiKeys>>({});
    const [systemPrompt, setSystemPrompt] = useState('');
    const [username, setUsername] = useState('');
    const [avatar, setAvatar] = useState<string | undefined>();
    const [usageData, setUsageData] = useState<{ model: string; usage: number; fill: string }[]>([]);

    const providerList = Object.values(PROVIDERS);

    useEffect(() => {
        if (open) {
            const conversations = getConversations();
            const usage: Record<string, number> = {};
            conversations.forEach((c: Conversation) => {
                if (c.modelId) {
                    usage[c.modelId] = (usage[c.modelId] || 0) + 1;
                }
            });

            const colors = [
                "var(--color-usage1)",
                "var(--color-usage2)",
                "var(--color-usage3)",
                "var(--color-usage4)",
                "var(--color-usage5)",
            ];

            const sortedData = Object.entries(usage)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5)
                .map(([name, count], index) => ({
                    model: name.split('/').pop() || name,
                    usage: count,
                    fill: colors[index % colors.length]
                }));

            setUsageData(sortedData);
        }
    }, [open]);

    const chartConfig = {
        usage: {
            label: "Chats",
        },
        usage1: { color: "hsl(var(--primary))" },
        usage2: { color: "hsl(var(--primary) / 0.8)" },
        usage3: { color: "hsl(var(--primary) / 0.6)" },
        usage4: { color: "hsl(var(--primary) / 0.4)" },
        usage5: { color: "hsl(var(--primary) / 0.2)" },
    } satisfies ChartConfig;

    useEffect(() => {
        if (open) {
            const currentKeys = getApiKeys();
            setKeys(currentKeys);
            setVisibleKeys(new Set());
            const prefs = getPreferences();
            setSystemPrompt(prefs.systemPrompt || '');
            setUsername(prefs.username || 'User');
            setAvatar(prefs.avatar);

            // Start editing the first provider automatically
            const firstProvider = providerList[0];
            if (firstProvider) {
                setEditingKeys({ [firstProvider.id]: currentKeys[firstProvider.id] || '' });
            }
        }
    }, [open]);

    const handleSaveSystemPrompt = () => {
        setPreferences({ systemPrompt });
    };

    const toggleVisibility = (providerId: ProviderId) => {
        const newVisible = new Set(visibleKeys);
        if (newVisible.has(providerId)) {
            newVisible.delete(providerId);
        } else {
            newVisible.add(providerId);
        }
        setVisibleKeys(newVisible);
    };

    const handleSave = (providerId: ProviderId) => {
        const key = editingKeys[providerId];
        if (key !== undefined) {
            if (key.trim()) {
                setApiKey(providerId, key.trim());
                setKeys({ ...keys, [providerId]: key.trim() });
            } else {
                removeApiKey(providerId);
                const newKeys = { ...keys };
                delete newKeys[providerId];
                setKeys(newKeys);
            }
            const newEditing = { ...editingKeys };
            delete newEditing[providerId];
            setEditingKeys(newEditing);
        }
    };

    const handleCancel = (providerId: ProviderId) => {
        const newEditing = { ...editingKeys };
        delete newEditing[providerId];
        setEditingKeys(newEditing);
    };

    const startEditing = (providerId: ProviderId) => {
        setEditingKeys({ ...editingKeys, [providerId]: keys[providerId] || '' });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto rounded-3xl border-border/40 shadow-2xl">
                <DialogHeader className="space-y-3">
                    <DialogTitle className="text-2xl font-bold tracking-tight">Settings</DialogTitle>
                    <DialogDescription className="text-sm">
                        Manage your local preferences and API configurations. All data stays on your device.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-8 py-6">
                    {/* Profile Section */}
                    <div className="space-y-5">
                        <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-primary" />
                            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground/70">Personal Profile</h3>
                        </div>
                        <div className="flex items-center gap-6 p-4 rounded-2xl bg-muted/10 border border-muted/20">
                            <div className="relative group">
                                <Avatar className="h-20 w-20 border-2 border-border/50 shadow-inner group-hover:border-primary/50 transition-all duration-300">
                                    <AvatarImage src={avatar} className="object-cover" />
                                    <AvatarFallback className="bg-muted"><User className="h-10 w-10 text-muted-foreground/40" /></AvatarFallback>
                                </Avatar>
                                <label className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 cursor-pointer transition-all duration-300 backdrop-blur-[2px]">
                                    <Camera className="h-6 w-6 text-white" />
                                    <input
                                        type="file"
                                        className="hidden"
                                        accept="image/*"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                const reader = new FileReader();
                                                reader.onloadend = () => {
                                                    const base64 = reader.result as string;
                                                    setAvatar(base64);
                                                    setPreferences({ avatar: base64 });
                                                };
                                                reader.readAsDataURL(file);
                                            }
                                        }}
                                    />
                                </label>
                            </div>
                            <div className="flex-1 space-y-2">
                                <label className="text-xs font-semibold text-muted-foreground ml-1">Display Name</label>
                                <Input
                                    value={username}
                                    onChange={(e) => {
                                        setUsername(e.target.value);
                                        setPreferences({ username: e.target.value });
                                    }}
                                    placeholder="Enter username"
                                    className="h-11 bg-background/50 border-muted-foreground/20 rounded-xl focus-visible:ring-primary/20"
                                />
                            </div>
                        </div>
                    </div>

                    <Separator className="opacity-50" />

                    {/* Analytics Section */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <BarChart3 className="h-4 w-4 text-primary" />
                            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground/70">Local Analytics</h3>
                        </div>

                        {usageData.length > 0 ? (
                            <Card className="border-muted/50 bg-muted/5 shadow-none overflow-hidden rounded-2xl">
                                <CardHeader className="pb-4 px-5">
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-xs font-semibold">Model Preferences</CardTitle>
                                        <CardDescription className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">Top 5 Models</CardDescription>
                                    </div>
                                </CardHeader>
                                <CardContent className="pt-0 px-5">
                                    <ChartContainer config={chartConfig} className="min-h-[160px] w-full">
                                        <BarChart
                                            data={usageData}
                                            layout="vertical"
                                            margin={{ left: 0, right: 40, top: 0, bottom: 0 }}
                                        >
                                            <XAxis type="number" hide />
                                            <YAxis
                                                dataKey="model"
                                                type="category"
                                                tick={{ fontSize: 10, fill: "currentColor" }}
                                                width={110}
                                                axisLine={false}
                                                tickLine={false}
                                            />
                                            <ChartTooltip content={<ChartTooltipContent hideLabel />} cursor={false} />
                                            <Bar dataKey="usage" radius={[0, 6, 6, 0]} barSize={22}>
                                                {usageData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.fill} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ChartContainer>
                                </CardContent>
                                <div className="px-5 py-3 bg-muted/20 border-t border-muted/30">
                                    <p className="text-[10px] text-muted-foreground italic flex items-center justify-between">
                                        <span>Analyzing histories...</span>
                                        <span className="font-semibold text-primary">{getConversations().length} Chats Found</span>
                                    </p>
                                </div>
                            </Card>
                        ) : (
                            <div className="p-10 text-center border-2 border-dashed rounded-2xl border-muted/30 bg-muted/5">
                                <BarChart3 className="h-8 w-8 text-muted-foreground/20 mx-auto mb-3" />
                                <p className="text-xs text-muted-foreground">Start chatting to see model usage analytics.</p>
                            </div>
                        )}

                        <div className="flex items-start gap-3 p-4 rounded-2xl bg-primary/5 border border-primary/10">
                            <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                            <div className="space-y-1">
                                <p className="text-[11px] text-muted-foreground leading-relaxed">
                                    <span className="font-bold text-primary mr-1">Privacy Guarantee:</span>
                                    Your data never leaves your device. All calculations are performed instantly in your browser's local storage.
                                </p>
                            </div>
                        </div>
                    </div>

                    <Separator className="opacity-50" />

                    {/* AI Configuration Section */}
                    <div className="space-y-5">
                        <div className="flex items-center gap-2">
                            <ShieldCheck className="h-4 w-4 text-primary" />
                            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground/70">AI Configuration</h3>
                        </div>
                        <div className="space-y-3">
                            <label className="text-xs font-semibold text-muted-foreground ml-1">Default System Prompt</label>
                            <Textarea
                                value={systemPrompt}
                                onChange={(e) => setSystemPrompt(e.target.value)}
                                onBlur={handleSaveSystemPrompt}
                                placeholder="e.g. You are a helpful assistant that writes concise code..."
                                className="min-h-[120px] rounded-2xl bg-background/50 border-muted-foreground/20 focus-visible:ring-primary/20 text-sm leading-relaxed"
                            />
                            <p className="text-[10px] text-muted-foreground/70 px-1">
                                Base instructions sent to all models unless overridden per conversation.
                            </p>
                        </div>
                    </div>

                    <Separator className="opacity-50" />

                    {/* API Keys Section */}
                    <div className="space-y-5">
                        <div className="flex items-center gap-2">
                            <ExternalLink className="h-4 w-4 text-primary" />
                            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground/70">API Keys</h3>
                        </div>
                        <div className="space-y-4">
                            {providerList.map((provider, index) => {
                                const hasKey = !!keys[provider.id];
                                const isEditing = editingKeys[provider.id] !== undefined;
                                const isVisible = visibleKeys.has(provider.id);

                                return (
                                    <div key={provider.id} className="p-4 rounded-2xl bg-muted/10 border border-muted/20 space-y-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className={cn("h-2 w-2 rounded-full", hasKey ? "bg-green-500 animate-pulse" : "bg-muted-foreground/30")} />
                                                <label className="text-sm font-bold tracking-tight">{provider.name}</label>
                                            </div>
                                            <a
                                                href={PROVIDER_DOCS[provider.id]}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors flex items-center gap-1.5"
                                            >
                                                Key Console
                                                <ExternalLink className="h-3 w-3" />
                                            </a>
                                        </div>

                                        {isEditing ? (
                                            <div className="flex gap-2">
                                                <div className="relative flex-1">
                                                    <Input
                                                        type={isVisible ? 'text' : 'password'}
                                                        value={editingKeys[provider.id] || ''}
                                                        onChange={(e) =>
                                                            setEditingKeys({ ...editingKeys, [provider.id]: e.target.value })
                                                        }
                                                        placeholder={`Enter key...`}
                                                        className="h-10 pr-10 bg-background/50 border-muted-foreground/20 rounded-xl"
                                                    />
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                                                        onClick={() => toggleVisibility(provider.id)}
                                                    >
                                                        {isVisible ? (
                                                            <EyeOff className="h-4 w-4 opacity-50" />
                                                        ) : (
                                                            <Eye className="h-4 w-4 opacity-50" />
                                                        )}
                                                    </Button>
                                                </div>
                                                <Button
                                                    size="icon"
                                                    variant="secondary"
                                                    className="rounded-xl h-10 w-10 shrink-0"
                                                    onClick={() => handleSave(provider.id)}
                                                >
                                                    <Check className="h-4 w-4 text-green-500" />
                                                </Button>
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="rounded-xl h-10 w-10 shrink-0"
                                                    onClick={() => handleCancel(provider.id)}
                                                >
                                                    <X className="h-4 w-4 text-destructive" />
                                                </Button>
                                            </div>
                                        ) : (
                                            <div className="flex gap-2">
                                                <div className="relative flex-1">
                                                    <Input
                                                        type={isVisible ? 'text' : 'password'}
                                                        value={hasKey ? keys[provider.id] : ''}
                                                        readOnly
                                                        placeholder="••••••••••••••••"
                                                        className="h-10 pr-10 cursor-pointer bg-background/30 border-muted-foreground/10 rounded-xl"
                                                        onClick={() => startEditing(provider.id)}
                                                    />
                                                    {hasKey && (
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                                                            onClick={() => toggleVisibility(provider.id)}
                                                        >
                                                            {isVisible ? (
                                                                <EyeOff className="h-4 w-4 opacity-50" />
                                                            ) : (
                                                                <Eye className="h-4 w-4 opacity-50" />
                                                            )}
                                                        </Button>
                                                    )}
                                                </div>
                                                <Button
                                                    variant="outline"
                                                    className="h-10 px-5 rounded-xl text-xs font-bold uppercase tracking-wider"
                                                    onClick={() => startEditing(provider.id)}
                                                >
                                                    {hasKey ? 'Change' : 'Configure'}
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
