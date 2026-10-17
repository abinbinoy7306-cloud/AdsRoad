const activeAdsByTrack = new Map();

export function clearActiveAdsByTrack() {
    activeAdsByTrack.clear();
}

export function getActiveAdByTrack(trackId) {
    return activeAdsByTrack.get(trackId) ?? null;
}

export function setActiveAdByTrack(trackId, ad) {
    activeAdsByTrack.set(trackId, ad);
}
