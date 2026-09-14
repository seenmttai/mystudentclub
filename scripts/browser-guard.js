/**
 * BrowserGuard client — v2.
 *
 * v2 adds three new defences over v1:
 *   1. Non-exportable P-256 DPoP session key  — kills DevTools copy/paste replay.
 *   2. Procedural deterministic canvas         — kills static oracle-hash replay.
 *   3. Pristine iframe prototype reflection    — kills CDP/Selenium injection.
 *
 * Browser probes remain abuse *signals*, not a sole authentication boundary.
 * The edge worker still validates the signed-in Supabase user JWT before
 * returning any data.
 */

const DEFAULT_ENDPOINT = (typeof window !== 'undefined' && window.BROWSER_GUARD_WORKER_URL)
    ? window.BROWSER_GUARD_WORKER_URL
    : 'https://browser-guard-unlock.bhansalimanan55.workers.dev';

const unlockCache = new Map();

// ─── Shared utilities ────────────────────────────────────────────────────────

function bytesToHex(bytes) {
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(value) {
    const input = new TextEncoder().encode(value);
    return new Uint8Array(await crypto.subtle.digest('SHA-256', input));
}

async function sha256Hex(value) {
    return bytesToHex(await sha256(value));
}

async function hashObject(value) {
    return bytesToHex(await sha256(JSON.stringify(value)));
}

function toBase64Url(bytes) {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fnv1a(bytes) {
    let hash = 0x811c9dc5;
    for (const byte of bytes) {
        hash ^= byte;
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

// ─── Layer 1: Non-exportable P-256 DPoP session key ──────────────────────────

/** Module-level: one key pair per page load; never exportable from DevTools. */
let _sessionKeyPair = null;

/**
 * Generates (once) a non-exportable P-256 ECDSA key pair for this page session.
 * Subsequent calls return the same key pair.
 */
async function generateSessionKey() {
    if (_sessionKeyPair) return _sessionKeyPair;
    _sessionKeyPair = await crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,              // ← extractable: false — private key cannot be exported from DevTools
        ['sign', 'verify']
    );
    return _sessionKeyPair;
}

/**
 * Returns the public key as a compact JWK string that can be sent to the server.
 * Only the public key is exportable.
 */
async function getSessionPublicKeyJwk() {
    const { publicKey } = await generateSessionKey();
    const jwk = await crypto.subtle.exportKey('jwk', publicKey);
    // Retain only the fields the server needs to import and verify
    return JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y });
}

/**
 * Signs `message` (a plain string) with the non-exportable private key.
 * Returns a base64url-encoded DER signature.
 */
async function signWithSessionKey(message) {
    const { privateKey } = await generateSessionKey();
    const msgBytes = new TextEncoder().encode(message);
    const sigBytes = await crypto.subtle.sign(
        { name: 'ECDSA', hash: { name: 'SHA-256' } },
        privateKey,
        msgBytes
    );
    return toBase64Url(new Uint8Array(sigBytes));
}

// ─── Layer 2: Procedural deterministic canvas ─────────────────────────────────

/**
 * mulberry32 — a fast, deterministic 32-bit PRNG seeded from an integer.
 * Must be identical to the server-side implementation.
 */
function mulberry32(seed) {
    return function () {
        seed |= 0;
        seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

/** Derives a 32-bit integer seed from the hex challenge seed string. */
function hexSeedToInt(hexSeed) {
    // XOR-fold first 8 hex chars (4 bytes) into a single 32-bit integer
    let value = 0;
    for (let i = 0; i < 8 && i < hexSeed.length; i += 2) {
        value ^= parseInt(hexSeed.slice(i, i + 2), 16) << ((3 - i / 2) * 8);
    }
    return value >>> 0;
}

const FILL_STYLES = ['#4f46e5', '#22d3ee', '#f97316', '#d946ef', '#10b981', '#f59e0b', '#ef4444', '#6366f1'];
const COMP_OPS = ['source-over', 'difference', 'multiply', 'screen', 'overlay'];

/**
 * Executes a deterministic procedural 2D canvas drawing pipeline seeded by `seed`.
 * Uses integer-only coordinates and no text/fonts to guarantee cross-OS consistency.
 *
 * The server derives the IDENTICAL drawing instructions from the same seed and
 * independently computes the expected pixel digest. Therefore static-hash replay
 * is impossible — the correct answer changes with every 90-second challenge.
 */
export async function probeProceduralCanvas(seed) {
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 48;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { ok: false, digest: '', activePixels: 0 };

    const rng = mulberry32(hexSeedToInt(seed));

    // Clear with deterministic background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 96, 48);

    // 25 procedural drawing operations — all integer coordinates, no fonts
    for (let op = 0; op < 25; op++) {
        ctx.globalCompositeOperation = COMP_OPS[Math.floor(rng() * COMP_OPS.length)];
        ctx.strokeStyle = FILL_STYLES[Math.floor(rng() * FILL_STYLES.length)];
        ctx.fillStyle   = FILL_STYLES[Math.floor(rng() * FILL_STYLES.length)];
        ctx.lineWidth   = 1 + Math.floor(rng() * 3);

        const opType = Math.floor(rng() * 4);
        const x1 = Math.floor(rng() * 96);
        const y1 = Math.floor(rng() * 48);
        const x2 = Math.floor(rng() * 96);
        const y2 = Math.floor(rng() * 48);
        const cx1 = Math.floor(rng() * 96);
        const cy1 = Math.floor(rng() * 48);
        const cx2 = Math.floor(rng() * 96);
        const cy2 = Math.floor(rng() * 48);

        ctx.beginPath();
        if (opType === 0) {
            // Line
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        } else if (opType === 1) {
            // Bezier curve
            ctx.moveTo(x1, y1);
            ctx.bezierCurveTo(cx1, cy1, cx2, cy2, x2, y2);
            ctx.stroke();
        } else if (opType === 2) {
            // Arc
            ctx.arc(x1, y1, 2 + Math.floor(rng() * 14), 0, Math.PI * 2);
            ctx.fill();
        } else {
            // Rect
            const w = 4 + Math.floor(rng() * 20);
            const h = 4 + Math.floor(rng() * 16);
            ctx.fillRect(x1, y1, w, h);
        }
    }

    ctx.globalCompositeOperation = 'source-over';
    const pixels = ctx.getImageData(0, 0, 96, 48).data;
    let activePixels = 0;
    for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] !== 0) activePixels++;
    }

    const digest = bytesToHex(await sha256(pixels.buffer instanceof ArrayBuffer
        ? new Uint8Array(pixels.buffer)
        : pixels));

    return { ok: activePixels > 50, digest, activePixels };
}

