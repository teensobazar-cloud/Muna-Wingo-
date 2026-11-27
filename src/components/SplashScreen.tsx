import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, ShieldCheck, Zap } from 'lucide-react';

interface SplashScreenProps {
  onComplete: () => void;
  language: 'ur' | 'en';
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete, language }) => {
  const [progress, setProgress] = useState<number>(0);
  const [isFadingOut, setIsFadingOut] = useState<boolean>(false);
  const onCompleteRef = useRef(onComplete);
  const hasCompletedRef = useRef(false);

  // Keep latest reference without re-triggering effect
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Guaranteed single-run loading timer from 0% to 100%
  useEffect(() => {
    const startTime = Date.now();
    const duration = 2400; // 2.4s smooth load

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, Math.floor((elapsed / duration) * 100));
      setProgress(pct);

      if (pct >= 100 && !hasCompletedRef.current) {
        hasCompletedRef.current = true;
        clearInterval(interval);

        setTimeout(() => {
          setIsFadingOut(true);
          setTimeout(() => {
            onCompleteRef.current();
          }, 350);
        }, 200);
      }
    }, 25);

    return () => clearInterval(interval);
  }, []);

  const getStatusText = (pct: number) => {
    if (language === 'ur') {
      if (pct < 25) return 'گیم وسائل اور گرافکس لوڈ ہو رہے ہیں...';
      if (pct < 55) return 'لائیو لاٹری اور کلک سرور سنک ہو رہے ہیں...';
      if (pct < 85) return 'ایزی پیسہ و جیز کیش وائلٹ تصدیق...';
      return 'کامیابی! منا ونگو گیم شروع ہو رہی ہے...';
    } else {
      if (pct < 25) return 'Loading game graphics & high-res assets...';
      if (pct < 55) return 'Connecting to real-time lottery sync engine...';
      if (pct < 85) return 'Verifying EasyPaisa & JazzCash payout channels...';
      return 'Ready! Welcome to Muna WinGo...';
    }
  };

  const getActiveTab = (pct: number) => {
    if (pct < 33) return 0;
    if (pct < 68) return 1;
    return 2;
  };

  const activeTabIdx = getActiveTab(progress);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-slate-950 transition-opacity duration-400 ${
        isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Background Container with High-Res Poster Image */}
      <div className="relative w-full max-w-md h-full min-h-screen bg-slate-900 flex flex-col justify-between overflow-hidden shadow-2xl">
        {/* Poster Image */}
        <div className="absolute inset-0">
          <img
            src="/assets/aistudio/1794315787253_17b88589.jpg"
            alt="Muna WinGo Loading"
            className="w-full h-full object-cover object-center filter brightness-90 scale-102"
          />
          {/* Subtle gradient overlays for contrast and readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/45 to-black/35" />
          <div className="absolute top-0 inset-x-0 h-24 bg-gradient-to-b from-black/70 to-transparent" />
        </div>

        {/* Top Header Tag */}
        <div className="relative z-10 px-5 pt-6 flex items-center justify-center">
          <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-white text-xs font-bold shadow-lg">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-spin" />
            <span className="tracking-wide">MUNA WINGO LIVE</span>
          </div>
        </div>

        {/* Center Official Logo Emblem + Floating Animated Lottery Balls */}
        <div className="relative z-10 flex flex-col items-center justify-center space-y-4 px-6 text-center">
          {/* Official Muna WinGo Circular Emblem */}
          <div className="relative flex items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-amber-400/25 blur-xl animate-pulse" />
            <div className="relative w-32 h-32 sm:w-36 sm:h-36 rounded-full p-1 bg-gradient-to-br from-amber-300/80 via-white/70 to-emerald-400/80 shadow-2xl shadow-black/60 ring-4 ring-white/20">
              <img
                src="/muna-logo-512.png"
                alt="Muna WinGo Official Logo"
                className="w-full h-full object-contain rounded-full drop-shadow-lg"
              />
            </div>
          </div>

          <div className="flex items-center justify-center gap-3">
            {/* Green Ball 1 */}
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-emerald-400 via-emerald-600 to-emerald-800 text-white flex items-center justify-center font-digital font-black text-lg shadow-lg shadow-emerald-600/50 border-2 border-emerald-300 animate-bounce">
              1
            </div>
            {/* Violet Ball 0 */}
            <div
              className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-400 via-purple-600 to-indigo-900 text-white flex items-center justify-center font-digital font-black text-xl shadow-xl shadow-purple-600/60 border-2 border-purple-300 animate-bounce"
              style={{ animationDelay: '150ms' }}
            >
              0
            </div>
            {/* Red Ball 2 */}
            <div
              className="w-11 h-11 rounded-full bg-gradient-to-br from-rose-400 via-red-600 to-rose-800 text-white flex items-center justify-center font-digital font-black text-lg shadow-lg shadow-red-600/50 border-2 border-rose-300 animate-bounce"
              style={{ animationDelay: '300ms' }}
            >
              2
            </div>
          </div>

          <div className="bg-black/50 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/15 text-[11px] font-semibold text-amber-300 flex items-center gap-1.5 shadow-md">
            <Zap className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
            <span>{language === 'ur' ? '1 منٹ کلر اینڈ نمبر پرڈکشن لاٹری' : '1-Minute Color & Number Prediction Lottery'}</span>
          </div>
        </div>

        {/* Bottom Loading Progress Container with Animated Tabs */}
        <div className="relative z-10 p-6 space-y-3 pb-10">
          {/* Animated Tabs Indicator as requested */}
          <div className="grid grid-cols-3 gap-1.5 bg-black/60 backdrop-blur-md p-1.5 rounded-2xl border border-white/20 text-center">
            <div
              className={`py-1.5 px-1 rounded-xl text-[10px] font-bold transition-all duration-300 ${
                activeTabIdx === 0
                  ? 'bg-amber-500 text-white shadow-md scale-102'
                  : 'text-slate-400 bg-white/5'
              }`}
            >
              {language === 'ur' ? '1. وسائل لوڈ' : '1. Assets'}
            </div>
            <div
              className={`py-1.5 px-1 rounded-xl text-[10px] font-bold transition-all duration-300 ${
                activeTabIdx === 1
                  ? 'bg-emerald-500 text-white shadow-md scale-102'
                  : 'text-slate-400 bg-white/5'
              }`}
            >
              {language === 'ur' ? '2. لائیو سنک' : '2. Live Sync'}
            </div>
            <div
              className={`py-1.5 px-1 rounded-xl text-[10px] font-bold transition-all duration-300 ${
                activeTabIdx === 2
                  ? 'bg-rose-500 text-white shadow-md scale-102'
                  : 'text-slate-400 bg-white/5'
              }`}
            >
              {language === 'ur' ? '3. گیم ریڈی' : '3. Ready'}
            </div>
          </div>

          {/* Glassmorphic Card for Progress Bar */}
          <div className="bg-black/75 backdrop-blur-xl border border-white/25 rounded-3xl p-5 shadow-2xl space-y-3">
            {/* Status and Percentage Counter */}
            <div className="flex items-center justify-between text-white">
              <span className="text-xs font-medium text-slate-200">
                {getStatusText(progress)}
              </span>
              <span className="font-digital font-black text-3xl text-amber-400 tracking-wider">
                {progress}%
              </span>
            </div>

            {/* Glowing Smooth Progress Bar */}
            <div className="w-full h-3.5 bg-slate-900/90 rounded-full overflow-hidden p-0.5 border border-white/25 shadow-inner">
              <div
                className="h-full bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 rounded-full transition-all duration-100 relative overflow-hidden shadow-lg shadow-amber-500/30"
                style={{ width: `${progress}%` }}
              >
                {/* Shimmer animation */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent -translate-x-full animate-[shimmer_1.2s_infinite]" />
              </div>
            </div>

            {/* Bottom Subtitle */}
            <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-300 pt-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>
                {language === 'ur'
                  ? '100% محفوظ لاٹری انجن • فوری ایزی پیسہ و جیز کیش'
                  : '100% Secure WinGo • EasyPaisa & JazzCash'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
