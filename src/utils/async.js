export function scheduleIdleWork(callback, timeout = 500) {
    if (typeof window === 'undefined') return;

    if ('requestIdleCallback' in window) {
        window.requestIdleCallback(callback, { timeout });
        return;
    }

    window.setTimeout(callback, 0);
}

export async function mapWithConcurrency(items, mapper, limit = 6) {
    if (!items.length) return [];

    const results = new Array(items.length);
    let nextIndex = 0;

    const worker = async () => {
        while (nextIndex < items.length) {
            const currentIndex = nextIndex;
            nextIndex += 1;
            results[currentIndex] = await mapper(items[currentIndex], currentIndex);
        }
    };

    const workerCount = Math.min(limit, items.length);
    await Promise.all(Array.from({ length: workerCount }, worker));

    return results;
}
