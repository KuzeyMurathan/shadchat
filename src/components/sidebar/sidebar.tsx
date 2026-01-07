'use client';

import { useState, useEffect } from 'react';
import { Conversation, ProviderId, PROVIDERS, ChatGroup, UserPreferences } from '@/types';
import {
    getConversations,
    deleteConversation,
    getGroups,
    createGroup,
    deleteGroup,
    renameGroup,
    toggleGroupCollapse,
    moveConversationToGroup,
    getPreferences
} from '@/lib/storage';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
    Plus,
    MessageSquare,
    Trash2,
    Settings,
    Menu,
    X,
    Pencil,
    Check,
    MoreHorizontal,
    Pin,
    PinOff,
    Folder,
    ChevronDown,
    ChevronRight,
    FolderPlus,
    FolderSearch,
    MoveHorizontal,
    User
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface SidebarProps {
    currentConversationId?: string;
    onSelectConversation: (id: string) => void;
    onNewChat: () => void;
    onOpenSettings: () => void;
    lastUpdated?: number;
    onRename: (id: string, newTitle: string) => void;
    onPin: (id: string) => void;
}

interface SidebarContentProps extends SidebarProps {
    conversations: Conversation[];
    onDelete: (id: string) => void;
    onClearAll: () => void;
    groups: ChatGroup[];
    onToggleGroup: (id: string) => void;
    onRenameGroup: (id: string, title: string) => void;
    onDeleteGroup: (id: string) => void;
    onMoveToGroup: (id: string, groupId?: string) => void;
    onCreateGroup: () => void;
}