// ─── Layer 3: Pristine iframe prototype reflection ────────────────────────────

/**
 * Probes integrity of Navigator, Canvas and Permissions prototypes by comparing
 * the main window against a pristine same-origin iframe.
 *
 * CDP `evaluateOnNewDocument` / `Page.addScriptToEvaluateOnNewDocument`
 * patches DO NOT propagate into freshly created iframes, so genuine prototype
 * tampering by Selenium/Puppeteer stealth plugins is detectable here.
 */
export function probeAntiStealthAndIntegrity() {
    // --- Main window checks (kept from v1) ---
    const webdriverOwnProp = Object.prototype.hasOwnProperty.call(navigator, 'webdriver');
    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(navigator), 'webdriver');
    const webdriverGetterNative = !descriptor?.get
        || Function.prototype.toString.call(descriptor.get).includes('[native code]');
    const stack = String(new Error().stack || '');
    const suspiciousStack = /puppeteer_evaluation_script|evaluateOnNewDocument/i.test(stack);

    // --- Pristine iframe cross-check (new in v2) ---
    let prototypeIntact = true;
    let canvasIntact = true;
    let iframeWebdriver = false;

    try {
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'display:none;position:fixed;left:-9999px;';
        iframe.src = 'about:blank';
        document.body.appendChild(iframe);

        const iWin = iframe.contentWindow;
        if (iWin) {
            const iNav = iWin.navigator;

            // Webdriver flag on pristine frame
            iframeWebdriver = iNav?.webdriver === true;

            // Check navigator.webdriver getter is still native in pristine realm
            const iDescriptor = Object.getOwnPropertyDescriptor(
                Object.getPrototypeOf(iNav), 'webdriver'
            );
            const iGetterNative = !iDescriptor?.get
                || Function.prototype.toString.call(iDescriptor.get).includes('[native code]');
            prototypeIntact = iGetterNative && webdriverGetterNative;

            // Check canvas APIs are unpatched (Selenium stealth replaces getImageData, toDataURL)
            const iCtx = iWin.CanvasRenderingContext2D?.prototype;
            if (iCtx) {
                const getImageDataStr = Function.prototype.toString.call(iCtx.getImageData);
                const toDataURLStr = Function.prototype.toString.call(
                    iWin.HTMLCanvasElement?.prototype?.toDataURL
                );
                canvasIntact = getImageDataStr.includes('[native code]')
                    && toDataURLStr.includes('[native code]');
            }
        }

        document.body.removeChild(iframe);
    } catch (_) {
        // If iframe access fails (sandboxed context) treat as ok — don't penalise real users
        prototypeIntact = true;
        canvasIntact = true;
    }

    const ok = navigator.webdriver !== true
        && !iframeWebdriver
        && prototypeIntact
        && canvasIntact;

    return {
        ok,
        webdriver: navigator.webdriver === true,
        webdriverOwnProperty: webdriverOwnProp,
        webdriverGetterNative,
        suspiciousStack,
        iframeWebdriver,
        prototypeIntact,
        canvasIntact,
        chromePresent: Boolean(window.chrome)
    };
}

