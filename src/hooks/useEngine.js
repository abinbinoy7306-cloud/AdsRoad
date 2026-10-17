import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '../services/supabaseClient';
import { buildAdsSignature } from '../utils/adsSignature';
import {
    fetchActiveSubscriptionList,
    hydrateSubscriptionList,
} from '../utils/subscriptionCatalog';

const CACHE_KEY = 'adsroad_active_subs_v2';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const LAST_CLEANUP_KEY = 'adsroad_subscriptions_cleanup_at_v1';
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MOBILE_SPAWN_INTERVAL = 2000;
const DESKTOP_SPAWN_INTERVAL = 3000;
const AD_FETCH_TIMEOUT_MS = 20000;
const preloadedImageUrls = new Set();

function withTimeout(promise, timeoutMs, label = 'Request') {
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            window.setTimeout(() => reject(new Error(`${label} timed out.`)), timeoutMs);
        }),
    ]);
}

function loadCachedSubs() {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return [];
        const { data, timestamp } = JSON.parse(raw);
        if (Date.now() - timestamp < CACHE_TTL) return data;
        return [];
    } catch {
        return [];
    }
}

function saveCachedSubs(data, signature) {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed?.signature === signature) return;
        }
        localStorage.setItem(CACHE_KEY, JSON.stringify({
            data,
            timestamp: Date.now(),
            signature,
        }));
    } catch {
        // Ignore local storage write failures.
    }
}

function getSpawnInterval() {
    if (typeof window === 'undefined') return DESKTOP_SPAWN_INTERVAL;
    return window.matchMedia('(max-width: 768px)').matches
        ? MOBILE_SPAWN_INTERVAL
        : DESKTOP_SPAWN_INTERVAL;
}

function isPreloadableImageUrl(url) {
    return Boolean(
        url
        && typeof url === 'string'
        && (url.startsWith('http') || url.startsWith('/'))
        && !url.toLowerCase().endsWith('.json'),
    );
}

function queueImagePreloads(subs) {
    if (typeof window === 'undefined' || typeof Image === 'undefined') return;

    const urls = [];
    subs.forEach((sub) => {
        const url = sub.image_url;
        if (!isPreloadableImageUrl(url) || preloadedImageUrls.has(url)) return;
        preloadedImageUrls.add(url);
        urls.push(url);
    });

    if (urls.length === 0) return;

    let index = 0;
    const schedule = (callback) => {
        if ('requestIdleCallback' in window) {
            window.requestIdleCallback(callback, { timeout: 2000 });
            return;
        }
        window.setTimeout(() => callback({ timeRemaining: () => 0 }), 120);
    };

    const preloadChunk = (deadline) => {
        const chunkStart = index;
        while (
            index < urls.length
            && (index - chunkStart < 4 || deadline.timeRemaining() > 6)
        ) {
            const img = new Image();
            img.decoding = 'async';
            img.src = urls[index];
            index += 1;
        }

        if (index < urls.length) {
            schedule(preloadChunk);
        }
    };

    schedule(preloadChunk);
}

function shouldRunSubscriptionsCleanup() {
    try {
        const lastCleanupAt = Number(localStorage.getItem(LAST_CLEANUP_KEY) || 0);
        if (Date.now() - lastCleanupAt < CLEANUP_INTERVAL_MS) {
            return false;
        }
        localStorage.setItem(LAST_CLEANUP_KEY, String(Date.now()));
        return true;
    } catch {
        return true;
    }
}

async function cleanupExpiredSubscriptions() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    try {
        const { error } = await supabase
            .from('subscriptions')
            .delete()
            .lt('created_at', thirtyDaysAgo);

        if (error) {
            console.warn('Subscription cleanup failed:', error);
        }
    } catch (error) {
        console.warn('Subscription cleanup failed:', error);
    }
}