function SidebarContent({
    currentConversationId,
    onSelectConversation,
    onNewChat,
    onOpenSettings,
    conversations,
    onDelete,
    onClearAll,
    onRename,
    onPin,
    groups,
    onToggleGroup,
    onRenameGroup,
    onDeleteGroup,
    onMoveToGroup,
    onCreateGroup,
    lastUpdated,
}: SidebarContentProps) {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
    const [editGroupTitle, setEditGroupTitle] = useState('');

    const pinnedConversations = conversations.filter(c => c.pinned && !c.groupId);
    const unpinnedConversations = conversations.filter(c => !c.pinned && !c.groupId);

    const conversationsByGroup: Record<string, Conversation[]> = {};
    groups.forEach(group => {
        conversationsByGroup[group.id] = conversations.filter(c => c.groupId === group.id);
    });

    const startEditing = (e: React.MouseEvent, conv: Conversation) => {
        e.stopPropagation();
        setEditingId(conv.id);
        setEditTitle(conv.title);
    };

    const saveEdit = () => {
        if (editingId && editTitle.trim()) {
            onRename(editingId, editTitle.trim());
        }
        setEditingId(null);
    };

    // Helper to render a conversation item
    const renderConversationItem = (conv: Conversation) => (
        <ContextMenu key={conv.id}>
            <ContextMenuTrigger asChild>
                <div
                    className={cn(
                        'group flex items-center gap-2 p-3 rounded-xl cursor-pointer hover:bg-muted/80 transition-all border border-transparent hover:border-border/50',
                        currentConversationId === conv.id && 'bg-muted border-border/50 shadow-sm'
                    )}
                    onClick={() => onSelectConversation(conv.id)}
                >
                    {conv.pinned ? <Pin className="h-3.5 w-3.5 flex-shrink-0 text-primary/70" /> : <MessageSquare className="h-4 w-4 flex-shrink-0 text-muted-foreground" />}

                    {editingId === conv.id ? (
                        <div className="flex-1 flex items-center gap-1 min-w-0" onClick={e => e.stopPropagation()}>
                            <Input
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                className="h-7 text-xs px-2"
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveEdit();
                                    if (e.key === 'Escape') setEditingId(null);
                                }}
                                onBlur={() => saveEdit()}
                            />
                        </div>
                    ) : (
                        <div className="flex-1 min-w-0 overflow-hidden">
                            <p className="text-sm truncate w-full" title={conv.title}>{conv.title}</p>
                            <p className="text-xs text-muted-foreground truncate w-full">
                                {PROVIDERS[conv.providerId as ProviderId]?.name || conv.providerId}
                            </p>
                        </div>
                    )}
                </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
                <ContextMenuItem onClick={(e) => { e.stopPropagation(); onPin(conv.id); }}>
                    {conv.pinned ? <><PinOff className="mr-2 h-4 w-4" /> Unpin</> : <><Pin className="mr-2 h-4 w-4" /> Pin</>}
                </ContextMenuItem>
                <ContextMenuItem onClick={(e) => startEditing(e, conv)}>
                    <Pencil className="mr-2 h-4 w-4" /> Rename
                </ContextMenuItem>

                {groups.length > 0 && (
                    <>
                        <Separator className="my-1" />
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Move to Group
                        </div>
                        {conv.groupId && (
                            <ContextMenuItem onClick={(e) => { e.stopPropagation(); onMoveToGroup(conv.id, undefined); }}>
                                <X className="mr-2 h-4 w-4" /> Remove from Group
                            </ContextMenuItem>
                        )}
                        {groups.filter(g => g.id !== conv.groupId).map(group => (
                            <ContextMenuItem key={group.id} onClick={(e) => { e.stopPropagation(); onMoveToGroup(conv.id, group.id); }}>
                                <Folder className="mr-2 h-4 w-4" /> {group.title}
                            </ContextMenuItem>
                        ))}
                    </>
                )}

                <Separator className="my-1" />
                <ContextMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
                >
                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );

    const startEditingGroup = (e: React.MouseEvent, group: ChatGroup) => {
        e.stopPropagation();
        setEditingGroupId(group.id);
        setEditGroupTitle(group.title);
    };

    const saveGroupEdit = () => {
        if (editingGroupId && editGroupTitle.trim()) {
            onRenameGroup(editingGroupId, editGroupTitle.trim());
        }
        setEditingGroupId(null);
    };

    const renderGroupItem = (group: ChatGroup) => {
        const groupConversations = conversationsByGroup[group.id] || [];
        const isSelected = groupConversations.some(c => c.id === currentConversationId);

        return (
            <div key={group.id} className="space-y-1">
                <ContextMenu>
                    <ContextMenuTrigger asChild>
                        <div
                            className={cn(
                                "group flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors",
                                isSelected && !group.collapsed && "bg-muted/30"
                            )}
                            onClick={() => onToggleGroup(group.id)}
                        >
                            {group.collapsed ? (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            ) : (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            )}
                            <Folder className="h-4 w-4 text-primary/70" />

                            {editingGroupId === group.id ? (
                                <Input
                                    value={editGroupTitle}
                                    onChange={(e) => setEditGroupTitle(e.target.value)}
                                    className="h-7 text-sm px-2 flex-1"
                                    autoFocus
                                    onClick={e => e.stopPropagation()}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') saveGroupEdit();
                                        if (e.key === 'Escape') setEditingGroupId(null);
                                    }}
                                    onBlur={() => saveGroupEdit()}
                                />
                            ) : (
                                <span className="text-sm font-medium flex-1 truncate">{group.title}</span>
                            )}
                            <span className="text-xs text-muted-foreground px-1">{groupConversations.length}</span>
                        </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                        <ContextMenuItem onClick={(e) => startEditingGroup(e, group)}>
                            <Pencil className="mr-2 h-4 w-4" /> Rename Group
                        </ContextMenuItem>
                        <ContextMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={(e) => { e.stopPropagation(); onDeleteGroup(group.id); }}
                        >
                            <Trash2 className="mr-2 h-4 w-4" /> Delete Group
                        </ContextMenuItem>
                    </ContextMenuContent>
                </ContextMenu>

                {!group.collapsed && (
                    <div className="pl-4 space-y-1 border-l ml-4 mt-1 border-border/50">
                        {groupConversations.length === 0 ? (
                            <div className="p-3 text-xs text-muted-foreground italic">Empty group</div>
                        ) : (
                            groupConversations.map(renderConversationItem)
                        )}
                    </div>
                )}
            </div>
        );
    };

    const [prefs, setPrefs] = useState<UserPreferences>({
        theme: 'system',
        defaultProvider: 'openai',
        systemPrompt: '',
        username: 'User'
    });

    useEffect(() => {
        setPrefs(getPreferences());
    }, [conversations, lastUpdated]); // Refresh when conversations OR settings change

    return (
        <div className="flex flex-col h-full">
            <div className="p-2"></div>

            <ScrollArea className="flex-1">
                <div className="p-2 space-y-1">
                    {conversations.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                            No conversations yet
                        </p>
                    ) : (
                        <>
                            <div className="flex items-center justify-between px-2 py-1 mb-1">
                                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                    Conversations
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5 hover:bg-muted"
                                    title="New Group"
                                    onClick={(e) => { e.stopPropagation(); onCreateGroup(); }}
                                >
                                    <FolderPlus className="h-3.5 w-3.5" />
                                </Button>
                            </div>

                            {pinnedConversations.length > 0 && (
                                <div className="space-y-1 mb-4">
                                    <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-tight opacity-50">
                                        Pinned
                                    </div>
                                    {pinnedConversations.map(renderConversationItem)}
                                </div>
                            )}

                            {groups.length > 0 && (
                                <div className="space-y-1 mb-4">
                                    {groups.map(renderGroupItem)}
                                </div>
                            )}

                            {unpinnedConversations.length > 0 && (
                                <div className="space-y-1">
                                    {(pinnedConversations.length > 0 || groups.length > 0) && (
                                        <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-tight opacity-50">
                                            Others
                                        </div>
                                    )}
                                    {unpinnedConversations.map(renderConversationItem)}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </ScrollArea>

            <Separator />

            <div className="p-2 space-y-0.5">
                <Button
                    variant="ghost"
                    className="w-full justify-start gap-2 text-destructive hover:text-destructive hover:bg-destructive/10 h-9 px-3"
                    onClick={onClearAll}
                    disabled={conversations.length === 0}
                >
                    <Trash2 className="h-4 w-4" />
                    <span className="text-xs">Clear History</span>
                </Button>
                <Button
                    variant="ghost"
                    className="w-full justify-start gap-2 h-9 px-3"
                    onClick={onOpenSettings}
                >
                    <Settings className="h-4 w-4" />
                    <span className="text-xs">Settings</span>
                </Button>
            </div>

            <Separator />

            <div className="p-3 bg-muted/20">
                <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9 border border-border/50 shadow-sm">
                        <AvatarImage src={prefs.avatar} />
                        <AvatarFallback><User className="h-4 w-4 text-muted-foreground" /></AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate leading-none mb-1">
                            {prefs.username || 'User'}
                        </p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-tight font-medium opacity-60">
                            Local Account
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function Sidebar(props: SidebarProps) {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [groups, setGroups] = useState<ChatGroup[]>([]);
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [deleteGroupId, setDeleteGroupId] = useState<string | null>(null);
    const [isClearingAll, setIsClearingAll] = useState(false);

    useEffect(() => {
        setConversations(getConversations());
        setGroups(getGroups());
    }, [props.currentConversationId, props.lastUpdated]);

    const handleDelete = (id: string) => {
        setDeleteId(id);
    };

    const confirmDelete = () => {
        if (deleteId) {
            deleteConversation(deleteId);
            setConversations(getConversations());
            if (props.currentConversationId === deleteId) {
                props.onNewChat();
            }
            setDeleteId(null);
        }
    };

    const handleDeleteGroup = (id: string) => {
        setDeleteGroupId(id);
    };

    const confirmDeleteGroup = () => {
        if (deleteGroupId) {
            deleteGroup(deleteGroupId);
            setGroups(getGroups());
            setConversations(getConversations()); // Conversations might have been ungrouped
            setDeleteGroupId(null);
        }
    };

    const handleClearAll = () => {
        setIsClearingAll(true);
    };

    const confirmClearAll = () => {
        const all = getConversations();
        all.forEach(c => deleteConversation(c.id));
        setConversations([]);
        props.onNewChat();
        setIsClearingAll(false);
    };

    const handleSelectConversation = (id: string) => {
        props.onSelectConversation(id);
        setIsMobileOpen(false);
    };

    const handleNewChat = () => {
        props.onNewChat();
        setIsMobileOpen(false);
    };

    const handleRename = (id: string, newTitle: string) => {
        props.onRename(id, newTitle);
        setConversations(getConversations());
    };

    const handlePin = (id: string) => {
        props.onPin(id);
        setConversations(getConversations());
    }

    const handleCreateGroup = () => {
        createGroup('New Group');
        setGroups(getGroups());
    };

    const handleRenameGroup = (id: string, title: string) => {
        renameGroup(id, title);
        setGroups(getGroups());
    };

    const handleToggleGroup = (id: string) => {
        toggleGroupCollapse(id);
        setGroups(getGroups());
    };

    const handleMoveToGroup = (id: string, groupId?: string) => {
        moveConversationToGroup(id, groupId);
        setConversations(getConversations());
    };

    const sidebarContentProps: SidebarContentProps = {
        ...props,
        conversations,
        groups,
        onDelete: handleDelete,
        onClearAll: handleClearAll,
        onSelectConversation: handleSelectConversation,
        onNewChat: handleNewChat,
        onRename: handleRename,
        onPin: handlePin,
        onToggleGroup: handleToggleGroup,
        onRenameGroup: handleRenameGroup,
        onDeleteGroup: handleDeleteGroup,
        onMoveToGroup: handleMoveToGroup,
        onCreateGroup: handleCreateGroup,
    };

    return (
        <>
            {/* Desktop Sidebar */}
            <div className="hidden md:flex flex-col w-80 border-r bg-muted/20">
                <div className="flex-1 flex flex-col overflow-hidden">
                    <SidebarContent {...sidebarContentProps} />
                </div>
            </div>

            {/* Mobile Sidebar */}
            <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
                <SheetTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="md:hidden absolute left-4 top-4 z-10"
                    >
                        <Menu className="h-5 w-5" />
                    </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-64 p-0">
                    <SidebarContent {...sidebarContentProps} />
                </SheetContent>
            </Sheet>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Conversation</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete this conversation? This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Delete Group Confirmation Dialog */}
            <AlertDialog open={!!deleteGroupId} onOpenChange={(open) => !open && setDeleteGroupId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Group</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete this group? The conversations within it will be moved to the main list.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDeleteGroup} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Delete Group
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Clear All Confirmation Dialog */}
            <AlertDialog open={isClearingAll} onOpenChange={setIsClearingAll}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Clear All History</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to clear all conversations? This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmClearAll} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Clear All
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

export function SidebarMobileTrigger() {
    return null; // Trigger is built into Sidebar component
}
