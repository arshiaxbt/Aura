import type { PlasmoCSConfig } from 'plasmo';
import { getScoreByAddress, getUserByAddress } from '~/lib/ethos-client';
import { SCORE_TIERS, UNSCORED_COLOR, getTierForScore, getScoreColor } from '~/lib/constants';
import { encrypt, decrypt, verifyPassword, VAULT_KEYS, getNoteKey } from '~/lib/crypto';

export const config: PlasmoCSConfig = {
  matches: ['<all_urls>'],
  run_at: 'document_idle'
};

// Regex patterns
const PATTERNS = {
  ethAddress: /0x[a-fA-F0-9]{40}/g,
  baseName: /\b[a-zA-Z0-9][a-zA-Z0-9-]{0,}\.base\.eth\b/gi,
  ensName: /\b[a-zA-Z0-9][a-zA-Z0-9-]{2,}\.eth\b/gi
};

// State
const processedNodes = new WeakSet<Node>();
const identifierData = new Map<string, IdentifierInfo>();
const targetElements = new Map<string, HTMLElement[]>();
let overlayRoot: HTMLElement | null = null;
let currentHover: { element: HTMLElement; identifier: string } | null = null;
let isTooltipHovered = false;
let isTargetHovered = false;
let hideTimeout: ReturnType<typeof setTimeout> | null = null;

// Vault session state
let vaultSessionKey: string | null = null;
let noteSaveTimeout: ReturnType<typeof setTimeout> | null = null;

// Load vault session from storage (use local storage as session storage is not available in content scripts)
async function loadVaultSession(): Promise<void> {
  try {
    const result = await chrome.storage.local.get(['vaultSession']);
    if (result.vaultSession) {
      const { key, expiresAt } = result.vaultSession;
      if (Date.now() < expiresAt) {
        vaultSessionKey = key;
        console.log('[Aura] Vault session loaded, expires in', Math.round((expiresAt - Date.now()) / 60000), 'minutes');
      } else {
        // Session expired, clear it
        vaultSessionKey = null;
        await chrome.storage.local.remove(['vaultSession']);
        console.log('[Aura] Vault session expired, cleared');
      }
    } else {
      vaultSessionKey = null;
    }
  } catch (e) {
    console.log('[Aura] Could not load vault session:', e);
  }
}

// Load note for an address
async function loadNoteForAddress(address: string): Promise<string> {
  if (!vaultSessionKey) return '';
  try {
    const noteKey = getNoteKey(address);
    const result = await chrome.storage.sync.get([noteKey]);
    if (result[noteKey]) {
      return await decrypt(result[noteKey], vaultSessionKey);
    }
  } catch (e) {
    console.log('[Aura] Could not load note:', e);
  }
  return '';
}

// Save note for an address
async function saveNoteForAddress(address: string, content: string): Promise<boolean> {
  if (!vaultSessionKey) return false;
  try {
    const noteKey = getNoteKey(address);
    if (content.trim()) {
      const encrypted = await encrypt(content, vaultSessionKey);
      await chrome.storage.sync.set({ [noteKey]: encrypted });
    } else {
      await chrome.storage.sync.remove([noteKey]);
    }
    return true;
  } catch (e) {
    console.log('[Aura] Could not save note:', e);
    return false;
  }
}

interface IdentifierInfo {
  identifier: string;
  type: 'eth' | 'ens' | 'base';
  score: number | null;
  tier: string;
  resolvedAddress?: string;
  ethosName?: string;
  avatarUrl?: string;
  fetched?: boolean; // true when API has been called (even if no profile found)
}

// HTML escaping
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Resolve ENS/Basename via background script
async function resolveName(name: string): Promise<string | null> {
  try {
    console.log(`[Aura] Requesting background resolution for: ${name}`);
    const response = await chrome.runtime.sendMessage({
      type: 'RESOLVE_NAME',
      name
    });
    if (response?.address) {
      console.log(`[Aura] Background resolved ${name} -> ${response.address}`);
      return response.address;
    }
  } catch (e) {
    console.error(`[Aura] Resolution messaging failed for ${name}:`, e);
  }
  return null;
}

