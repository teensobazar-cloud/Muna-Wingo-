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
  signOutFirebase,
} from '../services/firebaseSync';

interface AuthSuccessPayload {
  serverTime?: number;
  sessionToken?: string;
  balanceToken?: string;
  balance?: number;
  balanceUpdatedAt?: number;
  commitHashes?: Record<number, string>;
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

const PENDING_REF_KEY = 'muna_pending_ref';

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
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState<boolean>(false);

  // Secret 5-tap admin trigger on logo
  const [logoTapCount, setLogoTapCount] = useState<number>(0);
  const lastTapRef = useRef<number>(0);

  // Clean up legacy localStorage user/balance caches on mount & read ?ref= / ?invite=
  useEffect(() => {
    try {
      localStorage.removeItem('muna_registered_users');
      localStorage.removeItem('muna_user_balances');
      localStorage.removeItem('aloye_wingo_balance');

      const params = new URLSearchParams(window.location.search);
      const refFromUrl = (params.get('ref') || params.get('invite') || '').trim();
      if (refFromUrl) {
        localStorage.setItem(PENDING_REF_KEY, refFromUrl);
        setInviteCode(refFromUrl);
        setMode('signup');
      } else {
        const storedRef = localStorage.getItem(PENDING_REF_KEY) || '';
        if (storedRef) {
          setInviteCode(storedRef);
        }
      }
    } catch {
      // ignore
    }
  }, []);

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

  const resolvePendingInvite = () => {
    const typed = inviteCode.trim();
    if (typed) return typed;
    try {
      return (localStorage.getItem(PENDING_REF_KEY) || '').trim() || undefined;
    } catch {
      return undefined;
    }
  };

  const performMobileSignup = async (
    nameVal: string,
    cleanPhone: string,
    passVal: string,
    refCode?: string
  ): Promise<boolean> => {
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: nameVal.trim(),
        phone: cleanPhone,
        password: passVal,
        inviteCode: refCode || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 403 || data?.blocked) {
      setError('This mobile number has been blocked by Admin.');
      return false;
    }
    if (res.status === 409) {
      setError(
        language === 'ur'
          ? 'اس موبائل نمبر پر اکاؤنٹ پہلے سے موجود ہے، براہ کرم سائن ان کریں'
          : 'An account with this mobile number already exists. Please Sign In.'
      );
      return false;
    }
    if (!res.ok || !data?.user) {
      throw new Error(data?.error || 'Signup failed');
    }

