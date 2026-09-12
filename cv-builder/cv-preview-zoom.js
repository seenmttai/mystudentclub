(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CvPreviewZoom = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    const MIN_SCALE = 0.35;
    const MAX_SCALE = 3;

    function clampScale(value) {
        if (!Number.isFinite(value)) return 1;
        return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
    }

    function scaleFromPinch(startScale, startDistance, currentDistance) {
        if (!Number.isFinite(startScale) || !Number.isFinite(startDistance) ||
            !Number.isFinite(currentDistance) || startDistance <= 0) {
            return Number.isFinite(startScale) ? startScale : 1;
        }
        return clampScale(startScale * (currentDistance / startDistance));
    }

    function fitScale(viewportWidth, viewportHeight, contentWidth, contentHeight, padding = 0) {
        const values = [viewportWidth, viewportHeight, contentWidth, contentHeight, padding];
        if (!values.every(Number.isFinite) || contentWidth <= 0 || contentHeight <= 0) return 1;
        const usableWidth = Math.max(0, viewportWidth - padding);
        const usableHeight = Math.max(0, viewportHeight - padding);
        return clampScale(Math.min(usableWidth / contentWidth, usableHeight / contentHeight));
    }

    function scrollForFocalPoint(scrollOffset, focalPoint, oldScale, newScale) {
        if (![scrollOffset, focalPoint, oldScale, newScale].every(Number.isFinite) || oldScale <= 0) {
            return scrollOffset;
        }
        return ((scrollOffset + focalPoint) * (newScale / oldScale)) - focalPoint;
    }

    return { MIN_SCALE, MAX_SCALE, clampScale, scaleFromPinch, fitScale, scrollForFocalPoint };
});
