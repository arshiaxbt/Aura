// Score tier definitions matching Ethos Network
export const SCORE_TIERS = [
    { name: 'untrusted', min: 0, max: 799, color: '#F2B8B5', label: 'UNTRUSTED' },
    { name: 'questionable', min: 800, max: 999, color: '#FFB4AB', label: 'QUESTIONABLE' },
    { name: 'neutral', min: 1000, max: 1199, color: '#938F99', label: 'NEUTRAL' },
    { name: 'known', min: 1200, max: 1399, color: '#CCC2DC', label: 'KNOWN' },
    { name: 'established', min: 1400, max: 1599, color: '#D0BCFF', label: 'ESTABLISHED' },
    { name: 'reputable', min: 1600, max: 1799, color: '#B8C4FF', label: 'REPUTABLE' },
    { name: 'exemplary', min: 1800, max: 1999, color: '#7DD3FC', label: 'EXEMPLARY' },
    { name: 'distinguished', min: 2000, max: 2199, color: '#4ADE80', label: 'DISTINGUISHED' },
    { name: 'revered', min: 2200, max: 2399, color: '#C084FC', label: 'REVERED' },
    { name: 'renowned', min: 2400, max: Infinity, color: '#A78BFA', label: 'RENOWNED' }
];

export const UNSCORED_COLOR = '#71717A';

export type ScoreTier = typeof SCORE_TIERS[number];

export function getTierForScore(score: number | null): ScoreTier | null {
    if (score === null) return null;
    return SCORE_TIERS.find(t => score >= t.min && score <= t.max) || SCORE_TIERS[0];
}

export function getScoreColor(score: number | null): string {
    const tier = getTierForScore(score);
    return tier ? tier.color : UNSCORED_COLOR;
}

export function getScoreLabel(score: number | null): string {
    const tier = getTierForScore(score);
    return tier ? tier.label : 'UNSCORED';
}
