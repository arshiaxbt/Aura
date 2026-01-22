import { useState, useEffect } from 'react';
import { ArrowLeft, Lock, Unlock, Loader2, StickyNote, Eye, EyeOff, Trash2, FileText } from 'lucide-react';
import {
    decrypt,
    verifyPassword,
    VAULT_KEYS,
    getNoteKey
} from '~/lib/crypto';

interface NoteItem {
    address: string;
    content: string;
    preview: string;
}

interface NotesListViewProps {
    sessionKey: string | null;
    onSessionKeyChange: (key: string | null) => void;
    onBack: () => void;
    onSelectNote: (address: string) => void;
}

export function NotesListView({
    sessionKey,
    onSessionKeyChange,
    onBack,
    onSelectNote
}: NotesListViewProps) {
    const [notes, setNotes] = useState<NoteItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [vaultExists, setVaultExists] = useState(false);
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [unlocking, setUnlocking] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [deleting, setDeleting] = useState<string | null>(null);

    useEffect(() => {
        checkAndLoadNotes();
    }, [sessionKey]);

    const checkAndLoadNotes = async () => {
        setLoading(true);
        try {
            const result = await chrome.storage.sync.get(null);

            // Check if vault exists
            if (!result[VAULT_KEYS.VALIDATOR]) {
                setVaultExists(false);
                setLoading(false);
                return;
            }

            setVaultExists(true);

            // If no session key, show locked state
            if (!sessionKey) {
                setLoading(false);
                return;
            }

            // Verify session key
            const isValid = await verifyPassword(result[VAULT_KEYS.VALIDATOR], sessionKey);
            if (!isValid) {
                onSessionKeyChange(null);
                setLoading(false);
                return;
            }

            // Load and decrypt all notes
            const noteKeys = Object.keys(result).filter(k => k.startsWith(VAULT_KEYS.NOTE_PREFIX));
            const decryptedNotes: NoteItem[] = [];

            for (const key of noteKeys) {
                try {
                    const address = key.replace(VAULT_KEYS.NOTE_PREFIX, '');
                    const content = await decrypt(result[key], sessionKey);
                    const preview = content.length > 60 ? content.slice(0, 60) + '...' : content;
                    decryptedNotes.push({ address, content, preview });
                } catch (err) {
                    console.error(`[Aura] Failed to decrypt note ${key}:`, err);
                }
            }

            setNotes(decryptedNotes);
        } catch (err) {
            console.error('[Aura] Failed to load notes:', err);
            setError('Failed to load notes');
        } finally {
            setLoading(false);
        }
    };

    const handleUnlock = async () => {
        if (!password) {
            setError('Please enter your password');
            return;
        }

        setError(null);
        setUnlocking(true);
        try {
            const result = await chrome.storage.sync.get([VAULT_KEYS.VALIDATOR]);
            if (result[VAULT_KEYS.VALIDATOR]) {
                const isValid = await verifyPassword(result[VAULT_KEYS.VALIDATOR], password);
                if (isValid) {
                    onSessionKeyChange(password);
                    setPassword('');
                } else {
                    setError('Incorrect password');
                }
            }
        } catch (err) {
            console.error('[Aura] Unlock failed:', err);
            setError('Failed to unlock vault');
        } finally {
            setUnlocking(false);
        }
    };

    const handleDeleteNote = async (address: string) => {
        if (!sessionKey) return;

        setDeleting(address);
        try {
            const noteKey = getNoteKey(address);
            await chrome.storage.sync.remove([noteKey]);
            setNotes(notes.filter(n => n.address !== address));
        } catch (err) {
            console.error('[Aura] Failed to delete note:', err);
        } finally {
            setDeleting(null);
        }
    };

    const truncateAddress = (addr: string) => {
        if (addr.length <= 13) return addr;
        return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
    };

    if (loading) {
        return (
            <div className="w-[360px] min-h-[420px] bg-[#1C1B1F] text-[#E6E1E5] font-sans p-4">
                <header className="flex items-center gap-3 mb-6">
                    <button
                        onClick={onBack}
                        className="p-2 rounded-full hover:bg-[#49454F] transition-colors text-[#CAC4D0] hover:text-[#E6E1E5]"
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <span className="text-lg font-bold text-[#E6E1E5]">My Notes</span>
                </header>
                <div className="flex flex-col items-center justify-center py-12">
                    <Loader2 size={32} className="animate-spin text-[#D0BCFF]" />
                    <p className="text-sm text-[#CAC4D0] mt-3">Loading notes...</p>
                </div>
            </div>
        );
    }

    // No vault exists
    if (!vaultExists) {
        return (
            <div className="w-[360px] min-h-[420px] bg-[#1C1B1F] text-[#E6E1E5] font-sans p-4">
                <header className="flex items-center gap-3 mb-6">
                    <button
                        onClick={onBack}
                        className="p-2 rounded-full hover:bg-[#49454F] transition-colors text-[#CAC4D0] hover:text-[#E6E1E5]"
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <span className="text-lg font-bold text-[#E6E1E5]">My Notes</span>
                </header>
                <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="mb-4 animate-bounce-slow">
                        <StickyNote size={48} className="text-[#939094]" />
                    </div>
                    <h3 className="text-base font-medium text-[#CAC4D0] mb-2">No Vault Created</h3>
                    <p className="text-xs text-[#939094] max-w-[240px]">
                        Look up an address and create your encrypted notes vault to get started.
                    </p>
                </div>
            </div>
        );
    }

    // Vault locked
    if (!sessionKey) {
        return (
            <div className="w-[360px] min-h-[420px] bg-[#1C1B1F] text-[#E6E1E5] font-sans p-4">
                <header className="flex items-center gap-3 mb-6">
                    <button
                        onClick={onBack}
                        className="p-2 rounded-full hover:bg-[#49454F] transition-colors text-[#CAC4D0] hover:text-[#E6E1E5]"
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <span className="text-lg font-bold text-[#E6E1E5]">My Notes</span>
                </header>

                <div className="flex flex-col items-center justify-center py-8">
                    <div className="mb-4">
                        <Lock size={48} className="text-[#F2B8B5]" />
                    </div>
                    <h3 className="text-base font-medium text-[#CAC4D0] mb-4">Vault Locked</h3>

                    <div className="w-full max-w-[280px]">
                        <div className="relative">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => { setPassword(e.target.value); setError(null); }}
                                placeholder="Enter vault password"
                                className="w-full bg-[#2B2930] border border-[#49454F] rounded-lg py-3 px-4 pr-10 text-sm text-[#E6E1E5] focus:outline-none focus:border-[#D0BCFF] placeholder:text-[#939094]"
                                onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#939094] hover:text-[#E6E1E5]"
                            >
                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>

                        {error && (
                            <p className="text-xs text-[#F2B8B5] mt-2 text-center">{error}</p>
                        )}

                        <button
                            onClick={handleUnlock}
                            disabled={unlocking}
                            className="w-full mt-4 bg-[#D0BCFF] hover:bg-[#EADDFF] text-[#381E72] font-medium py-3 rounded-full text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {unlocking ? (
                                <>
                                    <Loader2 size={14} className="animate-spin" />
                                    Unlocking...
                                </>
                            ) : (
                                <>
                                    <Unlock size={14} />
                                    Unlock Vault
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Unlocked - show notes list
    return (
        <div className="w-[360px] min-h-[420px] bg-[#1C1B1F] text-[#E6E1E5] font-sans p-4 flex flex-col">
            <header className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <button
                        onClick={onBack}
                        className="p-2 rounded-full hover:bg-[#49454F] transition-colors text-[#CAC4D0] hover:text-[#E6E1E5]"
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <span className="text-lg font-bold text-[#E6E1E5]">My Notes</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-[#939094]">{notes.length} note{notes.length !== 1 ? 's' : ''}</span>
                    <button
                        onClick={() => onSessionKeyChange(null)}
                        className="p-2 rounded-full hover:bg-[#49454F] transition-colors text-[#CAC4D0] hover:text-[#E6E1E5]"
                        title="Lock vault"
                    >
                        <Lock size={14} />
                    </button>
                </div>
            </header>

            {notes.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
                    <div className="mb-4 animate-bounce-slow">
                        <FileText size={48} className="text-[#939094]" />
                    </div>
                    <h3 className="text-base font-medium text-[#CAC4D0] mb-2">No Notes Yet</h3>
                    <p className="text-xs text-[#939094] max-w-[240px]">
                        Look up an address and add your first private note.
                    </p>
                </div>
            ) : (
                <div className="flex-1 overflow-y-auto space-y-2">
                    {notes.map((note) => (
                        <div
                            key={note.address}
                            className="bg-[#2b2930] rounded-lg border border-[#49454F] p-3 hover:border-[#D0BCFF] transition-colors cursor-pointer group animate-in fade-in duration-200"
                            onClick={() => onSelectNote(note.address)}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-mono text-[#D0BCFF] mb-1">
                                        {truncateAddress(note.address)}
                                    </p>
                                    <p className="text-xs text-[#CAC4D0] line-clamp-2">
                                        {note.preview || 'Empty note'}
                                    </p>
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteNote(note.address);
                                    }}
                                    disabled={deleting === note.address}
                                    className="p-1.5 rounded hover:bg-[#49454F] text-[#939094] hover:text-[#F2B8B5] transition-colors opacity-0 group-hover:opacity-100"
                                    title="Delete note"
                                >
                                    {deleting === note.address ? (
                                        <Loader2 size={14} className="animate-spin" />
                                    ) : (
                                        <Trash2 size={14} />
                                    )}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <footer className="mt-4 pt-3 border-t border-[#49454F]">
                <p className="text-[9px] text-[#939094] text-center">
                    End-to-end encrypted with AES-256
                </p>
            </footer>
        </div>
    );
}
