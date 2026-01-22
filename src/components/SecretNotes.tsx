import { useState, useEffect, useCallback, useRef } from 'react';
import { Lock, Unlock, Save, Loader2, Eye, EyeOff, StickyNote } from 'lucide-react';
import {
    encrypt,
    decrypt,
    createValidator,
    verifyPassword,
    VAULT_KEYS,
    getNoteKey
} from '~/lib/crypto';

type VaultState = 'setup' | 'locked' | 'unlocked';

interface SecretNotesProps {
    address: string;
    sessionKey: string | null;
    onSessionKeyChange: (key: string | null) => void;
}

export function SecretNotes({ address, sessionKey, onSessionKeyChange }: SecretNotesProps) {
    const [vaultState, setVaultState] = useState<VaultState>('locked');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [lastSaved, setLastSaved] = useState<Date | null>(null);

    const noteKey = getNoteKey(address);

    // Check vault state on mount
    useEffect(() => {
        checkVaultState();
    }, []);

    // Load note when unlocked
    useEffect(() => {
        if (sessionKey && vaultState === 'unlocked') {
            loadNote();
        }
    }, [sessionKey, vaultState, address]);

    const checkVaultState = async () => {
        setLoading(true);
        try {
            const result = await chrome.storage.sync.get([VAULT_KEYS.VALIDATOR]);
            if (result[VAULT_KEYS.VALIDATOR]) {
                // Vault exists, check if we have session key
                if (sessionKey) {
                    // Verify session key is still valid
                    const isValid = await verifyPassword(result[VAULT_KEYS.VALIDATOR], sessionKey);
                    setVaultState(isValid ? 'unlocked' : 'locked');
                    if (!isValid) {
                        onSessionKeyChange(null);
                    }
                } else {
                    setVaultState('locked');
                }
            } else {
                setVaultState('setup');
            }
        } catch (err) {
            console.error('[Aura] Vault state check failed:', err);
            setError('Failed to check vault state');
        } finally {
            setLoading(false);
        }
    };

    const loadNote = async () => {
        if (!sessionKey) return;
        try {
            const result = await chrome.storage.sync.get([noteKey]);
            if (result[noteKey]) {
                const decrypted = await decrypt(result[noteKey], sessionKey);
                setNote(decrypted);
            } else {
                setNote('');
            }
        } catch (err) {
            console.error('[Aura] Failed to load note:', err);
            setNote('');
        }
    };

    const handleSetupVault = async () => {
        if (password.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }
        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        setError(null);
        setSaving(true);
        try {
            const validator = await createValidator(password);
            await chrome.storage.sync.set({ [VAULT_KEYS.VALIDATOR]: validator });
            onSessionKeyChange(password);
            setVaultState('unlocked');
            setPassword('');
            setConfirmPassword('');
        } catch (err) {
            console.error('[Aura] Vault setup failed:', err);
            setError('Failed to create vault');
        } finally {
            setSaving(false);
        }
    };

    const handleUnlock = async () => {
        if (!password) {
            setError('Please enter your password');
            return;
        }

        setError(null);
        setSaving(true);
        try {
            const result = await chrome.storage.sync.get([VAULT_KEYS.VALIDATOR]);
            if (result[VAULT_KEYS.VALIDATOR]) {
                const isValid = await verifyPassword(result[VAULT_KEYS.VALIDATOR], password);
                if (isValid) {
                    onSessionKeyChange(password);
                    setVaultState('unlocked');
                    setPassword('');
                } else {
                    setError('Incorrect password');
                }
            }
        } catch (err) {
            console.error('[Aura] Unlock failed:', err);
            setError('Failed to unlock vault');
        } finally {
            setSaving(false);
        }
    };

    const handleLock = () => {
        onSessionKeyChange(null);
        setVaultState('locked');
        setNote('');
    };

    const saveNote = useCallback(async (content: string) => {
        if (!sessionKey) return;

        setSaving(true);
        try {
            if (content.trim()) {
                const encrypted = await encrypt(content, sessionKey);
                await chrome.storage.sync.set({ [noteKey]: encrypted });
            } else {
                await chrome.storage.sync.remove([noteKey]);
            }
            setLastSaved(new Date());
        } catch (err) {
            console.error('[Aura] Failed to save note:', err);
            setError('Failed to save note');
        } finally {
            setSaving(false);
        }
    }, [sessionKey, noteKey]);

    const handleNoteChange = (value: string) => {
        setNote(value);

        // Debounced auto-save
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = setTimeout(() => {
            saveNote(value);
        }, 1000);
    };

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, []);

    if (loading) {
        return (
            <div className="mt-3 p-3 bg-[#2b2930] rounded-lg border border-[#49454F]">
                <div className="flex items-center justify-center gap-2 text-[#CAC4D0]">
                    <Loader2 size={14} className="animate-spin" />
                    <span className="text-xs">Loading vault...</span>
                </div>
            </div>
        );
    }

    // Setup State
    if (vaultState === 'setup') {
        return (
            <div className="mt-3 p-3 bg-[#2b2930] rounded-lg border border-[#49454F] animate-in fade-in duration-200">
                <div className="flex items-center gap-2 mb-3">
                    <StickyNote size={14} className="text-[#D0BCFF]" />
                    <span className="text-xs font-medium text-[#E6E1E5]">Create Notes Vault</span>
                </div>

                <p className="text-[10px] text-[#CAC4D0] mb-3">
                    Set a master password to encrypt your private notes. Notes sync across devices but stay 100% private.
                </p>

                <div className="space-y-2">
                    <div className="relative">
                        <input
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => { setPassword(e.target.value); setError(null); }}
                            placeholder="Create password (min 6 chars)"
                            className="w-full bg-[#1C1B1F] border border-[#49454F] rounded-lg py-2 px-3 pr-8 text-xs text-[#E6E1E5] focus:outline-none focus:border-[#D0BCFF] placeholder:text-[#939094]"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-[#939094] hover:text-[#E6E1E5]"
                        >
                            {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                    </div>
                    <input
                        type={showPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => { setConfirmPassword(e.target.value); setError(null); }}
                        placeholder="Confirm password"
                        className="w-full bg-[#1C1B1F] border border-[#49454F] rounded-lg py-2 px-3 text-xs text-[#E6E1E5] focus:outline-none focus:border-[#D0BCFF] placeholder:text-[#939094]"
                        onKeyDown={(e) => e.key === 'Enter' && handleSetupVault()}
                    />
                </div>

                {error && (
                    <p className="text-[10px] text-[#F2B8B5] mt-2">{error}</p>
                )}

                <button
                    onClick={handleSetupVault}
                    disabled={saving}
                    className="w-full mt-3 bg-[#D0BCFF] hover:bg-[#EADDFF] text-[#381E72] font-medium py-2 rounded-lg text-xs transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                    {saving ? (
                        <>
                            <Loader2 size={12} className="animate-spin" />
                            Creating...
                        </>
                    ) : (
                        <>
                            <Lock size={12} />
                            Create Vault
                        </>
                    )}
                </button>
            </div>
        );
    }

    // Locked State
    if (vaultState === 'locked') {
        return (
            <div className="mt-2 p-2.5 bg-[#2b2930] rounded-lg border border-[#49454F] animate-in fade-in duration-200">
                <div className="flex items-center gap-2 mb-2">
                    <Lock size={12} className="text-[#F2B8B5]" />
                    <span className="text-[11px] font-medium text-[#CAC4D0]">Vault Locked</span>
                </div>

                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <input
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => { setPassword(e.target.value); setError(null); }}
                            placeholder="Password"
                            className="w-full bg-[#1C1B1F] border border-[#49454F] rounded-lg py-1.5 px-2.5 pr-7 text-[11px] text-[#E6E1E5] focus:outline-none focus:border-[#D0BCFF] placeholder:text-[#939094]"
                            onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-[#939094] hover:text-[#E6E1E5]"
                        >
                            {showPassword ? <EyeOff size={12} /> : <Eye size={12} />}
                        </button>
                    </div>
                    <button
                        onClick={handleUnlock}
                        disabled={saving}
                        className="px-3 bg-[#D0BCFF] hover:bg-[#EADDFF] text-[#381E72] font-medium rounded-lg text-[11px] transition-all flex items-center justify-center gap-1 disabled:opacity-50"
                    >
                        {saving ? (
                            <Loader2 size={12} className="animate-spin" />
                        ) : (
                            <Unlock size={12} />
                        )}
                    </button>
                </div>

                {error && (
                    <p className="text-[10px] text-[#F2B8B5] mt-1.5">{error}</p>
                )}
            </div>
        );
    }

    // Unlocked State
    return (
        <div className="mt-3 p-3 bg-[#2b2930] rounded-lg border border-[#49454F] animate-in fade-in duration-200">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <StickyNote size={14} className="text-[#D0BCFF]" />
                    <span className="text-xs font-medium text-[#E6E1E5]">Private Note</span>
                </div>
                <div className="flex items-center gap-2">
                    {saving && (
                        <div className="flex items-center gap-1 text-[#CAC4D0]">
                            <Loader2 size={10} className="animate-spin" />
                            <span className="text-[9px]">Saving...</span>
                        </div>
                    )}
                    {!saving && lastSaved && (
                        <div className="flex items-center gap-1 text-[#939094]">
                            <Save size={10} />
                            <span className="text-[9px]">Saved</span>
                        </div>
                    )}
                    <button
                        onClick={handleLock}
                        className="p-1 rounded hover:bg-[#49454F] text-[#CAC4D0] hover:text-[#E6E1E5] transition-colors"
                        title="Lock vault"
                    >
                        <Lock size={12} />
                    </button>
                </div>
            </div>

            <textarea
                value={note}
                onChange={(e) => handleNoteChange(e.target.value)}
                placeholder="Add a private note about this address..."
                className="w-full bg-[#1C1B1F] border border-[#49454F] rounded-lg py-2 px-3 text-xs text-[#E6E1E5] focus:outline-none focus:border-[#D0BCFF] placeholder:text-[#939094] resize-none min-h-[80px]"
                rows={3}
            />

            {error && (
                <p className="text-[10px] text-[#F2B8B5] mt-1">{error}</p>
            )}

            <p className="text-[9px] text-[#939094] mt-2">
                Encrypted & synced across your devices
            </p>
        </div>
    );
}
