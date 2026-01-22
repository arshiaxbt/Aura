// Ethos types for user profiles and scores

export interface EthosUser {
    profileId?: number;
    displayName: string;
    username?: string;
    avatarUrl?: string;
    score: number | null;
    userkeys?: string[];
    stats: {
        vouch: {
            received: {
                count: number;
                amountWeiTotal: string;
            };
        };
        review: {
            received: {
                positive: number;
                neutral: number;
                negative: number;
            };
        };
    };
}

export interface EthosScore {
    score: number;
}

export interface Vouch {
    authorProfileId: number;
    subjectProfileId: number;
    authorActor: {
        username?: string;
        name?: string;
    };
}

export interface SybilFlags {
    hasCircularVouches: boolean;
    circularVouchCount: number;
    circularVouchPartners: string[];
    suspicionLevel: 'none' | 'low' | 'medium' | 'high';
}

export type ProfileLookupType = 'address' | 'twitter' | 'username';

export function getScoreTier(score: number | null): string {
    if (score === null) return 'unscored';
    if (score >= 2400) return 'renowned';
    if (score >= 2200) return 'revered';
    if (score >= 2000) return 'distinguished';
    if (score >= 1800) return 'exemplary';
    if (score >= 1600) return 'reputable';
    if (score >= 1400) return 'established';
    if (score >= 1200) return 'known';
    if (score >= 1000) return 'neutral';
    if (score >= 800) return 'questionable';
    return 'untrusted';
}

export function formatEthFromWei(weiString: string): string {
    if (!weiString || weiString === '0') return '0 ETH';
    const wei = BigInt(weiString);
    const eth = Number(wei) / 1e18;
    if (eth < 0.001) return '<0.001 ETH';
    return `${eth.toFixed(3)} ETH`;
}
