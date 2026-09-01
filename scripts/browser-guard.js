/**
 * BrowserGuard client.
 *
 * Browser probes are abuse signals, not an authentication boundary. The edge
 * worker still validates the signed-in Supabase user before returning data.
 */

const DEFAULT_ENDPOINT = (typeof window !== 'undefined' && window.BROWSER_GUARD_WORKER_URL)
    ? window.BROWSER_GUARD_WORKER_URL
    : 'https://browser-guard-unlock.bhansalimanan55.workers.dev';
const unlockCache = new Map();

function bytesToHex(bytes) {
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(value) {
    const input = new TextEncoder().encode(value);
    return new Uint8Array(await crypto.subtle.digest('SHA-256', input));
}

async function hashObject(value) {
    return bytesToHex(await sha256(JSON.stringify(value)));
}

function fnv1a(bytes) {
    let hash = 0x811c9dc5;
    for (const byte of bytes) {
        hash ^= byte;
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

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

export function probeCanvasRasterizer(seed = '') {
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 48;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { ok: false, hash: '', activePixels: 0 };

    const gradient = ctx.createRadialGradient(37.25, 19.75, 1.5, 42.5, 22.25, 41.75);
    gradient.addColorStop(0, '#4f46e5');
    gradient.addColorStop(0.47, '#22d3ee');
    gradient.addColorStop(1, '#f97316');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'difference';
    ctx.strokeStyle = '#d946ef';
    ctx.lineWidth = 1.37;
    ctx.beginPath();
    ctx.moveTo(2.25, 39.75);
    ctx.bezierCurveTo(17.1, 2.4, 73.6, 51.2, 93.25, 7.5);
    ctx.stroke();
    ctx.font = '13.75px Arial, sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(`ffi Ω ${seed.slice(0, 6)}`, 7.35, 26.65);

    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let activePixels = 0;
    for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] !== 0) activePixels++;
    }
    return { ok: activePixels > 100, hash: fnv1a(pixels), activePixels };
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

export function probeAntiStealthAndIntegrity() {
    const webdriverOwnProperty = Object.prototype.hasOwnProperty.call(navigator, 'webdriver');
    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(navigator), 'webdriver');
    const webdriverGetterNative = !descriptor?.get || Function.prototype.toString.call(descriptor.get).includes('[native code]');
    const stack = String(new Error().stack || '');
    return {
        ok: navigator.webdriver !== true,
        webdriver: navigator.webdriver === true,
        webdriverOwnProperty,
        webdriverGetterNative,
        suspiciousStack: /puppeteer_evaluation_script|evaluateOnNewDocument/i.test(stack),
        chromePresent: Boolean(window.chrome)
    };
}

export async function collectBrowserProof(seed = '') {
    const startedAt = performance.now();
    const [layout, canvas, webgl, audio, integrity] = await Promise.all([
        Promise.resolve().then(probeLayoutEngine),
        Promise.resolve().then(() => probeCanvasRasterizer(seed)),
        Promise.resolve().then(probeWebGLPipeline),
        probeWebAudioGraph(),
        Promise.resolve().then(probeAntiStealthAndIntegrity)
    ]);
    const signals = { layout, canvas, webgl, audio, integrity };
    const fingerprint = await hashObject({
        layout: [layout.width, layout.height, layout.childWidth],
        canvas: canvas.hash,
        webgl: [webgl.renderer, webgl.vendor, webgl.pixelHash],
        audio: audio.hash,
        platform: navigator.platform || '',
        language: navigator.language || ''
    });
    return { ...signals, fingerprint, elapsedMs: Number((performance.now() - startedAt).toFixed(2)) };
}

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
    const challengeResult = await requestJson(`${endpoint}/api/challenge`, {
        method: 'POST',
        headers,
        body: JSON.stringify(context)
    });
    const proof = await collectBrowserProof(challengeResult.seed);
    const nonce = await solveProofOfWork(
        challengeResult.seed,
        proof.fingerprint,
        challengeResult.difficulty
    );
    const unlocked = await requestJson(`${endpoint}/api/unlock-job`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            ...context,
            challenge: challengeResult.challenge,
            fingerprint: proof.fingerprint,
            nonce,
            oracles: proof
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


