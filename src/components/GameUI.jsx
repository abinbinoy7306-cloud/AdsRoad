import React, { Suspense, lazy } from 'react';
import { Menu, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { AD_CATEGORIES } from '../data/adCategories';

const AuthModal = lazy(() => import('./Modals/AuthModal'));
const AccountDashboard = lazy(() => import('./Modals/AccountDashboard'));
const PurchaseSpaceModal = lazy(() => import('./Modals/PurchaseSpaceModal'));
const PublishBillboardModal = lazy(() => import('./Modals/PublishBillboardModal'));
const AdPlayerModal = lazy(() => import('./Modals/AdPlayerModal'));
const CategoryWindowModal = lazy(() => import('./Modals/CategoryWindowModal'));

const StatsPanel = React.memo(function StatsPanel() {
    const { eggBalance } = useAuth();

    return (
        <div className="stats-panel">
            <span className="egg-icon" role="img" aria-label="Egg balance">🥚</span>
            <span>{eggBalance}</span>
        </div>
    );
});

const LoginButton = React.memo(function LoginButton({ onClick }) {
    const { user } = useAuth();

    return (
        <button onClick={onClick} className="secondary-btn">
            {user ? 'My Account' : 'Log In'}
        </button>
    );
});

export default React.memo(function GameUI({
    modals,
    rewardAd,
    lastRewardAdId,
    activeSceneCategoryId,
    isCategorySidebarOpen,
    activeCategoryWindow,
    onLoginClick,
    onSubsClick,
    onAdClose,
    onAdFinish,
    onToggleCategorySidebar,
    onCloseCategorySidebar,
    onShowAllCategories,
    onOpenCategoryScene,
    onOpenCategoryWindow,
    onCloseModal,
    onProceedPurchase,
    onPublishedBillboard,
    onCloseCategoryWindow,
}) {
    return (
        <>
            <div id="ui-overlay">
                <StatsPanel />

                <div className="right-controls">
                    <LoginButton onClick={onLoginClick} />
                    <button onClick={onSubsClick}>Buy Billboards</button>
                    <button
                        type="button"
                        className="menu-toggle-btn secondary-btn"
                        aria-label={isCategorySidebarOpen ? 'Close category sidebar' : 'Open category sidebar'}
                        aria-expanded={isCategorySidebarOpen}
                        onClick={onToggleCategorySidebar}
                    >
                        {isCategorySidebarOpen ? <X size={22} /> : <Menu size={22} />}
                    </button>
                </div>
            </div>

            {isCategorySidebarOpen && (
                <div
                    className="sidebar-backdrop"
                    onClick={onCloseCategorySidebar}
                    aria-hidden="true"
                />
            )}

            <aside className={`category-sidebar ${isCategorySidebarOpen ? 'open' : ''}`}>
                <div className="category-sidebar-header">
                    <div>
                        <p className="category-sidebar-kicker">Browse</p>
                        <h3>Categories</h3>
                    </div>
                    <button
                        type="button"
                        className="category-sidebar-close"
                        aria-label="Close category sidebar"
                        onClick={onCloseCategorySidebar}
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="category-sidebar-list">
                    <button
                        type="button"
                        className={`category-nav-btn category-nav-root ${activeSceneCategoryId === null ? 'active' : ''}`}
                        onClick={onShowAllCategories}
                    >
                        <span>All Categories</span>
                    </button>

                    {AD_CATEGORIES.map((category) => (
                        <div
                            key={category.id}
                            className={`category-nav-group ${activeSceneCategoryId === category.id ? 'active' : ''}`}
                        >
                            <button
                                type="button"
                                className="category-nav-btn category-nav-primary"
                                onClick={() => onOpenCategoryScene(category.id)}
                            >
                                <span>{category.label}</span>
                            </button>
                            <button
                                type="button"
                                className="category-subnav-btn"
                                onClick={() => onOpenCategoryWindow(category.id)}
                            >
                                Category Window
                            </button>
                        </div>
                    ))}
                </div>
            </aside>

            <Suspense fallback={null}>
                {modals.auth && <AuthModal onClose={() => onCloseModal('auth')} />}
                {modals.account && <AccountDashboard onClose={() => onCloseModal('account')} />}
                {modals.purchase && (
                    <PurchaseSpaceModal
                        onClose={() => onCloseModal('purchase')}
                        onProceed={onProceedPurchase}
                    />
                )}
                {modals.publish && (
                    <PublishBillboardModal
                        onClose={() => onCloseModal('publish')}
                        onPublished={onPublishedBillboard}
                    />
                )}
                {modals.adPlayer && (
                    <AdPlayerModal
                        ad={rewardAd}
                        activeCategoryId={activeSceneCategoryId}
                        excludeAdId={lastRewardAdId}
                        onClose={onAdClose}
                        onComplete={onAdFinish}
                    />
                )}
                {activeCategoryWindow && (
                    <CategoryWindowModal
                        categoryId={activeCategoryWindow}
                        onClose={onCloseCategoryWindow}
                    />
                )}
            </Suspense>
        </>
    );
});
