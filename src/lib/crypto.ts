/**
 * Client-side AES-GCM encryption utilities for Secret Notes Vault
 * Uses Web Crypto API for secure encryption/decryption
 */

const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const VALIDATOR_STRING = 'AURA_VAULT_V1';

/**
 * Derive an AES-GCM key from a password using PBKDF2
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const passwordKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        'PBKDF2',
        false,
        ['deriveKey']
    );

    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt,
            iterations: 100000,
            hash: 'SHA-256'
        },
        passwordKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

/**
 * Encrypt plaintext using AES-GCM
 * Returns base64 encoded string: salt + iv + ciphertext
 */
export async function encrypt(plaintext: string, password: string): Promise<string> {
    const encoder = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const key = await deriveKey(password, salt);

    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        encoder.encode(plaintext)
    );

    // Combine salt + iv + ciphertext
    const combined = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(ciphertext), salt.length + iv.length);

    return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt ciphertext using AES-GCM
 * Expects base64 encoded string: salt + iv + ciphertext
 */
export async function decrypt(encryptedBase64: string, password: string): Promise<string> {
    const decoder = new TextDecoder();
    const combined = new Uint8Array(
        atob(encryptedBase64).split('').map(c => c.charCodeAt(0))
    );

    const salt = combined.slice(0, SALT_LENGTH);
    const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH);

    const key = await deriveKey(password, salt);

    const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ciphertext
    );

    return decoder.decode(plaintext);
}

/**
 * Create an encrypted validator string to verify password on unlock
 */
export async function createValidator(password: string): Promise<string> {
    return encrypt(VALIDATOR_STRING, password);
}

/**
 * Verify password by attempting to decrypt the validator
 */
export async function verifyPassword(validator: string, password: string): Promise<boolean> {
    try {
        const decrypted = await decrypt(validator, password);
        return decrypted === VALIDATOR_STRING;
    } catch {
        return false;
    }
}

/**
 * Storage keys for the vault
 */
export const VAULT_KEYS = {
    VALIDATOR: 'vault_validator',
    NOTE_PREFIX: 'note_'
} as const;

/**
 * Get note key for an address
 */
export function getNoteKey(address: string): string {
    return `${VAULT_KEYS.NOTE_PREFIX}${address.toLowerCase()}`;
}
