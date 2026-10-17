import { supabase } from '../services/supabaseClient';

export async function incrementBillboardClickCount(adId) {
    if (!adId) return null;

    const { data, error } = await supabase.rpc('increment_ad_click', {
        target_ad_id: adId,
    });

    if (error) {
        console.error('Failed to increment billboard click count:', error);
        return null;
    }

    return data ?? null;
}

export async function fetchBillboardLeaderboard(limit = 5) {
    const { data, error } = await supabase
        .from('ad_click_totals')
        .select('ad_id, click_count, updated_at')
        .order('click_count', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('Failed to fetch leaderboard click totals:', error);
        return [];
    }

    return data ?? [];
}
