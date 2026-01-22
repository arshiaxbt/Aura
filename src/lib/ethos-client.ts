// Ethos Network API client for content scripts
const API_BASE = 'https://api.ethos.network/api/v2';
const CLIENT_HEADER = 'aura-chrome-extension@1.0.0';

interface CacheEntry<T> {
    data: T;
    expiresAt: number;
}

const cache = new Map<string, CacheEntry<any>>();
const TTL = {
    score: 300000,  // 5 minutes
    user: 600000    // 10 minutes
};

function getFromCache<T>(key: string): T | null {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        cache.delete(key);
        return null;
    }
    return entry.data;
}

function setCache<T>(key: string, data: T, ttl: number): void {
    // Cleanup if cache too large
    if (cache.size > 500) {
        const now = Date.now();
        for (const [k, v] of cache.entries()) {
            if (now > v.expiresAt) cache.delete(k);
        }
        // If still too large, remove oldest
        if (cache.size > 500) {
            const sorted = Array.from(cache.entries())
                .sort((a, b) => a[1].expiresAt - b[1].expiresAt);
            for (const [k] of sorted.slice(0, cache.size - 500)) {
                cache.delete(k);
            }
        }
    }
    cache.set(key, { data, expiresAt: Date.now() + ttl });
}

async function apiRequest<T>(endpoint: string): Promise<{ data: T | null; error?: string }> {
    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            method: 'GET',
            headers: {
                'X-Ethos-Client': CLIENT_HEADER,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            if (response.status === 404) {
                return { data: null, error: 'not_found' };
            }
            throw new Error(`API error: ${response.status}`);
        }

        return { data: await response.json() };
    } catch (e) {
        console.error('[Aura] API request failed:', e);
        return { data: null, error: String(e) };
    }
}

export interface ScoreResponse {
    score: number;
}

export interface UserResponse {
    profileId?: number;
    displayName?: string;
    username?: string;
    avatarUrl?: string;
    score?: number;
}

export async function getScoreByAddress(address: string): Promise<ScoreResponse | null> {
    const key = `score:${address.toLowerCase()}`;
    const cached = getFromCache<ScoreResponse>(key);
    if (cached) return cached;

    const result = await apiRequest<ScoreResponse>(`/score/address?address=${address}`);
    if (result.data && !result.error) {
        setCache(key, result.data, TTL.score);
        return result.data;
    }
    return null;
}

export async function getUserByAddress(address: string): Promise<UserResponse | null> {
    const key = `user:address:${address.toLowerCase()}`;
    const cached = getFromCache<UserResponse>(key);
    if (cached) return cached;

    const result = await apiRequest<UserResponse>(`/user/by/address/${address}`);
    if (result.data && !result.error) {
        setCache(key, result.data, TTL.user);
        return result.data;
    }
    return null;
}

export async function getUserByTwitter(handle: string): Promise<UserResponse | null> {
    const key = `user:twitter:${handle.toLowerCase()}`;
    const cached = getFromCache<UserResponse>(key);
    if (cached) return cached;

    const result = await apiRequest<UserResponse>(`/user/by/x/${handle}`);
    if (result.data && !result.error) {
        setCache(key, result.data, TTL.user);
        return result.data;
    }
    return null;
}

export function clearCache(): void {
    cache.clear();
}
