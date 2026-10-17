function shuffleCopy(values) {
    const copy = [...values];

    for (let index = copy.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }

    return copy;
}

export function buildNoRepeatSelection(items, count) {
    if (!Array.isArray(items) || items.length === 0 || count <= 0) {
        return [];
    }

    const selection = [];
    const rotationState = createRotationState(items);

    for (let index = 0; index < count; index += 1) {
        const choice = drawNextFromRotationState(rotationState, items);
        if (!choice) break;
        selection.push(choice);
    }

    return selection;
}

export function createRotationState(items, signature = '') {
    return {
        signature,
        remainingIds: shuffleCopy(items.map((item) => item.id)),
    };
}

export function drawNextFromRotationState(rotationState, items, currentId = null) {
    if (!rotationState || !Array.isArray(items) || items.length === 0) {
        return null;
    }

    const activeById = new Map(items.map((item) => [item.id, item]));
    const activeIds = items.map((item) => item.id);
    const activeIdSet = new Set(activeIds);

    const filteredRemainingIds = rotationState.remainingIds.filter((id) => activeIdSet.has(id));
    if (filteredRemainingIds.length !== rotationState.remainingIds.length) {
        rotationState.remainingIds = filteredRemainingIds;
    }

    if (rotationState.remainingIds.length === 0) {
        rotationState.remainingIds = shuffleCopy(activeIds);
    }

    if (rotationState.remainingIds.length > 1 && currentId && rotationState.remainingIds[0] === currentId) {
        rotationState.remainingIds.push(rotationState.remainingIds.shift());
    }

    const chosenId = rotationState.remainingIds.shift() ?? null;
    if (!chosenId) return null;

    if (rotationState.remainingIds.length === 0) {
        rotationState.remainingIds = shuffleCopy(activeIds);
    }

    return activeById.get(chosenId) ?? null;
}
