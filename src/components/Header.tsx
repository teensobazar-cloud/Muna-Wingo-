import React from 'react';
import {
  Headphones,
  Volume2,
  VolumeX,
  RotateCw,
  ArrowDownCircle,
  ArrowUpCircle,
  HelpCircle,
  Palette,
  Share2,
  LogOut,
  History
} from 'lucide-react';
import { soundManager } from '../utils/audio';
import { AppTheme } from '../types/game';
import { PWAInstallButton } from './PWAInstallButton';

interface HeaderProps {
  balance: number;
  theme: AppTheme;
  onToggleTheme: () => void;
  onOpenDeposit: () => void;
  onOpenDepositHistory?: () => void;
  onOpenWithdraw: () => void;
  onOpenWithdrawHistory?: () => void;
  pendingDepositCount?: number;
  pendingWithdrawCount?: number;
  onOpenRules: () => void;
  onRefreshBalance: () => void;
  language: 'ur' | 'en';
  muted: boolean;
  onToggleMute: () => void;
  onOpenInvite: () => void;
  onOpenAdmin: () => void;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  balance,
  theme,
  onToggleTheme,
  onOpenDeposit,
  onOpenDepositHistory,
  onOpenWithdraw,
  onOpenWithdrawHistory,
  pendingDepositCount = 0,
  pendingWithdrawCount = 0,
  onOpenRules,
  onRefreshBalance,
  language,
  muted,
  onToggleMute,
  onOpenInvite,
  onOpenAdmin,
  onLogout
}) => {
  const isBlue = theme === 'blue';
  const [logoTapCount, setLogoTapCount] = React.useState<number>(0);
  const lastTapTimeRef = React.useRef<number>(0);

  const handleLogoTap = () => {
    soundManager.playClick();
    const now = Date.now();
    if (now - lastTapTimeRef.current > 3000) {
      setLogoTapCount(1);
    } else {
      const nextCount = logoTapCount + 1;
      setLogoTapCount(nextCount);
      if (nextCount >= 5) {
        setLogoTapCount(0);
        soundManager.playCash();
        onOpenAdmin();
        return;
      }
    }
    lastTapTimeRef.current = now;
  };

  return (
    <header
      className={`w-full text-white shadow-md select-none sticky top-0 z-30 transition-colors duration-300 ${
        isBlue
          ? 'bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800'
          : 'bg-gradient-to-r from-emerald-700 via-teal-700 to-emerald-800'
      }`}
    >
      {/* Top row - Back arrow removed, large circular logo */}
      <div className="flex items-center justify-between px-3.5 py-2.5">
        {/* Brand Logo: Circular Muna WinGo Emblem with 5-tap secret Admin trigger */}
        <div
          onClick={handleLogoTap}
          className="flex items-center gap-2 cursor-pointer active:scale-95 transition-transform shrink-0"
          title="Muna WinGo"
        >
          {/* Circular Logo Container */}
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full overflow-hidden bg-slate-900/20 shadow-xl border-2 border-white/80 flex items-center justify-center shrink-0 ring-2 ring-white/30 hover:ring-amber-300 transition-all">
            <img
              src="/muna-logo-512.png"
              alt="Muna WinGo Logo"
              className="w-full h-full object-contain rounded-full"
            />
          </div>

          <div className="flex flex-col text-left whitespace-nowrap min-w-0">
            <span className="font-sans font-black text-base sm:text-lg leading-none tracking-wider text-white drop-shadow-sm whitespace-nowrap uppercase">
              MUNA WINGO
            </span>
            <span className="text-[10px] sm:text-[11px] uppercase font-bold tracking-widest text-amber-200/95 font-sans whitespace-nowrap leading-tight mt-0.5">
              LIVE PREDICTION
            </span>
          </div>
        </div>

        {/* Right utility icons: Install PWA, Theme Color Switcher, Rules, Sound, Support */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          <PWAInstallButton language={language} compact />

          {/* Compact Theme Color Switcher Box */}
          <button
            onClick={() => {
              soundManager.playClick();
              onToggleTheme();
            }}
            className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 border border-white/25 flex items-center gap-1 cursor-pointer transition-all shrink-0"
            title={isBlue ? 'Switch to Green theme' : 'Switch to Blue theme'}
            aria-label="Toggle Theme Color"
          >
            <Palette className="w-3.5 h-3.5 text-white" />
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isBlue ? 'bg-emerald-400' : 'bg-blue-400'
              } ring-1 ring-white/60 shadow-xs`}
            />
          </button>

          {/* Speaker Sound Toggle */}
          <button
            onClick={onToggleMute}
            className="p-1 hover:bg-white/10 rounded-full transition-colors cursor-pointer"
            title={muted ? 'Unmute' : 'Mute'}
            aria-label="Toggle Sound"
          >
            {muted ? <VolumeX className="w-5 h-5 text-white/70" /> : <Volume2 className="w-5 h-5 text-white" />}
          </button>

          {/* Share / Invite Friends Button */}
          <button
            onClick={() => {
              soundManager.playClick();
              onOpenInvite();
            }}
            className="p-1 hover:bg-white/10 rounded-full transition-colors cursor-pointer text-white hover:text-amber-300"
            title="Invite Friends (Share)"
            aria-label="Invite Friends"
          >
            <Share2 className="w-5 h-5" />
          </button>

          <button
            onClick={onOpenRules}
            className="p-1 hover:bg-white/10 rounded-full transition-colors cursor-pointer"
            title="Rules"
            aria-label="Game Rules"
          >
            <HelpCircle className="w-5 h-5 text-white" />
          </button>

          <button
            onClick={onOpenRules}
            className="p-1 hover:bg-white/10 rounded-full transition-colors cursor-pointer"
            title="Customer Support"
            aria-label="Support"
          >
            <Headphones className="w-5 h-5 text-white" />
          </button>

          {onLogout && (
            <button
              onClick={() => {
                soundManager.playClick();
                onLogout();
              }}
              className="p-1 hover:bg-white/10 rounded-full transition-colors cursor-pointer text-white/85 hover:text-amber-300"
              title="Sign Out"
              aria-label="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Primary Wallet Bar with Deposit + Deposit History & Withdrawal + Withdrawal History */}
      <div
        className={`px-2.5 sm:px-3 py-2 border-t flex items-center justify-between gap-1.5 shadow-inner transition-colors duration-300 ${
          isBlue
            ? 'bg-[#122e70] border-blue-400/20'
            : 'bg-[#054641] border-emerald-400/20'
        }`}
      >
        {/* Balance Display */}
        <div className="flex items-center gap-1.5 bg-black/25 backdrop-blur-xs px-2.5 py-1.5 rounded-xl border border-white/10 min-w-0">
          <div className="flex flex-col min-w-0">
            <span className="text-[9px] sm:text-[10px] text-white/80 font-medium leading-tight">
              Total Balance
            </span>
            <div className="flex items-center gap-1">
              <span className="font-bold text-white text-sm sm:text-base tracking-tight font-digital truncate">
                Rs {balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <button
                onClick={() => {
                  soundManager.playClick();
                  onRefreshBalance();
                }}
                className="hover:rotate-180 transition-transform duration-300 text-white/70 hover:text-white cursor-pointer shrink-0"
                title="Refresh Balance"
                aria-label="Refresh Balance"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Action Buttons: [Deposit | History] & [Withdraw | History] */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="flex items-center rounded-xl shadow-md shadow-black/20 border border-green-300/40 overflow-hidden bg-gradient-to-r from-emerald-500 to-green-600">
            <button
              onClick={() => {
                soundManager.playClick();
                onOpenDeposit();
              }}
              className="flex items-center gap-1 px-2.5 py-2 hover:bg-white/10 active:scale-95 text-white font-bold text-xs transition-all cursor-pointer"
            >
              <ArrowDownCircle className="w-3.5 h-3.5 text-white shrink-0 animate-pulse" />
              <span>Deposit</span>
            </button>
            <button
              onClick={() => {
                soundManager.playClick();
                if (onOpenDepositHistory) onOpenDepositHistory();
                else onOpenDeposit();
              }}
              className="relative px-2 py-2 bg-black/20 hover:bg-black/35 border-l border-white/25 text-white transition-all cursor-pointer flex items-center justify-center"
              title="Deposit History (Pending / Approved)"
              aria-label="Deposit History"
            >
              <History className="w-3.5 h-3.5" />
              {pendingDepositCount > 0 && (
                <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-amber-300 ring-1 ring-slate-900 animate-pulse" />
              )}
            </button>
          </div>

          <div className="flex items-center rounded-xl shadow-md shadow-black/20 border border-amber-300/40 overflow-hidden bg-gradient-to-r from-amber-500 to-orange-600">
            <button
              onClick={() => {
                soundManager.playClick();
                onOpenWithdraw();
              }}
              className="flex items-center gap-1 px-2.5 py-2 hover:bg-white/10 active:scale-95 text-white font-bold text-xs transition-all cursor-pointer"
            >
              <ArrowUpCircle className="w-3.5 h-3.5 text-white shrink-0" />
              <span>Withdraw</span>
            </button>
            <button
              onClick={() => {
                soundManager.playClick();
                if (onOpenWithdrawHistory) onOpenWithdrawHistory();
                else onOpenWithdraw();
              }}
              className="relative px-2 py-2 bg-black/20 hover:bg-black/35 border-l border-white/25 text-white transition-all cursor-pointer flex items-center justify-center"
              title="Withdrawal History (Pending / Approved)"
              aria-label="Withdrawal History"
            >
              <History className="w-3.5 h-3.5" />
              {pendingWithdrawCount > 0 && (
                <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-white ring-1 ring-slate-900 animate-pulse" />
              )}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
