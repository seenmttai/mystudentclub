// Promise.withResolvers polyfill for older browsers/devices inside the Web Worker
if (typeof Promise.withResolvers === 'undefined') {
    Promise.withResolvers = function() {
        let resolve, reject;
        const promise = new Promise((res, rej) => {
            resolve = res;
            reject = rej;
        });
        return { promise, resolve, reject };
    };
}

await import('https://esm.sh/pdfjs-dist@4.8.69/build/pdf.worker.min.js');
