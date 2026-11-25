import React, { useState, useEffect } from 'react';
import {
  X,
  Lock,
  Unlock,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  PlusCircle,
  Dice5,
  Sliders,
  DollarSign,
  ArrowUpRight,
  ArrowDownLeft,
  KeyRound,
  RotateCcw,
  Sparkles,
  Wallet,
  BarChart3,
  TrendingUp,
  Flame,
  Award,
  AlertTriangle,
  Zap,
  Pencil,
  Trash2,
  Plus,
  Save,
  RefreshCw,
  Users,
  UserPlus,
  Phone,
  Search,
  Copy,
  Check,
  Eye,
  Image as ImageIcon,
  Clock
} from 'lucide-react';
import {
  DrawResult,
  GameTimeOption,
  PaymentTransaction,
  RegisteredUser,
  UserBet,
  AdminSummary,
  ForcedOutcomeSpec
} from '../types/game';
import {
  getBigSmallForNumber,
  getColorsForNumber,
  getSecondsRemainingForMode,
  getPeriodForMode
} from '../utils/gameRules';
import { soundManager } from '../utils/audio';

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
  // Game outcome forcing
  forcedNumbers: Record<GameTimeOption, number | null>;
  forcedOutcomes?: Record<GameTimeOption, ForcedOutcomeSpec | null>;
  onSetForcedNumber: (mode: GameTimeOption, num: number | null, targetPeriod?: string) => void;
  onSetForcedOutcome?: (
    mode: GameTimeOption,
    spec: ForcedOutcomeSpec | null
  ) => Promise<boolean>;
  // Modes & Periods
  currentPeriods: Record<GameTimeOption, string>;
  activeMode: GameTimeOption;
  // Global Server Users & Summary
  adminUsers?: RegisteredUser[];
  adminSummary?: AdminSummary;
  lastSyncedAt?: number;
  onRefreshAdmin?: () => Promise<void> | void;
  onUpdateUserBalance?: (
    userId: string,
    action: 'set' | 'add' | 'deduct' | 'reset',
    amount: number
  ) => Promise<void> | void;
  onDeleteUser?: (userId: string) => Promise<void> | void;
  onPinVerified?: (pin: string, snapshot?: any) => void;
  // Transactions
  transactions: PaymentTransaction[];
  onApproveDeposit: (txId: string) => void;
  onRejectDeposit: (txId: string) => void;
  onDeleteDeposit?: (txId: string) => void;
  onEditDeposit?: (txId: string, updated: Partial<PaymentTransaction>) => void;
  onAddDeposit?: (data: {
    userId?: string;
    amount: number;
    accountNumber: string;
    accountTitle: string;
    method: 'easypaisa' | 'jazzcash';
    trxId: string;
    status: 'completed' | 'pending';
    creditNow: boolean;
  }) => void;
  onApproveWithdraw: (txId: string) => void;
  onRejectWithdraw: (txId: string) => void;
  onDeleteWithdraw?: (txId: string) => void;
  onEditWithdraw?: (txId: string, updated: Partial<PaymentTransaction>) => void;
  onAddWithdraw?: (data: {
    userId?: string;
    amount: number;
    accountNumber: string;
    accountTitle: string;
    method: 'easypaisa' | 'jazzcash';
    trxId: string;
    status: 'completed' | 'pending' | 'rejected';
    deductNow: boolean;
  }) => void;
  // Balance
  balance: number;
  onUpdateBalance: (newBalance: number) => void;
  onResetBalance?: () => void;
  onClearAllDeposits?: () => void;
  onClearAllWithdrawals?: () => void;
  onClearAllUserData?: () => void;
  // History
  historyByMode: Record<GameTimeOption, DrawResult[]>;
  onDeleteHistoryItem: (mode: GameTimeOption, period: string) => void;
  onInjectHistoryItem: (mode: GameTimeOption, item: DrawResult) => void;
  // User Bets
  userBets: UserBet[];
  onClearBets: () => void;
  currentUserId?: string;
  language: 'ur' | 'en';
  isAuthenticated: boolean;
  onAuthenticate: (status: boolean) => void;
  firebaseAdminConnected?: boolean;
  firebaseAdminEmail?: string | null;
  onConnectGoogleCloud?: () => Promise<boolean> | void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  isOpen,
  onClose,
  forcedNumbers,
  forcedOutcomes,
  onSetForcedNumber,
  onSetForcedOutcome,
  currentPeriods,
  activeMode,
  adminUsers,
  adminSummary,
  lastSyncedAt,
  onRefreshAdmin,
  onUpdateUserBalance,
  onDeleteUser,
  onPinVerified,
  transactions,
  onApproveDeposit,
  onRejectDeposit,
  onDeleteDeposit,
  onEditDeposit,
  onAddDeposit,
  onApproveWithdraw,
  onRejectWithdraw,
  onDeleteWithdraw,
  onEditWithdraw,
  onAddWithdraw,
  balance,
  onUpdateBalance,
  onResetBalance,
  onClearAllDeposits,
  onClearAllWithdrawals,
  onClearAllUserData,
  userBets,
  currentUserId,
  language,
  isAuthenticated,
  onAuthenticate,
  firebaseAdminConnected,
  firebaseAdminEmail,
  onConnectGoogleCloud
}) => {
  // Master PIN (Default: 786)
  const [adminPin, setAdminPin] = useState<string>(() => {
    return localStorage.getItem('muna_admin_master_pin') || '786';
  });
  const [enteredPin, setEnteredPin] = useState<string>('');
  const [pinError, setPinError] = useState<boolean>(false);

  // Navigation Tabs: 'outcomes' | 'analytics' | 'users' | 'deposits' | 'withdraws' | 'balance' | 'settings'
  const [activeTab, setActiveTab] = useState<
    'outcomes' | 'analytics' | 'users' | 'deposits' | 'withdraws' | 'balance' | 'settings'
  >('outcomes');

  // Selected mode in outcome rigging (always syncs with activeMode when panel opens!)
  const [selectedMode, setSelectedMode] = useState<GameTimeOption>(activeMode);
  const [rigSecondsLeft, setRigSecondsLeft] = useState<number>(() =>
    getSecondsRemainingForMode(activeMode)
  );
  const [rigPeriodNow, setRigPeriodNow] = useState<string>(() =>
    getPeriodForMode(activeMode)
  );
  const [keepPersistentLock, setKeepPersistentLock] = useState<boolean>(false);
  const [adminNotice, setAdminNotice] = useState<string | null>(null);
  const [adminNoticeIsError, setAdminNoticeIsError] = useState<boolean>(false);
  const [localRegisteredUsers, setLocalRegisteredUsers] = useState<RegisteredUser[]>([]);
  const [userBalancesMap, setUserBalancesMap] = useState<Record<string, number>>({});
  const [userSearch, setUserSearch] = useState<string>('');
  const [selectedBalanceUserId, setSelectedBalanceUserId] = useState<string>(currentUserId || '');
  const [zoomScreenshot, setZoomScreenshot] = useState<{
    url: string;
    trxId?: string;
    player?: string;
    amount?: number;
  } | null>(null);
  const [depositFilter, setDepositFilter] = useState<'all' | 'pending' | 'completed' | 'rejected'>('all');
  const [copiedTrxId, setCopiedTrxId] = useState<string | null>(null);

  const [isManualSyncing, setIsManualSyncing] = useState<boolean>(false);

  const registeredUsers: RegisteredUser[] = lastSyncedAt
    ? adminUsers || []
    : adminUsers && adminUsers.length > 0
    ? adminUsers
    : localRegisteredUsers;

  const loadUsersFromStorage = () => {
    try {
      const rawUsers = localStorage.getItem('muna_registered_users');
      const parsedUsers: RegisteredUser[] = rawUsers ? JSON.parse(rawUsers) : [];
      setLocalRegisteredUsers(
        [...parsedUsers].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      );
      const rawBals = localStorage.getItem('muna_user_balances');
      setUserBalancesMap(rawBals ? (JSON.parse(rawBals) as Record<string, number>) : {});
    } catch {
      setLocalRegisteredUsers([]);
      setUserBalancesMap({});
    }
  };

  useEffect(() => {
    if (isOpen) {
      setSelectedMode(activeMode);
      setRigSecondsLeft(getSecondsRemainingForMode(activeMode));
      setRigPeriodNow(getPeriodForMode(activeMode));
      loadUsersFromStorage();
      if (isAuthenticated) {
        onRefreshAdmin?.();
      }
      setAdminNotice(null);
      setAdminNoticeIsError(false);
    }
  }, [isOpen, activeMode, isAuthenticated]);

  useEffect(() => {
    if (!isOpen) return;
    setRigSecondsLeft(getSecondsRemainingForMode(selectedMode));
    setRigPeriodNow(getPeriodForMode(selectedMode));
    const timer = setInterval(() => {
      setRigSecondsLeft(getSecondsRemainingForMode(selectedMode));
      setRigPeriodNow(getPeriodForMode(selectedMode));
    }, 350);
    return () => clearInterval(timer);
  }, [isOpen, selectedMode]);

  useEffect(() => {
    if (!selectedBalanceUserId) {
      if (currentUserId) {
        setSelectedBalanceUserId(currentUserId);
      } else if (registeredUsers.length > 0) {
        setSelectedBalanceUserId(registeredUsers[0].id);
      }
    }
  }, [currentUserId, registeredUsers, selectedBalanceUserId]);

  // Balance edits
  const [manualBalanceInput, setManualBalanceInput] = useState<string>('');
  const [manualDepositAmount, setManualDepositAmount] = useState<string>('');

  // CRUD States for Deposits
  const [showAddDepositForm, setShowAddDepositForm] = useState<boolean>(false);
  const [newDepAmount, setNewDepAmount] = useState<string>('');
  const [newDepMethod, setNewDepMethod] = useState<'easypaisa' | 'jazzcash'>('easypaisa');
  const [newDepAccount, setNewDepAccount] = useState<string>('03001234567');
  const [newDepTitle, setNewDepTitle] = useState<string>('Player');
  const [newDepTrx, setNewDepTrx] = useState<string>('');
  const [newDepStatus, setNewDepStatus] = useState<'completed' | 'pending'>('completed');
  const [newDepCreditNow, setNewDepCreditNow] = useState<boolean>(true);
  const [editingDeposit, setEditingDeposit] = useState<PaymentTransaction | null>(null);

  // CRUD States for Withdrawals
  const [showAddWithdrawForm, setShowAddWithdrawForm] = useState<boolean>(false);
  const [newWthAmount, setNewWthAmount] = useState<string>('');
  const [newWthMethod, setNewWthMethod] = useState<'easypaisa' | 'jazzcash'>('easypaisa');
  const [newWthAccount, setNewWthAccount] = useState<string>('03001234567');
  const [newWthTitle, setNewWthTitle] = useState<string>('Player');
  const [newWthTrx, setNewWthTrx] = useState<string>('');
  const [newWthStatus, setNewWthStatus] = useState<'completed' | 'pending' | 'rejected'>('completed');
  const [newWthDeductNow, setNewWthDeductNow] = useState<boolean>(false);
  const [editingWithdraw, setEditingWithdraw] = useState<PaymentTransaction | null>(null);

  // Settings PIN update
  const [newPinInput, setNewPinInput] = useState<string>('');

  if (!isOpen) return null;

  const showNotice = (msg: string, isError = false) => {
    setAdminNoticeIsError(isError);
    setAdminNotice(msg);
    setTimeout(() => setAdminNotice(null), 3500);
  };

  const activeForcedSpec: ForcedOutcomeSpec | null =
    forcedOutcomes?.[selectedMode] ??
    (forcedNumbers[selectedMode] !== null && forcedNumbers[selectedMode] !== undefined
      ? { kind: 'number', number: forcedNumbers[selectedMode]! }
      : null);

  const applyServerForcedSpec = async (
    spec: ForcedOutcomeSpec | null,
    msgUr: string,
    msgEn: string
  ) => {
    const payload = spec
      ? { ...spec, targetPeriod: rigPeriodNow || currentPeriods[selectedMode], persistent: keepPersistentLock }
      : null;

    if (onSetForcedOutcome) {
      const ok = await onSetForcedOutcome(selectedMode, payload);
      if (ok) {
        if (spec) soundManager.playCash();
        else soundManager.playClick();
        showNotice(language === 'ur' ? msgUr : msgEn, false);
      } else {
        soundManager.playToom(1);
        showNotice(
          language === 'ur'
            ? 'سرور سے رابطہ یا پن کوڈ چیک کریں، لاک نہیں ہو سکا!'
            : 'Failed to lock outcome on server! Check PIN or connection.',
          true
        );
      }
      return;
    }

    if (!payload) {
      soundManager.playClick();
      onSetForcedNumber(selectedMode, null);
      showNotice(language === 'ur' ? msgUr : msgEn, false);
    } else if (payload.kind === 'number' && typeof payload.number === 'number') {
      soundManager.playCash();
      onSetForcedNumber(selectedMode, payload.number, payload.targetPeriod);
      showNotice(language === 'ur' ? msgUr : msgEn, false);
    }
  };

  // Handle PIN verification
  const handleVerifyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    const candidate = enteredPin.trim();
    try {
      const res = await fetch('/api/admin/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: candidate }),
      });
      if (res.ok) {
        const snapshot = await res.json().catch(() => null);
        soundManager.playCash();
        setPinError(false);
        localStorage.setItem('muna_admin_logged_in', 'true');
        localStorage.setItem('muna_admin_master_pin', candidate);
        setAdminPin(candidate);
        onPinVerified?.(candidate, snapshot);
        onAuthenticate(true);
        return;
      }
    } catch {
      // Fallback to local check if offline
      if (candidate === adminPin || candidate === '786') {
        soundManager.playCash();
        onAuthenticate(true);
        setPinError(false);
        localStorage.setItem('muna_admin_logged_in', 'true');
        return;
      }
    }
    soundManager.playToom(1);
    setPinError(true);
    setEnteredPin('');
  };

  const handleUpdatePin = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newPinInput.trim();
    if (trimmed.length >= 3) {
      try {
        await fetch('/api/admin/update-pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin: adminPin, newPin: trimmed }),
        });
      } catch {
        // ignore
      }
      setAdminPin(trimmed);
      localStorage.setItem('muna_admin_master_pin', trimmed);
      setNewPinInput('');
      soundManager.playCash();
      showNotice(language === 'ur' ? 'ماسٹر ایڈمن پن تبدیل ہو گیا ہے!' : 'Admin Master PIN Updated!');
    }
  };

  const handleDeleteRegisteredUser = async (userId: string) => {
    try {
      const updated = registeredUsers.filter((u) => u.id !== userId);
      setLocalRegisteredUsers(updated);
      const rawUsers = localStorage.getItem('muna_registered_users');
      const parsedUsers: RegisteredUser[] = rawUsers ? JSON.parse(rawUsers) : [];
      localStorage.setItem(
        'muna_registered_users',
        JSON.stringify(parsedUsers.filter((u) => u.id !== userId))
      );
      const nextBals = { ...userBalancesMap };
      delete nextBals[userId];
      setUserBalancesMap(nextBals);
      localStorage.setItem('muna_user_balances', JSON.stringify(nextBals));
    } catch {
      // ignore
    }
    if (onDeleteUser) {
      await onDeleteUser(userId);
    }
    soundManager.playToom(1);
    showNotice(language === 'ur' ? 'یوزر ریکارڈ ڈیلیٹ ہو گیا!' : 'User removed');
  };

  const nowTs = Date.now();
  const newUsersCount =
    adminSummary?.newUsers24h ??
    registeredUsers.filter((u) => u.isNew ?? nowTs - (u.createdAt || 0) < 24 * 60 * 60 * 1000).length;
  const totalAllBalances =
    adminSummary?.totalAllBalances ??
    registeredUsers.reduce(
      (sum, u) =>
        sum +
        (typeof u.balance === 'number'
          ? u.balance
          : currentUserId === u.id
          ? balance
          : userBalancesMap[u.id] || 0),
      0
    );
  const completedDepositsList = transactions.filter(
    (t) => t.type === 'deposit' && t.status === 'completed'
  );
  const completedWithdrawsList = transactions.filter(
    (t) => t.type === 'withdraw' && t.status === 'completed'
  );
  const totalDepositsAmount =
    adminSummary?.totalDepositBase ?? completedDepositsList.reduce((s, t) => s + t.amount, 0);
  const totalDepositBonusAmount =
    adminSummary?.totalDepositBonus ??
    completedDepositsList.reduce((s, t) => s + (t.bonusAmount || 0), 0);
  const totalWithdrawnAmount =
    adminSummary?.totalWithdrawnAmount ??
    completedWithdrawsList.reduce((s, t) => s + t.amount, 0);

  const pendingDeposits = transactions.filter(
    (t) => t.type === 'deposit' && t.status === 'pending'
  );
  const pendingWithdraws = transactions.filter(
    (t) => t.type === 'withdraw' && t.status === 'pending'
  );
  const totalPendingWithdrawAmount =
    adminSummary?.totalPendingWithdrawAmount ??
    pendingWithdraws.reduce((s, t) => s + t.amount, 0);

  // --------------------------------------------------------------------------
  // LIVE BET ANALYTICS (کس نمبر، بگ، سمال یا رنگ پر کتنی بیٹ لگی ہے)
  // --------------------------------------------------------------------------
  const currentPeriodId = rigPeriodNow || currentPeriods[selectedMode];

  // Active bets for this period (or fallback to recent pending bets)
  const currentPeriodBets = (userBets || []).filter(
    (b) => b.period === currentPeriodId && b.status === 'pending'
  );
  const relevantBets = currentPeriodBets.length > 0
    ? currentPeriodBets
    : (userBets || []).filter((b) => b.status === 'pending');

  // Stats per number 0 to 9
  const numberStats: Record<number, { amount: number; count: number }> = {
    0: { amount: 0, count: 0 },
    1: { amount: 0, count: 0 },
    2: { amount: 0, count: 0 },
    3: { amount: 0, count: 0 },
    4: { amount: 0, count: 0 },
    5: { amount: 0, count: 0 },
    6: { amount: 0, count: 0 },
    7: { amount: 0, count: 0 },
    8: { amount: 0, count: 0 },
    9: { amount: 0, count: 0 }
  };

  let bigTotalAmount = 0;
  let bigBetCount = 0;
  let smallTotalAmount = 0;
  let smallBetCount = 0;

  let greenTotalAmount = 0;
  let greenBetCount = 0;
  let violetTotalAmount = 0;
  let violetBetCount = 0;
  let redTotalAmount = 0;
  let redBetCount = 0;

  let totalRoundPool = 0;

  relevantBets.forEach((b) => {
    totalRoundPool += b.totalAmount;
    if (b.category === 'number') {
      const num = Number(b.selection);
      if (!isNaN(num) && numberStats[num]) {
        numberStats[num].amount += b.totalAmount;
        numberStats[num].count += 1;
      }
    } else if (b.category === 'bigSmall') {
      if (b.selection === 'Big') {
        bigTotalAmount += b.totalAmount;
        bigBetCount += 1;
      } else if (b.selection === 'Small') {
        smallTotalAmount += b.totalAmount;
        smallBetCount += 1;
      }
    } else if (b.category === 'color') {
      if (b.selection === 'green') {
        greenTotalAmount += b.totalAmount;
        greenBetCount += 1;
      } else if (b.selection === 'violet') {
        violetTotalAmount += b.totalAmount;
        violetBetCount += 1;
      } else if (b.selection === 'red') {
        redTotalAmount += b.totalAmount;
        redBetCount += 1;
      }
    }
  });

  // Calculate highest & lowest bet numbers
  let maxBetNum = 0;
  let maxBetAmount = -1;
  let minBetNum = 0;
  let minBetAmount = Infinity;

  for (let n = 0; n <= 9; n++) {
    const amt = numberStats[n].amount;
    if (amt > maxBetAmount) {
      maxBetAmount = amt;
      maxBetNum = n;
    }
    if (amt < minBetAmount) {
      minBetAmount = amt;
      minBetNum = n;
    }
  }

  // Calculate Big vs Small percentage
  const totalBigSmall = bigTotalAmount + smallTotalAmount;
  const bigPercent = totalBigSmall > 0 ? Math.round((bigTotalAmount / totalBigSmall) * 100) : 50;
  const smallPercent = totalBigSmall > 0 ? 100 - bigPercent : 50;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4 animate-in fade-in">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-700 text-slate-100 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh]">
        {/* Header Bar */}
        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-bold shadow-inner">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-sm sm:text-base text-white tracking-wide">
                  {language === 'ur' ? 'منا ونگو - ماسٹر کنٹرول پینل' : 'Muna WinGo Control Panel'}
                </h3>
                <span className="bg-amber-400/20 text-amber-300 border border-amber-400/30 text-[9px] px-2 py-0.5 rounded-full font-mono font-bold">
                  MASTER PRIVILEGED
                </span>
              </div>
              <p className="text-[10px] text-slate-400">
                {language === 'ur'
                  ? 'لائیو بیٹس انالسٹکس، رزلٹ فکسنگ، ڈپازٹ و وڈرا منظوری'
                  : 'Live Bet Analytics, Rig Results & Complete Wallet Operations'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {isAuthenticated && (
              <>
                {firebaseAdminConnected ? (
                  <span
                    className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-xl bg-amber-500/15 border border-amber-400/35 text-amber-300 text-[10px] font-bold"
                    title={firebaseAdminEmail ? `Firebase Connected: ${firebaseAdminEmail}` : 'Firebase Connected'}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Cloud DB</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={async () => {
                      soundManager.playClick();
                      const ok = await onConnectGoogleCloud?.();
                      if (ok) {
                        showNotice('Firebase Cloud Database connected!');
                      }
                    }}
                    className="px-2 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/35 border border-amber-400/40 text-amber-300 text-[10px] font-bold cursor-pointer transition-all"
                    title="Sign in with teensobazar@gmail.com to enable live Firebase Cloud sync"
                  >
                    Connect Cloud DB
                  </button>
                )}

                <button
                  type="button"
                  onClick={async () => {
                    soundManager.playClick();
                    setIsManualSyncing(true);
                    loadUsersFromStorage();
                    await onRefreshAdmin?.();
                    setIsManualSyncing(false);
                    showNotice('Synced live with server & cloud');
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-emerald-600/25 hover:bg-emerald-600/40 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold flex items-center gap-1.5 cursor-pointer transition-all"
                  title="Refresh Live Users, Deposits & Withdrawals"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isManualSyncing ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">
                    {lastSyncedAt
                      ? `Live • ${new Date(lastSyncedAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}`
                      : 'Sync Now'}
                  </span>
                  <span className="sm:hidden">Sync</span>
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Security PIN Gate (If not logged in yet) */}
        {!isAuthenticated ? (
          <div className="p-6 text-center space-y-5 animate-in fade-in">
            <div className="w-16 h-16 rounded-full bg-slate-800 border-2 border-amber-500/50 mx-auto flex items-center justify-center text-amber-400 shadow-xl">
              <Lock className="w-8 h-8" />
            </div>

            <div>
              <h4 className="text-xl font-black text-white">
                {language === 'ur' ? 'ایڈمن سیکیورٹی لاگ ان' : 'Admin Security Access'}
              </h4>
              <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                {language === 'ur'
                  ? 'پینل کھولنے کے لیے ماسٹر پن کوڈ درج کریں (صرف ایڈمن کیلئے)'
                  : 'Enter Master PIN to open admin control panel'}
              </p>
            </div>

            <form onSubmit={handleVerifyPin} className="max-w-xs mx-auto space-y-3">
              <input
                type="password"
                required
                placeholder="Master PIN (786)"
                value={enteredPin}
                onChange={(e) => setEnteredPin(e.target.value)}
                className={`w-full py-3 text-center text-2xl tracking-widest font-mono font-bold rounded-2xl bg-slate-800 border focus:outline-none focus:ring-2 ${
                  pinError
                    ? 'border-red-500 focus:ring-red-500 text-red-400'
                    : 'border-slate-700 focus:ring-amber-500 text-white'
                }`}
                autoFocus
              />

              {pinError && (
                <p className="text-xs text-red-400 font-bold">
                  {language === 'ur' ? 'غلط پن کوڈ! دوبارہ کوشش کریں' : 'Incorrect PIN! Try again'}
                </p>
              )}

              <button
                type="submit"
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 active:scale-98 text-white font-bold text-sm shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <Unlock className="w-4 h-4" />
                <span>{language === 'ur' ? 'پینل کھولیں' : 'Unlock Control Panel'}</span>
              </button>

              <p className="text-[11px] text-slate-500">
                Default Master PIN: <strong className="text-amber-400">786</strong>
              </p>
            </form>
          </div>
        ) : (
          /* Authenticated Dashboard */
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Clean Tab Navigation Bar (including Users tab!) */}
            <div className="grid grid-cols-7 p-1.5 bg-slate-950/80 border-b border-slate-800 text-center gap-1 select-none">
              <button
                onClick={() => {
                  onRefreshAdmin?.();
                  setActiveTab('outcomes');
                }}
                className={`py-2 px-0.5 rounded-xl text-[9px] sm:text-[11px] font-bold transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                  activeTab === 'outcomes'
                    ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Dice5 className="w-3.5 h-3.5" />
                <span>{language === 'ur' ? 'رزلٹ فکس' : 'Rig'}</span>
              </button>

              <button
                onClick={() => {
                  onRefreshAdmin?.();
                  setActiveTab('analytics');
                }}
                className={`relative py-2 px-0.5 rounded-xl text-[9px] sm:text-[11px] font-bold transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                  activeTab === 'analytics'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5 text-purple-300" />
                <span>{language === 'ur' ? 'لائیو بیٹس' : 'Bets'}</span>
                {totalRoundPool > 0 && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping absolute top-1 right-1" />
                )}
              </button>

              <button
                onClick={() => {
                  loadUsersFromStorage();
                  onRefreshAdmin?.();
                  setActiveTab('users');
                }}
                className={`relative py-2 px-0.5 rounded-xl text-[9px] sm:text-[11px] font-bold transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                  activeTab === 'users'
                    ? 'bg-cyan-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>{language === 'ur' ? 'یوزرز' : 'Users'}</span>
                <span
                  className={`absolute top-0.5 right-0.5 min-w-3.5 h-3.5 px-1 rounded-full text-[8px] font-black flex items-center justify-center ${
                    newUsersCount > 0 ? 'bg-emerald-400 text-slate-950 animate-pulse' : 'bg-slate-700 text-slate-200'
                  }`}
                >
                  {registeredUsers.length}
                </span>
              </button>

              <button
                onClick={() => {
                  onRefreshAdmin?.();
                  setActiveTab('deposits');
                }}
                className={`relative py-2 px-0.5 rounded-xl text-[9px] sm:text-[11px] font-bold transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                  activeTab === 'deposits'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <ArrowDownLeft className="w-3.5 h-3.5" />
                <span>{language === 'ur' ? 'ڈپازٹ' : 'Deposits'}</span>
                {pendingDeposits.length > 0 && (
                  <span className="absolute top-1 right-0.5 w-3.5 h-3.5 rounded-full bg-amber-400 text-slate-950 text-[8px] font-black flex items-center justify-center animate-pulse">
                    {pendingDeposits.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => {
                  onRefreshAdmin?.();
                  setActiveTab('withdraws');
                }}
                className={`relative py-2 px-0.5 rounded-xl text-[9px] sm:text-[11px] font-bold transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                  activeTab === 'withdraws'
                    ? 'bg-orange-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                <span>{language === 'ur' ? 'وڈرا' : 'Withdrawal'}</span>
                {pendingWithdraws.length > 0 && (
                  <span className="absolute top-1 right-0.5 w-3.5 h-3.5 rounded-full bg-red-400 text-white text-[8px] font-black flex items-center justify-center animate-pulse">
                    {pendingWithdraws.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => {
                  onRefreshAdmin?.();
                  setActiveTab('balance');
                }}
                className={`py-2 px-0.5 rounded-xl text-[9px] sm:text-[11px] font-bold transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                  activeTab === 'balance'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Wallet className="w-3.5 h-3.5" />
                <span>{language === 'ur' ? 'بیلنس' : 'Balance'}</span>
              </button>

              <button
                onClick={() => {
                  onRefreshAdmin?.();
                  setActiveTab('settings');
                }}
                className={`py-2 px-0.5 rounded-xl text-[9px] sm:text-[11px] font-bold transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                  activeTab === 'settings'
                    ? 'bg-slate-700 text-white shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>{language === 'ur' ? 'سیٹنگز' : 'Settings'}</span>
              </button>
            </div>

            {adminNotice && (
              <div
                className={`mx-4 mt-2 px-3 py-2 rounded-xl text-xs font-bold text-center border ${
                  adminNoticeIsError
                    ? 'bg-red-500/20 border-red-500/40 text-red-300'
                    : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                }`}
              >
                {adminNotice}
              </div>
            )}

            {/* Tab Contents Area */}
            <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-4">
              {/* TAB 1: OUTCOME RIGGING WITH LIVE NUMBER BET AMOUNTS */}
              {activeTab === 'outcomes' && (
                <div className="space-y-4 animate-in fade-in">
                  {/* Mode Selector (30s, 1Min, 3Min, 5Min) */}
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-300">
                      {language === 'ur' ? '1. گیم موڈ منتخب کریں:' : '1. Select Mode:'}
                    </label>
                    <div className="flex gap-1.5">
                      {[
                        { label: '30s', val: 30 },
                        { label: '1Min', val: 60 },
                        { label: '3Min', val: 180 },
                        { label: '5Min', val: 300 }
                      ].map((m) => (
                        <button
                          key={m.val}
                          onClick={() => setSelectedMode(m.val as GameTimeOption)}
                          className={`py-1 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            selectedMode === m.val
                              ? 'bg-amber-500 text-slate-950 shadow font-black'
                              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* LIVE BET SUMMARY CARD (BIG vs SMALL & COLORS) */}
                  <div className="bg-slate-800/95 rounded-2xl p-3.5 border border-slate-700 space-y-2.5 shadow-md">
                    <div className="flex items-center justify-between border-b border-slate-700/80 pb-2">
                      <div className="flex items-center gap-1.5">
                        <BarChart3 className="w-4 h-4 text-amber-400" />
                        <span className="font-bold text-xs text-white">
                          {language === 'ur' ? 'لائیو راؤنڈ بیٹس سمری (Live Bets)' : 'Current Round Live Bets Summary'}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block">Total Round Pot:</span>
                        <span className="text-emerald-400 font-digital font-black text-sm">
                          Rs {totalRoundPool.toLocaleString()} PKR
                        </span>
                      </div>
                    </div>

                    {/* Big vs Small breakdown with visual bar */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <div className="flex items-center gap-1 font-bold text-amber-300">
                          <span>بڑا (Big 5-9):</span>
                          <span className="font-digital text-white font-bold">
                            Rs {bigTotalAmount.toLocaleString()}
                          </span>
                          <span className="text-[10px] text-slate-400">({bigBetCount} bets)</span>
                        </div>
                        <div className="flex items-center gap-1 font-bold text-cyan-300">
                          <span>چھوٹا (Small 0-4):</span>
                          <span className="font-digital text-white font-bold">
                            Rs {smallTotalAmount.toLocaleString()}
                          </span>
                          <span className="text-[10px] text-slate-400">({smallBetCount} bets)</span>
                        </div>
                      </div>

                      {/* Proportional visual comparison bar */}
                      <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden flex border border-slate-700">
                        <div
                          className="bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-300"
                          style={{ width: `${bigPercent}%` }}
                          title={`Big: ${bigPercent}%`}
                        />
                        <div
                          className="bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300"
                          style={{ width: `${smallPercent}%` }}
                          title={`Small: ${smallPercent}%`}
                        />
                      </div>
                    </div>

                    {/* Clickable Color Control Cards (Green, Violet, Red) */}
                    <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-700/60 text-[11px]">
                      <button
                        type="button"
                        onClick={() =>
                          applyServerForcedSpec(
                            { kind: 'color', color: 'green' },
                            `✓ سبز (GREEN) فکس ہو گیا! راؤنڈ ${currentPeriodId} میں سبز ہی آئے گا`,
                            `✓ GREEN LOCKED for period ${currentPeriodId}!`
                          )
                        }
                        className={`bg-emerald-950/70 hover:bg-emerald-900/80 border p-1.5 rounded-xl text-center transition-all cursor-pointer relative ${
                          activeForcedSpec?.kind === 'color' && activeForcedSpec.color === 'green'
                            ? 'border-amber-400 ring-2 ring-amber-400 scale-[1.02] shadow-lg'
                            : 'border-emerald-600/40'
                        }`}
                      >
                        <span className="text-emerald-300 font-bold block">🟢 سبز (Green)</span>
                        <span className="font-digital font-black text-white text-xs">
                          Rs {greenTotalAmount.toLocaleString()}
                        </span>
                        <span className="text-[9px] text-slate-400 block">{greenBetCount} bets</span>
                        {activeForcedSpec?.kind === 'color' && activeForcedSpec.color === 'green' && (
                          <span className="mt-0.5 inline-block text-[8px] font-black bg-amber-400 text-slate-950 px-1.5 rounded-full">
                            ✓ LOCKED
                          </span>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          applyServerForcedSpec(
                            { kind: 'color', color: 'violet' },
                            `✓ جامنی (VIOLET) فکس ہو گیا! راؤنڈ ${currentPeriodId} میں جامنی ہی آئے گا`,
                            `✓ VIOLET LOCKED for period ${currentPeriodId}!`
                          )
                        }
                        className={`bg-purple-950/70 hover:bg-purple-900/80 border p-1.5 rounded-xl text-center transition-all cursor-pointer relative ${
                          activeForcedSpec?.kind === 'color' && activeForcedSpec.color === 'violet'
                            ? 'border-amber-400 ring-2 ring-amber-400 scale-[1.02] shadow-lg'
                            : 'border-purple-600/40'
                        }`}
                      >
                        <span className="text-purple-300 font-bold block">🟣 جامنی (Violet)</span>
                        <span className="font-digital font-black text-white text-xs">
                          Rs {violetTotalAmount.toLocaleString()}
                        </span>
                        <span className="text-[9px] text-slate-400 block">{violetBetCount} bets</span>
                        {activeForcedSpec?.kind === 'color' && activeForcedSpec.color === 'violet' && (
                          <span className="mt-0.5 inline-block text-[8px] font-black bg-amber-400 text-slate-950 px-1.5 rounded-full">
                            ✓ LOCKED
                          </span>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          applyServerForcedSpec(
                            { kind: 'color', color: 'red' },
                            `✓ سرخ (RED) فکس ہو گیا! راؤنڈ ${currentPeriodId} میں سرخ ہی آئے گا`,
                            `✓ RED LOCKED for period ${currentPeriodId}!`
                          )
                        }
                        className={`bg-rose-950/70 hover:bg-rose-900/80 border p-1.5 rounded-xl text-center transition-all cursor-pointer relative ${
                          activeForcedSpec?.kind === 'color' && activeForcedSpec.color === 'red'
                            ? 'border-amber-400 ring-2 ring-amber-400 scale-[1.02] shadow-lg'
                            : 'border-rose-600/40'
                        }`}
                      >
                        <span className="text-rose-300 font-bold block">🔴 سرخ (Red)</span>
                        <span className="font-digital font-black text-white text-xs">
                          Rs {redTotalAmount.toLocaleString()}
                        </span>
                        <span className="text-[9px] text-slate-400 block">{redBetCount} bets</span>
                        {activeForcedSpec?.kind === 'color' && activeForcedSpec.color === 'red' && (
                          <span className="mt-0.5 inline-block text-[8px] font-black bg-amber-400 text-slate-950 px-1.5 rounded-full">
                            ✓ LOCKED
                          </span>
                        )}
                      </button>
                    </div>

                    {/* Direct BIG & SMALL Control Buttons directly under Green / Violet / Red */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() =>
                          applyServerForcedSpec(
                            { kind: 'bigSmall', bigSmall: 'Big' },
                            `✓ پکا لاک! اس راؤنڈ (${currentPeriodId}) میں BIG (5–9) ہی آئے گا!`,
                            `✓ LOCKED! Result will strictly be BIG (5-9)!`
                          )
                        }
                        className={`py-2.5 px-3 rounded-xl font-black text-xs transition-all cursor-pointer flex items-center justify-between border shadow-md ${
                          activeForcedSpec?.kind === 'bigSmall' && activeForcedSpec.bigSmall === 'Big'
                            ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 border-yellow-200 ring-2 ring-amber-300 scale-[1.02]'
                            : 'bg-gradient-to-r from-amber-600/30 to-orange-600/30 hover:from-amber-600/50 hover:to-orange-600/50 text-amber-200 border-amber-500/40'
                        }`}
                      >
                        <div className="text-left">
                          <span className="block text-sm font-black tracking-wide">BIG (5-9) بڑا</span>
                          <span className="text-[10px] opacity-85 font-mono">
                            Rs {bigTotalAmount.toLocaleString()} bet
                          </span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${
                            activeForcedSpec?.kind === 'bigSmall' && activeForcedSpec.bigSmall === 'Big'
                              ? 'bg-slate-950 text-amber-300'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
                          }`}
                        >
                          {activeForcedSpec?.kind === 'bigSmall' && activeForcedSpec.bigSmall === 'Big'
                            ? '✓ BIG لاک'
                            : language === 'ur'
                            ? 'BIG فکس کریں'
                            : 'Force BIG'}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          applyServerForcedSpec(
                            { kind: 'bigSmall', bigSmall: 'Small' },
                            `✓ پکا لاک! اس راؤنڈ (${currentPeriodId}) میں SMALL (0–4) ہی آئے گا!`,
                            `✓ LOCKED! Result will strictly be SMALL (0-4)!`
                          )
                        }
                        className={`py-2.5 px-3 rounded-xl font-black text-xs transition-all cursor-pointer flex items-center justify-between border shadow-md ${
                          activeForcedSpec?.kind === 'bigSmall' && activeForcedSpec.bigSmall === 'Small'
                            ? 'bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950 border-cyan-100 ring-2 ring-cyan-300 scale-[1.02]'
                            : 'bg-gradient-to-r from-cyan-600/30 to-blue-600/30 hover:from-cyan-600/50 hover:to-blue-600/50 text-cyan-200 border-cyan-500/40'
                        }`}
                      >
                        <div className="text-left">
                          <span className="block text-sm font-black tracking-wide">SMALL (0-4) چھوٹا</span>
                          <span className="text-[10px] opacity-85 font-mono">
                            Rs {smallTotalAmount.toLocaleString()} bet
                          </span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${
                            activeForcedSpec?.kind === 'bigSmall' && activeForcedSpec.bigSmall === 'Small'
                              ? 'bg-slate-950 text-cyan-300'
                              : 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/30'
                          }`}
                        >
                          {activeForcedSpec?.kind === 'bigSmall' && activeForcedSpec.bigSmall === 'Small'
                            ? '✓ SMALL لاک'
                            : language === 'ur'
                            ? 'SMALL فکس کریں'
                            : 'Force SMALL'}
                        </span>
                      </button>
                    </div>

                    {/* Smart House Profit Recommendation */}
                    <div className="bg-emerald-950/40 border border-emerald-500/30 p-2.5 rounded-xl flex items-center justify-between gap-2 text-xs">
                      <div>
                        <span className="font-bold text-emerald-300 flex items-center gap-1">
                          <Zap className="w-3.5 h-3.5 text-amber-400" />
                          {language === 'ur' ? 'ایڈمن کیلئے سب سے زیادہ منافع بخش نمبر:' : 'Most Profitable Number for House:'}
                        </span>
                        <p className="text-[10px] text-slate-300">
                          {language === 'ur'
                            ? `نمبر [${minBetNum}] پر سب سے کم رقم (Rs ${numberStats[minBetNum].amount.toLocaleString()}) لگی ہے۔`
                            : `Number [${minBetNum}] has the lowest bet (Rs ${numberStats[minBetNum].amount.toLocaleString()}).`}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          applyServerForcedSpec(
                            { kind: 'number', number: minBetNum },
                            `✓ پکا لاک! نمبر [${minBetNum}] راؤنڈ (${currentPeriodId}) کے لیے فکس ہو گیا!`,
                            `✓ LOCKED number [${minBetNum}] for period ${currentPeriodId}!`
                          )
                        }
                        className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow cursor-pointer shrink-0"
                      >
                        نمبر [{minBetNum}] فکس کریں
                      </button>
                    </div>
                  </div>

                  {/* ACTIVE STATUS & NEXT DRAW STATUS */}
                  <div className="bg-slate-800/80 rounded-2xl p-3 border border-slate-700 flex items-center justify-between text-xs gap-2">
                    <div>
                      <span className="text-slate-400 block text-[10px]">
                        {language === 'ur' ? 'موجودہ راؤنڈ (Active Period):' : 'Active Period & Timer:'}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-amber-400 text-xs">
                          {currentPeriodId || 'Active'}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 font-digital text-[11px] text-cyan-300 font-bold">
                          {String(Math.floor(rigSecondsLeft / 60)).padStart(2, '0')}:
                          {String(rigSecondsLeft % 60).padStart(2, '0')}
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-slate-400 block text-[10px]">Next Forced Outcome:</span>
                      {activeForcedSpec ? (
                        <span className="text-emerald-400 font-bold flex items-center gap-1 justify-end flex-wrap">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                          {activeForcedSpec.kind === 'number'
                            ? `Locked: نمبر [${activeForcedSpec.number}] (${getBigSmallForNumber(activeForcedSpec.number!)})`
                            : activeForcedSpec.kind === 'bigSmall'
                            ? `Locked: ${activeForcedSpec.bigSmall?.toUpperCase()} (${activeForcedSpec.bigSmall === 'Big' ? '5-9' : '0-4'})`
                            : `Locked: ${activeForcedSpec.color?.toUpperCase()}`}
                          {activeForcedSpec.persistent ? ' 🔁' : ''}
                        </span>
                      ) : (
                        <span className="text-slate-400 font-medium">Auto Strategy</span>
                      )}
                    </div>
                  </div>

                  {/* 10 NUMBER BUTTONS (0 TO 9) WITH LIVE BET AMOUNTS STAMPED ON EACH BUTTON */}
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <label className="text-xs font-bold text-slate-200">
                        {language === 'ur'
                          ? '2. اگلا وننگ نمبر فکس کریں (0 سے 9 میں سے کوئی بھی چنیں):'
                          : '2. Select Winning Number (0-9):'}
                      </label>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            soundManager.playClick();
                            setKeepPersistentLock((v) => !v);
                          }}
                          className={`text-[10px] px-2 py-0.5 rounded-lg font-bold cursor-pointer border transition-colors ${
                            keepPersistentLock
                              ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                              : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                          }`}
                          title="If ON, locked outcome stays active for every round until reset"
                        >
                          {keepPersistentLock
                            ? language === 'ur'
                              ? '🔁 مسلسل لاک: آن'
                              : '🔁 Repeat: ON'
                            : language === 'ur'
                            ? '🔁 مسلسل لاک: آف'
                            : '🔁 Repeat: OFF'}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            applyServerForcedSpec(
                              null,
                              'نمبر لاک ختم کر دیا گیا (Auto Strategy)',
                              'Outcome reset to Auto Strategy'
                            )
                          }
                          className="text-[11px] px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold cursor-pointer border border-slate-700 flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3 text-amber-400" />
                          <span>Reset to Random</span>
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-5 gap-2.5">
                      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => {
                        const isForced =
                          activeForcedSpec?.kind === 'number' && activeForcedSpec.number === num;
                        const bs = getBigSmallForNumber(num);
                        const colors = getColorsForNumber(num);
                        const isRed = colors.includes('red');
                        const isGreen = colors.includes('green');
                        const isViolet = colors.includes('violet');

                        const betAmt = numberStats[num].amount;
                        const isMaxBet = betAmt > 0 && num === maxBetNum;
                        const isMinBet = num === minBetNum;

                        return (
                          <button
                            key={num}
                            type="button"
                            onClick={() =>
                              applyServerForcedSpec(
                                { kind: 'number', number: num },
                                `✓ پکا لاک! اس راؤنڈ (${currentPeriodId}) میں نمبر [${num}] ہی آئے گا`,
                                `✓ LOCKED! Number [${num}] will come for period ${currentPeriodId}!`
                              )
                            }
                            className={`py-3 px-1.5 rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer relative shadow-md ${
                              isForced
                                ? 'ring-4 ring-amber-400 scale-105 z-10 shadow-xl'
                                : 'hover:scale-102'
                            } ${
                              isViolet && isRed
                                ? 'bg-gradient-to-br from-purple-700 to-rose-700 text-white'
                                : isViolet && isGreen
                                ? 'bg-gradient-to-br from-purple-700 to-emerald-700 text-white'
                                : isRed
                                ? 'bg-rose-700 hover:bg-rose-600 text-white'
                                : 'bg-emerald-700 hover:bg-emerald-600 text-white'
                            }`}
                          >
                            <span className="font-digital text-2xl font-black">{num}</span>
                            <span className="text-[9px] uppercase font-bold tracking-tight opacity-90">
                              {bs}
                            </span>

                            {/* Live Bet Amount Stamped on Number */}
                            <div
                              className={`mt-1 text-[10px] px-1.5 py-0.5 rounded-md font-mono font-bold w-full text-center truncate ${
                                betAmt > 0
                                  ? 'bg-black/75 text-amber-300 border border-amber-400/40'
                                  : 'bg-black/30 text-white/60'
                              }`}
                            >
                              Rs {betAmt.toLocaleString()}
                            </div>

                            {/* Max / Min Bet Badges */}
                            {isMaxBet && (
                              <span className="text-[8px] bg-red-600 text-white px-1 py-0.2 rounded font-black tracking-tight mt-0.5 animate-pulse">
                                🔥 Max Bet
                              </span>
                            )}
                            {isMinBet && betAmt === 0 && (
                              <span className="text-[8px] bg-emerald-500/80 text-white px-1 py-0.2 rounded font-black tracking-tight mt-0.5">
                                💎 0 Bet
                              </span>
                            )}

                            {isForced && (
                              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-amber-400 text-slate-900 text-[10px] font-black flex items-center justify-center shadow">
                                ✓
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: DETAILED LIVE BET ANALYTICS TABLE */}
              {activeTab === 'analytics' && (
                <div className="space-y-4 animate-in fade-in">
                  <div className="bg-slate-800/90 rounded-2xl p-3.5 border border-slate-700 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <BarChart3 className="w-4 h-4 text-purple-400" />
                        <h4 className="font-bold text-sm text-white">
                          {language === 'ur' ? 'تمام نمبرز پر بیٹس کی مکمل تفصیل:' : 'Detailed Breakdown Per Number (0-9):'}
                        </h4>
                      </div>
                      <span className="text-[11px] text-slate-400 font-mono">
                        Period: {currentPeriodId}
                      </span>
                    </div>

                    {/* Ranking Table of all 10 numbers */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead>
                          <tr className="border-b border-slate-700 text-slate-400 text-[11px]">
                            <th className="py-2 px-2">Number</th>
                            <th className="py-2 px-2">Color & Type</th>
                            <th className="py-2 px-2 text-right">Total Bet Amount</th>
                            <th className="py-2 px-2 text-center">Bets Count</th>
                            <th className="py-2 px-2 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/60 font-mono">
                          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
                            .sort((a, b) => numberStats[b].amount - numberStats[a].amount)
                            .map((num, rank) => {
                              const stat = numberStats[num];
                              const bs = getBigSmallForNumber(num);
                              const isForced = forcedNumbers[selectedMode] === num;
                              return (
                                <tr
                                  key={num}
                                  className={`hover:bg-slate-700/40 transition-colors ${
                                    isForced ? 'bg-amber-500/10' : ''
                                  }`}
                                >
                                  <td className="py-2 px-2">
                                    <div className="flex items-center gap-1.5 font-sans font-bold">
                                      <span className="w-5 h-5 rounded-full bg-slate-700 text-white flex items-center justify-center font-digital text-xs">
                                        {num}
                                      </span>
                                      {rank === 0 && stat.amount > 0 && (
                                        <span className="text-[9px] bg-red-600 text-white px-1 rounded font-bold">
                                          TOP
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-2 px-2 text-slate-300 font-sans">
                                    <span>{bs}</span>
                                  </td>
                                  <td className="py-2 px-2 text-right font-digital font-bold text-amber-300">
                                    Rs {stat.amount.toLocaleString()} PKR
                                  </td>
                                  <td className="py-2 px-2 text-center text-slate-400">
                                    {stat.count}
                                  </td>
                                  <td className="py-2 px-2 text-center">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          applyServerForcedSpec(
                                            { kind: 'number', number: num },
                                            `✓ نمبر [${num}] لاک ہو گیا!`,
                                            `✓ Number [${num}] locked!`
                                          )
                                        }
                                        className={`px-2 py-1 rounded text-[10px] font-bold transition-all cursor-pointer ${
                                          isForced
                                            ? 'bg-amber-400 text-slate-950 font-black'
                                            : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                                        }`}
                                      >
                                        {isForced ? '✓ Active' : 'Rig This'}
                                      </button>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* List of individual bets placed this round */}
                  <div className="bg-slate-800/90 rounded-2xl p-3.5 border border-slate-700 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-white">
                        {language === 'ur' ? 'اس راؤنڈ کی تمام انفرادی بیٹس:' : 'Individual Bets Placed This Round:'}
                      </span>
                      <span className="text-slate-400 text-[11px] font-mono">
                        Count: {relevantBets.length}
                      </span>
                    </div>

                    {relevantBets.length === 0 ? (
                      <p className="text-xs text-slate-500 py-4 text-center">
                        {language === 'ur'
                          ? 'اس وقت موجودہ راؤنڈ میں کوئی بیٹ نہیں لگی ہے'
                          : 'No bets placed yet in this current round'}
                      </p>
                    ) : (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {relevantBets.map((b) => (
                          <div
                            key={b.id}
                            className="flex items-center justify-between p-2 bg-slate-900 rounded-xl border border-slate-700 text-xs font-mono"
                          >
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded bg-slate-800 font-bold uppercase text-[10px] text-amber-300">
                                {b.category}: {b.selection}
                              </span>
                              <span className="text-slate-400 text-[10px]">x{b.multiplier}</span>
                            </div>
                            <span className="font-digital font-bold text-emerald-400">
                              Rs {b.totalAmount.toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB: REGISTERED USERS & COMPLETE ACCOUNTING */}
              {activeTab === 'users' && (
                <div className="space-y-4 animate-in fade-in">
                  {/* Global Accounting Summary Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="bg-slate-800 rounded-2xl p-2.5 border border-cyan-500/40">
                      <div className="flex items-center gap-1 text-[10px] text-cyan-300 font-bold">
                        <Users className="w-3.5 h-3.5" />
                        <span>{language === 'ur' ? 'کل یوزرز' : 'Total Users'}</span>
                      </div>
                      <div className="text-xl font-black font-digital text-white mt-0.5">
                        {registeredUsers.length}
                      </div>
                    </div>

                    <div className="bg-slate-800 rounded-2xl p-2.5 border border-emerald-500/40">
                      <div className="flex items-center gap-1 text-[10px] text-emerald-300 font-bold">
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>{language === 'ur' ? 'نئے یوزرز (24h)' : 'New (24h)'}</span>
                      </div>
                      <div className="text-xl font-black font-digital text-emerald-400 mt-0.5 flex items-center gap-1.5">
                        <span>{newUsersCount}</span>
                        {newUsersCount > 0 && (
                          <span className="text-[9px] font-sans font-black px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 animate-pulse">
                            NEW
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="bg-slate-800 rounded-2xl p-2.5 border border-amber-500/40">
                      <div className="text-[10px] text-amber-300 font-bold">
                        {language === 'ur' ? 'کل بیلنس (سب کا)' : 'All Balances'}
                      </div>
                      <div className="text-base sm:text-lg font-black font-digital text-amber-400 mt-0.5 truncate">
                        Rs {totalAllBalances.toLocaleString()}
                      </div>
                    </div>

                    <div className="bg-slate-800 rounded-2xl p-2.5 border border-purple-500/40">
                      <div className="text-[10px] text-purple-300 font-bold">
                        {language === 'ur' ? 'کل ڈپازٹ / وڈرا' : 'Dep / Wth'}
                      </div>
                      <div className="text-[11px] font-mono font-bold text-white mt-1 leading-tight">
                        <span className="text-emerald-400">+{totalDepositsAmount.toLocaleString()}</span>
                        {' / '}
                        <span className="text-orange-400">-{totalWithdrawnAmount.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Search & Refresh Bar */}
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        placeholder={language === 'ur' ? 'نام، نمبر یا ID سے تلاش کریں...' : 'Search by name, phone or ID...'}
                        className="w-full pl-8 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        soundManager.playClick();
                        loadUsersFromStorage();
                        onRefreshAdmin?.();
                        showNotice(language === 'ur' ? 'تمام یوزرز اور حساب کتاب اپ ڈیٹ ہو گیا!' : 'Users & accounts refreshed');
                      }}
                      className="px-3 py-2 bg-cyan-700 hover:bg-cyan-600 text-white rounded-xl cursor-pointer transition-colors flex items-center gap-1 text-xs font-bold"
                      title="Refresh Users"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>{language === 'ur' ? 'اپ ڈیٹ' : 'Sync'}</span>
                    </button>
                  </div>

                  {/* Users List */}
                  <div className="space-y-2">
                    {registeredUsers.filter((u) => {
                      const q = userSearch.trim().toLowerCase();
                      if (!q) return true;
                      return (
                        u.fullName.toLowerCase().includes(q) ||
                        u.phone.toLowerCase().includes(q) ||
                        u.id.toLowerCase().includes(q)
                      );
                    }).length === 0 ? (
                      <p className="text-xs text-slate-500 py-6 text-center">
                        {language === 'ur' ? 'ابھی تک کوئی رجسٹرڈ یوزر نہیں ملا' : 'No registered users found'}
                      </p>
                    ) : (
                      registeredUsers
                        .filter((u) => {
                          const q = userSearch.trim().toLowerCase();
                          if (!q) return true;
                          return (
                            u.fullName.toLowerCase().includes(q) ||
                            u.phone.toLowerCase().includes(q) ||
                            u.id.toLowerCase().includes(q)
                          );
                        })
                        .map((user) => {
                          const isNew =
                            user.isNew ?? nowTs - (user.createdAt || 0) < 24 * 60 * 60 * 1000;
                          const isCurrent = currentUserId === user.id;
                          const isOnline = Boolean(user.isOnline || isCurrent);
                          const userBal =
                            typeof user.balance === 'number'
                              ? user.balance
                              : isCurrent
                              ? balance
                              : typeof userBalancesMap[user.id] === 'number'
                              ? userBalancesMap[user.id]
                              : 0;
                          const uDep =
                            typeof user.totalDeposited === 'number'
                              ? user.totalDeposited
                              : transactions
                                  .filter(
                                    (t) =>
                                      t.type === 'deposit' &&
                                      t.status === 'completed' &&
                                      (t.userId === user.id || t.accountNumber === user.phone)
                                  )
                                  .reduce((s, t) => s + t.amount + (t.bonusAmount || 0), 0);
                          const uWth =
                            typeof user.totalWithdrawn === 'number'
                              ? user.totalWithdrawn
                              : transactions
                                  .filter(
                                    (t) =>
                                      t.type === 'withdraw' &&
                                      t.status === 'completed' &&
                                      (t.userId === user.id || t.accountNumber === user.phone)
                                  )
                                  .reduce((s, t) => s + t.amount, 0);

                          return (
                            <div
                              key={user.id}
                              className="bg-slate-800 rounded-2xl p-3 border border-slate-700 space-y-2 hover:border-cyan-500/50 transition-all"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 font-black text-xs flex items-center justify-center shrink-0">
                                    {user.fullName.charAt(0).toUpperCase() || 'U'}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="font-bold text-white text-xs sm:text-sm truncate">
                                        {user.fullName}
                                      </span>
                                      {isNew && (
                                        <span className="text-[9px] font-black px-1.5 py-0.2 rounded-full bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 animate-pulse">
                                          NEW USER
                                        </span>
                                      )}
                                      {isOnline && (
                                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-amber-500/25 text-amber-300 border border-amber-500/40">
                                          ONLINE
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-mono">
                                      {user.id} • {user.phone}
                                    </div>
                                  </div>
                                </div>

                                <div className="text-right shrink-0">
                                  <span className="text-[10px] text-slate-400 block">Balance</span>
                                  <span className="font-digital font-black text-emerald-400 text-sm">
                                    Rs {userBal.toLocaleString()}
                                  </span>
                                </div>
                              </div>

                              {/* Per-User Financial Ledger Row */}
                              <div className="grid grid-cols-3 gap-1.5 bg-slate-900/80 rounded-xl p-2 text-[10px] font-mono border border-slate-700/60">
                                <div>
                                  <span className="text-slate-400 block">Deposited:</span>
                                  <span className="text-emerald-400 font-bold">
                                    +Rs {uDep.toLocaleString()}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-slate-400 block">Withdrawal:</span>
                                  <span className="text-orange-400 font-bold">
                                    -Rs {uWth.toLocaleString()}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-slate-400 block">Bets / Won:</span>
                                  <span className="text-cyan-300 font-bold">
                                    Rs {(user.totalBet || 0).toLocaleString()} / {(user.totalWon || 0).toLocaleString()}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center justify-between text-[11px] text-slate-300 pt-1 border-t border-slate-700/60 font-mono gap-2 flex-wrap">
                                <div className="flex items-center gap-2">
                                  {user.inviteCode && (
                                    <span className="text-[10px] text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded">
                                      Ref: {user.inviteCode}
                                    </span>
                                  )}
                                  <span className="text-[10px] text-slate-400">
                                    {user.createdAt ? new Date(user.createdAt).toLocaleString() : 'Registered'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      soundManager.playClick();
                                      setSelectedBalanceUserId(user.id);
                                      setActiveTab('balance');
                                    }}
                                    className="px-2 py-1 rounded bg-blue-600/80 hover:bg-blue-500 text-white font-sans font-bold text-[10px] cursor-pointer"
                                  >
                                    {language === 'ur' ? 'بیلنس ایڈٹ' : 'Edit Balance'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteRegisteredUser(user.id)}
                                    className="p-1 rounded bg-rose-900/70 hover:bg-rose-600 text-rose-200 hover:text-white cursor-pointer"
                                    title="Delete User"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: DEPOSIT CRUD & APPROVALS */}
              {activeTab === 'deposits' && (
                <div className="space-y-4 animate-in fade-in">
                  {/* Deposits Accounting Summary */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-slate-800 rounded-xl p-2.5 border border-emerald-500/40">
                      <span className="text-[10px] text-emerald-300 font-bold block">
                        {language === 'ur' ? 'کل منظور شدہ ڈپازٹ' : 'Total Deposited'}
                      </span>
                      <span className="font-digital font-black text-emerald-400 text-sm">
                        Rs {totalDepositsAmount.toLocaleString()}
                      </span>
                    </div>
                    <div className="bg-slate-800 rounded-xl p-2.5 border border-amber-500/40">
                      <span className="text-[10px] text-amber-300 font-bold block">
                        {language === 'ur' ? 'کل 20% بونس' : 'Total 20% Bonus'}
                      </span>
                      <span className="font-digital font-black text-amber-300 text-sm">
                        Rs {totalDepositBonusAmount.toLocaleString()}
                      </span>
                    </div>
                    <div className="bg-slate-800 rounded-xl p-2.5 border border-slate-600">
                      <span className="text-[10px] text-slate-300 font-bold block">
                        {language === 'ur' ? 'کل ڈپازٹ ریکارڈز' : 'Total Records'}
                      </span>
                      <span className="font-digital font-black text-white text-sm">
                        {transactions.filter((t) => t.type === 'deposit').length} ({pendingDeposits.length} pending)
                      </span>
                    </div>
                  </div>

                  {/* Top Action Bar */}
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-slate-200 block">
                        {language === 'ur' ? 'ڈپازٹ مینیجر (کس نے کتنا ڈپازٹ کیا):' : 'Deposit Manager (Player Ledger):'}
                      </span>
                      <span className="text-[10px] text-amber-400 font-mono">
                        Pending: {pendingDeposits.length} | Total: {transactions.filter((t) => t.type === 'deposit').length}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={async () => {
                          soundManager.playClick();
                          setIsManualSyncing(true);
                          await onRefreshAdmin?.();
                          setIsManualSyncing(false);
                          showNotice('Deposits list refreshed');
                        }}
                        className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold text-xs rounded-xl flex items-center gap-1 border border-slate-600 cursor-pointer"
                        title="Refresh Deposits"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isManualSyncing ? 'animate-spin' : ''}`} />
                        <span>Sync</span>
                      </button>

                      {transactions.filter((t) => t.type === 'deposit').length > 0 && (
                        <button
                          onClick={() => {
                            soundManager.playToom(1);
                            onClearAllDeposits?.();
                          }}
                          className="px-2.5 py-1.5 bg-rose-900/60 hover:bg-rose-700 text-rose-300 hover:text-white font-bold text-xs rounded-xl flex items-center gap-1 border border-rose-700/40 cursor-pointer transition-all active:scale-95"
                          title="Clear All Deposits"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>{language === 'ur' ? 'تمام ڈیلیٹ' : 'Clear All'}</span>
                        </button>
                      )}

                      <button
                        onClick={() => {
                          soundManager.playClick();
                          setShowAddDepositForm((prev) => !prev);
                          setEditingDeposit(null);
                          setNewDepTrx(`TX${Math.floor(Math.random() * 899999 + 100000)}`);
                        }}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-md cursor-pointer transition-all active:scale-95"
                      >
                        <Plus className="w-4 h-4" />
                        <span>{showAddDepositForm ? (language === 'ur' ? 'بند کریں' : 'Cancel') : (language === 'ur' ? '+ نیا ڈپازٹ بنائیں' : '+ New Deposit')}</span>
                      </button>
                    </div>
                  </div>

                  {/* FORM 1: CREATE NEW DEPOSIT */}
                  {showAddDepositForm && (
                    <div className="bg-slate-800 rounded-2xl p-4 border border-emerald-500/50 space-y-3 shadow-xl animate-in fade-in">
                      <div className="flex items-center justify-between border-b border-slate-700 pb-2">
                        <span className="text-xs font-black text-emerald-400 flex items-center gap-1.5">
                          <PlusCircle className="w-4 h-4" />
                          {language === 'ur' ? 'نیا ڈپازٹ ریکارڈ شامل کریں:' : 'Create New Deposit Entry:'}
                        </span>
                        <button
                          onClick={() => setShowAddDepositForm(false)}
                          className="text-slate-400 hover:text-white"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <label className="text-slate-400 block text-[10px] mb-1">رقم (Amount PKR):</label>
                          <input
                            type="number"
                            placeholder="e.g. 5000"
                            value={newDepAmount}
                            onChange={(e) => setNewDepAmount(e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-digital font-bold focus:ring-1 focus:ring-emerald-500"
                          />
                        </div>

                        <div>
                          <label className="text-slate-400 block text-[10px] mb-1">طریقہ کار (Method):</label>
                          <select
                            value={newDepMethod}
                            onChange={(e) => setNewDepMethod(e.target.value as any)}
                            className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-semibold"
                          >
                            <option value="easypaisa">EasyPaisa</option>
                            <option value="jazzcash">JazzCash</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-slate-400 block text-[10px] mb-1">صارف نمبر (Sender Phone):</label>
                          <input
                            type="text"
                            placeholder="03001234567"
                            value={newDepAccount}
                            onChange={(e) => setNewDepAccount(e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono"
                          />
                        </div>

                        <div>
                          <label className="text-slate-400 block text-[10px] mb-1">نام (Sender Name):</label>
                          <input
                            type="text"
                            placeholder="Player Name"
                            value={newDepTitle}
                            onChange={(e) => setNewDepTitle(e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono"
                          />
                        </div>

                        <div>
                          <label className="text-slate-400 block text-[10px] mb-1">TRX ID:</label>
                          <input
                            type="text"
                            placeholder="TX987654"
                            value={newDepTrx}
                            onChange={(e) => setNewDepTrx(e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono"
                          />
                        </div>

                        <div>
                          <label className="text-slate-400 block text-[10px] mb-1">اسٹیٹس (Status):</label>
                          <select
                            value={newDepStatus}
                            onChange={(e) => setNewDepStatus(e.target.value as any)}
                            className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-semibold"
                          >
                            <option value="completed">منظور شدہ (Completed)</option>
                            <option value="pending">زیر التواء (Pending)</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <input
                          type="checkbox"
                          id="autoCreditCheck"
                          checked={newDepCreditNow}
                          onChange={(e) => setNewDepCreditNow(e.target.checked)}
                          className="rounded text-emerald-500 bg-slate-900 border-slate-700"
                        />
                        <label htmlFor="autoCreditCheck" className="text-[11px] text-slate-300">
                          {language === 'ur' ? 'صارف کے بیلنس میں فوری رقم کریڈٹ کریں' : 'Auto-credit amount to player balance'}
                        </label>
                      </div>

                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => {
                            const val = Number(newDepAmount);
                            if (val > 0) {
                              onAddDeposit?.({
                                amount: val,
                                method: newDepMethod,
                                accountNumber: newDepAccount || '03001234567',
                                accountTitle: newDepTitle || 'Player',
                                trxId: newDepTrx || `TX${Math.floor(Math.random() * 899999 + 100000)}`,
                                status: newDepStatus,
                                creditNow: newDepCreditNow
                              });
                              soundManager.playCash();
                              setNewDepAmount('');
                              setShowAddDepositForm(false);
                            } else {
                              showNotice(language === 'ur' ? 'براہ کرم درست رقم درج کریں' : 'Please enter a valid amount');
                            }
                          }}
                          className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl cursor-pointer"
                        >
                          {language === 'ur' ? 'ڈپازٹ محفوظ کریں' : 'Save Deposit'}
                        </button>
                        <button
                          onClick={() => setShowAddDepositForm(false)}
                          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 font-bold text-xs rounded-xl cursor-pointer"
                        >
                          {language === 'ur' ? 'منسوخ' : 'Cancel'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* FORM 2: EDIT EXISTING DEPOSIT */}
                  {editingDeposit && (
                    <div className="bg-slate-800 rounded-2xl p-4 border border-amber-500/60 space-y-3 shadow-xl animate-in fade-in">
                      <div className="flex items-center justify-between border-b border-slate-700 pb-2">
                        <span className="text-xs font-black text-amber-400 flex items-center gap-1.5">
                          <Pencil className="w-4 h-4" />
                          {language === 'ur' ? `ڈپازٹ میں ترمیم کریں (ID: ${editingDeposit.id}):` : `Edit Deposit (${editingDeposit.id}):`}
                        </span>
                        <button
                          onClick={() => setEditingDeposit(null)}
                          className="text-slate-400 hover:text-white"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <label className="text-slate-400 block text-[10px] mb-1">رقم (Amount PKR):</label>
                          <input
                            type="number"
                            value={editingDeposit.amount}
                            onChange={(e) =>
                              setEditingDeposit({
                                ...editingDeposit,
                                amount: Number(e.target.value)
                              })
                            }
                            className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-digital font-bold focus:ring-1 focus:ring-amber-500"
                          />
                        </div>

                        <div>
                          <label className="text-slate-400 block text-[10px] mb-1">طریقہ کار (Method):</label>
                          <select
                            value={editingDeposit.method}
                            onChange={(e) =>
                              setEditingDeposit({
                                ...editingDeposit,
                                method: e.target.value as any
                              })
                            }
                            className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-semibold"
                          >
                            <option value="easypaisa">EasyPaisa</option>
                            <option value="jazzcash">JazzCash</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-slate-400 block text-[10px] mb-1">صارف نمبر (Sender Phone):</label>
                          <input
                            type="text"
                            value={editingDeposit.accountNumber}
                            onChange={(e) =>
                              setEditingDeposit({
                                ...editingDeposit,
                                accountNumber: e.target.value
                              })
                            }
                            className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono"
                          />
                        </div>

                        <div>
                          <label className="text-slate-400 block text-[10px] mb-1">نام (Sender Name):</label>
                          <input
                            type="text"
                            value={editingDeposit.accountTitle || ''}
                            onChange={(e) =>
                              setEditingDeposit({
                                ...editingDeposit,
                                accountTitle: e.target.value
                              })
                            }
                            className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono"
                          />
                        </div>

                        <div>
                          <label className="text-slate-400 block text-[10px] mb-1">TRX ID:</label>
                          <input
                            type="text"
                            value={editingDeposit.trxId || ''}
                            onChange={(e) =>
                              setEditingDeposit({
                                ...editingDeposit,
                                trxId: e.target.value
                              })
                            }
                            className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono"
                          />
                        </div>

                        <div>
                          <label className="text-slate-400 block text-[10px] mb-1">اسٹیٹس (Status):</label>
                          <select
                            value={editingDeposit.status}
                            onChange={(e) =>
                              setEditingDeposit({
                                ...editingDeposit,
                                status: e.target.value as any
                              })
                            }
                            className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-semibold"
                          >
                            <option value="completed">منظور شدہ (Completed)</option>
                            <option value="pending">زیر التواء (Pending)</option>
                            <option value="rejected">مسترد (Rejected)</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => {
                            if (editingDeposit && editingDeposit.amount > 0) {
                              onEditDeposit?.(editingDeposit.id, editingDeposit);
                              soundManager.playCash();
                              setEditingDeposit(null);
                            }
                          }}
                          className="flex-1 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl cursor-pointer"
                        >
                          {language === 'ur' ? 'تبدیلیاں محفوظ کریں' : 'Save Changes'}
                        </button>
                        <button
                          onClick={() => setEditingDeposit(null)}
                          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 font-bold text-xs rounded-xl cursor-pointer"
                        >
                          {language === 'ur' ? 'منسوخ' : 'Cancel'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* DEPOSITS LIST WITH FULL CRUD CONTROLS & PROMINENT TRX ID + SCREENSHOT */}
                  {(() => {
                    const allDeposits = transactions
                      .filter((t) => t.type === 'deposit')
                      .sort((a, b) => {
                        if (a.status === 'pending' && b.status !== 'pending') return -1;
                        if (b.status === 'pending' && a.status !== 'pending') return 1;
                        return b.timestamp - a.timestamp;
                      });
                    const depPendingCount = allDeposits.filter((t) => t.status === 'pending').length;
                    const depApprovedCount = allDeposits.filter((t) => t.status === 'completed').length;
                    const depRejectedCount = allDeposits.filter((t) => t.status === 'rejected').length;
                    const visibleDeposits =
                      depositFilter === 'all'
                        ? allDeposits
                        : allDeposits.filter((t) => t.status === depositFilter);

                    return (
                      <div className="space-y-2.5">
                        {/* Status Filter Tabs */}
                        <div className="grid grid-cols-4 gap-1.5">
                          {[
                            { key: 'all', label: `All (${allDeposits.length})` },
                            { key: 'pending', label: `Pending (${depPendingCount})` },
                            { key: 'completed', label: `Approved (${depApprovedCount})` },
                            { key: 'rejected', label: `Rejected (${depRejectedCount})` }
                          ].map((f) => (
                            <button
                              key={f.key}
                              type="button"
                              onClick={() => {
                                soundManager.playClick();
                                setDepositFilter(f.key as typeof depositFilter);
                              }}
                              className={`py-1.5 px-2 rounded-xl text-[10px] font-bold transition-all cursor-pointer border ${
                                depositFilter === f.key
                                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-xs'
                                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                              }`}
                            >
                              {f.label}
                            </button>
                          ))}
                        </div>

                        {visibleDeposits.length === 0 ? (
                          <p className="text-xs text-slate-500 py-6 text-center">
                            {depositFilter === 'all'
                              ? 'No deposits recorded'
                              : `No ${depositFilter === 'completed' ? 'approved' : depositFilter} deposits`}
                          </p>
                        ) : (
                          visibleDeposits.map((tx) => {
                            const playerLabel = `${tx.userName || tx.accountTitle || 'Player'}${
                              tx.userPhone ? ` (${tx.userPhone})` : ''
                            }`;
                            return (
                              <div
                                key={tx.id}
                                className={`bg-slate-800 rounded-2xl p-3 border space-y-2.5 shadow-xs transition-all ${
                                  tx.status === 'pending'
                                    ? 'border-amber-500/70 ring-1 ring-amber-500/20'
                                    : 'border-slate-700 hover:border-slate-600'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-bold text-emerald-400 font-digital text-base">
                                      Rs {tx.amount.toLocaleString()}
                                    </span>
                                    {Boolean(tx.bonusAmount && tx.bonusAmount > 0) && (
                                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                        +Rs {(tx.bonusAmount || 0).toLocaleString()} (20% Bonus)
                                      </span>
                                    )}
                                    <span className="text-[10px] uppercase font-bold text-slate-400">
                                      {tx.method}
                                    </span>
                                    <span
                                      className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${
                                        tx.status === 'completed'
                                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                          : tx.status === 'pending'
                                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse'
                                          : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                      }`}
                                    >
                                      {tx.status === 'pending' && <Clock className="w-2.5 h-2.5" />}
                                      <span>
                                        {tx.status === 'completed'
                                          ? 'Approved'
                                          : tx.status === 'pending'
                                          ? 'Pending'
                                          : 'Rejected'}
                                      </span>
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <button
                                      onClick={() => {
                                        soundManager.playClick();
                                        setEditingDeposit(tx);
                                        setShowAddDepositForm(false);
                                      }}
                                      className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-amber-300 hover:text-white cursor-pointer"
                                      title="Edit Deposit"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        soundManager.playToom(1);
                                        onDeleteDeposit?.(tx.id);
                                      }}
                                      className="px-2 py-1 rounded-lg bg-rose-900/80 hover:bg-rose-600 text-rose-200 hover:text-white cursor-pointer transition-all border border-rose-700/60 flex items-center gap-1 text-[11px] font-bold active:scale-95"
                                      title="Delete Deposit"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                      <span>Delete</span>
                                    </button>
                                  </div>
                                </div>

                                <div className="text-xs text-slate-300 space-y-2">
                                  <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <div className="text-cyan-300 font-sans font-bold">
                                      Player: {playerLabel}
                                      {tx.userId ? ` [${tx.userId}]` : ''}
                                    </div>
                                    <span className="text-[10px] text-slate-400 font-mono">
                                      {new Date(tx.timestamp).toLocaleString()}
                                    </span>
                                  </div>

                                  {/* Highlighted TRX ID & Sender Number Box */}
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-900/90 rounded-xl p-2.5 border border-slate-700">
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="min-w-0">
                                        <span className="text-[9px] uppercase font-bold text-amber-400 block">
                                          User Sent TRX ID
                                        </span>
                                        <span className="font-mono font-black text-white text-xs sm:text-sm tracking-wide break-all">
                                          {tx.trxId || 'N/A'}
                                        </span>
                                      </div>
                                      {tx.trxId && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            navigator.clipboard?.writeText(tx.trxId || '');
                                            soundManager.playClick();
                                            setCopiedTrxId(tx.id);
                                            setTimeout(() => setCopiedTrxId(null), 1500);
                                          }}
                                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-600 cursor-pointer shrink-0"
                                          title="Copy TRX ID"
                                        >
                                          {copiedTrxId === tx.id ? (
                                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                                          ) : (
                                            <Copy className="w-3.5 h-3.5" />
                                          )}
                                        </button>
                                      )}
                                    </div>
                                    <div>
                                      <span className="text-[9px] uppercase font-bold text-slate-400 block">
                                        Sender Number
                                      </span>
                                      <span className="font-mono font-bold text-slate-200 text-xs">
                                        {tx.accountNumber || 'N/A'}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Optional legacy screenshot proof card */}
                                  {tx.screenshotUrl && (
                                    <div className="bg-slate-900/90 rounded-xl p-2.5 border border-emerald-500/40 flex items-center gap-3">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setZoomScreenshot({
                                            url: tx.screenshotUrl!,
                                            trxId: tx.trxId,
                                            player: playerLabel,
                                            amount: tx.amount
                                          })
                                        }
                                        className="cursor-pointer hover:opacity-90 shrink-0 rounded-xl overflow-hidden border-2 border-emerald-400/60 bg-black"
                                        title="Click to View Full Screenshot"
                                      >
                                        <img
                                          src={tx.screenshotUrl}
                                          alt={`Screenshot ${tx.trxId}`}
                                          className="w-20 h-20 sm:w-24 sm:h-24 object-cover"
                                        />
                                      </button>
                                      <div className="flex-1 min-w-0 space-y-1.5">
                                        <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-xs">
                                          <ImageIcon className="w-3.5 h-3.5 shrink-0" />
                                          <span>Payment Screenshot Sent</span>
                                        </div>
                                        <p className="text-[11px] text-slate-400 leading-snug">
                                          Submitted by {tx.userName || tx.accountTitle || 'Player'} with TRX{' '}
                                          <span className="font-mono text-white font-bold">{tx.trxId}</span>
                                        </p>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setZoomScreenshot({
                                              url: tx.screenshotUrl!,
                                              trxId: tx.trxId,
                                              player: playerLabel,
                                              amount: tx.amount
                                            })
                                          }
                                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                                        >
                                          <Eye className="w-3.5 h-3.5" />
                                          <span>View Full Screenshot</span>
                                        </button>
                                      </div>
                                    </div>
                                  )}

                                  {tx.note && (
                                    <div className="text-[10px] text-emerald-400 font-sans">{tx.note}</div>
                                  )}
                                </div>

                                {/* Pending Quick Action Bar */}
                                {tx.status === 'pending' && (
                                  <div className="flex gap-2 pt-1.5 border-t border-slate-700/60">
                                    <button
                                      onClick={() => {
                                        soundManager.playCash();
                                        onApproveDeposit(tx.id);
                                      }}
                                      className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                                    >
                                      <CheckCircle2 className="w-4 h-4" />
                                      <span>Approve &amp; Credit</span>
                                    </button>
                                    <button
                                      onClick={() => {
                                        soundManager.playToom(1);
                                        onRejectDeposit(tx.id);
                                      }}
                                      className="px-3.5 py-2 bg-rose-700 hover:bg-rose-600 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1 cursor-pointer"
                                    >
                                      <XCircle className="w-4 h-4" />
                                      <span>Reject</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* TAB 4: WITHDRAWALS CRUD & APPROVALS */}
              {activeTab === 'withdraws' && (
                <div className="space-y-4 animate-in fade-in">
                  {/* Withdrawal Accounting Summary */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-slate-800 rounded-xl p-2.5 border border-orange-500/40">
                      <span className="text-[10px] text-orange-300 font-bold block">
                        {language === 'ur' ? 'کل ادا شدہ وڈرا' : 'Completed Payouts'}
                      </span>
                      <span className="font-digital font-black text-orange-400 text-sm">
                        Rs {totalWithdrawnAmount.toLocaleString()}
                      </span>
                    </div>
                    <div className="bg-slate-800 rounded-xl p-2.5 border border-amber-500/40">
                      <span className="text-[10px] text-amber-300 font-bold block">
                        {language === 'ur' ? 'زیرِ غور وڈرا' : 'Pending Payouts'}
                      </span>
                      <span className="font-digital font-black text-amber-300 text-sm">
                        Rs {totalPendingWithdrawAmount.toLocaleString()}
                      </span>
                    </div>
                    <div className="bg-slate-800 rounded-xl p-2.5 border border-slate-600">
                      <span className="text-[10px] text-slate-300 font-bold block">
                        {language === 'ur' ? 'کل درخواستیں' : 'Total Requests'}
                      </span>
                      <span className="font-digital font-black text-white text-sm">
                        {transactions.filter((t) => t.type === 'withdraw').length} ({pendingWithdraws.length} pending)
                      </span>
                    </div>
                  </div>

                  {/* Top Action Bar */}
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-slate-200 block">
                        {language === 'ur' ? 'وڈرا مینیجر (کس نے کتنا وڈرا کیا):' : 'Withdrawal Manager (Player Ledger):'}
                      </span>
                      <span className="text-[10px] text-orange-400 font-mono">
                        Pending: {pendingWithdraws.length} | Total: {transactions.filter((t) => t.type === 'withdraw').length}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={async () => {
                          soundManager.playClick();
                          setIsManualSyncing(true);
                          await onRefreshAdmin?.();
                          setIsManualSyncing(false);
                          showNotice('Withdrawals list refreshed');
                        }}
                        className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold text-xs rounded-xl flex items-center gap-1 border border-slate-600 cursor-pointer"
                        title="Refresh Withdrawals"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isManualSyncing ? 'animate-spin' : ''}`} />
                        <span>Sync</span>
                      </button>

                      {transactions.filter((t) => t.type === 'withdraw').length > 0 && (
                        <button
                          onClick={() => {
                            soundManager.playToom(1);
                            onClearAllWithdrawals?.();
                          }}
                          className="px-2.5 py-1.5 bg-rose-900/60 hover:bg-rose-700 text-rose-300 hover:text-white font-bold text-xs rounded-xl flex items-center gap-1 border border-rose-700/40 cursor-pointer transition-all active:scale-95"
                          title="Clear All Withdrawals"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>{language === 'ur' ? 'تمام ڈیلیٹ' : 'Clear All'}</span>
                        </button>
                      )}

                      <button
                        onClick={() => {
                          soundManager.playClick();
                          setShowAddWithdrawForm((prev) => !prev);
                          setEditingWithdraw(null);
                          setNewWthTrx(`TX${Math.floor(Math.random() * 899999 + 100000)}`);
                        }}
                        className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-md cursor-pointer transition-all active:scale-95"
                      >
                        <Plus className="w-4 h-4" />
                        <span>{showAddWithdrawForm ? (language === 'ur' ? 'بند کریں' : 'Cancel') : (language === 'ur' ? '+ نیا وڈرا بنائیں' : '+ New Withdrawal')}</span>
                      </button>
                    </div>
                  </div>

                  {/* FORM 1: CREATE NEW WITHDRAWAL */}
                  {showAddWithdrawForm && (
                    <div className="bg-slate-800 rounded-2xl p-4 border border-orange-500/50 space-y-3 shadow-xl animate-in fade-in">
                      <div className="flex items-center justify-between border-b border-slate-700 pb-2">
                        <span className="text-xs font-black text-orange-400 flex items-center gap-1.5">
                          <PlusCircle className="w-4 h-4" />
                          {language === 'ur' ? 'نیا وڈرا ریکارڈ بنائیں:' : 'Create New Withdrawal Entry:'}
                        </span>
                        <button
                          onClick={() => setShowAddWithdrawForm(false)}
                          className="text-slate-400 hover:text-white"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <label className="text-slate-400 block text-[10px] mb-1">رقم (Amount PKR):</label>
                          <input
                            type="number"
                            placeholder="e.g. 2000"
                            value={newWthAmount}
                            onChange={(e) => setNewWthAmount(e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-digital font-bold focus:ring-1 focus:ring-orange-500"
                          />
                        </div>

                        <div>
                          <label className="text-slate-400 block text-[10px] mb-1">طریقہ کار (Method):</label>
                          <select
                            value={newWthMethod}
                            onChange={(e) => setNewWthMethod(e.target.value as any)}
                            className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-semibold"
                          >
                            <option value="easypaisa">EasyPaisa</option>
                            <option value="jazzcash">JazzCash</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-slate-400 block text-[10px] mb-1">اکاؤنٹ نمبر (Account Number):</label>
                          <input
                            type="text"
                            placeholder="03001234567"
                            value={newWthAccount}
                            onChange={(e) => setNewWthAccount(e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono"
                          />
                        </div>

                        <div>
                          <label className="text-slate-400 block text-[10px] mb-1">اکاؤنٹ نام (Account Title):</label>
                          <input
                            type="text"
                            placeholder="Player Name"
                            value={newWthTitle}
                            onChange={(e) => setNewWthTitle(e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono"
                          />
                        </div>

                        <div>
                          <label className="text-slate-400 block text-[10px] mb-1">TRX ID:</label>
                          <input
                            type="text"
                            placeholder="TX654321"
                            value={newWthTrx}
                            onChange={(e) => setNewWthTrx(e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono"
                          />
                        </div>

                        <div>
                          <label className="text-slate-400 block text-[10px] mb-1">اسٹیٹس (Status):</label>
                          <select
                            value={newWthStatus}
                            onChange={(e) => setNewWthStatus(e.target.value as any)}
                            className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-semibold"
                          >
                            <option value="completed">ادا شدہ (Completed)</option>
                            <option value="pending">زیر التواء (Pending)</option>
                            <option value="rejected">مسترد (Rejected)</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <input
                          type="checkbox"
                          id="autoDeductCheck"
                          checked={newWthDeductNow}
                          onChange={(e) => setNewWthDeductNow(e.target.checked)}
                          className="rounded text-orange-500 bg-slate-900 border-slate-700"
                        />
                        <label htmlFor="autoDeductCheck" className="text-[11px] text-slate-300">
                          {language === 'ur' ? 'کیا موجودہ بیلنس میں سے یہ رقم کاٹنی ہے؟' : 'Deduct this amount from player balance'}
                        </label>
                      </div>

                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => {
                            const val = Number(newWthAmount);
                            if (val > 0) {
                              onAddWithdraw?.({
                                amount: val,
                                method: newWthMethod,
                                accountNumber: newWthAccount || '03001234567',
                                accountTitle: newWthTitle || 'Player',
                                trxId: newWthTrx || `TX${Math.floor(Math.random() * 899999 + 100000)}`,
                                status: newWthStatus,
                                deductNow: newWthDeductNow
                              });
                              soundManager.playCash();
                              setNewWthAmount('');
                              setShowAddWithdrawForm(false);
                            } else {
                              showNotice(language === 'ur' ? 'براہ کرم درست رقم درج کریں' : 'Please enter a valid amount');
                            }
                          }}
                          className="flex-1 py-2 bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs rounded-xl cursor-pointer"
                        >
                          {language === 'ur' ? 'وڈرا محفوظ کریں' : 'Save Withdrawal'}
                        </button>
                        <button
                          onClick={() => setShowAddWithdrawForm(false)}
                          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 font-bold text-xs rounded-xl cursor-pointer"
                        >
                          {language === 'ur' ? 'منسوخ' : 'Cancel'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* FORM 2: EDIT EXISTING WITHDRAWAL */}
                  {editingWithdraw && (
                    <div className="bg-slate-800 rounded-2xl p-4 border border-amber-500/60 space-y-3 shadow-xl animate-in fade-in">
                      <div className="flex items-center justify-between border-b border-slate-700 pb-2">
                        <span className="text-xs font-black text-amber-400 flex items-center gap-1.5">
                          <Pencil className="w-4 h-4" />
                          {language === 'ur' ? `وڈرا میں ترمیم کریں (ID: ${editingWithdraw.id}):` : `Edit Withdrawal (${editingWithdraw.id}):`}
                        </span>
                        <button
                          onClick={() => setEditingWithdraw(null)}
                          className="text-slate-400 hover:text-white"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <label className="text-slate-400 block text-[10px] mb-1">رقم (Amount PKR):</label>
                          <input
                            type="number"
                            value={editingWithdraw.amount}
                            onChange={(e) =>
                              setEditingWithdraw({
                                ...editingWithdraw,
                                amount: Number(e.target.value)
                              })
                            }
                            className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-digital font-bold focus:ring-1 focus:ring-amber-500"
                          />
                        </div>

                        <div>
                          <label className="text-slate-400 block text-[10px] mb-1">طریقہ کار (Method):</label>
                          <select
                            value={editingWithdraw.method}
                            onChange={(e) =>
                              setEditingWithdraw({
                                ...editingWithdraw,
                                method: e.target.value as any
                              })
                            }
                            className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-semibold"
                          >
                            <option value="easypaisa">EasyPaisa</option>
                            <option value="jazzcash">JazzCash</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-slate-400 block text-[10px] mb-1">اکاؤنٹ نمبر (Account Number):</label>
                          <input
                            type="text"
                            value={editingWithdraw.accountNumber}
                            onChange={(e) =>
                              setEditingWithdraw({
                                ...editingWithdraw,
                                accountNumber: e.target.value
                              })
                            }
                            className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono"
                          />
                        </div>

                        <div>
                          <label className="text-slate-400 block text-[10px] mb-1">اکاؤنٹ نام (Account Title):</label>
                          <input
                            type="text"
                            value={editingWithdraw.accountTitle || ''}
                            onChange={(e) =>
                              setEditingWithdraw({
                                ...editingWithdraw,
                                accountTitle: e.target.value
                              })
                            }
                            className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono"
                          />
                        </div>

                        <div>
                          <label className="text-slate-400 block text-[10px] mb-1">TRX ID:</label>
                          <input
                            type="text"
                            value={editingWithdraw.trxId || ''}
                            onChange={(e) =>
                              setEditingWithdraw({
                                ...editingWithdraw,
                                trxId: e.target.value
                              })
                            }
                            className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono"
                          />
                        </div>

                        <div>
                          <label className="text-slate-400 block text-[10px] mb-1">اسٹیٹس (Status):</label>
                          <select
                            value={editingWithdraw.status}
                            onChange={(e) =>
                              setEditingWithdraw({
                                ...editingWithdraw,
                                status: e.target.value as any
                              })
                            }
                            className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-semibold"
                          >
                            <option value="completed">ادا شدہ (Completed)</option>
                            <option value="pending">زیر التواء (Pending)</option>
                            <option value="rejected">مسترد (Rejected)</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => {
                            if (editingWithdraw && editingWithdraw.amount > 0) {
                              onEditWithdraw?.(editingWithdraw.id, editingWithdraw);
                              soundManager.playCash();
                              setEditingWithdraw(null);
                            }
                          }}
                          className="flex-1 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl cursor-pointer"
                        >
                          {language === 'ur' ? 'تبدیلیاں محفوظ کریں' : 'Save Changes'}
                        </button>
                        <button
                          onClick={() => setEditingWithdraw(null)}
                          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 font-bold text-xs rounded-xl cursor-pointer"
                        >
                          {language === 'ur' ? 'منسوخ' : 'Cancel'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* WITHDRAWALS LIST WITH FULL CRUD CONTROLS */}
                  <div className="space-y-2">
                    {transactions.filter((t) => t.type === 'withdraw').length === 0 ? (
                      <p className="text-xs text-slate-500 py-6 text-center">
                        {language === 'ur' ? 'کوئی وڈرا درخواست نہیں ہے' : 'No withdrawals recorded'}
                      </p>
                    ) : (
                      transactions
                        .filter((t) => t.type === 'withdraw')
                        .map((tx) => (
                          <div
                            key={tx.id}
                            className="bg-slate-800 rounded-2xl p-3 border border-slate-700 space-y-2 shadow-xs transition-all hover:border-slate-600"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-orange-400 font-digital text-base">
                                  Rs {tx.amount.toLocaleString()}
                                </span>
                                <span className="text-[10px] uppercase font-bold text-slate-400">
                                  {tx.method}
                                </span>
                                <span
                                  className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${
                                    tx.status === 'completed'
                                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                      : tx.status === 'pending'
                                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse'
                                      : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                  }`}
                                >
                                  {tx.status}
                                </span>
                              </div>

                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => {
                                    soundManager.playClick();
                                    setEditingWithdraw(tx);
                                    setShowAddWithdrawForm(false);
                                  }}
                                  className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-amber-300 hover:text-white cursor-pointer"
                                  title="Edit Withdrawal"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    soundManager.playToom(1);
                                    onDeleteWithdraw?.(tx.id);
                                  }}
                                  className="px-2 py-1 rounded-lg bg-rose-900/80 hover:bg-rose-600 text-rose-200 hover:text-white cursor-pointer transition-all border border-rose-700/60 flex items-center gap-1 text-[11px] font-bold active:scale-95"
                                  title="Delete Withdrawal"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>{language === 'ur' ? 'ڈیلیٹ' : 'Delete'}</span>
                                </button>
                              </div>
                            </div>

                            <div className="text-xs text-slate-300 font-mono space-y-0.5">
                              {tx.userName && (
                                <div className="text-cyan-300 font-sans font-bold">
                                  Player: {tx.userName} {tx.userPhone ? `(${tx.userPhone})` : ''} {tx.userId ? `[${tx.userId}]` : ''}
                                </div>
                              )}
                              <div>Title: {tx.accountTitle}</div>
                              <div>Number: {tx.accountNumber} ({tx.method})</div>
                              <div className="flex items-center justify-between">
                                <span>TRX: {tx.trxId}</span>
                                <span className="text-[10px] text-slate-400">{new Date(tx.timestamp).toLocaleString()}</span>
                              </div>
                            </div>

                            {/* Pending Quick Action Bar */}
                            {tx.status === 'pending' && (
                              <div className="flex gap-2 pt-1 border-t border-slate-700/60">
                                <button
                                  onClick={() => {
                                    soundManager.playCash();
                                    onApproveWithdraw(tx.id);
                                  }}
                                  className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                  <span>{language === 'ur' ? 'منظور کریں (Approve Paid)' : 'Approve & Mark Paid'}</span>
                                </button>
                                <button
                                  onClick={() => {
                                    soundManager.playToom(1);
                                    onRejectWithdraw(tx.id);
                                  }}
                                  className="px-3.5 py-1.5 bg-rose-700 hover:bg-rose-600 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1 cursor-pointer"
                                >
                                  <XCircle className="w-4 h-4" />
                                  <span>{language === 'ur' ? 'مسترد و واپس بیلنس' : 'Reject & Refund'}</span>
                                </button>
                              </div>
                            )}
                          </div>
                        ))
                    )}
                  </div>
                </div>
              )}

              {/* TAB 5: BALANCE CRUD & MULTI-USER CONTROL */}
              {activeTab === 'balance' && (() => {
                const targetUser =
                  registeredUsers.find((u) => u.id === selectedBalanceUserId) ||
                  registeredUsers.find((u) => u.id === currentUserId) ||
                  registeredUsers[0];
                const targetBalance = targetUser
                  ? typeof targetUser.balance === 'number'
                    ? targetUser.balance
                    : targetUser.id === currentUserId
                    ? balance
                    : userBalancesMap[targetUser.id] || 0
                  : balance;

                const applyTargetBalance = async (
                  action: 'set' | 'add' | 'deduct' | 'reset',
                  amt: number
                ) => {
                  if (targetUser && onUpdateUserBalance) {
                    await onUpdateUserBalance(targetUser.id, action, amt);
                    showNotice(
                      language === 'ur'
                        ? `${targetUser.fullName} کا بیلنس اپ ڈیٹ ہو گیا!`
                        : `Updated ${targetUser.fullName}'s balance!`
                    );
                  } else {
                    if (action === 'reset') {
                      onResetBalance ? onResetBalance() : onUpdateBalance(0);
                    } else if (action === 'add') {
                      onUpdateBalance(targetBalance + amt);
                    } else if (action === 'deduct') {
                      onUpdateBalance(Math.max(0, targetBalance - amt));
                    } else {
                      onUpdateBalance(amt);
                    }
                  }
                };

                return (
                  <div className="space-y-4 animate-in fade-in">
                    {/* All Users Combined Total Banner */}
                    <div className="bg-slate-800/90 rounded-2xl p-3 border border-slate-700 flex items-center justify-between text-xs">
                      <span className="text-slate-300 font-bold">
                        {language === 'ur' ? 'تمام یوزرز کا کل بیلنس:' : 'All Users Combined Balance:'}
                      </span>
                      <span className="font-digital font-black text-emerald-400 text-base">
                        Rs {totalAllBalances.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    {/* User Selector */}
                    {registeredUsers.length > 0 && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-300 block">
                          {language === 'ur' ? 'صارف منتخب کریں (جس کا بیلنس بدلنا ہو):' : 'Select Player Account:'}
                        </label>
                        <select
                          value={targetUser?.id || ''}
                          onChange={(e) => setSelectedBalanceUserId(e.target.value)}
                          className="w-full px-3 py-2.5 text-xs rounded-xl bg-slate-800 border border-cyan-500/40 text-white font-bold focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        >
                          {registeredUsers.map((u) => {
                            const uBal =
                              typeof u.balance === 'number'
                                ? u.balance
                                : u.id === currentUserId
                                ? balance
                                : userBalancesMap[u.id] || 0;
                            return (
                              <option key={u.id} value={u.id}>
                                {u.fullName} ({u.phone}) — Rs {uBal.toLocaleString()}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    )}

                    <div className="bg-gradient-to-br from-blue-900 to-indigo-950 rounded-2xl p-4 border border-blue-700/50 text-center space-y-1 shadow-lg">
                      <span className="text-xs text-blue-200 block">
                        {targetUser
                          ? `${targetUser.fullName} (${targetUser.phone})`
                          : language === 'ur'
                          ? 'صارف کا موجودہ گیم بیلنس:'
                          : 'Current Player Balance:'}
                      </span>
                      <div className="text-3xl font-digital font-black text-amber-300">
                        Rs {targetBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </div>
                    </div>

                    {/* QUICK ADD BALANCE */}
                    <div>
                      <label className="text-xs font-bold text-slate-300 block mb-1.5">
                        {language === 'ur' ? 'فوری بیلنس شامل کریں (+Add Cash):' : 'Quick Add Balance:'}
                      </label>
                      <div className="grid grid-cols-4 gap-2">
                        {[500, 1000, 2500, 5000].map((amt) => (
                          <button
                            key={amt}
                            onClick={() => {
                              soundManager.playCash();
                              applyTargetBalance('add', amt);
                            }}
                            className="py-2.5 bg-emerald-600/90 hover:bg-emerald-600 font-bold text-xs text-white rounded-xl cursor-pointer shadow-xs active:scale-95"
                          >
                            +Rs {amt}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* QUICK DEDUCT BALANCE */}
                    <div>
                      <label className="text-xs font-bold text-slate-300 block mb-1.5">
                        {language === 'ur' ? 'بیلنس کٹوتی کریں (-Deduct Cash):' : 'Quick Deduct Balance:'}
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {[500, 1000, 5000].map((amt) => (
                          <button
                            key={amt}
                            onClick={() => {
                              soundManager.playToom(1);
                              applyTargetBalance('deduct', amt);
                            }}
                            className="py-2.5 bg-rose-700/90 hover:bg-rose-700 font-bold text-xs text-white rounded-xl cursor-pointer shadow-xs active:scale-95"
                          >
                            -Rs {amt}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* DIRECT SET EXACT BALANCE */}
                    <div className="space-y-1.5 pt-2 border-t border-slate-700">
                      <label className="text-xs font-bold text-slate-300 block">
                        {language === 'ur' ? 'یا براہ راست کوئی بھی رقم فکس کریں (Set Exact Balance):' : 'Set Exact Balance (PKR):'}
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          placeholder="e.g. 50000"
                          value={manualBalanceInput}
                          onChange={(e) => setManualBalanceInput(e.target.value)}
                          className="flex-1 px-3 py-2 text-xs rounded-xl bg-slate-800 border border-slate-700 text-white font-digital font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          onClick={() => {
                            const val = Number(manualBalanceInput);
                            if (!isNaN(val) && val >= 0) {
                              soundManager.playCash();
                              applyTargetBalance('set', val);
                              setManualBalanceInput('');
                            }
                          }}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 font-bold text-xs text-white rounded-xl cursor-pointer flex items-center gap-1.5"
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>{language === 'ur' ? 'محفوظ کریں' : 'Set Balance'}</span>
                        </button>
                      </div>
                    </div>

                    {/* RESET / DELETE BALANCE AND USER ACCOUNT */}
                    <div className="bg-rose-950/40 border border-rose-600/40 rounded-2xl p-3.5 space-y-3 mt-3">
                      <div className="flex items-center gap-1.5 text-rose-400 font-bold text-xs">
                        <AlertTriangle className="w-4 h-4" />
                        <span>{language === 'ur' ? 'ڈیلیٹ اور ری سیٹ مینیجر (Delete Controls):' : 'Delete & Reset Controls:'}</span>
                      </div>

                      <div className="space-y-2">
                        <button
                          onClick={() => {
                            soundManager.playToom(1);
                            applyTargetBalance('reset', 0);
                          }}
                          className="w-full py-2.5 bg-rose-700 hover:bg-rose-600 active:scale-95 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-md transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>{language === 'ur' ? 'منتخب یوزر کا بیلنس 0 کریں / Reset Balance to 0' : 'Reset Selected Balance to 0 PKR'}</span>
                        </button>

                        <button
                          onClick={() => {
                            soundManager.playToom(1);
                            onClearAllUserData?.();
                          }}
                          className="w-full py-2.5 bg-red-900/80 hover:bg-red-800 active:scale-95 text-rose-200 hover:text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer border border-rose-600/50 transition-all"
                        >
                          <Trash2 className="w-4 h-4 text-rose-300" />
                          <span>{language === 'ur' ? 'تمام یوزرز، ریکارڈز اور ہسٹری ڈیلیٹ کریں (Reset All)' : 'Delete All Users & Clear Records'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* TAB 6: SETTINGS & MASTER PIN */}
              {activeTab === 'settings' && (
                <div className="space-y-4 animate-in fade-in">
                  <form onSubmit={handleUpdatePin} className="space-y-2 bg-slate-800/90 p-4 rounded-2xl border border-slate-700">
                    <label className="text-xs font-bold text-slate-200 block">
                      {language === 'ur' ? 'ماسٹر ایڈمن پن کوڈ تبدیل کریں:' : 'Change Master Admin PIN:'}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="New PIN (e.g. 786)"
                        value={newPinInput}
                        onChange={(e) => setNewPinInput(e.target.value)}
                        className="flex-1 px-3 py-2 text-xs rounded-xl bg-slate-900 border border-slate-700 text-white font-mono font-bold"
                      />
                      <button
                        type="submit"
                        className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl cursor-pointer"
                      >
                        {language === 'ur' ? 'تبدیل کریں' : 'Update PIN'}
                      </button>
                    </div>
                  </form>

                  <div className="bg-slate-800/60 p-4 rounded-2xl border border-slate-700 text-xs text-slate-300 space-y-2.5">
                    <div className="font-bold text-white flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span>{language === 'ur' ? 'گیم کے طے شدہ اصول و حدود:' : 'System Rules & Limits:'}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-700 pb-1.5">
                      <span>کم از کم بیٹ (Min Bet):</span>
                      <span className="font-bold text-emerald-400">Rs 1 PKR</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-700 pb-1.5">
                      <span>زیادہ سے زیادہ بیٹ (Max Bet):</span>
                      <span className="font-bold text-indigo-400">لامحدود (Unlimited)</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-700 pb-1.5">
                      <span>کم از کم وڈرا (Min Withdrawal):</span>
                      <span className="font-bold text-orange-400">Rs 500 PKR</span>
                    </div>
                    <div className="flex justify-between">
                      <span>بیٹ کلوز گارڈ (Bet Lock):</span>
                      <span className="font-bold text-rose-400">آخری 5 سیکنڈ</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Footer Bar */}
            <div className="bg-slate-950 px-4 py-2.5 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 select-none">
              <span className="flex items-center gap-1.5 text-emerald-400 font-semibold text-[11px]">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Admin Master Mode Active</span>
              </span>
              <button
                onClick={() => {
                  onAuthenticate(false);
                  localStorage.removeItem('muna_admin_logged_in');
                  onClose();
                }}
                className="px-3 py-1 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white rounded-lg font-bold transition-all cursor-pointer text-[11px]"
              >
                {language === 'ur' ? 'لاگ آؤٹ اور بند کریں' : 'Log Out & Exit'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Fullscreen Payment Screenshot Lightbox */}
      {zoomScreenshot && (
        <div
          onClick={() => setZoomScreenshot(null)}
          className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-md w-full bg-slate-900 rounded-2xl p-3 border border-slate-700 space-y-2.5 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-2 text-xs">
              <div className="min-w-0">
                <p className="font-bold text-emerald-400 truncate">
                  {zoomScreenshot.player || 'Player Payment Screenshot'}
                </p>
                <p className="text-[11px] text-slate-300 font-mono">
                  {zoomScreenshot.amount ? `Rs ${zoomScreenshot.amount.toLocaleString()} • ` : ''}
                  TRX ID: <span className="text-amber-300 font-bold">{zoomScreenshot.trxId || 'N/A'}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setZoomScreenshot(null)}
                className="p-1.5 rounded-full bg-slate-800 text-white hover:bg-rose-600 cursor-pointer shrink-0"
                aria-label="Close Screenshot"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <img
              src={zoomScreenshot.url}
              alt="Payment Screenshot"
              className="w-full max-h-[75vh] object-contain rounded-xl bg-black"
            />
          </div>
        </div>
      )}
    </div>
  );
};
