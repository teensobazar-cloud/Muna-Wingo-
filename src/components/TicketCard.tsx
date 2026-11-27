import React from 'react';
import { BookOpen, Sparkles } from 'lucide-react';
import { Ball } from './Ball';
import { DrawResult, GameTimeOption, AppTheme } from '../types/game';

interface TicketCardProps {
  currentPeriod: string;
  secondsRemaining: number;
  recentResults: DrawResult[];
  onOpenRules: () => void;
  gameTime: GameTimeOption;
  onChangeGameTime: (time: GameTimeOption) => void;
  commitHash?: string;
  language: 'ur' | 'en';
  theme: AppTheme;
}

export const TicketCard: React.FC<TicketCardProps> = ({
  currentPeriod,
  secondsRemaining,
  recentResults,
  onOpenRules,
  gameTime,
  onChangeGameTime,
  language,
  theme
}) => {
  const isBlue = theme === 'blue';

  // Format seconds into MM:SS
  const mins = Math.floor(secondsRemaining / 60);
  const secs = secondsRemaining % 60;

  const minStr = String(mins).padStart(2, '0');
  const secStr = String(secs).padStart(2, '0');

  const minTens = minStr[0];
  const minOnes = minStr[1];
  const secTens = secStr[0];
  const secOnes = secStr[1];

  const recentFive = recentResults.slice(0, 5);

  return (
    <div className="w-full px-3 pt-3">
      {/* Game Speed Mode Tabs (30s, 1Min, 3Min, 5Min) */}
      <div className="flex items-center justify-between bg-white rounded-xl p-1 mb-2.5 shadow-xs border border-slate-200">
        {[
          { label: '30s', val: 30 },
          { label: '1Min', val: 60 },
          { label: '3Min', val: 180 },
          { label: '5Min', val: 300 }
        ].map((mode) => (
          <button
            key={mode.val}
            onClick={() => onChangeGameTime(mode.val as GameTimeOption)}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all text-center cursor-pointer ${
              gameTime === mode.val
                ? isBlue
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xs'
                  : 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            {mode.label}
          </button>
        ))}
      </div>

      {/* Main Ticket Coupon Card in Blue/Green Theme */}
      <div
        className={`relative overflow-hidden rounded-2xl text-white p-3.5 shadow-lg border transition-all duration-300 ${
          isBlue
            ? 'bg-gradient-to-br from-blue-600 via-indigo-600 to-blue-800 border-blue-400/30 shadow-blue-500/10'
            : 'bg-gradient-to-br from-emerald-600 via-teal-600 to-emerald-800 border-emerald-400/30 shadow-emerald-500/10'
        }`}
      >
        {/* Ticket perforated notches */}
        <div className="ticket-notch-left" />
        <div className="ticket-notch-right" />

        <div className="grid grid-cols-2 gap-3 items-center relative z-10">
          {/* Left Column: How to play, Mode name, 5 recent balls */}
          <div className="flex flex-col justify-between space-y-2 pr-2">
            {/* How to play button */}
            <button
              onClick={onOpenRules}
              className="inline-flex items-center gap-1.5 self-start px-2.5 py-1 bg-white/20 hover:bg-white/30 backdrop-blur-xs rounded-full text-[11px] font-medium tracking-wide transition-colors active:scale-95 cursor-pointer border border-white/25"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>{language === 'ur' ? 'طریقہ کار' : 'How to play'}</span>
            </button>

            {/* Mode Name with Mini Logo Emblem */}
            <div className="flex items-center gap-1.5">
              <img
                src="/muna-logo-512.png"
                alt="Muna WinGo"
                className="w-5 h-5 rounded-full object-contain shadow-xs shrink-0"
              />
              <span className="text-xs sm:text-sm font-semibold italic tracking-wide text-white/95">
                {gameTime === 30
                  ? '30 seconds'
                  : gameTime === 60
                  ? 'WinGo 1 minute'
                  : gameTime === 180
                  ? 'WinGo 3 minute'
                  : 'WinGo 5 minute'}
              </span>
              <Sparkles className="w-3 h-3 text-amber-200 animate-spin" style={{ animationDuration: '4s' }} />
            </div>

            {/* 5 Recent Drawn Balls */}
            <div className="flex items-center gap-1.5 pt-0.5">
              {recentFive.map((res, i) => (
                <Ball key={`${res.period}-${i}-${res.timestamp || i}`} number={res.number} size="sm" />
              ))}
            </div>
          </div>

          {/* Dotted Vertical Divider */}
          <div className="absolute left-1/2 top-2 bottom-2 w-0 border-r-2 border-dashed border-white/30 -translate-x-1/2 pointer-events-none" />

          {/* Right Column: Time Remaining & Countdown Digital Cards */}
          <div className="flex flex-col items-end justify-between space-y-1.5 pl-2">
            <span className="text-xs font-serif italic text-white/90">
              {language === 'ur' ? 'باقی وقت' : 'Time remaining'}
            </span>

            {/* Digital Cards: [0] [0] : [5] [4] */}
            <div className="flex items-center gap-1">
              {/* Minutes Tens & Ones */}
              <div className="w-6 h-8 bg-white rounded-md flex items-center justify-center shadow-md border border-slate-200">
                <span
                  className={`font-black text-lg font-digital leading-none ${
                    isBlue ? 'text-blue-700' : 'text-emerald-700'
                  }`}
                >
                  {minTens}
                </span>
              </div>
              <div className="w-6 h-8 bg-white rounded-md flex items-center justify-center shadow-md border border-slate-200">
                <span
                  className={`font-black text-lg font-digital leading-none ${
                    isBlue ? 'text-blue-700' : 'text-emerald-700'
                  }`}
                >
                  {minOnes}
                </span>
              </div>

              <span className="text-white font-black text-base px-0.5 animate-pulse">:</span>

              {/* Seconds Tens & Ones */}
              <div
                className={`w-6 h-8 bg-white rounded-md flex items-center justify-center shadow-md border border-slate-200 ${
                  secondsRemaining <= 5 ? 'ring-2 ring-yellow-300 animate-bounce' : ''
                }`}
              >
                <span
                  className={`font-black text-lg font-digital leading-none ${
                    isBlue ? 'text-blue-700' : 'text-emerald-700'
                  }`}
                >
                  {secTens}
                </span>
              </div>
              <div
                className={`w-6 h-8 bg-white rounded-md flex items-center justify-center shadow-md border border-slate-200 ${
                  secondsRemaining <= 5 ? 'ring-2 ring-yellow-300 animate-bounce' : ''
                }`}
              >
                <span
                  className={`font-black text-lg font-digital leading-none ${
                    isBlue ? 'text-blue-700' : 'text-emerald-700'
                  }`}
                >
                  {secOnes}
                </span>
              </div>
            </div>

            {/* Period Number */}
            <div className="flex flex-col items-end pt-0.5">
              <div className="text-[11px] sm:text-xs font-bold text-white/95 font-digital tracking-wider">
                {currentPeriod}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
