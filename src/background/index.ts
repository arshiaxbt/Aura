// Background service worker for the Aura extension

async function resolveViaEnsData(name: string): Promise<string | null> {
    try {
        const normalized = name.toLowerCase().trim();
        const response = await fetch(`https://api.ensdata.net/${encodeURIComponent(normalized)}`);
        if (!response.ok) {
            console.log('[Aura] ensdata.net returned', response.status, 'for', normalized);
            return null;
        }
        const data = await response.json();
        const address = data?.address;
        if (address && address.startsWith('0x') && address.length === 42) {
            console.log('[Aura] Resolved via ensdata.net:', normalized, '->', address);
            return address;
        }
        return null;
    } catch (error) {
        console.error('[Aura] ensdata.net resolution error:', error);
        return null;
    }
}

async function resolveViaCloudflare(name: string): Promise<string | null> {
    try {
        const normalized = name.toLowerCase().trim();
        const response = await fetch(
            `https://cloudflare-eth.com/dns-query?name=${encodeURIComponent(normalized)}&type=TXT`,
            { headers: { Accept: 'application/dns-json' } }
        );
        if (!response.ok) return null;
        const data = await response.json();
        const answers = data?.Answer || [];
        for (const answer of answers) {
            if (answer.data && answer.data.includes('a=0x')) {
                const match = answer.data.match(/a=(0x[a-fA-F0-9]{40})/);
                if (match) {
                    console.log('[Aura] Resolved via Cloudflare:', normalized, '->', match[1]);
                    return match[1];
                }
            }
        }
        return null;
    } catch (error) {
        console.error('[Aura] Cloudflare resolution error:', error);
        return null;
    }
}

async function resolveName(name: string): Promise<string | null> {
    if (!name) return null;
    const normalized = name.toLowerCase().trim();
    if (!normalized.includes('.')) return null;

    // Try ensdata.net first (works for both ENS and Basenames)
    let address = await resolveViaEnsData(normalized);
    if (address) return address;

    // Fallback to Cloudflare DNS
    address = await resolveViaCloudflare(normalized);
    if (address) return address;

    console.log('[Aura] All resolution methods failed for:', normalized);
    return null;
}

chrome.runtime.onInstalled.addListener(() => {
    console.log('[Aura] Extension installed');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_STATS') {
        sendResponse({ active: true, version: '1.6.0' });
        return true;
    }

    if (message.type === 'CLEAR_CACHE') {
        chrome.storage.local.clear(() => sendResponse({ success: true }));
        return true;
    }

    if (message.type === 'RESOLVE_NAME') {
        const { name } = message;
        if (!name) {
            sendResponse({ address: null });
            return true;
        }
        resolveName(name)
            .then(address => {
                sendResponse({ address });
            })
            .catch(error => {
                console.error('[Aura] Resolution error:', error);
                sendResponse({ address: null });
            });
        return true;
    }

    if (message.type === 'OPEN_NOTE') {
        const { address } = message;
        // Store the address to open in popup
        chrome.storage.local.set({ pendingNoteAddress: address }, () => {
            // Open the popup - this will trigger the popup to check for pending note
            chrome.action.openPopup().catch(() => {
                // Fallback: create a notification or just store for next popup open
                console.log('[Aura] Could not open popup automatically, address saved for next open');
            });
        });
        sendResponse({ success: true });
        return true;
    }

    return true;
});

console.log('[Aura] Background service worker started (v1.6.0 - Secret Notes)');

export { };
