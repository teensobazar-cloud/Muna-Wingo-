import React, { useState } from 'react';
import { DrawResult, UserBet, AppTheme } from '../types/game';
import { ColorDot } from './Ball';

interface HistorySectionProps {
  gameHistory: DrawResult[];
  userBets: UserBet[];
  language: 'ur' | 'en';
  theme: AppTheme;
}

export const HistorySection: React.FC<HistorySectionProps> = ({
  gameHistory,
  userBets,
  language,
  theme
}) => {
  const isBlue = theme === 'blue';
  const [activeTab, setActiveTab] = useState<'game' | 'chart' | 'my'>('game');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 10;

  // Pagination for Game History
  const totalPages = Math.ceil(gameHistory.length / itemsPerPage);
  const displayedHistory = gameHistory.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Statistics calculation for Chart tab
  const totalRounds = gameHistory.length;
  const redCount = gameHistory.filter((r) => r.colors.includes('red')).length;
  const greenCount = gameHistory.filter((r) => r.colors.includes('green')).length;
  const violetCount = gameHistory.filter((r) => r.colors.includes('violet')).length;
  const bigCount = gameHistory.filter((r) => r.bigSmall === 'Big').length;
  const smallCount = gameHistory.filter((r) => r.bigSmall === 'Small').length;

  return (
    <div className="w-full px-3 py-3">
      {/* 3 Tabs Header matching screenshot */}
      <div className="flex items-center justify-between bg-white rounded-2xl p-1 shadow-xs border border-slate-200 mb-3">
        {/* Game history */}
        <button
          onClick={() => setActiveTab('game')}
          className={`flex-1 py-2.5 text-xs sm:text-sm font-serif italic font-bold rounded-xl transition-all cursor-pointer ${
            activeTab === 'game'
              ? isBlue
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          {language === 'ur' ? 'گیم ہسٹری' : 'Game history'}
        </button>

        {/* Chart */}
        <button
          onClick={() => setActiveTab('chart')}
          className={`flex-1 py-2.5 text-xs sm:text-sm font-serif italic font-bold rounded-xl transition-all cursor-pointer ${
            activeTab === 'chart'
              ? isBlue
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          {language === 'ur' ? 'ٹرینڈ چارٹ' : 'Chart'}
        </button>

        {/* My history */}
        <button
          onClick={() => setActiveTab('my')}
          className={`flex-1 py-2.5 text-xs sm:text-sm font-serif italic font-bold rounded-xl transition-all cursor-pointer ${
            activeTab === 'my'
              ? isBlue
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          {language === 'ur' ? 'میری ہسٹری' : 'My history'}
        </button>
      </div>

      {/* Tab 1: Game History Table */}
      {activeTab === 'game' && (
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
          {/* Table Header Row with Blue/Green background */}
          <div
            className={`grid grid-cols-4 ${
              isBlue ? 'bg-blue-600' : 'bg-emerald-600'
            } text-white text-xs font-serif italic font-bold py-2.5 px-3 text-center`}
          >
            <span>{language === 'ur' ? 'پیریڈ' : 'Period'}</span>
            <span>{language === 'ur' ? 'نمبر' : 'Number'}</span>
            <span>{language === 'ur' ? 'بڑا / چھوٹا' : 'Big Small'}</span>
            <span>{language === 'ur' ? 'رنگ' : 'Color'}</span>
          </div>

          {/* Table Body Rows */}
          <div className="divide-y divide-slate-100">
            {displayedHistory.map((item, idx) => {
              // Color of number
              let numColor = 'text-[#ea384c]';
              if (item.number === 0 || item.number === 5) {
                numColor = 'text-purple-600';
              } else if (item.colors.includes('green')) {
                numColor = 'text-[#18b660]';
              }

              return (
                <div
                  key={`${item.period}-${idx}-${item.timestamp || idx}`}
                  className="grid grid-cols-4 py-3 px-3 text-center items-center text-xs font-serif italic hover:bg-slate-50/80 transition-colors"
                >
                  {/* Period */}
                  <span className="font-sans font-medium text-slate-700 tracking-tight">
                    {item.period}
                  </span>

                  {/* Number */}
                  <span className={`text-base font-black font-sans ${numColor}`}>
                    {item.number}
                  </span>

                  {/* Big Small */}
                  <span className="text-slate-700 font-semibold">
                    {item.bigSmall}
                  </span>

                  {/* Color dots */}
                  <div className="flex justify-center items-center">
                    <ColorDot color={item.colors} size="sm" />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination controls */}
          <div className="flex items-center justify-between p-3 bg-slate-50 border-t border-slate-100 text-xs text-slate-600">
            <span>
              {language === 'ur'
                ? `صفحہ ${currentPage} از ${totalPages || 1}`
                : `Page ${currentPage} of ${totalPages || 1}`}
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="px-2.5 py-1 rounded bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {language === 'ur' ? 'پچھلا' : 'Prev'}
              </button>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="px-2.5 py-1 rounded bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {language === 'ur' ? 'اگلا' : 'Next'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Chart & Statistics */}
      {activeTab === 'chart' && (
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-4 space-y-4">
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            {language === 'ur' ? 'جیتنے والے نمبرز کا رجحان (Recent Trend)' : 'Recent Number Trends'}
          </h4>

          {/* Number sequence trend visualization */}
          <div className="overflow-x-auto pb-2">
            <div className="min-w-[320px] flex items-center justify-between gap-1 border-b border-slate-200 pb-3">
              {gameHistory.slice(0, 10).reverse().map((r, i) => (
                <div key={`${r.period}-${i}-${r.timestamp || i}`} className="flex flex-col items-center gap-1">
                  <span className="text-[10px] text-slate-400 font-mono">
                    {r.period.slice(-3)}
                  </span>
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs text-white shadow-xs ${
                      r.colors.includes('green') ? 'bg-[#18b660]' : 'bg-[#ea384c]'
                    }`}
                  >
                    {r.number}
                  </div>
                  <span className="text-[10px] text-slate-500 font-medium">
                    {r.bigSmall[0]}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Statistics Bars */}
          <div className="space-y-2 pt-1 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-600 font-medium">{language === 'ur' ? 'سرخ (Red)' : 'Red'}</span>
              <span className="font-bold text-[#ea384c]">
                {redCount} ({totalRounds ? Math.round((redCount / totalRounds) * 100) : 0}%)
              </span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#ea384c]"
                style={{ width: `${totalRounds ? (redCount / totalRounds) * 100 : 0}%` }}
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-slate-600 font-medium">{language === 'ur' ? 'سبز (Green)' : 'Green'}</span>
              <span className="font-bold text-[#18b660]">
                {greenCount} ({totalRounds ? Math.round((greenCount / totalRounds) * 100) : 0}%)
              </span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#18b660]"
                style={{ width: `${totalRounds ? (greenCount / totalRounds) * 100 : 0}%` }}
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-slate-600 font-medium">{language === 'ur' ? 'جامنی (Violet)' : 'Violet'}</span>
              <span className="font-bold text-[#9c27b0]">
                {violetCount} ({totalRounds ? Math.round((violetCount / totalRounds) * 100) : 0}%)
              </span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#9c27b0]"
                style={{ width: `${totalRounds ? (violetCount / totalRounds) * 100 : 0}%` }}
              />
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <div className="p-2 bg-amber-50 rounded-xl border border-amber-200 text-center">
                <span className="block text-slate-600 text-[11px]">{language === 'ur' ? 'بڑا (Big)' : 'Big'}</span>
                <span className="font-bold text-amber-700 text-sm">
                  {totalRounds ? Math.round((bigCount / totalRounds) * 100) : 0}%
                </span>
              </div>
              <div className="p-2 bg-blue-50 rounded-xl border border-blue-200 text-center">
                <span className="block text-slate-600 text-[11px]">{language === 'ur' ? 'چھوٹا (Small)' : 'Small'}</span>
                <span className="font-bold text-blue-700 text-sm">
                  {totalRounds ? Math.round((smallCount / totalRounds) * 100) : 0}%
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: My History */}
      {activeTab === 'my' && (
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-3">
          {userBets.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs">
              {language === 'ur'
                ? 'ابھی تک کوئی بیٹ نہیں لگائی گئی۔ اوپر رنگ یا نمبر منتخب کریں!'
                : 'No bets placed yet. Pick a color or number above to win!'}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 space-y-2">
              {userBets.map((bet, idx) => (
                <div key={`${bet.id}-${idx}`} className="pt-2 pb-2 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-slate-800">
                      {language === 'ur' ? 'پیریڈ:' : 'Period:'} {bet.period}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        bet.status === 'won'
                          ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                          : bet.status === 'lost'
                          ? 'bg-rose-100 text-rose-700 border border-rose-300'
                          : 'bg-amber-100 text-amber-700 border border-amber-300 animate-pulse'
                      }`}
                    >
                      {bet.status === 'won'
                        ? language === 'ur'
                          ? `جیت گئے +Rs ${bet.winAmount}`
                          : `Won +Rs ${bet.winAmount}`
                        : bet.status === 'lost'
                        ? language === 'ur'
                          ? 'ہار گئے'
                          : 'Lost'
                        : language === 'ur'
                        ? 'نتیجہ کا انتظار...'
                        : 'Pending...'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-slate-600 text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className="capitalize font-semibold text-slate-800">
                        {String(bet.selection)}
                      </span>
                      <span>·</span>
                      <span>
                        {language === 'ur' ? 'لگائی گئی رقم:' : 'Bet:'} Rs {bet.totalAmount}
                      </span>
                    </div>
                    <span className="text-slate-400">
                      {new Date(bet.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
