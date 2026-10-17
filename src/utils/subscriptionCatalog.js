import { DEFAULT_CATEGORY_ID, getCategoryById } from '../data/adCategories';
import { supabase, supabaseUrl } from '../services/supabaseClient';
import { mapWithConcurrency } from './async';

const METADATA_FOLDER = 'metadata';
const ACTIVE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const SUBSCRIPTION_COLUMNS = 'id, owner_id, created_at, name, url, video_url, image_url, color';
const metadataCache = new Map();
const metadataInflight = new Map();

function getActiveWindowStart() {
    return new Date(Date.now() - ACTIVE_WINDOW_MS).toISOString();
}

function buildMetadataPath(subscriptionId) {
    return `${METADATA_FOLDER}/${subscriptionId}.json`;
}

export function buildMetadataPublicUrl(subscriptionId) {
    if (!subscriptionId) return '';

    // Auto-fix if supabaseUrl is just the project ID (common configuration mistake)
    let baseUrl = supabaseUrl;
    if (baseUrl && !baseUrl.includes('.') && !baseUrl.includes('localhost')) {
        baseUrl = `https://${baseUrl}.supabase.co`;
    }

    const cleanBase = baseUrl?.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    if (!cleanBase) return '';

    return `${cleanBase}/storage/v1/object/public/ads/${buildMetadataPath(subscriptionId)}`;
}

export function normalizeExternalUrl(value) {
    if (!value) return '';
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (/^(javascript|vbscript|data):/i.test(trimmed)) return '';

    const candidate = /^https?:\/\//i.test(trimmed)
        ? trimmed
        : trimmed.startsWith('//')
            ? `https:${trimmed}`
            : `https://${trimmed}`;

    try {
        const parsed = new URL(candidate);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:'
            ? parsed.href
            : '';
    } catch {
        return '';
    }
}

function normalizeMetadata(subscription, metadata) {
    const categoryId = metadata?.category ?? DEFAULT_CATEGORY_ID;
    const category = getCategoryById(categoryId);
    const url = normalizeExternalUrl(metadata?.url ?? subscription.url ?? '');
    const portfolioUrl = normalizeExternalUrl(metadata?.portfolioUrl ?? '');
    const videoUrl = normalizeExternalUrl(metadata?.videoUrl ?? subscription.video_url ?? '');
    const imageUrl = normalizeExternalUrl(metadata?.imageUrl ?? subscription.image_url ?? '');
    const title = metadata?.title ?? subscription.name ?? 'Untitled';

    return {
        ...subscription,
        metadata,
        category: category.id,
        categoryLabel: category.label,
        categoryDescription: category.description,
        title,
        name: title,
        imageUrl,
        image_url: imageUrl,
        videoUrl,
        video_url: videoUrl,
        url,
        description: metadata?.description ?? '',
        email: metadata?.email ?? '',
        phone: metadata?.phone ?? '',
        contact: metadata?.contact ?? '',
        portfolioUrl,
        resumeUrl: normalizeExternalUrl(metadata?.resumeUrl ?? ''),
        primaryActionUrl: portfolioUrl || url,
    };
}

const BROKEN_METADATA_KEY = 'adsroad_broken_metadata_v2';
let memoryBrokenIds = null;

function getBrokenMetadataIds() {
    if (memoryBrokenIds) return memoryBrokenIds;
    try {
        const stored = localStorage.getItem(BROKEN_METADATA_KEY);
        memoryBrokenIds = new Set(JSON.parse(stored || '[]'));
        return memoryBrokenIds;
    } catch {
        return new Set();
    }
}

function markMetadataAsBroken(id) {
    try {
        const ids = getBrokenMetadataIds();
        if (ids.has(id)) return;

        ids.add(id);
        localStorage.setItem(BROKEN_METADATA_KEY, JSON.stringify(Array.from(ids)));
        // Refresh memory cache
        memoryBrokenIds = ids;
    } catch {
        // Ignore local storage write failures.
    }
}