// Try to unlock vault from inline password input
async function tryUnlockVault(
  passwordInput: HTMLInputElement,
  errorEl: HTMLElement | null,
  vaultUnlock: HTMLElement | null,
  element: HTMLElement,
  data: IdentifierInfo
): Promise<void> {
  const password = passwordInput.value;
  if (!password) {
    if (errorEl) errorEl.textContent = 'Enter password';
    return;
  }

  try {
    const result = await chrome.storage.sync.get([VAULT_KEYS.VALIDATOR]);
    if (result[VAULT_KEYS.VALIDATOR]) {
      const isValid = await verifyPassword(result[VAULT_KEYS.VALIDATOR], password);
      if (isValid) {
        // Update session locally
        vaultSessionKey = password;
        // Store session with expiry (1 hour) using local storage
        const SESSION_TIMEOUT_MS = 60 * 60 * 1000;
        await chrome.storage.local.set({
          vaultSession: {
            key: password,
            expiresAt: Date.now() + SESSION_TIMEOUT_MS
          }
        });
        console.log('[Aura] Vault unlocked from hover, session stored');
        // Keep hover state active during re-render
        isTooltipHovered = true;
        isTargetHovered = true;
        if (hideTimeout) {
          clearTimeout(hideTimeout);
          hideTimeout = null;
        }
        // Re-render tooltip with note input
        await showTooltip(element, data);
      } else {
        if (errorEl) errorEl.textContent = 'Wrong password';
      }
    } else {
      if (errorEl) errorEl.textContent = 'No vault set up';
    }
  } catch (e) {
    console.error('[Aura] Vault unlock failed:', e);
    if (errorEl) errorEl.textContent = 'Error unlocking';
  }
}

