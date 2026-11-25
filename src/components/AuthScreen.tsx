import React, { useState, useEffect, useRef } from 'react';
import {
  Phone,
  Lock,
  User,
  Eye,
  EyeOff,
  LogIn,
  UserPlus,
  ShieldCheck,
  AlertCircle,
  Gift
} from 'lucide-react';
import { AppTheme, RegisteredUser } from '../types/game';
import { soundManager } from '../utils/audio';
import { PWAInstallButton } from './PWAInstallButton';
import {
  ensureFirebaseUserDocuments,
  signInWithGoogleFirebase,
} from '../services/firebaseSync';

interface AuthSuccessPayload {
  serverTime?: number;
  balance?: number;
  transactions?: import('../types/game').PaymentTransaction[];
  bets?: import('../types/game').UserBet[];
  historyByMode?: Record<import('../types/game').GameTimeOption, import('../types/game').DrawResult[]>;
  referralEarnings?: number;
  invitedCount?: number;
  isGoogleAdmin?: boolean;
}

interface AuthScreenProps {
  onAuthSuccess: (user: RegisteredUser, isNewSignup: boolean, serverPayload?: AuthSuccessPayload) => void;
  language: 'ur' | 'en';
  theme: AppTheme;
  onOpenAdmin?: () => void;
}

const USERS_STORAGE_KEY = 'muna_registered_users';

