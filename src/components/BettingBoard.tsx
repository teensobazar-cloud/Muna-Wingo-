import React, { useState } from 'react';
import { Ball } from './Ball';
import { ColorType, BigSmallType, BetCategory, AppTheme } from '../types/game';
import { soundManager } from '../utils/audio';
import { Shuffle } from 'lucide-react';

interface BettingBoardProps {
  onSelectBet: (category: BetCategory, selection: string | number, multiplier: number) => void;
  selectedMultiplier: number;
  onSelectMultiplier: (multiplier: number) => void;
  isLocked: boolean;
  language: 'ur' | 'en';
  theme: AppTheme;
}

export const BettingBoard: React.FC<BettingBoardProps> = ({
  onSelectBet,
  selectedMultiplier,
  onSelectMultiplier,
  isLocked,
  language,
  theme
}) => {
  const isBlue = theme === 'blue';
  const multipliers = [1, 5, 10, 20, 50, 100];

  // Random scan state
  const [scanningNumber, setScanningNumber] = useState<number | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);

  const handlePick = (category: BetCategory, selection: string | number) => {
    if (isLocked || isScanning) return;
    soundManager.playClick();
    onSelectBet(category, selection, selectedMultiplier);
  };

  // Roulette scanning through 0-9 to pick any one number as requested
  const handleRandom = () => {
    if (isLocked || isScanning) return;
    setIsScanning(true);

    let currentStep = 0;
    const totalSteps = 12; // 12 rapid steps over ~840ms
    const stepDuration = 70; // 70ms per tick

    const interval = setInterval(() => {
      currentStep++;
      const rand = Math.floor(Math.random() * 10);
      setScanningNumber(rand);
      soundManager.playClick();

      if (currentStep >= totalSteps) {
        clearInterval(interval);
        const finalChosen = Math.floor(Math.random() * 10);
        setScanningNumber(finalChosen);
        soundManager.playCash();

        // Brief pause to display the chosen number before opening bet modal
        setTimeout(() => {
          setIsScanning(false);
          setScanningNumber(null);
          onSelectBet('number', finalChosen, selectedMultiplier);
        }, 350);
      }
    }, stepDuration);
  };

  return (
    <div className="w-full px-3 py-2 space-y-3">
      {/* Row 1: Color Betting Buttons (Green 1.95X, Violet 4.6X, Red 1.95X) */}
      <div className="grid grid-cols-3 gap-2.5">
        {/* Green */}
        <button
          disabled={isLocked || isScanning}
          onClick={() => handlePick('color', 'green')}
          className="relative group py-2.5 px-3 rounded-xl bg-gradient-to-r from-[#18b660] to-[#149d53] text-white font-bold text-sm sm:text-base shadow-md active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-105 flex items-center justify-between cursor-pointer"
        >
          <span className="font-serif italic font-semibold">{language === 'ur' ? 'سبز' : 'Green'}</span>
          <span className="text-xs bg-white/20 px-1.5 py-0.5 rounded-md font-mono font-bold">1.95X</span>
        </button>

        {/* Violet */}
        <button
          disabled={isLocked || isScanning}
          onClick={() => handlePick('color', 'violet')}
          className="relative group py-2.5 px-3 rounded-xl bg-gradient-to-r from-[#9c27b0] to-[#7b1fa2] text-white font-bold text-sm sm:text-base shadow-md active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-105 flex items-center justify-between cursor-pointer"
        >
          <span className="font-serif italic font-semibold">{language === 'ur' ? 'جامنی' : 'Violet'}</span>
          <span className="text-xs bg-white/20 px-1.5 py-0.5 rounded-md font-mono font-bold">4.6X</span>
        </button>

        {/* Red */}
        <button
          disabled={isLocked || isScanning}
          onClick={() => handlePick('color', 'red')}
          className="relative group py-2.5 px-3 rounded-xl bg-gradient-to-r from-[#ea384c] to-[#d32f42] text-white font-bold text-sm sm:text-base shadow-md active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-105 flex items-center justify-between cursor-pointer"
        >
          <span className="font-serif italic font-semibold">{language === 'ur' ? 'سرخ' : 'Red'}</span>
          <span className="text-xs bg-white/20 px-1.5 py-0.5 rounded-md font-mono font-bold">1.95X</span>
        </button>
      </div>

      {/* Row 2 & 3: Numbers 0 to 9 with Scanning Animation */}
      <div className="bg-white rounded-2xl p-3 shadow-xs border border-slate-200 relative">
        <div className="grid grid-cols-5 gap-y-3 gap-x-2 justify-items-center">
          {[0, 1, 2, 3, 4].map((num) => {
            const isHighlighted = scanningNumber === num;
            return (
              <div
                key={num}
                className={`transition-all duration-75 rounded-full ${
                  isHighlighted ? 'scale-125 ring-4 ring-amber-400 z-20 shadow-xl animate-pulse' : ''
                }`}
              >
                <Ball
                  number={num}
                  size="md"
                  showMultiplier
                  onClick={() => handlePick('number', num)}
                  className={isLocked || isScanning ? 'opacity-60 pointer-events-none' : ''}
                />
              </div>
            );
          })}
          {[5, 6, 7, 8, 9].map((num) => {
            const isHighlighted = scanningNumber === num;
            return (
              <div
                key={num}
                className={`transition-all duration-75 rounded-full ${
                  isHighlighted ? 'scale-125 ring-4 ring-amber-400 z-20 shadow-xl animate-pulse' : ''
                }`}
              >
                <Ball
                  number={num}
                  size="md"
                  showMultiplier
                  onClick={() => handlePick('number', num)}
                  className={isLocked || isScanning ? 'opacity-60 pointer-events-none' : ''}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Row 4: Random & Multipliers (Above Big / Small) */}
      <div className="flex items-center gap-1.5 bg-slate-50 p-1.5 rounded-xl border border-slate-200 overflow-x-auto no-scrollbar">
        {/* Random (بے ترتیب) scanning button */}
        <button
          disabled={isLocked || isScanning}
          onClick={handleRandom}
          className={`px-3 py-1.5 rounded-lg border text-xs font-serif italic font-bold shrink-0 active:scale-95 transition-all flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${
            isScanning
              ? 'bg-amber-500 text-white border-amber-500 animate-pulse'
              : isBlue
              ? 'border-blue-300 bg-white text-blue-700 hover:bg-blue-50'
              : 'border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50'
          }`}
          title="Randomly scan and pick a number 0-9"
        >
          <Shuffle className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
          <span>
            {isScanning
              ? language === 'ur'
                ? 'سکین ہو رہا ہے...'
                : 'Scanning...'
              : language === 'ur'
              ? 'بے ترتیب'
              : 'Random'}
          </span>
        </button>

        {/* Multipliers X1, X5, X10, X20, X50, X100 */}
        <div className="flex items-center gap-1 shrink-0">
          {multipliers.map((mult) => {
            const isSelected = selectedMultiplier === mult;
            return (
              <button
                key={mult}
                disabled={isLocked || isScanning}
                onClick={() => {
                  soundManager.playClick();
                  onSelectMultiplier(mult);
                }}
                className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer disabled:opacity-50 ${
                  isSelected
                    ? 'bg-[#18b660] text-white shadow-xs scale-105'
                    : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                X{mult}
              </button>
            );
          })}
        </div>
      </div>

      {/* Row 5: Big 1.84X / Small 1.84X Dual Bar */}
      <div className="grid grid-cols-2 gap-0 rounded-2xl overflow-hidden shadow-md">
        {/* Big (5-9) */}
        <button
          disabled={isLocked || isScanning}
          onClick={() => handlePick('bigSmall', 'Big')}
          className="py-3 px-4 bg-gradient-to-r from-[#f5a623] to-[#e67e22] text-white font-bold flex items-center justify-between active:scale-98 transition-all hover:brightness-105 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <span className="font-serif italic text-base sm:text-lg">
            {language === 'ur' ? 'بڑا (5-9)' : 'Big'}
          </span>
          <span className="text-xs bg-black/15 px-2 py-0.5 rounded-full font-mono font-bold">1.84X</span>
        </button>

        {/* Small (0-4) */}
        <button
          disabled={isLocked || isScanning}
          onClick={() => handlePick('bigSmall', 'Small')}
          className="py-3 px-4 bg-gradient-to-r from-[#5dade2] to-[#3498db] text-white font-bold flex items-center justify-between active:scale-98 transition-all hover:brightness-105 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <span className="font-serif italic text-base sm:text-lg">
            {language === 'ur' ? 'چھوٹا (0-4)' : 'Small'}
          </span>
          <span className="text-xs bg-black/15 px-2 py-0.5 rounded-full font-mono font-bold">1.84X</span>
        </button>
      </div>
    </div>
  );
};