// Show tooltip
async function showTooltip(element: HTMLElement, data: IdentifierInfo): Promise<void> {
  console.log('[Aura] showTooltip called with data:', JSON.stringify(data));
  if (!overlayRoot) return;

  const shadow = overlayRoot.shadowRoot;
  if (!shadow) return;

  const container = shadow.querySelector('.aura-tooltip-container') as HTMLElement;
  const tooltip = shadow.querySelector('.aura-tooltip') as HTMLElement;
  if (!container || !tooltip) return;

  const rect = element.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const color = getScoreColor(data.score);

  tooltip.style.setProperty('--aura-primary', color);

  const tier = SCORE_TIERS.find(t => t.name === data.tier);
  const tierLabel = tier ? tier.label : 'UNSCORED';
  const scoreDisplay = data.score !== null ? data.score : '—';
  const scoreProgress = data.score !== null ? data.score : 0;
  const circumference = 2 * Math.PI * 26;
  const addressForNote = data.resolvedAddress || data.identifier;

  const displayName = data.ethosName || (data.identifier.length > 20
    ? data.identifier.slice(0, 10) + '...' + data.identifier.slice(-8)
    : data.identifier);
  const escapedName = escapeHtml(displayName);

  const subtitle = data.ethosName
    ? (data.identifier.length > 20
      ? data.identifier.slice(0, 10) + '...' + data.identifier.slice(-8)
      : data.identifier)
    : null;
  const escapedSubtitle = subtitle ? escapeHtml(subtitle) : null;

  const avatarUrl = data.avatarUrl && /^https?:\/\//i.test(data.avatarUrl)
    ? escapeHtml(data.avatarUrl)
    : null;
  const escapedId = escapeHtml(data.identifier);

  const avatarHtml = avatarUrl
    ? `<img src="${avatarUrl}" class="aura-avatar" onerror="this.style.display='none';this.parentElement.innerHTML='<div class=\\'aura-score-text\\'><div class=\\'aura-score-val\\'>${scoreDisplay}</div><div class=\\'aura-tier-label-small\\'>${tierLabel}</div></div>';"/>`
    : `<div class="aura-score-text">
         <div class="aura-score-val">${scoreDisplay}</div>
         <div class="aura-tier-label-small">${tierLabel}</div>
       </div>`;

  const badgeText = avatarUrl ? `${scoreDisplay} • ${tierLabel}` : tierLabel;

  // Check if vault is unlocked for inline notes
  const hasVaultSession = !!vaultSessionKey;

  // Check if vault has been set up (has validator)
  let hasVaultSetup = false;
  try {
    const stored = await chrome.storage.sync.get([VAULT_KEYS.VALIDATOR]);
    hasVaultSetup = !!stored[VAULT_KEYS.VALIDATOR];
  } catch (e) {
    console.log('[Aura] Could not check vault setup status');
  }

  tooltip.innerHTML = `
    <div class="aura-header">
      <div class="aura-ring-container">
        <svg class="aura-ring-svg" viewBox="0 0 56 56">
          <circle class="aura-ring-circle" cx="28" cy="28" r="26"></circle>
          <circle class="aura-ring-value" cx="28" cy="28" r="26"
            stroke-dasharray="${circumference}"
            stroke-dashoffset="${circumference - (Math.min(100, Math.max(0, scoreProgress / 24)) / 100) * circumference}">
          </circle>
        </svg>
        ${avatarHtml}
      </div>
      <div class="aura-content">
        <div class="aura-title" title="${escapedId}">${escapedName}</div>
        ${escapedSubtitle ? `<div class="aura-subtitle" title="${escapedId}">${escapedSubtitle}</div>` : ''}
        <div class="aura-badge">${badgeText}</div>
      </div>
    </div>
    ${hasVaultSession ? `
    <div class="aura-note-section" data-address="${escapeHtml(addressForNote)}">
      <textarea class="aura-note-input" placeholder="Quick note..." rows="2"></textarea>
      <div class="aura-note-status"></div>
    </div>
    ` : `
    <div class="aura-vault-unlock" data-address="${escapeHtml(addressForNote)}">
      ${hasVaultSetup ? `
      <div class="aura-vault-header">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
        <span>Unlock to add note</span>
      </div>
      <div class="aura-vault-form">
        <input type="password" class="aura-vault-password" placeholder="Password" />
        <button class="aura-vault-unlock-btn" title="Unlock">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>
          </svg>
        </button>
      </div>
      <div class="aura-vault-error"></div>
      ` : `
      <div class="aura-vault-setup-prompt">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
        </svg>
        <span>Create vault in extension to add notes</span>
      </div>
      `}
    </div>
    `}
    <div class="aura-divider"></div>
    <div class="aura-action">
      <a class="aura-button" href="https://app.ethos.network/profile/${encodeURIComponent(data.resolvedAddress || data.identifier)}" target="_blank" rel="noopener">
        View on Ethos
      </a>
    </div>
  `;

  // Handle inline notes if vault is unlocked
  if (hasVaultSession) {
    const noteSection = tooltip.querySelector('.aura-note-section') as HTMLElement;
    const noteInput = tooltip.querySelector('.aura-note-input') as HTMLTextAreaElement;
    const noteStatus = tooltip.querySelector('.aura-note-status') as HTMLElement;

    if (noteSection && noteInput && noteStatus) {
      const noteAddress = noteSection.dataset.address || '';

      // Load existing note
      loadNoteForAddress(noteAddress).then(existingNote => {
        noteInput.value = existingNote;
      });

      // Handle note changes with debounced save
      noteInput.addEventListener('input', () => {
        noteStatus.textContent = '';
        if (noteSaveTimeout) clearTimeout(noteSaveTimeout);
        noteSaveTimeout = setTimeout(async () => {
          noteStatus.textContent = 'Saving...';
          const saved = await saveNoteForAddress(noteAddress, noteInput.value);
          noteStatus.textContent = saved ? 'Saved' : 'Error';
          setTimeout(() => { noteStatus.textContent = ''; }, 1500);
        }, 800);
      });

      // Prevent tooltip from closing when typing
      noteInput.addEventListener('focus', () => {
        isTooltipHovered = true;
        if (hideTimeout) {
          clearTimeout(hideTimeout);
          hideTimeout = null;
        }
      });
    }
  } else {
    // Add handlers for inline vault unlock
    const vaultUnlock = tooltip.querySelector('.aura-vault-unlock') as HTMLElement;
    const passwordInput = tooltip.querySelector('.aura-vault-password') as HTMLInputElement;
    const unlockBtn = tooltip.querySelector('.aura-vault-unlock-btn');
    const vaultError = tooltip.querySelector('.aura-vault-error') as HTMLElement;

    if (passwordInput) {
      // Keep tooltip open when typing password
      passwordInput.addEventListener('focus', () => {
        isTooltipHovered = true;
        if (hideTimeout) {
          clearTimeout(hideTimeout);
          hideTimeout = null;
        }
      });

      // Handle unlock on Enter
      passwordInput.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
          await tryUnlockVault(passwordInput, vaultError, vaultUnlock, element, data);
        }
      });
    }

    if (unlockBtn && passwordInput) {
      unlockBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await tryUnlockVault(passwordInput, vaultError, vaultUnlock, element, data);
      });
    }
  }

  // Position tooltip
  let left = rect.left + rect.width / 2 - 160 - 24;
  let top = rect.top - 160 - 48;

  if (left + 320 + 48 > viewportWidth - 10) left = viewportWidth - 320 - 48 - 10;
  if (left < 10) left = 10;
  if (top < 10) top = rect.bottom - 24 + 8;

  container.style.transform = `translate(${left}px, ${top}px)`;
  tooltip.classList.add('visible');
}