    try {
      localStorage.removeItem(PENDING_REF_KEY);
    } catch {
      // ignore
    }
    soundManager.playCash();
    onAuthSuccess(data.user as RegisteredUser, true, {
      serverTime: data.serverTime,
      sessionToken: data.sessionToken,
      balanceToken: data.balanceToken,
      balance: data.balance,
      balanceUpdatedAt: data.balanceUpdatedAt,
      commitHashes: data.commitHashes,
      transactions: data.transactions,
      bets: data.bets,
      historyByMode: data.historyByMode,
      referralEarnings: data.referralEarnings,
      invitedCount: data.invitedCount,
    });
    return true;
  };

  const performMobileSignin = async (
    cleanPhone: string,
    passVal: string
  ): Promise<boolean> => {
    const res = await fetch('/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: cleanPhone,
        password: passVal,
      }),
    });
    const data = await res.json().catch(() => ({}));

    if (res.status === 403 || data?.blocked) {
      setError('This mobile number has been blocked by Admin.');
      return false;
    }

    if (res.ok && data?.user) {
      try {
        localStorage.removeItem(PENDING_REF_KEY);
      } catch {
        // ignore
      }
      soundManager.playCash();
      onAuthSuccess(data.user as RegisteredUser, false, {
        serverTime: data.serverTime,
        sessionToken: data.sessionToken,
        balanceToken: data.balanceToken,
        balance: data.balance,
        balanceUpdatedAt: data.balanceUpdatedAt,
        commitHashes: data.commitHashes,
        transactions: data.transactions,
        bets: data.bets,
        historyByMode: data.historyByMode,
        referralEarnings: data.referralEarnings,
        invitedCount: data.invitedCount,
      });
      return true;
    }

    if (res.status === 401) {
      setError(
        language === 'ur'
          ? 'غلط پاسورڈ! براہ کرم درست پاسورڈ درج کریں'
          : 'Incorrect password. Please try again.'
      );
      return false;
    }

    if (res.status === 404 && data?.deleted) {
      setError('This mobile number has been blocked or removed by Admin.');
      return false;
    }

    setError(
      language === 'ur'
        ? 'اس نمبر پر کوئی اکاؤنٹ نہیں ملا۔ براہ کرم پہلے نیا اکاؤنٹ بنائیں (Sign Up)'
        : 'No account found for this number. Please Create New Account first.'
    );
    return false;
  };

  const handleGoogleContinue = async () => {
    if (isSubmitting || isGoogleSubmitting) return;
    soundManager.playClick();
    setError(null);
    setIsGoogleSubmitting(true);

    try {
      const { firebaseUser, isAdminEmail } = await signInWithGoogleFirebase();
      const refCode = resolvePendingInvite();

      const cloudProfile = await ensureFirebaseUserDocuments(firebaseUser, {
        inviteCode: refCode,
      });

      const res = await fetch('/api/auth/sync-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: cloudProfile.user,
          isGoogleLogin: true,
          isExplicitGoogleAuth: true,
          isNewGoogleUser: cloudProfile.isNewUser,
          isAdminEmail,
          restoreIfColdStart: true,
          localBalance: cloudProfile.balance,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if ((res.status === 403 || res.status === 410) && (data?.blocked || data?.explicitlyDeleted)) {
        await signOutFirebase();
        setError('This account has been blocked or removed by Admin.');
        return;
      }

      if (!res.ok || !data?.user) {
        throw new Error(data?.error || 'Could not complete Google Sign-In');
      }

      try {
        localStorage.removeItem(PENDING_REF_KEY);
      } catch {
        // ignore
      }

      const resolvedUser: RegisteredUser = {
        ...(data.user as RegisteredUser),
        email: (data.user as RegisteredUser).email || cloudProfile.user.email,
        authProvider: 'google',
      };
      const isNewAccount = Boolean(data.isNewUser ?? cloudProfile.isNewUser);

      soundManager.playCash();
      onAuthSuccess(resolvedUser, isNewAccount, {
        serverTime: data.serverTime,
        sessionToken: data.sessionToken,
        balanceToken: data.balanceToken,
        balance: typeof data.balance === 'number' ? data.balance : cloudProfile.balance,
        balanceUpdatedAt: data.balanceUpdatedAt,
        commitHashes: data.commitHashes,
        transactions: data.transactions,
        bets: data.bets,
        historyByMode: data.historyByMode,
        referralEarnings:
          typeof data.referralEarnings === 'number'
            ? data.referralEarnings
            : cloudProfile.referralEarnings,
        invitedCount: data.invitedCount,
        isGoogleAdmin: isAdminEmail,
      });
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      const msg = err instanceof Error ? err.message : String(err || '');

      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setError(
          language === 'ur'
            ? 'گوگل سائن ان ونڈو بند کر دی گئی۔ دوبارہ کوشش کریں۔'
            : 'Google sign-in popup was closed. Please try again.'
        );
      } else if (code === 'auth/popup-blocked') {
        setError(
          language === 'ur'
            ? 'براؤزر نے پاپ اپ بلاک کر دیا ہے۔ براہ کرم پاپ اپ کی اجازت دیں۔'
            : 'Browser blocked the Google popup. Please allow popups for this site.'
        );
      } else if (code === 'auth/unauthorized-domain') {
        setError(
          'This domain is not authorized in Firebase Console Auth settings. Add this domain under Authentication > Settings > Authorized domains.'
        );
      } else {
        setError(
          msg && !msg.includes('{')
            ? msg
            : language === 'ur'
            ? 'گوگل سائن ان مکمل نہیں ہو سکا، براہ کرم دوبارہ کوشش کریں'
            : 'Could not complete Google Sign-In. Please try again.'
        );
      }
    } finally {
      setIsGoogleSubmitting(false);
    }
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
        await performMobileSignup(fullName, cleanPhone, password, resolvePendingInvite());
      } catch {
        setError(
          language === 'ur'
            ? 'سرور سے رابطہ نہیں ہو سکا، براہ کرم دوبارہ کوشش کریں'
            : 'Could not connect to server. Please try again.'
        );
      } finally {
        setIsSubmitting(false);
      }
    } else {
      setIsSubmitting(true);
      try {
        await performMobileSignin(cleanPhone, password);
      } catch {
        setError(
          language === 'ur'
            ? 'سرور سے رابطہ نہیں ہو سکا، براہ کرم دوبارہ کوشش کریں'
            : 'Could not connect to server. Please try again.'
        );
      } finally {
        setIsSubmitting(false);
      }
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
          <div className="absolute -top-12 -right-10 w-44 h-44 rounded-full bg-amber-400/20 blur-2xl animate-pulse" />
          <div
            className={`absolute bottom-10 -left-12 w-52 h-52 rounded-full blur-3xl animate-pulse ${
              isBlue ? 'bg-blue-500/25' : 'bg-emerald-500/25'
            }`}
          />
        </div>

        {/* Top Brand Hero Banner */}
        <div
          className={`relative z-10 px-5 pt-5 pb-9 text-white backdrop-blur-[2px] transition-colors duration-300 ${
            isBlue
              ? 'bg-gradient-to-br from-blue-700/75 via-indigo-700/70 to-blue-900/75'
              : 'bg-gradient-to-br from-emerald-700/75 via-teal-700/70 to-emerald-900/75'
          }`}
        >
          <div className="flex items-center justify-between mb-3 gap-2">
            <span className="text-xs font-semibold text-white/85 tracking-wide truncate">
              Official Player Portal
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <PWAInstallButton language={language} />
            </div>
          </div>

          <div className="flex flex-col items-center text-center animate-fade-up">
            <div className="relative flex items-center justify-center mb-3">
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

        {/* Main Auth Card Content */}
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

            {/* Sign-Up Bonus Notice */}
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

            {/* Continue with Google Button */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleGoogleContinue}
                disabled={isGoogleSubmitting || isSubmitting}
                className="w-full min-h-[48px] py-2.5 px-4 rounded-xl bg-white hover:bg-slate-50 active:scale-[0.98] border border-slate-300 text-slate-800 font-bold text-sm shadow-sm hover:shadow transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-60"
              >
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                  />
                </svg>
                <span>
                  {isGoogleSubmitting
                    ? language === 'ur'
                      ? 'گوگل سے جڑ رہا ہے...'
                      : 'Connecting Google...'
                    : language === 'ur'
                    ? 'گوگل کے ساتھ جاری رکھیں (Continue with Google)'
                    : 'Continue with Google'}
                </span>
              </button>

              <div className="relative flex items-center justify-center">
                <div className="w-full border-t border-slate-300/80" />
                <span className="px-3 bg-white/90 text-[11px] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                  {language === 'ur' ? 'یا موبائل نمبر استعمال کریں' : 'Or with mobile'}
                </span>
                <div className="w-full border-t border-slate-300/80" />
              </div>
            </div>

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
                        placeholder="03XXXXXXXXX"
                        className="w-full min-h-[46px] pl-10 pr-4 py-2.5 bg-white/95 border border-slate-300 rounded-xl text-sm font-mono uppercase text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Submit Action */}
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
