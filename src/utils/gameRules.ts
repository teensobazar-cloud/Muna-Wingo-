import { BigSmallType, ColorType, DrawResult, UserBet, GameTimeOption, BetCategory } from '../types/game';

export function getColorsForNumber(num: number): ColorType[] {
  if (num === 0) return ['red', 'violet'];
  if (num === 5) return ['green', 'violet'];
  if ([1, 3, 7, 9].includes(num)) return ['green'];
  return ['red'];
}

export function getBigSmallForNumber(num: number): BigSmallType {
  return num >= 5 ? 'Big' : 'Small';
}

/**
 * Fair 92% RTP Payout Table (Uniform 0..9 Draws):
 * - Big / Small (50% chance):        1.84x  -> 0.50 * 1.84 = 92.0% RTP
 * - Green / Red (40% + 10% split):   1.95x full / 1.40x split (0 or 5) -> 0.40*1.95 + 0.10*1.40 = 92.0% RTP
 * - Violet (20% chance):             4.60x  -> 0.20 * 4.60 = 92.0% RTP
 * - Exact Number 0-9 (10% chance):   9.20x  -> 0.10 * 9.20 = 92.0% RTP
 */
export function getTwoXRateForStake(_totalAmount: number): number {
  return 1.95;
}

export function getEstimatedReturnAndProfit(
  category: BetCategory,
  selection: string | number,
  totalAmount: number
): { totalReturn: number; netProfit: number } {
  let effectiveRate = 1.95;
  if (category === 'bigSmall') {
    effectiveRate = 1.84;
  } else if (category === 'color' && selection === 'violet') {
    effectiveRate = 4.6;
  } else if (category === 'number') {
    effectiveRate = 9.2;
  }

  const totalReturn = Math.round(totalAmount * effectiveRate * 100) / 100;
  const netProfit = Math.round((totalReturn - totalAmount) * 100) / 100;
  return { totalReturn, netProfit };
}

export function calculateBetWin(
  bet: UserBet,
  result: DrawResult
): { won: boolean; winAmount: number; profit: number } {
  const resultNum = result.number;
  const resultColors = result.colors;
  const resultBigSmall = result.bigSmall;

  let won = false;
  let effectiveRate = 0;

  if (bet.category === 'color') {
    const chosenColor = bet.selection as ColorType;
    if (chosenColor === 'green') {
      if (resultNum === 5) {
        won = true;
        effectiveRate = 1.4;
      } else if (resultColors.includes('green')) {
        won = true;
        effectiveRate = 1.95;
      }
    } else if (chosenColor === 'red') {
      if (resultNum === 0) {
        won = true;
        effectiveRate = 1.4;
      } else if (resultColors.includes('red')) {
        won = true;
        effectiveRate = 1.95;
      }
    } else if (chosenColor === 'violet') {
      if (resultColors.includes('violet')) {
        won = true;
        effectiveRate = 4.6;
      }
    }
  } else if (bet.category === 'number') {
    const chosenNum = Number(bet.selection);
    if (chosenNum === resultNum) {
      won = true;
      effectiveRate = 9.2;
    }
  } else if (bet.category === 'bigSmall') {
    if (bet.selection === resultBigSmall) {
      won = true;
      effectiveRate = 1.84;
    }
  }

  const winAmount = won ? Math.round(bet.totalAmount * effectiveRate * 100) / 100 : 0;
  const profit = won ? Math.round((winAmount - bet.totalAmount) * 100) / 100 : -bet.totalAmount;

  return { won, winAmount, profit };
}

function getCryptoRandom(): number {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    const arr = new Uint32Array(1);
    window.crypto.getRandomValues(arr);
    return arr[0] / 4294967296;
  }
  return Math.random();
}

export function generateSingleDrawResult(
  period: string,
  timestamp: number = Date.now()
): DrawResult {
  const number = Math.floor(getCryptoRandom() * 10);
  return {
    period,
    number,
    bigSmall: getBigSmallForNumber(number),
    colors: getColorsForNumber(number),
    timestamp
  };
}

/**
 * Unbiased Fair Random Draw Generator (offline fallback only; server pre-commits SHA-256 hash).
 * Zero per-user targeting — pure uniform 0..9 draw at 92% RTP.
 */
export function generateStrategicDrawResult(
  period: string,
  _activeBets: UserBet[],
  _recentHistory: DrawResult[] = [],
  timestamp: number = Date.now()
): DrawResult {
  return generateSingleDrawResult(period, timestamp);
}

let serverTimeOffsetMs = 0;

