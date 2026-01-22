import { useState, useEffect, useCallback } from 'react';
import { Loader2, ShieldCheck, ShieldAlert, ShieldQuestion } from 'lucide-react';
import clsx from 'clsx';

export interface RiskShieldResult {
    status: 'safe' | 'danger' | 'error';
    address: string;
    goPlusFlags: string[];
    scamSnifferBlacklisted: boolean;
    timestamp: number;
}

interface RiskShieldProps {
    address: string;
    onOpenDetails?: (result: RiskShieldResult, rescan: () => Promise<void>) => void;
}

type ScanStatus = 'idle' | 'scanning' | 'safe' | 'danger' | 'error';

const CHAINS = [
    { id: 1, name: 'Ethereum' },
    { id: 56, name: 'BSC' },
    { id: 137, name: 'Polygon' },
    { id: 42161, name: 'Arbitrum' },
    { id: 8453, name: 'Base' },
    { id: 10, name: 'Optimism' }
];

export function RiskShield({ address, onOpenDetails }: RiskShieldProps) {
    const [status, setStatus] = useState<ScanStatus>('idle');
    const [result, setResult] = useState<RiskShieldResult | null>(null);
    const [showTooltip, setShowTooltip] = useState(false);

    const normalizedAddress = address?.toLowerCase() || '';
    const cacheKey = `riskshield:${normalizedAddress}`;

    useEffect(() => {
        if (address && address.length === 42) {
            chrome.storage.local.get([cacheKey], (stored) => {
                const cached = stored[cacheKey];
                if (cached && Date.now() - cached.timestamp < 86400000) { // 24 hours
                    setStatus(cached.status);
                    setResult({
                        status: cached.status,
                        address: normalizedAddress,
                        goPlusFlags: cached.goPlusFlags || [],
                        scamSnifferBlacklisted: cached.scamSnifferMatch || false,
                        timestamp: cached.timestamp
                    });
                }
            });
        }
    }, [address, cacheKey, normalizedAddress]);

    const runScan = useCallback(async () => {
        if (!address || address.length !== 42) return;

        setStatus('scanning');

        try {
            console.log('[RiskShield] Starting scan for:', normalizedAddress);

            const [goPlusResult, scamSnifferResult] = await Promise.all([
                checkGoPlus(normalizedAddress),
                checkScamSniffer(normalizedAddress)
            ]);

            let finalStatus: 'safe' | 'danger' = 'safe';
            let flags: string[] = [];

            if (goPlusResult.isDangerous) {
                finalStatus = 'danger';
                flags = goPlusResult.flags || [];
            }
            if (scamSnifferResult.isDangerous) {
                finalStatus = 'danger';
            }

            const newResult: RiskShieldResult = {
                status: finalStatus,
                address: normalizedAddress,
                goPlusFlags: flags,
                scamSnifferBlacklisted: scamSnifferResult.isDangerous,
                timestamp: Date.now()
            };

            const cacheData = {
                status: finalStatus,
                timestamp: Date.now(),
                goPlusFlags: flags,
                scamSnifferMatch: scamSnifferResult.isDangerous
            };

            chrome.storage.local.set({ [cacheKey]: cacheData });
            setStatus(finalStatus);
            setResult(newResult);
            console.log('[RiskShield] Scan complete:', newResult);
        } catch (e) {
            console.error('[RiskShield] Scan failed:', e);
            setStatus('error');
        }
    }, [address, normalizedAddress, cacheKey]);

    const handleClick = async () => {
        if (onOpenDetails) {
            const currentResult = result || {
                status: 'safe' as const,
                address: normalizedAddress,
                goPlusFlags: [],
                scamSnifferBlacklisted: false,
                timestamp: 0
            };
            onOpenDetails(currentResult, runScan);
        } else if (status === 'idle' || status === 'error') {
            await runScan();
        }
    };

    if (!address || address.length !== 42) return null;

    const renderIcon = () => {
        switch (status) {
            case 'scanning':
                return <Loader2 size={16} className="animate-spin" style={{ color: '#D0BCFF' }} />;
            case 'safe':
                return <ShieldCheck size={16} style={{ color: '#34D399' }} />;
            case 'danger':
                return <ShieldAlert size={16} style={{ color: '#EF4444' }} />;
            case 'error':
                return <ShieldQuestion size={16} style={{ color: '#F59E0B' }} />;
            default:
                return <ShieldQuestion size={16} style={{ color: '#9CA3AF' }} />;
        }
    };

    return (
        <div
            className="relative inline-flex"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
        >
            <button
                onClick={handleClick}
                disabled={status === 'scanning'}
                className={clsx(
                    'p-1 rounded-full transition-all duration-200',
                    status === 'idle' && 'hover:bg-[#49454F]',
                    status === 'danger' && 'animate-pulse'
                )}
                title="Security Scan"
            >
                {renderIcon()}
            </button>

            {showTooltip && status !== 'idle' && (
                <div className={clsx(
                    'absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 text-white text-xs rounded-lg whitespace-nowrap shadow-lg z-50',
                    status === 'danger' ? 'bg-[#B3261E]' : 'bg-[#1C1B1F] border border-[#49454F]'
                )}>
                    {status === 'scanning' && 'Scanning...'}
                    {status === 'safe' && '✓ Safe'}
                    {status === 'danger' && '⚠️ Risk Detected'}
                    {status === 'error' && 'Scan failed'}
                </div>
            )}
        </div>
    );
}

