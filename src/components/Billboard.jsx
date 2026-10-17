import React, { useState } from 'react';
import { incrementBillboardClickCount } from '../utils/leaderboardService';
import { normalizeExternalUrl } from '../utils/subscriptionCatalog';
import { getActiveAdByTrack, setActiveAdByTrack } from '../utils/billboardActiveAds';
import { drawNextFromRotationState } from '../utils/adRotation';

const preloadedAdImages = new Set();

const adColorCache = new Map();
const colorExtractionInFlight = new Map();
const COLOR_SAMPLE_SIZE = 32;
const EDGE_SAMPLE_BAND_RATIO = 0.12;
let sharedCanvas = null;
let sharedContext = null;

function getAdRenderSignature(sub) {
    if (!sub) return '';
    return [
        sub.id,
        sub.image_url,
        sub.name,
        sub.target_url,
        sub.url,
        sub.color,
    ].map((value) => value ?? '').join('|');
}

function getSharedCanvasContext() {
    if (typeof document === 'undefined') return null;
    if (!sharedCanvas) {
        sharedCanvas = document.createElement('canvas');
        sharedCanvas.width = COLOR_SAMPLE_SIZE;
        sharedCanvas.height = COLOR_SAMPLE_SIZE;
        sharedContext = sharedCanvas.getContext('2d', { willReadFrequently: true });
    }
    return sharedContext;
}

function getCachedAdColor(url) {
    if (!url) return null;
    return adColorCache.get(url) ?? null;
}

function preloadAdImage(url) {
    if (
        !url
        || typeof Image === 'undefined'
        || (typeof url === 'string' && url.toLowerCase().endsWith('.json'))
    ) {
        return;
    }

    if (preloadedAdImages.has(url)) {
        return;
    }

    preloadedAdImages.add(url);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
        if (adColorCache.has(url)) return;
        const color = getAverageEdgeColor(img);
        if (color) {
            adColorCache.set(url, color);
        }
    };
    img.src = url;
}

function getAverageEdgeColor(imgElement) {
    try {
        const ctx = getSharedCanvasContext();
        if (!ctx || !sharedCanvas) return null;

        ctx.clearRect(0, 0, sharedCanvas.width, sharedCanvas.height);
        ctx.drawImage(imgElement, 0, 0, sharedCanvas.width, sharedCanvas.height);
        
        const imageData = ctx.getImageData(0, 0, sharedCanvas.width, sharedCanvas.height);
        const data = imageData.data;
        
        let rSum = 0, gSum = 0, bSum = 0, alphaSum = 0;
        const width = sharedCanvas.width;
        const height = sharedCanvas.height;
        const edgeBandSize = Math.max(1, Math.floor(Math.min(width, height) * EDGE_SAMPLE_BAND_RATIO));

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const isEdgePixel = x < edgeBandSize
                    || x >= width - edgeBandSize
                    || y < edgeBandSize
                    || y >= height - edgeBandSize;

                if (!isEdgePixel) continue;

                const index = (y * width + x) * 4;
                const alpha = data[index + 3] / 255;
                if (alpha <= 0.2) continue;

                rSum += data[index] * alpha;
                gSum += data[index + 1] * alpha;
                bSum += data[index + 2] * alpha;
                alphaSum += alpha;
            }
        }
        
        if (alphaSum === 0) return null;
        
        const r = Math.round(rSum / alphaSum);
        const g = Math.round(gSum / alphaSum);
        const b = Math.round(bSum / alphaSum);
        
        return `rgb(${r}, ${g}, ${b})`;
    } catch (e) {
        console.warn('Failed to calculate edge color:', e);
        return null;
    }
}

function resolveAdColor(url) {
    if (!url) return Promise.resolve(null);

    const cachedColor = getCachedAdColor(url);
    if (cachedColor) {
        return Promise.resolve(cachedColor);
    }

    if (colorExtractionInFlight.has(url)) {
        return colorExtractionInFlight.get(url);
    }

    const task = new Promise((resolve) => {
        const corsImg = new Image();
        corsImg.crossOrigin = 'anonymous';
        corsImg.onload = () => {
            try {
                const color = getAverageEdgeColor(corsImg);
                if (color) {
                    adColorCache.set(url, color);
                }
                resolve(color);
            } catch (e) {
                console.warn('CORS edge color extraction failed:', e);
                resolve(null);
            }
        };
        corsImg.onerror = () => {
            resolve(null);
        };
        corsImg.src = url;
    }).finally(() => {
        colorExtractionInFlight.delete(url);
    });

    colorExtractionInFlight.set(url, task);
    return task;
}

