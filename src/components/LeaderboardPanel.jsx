import React from 'react';
import {
    ChevronDown,
    Copy,
    ExternalLink,
    Mail,
    Phone,
    Share2,
    Trophy,
} from 'lucide-react';
import { fetchActiveSubscriptionsWithMetadata } from '../utils/subscriptionCatalog';
import { fetchBillboardLeaderboard } from '../utils/leaderboardService';

const RANK_STYLES = [
    { place: '1st', color: '#d4af37', glow: 'rgba(212, 175, 55, 0.52)' },       /* golden */
    { place: '2nd', color: '#b8b8b8', glow: 'rgba(192, 192, 192, 0.48)' },       /* silver */
    { place: '3rd', color: '#b8878b', glow: 'rgba(184, 135, 139, 0.48)' },       /* rose gold */
    { place: '4th', color: '#b87333', glow: 'rgba(184, 115, 51, 0.48)' },        /* copper */
    { place: '5th', color: '#8a8f98', glow: 'rgba(138, 143, 152, 0.48)' },        /* iron */
];

function getShareUrl(ad) {
    return ad.primaryActionUrl || ad.url || ad.portfolioUrl || ad.imageUrl || '';
}

function buildActions(ad, onShare, onCopyLink, onCopyContact) {
    const shareUrl = getShareUrl(ad);
    const actions = [];

    actions.push({
        key: 'share',
        label: 'Share',
        icon: Share2,
        onClick: () => onShare(ad),
        disabled: !shareUrl,
    });

    if (shareUrl) {
        actions.push({
            key: 'copy-link',
            label: 'Copy Link',
            icon: Copy,
            onClick: () => onCopyLink(shareUrl),
        });
    }

    if (ad.phone) {
        actions.push({
            key: 'call',
            label: 'Call',
            icon: Phone,
            href: `tel:${ad.phone}`,
        });
    }

    if (ad.email) {
        actions.push({
            key: 'email',
            label: 'Email',
            icon: Mail,
            href: `mailto:${ad.email}`,
        });
    }

    if (ad.contact) {
        actions.push({
            key: 'copy-contact',
            label: 'Copy Contact',
            icon: Copy,
            onClick: () => onCopyContact(ad.contact),
        });
    }

    if (shareUrl) {
        actions.push({
            key: 'open',
            label: 'Open',
            icon: ExternalLink,
            href: shareUrl,
            external: true,
        });
    }

    return actions;
}

