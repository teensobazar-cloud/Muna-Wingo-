import React from 'react';
import {
  Sliders,
  DollarSign,
  ArrowDownLeft,
  ArrowUpRight,
  Eye,
  LogOut,
  Sparkles
} from 'lucide-react';
import { soundManager } from '../utils/audio';

import { ForcedOutcomeSpec } from '../types/game';

interface WordPressAdminBarProps {
  isAdmin: boolean;
  onOpenDashboard: () => void;
  pendingDepositsCount: number;
  pendingWithdrawsCount: number;
  balance: number;
  forcedNumber: number | null;
  forcedOutcome?: ForcedOutcomeSpec | null;
  onLogout: () => void;
  onTogglePlayerView: () => void;
  language: 'ur' | 'en';
}

export const WordPressAdminBar: React.FC<WordPressAdminBarProps> = ({
  isAdmin,
  onOpenDashboard,
  pendingDepositsCount,
  pendingWithdrawsCount,
  balance,
  forcedNumber,
  forcedOutcome,
  onLogout,
  onTogglePlayerView,
  language
}) => {
  if (!isAdmin) return null;

  const forcedLabel = forcedOutcome
    ? forcedOutcome.kind === 'number'
      ? `[${forcedOutcome.number}]`
      : forcedOutcome.kind === 'bigSmall'
      ? forcedOutcome.bigSmall === 'Big'
        ? 'BIG (5-9)'
        : 'SMALL (0-4)'
      : String(forcedOutcome.color || '').toUpperCase()
    : forcedNumber !== null
    ? `[${forcedNumber}]`
    : null;

  return (
    <div className="w-full bg-[#1d2327] text-[#f0f0f1] text-[11px] font-sans border-b border-[#2c3338] z-40 sticky top-0 flex items-center justify-between px-3 py-1 shadow-md select-none">
      {/* Left items: WP Icon + Site Name + Quick Admin Links */}
      <div className="flex items-center gap-3 overflow-x-auto scrollbar-none">
        {/* WordPress Emblem */}
        <button
          onClick={() => {
            soundManager.playClick();
            onOpenDashboard();
          }}
          className="flex items-center gap-1.5 hover:text-[#72aee6] text-white font-bold transition-colors cursor-pointer"
          title="Open WordPress Admin Dashboard"
        >
          <div className="w-5 h-5 rounded-full bg-white text-[#1d2327] flex items-center justify-center font-black text-xs font-serif shadow-xs">
            W
          </div>
          <span className="font-semibold hidden sm:inline">Muna WinGo</span>
          <span className="bg-[#2271b1] text-white text-[9px] px-1.5 py-0.2 rounded font-mono font-bold">
            WP-ADMIN
          </span>
        </button>

        {/* Dashboard button */}
        <button
          onClick={() => {
            soundManager.playClick();
            onOpenDashboard();
          }}
          className="flex items-center gap-1 hover:text-[#72aee6] text-slate-300 transition-colors cursor-pointer px-1.5 py-0.5 rounded hover:bg-[#2c3338]"
        >
          <Sliders className="w-3 h-3 text-[#72aee6]" />
          <span>{language === 'ur' ? 'کنٹرول پینل' : 'Dashboard'}</span>
        </button>

        {/* Forced Outcome quick badge */}
        <button
          onClick={() => {
            soundManager.playClick();
            onOpenDashboard();
          }}
          className="flex items-center gap-1 text-slate-300 hover:text-[#72aee6] cursor-pointer px-1.5 py-0.5 rounded hover:bg-[#2c3338]"
        >
          <Sparkles className="w-3 h-3 text-amber-400" />
          <span>
            {forcedLabel ? (
              <span className="text-amber-400 font-bold">Locked: {forcedLabel}</span>
            ) : (
              <span>Outcomes: Auto</span>
            )}
          </span>
        </button>

        {/* Pending Deposits badge */}
        <button
          onClick={() => {
            soundManager.playClick();
            onOpenDashboard();
          }}
          className="flex items-center gap-1 hover:text-[#72aee6] text-slate-300 cursor-pointer px-1.5 py-0.5 rounded hover:bg-[#2c3338]"
        >
          <ArrowDownLeft className="w-3 h-3 text-emerald-400" />
          <span>Dep:</span>
          <span
            className={`px-1 rounded-full text-[9px] font-bold ${
              pendingDepositsCount > 0
                ? 'bg-[#d63638] text-white animate-pulse'
                : 'bg-[#2c3338] text-slate-400'
            }`}
          >
            {pendingDepositsCount}
          </span>
        </button>

        {/* Pending Withdrawals badge */}
        <button
          onClick={() => {
            soundManager.playClick();
            onOpenDashboard();
          }}
          className="flex items-center gap-1 hover:text-[#72aee6] text-slate-300 cursor-pointer px-1.5 py-0.5 rounded hover:bg-[#2c3338]"
        >
          <ArrowUpRight className="w-3 h-3 text-orange-400" />
          <span>Withdrawal:</span>
          <span
            className={`px-1 rounded-full text-[9px] font-bold ${
              pendingWithdrawsCount > 0
                ? 'bg-[#d63638] text-white animate-pulse'
                : 'bg-[#2c3338] text-slate-400'
            }`}
          >
            {pendingWithdrawsCount}
          </span>
        </button>

        {/* Live Balance indicator */}
        <div className="hidden md:flex items-center gap-1 text-slate-400 font-mono">
          <DollarSign className="w-3 h-3 text-emerald-400" />
          <span>Rs {balance.toLocaleString()}</span>
        </div>
      </div>

      {/* Right items: View As Player & Logout */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onTogglePlayerView}
          className="flex items-center gap-1 px-2 py-0.5 bg-[#2c3338] hover:bg-[#3c434a] text-slate-300 rounded text-[10px] font-medium transition-colors cursor-pointer"
          title="Toggle view as player"
        >
          <Eye className="w-3 h-3" />
          <span className="hidden sm:inline">
            {language === 'ur' ? 'یوزر منظر' : 'Player View'}
          </span>
        </button>

        <button
          onClick={onLogout}
          className="flex items-center gap-1 px-2 py-0.5 bg-[#d63638]/20 hover:bg-[#d63638] text-red-300 hover:text-white rounded text-[10px] font-medium transition-colors cursor-pointer"
          title="Exit Admin Mode"
        >
          <LogOut className="w-3 h-3" />
          <span className="hidden sm:inline">
            {language === 'ur' ? 'لاگ آؤٹ' : 'Log Out'}
          </span>
        </button>
      </div>
    </div>
  );
};
