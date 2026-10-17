import React from 'react';
import useEngine from '../hooks/useEngine';
import Duck from './Duck';
import Egg from './Egg';
import Billboard from './Billboard';
import { clearActiveAdsByTrack } from '../utils/billboardActiveAds';
import { buildNoRepeatSelection, createRotationState } from '../utils/adRotation';

const BILLBOARD_CYCLE_SECONDS = 8;
const BILLBOARDS_PER_SIDE = 3;

function createTrackDelays(billboardsPerSide) {
    const delayStep = BILLBOARD_CYCLE_SECONDS / (billboardsPerSide * 2);

    return {
        left: Array.from(
            { length: billboardsPerSide },
            (_, index) => Number((index * delayStep * 2).toFixed(3)),
        ),
        right: Array.from(
            { length: billboardsPerSide },
            (_, index) => Number((((index * 2) + 1) * delayStep).toFixed(3)),
        ),
    };
}

const TRACK_DELAYS = createTrackDelays(BILLBOARDS_PER_SIDE);

export default React.memo(function GameContainer({
    activeCategoryId,
    onEggClick,
    onBillboardClick,
    lastRewardAdId,
    isModalOpen,
    paused = false,
}) {
    const {
        eggs,
        removeEgg,
        getRandomRewardSub,
        isLoading,
        activeSubscriptions,
    } = useEngine(activeCategoryId, paused);
    const [syncKey, setSyncKey] = React.useState(0);
    const wasModalOpenRef = React.useRef(isModalOpen);
    const lastAdsSignatureRef = React.useRef('');
    const hiddenAtRef = React.useRef(0);
    const activeSubscriptionCount = activeSubscriptions.length;
    const activeSubscriptionsSignature = React.useMemo(
        () => activeSubscriptions
            .map((subscription) => `${subscription.id}:${subscription.image_url ?? ''}:${subscription.name ?? ''}`)
            .join('|'),
        [activeSubscriptions],
    );

    React.useEffect(() => {
        if (wasModalOpenRef.current && !isModalOpen) {
            setSyncKey((k) => k + 1);
        }
        wasModalOpenRef.current = isModalOpen;
    }, [isModalOpen]);

    React.useEffect(() => {
        const handleAdsUpdated = (event) => {
            const count = event.detail?.count ?? 0;
            if (count === 0) return;

            const signature = event.detail?.signature ?? '';
            if (signature && signature === lastAdsSignatureRef.current) return;
            lastAdsSignatureRef.current = signature;
            clearActiveAdsByTrack();
            setSyncKey((k) => k + 1);
        };
        window.addEventListener('adsDataUpdated', handleAdsUpdated);

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                hiddenAtRef.current = Date.now();
                return;
            }

            if (document.visibilityState === 'visible' && Date.now() - hiddenAtRef.current > 1000) {
                setSyncKey((k) => k + 1);
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            window.removeEventListener('adsDataUpdated', handleAdsUpdated);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    const { left: leftDelays, right: rightDelays } = TRACK_DELAYS;
    const billboardSlots = React.useMemo(
        () => [
            ...leftDelays.map((_, index) => ({ track: 'left-track', index })),
            ...rightDelays.map((_, index) => ({ track: 'right-track', index })),
        ],
        [leftDelays, rightDelays],
    );

    const { initialSubs, rotationState } = React.useMemo(() => {
        if (activeSubscriptionCount === 0 || activeSubscriptionsSignature.length === 0) {
            return {
                initialSubs: {},
                rotationState: createRotationState([]),
            };
        }

        const selection = buildNoRepeatSelection(activeSubscriptions, billboardSlots.length);
        const subsMap = {};

        billboardSlots.forEach((slot, index) => {
            subsMap[`${slot.track}-${slot.index}`] = selection[index] ?? null;
        });

        const nextRotationState = createRotationState(activeSubscriptions, activeSubscriptionsSignature);
        const lastInitialId = selection.at(-1)?.id ?? null;
        if (lastInitialId && nextRotationState.remainingIds.length > 1 && nextRotationState.remainingIds[0] === lastInitialId) {
            nextRotationState.remainingIds.push(nextRotationState.remainingIds.shift());
        }

        return {
            initialSubs: subsMap,
            rotationState: nextRotationState,
        };
    }, [activeSubscriptionCount, activeSubscriptions, activeSubscriptionsSignature, billboardSlots]);

    const handleEggClaim = React.useCallback((eggId) => {
        onEggClick(eggId, getRandomRewardSub(lastRewardAdId));
    }, [getRandomRewardSub, lastRewardAdId, onEggClick]);

    const renderTrack = React.useCallback((track, delays) => (
        <div className="billboard-track" id={track}>
            {delays.map((delay, index) => {
                const trackId = `${track}-${index}`;
                return (
                    <Billboard
                        key={`track-${trackId}-sync-${syncKey}`}
                        track={track}
                        delay={delay}
                        trackId={trackId}
                        initialSub={initialSubs[trackId]}
                        rotationState={rotationState}
                        activeSubscriptions={activeSubscriptions}
                        onAdClick={onBillboardClick}
                        isLoading={isLoading && activeSubscriptionCount === 0}
                    />
                );
            })}
        </div>
    ), [activeSubscriptionCount, activeSubscriptions, initialSubs, isLoading, onBillboardClick, rotationState, syncKey]);

    return (
        <>
            <div id="sky">
                <div className="cloud cloud-1"></div>
                <div className="cloud cloud-2"></div>
                <div className="cloud cloud-3"></div>
                <div className="cloud cloud-4"></div>
                <div className="cloud cloud-5"></div>
            </div>

            <div id="ground-wrapper">
                <div id="ground-plane">
                    <div id="ground-texture-layer"></div>
                    <div id="side-left" className="side-area">
                        {renderTrack('left-track', leftDelays)}
                    </div>

                    <div id="road">
                        <div id="road-lines"></div>
                    </div>

                    <div id="side-right" className="side-area">
                        {renderTrack('right-track', rightDelays)}
                    </div>
                </div>
            </div>

            <Duck paused={paused} />

            {eggs.map((egg) => (
                <Egg
                    key={egg.id}
                    id={egg.id}
                    paused={paused}
                    onClaim={handleEggClaim}
                    onRemove={removeEgg}
                />
            ))}
        </>
    );
});
