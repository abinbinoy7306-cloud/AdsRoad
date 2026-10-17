import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Globe, Mail, Phone, Video, Share2, Copy, Check, Search } from 'lucide-react';
import { getCategoryById } from '../../data/adCategories';
import {
    fetchActiveSubscriptionsWithMetadata,
    getCategoryActionLabel,
} from '../../utils/subscriptionCatalog';

function openExternalLink(url) {
    if (url.startsWith('mailto:') || url.startsWith('tel:')) {
        window.location.href = url;
        return;
    }

    window.open(url, '_blank', 'noopener,noreferrer');
}

function CategoryAction({ href, label, icon: Icon }) {
    if (!href) return null;

    return (
        <button
            type="button"
            className="category-action-btn"
            onClick={() => openExternalLink(href)}
        >
            {Icon ? <Icon size={16} /> : null}
            <span>{label}</span>
        </button>
    );
}

function ShareActions({ url, title }) {
    const [copied, setCopied] = useState(false);

    if (!url) return null;

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy', err);
        }
    };

    const handleShare = async () => {
        if (navigator.share) {
            try {
                await navigator.share({ title, url });
            } catch {
                // handle error or cancel
            }
        } else {
            handleCopy();
        }
    };

    return (
        <>
            {navigator.share && (
                <button
                    type="button"
                    className="category-action-btn"
                    onClick={handleShare}
                >
                    <Share2 size={16} />
                    <span>Share</span>
                </button>
            )}
            <button
                type="button"
                className="category-action-btn"
                onClick={handleCopy}
            >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                <span>{copied ? 'Copied!' : 'Copy Link'}</span>
            </button>
        </>
    );
}

export default function CategoryWindowModal({ categoryId, onClose }) {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    const category = getCategoryById(categoryId);

    useEffect(() => {
        let cancelled = false;

        const loadItems = async () => {
            setLoading(true);
            setErrorMessage('');

            try {
                const subscriptions = await fetchActiveSubscriptionsWithMetadata();
                if (cancelled) return;

                setItems(
                    subscriptions.filter((subscription) => subscription.category === category.id)
                );
            } catch (error) {
                if (!cancelled) {
                    setErrorMessage(error.message || 'Unable to load this category right now.');
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        loadItems();

        return () => {
            cancelled = true;
        };
    }, [category.id]);

    const title = useMemo(() => category.label, [category.label]);
    const primaryActionLabel = getCategoryActionLabel(category.id);

    const filteredItems = useMemo(() => {
        if (!searchQuery.trim()) return items;
        const query = searchQuery.toLowerCase();
        return items.filter(item => 
            (item.title && item.title.toLowerCase().includes(query)) ||
            (item.description && item.description.toLowerCase().includes(query)) ||
            (item.contact && item.contact.toLowerCase().includes(query)) ||
            (item.categoryLabel && item.categoryLabel.toLowerCase().includes(query))
        );
    }, [items, searchQuery]);

    return (
        <div className="modal">
            <div className="modal-content category-window-modal modal-fixed-corners">
                <div className="modal-scroll-area">
                    <div className="category-window-header">
                        <div>
                            <p className="category-window-kicker">Category Window</p>
                            <h2>{title}</h2>
                            <p className="category-window-description">
                                {category.description}
                            </p>
                        </div>
                    </div>

                    {!loading && !errorMessage && items.length > 0 && (
                        <div className="category-search-container" style={{ marginBottom: '20px' }}>
                            <div style={{ position: 'relative' }}>
                                <Search size={20} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                                <input
                                    type="text"
                                    placeholder="Search ads..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '12px 12px 12px 40px',
                                        borderRadius: '12px',
                                        border: '1px solid #e2e8f0',
                                        fontSize: '16px',
                                        outline: 'none',
                                        backgroundColor: '#f8fafc'
                                    }}
                                />
                            </div>
                        </div>
                    )}

                    {loading ? (
                        <div className="category-empty-state">
                            <div className="spinner"></div>
                            <p>Loading live entries...</p>
                        </div>
                    ) : errorMessage ? (
                        <div className="category-empty-state error">
                            <p>{errorMessage}</p>
                        </div>
                    ) : items.length === 0 ? (
                        <div className="category-empty-state">
                            <p>{category.emptyState}</p>
                        </div>
                    ) : filteredItems.length === 0 ? (
                        <div className="category-empty-state">
                            <p>No ads found matching "{searchQuery}".</p>
                        </div>
                    ) : (
                        <div className="category-card-grid">
                            {filteredItems.map((item) => (
                                <article key={item.id} className="category-card">
                                    {item.imageUrl ? (
                                        <img
                                            src={item.imageUrl}
                                            alt={item.title}
                                            className="category-card-image"
                                        />
                                    ) : (
                                        <div className="category-card-image fallback">
                                            <span>{item.title}</span>
                                        </div>
                                    )}

                                    <div className="category-card-body">
                                        <div className="category-card-topline">
                                            <h3>{item.title}</h3>
                                            {item.categoryLabel && (
                                                <span className="category-chip">{item.categoryLabel}</span>
                                            )}
                                        </div>

                                        {item.description && (
                                            <p className="category-card-description">{item.description}</p>
                                        )}

                                        {item.contact && (
                                            <p className="category-card-meta">
                                                <strong>Contact:</strong> {item.contact}
                                            </p>
                                        )}
                                        {item.email && (
                                            <p className="category-card-meta">
                                                <strong>Email:</strong> {item.email}
                                            </p>
                                        )}
                                        {item.phone && (
                                            <p className="category-card-meta">
                                                <strong>Phone:</strong> {item.phone}
                                            </p>
                                        )}

                                        <div className="category-card-actions">
                                            <ShareActions
                                                url={item.primaryActionUrl}
                                                title={item.title}
                                            />
                                            <CategoryAction
                                                href={item.primaryActionUrl}
                                                label={primaryActionLabel}
                                                icon={Globe}
                                            />
                                            <CategoryAction
                                                href={item.resumeUrl}
                                                label="Open Resume"
                                                icon={FileText}
                                            />
                                            <CategoryAction
                                                href={item.videoUrl}
                                                label="Open Video"
                                                icon={Video}
                                            />
                                            <CategoryAction
                                                href={item.email ? `mailto:${item.email}` : ''}
                                                label="Send Email"
                                                icon={Mail}
                                            />
                                            <CategoryAction
                                                href={item.phone ? `tel:${item.phone}` : ''}
                                                label="Call"
                                                icon={Phone}
                                            />
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </div>

                <button className="close-btn" onClick={onClose}>&times;</button>
            </div>
        </div>
    );
}
