export function buildAdsSignature(subscriptions = []) {
    return subscriptions
        .map((sub) => `${sub.id}:${sub.image_url ?? ''}:${sub.video_url ?? ''}`)
        .join('|');
}