export default React.memo(function LeaderboardPanel() {
    const [isOpen, setIsOpen] = React.useState(false);
    const [ads, setAds] = React.useState([]);
    const [clickRows, setClickRows] = React.useState([]);
    const [expandedId, setExpandedId] = React.useState(null);
    const [imageOptionsOpenId, setImageOptionsOpenId] = React.useState(null);
    const [feedback, setFeedback] = React.useState('');

    React.useEffect(() => {
        if (!isOpen) return undefined;

        let cancelled = false;

        const loadLeaderboard = async () => {
            try {
                const [subscriptionData, leaderboardData] = await Promise.all([
                    fetchActiveSubscriptionsWithMetadata(),
                    fetchBillboardLeaderboard(),
                ]);
                if (!cancelled) {
                    setAds(subscriptionData ?? []);
                    setClickRows(leaderboardData ?? []);
                }
            } catch (error) {
                console.error('Failed to load leaderboard ads:', error);
            }
        };

        void loadLeaderboard();

        const refresh = () => {
            if (!cancelled) {
                void loadLeaderboard();
            }
        };

        window.addEventListener('adPublished', refresh);
        window.addEventListener('adsDataUpdated', refresh);
        window.addEventListener('leaderboardUpdated', refresh);
        const intervalId = window.setInterval(refresh, 15000);

        return () => {
            cancelled = true;
            window.removeEventListener('adPublished', refresh);
            window.removeEventListener('adsDataUpdated', refresh);
            window.removeEventListener('leaderboardUpdated', refresh);
            window.clearInterval(intervalId);
        };
    }, [isOpen]);

    React.useEffect(() => {
        if (!feedback) return undefined;
        const timer = window.setTimeout(() => setFeedback(''), 1800);
        return () => window.clearTimeout(timer);
    }, [feedback]);

    const leaderboardItems = React.useMemo(() => {
        const adMap = new Map(ads.map((ad) => [ad.id, ad]));

        return clickRows
            .map((row) => {
                const ad = adMap.get(row.ad_id);
                if (!ad) return null;
                return { ...ad, clicks: Number(row.click_count) || 0 };
            })
            .filter(Boolean)
            .slice(0, 5);
    }, [ads, clickRows]);

    const handleShare = React.useCallback(async (ad) => {
        const shareUrl = getShareUrl(ad);
        if (!shareUrl) return;

        try {
            if (navigator.share) {
                await navigator.share({
                    title: ad.title,
                    text: ad.description || ad.title,
                    url: shareUrl,
                });
                return;
            }
        } catch (error) {
            if (error?.name === 'AbortError') return;
        }

        try {
            await navigator.clipboard.writeText(shareUrl);
            setFeedback('Link copied');
        } catch {
            setFeedback('Share unavailable');
        }
    }, []);

    const handleCopy = React.useCallback(async (value, message) => {
        try {
            await navigator.clipboard.writeText(value);
            setFeedback(message);
        } catch {
            setFeedback('Copy failed');
        }
    }, []);

    const handleToggleImageOptions = React.useCallback((event, adId) => {
        event.stopPropagation();
        setImageOptionsOpenId((current) => current === adId ? null : adId);
    }, []);

    const handleImageTriggerKeyDown = React.useCallback((event, adId) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        handleToggleImageOptions(event, adId);
    }, [handleToggleImageOptions]);

    return (
        <div className="leaderboard-shell">
            {isOpen && (
                <div id="leaderboard-panel" className="leaderboard-panel" role="dialog" aria-label="Leaderboard">
                    <div className="leaderboard-header">
                        <div>
                            <p className="leaderboard-kicker">Most Clicked</p>
                            <h3>Leaderboard</h3>
                        </div>
                        {feedback ? <span className="leaderboard-feedback">{feedback}</span> : null}
                    </div>

                    <div className="leaderboard-list">
                        {leaderboardItems.length === 0 ? (
                            <div className="leaderboard-empty">
                                Billboard clicks will appear here once visitors start opening ads.
                            </div>
                        ) : leaderboardItems.map((ad, index) => {
                            const rankStyle = RANK_STYLES[index];
                            const isExpanded = expandedId === ad.id;
                            const showImageOptions = imageOptionsOpenId === ad.id;
                            const actions = buildActions(
                                ad,
                                handleShare,
                                (value) => handleCopy(value, 'Link copied'),
                                (value) => handleCopy(value, 'Contact copied'),
                            );

                            return (
                                <div
                                    key={ad.id}
                                    className={`leaderboard-item ${isExpanded ? 'expanded' : ''}`}
                                    style={{
                                        '--leaderboard-rank': rankStyle.color,
                                        '--leaderboard-rank-glow': rankStyle.glow,
                                    }}
                                >
                                    <button
                                        type="button"
                                        className="leaderboard-item-trigger"
                                        onClick={() => {
                                            setExpandedId((current) => {
                                                const nextExpandedId = current === ad.id ? null : ad.id;
                                                setImageOptionsOpenId(null);
                                                return nextExpandedId;
                                            });
                                        }}
                                    >
                                        <div className="leaderboard-rank-badge">
                                            <span>{rankStyle.place}</span>
                                        </div>
                                        <div className="leaderboard-item-copy">
                                            <strong>{ad.title}</strong>
                                            <div className="leaderboard-item-meta">
                                                <small>{ad.clicks} clicks</small>
                                                <span className="leaderboard-meta-dot" aria-hidden="true"></span>
                                                <small>{index + 1} of 5</small>
                                            </div>
                                        </div>
                                        <div className="leaderboard-chevron-wrap">
                                            <ChevronDown size={18} />
                                        </div>
                                    </button>

                                    {isExpanded && (
                                        <div className="leaderboard-item-body">
                                            <div
                                                role="button"
                                                tabIndex={0}
                                                className={`leaderboard-image-trigger ${showImageOptions ? 'open' : ''}`}
                                                onPointerDown={(event) => handleToggleImageOptions(event, ad.id)}
                                                onKeyDown={(event) => handleImageTriggerKeyDown(event, ad.id)}
                                            >
                                                {ad.imageUrl ? (
                                                    <img src={ad.imageUrl} alt={ad.title} className="leaderboard-image" />
                                                ) : (
                                                    <div className="leaderboard-image leaderboard-image-fallback">{ad.title}</div>
                                                )}
                                                {!showImageOptions && (
                                                    <p className="leaderboard-image-hint">Tap image for more options</p>
                                                )}
                                            </div>

                                            {showImageOptions && (
                                                <div className="leaderboard-actions-wrap">
                                                    <div className="leaderboard-actions-header">
                                                        <strong>Quick Actions</strong>
                                                        <small>Use the ad details instantly</small>
                                                    </div>
                                                    <div className="leaderboard-actions">
                                                        {actions.map((action) => {
                                                            const Icon = action.icon;
                                                            if (action.href) {
                                                                return (
                                                                    <a
                                                                        key={action.key}
                                                                        className="leaderboard-action-btn"
                                                                        href={action.href}
                                                                        target={action.external ? '_blank' : undefined}
                                                                        rel={action.external ? 'noopener noreferrer' : undefined}
                                                                    >
                                                                        <Icon size={15} />
                                                                        <span>{action.label}</span>
                                                                    </a>
                                                                );
                                                            }

                                                            return (
                                                                <button
                                                                    key={action.key}
                                                                    type="button"
                                                                    className="leaderboard-action-btn"
                                                                    onClick={action.onClick}
                                                                    disabled={action.disabled}
                                                                >
                                                                    <Icon size={15} />
                                                                    <span>{action.label}</span>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <button
                type="button"
                className={`leaderboard-toggle ${isOpen ? 'open' : ''}`}
                onClick={() => setIsOpen((current) => !current)}
                aria-expanded={isOpen}
                aria-controls="leaderboard-panel"
            >
                <Trophy size={18} />
                <span>Leaderboard</span>
            </button>
        </div>
    );
});
