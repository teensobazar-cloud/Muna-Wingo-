import React, { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { X, Check } from 'lucide-react';
import { DrawResult, UserBet, GameTimeOption } from '../types/game';
import { soundManager } from '../utils/audio';

interface ResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: DrawResult | null;
  roundBets: UserBet[];
  totalReturn: number; // e.g. 19 PKR
  totalProfit: number; // e.g. 9 PKR
  totalBetAmount: number; // e.g. 10 PKR
  isWinner: boolean;
  hasBet: boolean;
  gameTime?: GameTimeOption;
  language: 'ur' | 'en';
}

export const WinModal: React.FC<ResultModalProps> = ({
  isOpen,
  onClose,
  result,
  roundBets,
  totalReturn,
  totalProfit,
  totalBetAmount,
  isWinner,
  hasBet,
  gameTime = 60,
  language
}) => {
  const [autoCloseSeconds, setAutoCloseSeconds] = useState<number>(3);
  const onCloseRef = React.useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Auto-close in exactly 3 seconds and sound triggers
  useEffect(() => {
    if (!isOpen) return;

    setAutoCloseSeconds(3);

    if (hasBet) {
      if (isWinner) {
        soundManager.playWin();
        try {
          confetti({
            particleCount: 90,
            spread: 75,
            origin: { y: 0.55 }
          });
        } catch {
          // ignore
        }
      } else {
        soundManager.playLose();
      }
    }

    // Hard 3-second auto close timer that NEVER resets on parent re-renders
    const closeTimer = setTimeout(() => {
      onCloseRef.current();
    }, 3000);

    // 1-second visual countdown updater (3 -> 2 -> 1)
    const countdownInterval = setInterval(() => {
      setAutoCloseSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => {
      clearTimeout(closeTimer);
      clearInterval(countdownInterval);
    };
  }, [isOpen]);

  if (!isOpen || !result) return null;

  const gameTimeLabel =
    gameTime === 30
      ? '30 Sec'
      : gameTime === 60
      ? '1 Min'
      : gameTime === 180
      ? '3 Min'
      : '5 Min';

  // Primary color name for result
  const mainColorName = result.colors.includes('green')
    ? 'Green'
    : result.colors.includes('violet')
    ? 'Violet'
    : 'Red';

  const mainColorBg =
    mainColorName === 'Green'
      ? 'bg-[#18b660]'
      : mainColorName === 'Violet'
      ? 'bg-[#9c27b0]'
      : 'bg-[#ea384c]';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-xs sm:max-w-sm flex flex-col items-center">
        {/* Main Popup Card matching screenshot */}
        <div
          className={`w-full relative rounded-[32px] pt-14 pb-5 px-4 shadow-2xl text-center overflow-visible border ${
            isWinner
              ? 'bg-gradient-to-b from-[#ff6036] via-[#f94638] to-[#ea2f38] border-amber-300/40 text-white'
              : 'bg-gradient-to-b from-[#5c1c24] via-[#431218] to-[#26080d] border-rose-500/30 text-white'
          }`}
        >
          {/* Top Floating Golden Ribbon & Trophy Crest */}
          <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-64 pointer-events-none flex flex-col items-center">
            {/* Confetti sprinkles around the crest */}
            <div className="absolute inset-0 flex justify-center items-center pointer-events-none">
              <span className="absolute -top-2 left-6 w-2 h-3 bg-yellow-300 rotate-12 rounded-xs animate-bounce" />
              <span className="absolute top-1 right-8 w-2.5 h-2 bg-emerald-400 -rotate-45 rounded-xs" />
              <span className="absolute -top-4 right-14 w-2 h-3 bg-blue-400 rotate-45 rounded-xs" />
              <span className="absolute top-6 left-2 w-3 h-2 bg-purple-400 rotate-12 rounded-xs" />
              <span className="absolute top-10 right-2 w-2 h-2.5 bg-rose-400 rotate-45 rounded-xs" />
            </div>

            {/* Golden Medal with Wings */}
            <div className="relative flex items-center justify-center">
              {/* Left Wing */}
              <div className="w-12 h-10 bg-gradient-to-l from-amber-400 via-yellow-300 to-amber-500 rounded-l-full shadow-md transform -rotate-12 -mr-3 border-t border-b border-amber-200" />

              {/* Central Golden Rocket/Shield Medal */}
              <div className="w-20 h-20 rounded-full bg-gradient-to-b from-yellow-200 via-amber-400 to-amber-600 p-1.5 shadow-xl relative z-10 flex items-center justify-center border-2 border-yellow-100">
                <div className="w-full h-full rounded-full bg-gradient-to-b from-amber-300 to-amber-500 flex items-center justify-center shadow-inner border border-amber-200">
                  {isWinner ? (
                    /* Rocket / Trophy Icon */
                    <svg
                      viewBox="0 0 24 24"
                      className="w-10 h-10 text-white drop-shadow-md"
                      fill="currentColor"
                    >
                      <path d="M12 2.5s-4.5 4.5-4.5 10c0 2.5 1.5 4.5 4.5 4.5s4.5-2 4.5-4.5c0-5.5-4.5-10-4.5-10zm-1.5 8a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm-4.7 6.2c-.5.3-1.3.8-1.8 1.8 1.2.3 2.7.2 3.8-.5-.8-.5-1.5-.9-2-1.3zm12.4 0c-.5.4-1.2.8-2 1.3 1.1.7 2.6.8 3.8.5-.5-1-1.3-1.5-1.8-1.8z" />
                    </svg>
                  ) : (
                    /* Sad retry heart / medal */
                    <span className="text-3xl">💔</span>
                  )}
                </div>
              </div>

              {/* Right Wing */}
              <div className="w-12 h-10 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 rounded-r-full shadow-md transform rotate-12 -ml-3 border-t border-b border-amber-200" />
            </div>

            {/* Golden Ribbon Banner underneath the medal */}
            <div className="w-48 h-6 -mt-3 bg-gradient-to-r from-amber-500 via-yellow-300 to-amber-500 rounded-full shadow-md flex items-center justify-center border border-yellow-200">
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-950 font-sans">
                {isWinner ? '★ WINNER ★' : '★ GAME OVER ★'}
              </span>
            </div>
          </div>

          {/* Header Title: "\ Congratulations" matching screenshot */}
          <div className="pt-2">
            <h2 className="text-2xl sm:text-3xl font-black italic tracking-tight font-serif drop-shadow-sm flex items-center justify-center gap-1">
              <span className="text-white/80 font-mono text-xl">\</span>
              <span>{isWinner ? 'Congratulations' : 'Sorry / ہار گئے'}</span>
            </h2>
            {language === 'ur' && (
              <p className="text-xs font-bold text-amber-200 mt-0.5 font-urdu">
                {isWinner ? 'مبارک ہو! آپ جیت گئے ہیں' : 'معذرت! آپ ہار گئے ہیں، دوبارہ کوشش کریں'}
              </p>
            )}
          </div>

          {/* Lottery Results Row: "Lottery results [Green] [9] [Big]" */}
          <div className="flex items-center justify-center gap-1.5 mt-3 mb-4 text-xs font-bold">
            <span className="text-white/95 text-[11px] sm:text-xs">
              {language === 'ur' ? 'لاٹری نتیجہ' : 'Lottery results'}
            </span>
            <span
              className={`px-2 py-0.5 rounded-md text-white text-[11px] shadow-xs ${mainColorBg}`}
            >
              {mainColorName}
            </span>
            <span
              className={`px-2 py-0.5 rounded-md text-white text-[11px] shadow-xs ${mainColorBg}`}
            >
              {result.number}
            </span>
            <span
              className={`px-2 py-0.5 rounded-md text-white text-[11px] shadow-xs ${
                result.bigSmall === 'Big' ? 'bg-[#18b660]' : 'bg-[#2563eb]'
              }`}
            >
              {result.bigSmall}
            </span>
          </div>

          {/* Recessed Slot Cutout for ATM Ticket Dispenser */}
          <div className="mx-4 h-3 bg-black/40 rounded-full shadow-inner border border-black/30 relative z-10" />

          {/* White Paper Receipt / Ticket Emerging from the slot */}
          <div className="mx-6 -mt-1.5 bg-white rounded-b-2xl shadow-xl px-4 pt-3 pb-3.5 text-center text-slate-800 relative z-20 border-t-2 border-slate-100">
            {/* Soft Paper wave/notch at bottom */}
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              {language === 'ur' ? 'انعام و منافع (Bonus)' : 'Bonus'}
            </div>

            {/* Big Bold Prize Amount in Pink/Red matching screenshot: "Rs196,000.00" */}
            <div className="text-2xl sm:text-3xl font-black font-digital text-[#f93c52] tracking-tight my-0.5">
              {isWinner
                ? `Rs${totalReturn.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}`
                : 'Rs0.00'}
            </div>

            {/* Profit breakdown for transparency */}
            {isWinner && totalProfit > 0 && (
              <div className="text-[10px] font-bold text-emerald-600 bg-emerald-50 rounded-full py-0.5 px-2 inline-block mb-1 border border-emerald-200">
                {language === 'ur'
                  ? `خالص منافع: +Rs ${totalProfit.toLocaleString()}`
                  : `Net Profit: +Rs ${totalProfit.toLocaleString()}`}
              </div>
            )}

            {/* Period Details */}
            <div className="text-[11px] font-medium text-slate-500 mt-1 leading-tight font-sans">
              <div>Period: WinGo {gameTimeLabel}</div>
              <div className="font-digital tracking-wide text-slate-700 font-bold">
                {result.period}
              </div>
            </div>

            {/* If lost, motivational retry line */}
            {!isWinner && (
              <div className="text-[11px] font-bold text-rose-600 mt-1">
                {language === 'ur'
                  ? 'آپ ہار گئے ہیں، اگلی بار آزمائیں!'
                  : 'You lost this round, try again!'}
              </div>
            )}
          </div>

          {/* Auto Close Checkbox status matching screenshot */}
          <div className="mt-4 flex items-center justify-center gap-1.5 text-white/90 text-xs font-medium">
            <div className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center border border-white/40">
              <Check className="w-3 h-3 text-white" strokeWidth={3} />
            </div>
            <span>
              {language === 'ur'
                ? `${autoCloseSeconds} سیکنڈ میں خود بخود بند ہو جائے گا`
                : `${autoCloseSeconds} seconds auto close`}
            </span>
          </div>
        </div>

        {/* Circular (X) Close Button Below the Card matching screenshot */}
        <button
          onClick={onClose}
          className="mt-4 w-9 h-9 rounded-full border-2 border-white/80 bg-white/10 hover:bg-white/25 active:scale-90 flex items-center justify-center text-white transition-all cursor-pointer shadow-lg"
          aria-label="Close"
        >
          <X className="w-5 h-5" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
};
