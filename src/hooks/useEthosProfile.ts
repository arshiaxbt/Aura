import { useState, useCallback, useEffect } from 'react';
import type { EthosUser, EthosScore, Vouch, SybilFlags, ProfileLookupType } from '~/types/ethos';

interface ProfileState {
    user: EthosUser | null;
    score: EthosScore | null;
    vouchesReceived: Vouch[];
    vouchesGiven: Vouch[];
    sybilFlags: SybilFlags;
    loading: boolean;
    error: string | null;
    notFound: boolean;
}

const initialState: ProfileState = {
    user: null,
    score: null,
    vouchesReceived: [],
    vouchesGiven: [],
    sybilFlags: {
        hasCircularVouches: false,
        circularVouchCount: 0,
        circularVouchPartners: [],
        suspicionLevel: 'none'
    },
    loading: false,
    error: null,
    notFound: false
};

async function fetchApi<T>(endpoint: string): Promise<T | null> {
    try {
        const response = await fetch(`https://api.ethos.network/api/v2${endpoint}`, {
            method: 'GET',
            headers: {
                'X-Ethos-Client': 'aura-chrome-extension@1.0.0',
                'Content-Type': 'application/json'
            }
        });
        if (response.status === 404) return null;
        if (!response.ok) throw new Error(`API error: ${response.status}`);
        return await response.json();
    } catch (e) {
        console.error('[Aura] API request failed:', e);
        throw e;
    }
}

function detectSybilFlags(vouchesReceived: Vouch[], vouchesGiven: Vouch[], profileId: number): SybilFlags {
    const givenSet = new Set(vouchesGiven.map(v => v.subjectProfileId));
    const partners: string[] = [];
    let circularCount = 0;

    for (const vouch of vouchesReceived) {
        if (givenSet.has(vouch.authorProfileId)) {
            circularCount++;
            partners.push(vouch.authorActor.username || vouch.authorActor.name || 'Unknown');
        }
    }

    const totalReceived = vouchesReceived.length;
    let suspicionLevel: 'none' | 'low' | 'medium' | 'high' = 'none';

    if (circularCount > 0) {
        const ratio = circularCount / Math.max(totalReceived, 1);
        suspicionLevel = ratio >= 0.5 || circularCount >= 5 ? 'high'
            : ratio >= 0.3 || circularCount >= 3 ? 'medium'
                : 'low';
    }

    return {
        hasCircularVouches: circularCount > 0,
        circularVouchCount: circularCount,
        circularVouchPartners: partners,
        suspicionLevel
    };
}

export function useEthosProfile(identifier: string | null, type: ProfileLookupType = 'address') {
    const [state, setState] = useState<ProfileState>(initialState);

    const fetchProfile = useCallback(async () => {
        if (!identifier) {
            setState(initialState);
            return;
        }

        setState(prev => ({ ...prev, loading: true, error: null, notFound: false }));

        try {
            let endpoint: string;
            switch (type) {
                case 'twitter':
                    endpoint = `/user/by/x/${encodeURIComponent(identifier)}`;
                    break;
                case 'username':
                    endpoint = `/user/by/username/${encodeURIComponent(identifier)}`;
                    break;
                default:
                    endpoint = `/user/by/address/${encodeURIComponent(identifier)}`;
            }

            const user = await fetchApi<EthosUser>(endpoint);

            if (!user) {
                setState({ ...initialState, notFound: true, loading: false });
                return;
            }

            let score: EthosScore | null = null;
            if (user.score !== undefined) {
                score = { score: user.score };
            } else if (type === 'address') {
                score = await fetchApi<EthosScore>(`/score/address?address=${identifier}`);
            }

            let vouchesReceived: Vouch[] = [];
            let vouchesGiven: Vouch[] = [];

            if (user.profileId) {
                const receivedRes = await fetchApi<{ values: Vouch[] }>(`/vouches?subjectProfileId=${user.profileId}&limit=100`);
                vouchesReceived = receivedRes?.values || [];

                const givenRes = await fetchApi<{ values: Vouch[] }>(`/vouches?authorProfileId=${user.profileId}&limit=100`);
                vouchesGiven = givenRes?.values || [];
            }

            const sybilFlags = user.profileId
                ? detectSybilFlags(vouchesReceived, vouchesGiven, user.profileId)
                : initialState.sybilFlags;

            setState({
                user,
                score,
                vouchesReceived,
                vouchesGiven,
                sybilFlags,
                loading: false,
                error: null,
                notFound: false
            });
        } catch (e) {
            setState({
                ...initialState,
                loading: false,
                error: e instanceof Error ? e.message : 'Failed to fetch profile'
            });
        }
    }, [identifier, type]);

    useEffect(() => {
        fetchProfile();
    }, [fetchProfile]);

    return { ...state, refetch: fetchProfile };
}

export function useEthosScore(address: string | null) {
    const [score, setScore] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [notFound, setNotFound] = useState(false);

    useEffect(() => {
        if (!address) {
            setScore(null);
            return;
        }

        setLoading(true);
        setNotFound(false);

        fetchApi<EthosScore>(`/score/address?address=${address}`)
            .then(res => {
                if (res) setScore(res.score);
                else setNotFound(true);
            })
            .catch(() => setNotFound(true))
            .finally(() => setLoading(false));
    }, [address]);

    return { score, loading, notFound };
}
