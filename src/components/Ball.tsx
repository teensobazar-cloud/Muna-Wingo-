import React from 'react';
import { ColorType } from '../types/game';
import { getColorsForNumber } from '../utils/gameRules';

interface BallProps {
  number: number;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showMultiplier?: boolean;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}

export const Ball: React.FC<BallProps> = ({
  number,
  size = 'md',
  showMultiplier = false,
  selected = false,
  onClick,
  className = ''
}) => {
  const colors = getColorsForNumber(number);
  const isSplit = colors.length > 1;

  // Sizing definitions
  const sizeClasses = {
    xs: 'w-4 h-4 text-[10px]',
    sm: 'w-7 h-7 text-xs font-bold',
    md: 'w-13 h-13 text-xl font-black',
    lg: 'w-16 h-16 text-2xl font-black',
    xl: 'w-22 h-22 text-4xl font-black'
  };

  // Outer border / ring styling matching screenshot
  const getRingBorder = () => {
    if (number === 0) {
      // Split red & violet
      return 'border-[3px] border-t-[#ea384c] border-l-[#ea384c] border-b-[#9c27b0] border-r-[#9c27b0]';
    }
    if (number === 5) {
      // Split green & violet
      return 'border-[3px] border-t-[#18b660] border-l-[#18b660] border-b-[#9c27b0] border-r-[#9c27b0]';
    }
    if (colors.includes('green')) {
      return 'border-[3px] border-[#18b660]';
    }
    return 'border-[3px] border-[#ea384c]';
  };

  // Inner sphere background gradient
  const getInnerBackground = () => {
    if (number === 0) {
      return 'bg-gradient-to-br from-[#ea384c] via-[#b92b77] to-[#8e24aa] text-white';
    }
    if (number === 5) {
      return 'bg-gradient-to-br from-[#18b660] via-[#529367] to-[#8e24aa] text-white';
    }
    if (colors.includes('green')) {
      return 'bg-gradient-to-br from-[#38d47b] via-[#1bb864] to-[#0e8a46] text-white';
    }
    return 'bg-gradient-to-br from-[#ff5b6d] via-[#ea384c] to-[#c51c31] text-white';
  };

  return (
    <div
      onClick={onClick}
      className={`flex flex-col items-center justify-center transition-transform active:scale-95 ${
        onClick ? 'cursor-pointer hover:scale-105' : ''
      } ${className}`}
    >
      <div
        className={`relative rounded-full p-[2px] transition-all ${getRingBorder()} ${
          selected ? 'ring-4 ring-amber-400 scale-105' : ''
        }`}
      >
        {/* Sphere ball with 3D reflection highlight */}
        <div
          className={`${sizeClasses[size]} rounded-full flex items-center justify-center ball-shadow ${getInnerBackground()} relative overflow-hidden`}
        >
          {/* 3D sphere glossy light glint */}
          <div className="absolute top-0.5 left-1/2 -translate-x-1/2 w-3/4 h-1/3 bg-gradient-to-b from-white/70 to-transparent rounded-full opacity-80 pointer-events-none" />

          {/* Number text */}
          <span className="relative z-10 drop-shadow-md select-none font-sans">
            {number}
          </span>
        </div>
      </div>

      {showMultiplier && (
        <span className="text-[11px] font-bold text-slate-500 mt-1 select-none">
          9X
        </span>
      )}
    </div>
  );
};

export const ColorDot: React.FC<{ color: ColorType | ColorType[]; size?: 'sm' | 'md' }> = ({
  color,
  size = 'sm'
}) => {
  const dotSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-5 h-5';
  const colors = Array.isArray(color) ? color : [color];

  return (
    <div className="flex items-center gap-1">
      {colors.map((c, i) => {
        let bg = 'bg-[#18b660]';
        if (c === 'red') bg = 'bg-[#ea384c]';
        if (c === 'violet') bg = 'bg-[#9c27b0]';
        return (
          <span
            key={i}
            className={`${dotSize} rounded-full ${bg} shadow-xs inline-block shrink-0`}
          />
        );
      })}
    </div>
  );
};
