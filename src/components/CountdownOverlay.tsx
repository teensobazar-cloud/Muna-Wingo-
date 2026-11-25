import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock } from 'lucide-react';
import { AppTheme } from '../types/game';

interface CountdownOverlayProps {
  secondsRemaining: number;
  currentPeriod: string;
  language: 'ur' | 'en';
  theme: AppTheme;
}

export const CountdownOverlay: React.FC<CountdownOverlayProps> = ({
  secondsRemaining,
  currentPeriod,
  language,
  theme
}) => {
  if (secondsRemaining > 5) return null;

  const isBlue = theme === 'blue';

  return (
    <div className="absolute inset-0 z-40 bg-black/75 backdrop-blur-xs rounded-2xl flex flex-col items-center justify-center p-4 text-white text-center select-none pointer-events-auto">
      {/* Lock icon */}
      <div
        className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold mb-3 shadow-md animate-pulse ${
          isBlue ? 'bg-blue-600/90' : 'bg-emerald-600/90'
        }`}
      >
        <Lock className="w-3.5 h-3.5" />
        <span>{language === 'ur' ? 'بیٹنگ بند ہے - قرعہ اندازی جاری' : 'Betting Locked - Drawing...'}</span>
      </div>

      {/* Giant animated number 5, 4, 3, 2, 1 */}
      <AnimatePresence mode="wait">
        <motion.div
          key={secondsRemaining}
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 1.4, opacity: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="relative my-2"
        >
          <div
            className={`w-24 h-24 sm:w-28 sm:h-28 rounded-full flex items-center justify-center shadow-2xl border-4 border-white/60 ${
              isBlue
                ? 'bg-gradient-to-tr from-blue-600 to-indigo-500'
                : 'bg-gradient-to-tr from-emerald-600 to-teal-500'
            }`}
          >
            <span className="text-5xl sm:text-6xl font-black font-digital text-white drop-shadow-lg">
              {secondsRemaining === 0 ? 'GO!' : secondsRemaining}
            </span>
          </div>
        </motion.div>
      </AnimatePresence>

      <div className="mt-3 text-xs text-slate-300 font-mono">
        {language === 'ur' ? 'پیریڈ نمبر:' : 'Drawing Period:'} <strong className="text-white">{currentPeriod}</strong>
      </div>
    </div>
  );
};
