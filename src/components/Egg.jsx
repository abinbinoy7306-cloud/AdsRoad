import React from 'react';

export default React.memo(function Egg({ id, paused = false, onClaim, onRemove }) {
    const hasRemovedRef = React.useRef(false);
    const timeoutRef = React.useRef(null);
    const remainingMsRef = React.useRef(3000);
    const startedAtRef = React.useRef(0);
    const removeOnce = React.useCallback(() => {
        if (hasRemovedRef.current) return;
        hasRemovedRef.current = true;
        onRemove(id);
    }, [id, onRemove]);

    React.useEffect(() => {
        const clearTimer = () => {
            if (!timeoutRef.current) return;
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        };

        const scheduleRemoval = () => {
            clearTimer();
            startedAtRef.current = Date.now();
            timeoutRef.current = setTimeout(() => {
                timeoutRef.current = null;
                removeOnce();
            }, remainingMsRef.current);
        };

        if (paused) {
            if (timeoutRef.current) {
                const elapsed = Date.now() - startedAtRef.current;
                remainingMsRef.current = Math.max(0, remainingMsRef.current - elapsed);
            }
            clearTimer();
            return undefined;
        }

        if (remainingMsRef.current <= 0) {
            removeOnce();
            return undefined;
        }

        scheduleRemoval();

        return clearTimer;
    }, [paused, removeOnce]);

    return (
        <div 
            className="golden-egg" 
            onPointerDown={(e) => {
                e.preventDefault();
                removeOnce();
                onClaim(id);
            }}
            onAnimationEnd={(event) => {
                if (event.animationName === 'fallEgg') {
                    removeOnce();
                }
            }}
        >
            <span className="egg-shell" aria-hidden="true"></span>
        </div>
    );
});
