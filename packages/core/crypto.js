// memo だけを対象にした、ダッシュボード(Table Editor/SQL Editor)から平文が
// 読めないようにするための対称暗号。RLSはダッシュボード接続(postgres/service_role)
// には効かないため、DBに保存する前にアプリ側で暗号化する。
// Web Crypto API(globalThis.crypto.subtle)は Node と ブラウザの両方で使えるため、
// CLI/Web で同じコードを共有できる。

const ALGO = { name: 'AES-GCM', length: 256 };
const IV_BYTES = 12;

function toBase64(bytes) {
    let binary = '';
    bytes.forEach((b) => { binary += String.fromCharCode(b); });
    return btoa(binary);
}

function fromBase64(base64) {
    return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

export async function importMemoKey(base64Key) {
    return crypto.subtle.importKey('raw', fromBase64(base64Key), ALGO, false, ['encrypt', 'decrypt']);
}

export async function encryptMemo(key, plaintext) {
    if (plaintext === null || plaintext === undefined || plaintext === '') return null;

    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const ciphertext = await crypto.subtle.encrypt({ name: ALGO.name, iv }, key, new TextEncoder().encode(plaintext));

    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);
    return toBase64(combined);
}

export async function decryptMemo(key, stored) {
    if (!stored) return null;

    const combined = fromBase64(stored);
    const iv = combined.slice(0, IV_BYTES);
    const ciphertext = combined.slice(IV_BYTES);
    const plainBuf = await crypto.subtle.decrypt({ name: ALGO.name, iv }, key, ciphertext);
    return new TextDecoder().decode(plainBuf);
}