export const AuthScreen: React.FC<AuthScreenProps> = ({
  onAuthSuccess,
  language,
  theme,
  onOpenAdmin
}) => {
  const isBlue = theme === 'blue';
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');

  // Form fields
  const [fullName, setFullName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [inviteCode, setInviteCode] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Secret 5-tap admin trigger on logo
  const [logoTapCount, setLogoTapCount] = useState<number>(0);
  const lastTapRef = useRef<number>(0);

  // Pre-fill invite code if present in URL (?invite=...)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get('invite');
      if (ref) {
        setInviteCode(ref);
        setMode('signup');
      }
    } catch {
      // ignore
    }
  }, []);

  const getStoredUsers = (): RegisteredUser[] => {
    try {
      const raw = localStorage.getItem(USERS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  };

  const saveStoredUsers = (users: RegisteredUser[]) => {
    try {
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
    } catch {
      // ignore
    }
  };

  const normalizePhone = (raw: string) => raw.replace(/\s|-/g, '').trim();

  const handleLogoTap = () => {
    soundManager.playClick();
    const now = Date.now();
    if (now - lastTapRef.current > 3000) {
      setLogoTapCount(1);
    } else {
      const next = logoTapCount + 1;
      setLogoTapCount(next);
      if (next >= 5) {
        setLogoTapCount(0);
        soundManager.playCash();
        onOpenAdmin?.();
      }
    }
    lastTapRef.current = now;
  };

  const switchMode = (nextMode: 'signin' | 'signup') => {
    soundManager.playClick();
    setMode(nextMode);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone || cleanPhone.length < 10) {
      setError(
        language === 'ur'
          ? 'براہ کرم 11 ہندسوں کا درست موبائل نمبر درج کریں (مثال: 03001234567)'
          : 'Please enter a valid 11-digit mobile number (e.g. 03001234567)'
      );
      return;
    }

    if (!password || password.length < 4) {
      setError(
        language === 'ur'
          ? 'پاسورڈ کم از کم 4 حروف یا ہندسوں کا ہونا ضروری ہے'
          : 'Password must be at least 4 characters long'
      );
      return;
    }

    const users = getStoredUsers();

    if (mode === 'signup') {
      if (!fullName.trim() || fullName.trim().length < 2) {
        setError(
          language === 'ur'
            ? 'براہ کرم اپنا پورا نام درج کریں'
            : 'Please enter your full name'
        );
        return;
      }

      if (password !== confirmPassword) {
        setError(
          language === 'ur'
            ? 'دونوں پاسورڈ آپس میں نہیں ملتے، دوبارہ چیک کریں'
            : 'Passwords do not match. Please verify.'
        );
        return;
      }

      setIsSubmitting(true);
      try {
        const res = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fullName: fullName.trim(),
            phone: cleanPhone,
            password,
            inviteCode: inviteCode.trim() || undefined,
          }),
        });
        const data = await res.json();
        if (res.status === 409) {
          setIsSubmitting(false);
          setError(
            language === 'ur'
              ? 'اس موبائل نمبر پر اکاؤنٹ پہلے سے موجود ہے، براہ کرم سائن ان کریں'
              : 'An account with this mobile number already exists. Please Sign In.'
          );
          return;
        }
        if (!res.ok || !data?.user) {
          throw new Error(data?.error || 'Signup failed');
        }

        const createdUser: RegisteredUser = {
          ...data.user,
          password,
        };
        saveStoredUsers([createdUser, ...users.filter((u) => u.id !== createdUser.id)]);
        soundManager.playCash();
        setIsSubmitting(false);
        onAuthSuccess(createdUser, true, {
          balance: data.balance,
          transactions: data.transactions,
          bets: data.bets,
          historyByMode: data.historyByMode,
          referralEarnings: data.referralEarnings,
          invitedCount: data.invitedCount,
        });
      } catch {
        setIsSubmitting(false);
        setError(
          language === 'ur'
            ? 'سرور سے رابطہ نہیں ہو سکا، براہ کرم دوبارہ کوشش کریں'
            : 'Could not connect to server. Please try again.'
        );
      }
    } else {
      setIsSubmitting(true);
      try {
        const res = await fetch('/api/auth/signin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: cleanPhone,
            password,
          }),
        });
        const data = await res.json();

        if (res.ok && data?.user) {
          const signedUser: RegisteredUser = { ...data.user, password };
          saveStoredUsers([signedUser, ...users.filter((u) => u.id !== signedUser.id)]);
          soundManager.playCash();
          setIsSubmitting(false);
          onAuthSuccess(signedUser, false, {
            balance: data.balance,
            transactions: data.transactions,
            bets: data.bets,
            historyByMode: data.historyByMode,
            referralEarnings: data.referralEarnings,
            invitedCount: data.invitedCount,
          });
          return;
        }

        if (res.status === 401) {
          setIsSubmitting(false);
          setError(
            language === 'ur'
              ? 'غلط پاسورڈ! براہ کرم درست پاسورڈ درج کریں'
              : 'Incorrect password. Please try again.'
          );
          return;
        }

        if (res.status === 404 && data?.deleted) {
          saveStoredUsers(users.filter((u) => normalizePhone(u.phone) !== cleanPhone));
          setIsSubmitting(false);
          setError(
            language === 'ur'
              ? 'یہ اکاؤنٹ ایڈمن نے ڈیلیٹ کر دیا ہے۔ براہ کرم نیا اکاؤنٹ بنائیں (Sign Up)'
              : 'This account was deleted. Please Create New Account.'
          );
          return;
        }

        // If 404 on server, check if user existed previously in localStorage and sync up
        const localMatched = users.find(
          (u) => normalizePhone(u.phone) === cleanPhone && u.password === password
        );
        if (localMatched) {
          let localBal = 10;
          try {
            const rawBals = localStorage.getItem('muna_user_balances');
            const map = rawBals ? (JSON.parse(rawBals) as Record<string, number>) : {};
            if (typeof map[localMatched.id] === 'number') localBal = map[localMatched.id];
          } catch {
            // ignore
          }
          const syncRes = await fetch('/api/auth/sync-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user: localMatched, localBalance: localBal }),
          });
          const syncData = await syncRes.json().catch(() => null);
          if (syncRes.status === 410 || syncData?.deleted) {
            saveStoredUsers(users.filter((u) => u.id !== localMatched.id));
            setIsSubmitting(false);
            setError(
              language === 'ur'
                ? 'یہ اکاؤنٹ ایڈمن نے ڈیلیٹ کر دیا ہے۔ براہ کرم نیا اکاؤنٹ بنائیں (Sign Up)'
                : 'This account was deleted. Please Create New Account.'
            );
            return;
          }
          if (syncRes.ok && syncData?.user) {
            soundManager.playCash();
            setIsSubmitting(false);
            onAuthSuccess({ ...syncData.user, password }, false, syncData);
            return;
          }
        }

        setIsSubmitting(false);
        setError(
          language === 'ur'
            ? 'اس نمبر پر کوئی اکاؤنٹ نہیں ملا۔ براہ کرم پہلے نیا اکاؤنٹ بنائیں (Sign Up)'
            : 'No account found for this number. Please Create New Account first.'
        );
      } catch {
        setIsSubmitting(false);
        setError(
          language === 'ur'
            ? 'سرور سے رابطہ نہیں ہو سکا، براہ کرم دوبارہ کوشش کریں'
            : 'Could not connect to server. Please try again.'
        );
      }
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      const { firebaseUser, isAdminEmail } = await signInWithGoogleFirebase();
      const normalized = normalizePhone(phone);
      const ensured = await ensureFirebaseUserDocuments(firebaseUser, {
        fullName: fullName.trim() || firebaseUser.displayName || undefined,
        phone: normalized.length >= 7 ? normalized : undefined,
        inviteCode: inviteCode.trim() || undefined,
      });

      let syncData: AuthSuccessPayload = {
        balance: ensured.balance,
        referralEarnings: ensured.referralEarnings,
        isGoogleAdmin: isAdminEmail,
      };
      let syncedUser = ensured.user;

      try {
        const res = await fetch('/api/auth/sync-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user: ensured.user,
            localBalance: ensured.balance,
            isGoogleLogin: true,
          }),
        });
        if (res.ok) {
          const serverRes = await res.json();
          if (serverRes?.user) {
            syncedUser = serverRes.user;
          }
          syncData = {
            ...serverRes,
            balance:
              typeof serverRes?.balance === 'number'
                ? Math.max(serverRes.balance, ensured.balance)
                : ensured.balance,
            isGoogleAdmin: isAdminEmail,
          };
        }
      } catch {
        // Firestore state remains authoritative if express endpoint is offline
      }

      const users = getStoredUsers();
      saveStoredUsers([syncedUser, ...users.filter((u) => u.id !== syncedUser.id)]);
      soundManager.playCash();
      setIsSubmitting(false);
      onAuthSuccess(syncedUser, false, syncData);
    } catch (err) {
      setIsSubmitting(false);
      const msg = err instanceof Error ? err.message : 'Google Sign-In failed';
      setError(
        msg.includes('popup-closed')
          ? 'Google sign-in popup was closed. Please try again.'
          : 'Could not complete Google Sign-In. Please try again.'
      );
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 flex flex-col items-center justify-center sm:py-6">
      <div className="relative w-full max-w-md min-h-screen sm:min-h-[760px] bg-slate-900 sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Transparent Animated Front Loading Poster Layer Underneath */}
        <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
          <img
            src="/assets/aistudio/1794315787253_17b88589.jpg"
            alt="Muna WinGo Background"
            className="w-full h-full object-cover object-center opacity-35 animate-bg-kenburns"
          />
          <div
            className={`absolute inset-0 ${
              isBlue
                ? 'bg-gradient-to-b from-blue-950/70 via-slate-950/55 to-blue-950/80'
                : 'bg-gradient-to-b from-emerald-950/70 via-slate-950/55 to-emerald-950/80'
            }`}
          />
          {/* Subtle animated ambient glow orbs */}
          <div className="absolute -top-12 -right-10 w-44 h-44 rounded-full bg-amber-400/20 blur-2xl animate-pulse" />
          <div
            className={`absolute bottom-10 -left-12 w-52 h-52 rounded-full blur-3xl animate-pulse ${
              isBlue ? 'bg-blue-500/25' : 'bg-emerald-500/25'
            }`}
          />
        </div>

        {/* Top Brand Hero Banner (Translucent so backdrop shows faintly through) */}
        <div
          className={`relative z-10 px-5 pt-5 pb-9 text-white backdrop-blur-[2px] transition-colors duration-300 ${
            isBlue
              ? 'bg-gradient-to-br from-blue-700/75 via-indigo-700/70 to-blue-900/75'
              : 'bg-gradient-to-br from-emerald-700/75 via-teal-700/70 to-emerald-900/75'
          }`}
        >
          {/* Install App Row */}
          <div className="flex items-center justify-between mb-3 gap-2">
            <span className="text-xs font-semibold text-white/85 tracking-wide truncate">
              Official Player Portal
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <PWAInstallButton language={language} />
            </div>
          </div>

          {/* Center Emblem + Floating Animated Lottery Balls + Title */}
          <div className="flex flex-col items-center text-center animate-fade-up">
            <div className="relative flex items-center justify-center mb-3">
              {/* Decorative floating mini lottery balls */}
              <span
                className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-700 text-white text-xs font-digital font-black flex items-center justify-center shadow-lg border border-emerald-200/70 absolute -left-10 top-2 animate-bounce"
                style={{ animationDuration: '2.4s' }}
              >
                1
              </span>
              <span
                className="w-7 h-7 rounded-full bg-gradient-to-br from-rose-400 to-red-700 text-white text-xs font-digital font-black flex items-center justify-center shadow-lg border border-rose-200/70 absolute -right-10 bottom-1 animate-bounce"
                style={{ animationDuration: '2.8s', animationDelay: '250ms' }}
              >
                2
              </span>

              <button
                type="button"
                onClick={handleLogoTap}
                className="w-24 h-24 rounded-full overflow-hidden bg-slate-900/20 shadow-2xl border-2 border-white/90 ring-4 ring-white/25 cursor-pointer active:scale-95 transition-transform animate-float-slow"
                aria-label="Muna WinGo Logo"
              >
                <img
                  src="/muna-logo-512.png"
                  alt="Muna WinGo"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain rounded-full"
                />
              </button>
            </div>

            <h1 className="font-sans font-black text-2xl tracking-wider uppercase leading-tight text-white drop-shadow-sm">
              MUNA WINGO
            </h1>
            <p className="text-xs font-extrabold tracking-widest text-amber-200 uppercase mt-0.5">
              LIVE PREDICTION GAME
            </p>
            <p className="text-xs text-white/90 mt-1.5 max-w-xs">
              {mode === 'signin'
                ? language === 'ur'
                  ? 'گیم کھیلنے کے لیے اپنے اکاؤنٹ میں سائن ان کریں'
                  : 'Sign in to your account to enter the live game'
                : language === 'ur'
                ? 'نیا اکاؤنٹ بنائیں اور فوری لائیو بیٹنگ شروع کریں'
                : 'Create a new account and start playing immediately'}
            </p>
          </div>
        </div>

        {/* Main Auth Card Content (Translucent glass layer so loading artwork subtly shows underneath) */}
        <div className="relative z-10 flex-1 -mt-5 bg-white/82 backdrop-blur-md rounded-t-3xl px-5 pt-6 pb-8 flex flex-col justify-between border-t border-white/50 shadow-[0_-10px_30px_rgba(0,0,0,0.2)]">
          <div key={mode} className="space-y-5 animate-fade-up">
            {/* Segmented Switcher: Sign In vs Create New Account */}
            <div className="grid grid-cols-2 gap-1.5 p-1.5 bg-slate-200/80 backdrop-blur-xs rounded-2xl border border-slate-200/90">
              <button
                type="button"
                onClick={() => switchMode('signin')}
                className={`min-h-[44px] py-2 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  mode === 'signin'
                    ? isBlue
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-emerald-600 text-white shadow-md'
                    : 'text-slate-700 hover:text-slate-950'
                }`}
              >
                <LogIn className="w-4 h-4 shrink-0" />
                <span>{language === 'ur' ? 'سائن ان (Sign In)' : 'Sign In'}</span>
              </button>

              <button
                type="button"
                onClick={() => switchMode('signup')}
                className={`min-h-[44px] py-2 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  mode === 'signup'
                    ? isBlue
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-emerald-600 text-white shadow-md'
                    : 'text-slate-700 hover:text-slate-950'
                }`}
              >
                <UserPlus className="w-4 h-4 shrink-0" />
                <span>{language === 'ur' ? 'نیا اکاؤنٹ (Sign Up)' : 'Create Account'}</span>
              </button>
            </div>

            {/* Sign-Up Bonus Notice (Rs 10 ONLY on creating a new account) */}
            {mode === 'signup' && (
              <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl bg-emerald-50/95 border border-emerald-200 text-emerald-800 text-xs font-bold">
                <Gift className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  {language === 'ur'
                    ? 'نیا اکاؤنٹ بنانے پر Rs 10 سائن اپ بونس ملے گا!'
                    : 'Get Rs 10 Sign-Up Bonus on creating a new account!'}
                </span>
              </div>
            )}

            {/* Error Alert Banner */}
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2.5 p-3 bg-rose-50/95 text-rose-700 rounded-2xl border border-rose-200 text-xs font-semibold leading-relaxed animate-fade-up"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                <span>{error}</span>
              </div>
            )}

            {/* Auth Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'signup' && (
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    {language === 'ur' ? 'پورا نام (Full Name):' : 'Full Name:'}
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder={language === 'ur' ? 'مثال: علی رضا' : 'e.g. Ali Raza'}
                      className="w-full min-h-[46px] pl-10 pr-4 py-2.5 bg-white/95 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
                    />
                  </div>
                </div>
              )}

              {/* Mobile Number */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  {language === 'ur' ? 'موبائل نمبر (Mobile Number):' : 'Mobile Number:'}
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="03XXXXXXXXX"
                    className="w-full min-h-[46px] pl-10 pr-4 py-2.5 bg-white/95 border border-slate-300 rounded-xl text-sm font-mono tabular-nums text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  {language === 'ur' ? 'پاسورڈ (Password):' : 'Password:'}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={language === 'ur' ? 'کم از کم 4 حروف درج کریں' : 'Enter at least 4 characters'}
                    className="w-full min-h-[46px] pl-10 pr-11 py-2.5 bg-white/95 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-400 hover:text-slate-700 cursor-pointer"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm Password & Optional Invite Code (Sign Up only) */}
              {mode === 'signup' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1.5">
                      {language === 'ur' ? 'پاسورڈ کی تصدیق (Confirm Password):' : 'Confirm Password:'}
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder={language === 'ur' ? 'پاسورڈ دوبارہ لکھیں' : 'Re-enter password'}
                        className="w-full min-h-[46px] pl-10 pr-4 py-2.5 bg-white/95 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1.5">
                      {language === 'ur' ? 'انوائٹ کوڈ (اختیاری / Optional):' : 'Invite Code (Optional):'}
                    </label>
                    <div className="relative">
                      <Gift className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={inviteCode}
                        onChange={(e) => setInviteCode(e.target.value)}
                        placeholder="MUNA888"
                        className="w-full min-h-[46px] pl-10 pr-4 py-2.5 bg-white/95 border border-slate-300 rounded-xl text-sm font-mono uppercase text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Submit Action with Shimmer Animation */}
              <button
                type="submit"
                disabled={isSubmitting}
                className={`relative overflow-hidden w-full min-h-[50px] py-3 px-5 rounded-xl font-bold text-sm text-white shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 ${
                  isBlue
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-500 hover:to-indigo-600 shadow-blue-600/25'
                    : 'bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 shadow-emerald-600/25'
                }`}
              >
                <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent animate-[shimmer_2.4s_infinite] pointer-events-none" />
                {isSubmitting ? (
                  <span className="relative">{language === 'ur' ? 'براہ کرم انتظار کریں...' : 'Please wait...'}</span>
                ) : mode === 'signin' ? (
                  <>
                    <LogIn className="w-4 h-4 relative" />
                    <span className="relative">{language === 'ur' ? 'سائن ان کریں اور گیم کھولیں' : 'Sign In & Open Game'}</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4 relative" />
                    <span className="relative">{language === 'ur' ? 'نیا اکاؤنٹ بنائیں اور گیم کھیلیں' : 'Create Account & Play'}</span>
                  </>
                )}
              </button>
            </form>

            {/* Google Firebase Cloud Sign-In */}
            <div className="space-y-3 pt-1">
              <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <span className="flex-1 h-px bg-slate-200" />
                <span>OR</span>
                <span className="flex-1 h-px bg-slate-200" />
              </div>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleGoogleSignIn}
                className="w-full min-h-[46px] py-2.5 px-4 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 font-bold text-sm shadow-xs active:scale-[0.98] transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-60"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#EA4335"
                    d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.9-5.5 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.9 1.5l2.7-2.6C16.9 3.3 14.7 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z"
                  />
                  <path
                    fill="#34A853"
                    d="M3.5 7.4l3.2 2.4C7.6 7.9 9.6 6.4 12 6.4c1.9 0 3.1.8 3.9 1.5l2.7-2.6C16.9 3.3 14.7 2.4 12 2.4 8.3 2.4 5.1 4.5 3.5 7.4z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M12 21.6c2.6 0 4.8-.9 6.4-2.4l-3-2.5c-.8.6-1.9 1-3.4 1-2.6 0-4.8-1.7-5.6-4.1l-3.2 2.5c1.6 3.2 4.9 5.5 8.8 5.5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M21.2 12.2c0-.6-.1-1.1-.2-1.6H12v3.9h5.5c-.3 1.2-1 2.2-2.1 2.9l3 2.5c1.8-1.6 2.8-4 2.8-7.7z"
                  />
                </svg>
                <span>
                  {language === 'ur' ? 'گوگل سے سائن ان کریں (Google)' : 'Continue with Google'}
                </span>
              </button>
            </div>

            {/* Quick Mode Switch Helper */}
            <div className="text-center pt-1">
              {mode === 'signin' ? (
                <button
                  type="button"
                  onClick={() => switchMode('signup')}
                  className="text-xs font-semibold text-slate-700 hover:text-slate-950 py-2 px-3 cursor-pointer"
                >
                  {language === 'ur'
                    ? 'اکاؤنٹ نہیں ہے؟ نیا اکاؤنٹ بنائیں (Sign Up)'
                    : "Don't have an account? Create New Account"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => switchMode('signin')}
                  className="text-xs font-semibold text-slate-700 hover:text-slate-950 py-2 px-3 cursor-pointer"
                >
                  {language === 'ur'
                    ? 'پہلے سے اکاؤنٹ موجود ہے؟ سائن ان کریں (Sign In)'
                    : 'Already have an account? Sign In'}
                </button>
              )}
            </div>
          </div>

          {/* Bottom Security Footer */}
          <div className="pt-5 mt-4 border-t border-slate-300/60 flex items-center justify-center gap-2 text-[11px] text-slate-600 font-medium">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              {language === 'ur'
                ? '100% محفوظ اکاؤنٹ • ایزی پیسہ اور جیز کیش سپورٹڈ'
                : '100% Secure Player Account · EasyPaisa & JazzCash'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