// Show loading tooltip
function showLoadingTooltip(element: HTMLElement, identifier: string): void {
  if (!overlayRoot) return;

  const shadow = overlayRoot.shadowRoot;
  if (!shadow) return;

  const container = shadow.querySelector('.aura-tooltip-container') as HTMLElement;
  const tooltip = shadow.querySelector('.aura-tooltip') as HTMLElement;
  if (!container || !tooltip) return;

  tooltip.style.setProperty('--aura-primary', '#e4e4e7');
  const shortId = identifier.length > 20
    ? identifier.slice(0, 10) + '...' + identifier.slice(-6)
    : identifier;

  tooltip.innerHTML = `
    <div class="aura-header">
      <div class="aura-ring-container">
        <svg class="aura-ring-svg" viewBox="0 0 56 56">
          <circle class="aura-ring-circle" cx="28" cy="28" r="26" style="opacity: 0.3"></circle>
          <circle class="aura-ring-value" cx="28" cy="28" r="26" 
            stroke-dasharray="163.36" 
            stroke-dashoffset="120"
            style="animation: spin 1s linear infinite; transform-origin: center;">
          </circle>
        </svg>
      </div>
      <div class="aura-content">
        <div class="aura-subtitle" style="margin-bottom: 2px;">Resolving...</div>
        <div class="aura-title" style="opacity: 0.7;">${shortId}</div>
      </div>
    </div>
  `;

  const rect = element.getBoundingClientRect();
  let left = rect.left - 24;
  let top = rect.top - 120;
  if (top < 0) top = rect.bottom - 24;

  container.style.transform = `translate(${left}px, ${top}px)`;
  tooltip.classList.add('visible');

  // Add spin animation if not present
  if (!shadow.querySelector('#aura-spin-style')) {
    const style = document.createElement('style');
    style.id = 'aura-spin-style';
    style.textContent = '@keyframes spin { 100% { transform: rotate(360deg); } }';
    shadow.appendChild(style);
  }
}

// Hide tooltip
function hideTooltip(): void {
  if (!overlayRoot) return;

  const shadow = overlayRoot.shadowRoot;
  if (!shadow) return;

  const container = shadow.querySelector('.aura-tooltip-container') as HTMLElement;
  const tooltip = shadow.querySelector('.aura-tooltip') as HTMLElement;

  if (tooltip) tooltip.classList.remove('visible');
  if (container) {
    setTimeout(() => {
      if (tooltip && !tooltip.classList.contains('visible')) {
        container.style.transform = 'translate(-9999px, -9999px)';
      }
    }, 200);
  }
}

// Queue for scoring
const scoreQueue: Array<{ identifier: string; type: 'eth' | 'ens' | 'base' }> = [];
let scoreTimeout: ReturnType<typeof setTimeout> | null = null;

function queueForScoring(identifier: string, type: 'eth' | 'ens' | 'base'): void {
  const id = identifier.toLowerCase();
  if (!scoreQueue.some(q => q.identifier.toLowerCase() === id)) {
    scoreQueue.push({ identifier, type });
    if (scoreTimeout) clearTimeout(scoreTimeout);
    scoreTimeout = setTimeout(processScoreQueue, 150);
  }
}

async function processScoreQueue(): Promise<void> {
  if (scoreQueue.length === 0) return;

  const batch = scoreQueue.splice(0, 30);
  console.log(`[Aura] Scoring ${batch.length} identifiers`);

  for (const item of batch) {
    const key = item.identifier.toLowerCase();
    let addressToScore = item.identifier;

    // Resolve names first
    if (item.type === 'ens' || item.type === 'base') {
      console.log(`[Aura] Resolving name: ${item.identifier} (type: ${item.type})`);
      const resolved = await resolveName(item.identifier);
      if (resolved) {
        addressToScore = resolved;
        const data = identifierData.get(key);
        if (data) data.resolvedAddress = resolved;
        console.log(`[Aura] ✓ Resolved ${item.identifier} → ${resolved}`);
      } else {
        console.log(`[Aura] ✗ Failed to resolve ${item.identifier}`);
        updateScore(key, null);
        continue;
      }
    }

    try {
      console.log(`[Aura] Fetching score for address: ${addressToScore}`);
      const scoreResult = await getScoreByAddress(addressToScore);
      console.log(`[Aura] Score API response for ${key}:`, JSON.stringify(scoreResult));
      const score = scoreResult?.score ?? null;
      console.log(`[Aura] Extracted score value: ${score}`);
      updateScore(key, score);

      // Get profile data
      const userResult = await getUserByAddress(addressToScore);
      if (userResult) {
        const data = identifierData.get(key);
        if (data) {
          data.ethosName = userResult.displayName || userResult.username || undefined;
          data.avatarUrl = userResult.avatarUrl || undefined;
          console.log(`[Aura] Updated profile data for ${key}: name=${data.ethosName}, score=${data.score}`);

          // Fallback score from user profile
          if (data.score === null && userResult.score !== undefined) {
            console.log(`[Aura] Using fallback score from user profile: ${userResult.score}`);
            data.score = userResult.score;
            data.tier = getTierForScore(userResult.score)?.name || 'unscored';
            const elements = targetElements.get(key) || [];
            for (const el of elements) {
              el.className = `aura-target ${data.tier}`;
            }
          }
        }
      }
    } catch (e) {
      console.error(`[Aura] Score fetch failed for ${addressToScore}:`, e);
      updateScore(key, null);
    }
  }

  if (scoreQueue.length > 0) {
    scoreTimeout = setTimeout(processScoreQueue, 150);
  }
}

