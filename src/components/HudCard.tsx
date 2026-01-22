import { Copy, ExternalLink, CheckCircle } from 'lucide-react';
import clsx from 'clsx';
import { getScoreTier, formatEthFromWei } from '~/types/ethos';
import { getScoreColor } from '~/lib/constants';
import { AuraRing } from './AuraRing';
import { SybilBadge } from './SybilBadge';
import { RiskShield, type RiskShieldResult } from './RiskShield';
import { SecretNotes } from './SecretNotes';
import type { EthosUser, SybilFlags } from '~/types/ethos';

interface HudCardProps {
    user: EthosUser;
    sybilFlags?: SybilFlags;
    onCopyAddress?: () => void;
    embedded?: boolean;
    onOpenSecurityDetails?: (result: RiskShieldResult, rescan: () => Promise<void>) => void;
    sessionKey?: string | null;
    onSessionKeyChange?: (key: string | null) => void;
}

export function HudCard({
    user,
    sybilFlags,
    onCopyAddress,
    embedded = false,
    onOpenSecurityDetails,
    sessionKey = null,
    onSessionKeyChange
}: HudCardProps) {
    const tier = getScoreTier(user.score);
    const color = getScoreColor(user.score);
    const address = user.userkeys?.find(k => k.startsWith('address:'))?.slice(8) || '';
    const profileUrl = `https://app.ethos.network/profile/${address}`;

    const totalReviews = user.stats.review.received.positive +
        user.stats.review.received.neutral +
        user.stats.review.received.negative;
    const positivePercent = totalReviews > 0
        ? Math.round(user.stats.review.received.positive / totalReviews * 100)
        : 0;

    const verifiedTiers = ['renowned', 'revered', 'distinguished', 'exemplary', 'reputable', 'established', 'known'];

    return (
        <div
            className={clsx(
                'text-[#E6E1E5] overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300 font-sans',
                !embedded && 'bg-[#1C1B1F] rounded-[16px] shadow-[0_4px_8px_3px_rgba(0,0,0,0.15),0_1px_3px_0_rgba(0,0,0,0.3)] w-[320px]'
            )}
            style={{ fontFamily: "'Roboto', sans-serif" }}
        >
            {/* Top accent bar */}
            {!embedded && (
                <div className="h-1 w-full" style={{ background: color }} />
            )}

            <div className="p-3 relative flex flex-col gap-3">
                {/* Profile Header */}
                <div className="flex items-center gap-4">
                    <div className="shrink-0 relative w-[56px] h-[56px]">
                        {user.avatarUrl ? (
                            <img
                                src={user.avatarUrl}
                                alt={user.displayName}
                                className="w-full h-full object-cover rounded-full border-2"
                                style={{ borderColor: color }}
                            />
                        ) : (
                            <AuraRing score={user.score} tier={tier} size={56} strokeWidth={4} />
                        )}
                        {user.avatarUrl && user.score !== null && (
                            <div
                                className="absolute -bottom-1 -right-1 min-w-[24px] h-[18px] px-1 rounded-full flex items-center justify-center text-[10px] font-bold text-[#1C1B1F] shadow-sm ring-1 ring-[#1C1B1F]"
                                style={{ backgroundColor: color }}
                            >
                                {user.score}
                            </div>
                        )}
                    </div>

                    <div className="flex-1 min-w-0">
                        <h3 className="text-[#E6E1E5] font-medium text-lg leading-tight truncate flex items-center gap-2">
                            {user.displayName}
                            {verifiedTiers.includes(tier) && (
                                <CheckCircle size={16} style={{ color }} />
                            )}
                            {address && (
                                <RiskShield address={address} onOpenDetails={onOpenSecurityDetails} />
                            )}
                        </h3>
                        {user.username && (
                            <p className="text-[#CAC4D0] text-sm">@{user.username}</p>
                        )}
                    </div>
                </div>

                {/* Stats Row */}
                <div className="flex gap-2">
                    <div className="flex-1 bg-[#2b2930] rounded-lg p-2 flex flex-col items-center justify-center border border-[#49454F]">
                        <span className="text-[10px] uppercase tracking-wider text-[#CAC4D0] font-medium">
                            Vouches
                        </span>
                        <span className="text-sm font-bold text-[#E6E1E5]">
                            {user.stats.vouch.received.count}
                        </span>
                    </div>
                    <div className="flex-1 bg-[#2b2930] rounded-lg p-2 flex flex-col items-center justify-center border border-[#49454F]">
                        <span className="text-[10px] uppercase tracking-wider text-[#CAC4D0] font-medium">
                            Stake
                        </span>
                        <span className="text-sm font-bold text-[#E6E1E5]">
                            {formatEthFromWei(user.stats.vouch.received.amountWeiTotal)}
                        </span>
                    </div>
                </div>

                {/* Reviews Bar */}
                <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-[11px] text-[#CAC4D0] font-medium">
                        <span style={{ color }}>Reviews</span>
                        <span>{totalReviews > 0 ? `${positivePercent}% Positive` : 'No reviews'}</span>
                    </div>
                    <div className="flex h-2 w-full rounded-full overflow-hidden bg-[#49454F]">
                        {user.stats.review.received.positive > 0 && (
                            <div style={{ flex: user.stats.review.received.positive, background: color }} />
                        )}
                        {user.stats.review.received.neutral > 0 && (
                            <div style={{ flex: user.stats.review.received.neutral, background: '#939094' }} />
                        )}
                        {user.stats.review.received.negative > 0 && (
                            <div style={{ flex: user.stats.review.received.negative, background: '#B3261E' }} />
                        )}
                    </div>
                </div>

                {/* Sybil Warning */}
                {sybilFlags && <SybilBadge flags={sybilFlags} />}

                {/* Secret Notes */}
                {address && onSessionKeyChange && (
                    <SecretNotes
                        address={address}
                        sessionKey={sessionKey}
                        onSessionKeyChange={onSessionKeyChange}
                    />
                )}

                {/* Actions */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={onCopyAddress}
                        className="p-2 rounded-full hover:bg-[#49454F] transition-colors text-[#CAC4D0] hover:text-[#E6E1E5]"
                        title="Copy Address"
                    >
                        <Copy size={18} />
                    </button>
                    <a
                        href={profileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-full font-medium text-sm transition-all text-[#1C1B1F] hover:opacity-90 no-underline shadow-sm"
                        style={{ backgroundColor: color }}
                    >
                        View on Ethos
                        <ExternalLink size={14} />
                    </a>
                </div>
            </div>
        </div>
    );
}
