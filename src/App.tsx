import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { TicketCard } from './components/TicketCard';
import { BettingBoard } from './components/BettingBoard';
import { BetModal } from './components/BetModal';
import { CountdownOverlay } from './components/CountdownOverlay';
import { HistorySection } from './components/HistorySection';
import { DepositModal } from './components/DepositModal';
import { WithdrawModal } from './components/WithdrawModal';
import { WinModal } from './components/WinModal';
import { RulesModal } from './components/RulesModal';
import { InviteModal } from './components/InviteModal';
import { SplashScreen } from './components/SplashScreen';
import { AdminPanel } from './components/AdminPanel';
import { WordPressAdminBar } from './components/WordPressAdminBar';
import { AuthScreen } from './components/AuthScreen';
import {
  DrawResult,
  UserBet,
  PaymentTransaction,
  BetCategory,
  GameTimeOption,
  AppTheme,
  RegisteredUser,
  AdminSummary,
  ForcedOutcomeSpec
} from './types/game';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  getInitialHistoryByMode,
  generateSingleDrawResult,
  getBigSmallForNumber,
  getColorsForNumber,
  calculateBetWin,
  getSecondsRemainingForMode,
  getPeriodForMode,
  setServerTimeOffset,
  getServerNow
} from './utils/gameRules';
import { soundManager } from './utils/audio';
import { auth } from './firebase';
import {
  adminDeleteTransactionInFirestore,
  adminDeleteUserInFirestore,
  adminSyncDrawRecordToFirestore,
  adminUpdateTransactionInFirestore,
  adminUpsertUserToFirestore,
  blockPhoneInFirestore,
  createBetInFirestore,
  createTransactionInFirestore,
  ensureAdminDocument,
  isVerifiedGoogleAdmin,
  pushAdminSnapshotToFirestore,
  settleBetInFirestore,
  signInWithGoogleFirebase,
  signOutFirebase,
  subscribeAdminFirestoreState,
  subscribeBlockedPhonesFromFirestore,
  subscribePlayerFirestoreState,
  syncGameModeOverrideToFirestore,
  syncPlayerBalanceToFirestore,
  unblockPhoneInFirestore,
} from './services/firebaseSync';