function updateScore(key: string, score: number | null): void {
  const id = key.toLowerCase();
  const tier = getTierForScore(score);
  const tierName = tier ? tier.name : 'unscored';

  const data = identifierData.get(id);
  if (data) {
    data.score = score;
    data.tier = tierName;
    data.fetched = true; // Mark as fetched
  }

  const elements = targetElements.get(id) || [];
  for (const el of elements) {
    el.className = `aura-target ${tierName}`;
  }

  // Update tooltip if hovering (show even if score is null, as long as data was fetched)
  if (currentHover?.identifier === id && data && data.fetched) {
    showTooltip(currentHover.element, data);
  }
}

// Create target span
function createTargetSpan(text: string, type: 'eth' | 'ens' | 'base'): HTMLElement {
  const span = document.createElement('span');
  span.className = 'aura-target unscored';
  span.dataset.auraId = text.toLowerCase();
  span.dataset.auraType = type;
  span.textContent = text;

  span.addEventListener('mouseenter', () => {
    isTargetHovered = true;
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }

    const id = text.toLowerCase();
    currentHover = { element: span, identifier: id };

    const data = identifierData.get(id);
    console.log(`[Aura] Hover on ${id}, current data:`, data ? JSON.stringify(data) : 'null');

    if (data && data.fetched) {
      // Data has been fetched, show tooltip (even if score is null = no Ethos profile)
      showTooltip(span, data);
    } else {
      // Still loading or not yet fetched
      showLoadingTooltip(span, text);
      processScoreQueue();
    }
  });

  span.addEventListener('mouseleave', () => {
    isTargetHovered = false;
    if (hideTimeout) clearTimeout(hideTimeout);
    hideTimeout = setTimeout(() => {
      if (!isTooltipHovered && !isTargetHovered) {
        hideTooltip();
        currentHover = null;
      }
      hideTimeout = null;
    }, 200);
  });

  return span;
}