export default function useEngine(activeCategoryId = null, paused = false) {
    const [initialCachedSubs] = useState(() => loadCachedSubs());
    const [eggs, setEggs] = useState([]);
    const [allSubscriptions, setAllSubscriptions] = useState(initialCachedSubs);
    const [isLoading, setIsLoading] = useState(initialCachedSubs.length === 0);
    const [spawnInterval, setSpawnInterval] = useState(getSpawnInterval);
    const eggCounter = useRef(0);
    const allSubscriptionsRef = useRef(initialCachedSubs);
    const activeSubscriptionsRef = useRef(initialCachedSubs);
    const lastDispatchedSignatureRef = useRef('');
    const lastSavedCacheSignatureRef = useRef('');

    useEffect(() => {
        allSubscriptionsRef.current = allSubscriptions;
    }, [allSubscriptions]);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;

        const mediaQuery = window.matchMedia('(max-width: 768px)');
        const handleChange = (event) => {
            setSpawnInterval(event.matches ? MOBILE_SPAWN_INTERVAL : DESKTOP_SPAWN_INTERVAL);
        };

        if (mediaQuery.addEventListener) {
            mediaQuery.addEventListener('change', handleChange);
            return () => mediaQuery.removeEventListener('change', handleChange);
        }

        mediaQuery.addListener(handleChange);
        return () => mediaQuery.removeListener(handleChange);
    }, []);

    useEffect(() => {
        let cancelled = false;

        const fetchSubs = async (force = false) => {
            if (shouldRunSubscriptionsCleanup()) {
                // Background cleanup is best-effort and should not block rendering.
                void cleanupExpiredSubscriptions();
            }

            try {
                const list = await withTimeout(
                    fetchActiveSubscriptionList({ forceRefresh: force }),
                    AD_FETCH_TIMEOUT_MS,
                    'Ad list fetch',
                );

                if (!cancelled && list.length > 0) {
                    setAllSubscriptions(list);
                    queueImagePreloads(list);
                    setIsLoading(false);
                }

                // Metadata hydration is best-effort; failures must never wipe the ad list.
                try {
                    const data = await withTimeout(
                        hydrateSubscriptionList(list, { forceMetadata: force }),
                        AD_FETCH_TIMEOUT_MS,
                        'Ad metadata fetch',
                    );

                    if (!cancelled && data.length > 0) {
                        const signature = buildAdsSignature(data);
                        setAllSubscriptions(data);
                        if (signature !== lastSavedCacheSignatureRef.current) {
                            lastSavedCacheSignatureRef.current = signature;
                            saveCachedSubs(data, signature);
                        }
                        if (data !== list) {
                            queueImagePreloads(data);
                        }
                    }
                } catch (metadataErr) {
                    console.warn('Metadata hydration failed (ads still visible):', metadataErr);
                }
            } catch (err) {
                console.error('Failed to fetch ads:', err);
                if (!cancelled && allSubscriptionsRef.current.length === 0) {
                    setAllSubscriptions([]);
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        };

        fetchSubs(false); // Initial background refresh (uses browser cache)

        const handleAdPublished = () => fetchSubs(true); // Force reload after publishing
        window.addEventListener('adPublished', handleAdPublished);
        
        return () => {
            cancelled = true;
            window.removeEventListener('adPublished', handleAdPublished);
        };
    }, []);

    const adsSignature = useMemo(
        () => buildAdsSignature(allSubscriptions),
        [allSubscriptions],
    );

    useEffect(() => {
        if (allSubscriptions.length === 0) return;
        if (adsSignature === lastDispatchedSignatureRef.current) return;

        lastDispatchedSignatureRef.current = adsSignature;
        window.dispatchEvent(new CustomEvent('adsDataUpdated', {
            detail: { count: allSubscriptions.length, signature: adsSignature },
        }));
    }, [adsSignature, allSubscriptions.length]);

    const activeSubscriptions = useMemo(() => {
        if (!activeCategoryId) {
            return allSubscriptions;
        }

        return allSubscriptions.filter((subscription) => subscription.category === activeCategoryId);
    }, [activeCategoryId, allSubscriptions]);

    activeSubscriptionsRef.current = activeSubscriptions;

    useEffect(() => {
        activeSubscriptionsRef.current = activeSubscriptions;
    }, [activeSubscriptions]);

    const rewardVideoSubscriptions = useMemo(
        () => activeSubscriptions.filter((subscription) => Boolean(subscription.video_url)),
        [activeSubscriptions],
    );

    useEffect(() => {
        let interval = null;

        const spawnEgg = () => {
            const eggId = `egg-${eggCounter.current++}`;
            setEggs((current) => {
                if (current.length >= 5) return current;
                return [...current, { id: eggId }];
            });
        };

        const startSpawning = () => {
            if (interval) return;
            interval = setInterval(spawnEgg, spawnInterval);
        };

        const stopSpawning = () => {
            if (!interval) return;
            clearInterval(interval);
            interval = null;
        };

        const handleVisibilityChange = () => {
            if (!paused && document.visibilityState === 'visible') {
                startSpawning();
            } else {
                stopSpawning();
            }
        };

        if (!paused && (typeof document === 'undefined' || document.visibilityState === 'visible')) {
            startSpawning();
        }

        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', handleVisibilityChange);
        }

        return () => {
            stopSpawning();
            if (typeof document !== 'undefined') {
                document.removeEventListener('visibilitychange', handleVisibilityChange);
            }
        };
    }, [paused, spawnInterval]);

    const removeEgg = useCallback((id) => {
        setEggs((current) => current.filter((egg) => egg.id !== id));
    }, []);

    const getRandomRewardSub = useCallback((excludeId = null) => {
        const subscriptions = activeSubscriptionsRef.current;
        const basePool = rewardVideoSubscriptions.length > 0
            ? rewardVideoSubscriptions
            : subscriptions;
        if (basePool.length === 0) return null;

        const pool = excludeId && basePool.length > 1
            ? basePool.filter((subscription) => subscription.id !== excludeId)
            : basePool;

        return pool[Math.floor(Math.random() * pool.length)];
    }, [rewardVideoSubscriptions]);

    return {
        eggs,
        removeEgg,
        activeSubscriptions,
        adsSignature,
        getRandomRewardSub,
        isLoading,
    };
}