export default function App() {
  // 1. Theme, Language & Audio State
  const [theme, setTheme] = useState<AppTheme>(() => {
    const saved = localStorage.getItem('aloye_wingo_theme');
    return (saved as AppTheme) || 'blue';
  });
  const [language] = useState<'ur' | 'en'>('en');
  const [muted, setMuted] = useState<boolean>(false);

  useEffect(() => {
    localStorage.setItem('aloye_wingo_theme', theme);
  }, [theme]);

  useEffect(() => {
    try {
      document.title = 'Muna WinGo';
    } catch {
      // ignore
    }
  }, []);

  // 2. Authenticated User Session (Strict DB-Only Balance & State — NO localStorage balance/users)
  const [currentUser, setCurrentUser] = useState<RegisteredUser | null>(() => {
    try {
      const saved = localStorage.getItem('muna_current_user');
      return saved ? (JSON.parse(saved) as RegisteredUser) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    try {
      localStorage.removeItem('aloye_wingo_balance');
      localStorage.removeItem('muna_user_balances');
      localStorage.removeItem('muna_registered_users');
      localStorage.removeItem('muna_referral_earnings');
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      if (currentUser) {
        localStorage.setItem(
          'muna_current_user',
          JSON.stringify({
            id: currentUser.id,
            fullName: currentUser.fullName,
            phone: currentUser.phone,
            inviteCode: currentUser.inviteCode,
            createdAt: currentUser.createdAt,
          })
        );
      } else {
        localStorage.removeItem('muna_current_user');
      }
    } catch {
      // ignore
    }
  }, [currentUser]);

  const [balance, setBalance] = useState<number>(0);

  const [transactions, setTransactions] = useState<PaymentTransaction[]>(() => {
    const saved = localStorage.getItem('aloye_wingo_transactions');
    return saved ? JSON.parse(saved) : [];
  });

  const [userBets, setUserBets] = useState<UserBet[]>(() => {
    const saved = localStorage.getItem('aloye_wingo_bets');
    return saved ? JSON.parse(saved) : [];
  });

  const balanceRef = useRef<number>(balance);
  const lastServerBalanceUpdatedAtRef = useRef<number>(0);

  useEffect(() => {
    balanceRef.current = balance;
  }, [balance]);

  useEffect(() => {
    try {
      localStorage.setItem('aloye_wingo_transactions', JSON.stringify(transactions));
    } catch {
      try {
        const lightweight = transactions.map(({ screenshotUrl: _s, ...rest }) => rest);
        localStorage.setItem('aloye_wingo_transactions', JSON.stringify(lightweight));
      } catch {
        // ignore storage quota errors
      }
    }
  }, [transactions]);

  useEffect(() => {
    try {
      localStorage.setItem('aloye_wingo_bets', JSON.stringify(userBets));
    } catch {
      // ignore storage quota errors
    }
  }, [userBets]);

  // Multi-tab session/history listener (never syncs balance from localStorage)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'muna_current_user') {
        try {
          setCurrentUser(e.newValue ? (JSON.parse(e.newValue) as RegisteredUser) : null);
        } catch {
          setCurrentUser(null);
        }
      }
      if (e.key === 'muna_forced_numbers' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue) as Record<GameTimeOption, number | null>;
          forcedNumbersRef.current = parsed;
          setForcedNumbers(parsed);
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // 3. Game Cycle State with Continuous Absolute Synchronized Clock
  const [gameTime, setGameTime] = useState<GameTimeOption>(60);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(() =>
    getSecondsRemainingForMode(60)
  );
  const [currentPeriod, setCurrentPeriod] = useState<string>(() =>
    getPeriodForMode(60)
  );
  const [historyByMode, setHistoryByMode] = useState<Record<GameTimeOption, DrawResult[]>>(() =>
    getInitialHistoryByMode()
  );

  // Active gameHistory dynamically derived from the selected gameTime mode
  const gameHistory = historyByMode[gameTime] || [];

  const historyByModeRef = useRef(historyByMode);
  const userBetsRef = useRef(userBets);

  // Persist continuous history across reloads & sessions
  useEffect(() => {
    historyByModeRef.current = historyByMode;
    try {
      localStorage.setItem('aloye_wingo_history_by_mode', JSON.stringify(historyByMode));
    } catch {
      // ignore
    }
  }, [historyByMode]);

  useEffect(() => {
    userBetsRef.current = userBets;
  }, [userBets]);

  // Synchronized refs to prevent stale closures and prevent interval restarts
  const gameTimeRef = useRef<GameTimeOption>(gameTime);
  const lastPlayedSecondRef = useRef<number>(-1);
  const lastPeriodPerModeRef = useRef<Record<GameTimeOption, string>>({
    30: getPeriodForMode(30),
    60: getPeriodForMode(60),
    180: getPeriodForMode(180),
    300: getPeriodForMode(300),
  });

  useEffect(() => {
    gameTimeRef.current = gameTime;
  }, [gameTime]);

  // 4. Betting Multiplier & Active Bet State
  const [selectedMultiplier, setSelectedMultiplier] = useState<number>(1);
  const [activeCategory, setActiveCategory] = useState<BetCategory | null>(null);
  const [activeSelection, setActiveSelection] = useState<string | number | null>(null);

  // 5. Modals State
  const [isLoadingSplash, setIsLoadingSplash] = useState<boolean>(true);
  const isLoadingSplashRef = useRef<boolean>(isLoadingSplash);
  useEffect(() => {
    isLoadingSplashRef.current = isLoadingSplash;
  }, [isLoadingSplash]);

  const isUserSignedInRef = useRef<boolean>(Boolean(currentUser));
  useEffect(() => {
    isUserSignedInRef.current = Boolean(currentUser);
  }, [currentUser]);

  const [adminPin, setAdminPin] = useState<string>(() => {
    return localStorage.getItem('muna_admin_master_pin') || '786';
  });
  const [adminUsers, setAdminUsers] = useState<RegisteredUser[]>([]);
  const [blockedPhones, setBlockedPhones] = useState<string[]>([]);
  const [commitHashes, setCommitHashes] = useState<Partial<Record<GameTimeOption, string>>>({});
  const [adminTransactions, setAdminTransactions] = useState<PaymentTransaction[]>([]);
  const [adminBets, setAdminBets] = useState<UserBet[]>([]);
  const [adminSummary, setAdminSummary] = useState<AdminSummary | undefined>(undefined);
  const [lastAdminSyncedAt, setLastAdminSyncedAt] = useState<number>(0);
  const [referralEarnings, setReferralEarnings] = useState<number>(0);
  const [invitedCount, setInvitedCount] = useState<number>(0);

  const currentUserRef = useRef<RegisteredUser | null>(currentUser);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  const adminPinRef = useRef<string>(adminPin);
  useEffect(() => {
    adminPinRef.current = adminPin;
  }, [adminPin]);

  const settledPeriodsRef = useRef<Set<string>>(new Set());
  const playerSyncSeqRef = useRef<number>(0);
  const betInFlightRef = useRef<number>(0);
  const adminLocalSyncedRef = useRef<boolean>(false);
  const deletedUserIdsRef = useRef<Set<string>>(
    (() => {
      try {
        const raw = localStorage.getItem('muna_deleted_user_ids');
        return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
      } catch {
        return new Set<string>();
      }
    })()
  );
  const deletedPhonesRef = useRef<Set<string>>(
    (() => {
      try {
        const raw = localStorage.getItem('muna_deleted_phones');
        return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
      } catch {
        return new Set<string>();
      }
    })()
  );
  const serverAdminUsersRef = useRef<RegisteredUser[]>([]);
  const firestoreAdminUsersRef = useRef<RegisteredUser[]>([]);
  const prevFirestoreIdsRef = useRef<Set<string>>(new Set());

  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [firebaseAuthReady, setFirebaseAuthReady] = useState<boolean>(false);
  const firebaseUserRef = useRef<User | null>(null);
  useEffect(() => {
    firebaseUserRef.current = firebaseUser;
  }, [firebaseUser]);

  const [isAdminOpen, setIsAdminOpen] = useState<boolean>(false);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const hasAdminParam =
        urlParams.get('admin') === 'true' ||
        urlParams.get('admin') === '1' ||
        window.location.hash.includes('admin');
      const savedAdmin = localStorage.getItem('muna_admin_logged_in') === 'true';
      return hasAdminParam || savedAdmin;
    } catch {
      return false;
    }
  });
  const isAdminAuthRef = useRef<boolean>(isAdminAuthenticated);
  useEffect(() => {
    isAdminAuthRef.current = isAdminAuthenticated;
  }, [isAdminAuthenticated]);

  const [isPlayerViewOnly, setIsPlayerViewOnly] = useState<boolean>(false);

  const [isDepositOpen, setIsDepositOpen] = useState<boolean>(false);
  const [depositInitialTab, setDepositInitialTab] = useState<'form' | 'history'>('form');
  const [isWithdrawOpen, setIsWithdrawOpen] = useState<boolean>(false);
  const [withdrawInitialTab, setWithdrawInitialTab] = useState<'form' | 'history'>('form');
  const [isRulesOpen, setIsRulesOpen] = useState<boolean>(false);
  const [isInviteOpen, setIsInviteOpen] = useState<boolean>(false);
  const [isBetModalOpen, setIsBetModalOpen] = useState<boolean>(false);
  const [isWinModalOpen, setIsWinModalOpen] = useState<boolean>(false);

  // Admin Forced Next Outcome State (server-authoritative)
  const [forcedNumbers, setForcedNumbers] = useState<Record<GameTimeOption, number | null>>({
    30: null,
    60: null,
    180: null,
    300: null,
  });
  const forcedNumbersRef = useRef(forcedNumbers);

  const [forcedOutcomes, setForcedOutcomes] = useState<
    Record<GameTimeOption, ForcedOutcomeSpec | null>
  >({
    30: null,
    60: null,
    180: null,
    300: null,
  });
  const forcedOutcomesRef = useRef(forcedOutcomes);

  const applyServerForcedMaps = (
    outcomes?: Record<GameTimeOption, ForcedOutcomeSpec | null>,
    numbers?: Record<GameTimeOption, number | null>
  ) => {
    if (outcomes) {
      forcedOutcomesRef.current = outcomes;
      setForcedOutcomes(outcomes);
    }
    if (numbers) {
      forcedNumbersRef.current = numbers;
      setForcedNumbers(numbers);
    }
  };

  const normalizePhoneKey = (raw?: string) => String(raw || '').replace(/\s|-/g, '').trim();

  const persistDeletedTombstones = () => {
    try {
      localStorage.setItem(
        'muna_deleted_user_ids',
        JSON.stringify(Array.from(deletedUserIdsRef.current))
      );
      localStorage.setItem(
        'muna_deleted_phones',
        JSON.stringify(Array.from(deletedPhonesRef.current))
      );
    } catch {
      // ignore
    }
  };

  const isUserDeletedLocally = (u: { id?: string; phone?: string }) => {
    if (u.id && deletedUserIdsRef.current.has(u.id)) return true;
    const cp = normalizePhoneKey(u.phone);
    if (cp && deletedPhonesRef.current.has(cp)) return true;
    return false;
  };

  const purgeActiveSession = (idsToRemove: Set<string>, phonesToRemove?: Set<string>) => {
    try {
      localStorage.removeItem('muna_registered_users');
      localStorage.removeItem('muna_user_balances');
      localStorage.removeItem('aloye_wingo_balance');
      localStorage.removeItem('muna_referral_earnings');
    } catch {
      // ignore
    }

    const active = currentUserRef.current;
    if (
      active &&
      (idsToRemove.has(active.id) ||
        (phonesToRemove && phonesToRemove.has(normalizePhoneKey(active.phone))))
    ) {
      void signOutFirebase();
      currentUserRef.current = null;
      isUserSignedInRef.current = false;
      balanceRef.current = 0;
      setBalance(0);
      setTransactions([]);
      setUserBets([]);
      setCurrentUser(null);
    }
  };

  const recomputeMergedAdminUsers = (): RegisteredUser[] => {
    const merged = new Map<string, RegisteredUser>();
    for (const fu of firestoreAdminUsersRef.current) {
      if (!isUserDeletedLocally(fu)) {
        merged.set(fu.id, fu);
      }
    }
    for (const su of serverAdminUsersRef.current) {
      if (!isUserDeletedLocally(su)) {
        const prev = merged.get(su.id);
        merged.set(su.id, prev ? { ...prev, ...su } : su);
      }
    }
    const sorted = Array.from(merged.values()).sort(
      (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
    );
    setAdminUsers(sorted);
    return sorted;
  };

  const applyAdminSnapshot = (data: {
    serverTime?: number;
    users?: RegisteredUser[];
    deletedUserIds?: string[];
    deletedPhones?: string[];
    blockedPhones?: string[];
    transactions?: PaymentTransaction[];
    bets?: UserBet[];
    summary?: AdminSummary;
    forcedNumbers?: Record<GameTimeOption, number | null>;
    forcedOutcomes?: Record<GameTimeOption, ForcedOutcomeSpec | null>;
    historyByMode?: Record<GameTimeOption, DrawResult[]>;
    commitHashes?: Partial<Record<GameTimeOption, string>>;
  }) => {
    if (typeof data.serverTime === 'number') setServerTimeOffset(data.serverTime);
    if (data.commitHashes) setCommitHashes((prev) => ({ ...prev, ...data.commitHashes }));
    let tombstonesChanged = false;
    if (Array.isArray(data.deletedUserIds)) {
      for (const id of data.deletedUserIds) {
        if (id && !deletedUserIdsRef.current.has(id)) {
          deletedUserIdsRef.current.add(id);
          tombstonesChanged = true;
        }
      }
    }
    if (Array.isArray(data.deletedPhones)) {
      for (const ph of data.deletedPhones) {
        const cp = normalizePhoneKey(ph);
        if (cp && !deletedPhonesRef.current.has(cp)) {
          deletedPhonesRef.current.add(cp);
          tombstonesChanged = true;
        }
      }
    }
    if (Array.isArray(data.blockedPhones)) {
      setBlockedPhones(data.blockedPhones);
      for (const ph of data.blockedPhones) {
        const cp = normalizePhoneKey(ph);
        if (cp && !deletedPhonesRef.current.has(cp)) {
          deletedPhonesRef.current.add(cp);
          tombstonesChanged = true;
        }
      }
    }
    if (tombstonesChanged) {
      persistDeletedTombstones();
      purgeActiveSession(deletedUserIdsRef.current, deletedPhonesRef.current);
      firestoreAdminUsersRef.current = firestoreAdminUsersRef.current.filter(
        (u) => !isUserDeletedLocally(u)
      );
    }
    if (Array.isArray(data.users)) {
      serverAdminUsersRef.current = data.users.filter((u) => !isUserDeletedLocally(u));
      recomputeMergedAdminUsers();
    }
    if (Array.isArray(data.transactions)) setAdminTransactions(data.transactions);
    if (Array.isArray(data.bets)) setAdminBets(data.bets);
    if (data.summary) setAdminSummary(data.summary);
    applyServerForcedMaps(data.forcedOutcomes, data.forcedNumbers);
    if (data.historyByMode) {
      historyByModeRef.current = data.historyByMode;
      setHistoryByMode(data.historyByMode);
    }
    setLastAdminSyncedAt(Date.now());
  };

  const syncLocalRecordsToAdminServer = async (pinToUse: string) => {
    try {
      const rawTxs = localStorage.getItem('aloye_wingo_transactions');
      const localTxs = rawTxs ? JSON.parse(rawTxs) : [];
      if (Array.isArray(localTxs) && localTxs.length > 0) {
        const res = await fetch('/api/admin/sync-local', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pin: pinToUse,
            transactions: localTxs,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          applyAdminSnapshot(data);
          return true;
        }
      }
    } catch {
      // ignore
    }
    return false;
  };

  const fetchAdminState = async (pinOverride?: string) => {
    let pinToUse = pinOverride || adminPinRef.current || '786';
    try {
      if (!adminLocalSyncedRef.current) {
        adminLocalSyncedRef.current = true;
        await syncLocalRecordsToAdminServer(pinToUse);
      }

      let res = await fetch(`/api/admin/state?_t=${Date.now()}`, {
        headers: { 'x-admin-pin': pinToUse },
        cache: 'no-store',
      });

      // If cached custom PIN became stale after server restart, retry default master PIN '786'
      if (res.status === 401 && pinToUse !== '786') {
        res = await fetch(`/api/admin/state?_t=${Date.now()}`, {
          headers: { 'x-admin-pin': '786' },
          cache: 'no-store',
        });
        if (res.ok) {
          pinToUse = '786';
          adminPinRef.current = '786';
          setAdminPin('786');
          localStorage.setItem('muna_admin_master_pin', '786');
        }
      }

      if (res.ok) {
        const data = await res.json();
        applyAdminSnapshot(data);
        return data;
      } else if (res.status === 401) {
        isAdminAuthRef.current = false;
        setIsAdminAuthenticated(false);
        localStorage.removeItem('muna_admin_logged_in');
      }
    } catch {
      // ignore network glitches
    }
    return null;
  };

  const syncPlayerState = async (userId?: string) => {
    const uid = userId ?? currentUserRef.current?.id;
    const reqSeq = playerSyncSeqRef.current;
    try {
      const url = `/api/player/state?${uid ? `userId=${encodeURIComponent(uid)}&` : ''}${currentUserRef.current?.phone ? `phone=${encodeURIComponent(currentUserRef.current.phone)}&` : ''}_t=${Date.now()}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (typeof data.serverTime === 'number') {
        setServerTimeOffset(data.serverTime);
      }
      if (data.commitHashes) {
        setCommitHashes((prev) => ({ ...prev, ...data.commitHashes }));
      }
      if (data.historyByMode) {
        historyByModeRef.current = data.historyByMode;
        setHistoryByMode(data.historyByMode);
      }

      // If this user was deleted or blocked by admin, immediately end their active session
      if (uid && (data.deleted || data.blocked)) {
        deletedUserIdsRef.current.add(uid);
        const cp = normalizePhoneKey(currentUserRef.current?.phone);
        if (cp) deletedPhonesRef.current.add(cp);
        persistDeletedTombstones();
        purgeActiveSession(new Set([uid]), cp ? new Set([cp]) : undefined);
        return;
      }

      // Never overwrite optimistic bet deduction or fresh mutation with stale GET response
      if (betInFlightRef.current > 0 || reqSeq !== playerSyncSeqRef.current) {
        return;
      }

      if (uid && data.user) {
        if (typeof data.balance === 'number') {
          lastServerBalanceUpdatedAtRef.current =
            typeof data.balanceUpdatedAt === 'number' ? data.balanceUpdatedAt : Date.now();
          balanceRef.current = data.balance;
          setBalance(data.balance);
        }
        if (Array.isArray(data.transactions)) {
          setTransactions(data.transactions);
        }
        if (Array.isArray(data.bets)) {
          const prevPending = userBetsRef.current.filter((b) => b.status === 'pending');
          const serverBetsList = data.bets as UserBet[];
          userBetsRef.current = serverBetsList;
          setUserBets(serverBetsList);

          // If a pending bet just settled on server while SSE was missed, show Win/Loss modal right now
          if (prevPending.length > 0) {
            const newlySettled = serverBetsList.filter((sb) =>
              prevPending.some((pb) => pb.id === sb.id && sb.status !== 'pending')
            );
            if (newlySettled.length > 0) {
              const first = newlySettled[0];
              const betMode = (first.mode || 60) as GameTimeOption;
              const settledKey = `${betMode}:${first.period}`;
              if (!settledPeriodsRef.current.has(settledKey)) {
                const sameRoundBets = newlySettled.filter(
                  (b) => (b.mode || 60) === betMode && b.period === first.period
                );
                const modeHistory: DrawResult[] =
                  (data.historyByMode?.[betMode] as DrawResult[] | undefined) ||
                  historyByModeRef.current[betMode] ||
                  [];
                const matchedDraw = modeHistory.find((d) => d.period === first.period);

                if (matchedDraw) {
                  settledPeriodsRef.current.add(settledKey);
                  const totalBetAmount = sameRoundBets.reduce((s, b) => s + b.totalAmount, 0);
                  const totalReturn =
                    Math.round(sameRoundBets.reduce((s, b) => s + (b.winAmount || 0), 0) * 100) /
                    100;
                  const totalProfit =
                    Math.round((totalReturn - totalBetAmount) * 100) / 100;
                  const anyWon = sameRoundBets.some((b) => b.status === 'won');
                  setLatestRoundSummary({
                    result: matchedDraw,
                    roundBets: sameRoundBets,
                    totalReturn,
                    totalProfit,
                    totalBetAmount,
                    isWinner: anyWon,
                    hasBet: true,
                  });
                  setIsWinModalOpen(true);
                }
              }
            }
          }
        }
        if (typeof data.referralEarnings === 'number') {
          setReferralEarnings(data.referralEarnings);
        }
        if (typeof data.invitedCount === 'number') {
          setInvitedCount(data.invitedCount);
        }
      }
    } catch {
      // ignore
    }
  };

  // Sync existing session on mount + SSE live real-time stream
  useEffect(() => {
    const initialUser = currentUserRef.current;
    if (initialUser) {
      fetch('/api/auth/sync-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: initialUser }),
      })
        .then(async (r) => {
          const body = await r.json().catch(() => null);
          if (r.status === 410 || r.status === 403 || body?.deleted || body?.blocked) {
            deletedUserIdsRef.current.add(initialUser.id);
            const cp = normalizePhoneKey(initialUser.phone);
            if (cp) deletedPhonesRef.current.add(cp);
            persistDeletedTombstones();
            purgeActiveSession(new Set([initialUser.id]), cp ? new Set([cp]) : undefined);
            return null;
          }
          return r.ok ? body : null;
        })
        .then((data) => {
          if (!data) return;
          if (typeof data.serverTime === 'number') setServerTimeOffset(data.serverTime);
          if (data.commitHashes) setCommitHashes((prev) => ({ ...prev, ...data.commitHashes }));
          if (typeof data.balance === 'number') {
            lastServerBalanceUpdatedAtRef.current =
              typeof data.balanceUpdatedAt === 'number' ? data.balanceUpdatedAt : Date.now();
            balanceRef.current = data.balance;
            setBalance(data.balance);
          }
          if (Array.isArray(data.transactions)) setTransactions(data.transactions);
          if (Array.isArray(data.bets)) {
            userBetsRef.current = data.bets;
            setUserBets(data.bets);
          }
          if (data.historyByMode) {
            historyByModeRef.current = data.historyByMode;
            setHistoryByMode(data.historyByMode);
          }
          if (typeof data.referralEarnings === 'number') setReferralEarnings(data.referralEarnings);
          if (typeof data.invitedCount === 'number') setInvitedCount(data.invitedCount);
        })
        .catch(() => {});
    } else {
      syncPlayerState();
    }

    if (isAdminAuthRef.current) {
      fetchAdminState();
    }
  }, []);

  useEffect(() => {
    const uid = currentUser?.id || '';
    const es = new EventSource(`/api/stream${uid ? `?userId=${encodeURIComponent(uid)}` : ''}`);

    es.addEventListener('connected', (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data);
        if (typeof data.serverTime === 'number') setServerTimeOffset(data.serverTime);
        if (data.commitHashes) setCommitHashes((prev) => ({ ...prev, ...data.commitHashes }));
      } catch {
        // ignore
      }
    });

    es.addEventListener('ping', (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data);
        if (typeof data.t === 'number') setServerTimeOffset(data.t);
      } catch {
        // ignore
      }
    });

    es.addEventListener('forced_updated', (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data);
        if (typeof data.serverTime === 'number') setServerTimeOffset(data.serverTime);
        applyServerForcedMaps(data.forcedOutcomes, data.forcedNumbers);
      } catch {
        // ignore
      }
    });

    es.addEventListener('balance_updated', (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as {
          userId?: string;
          balance?: number;
          balanceUpdatedAt?: number;
        };
        if (
          data.userId &&
          data.userId === currentUserRef.current?.id &&
          typeof data.balance === 'number' &&
          betInFlightRef.current === 0
        ) {
          playerSyncSeqRef.current += 1;
          lastServerBalanceUpdatedAtRef.current =
            typeof data.balanceUpdatedAt === 'number' ? data.balanceUpdatedAt : Date.now();
          balanceRef.current = data.balance;
          setBalance(data.balance);
        }
      } catch {
        // ignore
      }
    });

    es.addEventListener('user_deleted', (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as {
          userId?: string;
          phone?: string;
        };
        const active = currentUserRef.current;
        if (
          active &&
          (data.userId === active.id ||
            (data.phone && normalizePhoneKey(data.phone) === normalizePhoneKey(active.phone)))
        ) {
          deletedUserIdsRef.current.add(active.id);
          const cp = normalizePhoneKey(active.phone);
          if (cp) deletedPhonesRef.current.add(cp);
          persistDeletedTombstones();
          purgeActiveSession(new Set([active.id]), cp ? new Set([cp]) : undefined);
          showToast('Your account was removed and blocked by Admin.');
        }
      } catch {
        // ignore
      }
    });

    es.addEventListener('state_changed', () => {
      syncPlayerState(currentUserRef.current?.id);
      if (isAdminAuthRef.current) {
        fetchAdminState();
      }
    });

    es.addEventListener('round_settled', (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as {
          serverTime?: number;
          mode: GameTimeOption;
          period: string;
          result: DrawResult;
          commitHashes?: Partial<Record<GameTimeOption, string>>;
          forcedNumbers?: Record<GameTimeOption, number | null>;
          forcedOutcomes?: Record<GameTimeOption, ForcedOutcomeSpec | null>;
          settledByUser?: Record<
            string,
            {
              bets: UserBet[];
              totalReturn: number;
              totalProfit: number;
              totalBetAmount: number;
              anyWon: boolean;
              newBalance: number;
            }
          >;
        };

        if (typeof data.serverTime === 'number') setServerTimeOffset(data.serverTime);
        if (data.commitHashes) setCommitHashes((prev) => ({ ...prev, ...data.commitHashes }));
        applyServerForcedMaps(data.forcedOutcomes, data.forcedNumbers);

        if (data.result && data.mode) {
          setHistoryByMode((prev) => {
            const existingForMode = prev[data.mode] || [];
            if (existingForMode.some((p) => p.period === data.result.period)) {
              return prev;
            }
            return {
              ...prev,
              [data.mode]: [data.result, ...existingForMode].slice(0, 80),
            };
          });
        }

        const activeUser = currentUserRef.current;
        const settledKey = `${data.mode}:${data.period}`;
        if (
          activeUser &&
          data.settledByUser?.[activeUser.id] &&
          !settledPeriodsRef.current.has(settledKey)
        ) {
          settledPeriodsRef.current.add(settledKey);
          playerSyncSeqRef.current += 1;
          lastServerBalanceUpdatedAtRef.current = Date.now();
          const settled = data.settledByUser[activeUser.id];
          balanceRef.current = settled.newBalance;
          setBalance(settled.newBalance);

          const settledMap = new Map(settled.bets.map((b) => [b.id, b]));
          const nextBets = userBetsRef.current.map((b) => settledMap.get(b.id) || b);
          userBetsRef.current = nextBets;
          setUserBets(nextBets);

          setLatestRoundSummary({
            result: data.result,
            roundBets: settled.bets,
            totalReturn: settled.totalReturn,
            totalProfit: settled.totalProfit,
            totalBetAmount: settled.totalBetAmount,
            isWinner: settled.anyWon,
            hasBet: true,
          });
          setIsWinModalOpen(true);

          const fbUser = firebaseUserRef.current;
          if (fbUser?.emailVerified && fbUser.uid === activeUser.id) {
            void syncPlayerBalanceToFirestore(fbUser.uid, settled.newBalance).catch(() => {});
            for (const sb of settled.bets) {
              void settleBetInFirestore(sb.id, sb.status === 'won' ? 'won' : 'lost', sb.winAmount || 0, sb.profit || 0).catch(() => {});
            }
          }
        }

        if (isVerifiedGoogleAdmin(firebaseUserRef.current) && data.result && data.mode) {
          void adminSyncDrawRecordToFirestore(data.mode, data.result).catch(() => {});
        }

        if (isAdminAuthRef.current) {
          fetchAdminState();
        }
      } catch {
        // ignore
      }
    });

    return () => {
      es.close();
    };
  }, [currentUser?.id]);

  // Keep every device 100% in sync (fast background poll + tab focus/visibility resume)
  useEffect(() => {
    const syncAll = () => {
      syncPlayerState(currentUserRef.current?.id);
      if (isAdminAuthRef.current) {
        fetchAdminState();
      }
    };
    const id = setInterval(syncAll, 1500);
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        syncAll();
      }
    };
    window.addEventListener('focus', syncAll);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', syncAll);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [currentUser?.id]);

  // Fast live polling fallback when Admin Panel is open
  useEffect(() => {
    if (!isAdminOpen || !isAdminAuthenticated) return;
    fetchAdminState();
    const id = setInterval(() => {
      fetchAdminState();
    }, 1500);
    return () => clearInterval(id);
  }, [isAdminOpen, isAdminAuthenticated]);

  // Track Firebase Auth readiness & auto-unlock admin for verified owner email
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      firebaseUserRef.current = fbUser;
      setFirebaseUser(fbUser);
      setFirebaseAuthReady(true);
      if (isVerifiedGoogleAdmin(fbUser)) {
        void ensureAdminDocument(fbUser!).catch(() => {});
        isAdminAuthRef.current = true;
        setIsAdminAuthenticated(true);
        localStorage.setItem('muna_admin_logged_in', 'true');
      }
    });
    return () => unsub();
  }, []);

  // Attach real-time Firestore listener for signed-in Google player
  useEffect(() => {
    if (!firebaseAuthReady || !firebaseUser?.emailVerified) return;
    if (!currentUser?.id || currentUser.id !== firebaseUser.uid) return;

    const unsub = subscribePlayerFirestoreState(
      firebaseUser.uid,
      {
        onUserUpdate: ({ balance: cloudBalance, referralEarnings: cloudRef, updatedAt: cloudUpdatedAt }) => {
          if (betInFlightRef.current === 0) {
            if (
              typeof cloudBalance === 'number' &&
              cloudBalance !== balanceRef.current &&
              (!cloudUpdatedAt || cloudUpdatedAt >= lastServerBalanceUpdatedAtRef.current)
            ) {
              balanceRef.current = cloudBalance;
              setBalance(cloudBalance);
            }
            if (typeof cloudRef === 'number') {
              setReferralEarnings(cloudRef);
            }
          }
        },
        onTransactionsUpdate: (cloudTxs) => {
          if (cloudTxs.length > 0) {
            setTransactions((prev) => {
              const merged = new Map<string, PaymentTransaction>();
              for (const t of prev) merged.set(t.id, t);
              for (const ct of cloudTxs) merged.set(ct.id, ct);
              return Array.from(merged.values()).sort((a, b) => b.timestamp - a.timestamp);
            });
          }
        },
        onUserDeleted: () => {
          const uid = firebaseUser.uid;
          deletedUserIdsRef.current.add(uid);
          const cp = normalizePhoneKey(currentUserRef.current?.phone);
          if (cp) deletedPhonesRef.current.add(cp);
          persistDeletedTombstones();
          purgeActiveSession(new Set([uid]), cp ? new Set([cp]) : undefined);
        },
      },
      (err) => {
        console.error('Player Firestore sync error:', err);
      }
    );

    return () => unsub();
  }, [firebaseAuthReady, firebaseUser, currentUser?.id]);

  // Attach real-time Firestore listener for verified Admin Cloud DB view
  useEffect(() => {
    if (!firebaseAuthReady || !isVerifiedGoogleAdmin(firebaseUser) || !isAdminAuthenticated) {
      return;
    }

    const unsub = subscribeAdminFirestoreState(
      {
        onUsersUpdate: (cloudUsers) => {
          const cloudIds = new Set<string>();
          const activeCloudUsers: RegisteredUser[] = [];
          for (const cu of cloudUsers) {
            if (isUserDeletedLocally(cu)) {
              void adminDeleteUserInFirestore(cu.id).catch(() => {});
              continue;
            }
            cloudIds.add(cu.id);
            activeCloudUsers.push(cu);
          }

          // Any user that previously existed in Firestore and disappeared was deleted in Cloud DB
          if (prevFirestoreIdsRef.current.size > 0) {
            const removedIds = new Set<string>();
            for (const prevId of prevFirestoreIdsRef.current) {
              if (!cloudIds.has(prevId)) {
                removedIds.add(prevId);
                deletedUserIdsRef.current.add(prevId);
              }
            }
            if (removedIds.size > 0) {
              persistDeletedTombstones();
              serverAdminUsersRef.current = serverAdminUsersRef.current.filter(
                (u) => !removedIds.has(u.id)
              );
              purgeActiveSession(removedIds);
            }
          }

          prevFirestoreIdsRef.current = cloudIds;
          firestoreAdminUsersRef.current = activeCloudUsers;
          recomputeMergedAdminUsers();
        },
        onTransactionsUpdate: (cloudTxs) => {
          if (cloudTxs.length > 0) {
            setAdminTransactions((prev) => {
              const merged = new Map<string, PaymentTransaction>();
              for (const t of prev) merged.set(t.id, t);
              for (const ct of cloudTxs) merged.set(ct.id, ct);
              return Array.from(merged.values()).sort((a, b) => b.timestamp - a.timestamp);
            });
          }
        },
        onBetsUpdate: (cloudBets) => {
          if (cloudBets.length > 0) {
            setAdminBets((prev) => {
              const merged = new Map<string, UserBet>();
              for (const b of prev) merged.set(b.id, b);
              for (const cb of cloudBets) merged.set(cb.id, cb);
              return Array.from(merged.values()).sort((a, b) => b.timestamp - a.timestamp);
            });
          }
        },
      },
      (err) => {
        console.error('Admin Firestore sync error:', err);
      }
    );

    const unsubBlocked = subscribeBlockedPhonesFromFirestore((cloudBlocked) => {
      setBlockedPhones((prev) => {
        const merged = new Set([...prev, ...cloudBlocked]);
        return Array.from(merged);
      });
    });

    return () => {
      unsub();
      unsubBlocked();
    };
  }, [firebaseAuthReady, firebaseUser, isAdminAuthenticated]);

  const [latestRoundSummary, setLatestRoundSummary] = useState<{
    result: DrawResult | null;
    roundBets: UserBet[];
    totalReturn: number;
    totalProfit: number;
    totalBetAmount: number;
    isWinner: boolean;
    hasBet: boolean;
  }>({
    result: null,
    roundBets: [],
    totalReturn: 0,
    totalProfit: 0,
    totalBetAmount: 0,
    isWinner: false,
    hasBet: false
  });

  // Floating notification / Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // 6. Continuous Synchronized Game Countdown Timer (Uses server-calibrated UTC time across all devices)
  useEffect(() => {
    const tick = () => {
      const now = getServerNow();
      const currentMode = gameTimeRef.current;
      const remaining = getSecondsRemainingForMode(currentMode, now);
      const period = getPeriodForMode(currentMode, now);

      setSecondsRemaining(remaining);
      setCurrentPeriod(period);

      const isInLiveGame = !isLoadingSplashRef.current && isUserSignedInRef.current;

      // "ٹوم ٹوم ٹوم ٹوم" (Toom Toom) sound on last 5 seconds (5, 4, 3, 2, 1) — only when inside live game
      if (isInLiveGame && remaining <= 5 && remaining >= 1) {
        if (lastPlayedSecondRef.current !== remaining) {
          lastPlayedSecondRef.current = remaining;
          soundManager.playToom(remaining);
        }
      } else {
        lastPlayedSecondRef.current = -1;
      }

      // Check all 4 modes (30, 60, 180, 300) so they all continue advancing in real-time
      const modes: GameTimeOption[] = [30, 60, 180, 300];
      modes.forEach((mode) => {
        const modePeriod = getPeriodForMode(mode, now);
        const lastPeriodForThisMode = lastPeriodPerModeRef.current[mode];
        if (lastPeriodForThisMode && lastPeriodForThisMode !== modePeriod) {
          lastPeriodPerModeRef.current[mode] = modePeriod;
          if (isInLiveGame && mode === currentMode) {
            soundManager.playBadaToom();
          }
          handleRoundComplete(lastPeriodForThisMode, mode);
        } else if (!lastPeriodForThisMode) {
          lastPeriodPerModeRef.current[mode] = modePeriod;
        }
      });
    };

    tick();
    const interval = setInterval(tick, 300);

    return () => clearInterval(interval);
  }, []);

  // Authoritative Server-Synced Round Completion and Settlement logic
  const handleRoundComplete = async (finishedPeriod: string, mode: GameTimeOption) => {
    let completedResult: DrawResult | null = null;
    let serverHistory: DrawResult[] | null = null;
    let serverBalance: number | undefined;
    let serverBets: UserBet[] | undefined;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch('/api/draw/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode,
            period: finishedPeriod,
            userId: currentUserRef.current?.id,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (typeof data.serverTime === 'number') setServerTimeOffset(data.serverTime);
          if (data.commitHashes) setCommitHashes((prev) => ({ ...prev, ...data.commitHashes }));
          if (data.forcedOutcomes || data.forcedNumbers) {
            applyServerForcedMaps(data.forcedOutcomes, data.forcedNumbers);
          }
          if (data.pending) {
            await new Promise((r) => setTimeout(r, 450));
            continue;
          }
          completedResult = data.result;
          serverHistory = data.history;
          serverBalance = data.balance;
          serverBets = data.bets;
          break;
        }
      } catch {
        // retry cleanly
      }
      await new Promise((r) => setTimeout(r, 350));
    }

    if (!completedResult) {
      await syncPlayerState(currentUserRef.current?.id);
      const syncedMatch = (historyByModeRef.current[mode] || []).find(
        (p) => p.period === finishedPeriod
      );
      if (syncedMatch) {
        completedResult = syncedMatch;
      } else {
        // Pure uniform fair fallback if server completely unreachable
        const forcedNum = forcedNumbersRef.current[mode];
        if (forcedNum !== null && forcedNum !== undefined && forcedNum >= 0 && forcedNum <= 9) {
          completedResult = {
            period: finishedPeriod,
            number: forcedNum,
            bigSmall: getBigSmallForNumber(forcedNum),
            colors: getColorsForNumber(forcedNum),
            timestamp: Date.now()
          };
        } else {
          completedResult = generateSingleDrawResult(finishedPeriod, Date.now());
        }
      }
    }

    // Update historyByMode strictly from server history
    setHistoryByMode((prev) => {
      if (serverHistory && Array.isArray(serverHistory)) {
        return { ...prev, [mode]: serverHistory };
      }
      const existingForMode = prev[mode] || [];
      if (existingForMode.some((p) => p.period === finishedPeriod)) {
        return prev;
      }
      return {
        ...prev,
        [mode]: [completedResult!, ...existingForMode].slice(0, 80)
      };
    });

    const settledKey = `${mode}:${finishedPeriod}`;

    // If SSE already showed WinModal for this period, only reconcile balance/bets
    if (settledPeriodsRef.current.has(settledKey)) {
      if (typeof serverBalance === 'number' && betInFlightRef.current === 0) {
        playerSyncSeqRef.current += 1;
        lastServerBalanceUpdatedAtRef.current = Date.now();
        balanceRef.current = serverBalance;
        setBalance(serverBalance);
      }
      if (Array.isArray(serverBets)) {
        userBetsRef.current = serverBets;
        setUserBets(serverBets);
      }
      return;
    }

    const hadLocalPendingBet = userBetsRef.current.some(
      (b) => b.mode === mode && b.period === finishedPeriod && b.status === 'pending'
    );
    const serverRoundBets = serverBets
      ? serverBets.filter((b) => b.mode === mode && b.period === finishedPeriod)
      : [];

    if (serverBets && (hadLocalPendingBet || serverRoundBets.length > 0)) {
      settledPeriodsRef.current.add(settledKey);
      playerSyncSeqRef.current += 1;
      const settledRoundBets = serverRoundBets;
      const roundTotalBetAmount = settledRoundBets.reduce((s, b) => s + b.totalAmount, 0);
      const roundTotalReturn = Math.round(
        settledRoundBets.reduce((s, b) => s + (b.winAmount || 0), 0) * 100
      ) / 100;
      const roundTotalProfit = Math.round((roundTotalReturn - roundTotalBetAmount) * 100) / 100;
      const anyWon = settledRoundBets.some((b) => b.status === 'won');

      userBetsRef.current = serverBets;
      setUserBets(serverBets);

      if (typeof serverBalance === 'number') {
        lastServerBalanceUpdatedAtRef.current = Date.now();
        balanceRef.current = serverBalance;
        setBalance(serverBalance);
      }

      const fbUser = firebaseUserRef.current;
      if (fbUser?.emailVerified && fbUser.uid === currentUserRef.current?.id) {
        if (typeof serverBalance === 'number') {
          void syncPlayerBalanceToFirestore(fbUser.uid, serverBalance).catch(() => {});
        }
        for (const sb of settledRoundBets) {
          void settleBetInFirestore(sb.id, sb.status === 'won' ? 'won' : 'lost', sb.winAmount || 0, sb.profit || 0).catch(() => {});
        }
      }
      if (isVerifiedGoogleAdmin(fbUser) && completedResult) {
        void adminSyncDrawRecordToFirestore(mode, completedResult).catch(() => {});
      }

      setLatestRoundSummary({
        result: completedResult,
        roundBets: settledRoundBets,
        totalReturn: roundTotalReturn,
        totalProfit: roundTotalProfit,
        totalBetAmount: roundTotalBetAmount,
        isWinner: anyWon,
        hasBet: true,
      });
      setIsWinModalOpen(true);
      return;
    }

    // Fallback pure settlement if offline
    if (hadLocalPendingBet) {
      settledPeriodsRef.current.add(settledKey);
      const currentBets = userBetsRef.current;
      let roundTotalBetAmount = 0;
      let roundTotalReturn = 0;
      let roundTotalProfit = 0;
      let anyWon = false;
      const settledRoundBets: UserBet[] = [];

      const updatedBets = currentBets.map((bet) => {
        if (bet.period === finishedPeriod && bet.status === 'pending') {
          roundTotalBetAmount += bet.totalAmount;
          const { won, winAmount, profit } = calculateBetWin(bet, completedResult!);
          if (won) {
            anyWon = true;
            roundTotalReturn = Math.round((roundTotalReturn + winAmount) * 100) / 100;
            roundTotalProfit = Math.round((roundTotalProfit + profit) * 100) / 100;
            const updatedBet = { ...bet, status: 'won' as const, winAmount, profit };
            settledRoundBets.push(updatedBet);
            return updatedBet;
          }
          roundTotalProfit = Math.round((roundTotalProfit + profit) * 100) / 100;
          const updatedBet = { ...bet, status: 'lost' as const, winAmount: 0, profit };
          settledRoundBets.push(updatedBet);
          return updatedBet;
        }
        return bet;
      });

      userBetsRef.current = updatedBets;
      setUserBets(updatedBets);

      if (roundTotalReturn > 0) {
        const nextBalance = Math.round((balanceRef.current + roundTotalReturn) * 100) / 100;
        balanceRef.current = nextBalance;
        setBalance(nextBalance);
      }

      setLatestRoundSummary({
        result: completedResult,
        roundBets: settledRoundBets,
        totalReturn: roundTotalReturn,
        totalProfit: roundTotalProfit,
        totalBetAmount: roundTotalBetAmount,
        isWinner: anyWon,
        hasBet: true
      });
      setIsWinModalOpen(true);
    }
  };

  // Trigger Bet Modal
  const handleSelectBet = (
    category: BetCategory,
    selection: string | number,
    multiplier: number
  ) => {
    if (secondsRemaining <= 5) {
      showToast(
        language === 'ur'
          ? 'آخری 5 سیکنڈ میں بیٹ کلوز ہو چکی ہے!'
          : 'Betting is locked for the final 5 seconds!'
      );
      return;
    }
    setActiveCategory(category);
    setActiveSelection(selection);
    setSelectedMultiplier(multiplier);
    setIsBetModalOpen(true);
  };

  // Confirm Bet (Immediate Balance Deduction + Server Atomic Persistence)
  const handleConfirmBet = async (contractMoney: number, quantity: number, multiplier: number) => {
    if (secondsRemaining <= 5) {
      showToast(
        language === 'ur'
          ? 'آخری 5 سیکنڈ میں بیٹ کلوز ہو چکی ہے!'
          : 'Betting is locked for the final 5 seconds!'
      );
      return;
    }

    const totalAmount = Math.round(contractMoney * quantity * multiplier * 100) / 100;
    if (totalAmount < 1) {
      showToast(
        language === 'ur'
          ? 'کم سے کم بیٹ 1 روپیہ ہے!'
          : 'Minimum bet is Rs 1!'
      );
      return;
    }

    if (totalAmount > balanceRef.current) {
      setIsDepositOpen(true);
      return;
    }

    // Deduct balance optimistically while server confirms atomic bet
    playerSyncSeqRef.current += 1;
    const preBetBalance = balanceRef.current;
    const nextBalance = Math.max(0, Math.round((preBetBalance - totalAmount) * 100) / 100);
    balanceRef.current = nextBalance;
    setBalance(nextBalance);

    const activePeriodNow = getPeriodForMode(gameTime, getServerNow());
    const tempBet: UserBet = {
      id: `BET-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      userId: currentUser?.id,
      userName: currentUser?.fullName,
      userPhone: currentUser?.phone,
      mode: gameTime,
      period: activePeriodNow,
      category: activeCategory!,
      selection: activeSelection!,
      contractMoney,
      quantity,
      multiplier,
      totalAmount,
      status: 'pending',
      winAmount: 0,
      roundHash: commitHashes[gameTime],
      timestamp: Date.now()
    };

    const nextBets = [tempBet, ...userBetsRef.current];
    userBetsRef.current = nextBets;
    setUserBets(nextBets);
    showToast(
      language === 'ur'
        ? `بیٹ Rs ${totalAmount.toLocaleString()} لگ گئی! باقی بیلنس: Rs ${nextBalance.toLocaleString()}`
        : `Bet Rs ${totalAmount.toLocaleString()} placed! Remaining: Rs ${nextBalance.toLocaleString()}`
    );

    if (currentUser) {
      betInFlightRef.current += 1;
      try {
        const postBet = () =>
          fetch('/api/bets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: currentUser.id,
              period: tempBet.period,
              mode: gameTime,
              category: tempBet.category,
              selection: tempBet.selection,
              contractMoney,
              quantity,
              multiplier,
            }),
          });

        const res = await postBet();
        if (res.status === 403 || res.status === 410 || res.status === 404) {
          deletedUserIdsRef.current.add(currentUser.id);
          const cp = normalizePhoneKey(currentUser.phone);
          if (cp) deletedPhonesRef.current.add(cp);
          persistDeletedTombstones();
          purgeActiveSession(new Set([currentUser.id]), cp ? new Set([cp]) : undefined);
          showToast('Account removed or blocked by Admin.');
          return;
        }

        if (res.ok) {
          const data = await res.json();
          playerSyncSeqRef.current += 1;
          if (typeof data.balance === 'number') {
            lastServerBalanceUpdatedAtRef.current =
              typeof data.balanceUpdatedAt === 'number' ? data.balanceUpdatedAt : Date.now();
            balanceRef.current = data.balance;
            setBalance(data.balance);
          }
          if (data.bet) {
            const replaced = userBetsRef.current.map((b) =>
              b.id === tempBet.id ? data.bet : b
            );
            userBetsRef.current = replaced;
            setUserBets(replaced);

            const fbUser = firebaseUserRef.current;
            if (fbUser?.emailVerified && fbUser.uid === currentUser.id) {
              void createBetInFirestore(data.bet, fbUser.uid).catch(() => {});
              if (typeof data.balance === 'number') {
                void syncPlayerBalanceToFirestore(fbUser.uid, data.balance).catch(() => {});
              }
            }
          }
        } else if (res.status === 400) {
          const errData = await res.json().catch(() => ({}));
          if (typeof errData.balance === 'number') {
            playerSyncSeqRef.current += 1;
            lastServerBalanceUpdatedAtRef.current = Date.now();
            balanceRef.current = errData.balance;
            setBalance(errData.balance);
            const reverted = userBetsRef.current.filter((b) => b.id !== tempBet.id);
            userBetsRef.current = reverted;
            setUserBets(reverted);
            setIsDepositOpen(true);
          }
        }
      } catch {
        // ignore network glitch
      } finally {
        betInFlightRef.current = Math.max(0, betInFlightRef.current - 1);
      }
    }
  };

  // Deposit Handler (Syncs globally to Server DB with Player Name/Phone/ID)
  const handleDepositSuccess = async (
    amount: number,
    tx: PaymentTransaction,
    autoCredited: boolean
  ) => {
    const enrichedTx: PaymentTransaction = {
      ...tx,
      userId: currentUser?.id,
      userName: currentUser?.fullName,
      userPhone: currentUser?.phone,
      accountTitle: currentUser?.fullName || tx.accountTitle,
    };

    if (currentUser) {
      try {
        const res = await fetch('/api/transactions/deposit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: currentUser.id,
            userPhone: currentUser.phone,
            amount: enrichedTx.amount,
            bonusAmount: enrichedTx.bonusAmount || 0,
            method: enrichedTx.method,
            accountNumber: enrichedTx.accountNumber,
            trxId: enrichedTx.trxId,
            screenshotUrl: enrichedTx.screenshotUrl,
            note: enrichedTx.note,
            autoCredit: autoCredited,
          }),
        });

        if (res.status === 403 || res.status === 404) {
          deletedUserIdsRef.current.add(currentUser.id);
          const cp = normalizePhoneKey(currentUser.phone);
          if (cp) deletedPhonesRef.current.add(cp);
          persistDeletedTombstones();
          purgeActiveSession(new Set([currentUser.id]), cp ? new Set([cp]) : undefined);
          return;
        }

        if (res.ok) {
          const data = await res.json();
          playerSyncSeqRef.current += 1;
          if (typeof data.balance === 'number') {
            lastServerBalanceUpdatedAtRef.current =
              typeof data.balanceUpdatedAt === 'number' ? data.balanceUpdatedAt : Date.now();
            balanceRef.current = data.balance;
            setBalance(data.balance);
          }
          if (data.tx) {
            setTransactions((prev) =>
              prev.some((t) => t.id === data.tx.id) ? prev : [data.tx, ...prev]
            );
            const fbUser = firebaseUserRef.current;
            if (fbUser?.emailVerified && (fbUser.uid === currentUser.id || isVerifiedGoogleAdmin(fbUser))) {
              void createTransactionInFirestore(data.tx, data.tx.userId || currentUser.id).catch(() => {});
              if (typeof data.balance === 'number' && fbUser.uid === currentUser.id) {
                void syncPlayerBalanceToFirestore(fbUser.uid, data.balance).catch(() => {});
              }
            }
          }
          if (isAdminAuthRef.current) {
            fetchAdminState();
          }
          const bonusPart = enrichedTx.bonusAmount && enrichedTx.bonusAmount > 0 ? enrichedTx.bonusAmount : 0;
          showToast(
            autoCredited
              ? bonusPart > 0
                ? `Rs ${enrichedTx.amount.toLocaleString()} + Rs ${bonusPart.toLocaleString()} (20% Bonus) = Rs ${amount.toLocaleString()} credited!`
                : `Rs ${amount.toLocaleString()} auto-credited successfully!`
              : 'Deposit submitted! Balance will be credited upon admin approval.'
          );
          return;
        } else if (res.status === 409) {
          showToast('This TRX ID has already been used!');
          return;
        } else {
          const errData = await res.json().catch(() => ({}));
          showToast(errData?.error || 'Could not submit deposit. Please try again.');
          return;
        }
      } catch {
        // network glitch
      }
    }
  };

  // Admin Approval for Deposit
  const handleApproveDeposit = async (txId: string) => {
    try {
      const res = await fetch(`/api/admin/transactions/${encodeURIComponent(txId)}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: adminPinRef.current }),
      });
      if (res.ok) {
        const data = await res.json();
        applyAdminSnapshot(data);
        if (isVerifiedGoogleAdmin(firebaseUserRef.current)) {
          void adminUpdateTransactionInFirestore(txId, { status: 'completed' }).catch(() => {});
          if (data.tx?.userId && Array.isArray(data.users)) {
            const matchedUser = data.users.find((u: RegisteredUser) => u.id === data.tx.userId);
            if (matchedUser) void adminUpsertUserToFirestore(matchedUser).catch(() => {});
          }
        }
        syncPlayerState(currentUserRef.current?.id);
        showToast(language === 'ur' ? 'ڈپازٹ منظور ہو گیا اور بیلنس شامل ہو گیا!' : 'Deposit approved & credited!');
        return;
      }
    } catch {
      // ignore
    }
    const tx = transactions.find((t) => t.id === txId);
    if (tx && tx.status === 'pending') {
      const totalToCredit = tx.amount + (tx.bonusAmount || 0);
      const nextBal = Math.round((balanceRef.current + totalToCredit) * 100) / 100;
      balanceRef.current = nextBal;
      setBalance(nextBal);
      setTransactions((prev) =>
        prev.map((t) => (t.id === txId ? { ...t, status: 'completed' as const } : t))
      );
    }
  };

  // Admin Rejection for Deposit
  const handleRejectDeposit = async (txId: string) => {
    try {
      const res = await fetch(`/api/admin/transactions/${encodeURIComponent(txId)}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: adminPinRef.current }),
      });
      if (res.ok) {
        const data = await res.json();
        applyAdminSnapshot(data);
        if (isVerifiedGoogleAdmin(firebaseUserRef.current)) {
          void adminUpdateTransactionInFirestore(txId, { status: 'rejected' }).catch(() => {});
        }
        syncPlayerState(currentUserRef.current?.id);
        showToast(language === 'ur' ? 'ڈپازٹ درخواست مسترد کر دی گئی' : 'Deposit request rejected');
        return;
      }
    } catch {
      // ignore
    }
    setTransactions((prev) =>
      prev.map((t) => (t.id === txId ? { ...t, status: 'rejected' as const } : t))
    );
  };

  // Withdraw Handler (Syncs globally to Server DB with Player Name/Phone/ID)
  const handleWithdrawSuccess = async (amount: number, tx: PaymentTransaction) => {
    const enrichedTx: PaymentTransaction = {
      ...tx,
      userId: currentUser?.id,
      userName: currentUser?.fullName,
      userPhone: currentUser?.phone,
    };

    const preWithdrawBalance = balanceRef.current;
    playerSyncSeqRef.current += 1;
    const nextBal = Math.max(0, Math.round((preWithdrawBalance - amount) * 100) / 100);
    balanceRef.current = nextBal;
    setBalance(nextBal);

    if (currentUser) {
      try {
        const res = await fetch('/api/transactions/withdraw', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: currentUser.id,
            userPhone: currentUser.phone,
            amount,
            method: tx.method,
            accountNumber: tx.accountNumber,
            accountTitle: tx.accountTitle,
          }),
        });

        if (res.status === 403 || res.status === 404) {
          deletedUserIdsRef.current.add(currentUser.id);
          const cp = normalizePhoneKey(currentUser.phone);
          if (cp) deletedPhonesRef.current.add(cp);
          persistDeletedTombstones();
          purgeActiveSession(new Set([currentUser.id]), cp ? new Set([cp]) : undefined);
          return;
        }

        if (res.ok) {
          const data = await res.json();
          playerSyncSeqRef.current += 1;
          if (typeof data.balance === 'number') {
            lastServerBalanceUpdatedAtRef.current =
              typeof data.balanceUpdatedAt === 'number' ? data.balanceUpdatedAt : Date.now();
            balanceRef.current = data.balance;
            setBalance(data.balance);
          }
          if (data.tx) {
            setTransactions((prev) =>
              prev.some((t) => t.id === data.tx.id) ? prev : [data.tx, ...prev]
            );
            const fbUser = firebaseUserRef.current;
            if (fbUser?.emailVerified && fbUser.uid === currentUser.id) {
              void createTransactionInFirestore(data.tx, fbUser.uid).catch(() => {});
              if (typeof data.balance === 'number') {
                void syncPlayerBalanceToFirestore(fbUser.uid, data.balance).catch(() => {});
              }
            }
          }
          if (isAdminAuthRef.current) {
            fetchAdminState();
          }
          showToast(`Rs ${amount.toLocaleString()} withdrawal submitted for processing`);
          return;
        } else {
          const errData = await res.json().catch(() => ({}));
          if (typeof errData.balance === 'number') {
            balanceRef.current = errData.balance;
            setBalance(errData.balance);
          } else {
            balanceRef.current = preWithdrawBalance;
            setBalance(preWithdrawBalance);
          }
          showToast(
            errData?.error === 'INSUFFICIENT_BALANCE'
              ? 'Insufficient balance on server'
              : errData?.error || 'Withdrawal failed. Please try again.'
          );
          return;
        }
      } catch {
        balanceRef.current = preWithdrawBalance;
        setBalance(preWithdrawBalance);
        showToast('Could not connect to server. Please try again.');
      }
    }
  };

  // Admin Approval for Withdraw
  const handleApproveWithdraw = async (txId: string) => {
    try {
      const res = await fetch(`/api/admin/transactions/${encodeURIComponent(txId)}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: adminPinRef.current }),
      });
      if (res.ok) {
        const data = await res.json();
        applyAdminSnapshot(data);
        if (isVerifiedGoogleAdmin(firebaseUserRef.current)) {
          void adminUpdateTransactionInFirestore(txId, { status: 'completed' }).catch(() => {});
        }
        syncPlayerState(currentUserRef.current?.id);
        showToast(
          language === 'ur'
            ? 'وڈرا منظور ہو گیا اور ادائیگی مکمل ہو گئی!'
            : 'Withdrawal approved & payout marked completed!'
        );
        return;
      }
    } catch {
      // ignore
    }
    setTransactions((prev) =>
      prev.map((t) => (t.id === txId ? { ...t, status: 'completed' as const } : t))
    );
  };

  // Admin Rejection for Withdraw (Refunds balance on server!)
  const handleRejectWithdraw = async (txId: string) => {
    try {
      const res = await fetch(`/api/admin/transactions/${encodeURIComponent(txId)}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: adminPinRef.current }),
      });
      if (res.ok) {
        const data = await res.json();
        applyAdminSnapshot(data);
        if (isVerifiedGoogleAdmin(firebaseUserRef.current)) {
          void adminUpdateTransactionInFirestore(txId, { status: 'rejected' }).catch(() => {});
          if (data.tx?.userId && Array.isArray(data.users)) {
            const matchedUser = data.users.find((u: RegisteredUser) => u.id === data.tx.userId);
            if (matchedUser) void adminUpsertUserToFirestore(matchedUser).catch(() => {});
          }
        }
        syncPlayerState(currentUserRef.current?.id);
        showToast(
          language === 'ur'
            ? 'وڈرا مسترد! رقم واپس صارف کے بیلنس میں ڈال دی گئی'
            : 'Withdrawal rejected & refunded to player balance!'
        );
        return;
      }
    } catch {
      // ignore
    }
    const tx = transactions.find((t) => t.id === txId);
    if (tx && tx.status === 'pending') {
      setBalance((prev) => prev + tx.amount);
      setTransactions((prev) =>
        prev.map((t) => (t.id === txId ? { ...t, status: 'rejected' as const } : t))
      );
    }
  };

  // Admin CRUD: Delete Deposit
  const handleDeleteDeposit = async (txId: string) => {
    try {
      const res = await fetch(`/api/admin/transactions/${encodeURIComponent(txId)}`, {
        method: 'DELETE',
        headers: { 'x-admin-pin': adminPinRef.current },
      });
      if (res.ok) {
        applyAdminSnapshot(await res.json());
        if (isVerifiedGoogleAdmin(firebaseUserRef.current)) {
          void adminDeleteTransactionInFirestore(txId).catch(() => {});
        }
        syncPlayerState(currentUserRef.current?.id);
      }
    } catch {
      // ignore
    }
    setTransactions((prev) => prev.filter((t) => t.id !== txId));
    showToast(language === 'ur' ? 'ڈپازٹ ریکارڈ ڈیلیٹ کر دیا گیا!' : 'Deposit record deleted!');
  };

  // Admin CRUD: Edit Deposit
  const handleEditDeposit = async (txId: string, updated: Partial<PaymentTransaction>) => {
    try {
      const res = await fetch(`/api/admin/transactions/${encodeURIComponent(txId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: adminPinRef.current, updated }),
      });
      if (res.ok) {
        applyAdminSnapshot(await res.json());
        if (isVerifiedGoogleAdmin(firebaseUserRef.current)) {
          void adminUpdateTransactionInFirestore(txId, updated).catch(() => {});
        }
        syncPlayerState(currentUserRef.current?.id);
        showToast(language === 'ur' ? 'ڈپازٹ ریکارڈ کامیابی سے اپ ڈیٹ ہو گیا!' : 'Deposit record updated!');
        return;
      }
    } catch {
      // ignore
    }
    setTransactions((prev) =>
      prev.map((t) => (t.id === txId ? { ...t, ...updated } : t))
    );
  };

  // Admin CRUD: Create New Deposit
  const handleAddDeposit = async (data: {
    userId?: string;
    amount: number;
    accountNumber: string;
    accountTitle: string;
    method: 'easypaisa' | 'jazzcash';
    trxId: string;
    status: 'completed' | 'pending';
    creditNow: boolean;
  }) => {
    try {
      const res = await fetch('/api/admin/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin: adminPinRef.current,
          type: 'deposit',
          userId: data.userId || currentUser?.id,
          amount: data.amount,
          accountNumber: data.accountNumber,
          accountTitle: data.accountTitle,
          method: data.method,
          trxId: data.trxId,
          status: data.status,
          applyBalance: data.creditNow || data.status === 'completed',
        }),
      });
      if (res.ok) {
        const resData = await res.json();
        applyAdminSnapshot(resData);
        if (isVerifiedGoogleAdmin(firebaseUserRef.current) && resData.tx) {
          void createTransactionInFirestore(
            resData.tx,
            resData.tx.userId || firebaseUserRef.current!.uid
          ).catch(() => {});
        }
        syncPlayerState(currentUserRef.current?.id);
        showToast(
          language === 'ur'
            ? `نیا ڈپازٹ Rs ${data.amount.toLocaleString()} کامیابی سے بن گیا!`
            : `New deposit of Rs ${data.amount.toLocaleString()} created!`
        );
        return;
      }
    } catch {
      // ignore
    }
  };

  // Admin CRUD: Delete Withdrawal
  const handleDeleteWithdraw = async (txId: string) => {
    try {
      const res = await fetch(`/api/admin/transactions/${encodeURIComponent(txId)}`, {
        method: 'DELETE',
        headers: { 'x-admin-pin': adminPinRef.current },
      });
      if (res.ok) {
        applyAdminSnapshot(await res.json());
        if (isVerifiedGoogleAdmin(firebaseUserRef.current)) {
          void adminDeleteTransactionInFirestore(txId).catch(() => {});
        }
        syncPlayerState(currentUserRef.current?.id);
      }
    } catch {
      // ignore
    }
    setTransactions((prev) => prev.filter((t) => t.id !== txId));
    showToast(language === 'ur' ? 'وڈرا ریکارڈ ڈیلیٹ کر دیا گیا!' : 'Withdrawal record deleted!');
  };

  // Admin CRUD: Edit Withdrawal
  const handleEditWithdraw = async (txId: string, updated: Partial<PaymentTransaction>) => {
    try {
      const res = await fetch(`/api/admin/transactions/${encodeURIComponent(txId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: adminPinRef.current, updated }),
      });
      if (res.ok) {
        applyAdminSnapshot(await res.json());
        if (isVerifiedGoogleAdmin(firebaseUserRef.current)) {
          void adminUpdateTransactionInFirestore(txId, updated).catch(() => {});
        }
        syncPlayerState(currentUserRef.current?.id);
        showToast(language === 'ur' ? 'وڈرا ریکارڈ کامیابی سے اپ ڈیٹ ہو گیا!' : 'Withdrawal record updated!');
        return;
      }
    } catch {
      // ignore
    }
  };

  // Admin CRUD: Create New Withdrawal
  const handleAddWithdraw = async (data: {
    userId?: string;
    amount: number;
    accountNumber: string;
    accountTitle: string;
    method: 'easypaisa' | 'jazzcash';
    trxId: string;
    status: 'completed' | 'pending' | 'rejected';
    deductNow: boolean;
  }) => {
    try {
      const res = await fetch('/api/admin/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin: adminPinRef.current,
          type: 'withdraw',
          userId: data.userId || currentUser?.id,
          amount: data.amount,
          accountNumber: data.accountNumber,
          accountTitle: data.accountTitle,
          method: data.method,
          trxId: data.trxId,
          status: data.status,
          applyBalance: data.deductNow,
        }),
      });
      if (res.ok) {
        const resData = await res.json();
        applyAdminSnapshot(resData);
        if (isVerifiedGoogleAdmin(firebaseUserRef.current) && resData.tx) {
          void createTransactionInFirestore(
            resData.tx,
            resData.tx.userId || firebaseUserRef.current!.uid
          ).catch(() => {});
        }
        syncPlayerState(currentUserRef.current?.id);
        showToast(
          language === 'ur'
            ? `نیا وڈرا Rs ${data.amount.toLocaleString()} کامیابی سے بن گیا!`
            : `New withdrawal of Rs ${data.amount.toLocaleString()} created!`
        );
      }
    } catch {
      // ignore
    }
  };

  const handleUpdateUserBalanceOnServer = async (
    userId: string,
    action: 'set' | 'add' | 'deduct' | 'reset',
    amount: number
  ) => {
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/balance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: adminPinRef.current, action, amount }),
      });
      if (res.ok) {
        const data = await res.json();
        applyAdminSnapshot(data);
        if (isVerifiedGoogleAdmin(firebaseUserRef.current) && data.user) {
          void adminUpsertUserToFirestore(data.user).catch(() => {});
        }
        if (currentUserRef.current?.id === userId && data.user) {
          lastServerBalanceUpdatedAtRef.current =
            typeof data.user.balanceUpdatedAt === 'number'
              ? data.user.balanceUpdatedAt
              : Date.now();
          balanceRef.current = data.user.balance;
          setBalance(data.user.balance);
        }
      }
    } catch {
      // ignore
    }
  };

  const handleDeleteUserOnServer = async (userId: string) => {
    const matched =
      serverAdminUsersRef.current.find((u) => u.id === userId) ||
      firestoreAdminUsersRef.current.find((u) => u.id === userId) ||
      adminUsers.find((u) => u.id === userId);
    const phoneKey = matched?.phone ? normalizePhoneKey(matched.phone) : '';

    deletedUserIdsRef.current.add(userId);
    if (phoneKey) deletedPhonesRef.current.add(phoneKey);
    persistDeletedTombstones();

    prevFirestoreIdsRef.current.delete(userId);
    serverAdminUsersRef.current = serverAdminUsersRef.current.filter((u) => u.id !== userId);
    firestoreAdminUsersRef.current = firestoreAdminUsersRef.current.filter((u) => u.id !== userId);
    recomputeMergedAdminUsers();
    purgeActiveSession(new Set([userId]), phoneKey ? new Set([phoneKey]) : undefined);

    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
        method: 'DELETE',
        headers: { 'x-admin-pin': adminPinRef.current },
      });
      if (res.ok) {
        const data = await res.json();
        applyAdminSnapshot(data);
        if (isVerifiedGoogleAdmin(firebaseUserRef.current) && data.blockedPhone) {
          void blockPhoneInFirestore(data.blockedPhone).catch(() => {});
        }
      }
    } catch {
      // ignore
    }

    if (isVerifiedGoogleAdmin(firebaseUserRef.current)) {
      await adminDeleteUserInFirestore(userId).catch(() => {});
      if (phoneKey) {
        await blockPhoneInFirestore(phoneKey).catch(() => {});
      }
    }
  };

  const handleUnblockPhoneOnServer = async (phone: string) => {
    const cp = normalizePhoneKey(phone);
    if (cp) {
      deletedPhonesRef.current.delete(cp);
      persistDeletedTombstones();
    }
    setBlockedPhones((prev) => prev.filter((p) => normalizePhoneKey(p) !== cp));
    try {
      const res = await fetch('/api/admin/unblock-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: adminPinRef.current, phone }),
      });
      if (res.ok) {
        applyAdminSnapshot(await res.json());
      }
    } catch {
      // ignore
    }
    if (isVerifiedGoogleAdmin(firebaseUserRef.current)) {
      await unblockPhoneInFirestore(phone).catch(() => {});
    }
  };

  // Admin CRUD: Reset / Delete Balance
  const handleResetBalance = () => {
    if (currentUser) {
      handleUpdateUserBalanceOnServer(currentUser.id, 'reset', 0);
    } else {
      setBalance(0);
    }
    showToast(language === 'ur' ? 'بیلنس ری سیٹ ہو کر 0 PKR ہو گیا!' : 'Balance reset to 0 PKR!');
  };

  // Admin CRUD: Clear All Deposits
  const handleClearAllDeposits = async () => {
    try {
      const res = await fetch('/api/admin/transactions/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: adminPinRef.current, type: 'deposit' }),
      });
      if (res.ok) applyAdminSnapshot(await res.json());
    } catch {
      // ignore
    }
    setTransactions((prev) => prev.filter((t) => t.type !== 'deposit'));
    showToast(language === 'ur' ? 'تمام ڈپازٹ ریکارڈز ڈیلیٹ ہو گئے!' : 'All deposits cleared!');
  };

  // Admin CRUD: Clear All Withdrawals
  const handleClearAllWithdrawals = async () => {
    try {
      const res = await fetch('/api/admin/transactions/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: adminPinRef.current, type: 'withdraw' }),
      });
      if (res.ok) applyAdminSnapshot(await res.json());
    } catch {
      // ignore
    }
    setTransactions((prev) => prev.filter((t) => t.type !== 'withdraw'));
    showToast(language === 'ur' ? 'تمام وڈرا ریکارڈز ڈیلیٹ ہو گئے!' : 'All withdrawals cleared!');
  };

  // Admin CRUD: Delete All User Data
  const handleClearAllUserData = async () => {
    for (const u of [...serverAdminUsersRef.current, ...firestoreAdminUsersRef.current, ...adminUsers]) {
      deletedUserIdsRef.current.add(u.id);
      const cp = normalizePhoneKey(u.phone);
      if (cp) deletedPhonesRef.current.add(cp);
    }
    persistDeletedTombstones();
    serverAdminUsersRef.current = [];
    firestoreAdminUsersRef.current = [];
    prevFirestoreIdsRef.current = new Set();
    setAdminUsers([]);
    setAdminTransactions([]);
    setAdminBets([]);

    try {
      const res = await fetch('/api/admin/reset-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: adminPinRef.current }),
      });
      if (res.ok) applyAdminSnapshot(await res.json());
    } catch {
      // ignore
    }
    if (isVerifiedGoogleAdmin(firebaseUserRef.current)) {
      await pushAdminSnapshotToFirestore(
        [],
        [],
        Array.from(deletedUserIdsRef.current)
      ).catch(() => {});
    }
    setBalance(0);
    setUserBets([]);
    setTransactions([]);
    setCurrentUser(null);
    localStorage.removeItem('aloye_wingo_balance');
    localStorage.removeItem('aloye_wingo_bets');
    localStorage.removeItem('aloye_wingo_transactions');
    localStorage.removeItem('muna_current_user');
    localStorage.removeItem('muna_registered_users');
    localStorage.removeItem('muna_user_balances');
    showToast(language === 'ur' ? 'تمام ڈیٹا، بیلنس اور ہسٹری مکمل ڈیلیٹ ہو گئی!' : 'All users and records reset!');
  };

  // Admin History Controls
  const handleDeleteHistoryItem = async (mode: GameTimeOption, period: string) => {
    try {
      const res = await fetch('/api/admin/history/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: adminPinRef.current, mode, period }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.historyByMode) setHistoryByMode(data.historyByMode);
      }
    } catch {
      // ignore
    }
    showToast('Record deleted');
  };

  const handleInjectHistoryItem = async (mode: GameTimeOption, item: DrawResult) => {
    try {
      const res = await fetch('/api/admin/history/inject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: adminPinRef.current, mode, item }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.historyByMode) setHistoryByMode(data.historyByMode);
      }
    } catch {
      // ignore
    }
    showToast('Draw injected');
  };

  const isLocked = secondsRemaining <= 5;

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center text-slate-800 antialiased selection:bg-red-500 selection:text-white">
      {/* WordPress Admin Toolbar - Visible ONLY to Admin */}
      {isAdminAuthenticated && !isPlayerViewOnly && (
        <WordPressAdminBar
          isAdmin={isAdminAuthenticated}
          onOpenDashboard={() => setIsAdminOpen(true)}
          pendingDepositsCount={
            adminSummary?.pendingDepositsCount ??
            (adminTransactions.length > 0 ? adminTransactions : transactions).filter(
              (t) => t.type === 'deposit' && t.status === 'pending'
            ).length
          }
          pendingWithdrawsCount={
            adminSummary?.pendingWithdrawsCount ??
            (adminTransactions.length > 0 ? adminTransactions : transactions).filter(
              (t) => t.type === 'withdraw' && t.status === 'pending'
            ).length
          }
          balance={balance}
          forcedNumber={forcedNumbers[gameTime]}
          forcedOutcome={forcedOutcomes[gameTime]}
          onLogout={() => {
            setIsAdminAuthenticated(false);
            localStorage.removeItem('muna_admin_logged_in');
            showToast('Admin Logged Out');
          }}
          onTogglePlayerView={() => {
            setIsPlayerViewOnly(true);
            showToast(language === 'ur' ? 'یوزر منظر فعال ہو گیا' : 'Player view active');
          }}
          language={language}
        />
      )}

      {/* Floating button when admin temporarily switches to Player View */}
      {isAdminAuthenticated && isPlayerViewOnly && (
        <button
          onClick={() => {
            setIsPlayerViewOnly(false);
            showToast('Admin Bar Restored');
          }}
          className="fixed top-2 right-2 z-50 bg-[#1d2327] text-white text-[11px] font-bold px-3 py-1.5 rounded-full shadow-xl border border-[#2271b1] flex items-center gap-1.5 cursor-pointer hover:bg-[#2c3338]"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>⚙️ Back to Admin</span>
        </button>
      )}

      {/* Main View: AuthScreen after loading if not signed in, or Live Game once signed in */}
      {!currentUser ? (
        <AuthScreen
          onAuthSuccess={(user, isNewSignup, serverPayload) => {
            if (serverPayload) {
              if (typeof serverPayload.serverTime === 'number') {
                setServerTimeOffset(serverPayload.serverTime);
              }
              if (serverPayload.commitHashes) {
                setCommitHashes((prev) => ({ ...prev, ...serverPayload.commitHashes }));
              }
              const bal =
                typeof serverPayload.balance === 'number'
                  ? serverPayload.balance
                  : isNewSignup
                  ? 10
                  : 0;
              lastServerBalanceUpdatedAtRef.current =
                typeof serverPayload.balanceUpdatedAt === 'number'
                  ? serverPayload.balanceUpdatedAt
                  : Date.now();
              balanceRef.current = bal;
              setBalance(bal);
              if (Array.isArray(serverPayload.transactions)) {
                setTransactions(serverPayload.transactions);
              }
              if (Array.isArray(serverPayload.bets)) {
                userBetsRef.current = serverPayload.bets;
                setUserBets(serverPayload.bets);
              }
              if (serverPayload.historyByMode) {
                historyByModeRef.current = serverPayload.historyByMode;
                setHistoryByMode(serverPayload.historyByMode);
              }
              if (typeof serverPayload.referralEarnings === 'number') {
                setReferralEarnings(serverPayload.referralEarnings);
              }
              if (typeof serverPayload.invitedCount === 'number') {
                setInvitedCount(serverPayload.invitedCount);
              }
            } else if (isNewSignup) {
              balanceRef.current = 10;
              setBalance(10);
            }

            deletedUserIdsRef.current.delete(user.id);
            const cp = normalizePhoneKey(user.phone);
            if (cp) deletedPhonesRef.current.delete(cp);
            persistDeletedTombstones();
            setCurrentUser(user);
            if (serverPayload?.isGoogleAdmin) {
              isAdminAuthRef.current = true;
              setIsAdminAuthenticated(true);
              localStorage.setItem('muna_admin_logged_in', 'true');
            }
            if (isNewSignup) {
              showToast(
                language === 'ur'
                  ? `خوش آمدید ${user.fullName}! نیا اکاؤنٹ بن گیا اور Rs 10 سائن اپ بونس شامل ہو گیا`
                  : `Welcome ${user.fullName}! Rs 10 Sign-Up Bonus credited`
              );
            } else {
              showToast(
                language === 'ur'
                  ? `خوش آمدید ${user.fullName}! گیم میں داخل ہو گئے`
                  : `Welcome ${user.fullName}! Signed in successfully`
              );
            }
          }}
          language={language}
          theme={theme}
          onOpenAdmin={() => setIsAdminOpen(true)}
        />
      ) : (
        <div className="w-full max-w-md bg-white min-h-screen shadow-2xl relative flex flex-col pb-12">
          {/* Header with requested Deposit and Withdraw buttons right on top */}
          <Header
            balance={balance}
            theme={theme}
            onToggleTheme={() => setTheme((t) => (t === 'blue' ? 'green' : 'blue'))}
            onOpenDeposit={() => {
              setDepositInitialTab('form');
              setIsDepositOpen(true);
            }}
            onOpenDepositHistory={() => {
              setDepositInitialTab('history');
              setIsDepositOpen(true);
            }}
            onOpenWithdraw={() => {
              setWithdrawInitialTab('form');
              setIsWithdrawOpen(true);
            }}
            onOpenWithdrawHistory={() => {
              setWithdrawInitialTab('history');
              setIsWithdrawOpen(true);
            }}
            pendingDepositCount={transactions.filter((t) => t.type === 'deposit' && t.status === 'pending').length}
            pendingWithdrawCount={transactions.filter((t) => t.type === 'withdraw' && t.status === 'pending').length}
            onOpenRules={() => setIsRulesOpen(true)}
            onOpenInvite={() => setIsInviteOpen(true)}
            onOpenAdmin={() => setIsAdminOpen(true)}
            onRefreshBalance={() => {
              syncPlayerState(currentUser.id);
              showToast(language === 'ur' ? 'بیلنس اپ ڈیٹ ہو گیا' : 'Balance Refreshed');
            }}
            language={language}
            muted={muted}
            onToggleMute={() => {
              const next = soundManager.toggleMute();
              setMuted(next);
            }}
            onLogout={() => {
              void signOutFirebase();
              setCurrentUser(null);
              showToast(language === 'ur' ? 'اکاؤنٹ لاگ آؤٹ ہو گیا' : 'Signed out successfully');
            }}
          />

          {/* Live Online Gaming Indicator Bar */}
          <div className="bg-slate-900 text-white px-3.5 py-1.5 flex items-center justify-between text-[11px] border-b border-slate-800 shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-bold text-emerald-400 tracking-wide">
                {language === 'ur' ? 'آن لائن لائیو بیٹنگ' : 'Live Online Gaming'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-slate-300 font-mono text-[10px]">
              <span className="flex items-center gap-1">
                <span className="text-emerald-400">●</span> 1,840+ {language === 'ur' ? 'آن لائن' : 'Online'}
              </span>
              <span className="text-amber-400 font-bold">⚡ {language === 'ur' ? 'فوری ادائیگی' : 'Fast Payout'}</span>
            </div>
          </div>

          {/* Scrollable Main Content */}
          <main className="flex-1 overflow-y-auto relative pb-6">
            {/* Upper Ticket Card (How to play, 5 recent balls, Time remaining, countdown flip cards) */}
            <TicketCard
              currentPeriod={currentPeriod}
              secondsRemaining={secondsRemaining}
              recentResults={gameHistory}
              onOpenRules={() => setIsRulesOpen(true)}
              gameTime={gameTime}
              onChangeGameTime={(time) => {
                setGameTime(time);
                const now = getServerNow();
                const rem = getSecondsRemainingForMode(time, now);
                const per = getPeriodForMode(time, now);
                setSecondsRemaining(rem);
                setCurrentPeriod(per);
                lastPeriodPerModeRef.current[time] = per;
                lastPlayedSecondRef.current = rem <= 5 ? rem : -1;
              }}
              commitHash={commitHashes[gameTime]}
              language={language}
              theme={theme}
            />

            {/* Betting Board Section with relative container for lock overlay */}
            <div className="relative mt-2">
              <BettingBoard
                onSelectBet={handleSelectBet}
                selectedMultiplier={selectedMultiplier}
                onSelectMultiplier={(mult) => setSelectedMultiplier(mult)}
                isLocked={isLocked}
                language={language}
                theme={theme}
              />

              {/* Locked Countdown Overlay during last 5 seconds */}
              <CountdownOverlay
                secondsRemaining={secondsRemaining}
                currentPeriod={currentPeriod}
                language={language}
                theme={theme}
              />
            </div>

            {/* History Section: Game history, Chart, My history */}
            <HistorySection
              gameHistory={gameHistory}
              userBets={userBets}
              language={language}
              theme={theme}
            />
          </main>

          {/* Betting Drawer Modal */}
          <BetModal
            isOpen={isBetModalOpen}
            onClose={() => setIsBetModalOpen(false)}
            category={activeCategory}
            selection={activeSelection}
            userBalance={balance}
            initialMultiplier={selectedMultiplier}
            isLocked={secondsRemaining <= 5}
            commitHash={commitHashes[gameTime]}
            onConfirmBet={handleConfirmBet}
            onOpenDeposit={() => {
              setIsBetModalOpen(false);
              setDepositInitialTab('form');
              setIsDepositOpen(true);
            }}
            language={language}
          />

          {/* EasyPaisa & JazzCash Deposit Modal */}
          <DepositModal
            isOpen={isDepositOpen}
            onClose={() => setIsDepositOpen(false)}
            onDepositSuccess={handleDepositSuccess}
            existingTrxIds={transactions
              .filter((t) => t.type === 'deposit' && t.trxId)
              .map((t) => t.trxId as string)}
            transactions={transactions}
            initialTab={depositInitialTab}
            language={language}
            theme={theme}
          />

          {/* EasyPaisa & JazzCash Withdrawal Modal */}
          <WithdrawModal
            isOpen={isWithdrawOpen}
            onClose={() => setIsWithdrawOpen(false)}
            userBalance={balance}
            onWithdrawSuccess={handleWithdrawSuccess}
            transactions={transactions}
            initialTab={withdrawInitialTab}
            language={language}
            theme={theme}
          />

          {/* Winning / Loss Result Announcement Modal (جیت / ہار) */}
          <WinModal
            isOpen={isWinModalOpen}
            onClose={() => setIsWinModalOpen(false)}
            result={latestRoundSummary.result}
            roundBets={latestRoundSummary.roundBets}
            totalReturn={latestRoundSummary.totalReturn}
            totalProfit={latestRoundSummary.totalProfit}
            totalBetAmount={latestRoundSummary.totalBetAmount}
            isWinner={latestRoundSummary.isWinner}
            hasBet={latestRoundSummary.hasBet}
            gameTime={gameTime}
            language={language}
          />

          {/* Rules & How to play Modal */}
          <RulesModal
            isOpen={isRulesOpen}
            onClose={() => setIsRulesOpen(false)}
            language={language}
            theme={theme}
          />

          {/* Invite Friends & Share Modal */}
          <InviteModal
            isOpen={isInviteOpen}
            onClose={() => setIsInviteOpen(false)}
            language={language}
            theme={theme}
            referralCode={currentUser.phone || currentUser.id}
            earnedCommission={referralEarnings}
            invitedCount={invitedCount}
          />
        </div>
      )}

      {/* Toast Notification (Global across Auth & Game) */}
      {toastMessage && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-slate-900/90 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-lg border border-slate-700 animate-in fade-in slide-in-from-top duration-200">
          {toastMessage}
        </div>
      )}

      {/* Master Admin Control Panel (Secret Access via 5-Tap on Logo on Auth or Header) */}
      <AdminPanel
        isOpen={isAdminOpen}
        onClose={() => setIsAdminOpen(false)}
        forcedNumbers={forcedNumbers}
        forcedOutcomes={forcedOutcomes}
        onSetForcedOutcome={async (mode, spec) => {
          try {
            const res = await fetch('/api/admin/force-outcome', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                pin: adminPinRef.current || '786',
                mode,
                spec,
                targetPeriod: getPeriodForMode(mode, getServerNow()),
              }),
            });
            if (res.ok) {
              const data = await res.json();
              if (typeof data.serverTime === 'number') setServerTimeOffset(data.serverTime);
              applyServerForcedMaps(data.forcedOutcomes, data.forcedNumbers);
              if (isVerifiedGoogleAdmin(firebaseUserRef.current)) {
                void syncGameModeOverrideToFirestore(mode, spec).catch(() => {});
              }
              if (spec) {
                const desc =
                  spec.kind === 'number'
                    ? `نمبر [${spec.number}]`
                    : spec.kind === 'bigSmall'
                    ? `${spec.bigSmall?.toUpperCase()} (${spec.bigSmall === 'Big' ? '5-9' : '0-4'})`
                    : `${spec.color?.toUpperCase()}`;
                showToast(
                  language === 'ur'
                    ? `ایڈمن رزلٹ فکس ہو گیا: اب ${desc} آئے گا!`
                    : `Admin Outcome Locked: ${desc}!`
                );
              } else {
                showToast(
                  language === 'ur'
                    ? 'نتیجہ Auto Strategy پر ری سیٹ ہو گیا'
                    : 'Reset to Auto Strategy'
                );
              }
              return true;
            } else if (res.status === 401) {
              setIsAdminAuthenticated(false);
              localStorage.removeItem('muna_admin_logged_in');
              showToast(
                language === 'ur'
                  ? 'ایڈمن پن دوبارہ درج کریں'
                  : 'Admin session expired, please enter PIN again'
              );
              return false;
            }
          } catch {
            // network error
          }
          return false;
        }}
        onSetForcedNumber={async (mode, num, targetPeriod) => {
          const spec: ForcedOutcomeSpec | null =
            num === null
              ? null
              : { kind: 'number', number: num, targetPeriod: targetPeriod || getPeriodForMode(mode, getServerNow()) };
          try {
            const res = await fetch('/api/admin/force-outcome', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                pin: adminPinRef.current || '786',
                mode,
                spec,
                targetPeriod: targetPeriod || getPeriodForMode(mode, getServerNow()),
              }),
            });
            if (res.ok) {
              const data = await res.json();
              if (typeof data.serverTime === 'number') setServerTimeOffset(data.serverTime);
              applyServerForcedMaps(data.forcedOutcomes, data.forcedNumbers);
              if (isVerifiedGoogleAdmin(firebaseUserRef.current)) {
                void syncGameModeOverrideToFirestore(mode, spec).catch(() => {});
              }
              if (num !== null) {
                showToast(
                  language === 'ur'
                    ? `ایڈمن رزلٹ فکس ہو گیا: اگلا نمبر [${num}] آئے گا!`
                    : `Admin Outcome Locked: Next result will be [${num}]!`
                );
              }
            }
          } catch {
            // ignore
          }
        }}
        currentPeriods={{
          30: getPeriodForMode(30, getServerNow()),
          60: getPeriodForMode(60, getServerNow()),
          180: getPeriodForMode(180, getServerNow()),
          300: getPeriodForMode(300, getServerNow())
        }}
        activeMode={gameTime}
        adminUsers={adminUsers}
        blockedPhones={blockedPhones}
        adminSummary={adminSummary}
        lastSyncedAt={lastAdminSyncedAt}
        onRefreshAdmin={async () => {
          const fresh = await fetchAdminState();
          if (isVerifiedGoogleAdmin(firebaseUserRef.current)) {
            const usersToPush = (fresh?.users || serverAdminUsersRef.current).filter(
              (u: RegisteredUser) => !isUserDeletedLocally(u)
            );
            const txsToPush = fresh?.transactions || adminTransactions;
            await pushAdminSnapshotToFirestore(
              usersToPush,
              txsToPush,
              Array.from(deletedUserIdsRef.current)
            ).catch(() => {});
          }
        }}
        onUpdateUserBalance={handleUpdateUserBalanceOnServer}
        onDeleteUser={handleDeleteUserOnServer}
        onUnblockPhone={handleUnblockPhoneOnServer}
        onPinVerified={(pin, snapshot) => {
          setAdminPin(pin);
          adminPinRef.current = pin;
          isAdminAuthRef.current = true;
          if (snapshot) {
            applyAdminSnapshot(snapshot);
          }
          fetchAdminState(pin);
        }}
        transactions={isAdminAuthenticated ? adminTransactions : transactions}
        onApproveDeposit={handleApproveDeposit}
        onRejectDeposit={handleRejectDeposit}
        onDeleteDeposit={handleDeleteDeposit}
        onEditDeposit={handleEditDeposit}
        onAddDeposit={handleAddDeposit}
        onApproveWithdraw={handleApproveWithdraw}
        onRejectWithdraw={handleRejectWithdraw}
        onDeleteWithdraw={handleDeleteWithdraw}
        onEditWithdraw={handleEditWithdraw}
        onAddWithdraw={handleAddWithdraw}
        balance={balance}
        onUpdateBalance={(newBal) => {
          if (currentUser) {
            handleUpdateUserBalanceOnServer(currentUser.id, 'set', newBal);
          } else {
            balanceRef.current = newBal;
            setBalance(newBal);
          }
        }}
        onResetBalance={handleResetBalance}
        onClearAllDeposits={handleClearAllDeposits}
        onClearAllWithdrawals={handleClearAllWithdrawals}
        onClearAllUserData={handleClearAllUserData}
        historyByMode={historyByMode}
        onDeleteHistoryItem={handleDeleteHistoryItem}
        onInjectHistoryItem={handleInjectHistoryItem}
        userBets={isAdminAuthenticated ? adminBets : userBets}
        onClearBets={async () => {
          try {
            await fetch('/api/admin/bets/clear', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pin: adminPinRef.current }),
            });
          } catch {
            // ignore
          }
          userBetsRef.current = [];
          setUserBets([]);
          setAdminBets([]);
        }}
        currentUserId={currentUser?.id}
        language={language}
        isAuthenticated={isAdminAuthenticated}
        onAuthenticate={(status) => {
          isAdminAuthRef.current = status;
          setIsAdminAuthenticated(status);
        }}
        firebaseAdminConnected={isVerifiedGoogleAdmin(firebaseUser)}
        firebaseAdminEmail={firebaseUser?.email ?? null}
        onConnectGoogleCloud={async () => {
          try {
            const { firebaseUser: fbUser, isAdminEmail } = await signInWithGoogleFirebase();
            if (!isAdminEmail) {
              showToast('Please sign in using teensobazar@gmail.com for Cloud Admin access');
              return false;
            }
            await ensureAdminDocument(fbUser);
            const fresh = await fetchAdminState();
            const usersToPush = (fresh?.users || serverAdminUsersRef.current).filter(
              (u: RegisteredUser) => !isUserDeletedLocally(u)
            );
            await pushAdminSnapshotToFirestore(
              usersToPush,
              fresh?.transactions || adminTransactions,
              Array.from(deletedUserIdsRef.current)
            );
            showToast('Firebase Cloud DB connected live!');
            return true;
          } catch {
            showToast('Could not connect Firebase Cloud DB');
            return false;
          }
        }}
      />

      {/* Front Loading Splash Screen (0% to 100%) */}
      {isLoadingSplash && (
        <SplashScreen
          onComplete={() => setIsLoadingSplash(false)}
          language={language}
        />
      )}
    </div>
  );
}