// ─── Legacy probes (kept for fingerprint diversity) ───────────────────────────

export function probeLayoutEngine() {
    const node = document.createElement('div');
    node.setAttribute('aria-hidden', 'true');
    node.style.cssText = 'position:fixed;left:-10000px;top:-10000px;width:137.5px;display:grid;grid-template-columns:1fr 1.37fr;font:13.75px/1.45 Arial,sans-serif;letter-spacing:.17px;transform:scale(.975) rotate(.01deg);visibility:hidden;';
    node.innerHTML = '<span>Browser</span><span>Guard ffi</span>';
    document.body.appendChild(node);
    try {
        const rect = node.getBoundingClientRect();
        const childRect = node.lastElementChild.getBoundingClientRect();
        const style = getComputedStyle(node);
        const fractional = [rect.width, rect.height, childRect.width, childRect.height]
            .some(value => Math.abs(value - Math.round(value)) > 0.001);
        return {
            ok: rect.width > 0 && rect.height > 0,
            width: Number(rect.width.toFixed(4)),
            height: Number(rect.height.toFixed(4)),
            childWidth: Number(childRect.width.toFixed(4)),
            offsetWidth: node.offsetWidth,
            offsetHeight: node.offsetHeight,
            lineHeight: style.lineHeight,
            fractional
        };
    } finally {
        node.remove();
    }
}

export function probeWebGLPipeline() {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    const gl = canvas.getContext('webgl', { antialias: false, preserveDrawingBuffer: true });
    if (!gl) return { ok: false, renderer: '', vendor: '', software: false, pixelHash: '' };

    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) || '') : '';
    const vendor = debug ? String(gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) || '') : '';
    const software = /swiftshader|llvmpipe|softpipe/i.test(`${renderer} ${vendor}`);
    gl.clearColor(0.137, 0.419, 0.733, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const pixels = new Uint8Array(8 * 8 * 4);
    gl.readPixels(0, 0, 8, 8, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return { ok: gl.getError() === gl.NO_ERROR, renderer, vendor, software, pixelHash: fnv1a(pixels) };
}

export async function probeWebAudioGraph() {
    const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OfflineContext) return { ok: false, hash: '', energy: 0 };
    try {
        const context = new OfflineContext(1, 500, 44100);
        const oscillator = context.createOscillator();
        const filter = context.createBiquadFilter();
        const compressor = context.createDynamicsCompressor();
        oscillator.type = 'triangle';
        oscillator.frequency.value = 997;
        filter.type = 'lowpass';
        filter.frequency.value = 1800;
        oscillator.connect(filter).connect(compressor).connect(context.destination);
        oscillator.start(0);
        const rendered = await context.startRendering();
        const samples = rendered.getChannelData(0);
        let energy = 0;
        for (const sample of samples) energy += Math.abs(sample);
        return {
            ok: energy > 0.01,
            hash: fnv1a(new Uint8Array(samples.buffer)),
            energy: Number(energy.toFixed(6))
        };
    } catch (error) {
        return { ok: false, hash: '', energy: 0, error: error?.name || 'AudioError' };
    }
}

// ─── Proof of Work ────────────────────────────────────────────────────────────

function hasLeadingZeroBits(bytes, difficulty) {
    let remaining = difficulty;
    for (const byte of bytes) {
        if (remaining <= 0) return true;
        const bits = Math.min(remaining, 8);
        if ((byte >> (8 - bits)) !== 0) return false;
        remaining -= bits;
    }
    return remaining <= 0;
}

