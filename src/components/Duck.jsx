import React, { useEffect, useRef } from 'react';
import { scheduleIdleWork } from '../utils/async';

const frames = Array.from(
    { length: 16 },
    (_, i) => `${import.meta.env.BASE_URL}duck_gif/duck_gif${100 + i}.gif`,
);
const FRAME_DURATION_MS = 33;

export default React.memo(function Duck({ paused = false }) {
    const containerRef = useRef(null);
    const pausedRef = useRef(paused);

    useEffect(() => {
        pausedRef.current = paused;
    }, [paused]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return undefined;

        const images = container.querySelectorAll('img');
        if (images.length !== frames.length) return undefined;

        let frameIndex = 0;
        let lastTime = 0;
        let animationId;
        let isPageVisible = document.visibilityState === 'visible';

        const handleVisibilityChange = () => {
            isPageVisible = document.visibilityState === 'visible';
        };

        const loop = (timestamp) => {
            if (!pausedRef.current && isPageVisible && timestamp - lastTime >= FRAME_DURATION_MS) {
                images[frameIndex].style.visibility = 'hidden';
                frameIndex = (frameIndex + 1) % frames.length;
                images[frameIndex].style.visibility = 'visible';
                lastTime = timestamp;
            }
            animationId = requestAnimationFrame(loop);
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        animationId = requestAnimationFrame(loop);

        scheduleIdleWork(() => {
            if (document.visibilityState !== 'visible') return;
            for (let index = 1; index < frames.length; index += 1) {
                const preload = new Image();
                preload.decoding = 'async';
                preload.src = frames[index];
            }
        });

        return () => {
            cancelAnimationFrame(animationId);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    return (
        <div id="duck" ref={containerRef}>
            {frames.map((src, index) => (
                <img
                    key={src}
                    src={src}
                    alt={`duck-${index}`}
                    decoding="async"
                    fetchPriority={index === 0 ? 'high' : 'low'}
                    style={{
                        position: index === 0 ? 'relative' : 'absolute',
                        top: 0,
                        left: 0,
                        width: 'clamp(100px, 20vw, 220px)',
                        height: 'auto',
                        visibility: index === 0 ? 'visible' : 'hidden',
                        pointerEvents: 'none',
                    }}
                />
            ))}
        </div>
    );
});