export default React.memo(function Billboard({
    initialSub,
    trackId,
    track,
    delay,
    onAdClick,
    activeSubscriptions,
    rotationState,
    isLoading,
}) {
    const [currentSub, setCurrentSub] = useState(() => {
        const cached = getActiveAdByTrack(trackId);
        if (cached) return cached;
        return initialSub ?? null;
    });

    const [nextSub, setNextSub] = useState(null);
    const [detectedColor, setDetectedColor] = useState(() => getCachedAdColor(initialSub?.image_url));

    React.useEffect(() => {
        if (!initialSub) return;
        setCurrentSub((previous) => {
            if (!previous) return initialSub;
            if (getAdRenderSignature(previous) !== getAdRenderSignature(initialSub)) {
                return initialSub;
            }
            return previous;
        });
    }, [initialSub]);

    const [imageLoaded, setImageLoaded] = useState(false);
    const imageRef = React.useRef(null);

    React.useEffect(() => {
        const imageUrl = currentSub?.image_url;
        if (!imageUrl) {
            setImageLoaded(false);
            setDetectedColor(null);
            return;
        }

        setDetectedColor(getCachedAdColor(imageUrl));

        const img = imageRef.current;
        if (!img) return;

        const handleLoad = () => {
            setImageLoaded(true);
            const cachedColor = getCachedAdColor(imageUrl);
            if (cachedColor) {
                setDetectedColor(cachedColor);
                return;
            }
            void resolveAdColor(imageUrl)
                .then((color) => {
                    if (color) setDetectedColor(color);
                })
                .catch(() => {});
        };

        const handleError = () => {
            setImageLoaded(true);
        };

        if (img.complete) {
            // Image already finished loading (cached or failed)
            if (img.naturalWidth > 0) {
                handleLoad();
            } else {
                handleError();
            }
        } else {
            setImageLoaded(false);
            img.addEventListener('load', handleLoad);
            img.addEventListener('error', handleError);
            return () => {
                img.removeEventListener('load', handleLoad);
                img.removeEventListener('error', handleError);
            };
        }
    }, [currentSub?.image_url]);

    // Preload next ad to prevent white flashes during iteration
    React.useEffect(() => {
        preloadAdImage(currentSub?.image_url);
        const next = drawNextFromRotationState(rotationState, activeSubscriptions, currentSub?.id);
        setNextSub(next);
        preloadAdImage(next?.image_url);
    }, [activeSubscriptions, currentSub?.id, currentSub?.image_url, rotationState]);

    // Keep the current ad stable if animation sync remounts this billboard.
    React.useEffect(() => {
        if (currentSub) {
            setActiveAdByTrack(trackId, currentSub);
        }
    }, [currentSub, trackId]);

    const handleIteration = React.useCallback(() => {
        if (nextSub) {
            setCurrentSub(nextSub);
        } else {
            setCurrentSub(drawNextFromRotationState(rotationState, activeSubscriptions, currentSub?.id));
        }
    }, [activeSubscriptions, currentSub?.id, nextSub, rotationState]);

    const isSubscribed = Boolean(currentSub?.image_url || currentSub?.name);

    const handleClick = React.useCallback(() => {
        if (isSubscribed) {
            if (currentSub?.id) {
                void incrementBillboardClickCount(currentSub.id).then(() => {
                    window.dispatchEvent(new Event('leaderboardUpdated'));
                });
            }

            const targetUrl = normalizeExternalUrl(currentSub.target_url || currentSub.url);
            if (targetUrl) {
                window.open(targetUrl, '_blank', 'noopener,noreferrer');
            }
        } else {
            onAdClick();
        }
    }, [currentSub, isSubscribed, onAdClick]);

    // Image load state and background color resolution are handled directly in the loading useEffect above.

    const style = React.useMemo(() => {
        const nextStyle = { animationDelay: `-${delay}s` };
        if (isSubscribed) {
            const activeColor = detectedColor || getCachedAdColor(currentSub?.image_url);
            const bg = activeColor || currentSub?.color || '#ffffff';
            nextStyle['--billboard-bg'] = bg;
        }
        return nextStyle;
    }, [currentSub, delay, isSubscribed, detectedColor]);

    return (
        <div 
            className={`billboard ${track} ${isSubscribed ? 'subscribed' : 'available'}`}
            style={style}
            onPointerDown={handleClick}
            onAnimationIteration={handleIteration}
        >
            {isSubscribed ? (
                <div className="ad-content">
                    {currentSub.image_url ? (
                        <>
                            <img 
                                key={currentSub.image_url}
                                ref={imageRef}
                                src={currentSub.image_url} 
                                className="billboard-ad-image"
                                alt={currentSub.name} 
                                loading="eager"
                                decoding="async"
                                style={{ opacity: imageLoaded ? 1 : 0, transition: 'opacity 0.2s ease-in' }}
                            />
                            {!imageLoaded && (
                                <div className="billboard-available-label" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', flexDirection: 'column', position: 'absolute', inset: 0 }}>
                                    <div className="spinner" style={{ width: '24px', height: '24px', marginBottom: 0, borderWidth: '3px' }}></div>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="billboard-text-fallback">{currentSub.name}</div>
                    )}
                </div>
            ) : isLoading ? (
                <div className="billboard-available-label" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', flexDirection: 'column' }}>
                    <div className="spinner" style={{ width: '24px', height: '24px', marginBottom: 0, borderWidth: '3px' }}></div>
                </div>
            ) : (
                <div className="billboard-available-label">
                    YOUR AD HERE
                </div>
            )}
        </div>
    );
});
