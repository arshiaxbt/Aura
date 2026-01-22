import { useState, useEffect } from 'react';
import { ArrowLeft, Loader2, ShieldCheck, ShieldAlert, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import type { RiskShieldResult } from './RiskShield';

interface SecurityScanPageProps {
    result: RiskShieldResult | null;
    address: string;
    onBack: () => void;
    onRescan: () => Promise<void>;
}

function formatTimestamp(timestamp: number): string {
    if (timestamp === 0) return 'Not scanned yet';
    const date = new Date(timestamp);
    return date.toLocaleString();
}

export function SecurityScanPage({ result, address, onBack, onRescan }: SecurityScanPageProps) {
    const [scanning, setScanning] = useState(false);
    const [currentResult, setCurrentResult] = useState(result);

    useEffect(() => {
        if (!currentResult || currentResult.timestamp === 0) {
            handleScan();
        }
    }, []);

    useEffect(() => {
        if (result && result.timestamp > 0) {
            setCurrentResult(result);
        }
    }, [result]);

    const handleScan = async () => {
        setScanning(true);
        try {
            await onRescan();
        } finally {
            setScanning(false);
        }
    };

    return (
        <div
            className="w-[360px] bg-[#1C1B1F] text-[#E6E1E5] min-h-[420px] p-4 font-sans"
            style={{ fontFamily: "'Roboto', sans-serif" }}
        >
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <button
                    onClick={onBack}
                    className="p-2 rounded-full hover:bg-[#49454F] transition-colors"
                >
                    <ArrowLeft size={20} className="text-[#CAC4D0]" />
                </button>
                <h1 className="text-lg font-medium">Security Scan</h1>
            </div>

            {/* Address Display */}
            <div className="bg-[#2B2930] rounded-xl p-3 mb-4 border border-[#49454F]">
                <span className="text-[10px] uppercase tracking-wider text-[#CAC4D0] font-medium">
                    Address
                </span>
                <p className="font-mono text-sm mt-1">
                    {`${address.slice(0, 10)}...${address.slice(-8)}`}
                </p>
            </div>

            {/* Scanning State */}
            {scanning && (
                <div className="rounded-xl p-6 mb-4 flex flex-col items-center gap-3 bg-[#2B2930] border border-[#49454F]">
                    <Loader2 size={40} className="animate-spin text-[#D0BCFF]" />
                    <p className="text-sm text-[#CAC4D0]">Scanning address...</p>
                </div>
            )}

            {/* Result Status */}
            {!scanning && currentResult && currentResult.timestamp > 0 && (
                <div className={clsx(
                    'rounded-xl p-4 mb-4 flex items-center gap-3',
                    currentResult.status === 'safe'
                        ? 'bg-emerald-500/10 border border-emerald-500/30'
                        : 'bg-red-500/10 border border-red-500/30'
                )}>
                    {currentResult.status === 'safe' ? (
                        <>
                            <ShieldCheck size={32} className="text-emerald-400" />
                            <div>
                                <h2 className="font-medium text-emerald-400">No Threats Detected</h2>
                                <p className="text-xs text-[#CAC4D0]">This address appears safe</p>
                            </div>
                        </>
                    ) : (
                        <>
                            <ShieldAlert size={32} className="text-red-400" />
                            <div>
                                <h2 className="font-medium text-red-400">Security Risk Detected</h2>
                                <p className="text-xs text-[#CAC4D0]">Exercise extreme caution</p>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Detailed Results */}
            {!scanning && currentResult && currentResult.timestamp > 0 && (
                <div className="space-y-3 mb-4">
                    <h3 className="text-xs uppercase tracking-wider text-[#CAC4D0] font-medium">
                        Scan Results
                    </h3>

                    {/* GoPlus Results */}
                    <div className="bg-[#2B2930] rounded-xl p-3 border border-[#49454F]">
                        <div className="flex items-center gap-2 mb-2">
                            {currentResult.goPlusFlags && currentResult.goPlusFlags.length > 0 ? (
                                <XCircle size={16} className="text-red-400" />
                            ) : (
                                <CheckCircle size={16} className="text-emerald-400" />
                            )}
                            <span className="text-sm font-medium">GoPlus Security</span>
                        </div>
                        {currentResult.goPlusFlags && currentResult.goPlusFlags.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                                {currentResult.goPlusFlags.map((flag, i) => (
                                    <span
                                        key={i}
                                        className="px-2 py-0.5 text-[10px] bg-red-500/20 text-red-400 rounded-full"
                                    >
                                        {flag}
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-[#939094]">No issues found</p>
                        )}
                    </div>

                    {/* ScamSniffer Results */}
                    <div className="bg-[#2B2930] rounded-xl p-3 border border-[#49454F]">
                        <div className="flex items-center gap-2 mb-2">
                            {currentResult.scamSnifferBlacklisted ? (
                                <XCircle size={16} className="text-red-400" />
                            ) : (
                                <CheckCircle size={16} className="text-emerald-400" />
                            )}
                            <span className="text-sm font-medium">ScamSniffer Database</span>
                        </div>
                        {currentResult.scamSnifferBlacklisted ? (
                            <div className="flex items-center gap-1">
                                <AlertTriangle size={12} className="text-red-400" />
                                <span className="text-xs text-red-400">Address found in blacklist</span>
                            </div>
                        ) : (
                            <p className="text-xs text-[#939094]">Not blacklisted</p>
                        )}
                    </div>
                </div>
            )}

            {/* Last Scanned */}
            {!scanning && currentResult && (
                <div className="text-xs text-[#939094] text-center mb-4">
                    {currentResult.timestamp > 0
                        ? `Last scanned: ${formatTimestamp(currentResult.timestamp)}`
                        : 'Click below to scan'}
                </div>
            )}

            {/* Scan Button */}
            <button
                onClick={handleScan}
                disabled={scanning}
                className="w-full bg-[#D0BCFF] hover:bg-[#EADDFF] text-[#381E72] font-medium py-2.5 rounded-full transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
            >
                {scanning ? (
                    <>
                        <Loader2 size={16} className="animate-spin" />
                        Scanning...
                    </>
                ) : currentResult && currentResult.timestamp > 0 ? (
                    'Rescan Address'
                ) : (
                    'Scan Address'
                )}
            </button>
        </div>
    );
}