// Process text node
function processTextNode(node: Text): void {
  if (processedNodes.has(node)) return;

  const text = node.textContent || '';
  if (!text.trim()) return;

  const parent = node.parentNode as Element;
  if (!parent) return;

  const tagName = parent.tagName?.toLowerCase();
  if (['script', 'style', 'textarea', 'input', 'noscript'].includes(tagName)) return;
  if (parent.classList?.contains('aura-target')) return;
  if ((parent as HTMLElement).isContentEditable) return;

  interface Match {
    text: string;
    index: number;
    type: 'eth' | 'ens' | 'base';
  }

  const matches: Match[] = [];

  // Find ETH addresses
  let match: RegExpExecArray | null;
  const ethRegex = new RegExp(PATTERNS.ethAddress.source, 'g');
  while ((match = ethRegex.exec(text)) !== null) {
    matches.push({ text: match[0], index: match.index, type: 'eth' });
  }

  // Find Basenames
  const baseRegex = new RegExp(PATTERNS.baseName.source, 'gi');
  while ((match = baseRegex.exec(text)) !== null) {
    matches.push({ text: match[0], index: match.index, type: 'base' });
  }

  // Find ENS names (excluding basenames)
  const ensRegex = new RegExp(PATTERNS.ensName.source, 'gi');
  while ((match = ensRegex.exec(text)) !== null) {
    if (match[0].endsWith('.base.eth')) continue;
    const overlaps = matches.some(m =>
      (match!.index >= m.index && match!.index < m.index + m.text.length) ||
      (m.index >= match!.index && m.index < match!.index + match![0].length)
    );
    if (!overlaps) {
      matches.push({ text: match[0], index: match.index, type: 'ens' });
    }
  }

  if (matches.length === 0) return;

  processedNodes.add(node);
  matches.sort((a, b) => b.index - a.index);

  let remaining = text;
  const fragments: Node[] = [];

  for (const m of matches) {
    // Text after match
    const after = remaining.slice(m.index + m.text.length);
    if (after) fragments.unshift(document.createTextNode(after));

    // Create target span
    const span = createTargetSpan(m.text, m.type);
    fragments.unshift(span);

    // Track element
    const id = m.text.toLowerCase();
    if (!targetElements.has(id)) targetElements.set(id, []);
    targetElements.get(id)!.push(span);

    // Initialize data
    if (!identifierData.has(id)) {
      identifierData.set(id, {
        identifier: m.text,
        type: m.type,
        score: null,
        tier: 'unscored'
      });
    }

    // Queue for scoring
    queueForScoring(m.text, m.type);

    remaining = remaining.slice(0, m.index);
  }

  if (remaining) fragments.unshift(document.createTextNode(remaining));

  const fragment = document.createDocumentFragment();
  fragments.forEach(f => fragment.appendChild(f));
  parent.replaceChild(fragment, node);
}

// Scan DOM tree
function scanDOM(root: Element = document.body): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      if (!node.textContent?.trim()) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      const tag = parent.tagName?.toLowerCase();
      if (['script', 'style', 'noscript', 'textarea', 'input'].includes(tag)) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const nodes: Text[] = [];
  let current: Text | null;
  while ((current = walker.nextNode() as Text)) {
    nodes.push(current);
  }

  // Process in batches
  let index = 0;
  function processBatch(): void {
    const end = Math.min(index + 50, nodes.length);
    for (let i = index; i < end; i++) {
      processTextNode(nodes[i]);
    }
    index = end;
    if (index < nodes.length) {
      requestAnimationFrame(processBatch);
    }
  }
  processBatch();
}

// Inject styles
function injectStyles(): void {
  if (document.getElementById('aura-target-styles')) return;

  const style = document.createElement('style');
  style.id = 'aura-target-styles';

  const tierStyles = SCORE_TIERS.map(tier => `
    .aura-target.${tier.name}::after { border: 1px solid ${tier.color}66; }
    .aura-target.${tier.name}:hover { background-color: ${tier.color}1A; }
  `).join('\n');

  style.textContent = `
    .aura-target {
      position: relative;
      cursor: pointer;
      border-radius: 3px;
      transition: background-color 0.15s ease;
    }
    
    .aura-target::after {
      content: '';
      position: absolute;
      inset: -1px -2px;
      border-radius: 4px;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.15s ease;
    }
    
    .aura-target:hover::after {
      opacity: 1;
    }
    
    .aura-target.unscored::after { border: 1px dashed ${UNSCORED_COLOR}66; }
    .aura-target.unscored:hover { background-color: ${UNSCORED_COLOR}1A; }
    
    ${tierStyles}
    
    body.aura-xray-active *:not(.aura-target):not(script):not(style) {
      opacity: 0.15 !important;
      filter: grayscale(100%) !important;
    }
    body.aura-xray-active .aura-target {
      opacity: 1 !important;
      filter: none !important;
      position: relative;
      z-index: 1000;
    }
  `;

  document.head.appendChild(style);
}

