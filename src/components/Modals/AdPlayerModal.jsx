import React, { useEffect, useRef, useState } from 'react';
import { fetchActiveSubscriptionsWithMetadata, normalizeExternalUrl } from '../../utils/subscriptionCatalog';

const FALLBACK_DURATION = 10;
const REQUIRED_WATCH_SECONDS = 10;

function pickRewardAd(subscriptions, excludeId = null) {
    if (!subscriptions || subscriptions.length === 0) return null;

    const videoSubscriptions = subscriptions.filter((subscription) => Boolean(subscription.video_url));
    const basePool = videoSubscriptions.length > 0 ? videoSubscriptions : subscriptions;
    const pool = excludeId && basePool.length > 1
        ? basePool.filter((subscription) => subscription.id !== excludeId)
        : basePool;

    return pool[Math.floor(Math.random() * pool.length)];
}

export default function AdPlayerModal({ ad, activeCategoryId, excludeAdId, onClose, onComplete }) {
    const [fetchedSub, setFetchedSub] = useState(null);
    const [isFetchingAd, setIsFetchingAd] = useState(!ad);
    const [timeLeft, setTimeLeft] = useState(FALLBACK_DURATION);
    const [rewardUnlocked, setRewardUnlocked] = useState(false);
    const [videoFinished, setVideoFinished] = useState(false);
    const [videoError, setVideoError] = useState(false);
    const [autoplayBlocked, setAutoplayBlocked] = useState(false);
    const videoRef = useRef(null);

    const sub = ad ?? fetchedSub;
    const hasVideo = Boolean(sub?.video_url) && !videoError;
    const rewardReady = rewardUnlocked || (!hasVideo && !isFetchingAd && timeLeft <= 0);
    const advertiserUrl = normalizeExternalUrl(sub?.target_url || sub?.url);

    useEffect(() => {
        let cancelled = false;

        if (ad) {
            return () => {
                cancelled = true;
            };
        }

        const fetchRandomAd = async () => {
            const subscriptions = await fetchActiveSubscriptionsWithMetadata({ forceMetadata: true });
            const matchingSubscriptions = activeCategoryId
                ? subscriptions.filter((subscription) => subscription.category === activeCategoryId)
                : subscriptions;

            if (cancelled) return;

            setFetchedSub(pickRewardAd(matchingSubscriptions ?? [], excludeAdId));
            setIsFetchingAd(false);
        };

        void fetchRandomAd();

        return () => {
            cancelled = true;
        };
    }, [activeCategoryId, ad, excludeAdId]);

    useEffect(() => {
        if (isFetchingAd || hasVideo || rewardReady || timeLeft <= 0) return undefined;

        const timerId = window.setTimeout(() => {
            setTimeLeft((previous) => previous - 1);
        }, 1000);

        return () => window.clearTimeout(timerId);
    }, [hasVideo, isFetchingAd, rewardReady, timeLeft]);

    useEffect(() => {
        if (!hasVideo || !videoRef.current) return undefined;

        const video = videoRef.current;
        let cancelled = false;

        const startPlayback = async () => {
            try {
                video.currentTime = 0;
                // Start muted so autoplay is allowed by browser policy
                video.muted = true;
                video.volume = 1;
                await video.play();

                // Autoplay succeeded (muted). Now try to unmute.
                try {
                    video.muted = false;
                    // Some browsers pause when unmuting; check after a tick
                    await new Promise((r) => setTimeout(r, 50));
                    if (video.paused) {
                        // Browser blocked unmuted playback — re-play muted
                        video.muted = true;
                        await video.play();
                        if (!cancelled) setAutoplayBlocked(true);
                    } else {
                        if (!cancelled) setAutoplayBlocked(false);
                    }
                } catch {
                    // Unmute caused an error — fall back to muted + prompt
                    video.muted = true;
                    try { await video.play(); } catch { /* ignore */ }
                    if (!cancelled) setAutoplayBlocked(true);
                }
            } catch {
                if (!cancelled) {
                    setAutoplayBlocked(true);
                }
            }
        };

        void startPlayback();

        return () => {
            cancelled = true;
            video.pause();
        };
    }, [hasVideo, sub?.video_url]);




    const handleManualPlay = async () => {
        if (!videoRef.current) return;

        try {
            videoRef.current.muted = false;
            videoRef.current.volume = 1;
            await videoRef.current.play();
            setAutoplayBlocked(false);
        } catch {
            setAutoplayBlocked(true);
        }
    };

    const handleVideoLoadedMetadata = (event) => {
        const duration = Math.ceil(event.currentTarget.duration || 0);
        setTimeLeft(duration > 0 ? Math.min(REQUIRED_WATCH_SECONDS, duration) : REQUIRED_WATCH_SECONDS);
    };

    const handleVideoTimeUpdate = (event) => {
        const { currentTime } = event.currentTarget;

        if (currentTime >= REQUIRED_WATCH_SECONDS) {
            if (!rewardUnlocked) {
                setRewardUnlocked(true);
            }
            setTimeLeft(0);
            setAutoplayBlocked(false);
            return;
        }

        setTimeLeft(Math.max(0, Math.ceil(REQUIRED_WATCH_SECONDS - currentTime)));
    };

    const handleVideoEnded = () => {
        setTimeLeft(0);
        setRewardUnlocked(true);
        setVideoFinished(true);
        setAutoplayBlocked(false);
    };

    const handleVideoError = () => {
        // Mark video as unavailable and fallback to image
        setVideoError(true);
        setAutoplayBlocked(false);
        setTimeLeft(FALLBACK_DURATION);
        // Ensure any playing video is stopped
        if (videoRef.current) {
            videoRef.current.pause();
        }
    };

    return (
        <div className="modal">
            <div className="modal-content">
                <h2>Watch Ad to Collect Your Egg</h2>
                <div className="video-placeholder ad-player-shell">
                    {hasVideo ? (
                        <video
                            ref={videoRef}
                            className="ad-player-video"
                            src={sub.video_url}
                            poster={sub?.image_url || undefined}
                            autoPlay
                            playsInline
                            preload="auto"
                            onLoadedMetadata={handleVideoLoadedMetadata}
                            onTimeUpdate={handleVideoTimeUpdate}
                            onEnded={handleVideoEnded}
                            onError={handleVideoError}
                            onPointerDown={() => {
                                if (autoplayBlocked) {
                                    void handleManualPlay();
                                }
                            }}
                        />
                    ) : (
                        sub?.image_url && (
                            <img
                                src={sub.image_url}
                                className="ad-player-video"
                                alt={sub.name}
                            />
                        )
                    )}

                    <div className="ad-player-overlay">
                        {isFetchingAd ? (
                            <>
                                <div className="spinner"></div>
                                <p>Loading ad...</p>
                            </>
                        ) : rewardReady ? (
                            <p className="ad-player-status success">
                                {hasVideo && !videoFinished
                                    ? 'Reward unlocked. The video will keep playing.'
                                    : 'Ad completed. Claim your reward.'}
                            </p>
                        ) : hasVideo ? (
                            <>
                                {sub?.name && <h3>{sub.name}</h3>}
                                <p>
                                    {autoplayBlocked
                                        ? 'Tap the video to continue the ad with sound.'
                                        : 'Watch 10 seconds to unlock your reward.'}
                                </p>
                                {!autoplayBlocked && timeLeft > 0 && (
                                    <p className="ad-player-status">{timeLeft}s remaining</p>
                                )}
                            </>
                        ) : (
                            <>
                                {sub?.name && <h3>{sub.name}</h3>}
                                <p>Please wait <strong>{timeLeft}</strong> seconds</p>
                                {videoError && <p>Video unavailable, using image fallback.</p>}
                            </>
                        )}
                    </div>
                </div>

                {advertiserUrl && (
                    <button
                        type="button"
                        className="secondary-btn ad-player-link-btn"
                        onClick={() => window.open(advertiserUrl, '_blank', 'noopener,noreferrer')}
                    >
                        Visit Advertiser
                    </button>
                )}

                {rewardReady && (
                    <button onClick={onComplete}>Claim Reward!</button>
                )}

                <button className="close-btn" style={{ opacity: rewardReady ? 1 : 0.5 }} onClick={onClose}>&times;</button>
            </div>
        </div>
    );
}
