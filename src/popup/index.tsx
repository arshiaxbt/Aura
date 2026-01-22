import { useState, useCallback, useEffect } from 'react';
import { Search, Loader2, StickyNote } from 'lucide-react';
import { useEthosProfile } from '~/hooks/useEthosProfile';
import { AuraRing } from '~/components/AuraRing';
import { HudCard } from '~/components/HudCard';
import { GhostState, ErrorState, LoadingState } from '~/components/GhostState';
import { SecurityScanPage } from '~/components/SecurityScanPage';
import { NotesListView } from '~/components/NotesListView';
import type { RiskShieldResult } from '~/components/RiskShield';
import '../style.css';
import auraLogo from '../../assets/aura-logo.png';

type ViewMode = 'main' | 'security' | 'notes';

const SESSION_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour

function IndexPopup() {
    const [input, setInput] = useState('');
    const [address, setAddress] = useState<string | null>(null);
    const [resolving, setResolving] = useState(false);
    const [inputError, setInputError] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<ViewMode>('main');
    const [securityResult, setSecurityResult] = useState<RiskShieldResult | null>(null);
    const [securityAddress, setSecurityAddress] = useState('');
    const [rescanFn, setRescanFn] = useState<(() => Promise<void>) | null>(null);
    const [sessionKey, setSessionKey] = useState<string | null>(null);

    const { user, sybilFlags, loading, error, notFound, refetch } = useEthosProfile(address, 'address');

    // Handle session key changes - store with expiry timestamp and broadcast to content scripts
    const handleSessionKeyChange = useCallback((key: string | null) => {
        setSessionKey(key);
        if (key) {
            // Store session with expiry using local storage (shared with content scripts)
            chrome.storage.local.set({
                vaultSession: {
                    key,
                    expiresAt: Date.now() + SESSION_TIMEOUT_MS
                }
            });
            // Broadcast unlock to all content scripts
            chrome.tabs.query({}, (tabs) => {
                tabs.forEach(tab => {
                    if (tab.id) {
                        chrome.tabs.sendMessage(tab.id, {
                            type: 'VAULT_UNLOCKED',
                            sessionKey: key
                        }).catch(() => { /* tab might not have content script */ });
                    }
                });
            });
        } else {
            chrome.storage.local.remove(['vaultSession']);
            // Broadcast lock to all content scripts
            chrome.tabs.query({}, (tabs) => {
                tabs.forEach(tab => {
                    if (tab.id) {
                        chrome.tabs.sendMessage(tab.id, {
                            type: 'VAULT_LOCKED'
                        }).catch(() => { /* tab might not have content script */ });
                    }
                });
            });
        }
    }, []);

    useEffect(() => {
        // Check for valid session from local storage
        chrome.storage.local.get(['vaultSession'], (result) => {
            if (result.vaultSession) {
                const { key, expiresAt } = result.vaultSession;
                if (Date.now() < expiresAt) {
                    setSessionKey(key);
                } else {
                    // Session expired, clear it
                    chrome.storage.local.remove(['vaultSession']);
                }
            }
        });

        // Check for pending note address from hover quick-note button
        chrome.storage.local.get(['pendingNoteAddress'], (result) => {
            if (result.pendingNoteAddress) {
                const addr = result.pendingNoteAddress;
                chrome.storage.local.remove(['pendingNoteAddress']);
                setInput(addr);
                setAddress(addr);
            }
        });
    }, []);

    const isValidAddress = (addr: string) => /^0x[a-fA-F0-9]{40}$/.test(addr);
    const isENSName = (name: string) => name.includes('.eth') || name.includes('.base.eth');

    const handleLookup = async () => {
        const trimmed = input.trim().toLowerCase();
        if (!trimmed) return;

        setInputError(null);

        if (isENSName(trimmed)) {
            setResolving(true);
            try {
                const response = await chrome.runtime.sendMessage({
                    type: 'RESOLVE_NAME',
                    name: trimmed
                });
                if (response?.address) {
                    setAddress(response.address);
                } else {
                    setInputError(`Could not resolve "${trimmed}". Name not found.`);
                    setAddress(null);
                }
            } catch (e) {
                console.error('[Aura] Name resolution failed:', e);
                setInputError(`Failed to resolve "${trimmed}". Please try again.`);
                setAddress(null);
            } finally {
                setResolving(false);
            }
        } else if (isValidAddress(trimmed)) {
            setAddress(trimmed);
        } else {
            setInputError('Invalid input. Please enter a valid address (0x...), ENS (name.eth), or Basename (name.base.eth).');
            setAddress(null);
        }
    };

    const handleOpenSecurityDetails = useCallback((result: RiskShieldResult, rescan: () => Promise<void>) => {
        setSecurityResult(result);
        setSecurityAddress(result.address);
        setRescanFn(() => rescan);
        setViewMode('security');
    }, []);

    const handleRescan = async () => {
        if (rescanFn) {
            await rescanFn();
            const cacheKey = `riskshield:${securityAddress.toLowerCase()}`;
            chrome.storage.local.get([cacheKey], (stored) => {
                if (stored[cacheKey]) {
                    setSecurityResult({
                        status: stored[cacheKey].status,
                        address: securityAddress,
                        goPlusFlags: stored[cacheKey].goPlusFlags || [],
                        scamSnifferBlacklisted: stored[cacheKey].scamSnifferMatch || false,
                        timestamp: stored[cacheKey].timestamp
                    });
                }
            });
        }
    };

    const isLoading = loading || resolving;

    // Notes List View
    if (viewMode === 'notes') {
        return (
            <NotesListView
                sessionKey={sessionKey}
                onSessionKeyChange={handleSessionKeyChange}
                onBack={() => setViewMode('main')}
                onSelectNote={(addr) => {
                    setInput(addr);
                    setAddress(addr);
                    setViewMode('main');
                }}
            />
        );
    }

    // Security Scan View
    if (viewMode === 'security') {
        return (
            <SecurityScanPage
                result={securityResult}
                address={securityAddress}
                onBack={() => setViewMode('main')}
                onRescan={handleRescan}
            />
        );
    }

    // Main Popup View
    return (
        <div
            className="w-[360px] min-h-[420px] max-h-[600px] bg-[#1C1B1F] text-[#E6E1E5] font-sans p-4 relative flex flex-col"
            style={{ fontFamily: "'Roboto', sans-serif" }}
        >
            {/* Header */}
            <header className="flex items-center justify-between mb-6 relative z-10">
                <div className="flex items-center gap-2">
                    <img src={auraLogo} alt="Aura" className="w-8 h-8 object-contain" />
                    <span className="text-xl font-bold tracking-tight text-[#E6E1E5]">AURA</span>
                </div>
                <button
                    onClick={() => setViewMode('notes')}
                    className="p-2 rounded-full hover:bg-[#49454F] transition-colors text-[#CAC4D0] hover:text-[#D0BCFF]"
                    title="My Notes"
                >
                    <StickyNote size={18} />
                </button>
            </header>

            {/* Search Input */}
            <div className="relative z-10 mb-6">
                <div className="relative group">
                    <input
                        type="text"
                        className="w-full bg-[#2B2930] border border-[#49454F] rounded-[28px] py-3 pl-10 pr-4 text-sm text-[#E6E1E5] focus:outline-none focus:border-[#D0BCFF] focus:ring-1 focus:ring-[#D0BCFF] transition-all placeholder:text-[#939094]"
                        placeholder="Address, ENS, or Basename"
                        value={input}
                        onChange={(e) => { setInput(e.target.value); setInputError(null); }}
                        onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
                    />
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#939094] w-4 h-4 group-focus-within:text-[#D0BCFF] transition-colors" />
                </div>

                <button
                    className="w-full mt-3 bg-[#D0BCFF] hover:bg-[#EADDFF] text-[#381E72] font-medium py-2.5 rounded-full transition-all flex items-center justify-center gap-2 shadow-sm"
                    onClick={handleLookup}
                    disabled={isLoading}
                >
                    {isLoading ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>{resolving ? 'Resolving...' : 'Scanning...'}</span>
                        </>
                    ) : (
                        'Lookup'
                    )}
                </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto min-h-0">
                {isLoading && <LoadingState />}

                {inputError && !isLoading && (
                    <ErrorState message={inputError} />
                )}

                {error && !isLoading && !inputError && (
                    <ErrorState message={error} onRetry={refetch} />
                )}

                {notFound && !isLoading && !inputError && (
                    <GhostState address={address || undefined} />
                )}

                {user && !isLoading && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <HudCard
                            user={user}
                            sybilFlags={sybilFlags}
                            onCopyAddress={() => {
                                if (address) navigator.clipboard.writeText(address);
                            }}
                            embedded={true}
                            onOpenSecurityDetails={handleOpenSecurityDetails}
                            sessionKey={sessionKey}
                            onSessionKeyChange={handleSessionKeyChange}
                        />
                    </div>
                )}

                {!address && !isLoading && !inputError && (
                    <div className="flex flex-col items-center justify-center h-full opacity-70 pb-8">
                        <AuraRing score={null} tier="unscored" size={80} strokeWidth={2} />
                        <p className="mt-4 text-xs font-medium uppercase tracking-widest text-[#939094]">
                            Enter address, ENS, or Basename
                        </p>
                    </div>
                )}
            </div>

            {/* Footer */}
            <footer className="mt-auto pt-4 text-center shrink-0">
                <p className="text-[9px] text-[#939094] opacity-60">
                    Powered by{' '}
                    <a
                        href="https://ethos.network"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#D0BCFF] hover:underline transition-colors"
                    >
                        Ethos Network
                    </a>
                </p>
            </footer>
        </div>
    );
}

export default function Popup() {
    return <IndexPopup />;
}