export async function fetchSubscriptionMetadata(subscriptionId, { force = false, knownBrokenIds = null } = {}) {
    if (!subscriptionId) return null;

    const brokenIds = knownBrokenIds || getBrokenMetadataIds();
    if (!force && brokenIds.has(subscriptionId)) {
        return null;
    }

    if (!force && metadataCache.has(subscriptionId)) {
        return metadataCache.get(subscriptionId);
    }

    if (!force && metadataInflight.has(subscriptionId)) {
        return metadataInflight.get(subscriptionId);
    }

    const url = buildMetadataPublicUrl(subscriptionId);
    if (!url) return null;

    const request = fetch(url, {
        cache: force ? 'reload' : 'default',
    })
        .then(async (response) => {
            if (!response.ok) {
                // If it's a 404 or 400, mark it as broken so we don't try again
                if (response.status === 404 || response.status === 400) {
                    markMetadataAsBroken(subscriptionId);
                }
                return null;
            }
            return response.json();
        })
        .catch(() => null)
        .finally(() => {
            metadataInflight.delete(subscriptionId);
        });

    metadataInflight.set(subscriptionId, request);

    const metadata = await request;
    if (metadata) {
        metadataCache.set(subscriptionId, metadata);
    }
    if (!metadata && !brokenIds.has(subscriptionId)) {
        console.warn(`[AdsRoad] Metadata missing for ${subscriptionId}`);
    }

    return metadata;
}

let activeSubscriptionsRequest = null;
let listRequest = null;
let lastSubscriptionsFetchTime = 0;
let cachedSubscriptions = null;
const LIST_CACHE_MS = 30000;
const METADATA_CONCURRENCY = 10;

async function queryActiveSubscriptions(ownerId) {
    let query = supabase.from('subscriptions').select(SUBSCRIPTION_COLUMNS);

    if (ownerId) {
        query = query.eq('owner_id', ownerId);
    }

    const { data, error } = await query
        .gt('created_at', getActiveWindowStart())
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data ?? [];
}

/**
 * Fast path: DB rows only (image/name/url from columns). Used to paint billboards immediately.
 */
export async function fetchActiveSubscriptionList({ ownerId, forceRefresh = false } = {}) {
    if (!forceRefresh && !ownerId && cachedSubscriptions && (Date.now() - lastSubscriptionsFetchTime < LIST_CACHE_MS)) {
        return cachedSubscriptions;
    }

    if (listRequest && !ownerId) {
        return listRequest;
    }

    const fetchTask = (async () => {
        const subscriptions = await queryActiveSubscriptions(ownerId);
        return subscriptions.map((subscription) => normalizeMetadata(subscription, null));
    })();

    if (!ownerId) {
        listRequest = fetchTask;
        fetchTask.finally(() => {
            listRequest = null;
        });
    }

    return fetchTask;
}

/**
 * Enrich subscriptions with storage metadata (category, etc.) without blocking first paint.
 */
export async function hydrateSubscriptionList(subscriptions, { forceMetadata = false } = {}) {
    if (!subscriptions.length) return [];

    const brokenIds = getBrokenMetadataIds();

    const hydratedResults = await mapWithConcurrency(
        subscriptions,
        async (subscription) => {
            if (subscription.metadata && !forceMetadata) {
                return subscription;
            }

            const metadata = await fetchSubscriptionMetadata(subscription.id, {
                force: forceMetadata,
                knownBrokenIds: brokenIds,
            });
            return normalizeMetadata(subscription, metadata);
        },
        METADATA_CONCURRENCY,
    );

    return hydratedResults;
}

export async function fetchActiveSubscriptionsWithMetadata({ ownerId, forceMetadata = false, forceRefresh = false } = {}) {
    if (!forceRefresh && !ownerId && cachedSubscriptions && (Date.now() - lastSubscriptionsFetchTime < LIST_CACHE_MS)) {
        return cachedSubscriptions;
    }

    if (activeSubscriptionsRequest && !ownerId) {
        return activeSubscriptionsRequest;
    }

    const fetchTask = (async () => {
        try {
            const list = await fetchActiveSubscriptionList({ ownerId, forceRefresh });
            const result = await hydrateSubscriptionList(list, { forceMetadata });

            if (!ownerId) {
                cachedSubscriptions = result;
                lastSubscriptionsFetchTime = Date.now();
            }

            return result;
        } finally {
            if (!ownerId) activeSubscriptionsRequest = null;
        }
    })();

    if (!ownerId) {
        activeSubscriptionsRequest = fetchTask;
    }

    return fetchTask;
}

export function clearSubscriptionMetadataCache(subscriptionId) {
    if (!subscriptionId) return;
    metadataCache.delete(subscriptionId);
    metadataInflight.delete(subscriptionId);
}

export function getCategoryActionLabel(categoryId) {
    return getCategoryById(categoryId).primaryUrlLabel;
}