export function setServerTimeOffset(serverTime: number) {
  if (typeof serverTime === 'number' && Number.isFinite(serverTime) && serverTime > 1_000_000_000_000) {
    serverTimeOffsetMs = serverTime - Date.now();
  }
}

export function getServerNow(): number {
  return Date.now() + serverTimeOffsetMs;
}

// Continuous non-resetting clock based on synchronized server time
export function getSecondsRemainingForMode(
  mode: GameTimeOption,
  timestamp: number = getServerNow()
): number {
  const sec = Math.floor(timestamp / 1000);
  const rem = mode - (sec % mode);
  return rem === 0 ? mode : rem;
}

// Synchronized period ID based on PKT (UTC+5) date and mode interval so server & all devices match
export function getPeriodForMode(
  mode: GameTimeOption,
  timestamp: number = getServerNow()
): string {
  const pktOffsetMs = 5 * 60 * 60 * 1000;
  const pktDate = new Date(timestamp + pktOffsetMs);
  const yyyy = pktDate.getUTCFullYear();
  const mm = String(pktDate.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(pktDate.getUTCDate()).padStart(2, '0');
  const midnightUtc = Date.UTC(yyyy, pktDate.getUTCMonth(), pktDate.getUTCDate());
  const secondsSinceMidnight = Math.max(0, Math.floor((timestamp + pktOffsetMs - midnightUtc) / 1000));
  const periodIndex = Math.floor(secondsSinceMidnight / mode) + 1;
  return `${yyyy}${mm}${dd}${String(periodIndex).padStart(5, '0')}`;
}

// Generate recent past periods deterministically before live server state loads
function deterministicNumberForSeed(seedStr: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    hash ^= seedStr.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % 10;
}

export function generateHistoryForMode(
  mode: GameTimeOption,
  count: number = 30,
  now: number = getServerNow()
): DrawResult[] {
  const history: DrawResult[] = [];
  for (let idx = 1; idx <= count; idx++) {
    const pastTime = now - idx * (mode * 1000);
    const period = getPeriodForMode(mode, pastTime);
    const number = deterministicNumberForSeed(`${mode}:${period}`);
    history.push({
      period,
      number,
      bigSmall: getBigSmallForNumber(number),
      colors: getColorsForNumber(number),
      timestamp: pastTime,
    });
  }
  return history;
}

// Load and catch up continuous history from localStorage for all 4 modes
export function getInitialHistoryByMode(): Record<GameTimeOption, DrawResult[]> {
  const modes: GameTimeOption[] = [30, 60, 180, 300];
  const now = Date.now();
  let savedData: Partial<Record<GameTimeOption, DrawResult[]>> = {};

  try {
    const raw = localStorage.getItem('aloye_wingo_history_by_mode');
    if (raw) {
      savedData = JSON.parse(raw);
    }
  } catch {
    savedData = {};
  }

  const result: Record<GameTimeOption, DrawResult[]> = {
    30: [],
    60: [],
    180: [],
    300: []
  };

  for (const mode of modes) {
    const existing = savedData[mode];
    if (existing && Array.isArray(existing) && existing.length > 0) {
      // Catch up any periods that completed while the game was closed / refreshed
      const latestResult = existing[0];
      const latestTime = latestResult.timestamp || now;
      const missedIntervals = Math.floor((now - latestTime) / (mode * 1000));

      const newMissedResults: DrawResult[] = [];
      // Catch up up to 50 missed periods while offline
      const catchupCount = Math.min(missedIntervals, 50);
      for (let i = catchupCount; i >= 1; i--) {
        const missedTime = now - i * (mode * 1000);
        const period = getPeriodForMode(mode, missedTime);
        // Avoid adding duplicate period if it already exists in history
        if (!existing.some((r) => r.period === period)) {
          newMissedResults.unshift(generateSingleDrawResult(period, missedTime));
        }
      }

      // Combine missed results with existing, keeping max 80 items
      const combined = [...newMissedResults, ...existing].slice(0, 80);
      result[mode] = combined;
    } else {
      // First time initialization: generate real recent history based on today's time
      result[mode] = generateHistoryForMode(mode, 30, now);
    }
  }

  // Persist updated continuous history back to localStorage
  try {
    localStorage.setItem('aloye_wingo_history_by_mode', JSON.stringify(result));
  } catch {
    // ignore
  }

  return result;
}

// Legacy helper for backward compatibility
export function generateInitialHistory(): DrawResult[] {
  const all = getInitialHistoryByMode();
  return all[60];
}