export async function solveProofOfWork(seed, fingerprint, difficulty, maxIterations = 1_000_000) {
    for (let nonce = 0; nonce < maxIterations; nonce++) {
        const digest = await sha256(`${seed}:${fingerprint}:${nonce}`);
        if (hasLeadingZeroBits(digest, difficulty)) return nonce;
        if (nonce > 0 && nonce % 250 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
    throw new Error('Browser verification took too long. Please try again.');
}

// ─── Aggregate proof collector ────────────────────────────────────────────────

export async function collectBrowserProof(seed = '') {
    const startedAt = performance.now();

    // Pre-generate the session key concurrently with the probes
    const [layout, proceduralCanvas, webgl, audio, integrity] = await Promise.all([
        Promise.resolve().then(probeLayoutEngine),
        probeProceduralCanvas(seed),
        Promise.resolve().then(probeWebGLPipeline),
        probeWebAudioGraph(),
        Promise.resolve().then(probeAntiStealthAndIntegrity)
    ]);

    // Ensure session key is ready (usually already done by the time probes finish)
    await generateSessionKey();

    const signals = { layout, canvas: proceduralCanvas, webgl, audio, integrity };
    const fingerprint = await hashObject({
        layout: [layout.width, layout.height, layout.childWidth],
        canvas: proceduralCanvas.digest,         // ← v2: digest replaces static hash
        webgl: [webgl.renderer, webgl.vendor, webgl.pixelHash],
        audio: audio.hash,
        platform: navigator.platform || '',
        language: navigator.language || ''
    });
    return { ...signals, fingerprint, elapsedMs: Number((performance.now() - startedAt).toFixed(2)) };
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function requestJson(url, options) {
    const response = await fetch(url, options);
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.success === false) {
        const error = new Error(result.error || `Verification failed (${response.status})`);
        error.status = response.status;
        throw error;
    }
    return result;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function unlockJobDetails(job, tableName, session, options = {}) {
    if (!session?.access_token || !session?.user?.id) {
        throw new Error('Please sign in to view application details.');
    }
    if (job?.id === undefined || job?.id === null) throw new Error('Invalid job.');

    const cacheKey = `${session.user.id}:${tableName}:${job.id}`;
    if (unlockCache.has(cacheKey)) return { ...unlockCache.get(cacheKey), cached: true };

    const endpoint = String(options.endpoint || DEFAULT_ENDPOINT).replace(/\/$/, '');
    const headers = {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
    };
    const context = { jobId: String(job.id), table: tableName };

    // ── Layer 1: attach public key to challenge request ──────────────────────
    const dpopPublicKey = await getSessionPublicKeyJwk();

    const challengeResult = await requestJson(`${endpoint}/api/challenge`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...context, dpopPublicKey })
    });

    // ── Collect browser proofs (Layer 2 procedural canvas inside) ───────────
    const proof = await collectBrowserProof(challengeResult.seed);
    const nonce = await solveProofOfWork(
        challengeResult.seed,
        proof.fingerprint,
        challengeResult.difficulty
    );

    // ── Layer 1: sign (seed + fingerprint + nonce) with non-exportable key ──
    const dpopMessage = `${challengeResult.seed}:${proof.fingerprint}:${nonce}`;
    const dpopSignature = await signWithSessionKey(dpopMessage);

    const unlocked = await requestJson(`${endpoint}/api/unlock-job`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            ...context,
            challenge: challengeResult.challenge,
            fingerprint: proof.fingerprint,
            nonce,
            oracles: proof,
            dpopPublicKey,    // ← v2: server verifies signature against this
            dpopSignature     // ← v2: ECDSA(seed:fingerprint:nonce, privateKey)
        })
    });

    unlockCache.set(cacheKey, unlocked);
    return unlocked;
}

export function getCachedUnlockedJob(jobId, tableName, session) {
    if (!session?.user?.id || !jobId) return null;
    const cacheKey = `${session.user.id}:${tableName}:${jobId}`;
    return unlockCache.get(cacheKey) || null;
}

export function isJobUnlocked(jobId, tableName, session) {
    return Boolean(getCachedUnlockedJob(jobId, tableName, session));
}

export function clearBrowserGuardCache() {
    unlockCache.clear();
}