// Create overlay
function createOverlay(): void {
  if (overlayRoot) return;

  const host = document.createElement('div');
  host.id = 'aura-global-overlay';

  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    :host {
      all: initial;
      display: block;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 2147483647;
      pointer-events: none;
      
      --md-sys-color-surface: #1b1b1f;
      --md-sys-color-surface-container: #202125;
      --md-sys-color-on-surface: #e3e2e6;
      --md-sys-color-on-surface-variant: #c4c6d0;
      --md-sys-shape-corner: 16px;
      --md-sys-elevation-3: 0px 1px 3px 0px rgba(0, 0, 0, 0.3), 0px 4px 8px 3px rgba(0, 0, 0, 0.15);
      
      --aura-primary: #ffffff;
      --aura-primary-10: rgba(255, 255, 255, 0.1);
      --aura-primary-20: rgba(255, 255, 255, 0.2);
      
      font-family: 'Roboto', 'Segoe UI', system-ui, -apple-system, sans-serif;
    }
    
    .aura-tooltip-container {
      position: absolute;
      pointer-events: auto;
      padding: 24px;
      transition: transform 0.2s cubic-bezier(0.2, 0.0, 0, 1.0);
    }
    
    .aura-tooltip {
      background: var(--md-sys-color-surface-container);
      color: var(--md-sys-color-on-surface);
      padding: 16px;
      border-radius: var(--md-sys-shape-corner);
      box-shadow: var(--md-sys-elevation-3);
      min-width: 280px;
      max-width: 320px;
      overflow: hidden;
      opacity: 0;
      transform: scale(0.9) translateY(10px);
      transform-origin: top center;
      transition: opacity 0.15s linear, transform 0.2s cubic-bezier(0.2, 0.0, 0, 1.0);
      display: flex;
      flex-direction: column;
      gap: 12px;
      border: 1px solid rgba(255,255,255,0.08);
      box-sizing: border-box;
    }
    
    .aura-tooltip.visible {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
    
    .aura-header {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    
    .aura-ring-container {
      position: relative;
      width: 56px;
      height: 56px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .aura-ring-svg {
      width: 100%;
      height: 100%;
      transform: rotate(-90deg);
    }
    
    .aura-ring-circle {
      fill: none;
      stroke-width: 3;
      stroke: var(--aura-primary-20);
    }
    
    .aura-ring-value {
      fill: none;
      stroke-width: 3;
      stroke: var(--aura-primary);
      stroke-linecap: round;
      filter: drop-shadow(0 0 4px var(--aura-primary));
      transition: stroke-dashoffset 0.5s ease-out;
    }
    
    .aura-avatar {
      position: absolute;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      object-fit: cover;
      border: 2px solid var(--aura-primary);
    }
    
    .aura-score-text {
      position: absolute;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      line-height: 1;
    }
    
    .aura-score-val {
      font-size: 16px;
      font-weight: 700;
      color: var(--md-sys-color-on-surface);
    }
    
    .aura-tier-label-small {
      font-size: 8px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 2px;
      color: var(--aura-primary);
    }
    
    .aura-content {
      flex: 1;
      min-width: 0;
    }
    
    .aura-title {
      font-size: 16px;
      font-weight: 500;
      color: var(--md-sys-color-on-surface);
      margin-bottom: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .aura-subtitle {
      font-size: 12px;
      color: var(--md-sys-color-on-surface-variant);
      margin-bottom: 6px;
    }
    
    .aura-badge {
      display: inline-flex;
      align-items: center;
      padding: 4px 8px;
      border-radius: 8px;
      background: var(--aura-primary-10);
      color: var(--aura-primary);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    
    .aura-note-section {
      display: flex;
      flex-direction: column;
      gap: 4px;
      width: 100%;
      box-sizing: border-box;
    }

    .aura-note-input {
      width: 100%;
      min-height: 48px;
      padding: 8px 10px;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.15);
      background: rgba(0,0,0,0.3);
      color: var(--md-sys-color-on-surface);
      font-size: 12px;
      font-family: inherit;
      resize: none;
      outline: none;
      transition: border-color 0.15s;
      box-sizing: border-box;
    }

    .aura-note-input:focus {
      border-color: #D0BCFF;
    }

    .aura-note-input::placeholder {
      color: rgba(255,255,255,0.4);
    }

    .aura-note-status {
      font-size: 10px;
      color: rgba(255,255,255,0.5);
      min-height: 14px;
      text-align: right;
    }

    .aura-vault-unlock {
      padding: 8px 0;
    }

    .aura-vault-header {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: rgba(255,255,255,0.6);
      margin-bottom: 8px;
    }

    .aura-vault-header svg {
      color: #F2B8B5;
    }

    .aura-vault-form {
      display: flex;
      gap: 6px;
    }

    .aura-vault-password {
      flex: 1;
      background: rgba(0,0,0,0.3);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 6px;
      padding: 6px 10px;
      font-size: 11px;
      color: #E6E1E5;
      outline: none;
      transition: border-color 0.15s;
    }

    .aura-vault-password:focus {
      border-color: #D0BCFF;
    }

    .aura-vault-password::placeholder {
      color: rgba(255,255,255,0.4);
    }

    .aura-vault-unlock-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 6px;
      background: #D0BCFF;
      border: none;
      color: #381E72;
      cursor: pointer;
      transition: background 0.15s, transform 0.15s;
    }

    .aura-vault-unlock-btn:hover {
      background: #EADDFF;
      transform: scale(1.05);
    }

    .aura-vault-unlock-btn:active {
      transform: scale(0.95);
    }

    .aura-vault-error {
      font-size: 10px;
      color: #F2B8B5;
      min-height: 14px;
      margin-top: 4px;
    }

    .aura-vault-setup-prompt {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 11px;
      color: rgba(255,255,255,0.5);
      padding: 4px 0;
    }

    .aura-vault-setup-prompt svg {
      color: #939094;
    }

    .aura-divider {
      height: 1px;
      background: rgba(255,255,255,0.1);
      width: 100%;
    }

    .aura-action {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
    }

    .aura-note-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: rgba(208, 188, 255, 0.1);
      border: none;
      color: #D0BCFF;
      cursor: pointer;
      transition: background 0.15s, transform 0.15s;
    }

    .aura-note-btn:hover {
      background: rgba(208, 188, 255, 0.2);
      transform: scale(1.05);
    }

    .aura-note-btn:active {
      transform: scale(0.95);
    }

    .aura-button {
      background: none;
      border: none;
      color: var(--aura-primary);
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      padding: 8px 12px;
      border-radius: 20px;
      text-decoration: none;
      transition: background 0.15s;
    }

    .aura-button:hover {
      background: var(--aura-primary-10);
    }
  `;

  shadow.appendChild(style);

  const container = document.createElement('div');
  container.className = 'aura-tooltip-container';

  const tooltip = document.createElement('div');
  tooltip.className = 'aura-tooltip';

  container.appendChild(tooltip);
  shadow.appendChild(container);

  container.addEventListener('mouseenter', () => {
    isTooltipHovered = true;
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
  });

  container.addEventListener('mouseleave', () => {
    isTooltipHovered = false;
    if (hideTimeout) clearTimeout(hideTimeout);
    hideTimeout = setTimeout(() => {
      if (!isTooltipHovered && !isTargetHovered) {
        hideTooltip();
        currentHover = null;
      }
      hideTimeout = null;
    }, 150);
  });

  document.body.appendChild(host);
  overlayRoot = host;
}

// Mutation observer
let observerTimeout: ReturnType<typeof setTimeout> | null = null;
const pendingNodes: Node[] = [];

function processPendingNodes(): void {
  const nodes = [...pendingNodes];
  pendingNodes.length = 0;
  observerTimeout = null;

  // Cleanup disconnected elements
  for (const [id, elements] of targetElements.entries()) {
    const connected = elements.filter(el => document.body.contains(el));
    if (connected.length === 0) {
      targetElements.delete(id);
      identifierData.delete(id);
    } else if (connected.length !== elements.length) {
      targetElements.set(id, connected);
    }
  }

  // Limit cache size
  if (targetElements.size > 500) {
    const keys = Array.from(targetElements.keys());
    const toRemove = keys.slice(0, targetElements.size - 500);
    for (const key of toRemove) {
      targetElements.delete(key);
      identifierData.delete(key);
    }
  }

  for (const node of nodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      processTextNode(node as Text);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      scanDOM(node as Element);
    }
  }
}

function setupObserver(): void {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        pendingNodes.push(node);
      }
    }
    if (observerTimeout) clearTimeout(observerTimeout);
    observerTimeout = setTimeout(processPendingNodes, 200);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Listen for X-Ray toggle and vault sync
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'TOGGLE_XRAY') {
      document.body.classList.toggle('aura-xray-active');
    }
    if (message.type === 'VAULT_LOCKED') {
      console.log('[Aura] Vault locked - syncing state');
      vaultSessionKey = null;
      // Hide tooltip or update if currently showing
      if (currentHover) {
        const data = identifierData.get(currentHover.identifier);
        if (data) {
          showTooltip(currentHover.element, data);
        }
      }
    }
    if (message.type === 'VAULT_UNLOCKED' && message.sessionKey) {
      console.log('[Aura] Vault unlocked - syncing state');
      vaultSessionKey = message.sessionKey;
      // Update tooltip if currently showing
      if (currentHover) {
        const data = identifierData.get(currentHover.identifier);
        if (data) {
          showTooltip(currentHover.element, data);
        }
      }
    }
  });
}

// Initialize
async function init(): Promise<void> {
  console.log('[Aura] Initializing v6 scanner with global overlay...');
  await loadVaultSession();
  injectStyles();
  createOverlay();
  scanDOM();
  setupObserver();
  console.log('[Aura] Scanner ready. Vault session:', vaultSessionKey ? 'active' : 'none');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