// GoPlus Security API Check
async function checkGoPlus(address: string): Promise<{ isDangerous: boolean; flags?: string[] }> {
    console.log('[RiskShield] Checking GoPlus on', CHAINS.length, 'chains');

    const allFlags: string[] = [];
    const results = await Promise.all(
        CHAINS.map(chain => checkGoPlusChain(address, chain.id, chain.name))
    );

    for (const result of results) {
        if (result.isDangerous && result.flags) {
            allFlags.push(...result.flags);
        }
    }

    const uniqueFlags = [...new Set(allFlags)];

    if (uniqueFlags.length > 0) {
        console.log('[RiskShield] GoPlus DANGER - flags:', uniqueFlags);
        return { isDangerous: true, flags: uniqueFlags };
    }

    console.log('[RiskShield] GoPlus SAFE - no flags on any chain');
    return { isDangerous: false };
}

async function checkGoPlusChain(address: string, chainId: number, chainName: string): Promise<{ isDangerous: boolean; flags?: string[] }> {
    try {
        const url = `https://api.gopluslabs.io/api/v1/address_security/${address}?chain_id=${chainId}`;
        console.log(`[RiskShield] GoPlus ${chainName}:`, url);

        const response = await fetch(url);
        if (!response.ok) {
            console.warn(`[RiskShield] GoPlus ${chainName} error:`, response.status);
            return { isDangerous: false };
        }

        const data = await response.json();
        const result = data.result;

        if (!result || typeof result !== 'object') {
            console.log(`[RiskShield] GoPlus ${chainName}: no data`);
            return { isDangerous: false };
        }

        console.log(`[RiskShield] GoPlus ${chainName} result:`, JSON.stringify(result));

        const flags: string[] = [];

        if (result.malicious_address === '1' || result.malicious_address === 1) flags.push('Malicious');
        if (result.phishing_activities === '1' || result.phishing_activities === 1) flags.push('Phishing');
        if (result.blacklist_doubt === '1' || result.blacklist_doubt === 1) flags.push('Blacklisted');
        if (result.honeypot_related_address === '1' || result.honeypot_related_address === 1) flags.push('Honeypot');
        if (result.stealing_attack === '1' || result.stealing_attack === 1) flags.push('Stealing');
        if (result.fake_kyc === '1' || result.fake_kyc === 1) flags.push('Fake KYC');
        if (result.blackmail_activities === '1' || result.blackmail_activities === 1) flags.push('Blackmail');
        if (result.sanctioned === '1' || result.sanctioned === 1) flags.push('Sanctioned');
        if (result.money_laundering === '1' || result.money_laundering === 1) flags.push('Money Laundering');
        if (result.cybercrime === '1' || result.cybercrime === 1) flags.push('Cybercrime');
        if (result.financial_crime === '1' || result.financial_crime === 1) flags.push('Financial Crime');

        if (flags.length > 0) {
            console.log(`[RiskShield] GoPlus ${chainName} FLAGGED:`, flags);
            return { isDangerous: true, flags };
        }

        return { isDangerous: false };
    } catch (e) {
        console.error(`[RiskShield] GoPlus ${chainName} check failed:`, e);
        return { isDangerous: false };
    }
}

// ScamSniffer Blacklist Check
async function checkScamSniffer(address: string): Promise<{ isDangerous: boolean }> {
    try {
        const url = 'https://raw.githubusercontent.com/scamsniffer/scam-database/main/blacklist/address.json';
        console.log('[RiskShield] ScamSniffer URL:', url);

        const response = await fetch(url);
        if (!response.ok) {
            console.warn('[RiskShield] ScamSniffer fetch error:', response.status);
            return { isDangerous: false };
        }

        const blacklist: string[] = await response.json();
        console.log('[RiskShield] ScamSniffer loaded', blacklist.length, 'addresses');

        const normalizedBlacklist = blacklist.map(a => a.toLowerCase());

        if (normalizedBlacklist.includes(address.toLowerCase())) {
            console.log('[RiskShield] Address found in ScamSniffer blacklist!');
            return { isDangerous: true };
        }

        return { isDangerous: false };
    } catch (e) {
        console.error('[RiskShield] ScamSniffer check failed:', e);
        return { isDangerous: false };
    }
}
