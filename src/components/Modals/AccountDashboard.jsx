import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../services/supabaseClient';
import { fetchActiveSubscriptionsWithMetadata } from '../../utils/subscriptionCatalog';
import EditAdModal from './EditAdModal';

export default function AccountDashboard({ onClose }) {
    const { user } = useAuth();
    const [userAds, setUserAds] = useState([]);
    const [loading, setLoading] = useState(true);
    const [deletingId, setDeletingId] = useState(null);
    const [editingAd, setEditingAd] = useState(null);

    useEffect(() => {
        if (!user) return;

        let cancelled = false;

        const fetchUserAds = async () => {
            setLoading(true);

            try {
                const data = await fetchActiveSubscriptionsWithMetadata({ ownerId: user.id, forceMetadata: true });
                if (!cancelled) {
                    setUserAds(data);
                }
            } catch {
                if (!cancelled) {
                    setUserAds([]);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        fetchUserAds();
        window.addEventListener('adPublished', fetchUserAds);

        return () => {
            cancelled = true;
            window.removeEventListener('adPublished', fetchUserAds);
        };
    }, [user]);

    const handleDelete = async (ad) => {
        if (!ad?.id) {
            alert('This item is missing an ID and cannot be deleted.');
            return;
        }

        if (!window.confirm(`Are you sure you want to delete "${ad.title}"?`)) {
            return;
        }

        setDeletingId(ad.id);

        const { data, error } = await supabase
            .from('subscriptions')
            .delete()
            .eq('id', ad.id)
            .select();

        if (error) {
            alert(`Delete failed: ${error.message}`);
        } else if (!data || data.length === 0) {
            alert('The request was sent, but the ad was not deleted. Please check your Supabase RLS policies.');
        } else {
            setUserAds((current) => current.filter((item) => item.id !== ad.id));
            alert('Entry deleted successfully.');
        }

        setDeletingId(null);
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        onClose();
        alert('You have logged out.');
    };

    if (editingAd) {
        return (
            <EditAdModal 
                ad={editingAd} 
                onClose={() => setEditingAd(null)}
                onSaved={() => setEditingAd(null)}
            />
        );
    }

    return (
        <div className="modal">
            <div className="modal-content login-content account-dashboard-modal modal-fixed-corners">
                <div className="modal-scroll-area">
                    <h2>My Account</h2>
                    <p className="account-email">Logged in as: {user?.email}</p>

                    <div className="account-dashboard-body">
                        <h3>Your Published Ads</h3>
                        <div className="user-ads-list">
                            {loading ? (
                                <p className="user-ads-empty">Loading your active entries...</p>
                            ) : userAds.length === 0 ? (
                                <p className="user-ads-empty">No active advertisements.</p>
                            ) : (
                                userAds.map((ad) => (
                                    <div key={ad.id} className="user-ad-item">
                                        <div className="user-ad-main">
                                            {ad.imageUrl && (
                                                <img src={ad.imageUrl} alt={ad.title} className="user-ad-thumb" />
                                            )}

                                            <div className="user-ad-info">
                                                <div className="user-ad-heading">
                                                    <h4>{ad.title}</h4>
                                                    <span className="category-chip">{ad.categoryLabel}</span>
                                                </div>

                                                {ad.description && (
                                                    <p className="user-ad-summary">{ad.description}</p>
                                                )}

                                                {ad.primaryActionUrl ? (
                                                    <p className="user-ad-url">
                                                        Link: <a href={ad.primaryActionUrl} target="_blank" rel="noreferrer">{ad.primaryActionUrl}</a>
                                                    </p>
                                                ) : ad.email ? (
                                                    <p className="user-ad-url">Email: {ad.email}</p>
                                                ) : ad.contact ? (
                                                    <p className="user-ad-url">Contact: {ad.contact}</p>
                                                ) : null}
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center', justifyContent: 'center' }}>
                                            <button
                                                className="edit-ad-btn"
                                                onClick={() => setEditingAd(ad)}
                                                disabled={deletingId === ad.id}
                                                title="Edit Ad"
                                                style={{ 
                                                    padding: '6px 12px', 
                                                    background: '#3b82f6', 
                                                    color: 'white', 
                                                    border: 'none', 
                                                    borderRadius: '4px', 
                                                    cursor: 'pointer',
                                                    fontSize: '0.8rem',
                                                    fontWeight: 'bold',
                                                    boxShadow: 'none'
                                                }}
                                            >
                                                Edit
                                            </button>
                                            <button
                                                className="delete-ad-btn"
                                                onClick={() => handleDelete(ad)}
                                                disabled={deletingId === ad.id}
                                                title="Delete Ad"
                                                style={{ position: 'static' }}
                                            >
                                                &times;
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <button onClick={handleLogout} className="secondary-btn full-width-btn">Log Out</button>
                </div>
                <button className="close-btn" onClick={onClose}>&times;</button>
            </div>
        </div>
    );
}
