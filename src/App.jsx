import React, { Suspense, useState } from 'react';
import { useAuth } from './contexts/AuthContext';
import { isPasswordRecoveryPending } from './utils/authRedirect';
import GameContainer from './components/GameContainer';
import GameUI from './components/GameUI';

const LeaderboardPanel = React.lazy(() => import('./components/LeaderboardPanel'));
const ContactSection = React.lazy(() => import('./components/ContactSection'));

const PENDING_BILLBOARD_SLOTS_STORAGE_KEY = 'adsroad_pending_billboard_slots_v1';

function readPendingSlotMap() {
    try {
        const raw = window.localStorage.getItem(PENDING_BILLBOARD_SLOTS_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function writePendingSlotMap(slotMap) {
    try {
        window.localStorage.setItem(PENDING_BILLBOARD_SLOTS_STORAGE_KEY, JSON.stringify(slotMap));
    } catch {
        // Ignore storage write errors (private mode/quota).
    }
}

export default function App() {
    const { user, eggBalance, updateEggBalanceLocal, loading: authLoading } = useAuth();
    const userId = user?.id;

    const [modals, setModals] = useState({
        auth: false,
        account: false,
        purchase: false,
        publish: false,
        adPlayer: false,
    });
    const [rewardAd, setRewardAd] = useState(null);
    const [lastRewardAdId, setLastRewardAdId] = useState(null);
    const [activeSceneCategoryId, setActiveSceneCategoryId] = useState(null);
    const [isCategorySidebarOpen, setIsCategorySidebarOpen] = useState(false);
    const [activeCategoryWindow, setActiveCategoryWindow] = useState(null);
    const [pendingPublishSlots, setPendingPublishSlots] = useState(0);

    React.useEffect(() => {
        if (!userId) {
            setPendingPublishSlots(0);
            return;
        }
        const slotMap = readPendingSlotMap();
        const count = Number(slotMap[userId] ?? 0);
        setPendingPublishSlots(Number.isFinite(count) ? Math.max(0, count) : 0);
    }, [userId]);

    React.useEffect(() => {
        if (authLoading) return;

        if (isPasswordRecoveryPending()) {
            setModals((current) => ({ ...current, auth: true }));
            return;
        }

        if (user) {
            setModals((current) => (current.auth ? { ...current, auth: false } : current));
        }
    }, [authLoading, user]);

    const updatePendingSlots = React.useCallback((nextCountOrUpdater) => {
        if (!userId) return;

        setPendingPublishSlots((current) => {
            const computedCount = typeof nextCountOrUpdater === 'function'
                ? nextCountOrUpdater(current)
                : nextCountOrUpdater;
            const safeCount = Math.max(0, Number(computedCount) || 0);
            const slotMap = readPendingSlotMap();
            slotMap[userId] = safeCount;
            writePendingSlotMap(slotMap);
            return safeCount;
        });
    }, [userId]);

    const openModal = React.useCallback((name) => setModals((current) => ({ ...current, [name]: true })), []);
    const closeModal = React.useCallback((name) => setModals((current) => ({ ...current, [name]: false })), []);

    const handleLoginClick = React.useCallback(() => {
        if (user) {
            openModal('account');
        } else {
            openModal('auth');
        }
    }, [openModal, user]);

    const handleSubsClick = React.useCallback(() => {
        if (!user) {
            alert('Please log in to manage your billboards.');
            openModal('auth');
        } else if (pendingPublishSlots > 0) {
            openModal('publish');
        } else {
            openModal('purchase');
        }
    }, [openModal, pendingPublishSlots, user]);

    const handleEggClaimed = React.useCallback((_eggId, ad) => {
        setRewardAd(ad ?? null);
        setLastRewardAdId(ad?.id ?? null);
        openModal('adPlayer');
    }, [openModal]);

    const handleAdClose = React.useCallback(() => {
        setRewardAd(null);
        closeModal('adPlayer');
    }, [closeModal]);

    const handleAdFinish = React.useCallback(() => {
        updateEggBalanceLocal(eggBalance + 1);
        setRewardAd(null);
        closeModal('adPlayer');
    }, [closeModal, eggBalance, updateEggBalanceLocal]);

    const openCategoryScene = React.useCallback((categoryId) => {
        setActiveSceneCategoryId(categoryId);
        setIsCategorySidebarOpen(false);
    }, []);

    const openCategoryWindow = React.useCallback((categoryId) => {
        setActiveSceneCategoryId(categoryId);
        setActiveCategoryWindow(categoryId);
        setIsCategorySidebarOpen(false);
    }, []);

    const showAllCategories = React.useCallback(() => {
        setActiveSceneCategoryId(null);
        setActiveCategoryWindow(null);
        setIsCategorySidebarOpen(false);
    }, []);

    const handleProceedPurchase = React.useCallback(() => {
        updatePendingSlots((current) => current + 1);
        closeModal('purchase');
        openModal('publish');
    }, [closeModal, openModal, updatePendingSlots]);

    const handlePublishedBillboard = React.useCallback(() => {
        updatePendingSlots((current) => Math.max(0, current - 1));
    }, [updatePendingSlots]);

    const handleCloseCategoryWindow = React.useCallback(() => {
        setActiveCategoryWindow(null);
    }, []);

    const handleToggleCategorySidebar = React.useCallback(() => {
        setIsCategorySidebarOpen((current) => !current);
    }, []);

    const handleCloseCategorySidebar = React.useCallback(() => {
        setIsCategorySidebarOpen(false);
    }, []);

    const isAnyModalOpen = modals.auth || modals.account || modals.purchase || modals.publish || modals.adPlayer || !!activeCategoryWindow || isCategorySidebarOpen;
    const isGamePaused = modals.adPlayer;

    return (
        <div id="game-container" className={isGamePaused ? 'game-paused' : ''}>
            <GameContainer
                activeCategoryId={activeSceneCategoryId}
                onEggClick={handleEggClaimed}
                onBillboardClick={handleSubsClick}
                lastRewardAdId={lastRewardAdId}
                isModalOpen={isAnyModalOpen}
                paused={isGamePaused}
            />

            <GameUI
                modals={modals}
                rewardAd={rewardAd}
                lastRewardAdId={lastRewardAdId}
                activeSceneCategoryId={activeSceneCategoryId}
                isCategorySidebarOpen={isCategorySidebarOpen}
                activeCategoryWindow={activeCategoryWindow}
                onLoginClick={handleLoginClick}
                onSubsClick={handleSubsClick}
                onAdClose={handleAdClose}
                onAdFinish={handleAdFinish}
                onToggleCategorySidebar={handleToggleCategorySidebar}
                onCloseCategorySidebar={handleCloseCategorySidebar}
                onShowAllCategories={showAllCategories}
                onOpenCategoryScene={openCategoryScene}
                onOpenCategoryWindow={openCategoryWindow}
                onCloseModal={closeModal}
                onProceedPurchase={handleProceedPurchase}
                onPublishedBillboard={handlePublishedBillboard}
                onCloseCategoryWindow={handleCloseCategoryWindow}
            />

            <Suspense fallback={null}>
                <LeaderboardPanel />
                <ContactSection />
            </Suspense>
        </div>
    );
}
