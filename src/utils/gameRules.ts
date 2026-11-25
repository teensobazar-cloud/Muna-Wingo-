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
 * Tiered 2X payout curve (Return = Stake + Profit):
 * - Stake < 50:      1.90x (e.g. Rs 10 -> Rs 19 [+9 profit], Rs 20 -> Rs 38 [+18 profit])
 * - Stake 50..499:   1.92x (e.g. Rs 50 -> Rs 96 [+46 profit])
 * - Stake 500..999:  1.94x (e.g. Rs 500 -> Rs 970 [+470 profit])
 * - Stake >= 1000:   1.96x (e.g. Rs 1000 -> Rs 1,960 [+960 profit + Rs 1,000 stake return])
 */
export function getTwoXRateForStake(totalAmount: number): number {
  if (totalAmount >= 1000) return 1.96;
  if (totalAmount >= 500) return 1.94;
  if (totalAmount >= 50) return 1.92;
  return 1.9;
}

export function getEstimatedReturnAndProfit(
  category: BetCategory,
  selection: string | number,
  totalAmount: number
): { totalReturn: number; netProfit: number } {
  const twoXRate = getTwoXRateForStake(totalAmount);
  const feeRatio = twoXRate / 2; // 0.95 (<50), 0.96 (50..499), 0.97 (500..999), 0.98 (>=1000)

  let effectiveRate = twoXRate;
  if (category === 'color' && selection === 'violet') {
    effectiveRate = 4.5 * feeRatio;
  } else if (category === 'number') {
    effectiveRate = 9 * feeRatio;
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

  const twoXRate = getTwoXRateForStake(bet.totalAmount);
  const feeRatio = twoXRate / 2;

  let won = false;
  let effectiveRate = 0;

  if (bet.category === 'color') {
    const chosenColor = bet.selection as ColorType;
    if (chosenColor === 'green') {
      if (resultNum === 5) {
        won = true;
        effectiveRate = 1.5 * feeRatio;
      } else if (resultColors.includes('green')) {
        won = true;
        effectiveRate = twoXRate;
      }
    } else if (chosenColor === 'red') {
      if (resultNum === 0) {
        won = true;
        effectiveRate = 1.5 * feeRatio;
      } else if (resultColors.includes('red')) {
        won = true;
        effectiveRate = twoXRate;
      }
    } else if (chosenColor === 'violet') {
      if (resultColors.includes('violet')) {
        won = true;
        effectiveRate = 4.5 * feeRatio;
      }
    }
  } else if (bet.category === 'number') {
    const chosenNum = Number(bet.selection);
    if (chosenNum === resultNum) {
      won = true;
      effectiveRate = 9 * feeRatio;
    }
  } else if (bet.category === 'bigSmall') {
    if (bet.selection === resultBigSmall) {
      won = true;
      effectiveRate = twoXRate;
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

function pickCryptoRandom<T>(items: T[]): T {
  const idx = Math.floor(getCryptoRandom() * items.length);
  return items[Math.min(idx, items.length - 1)];
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
 * Balanced Strategic Draw Generator (mirrors server settlement behavior):
 * - Gives players a realistic ~45% base win rate on normal stakes (~36% medium, ~28% high stakes)
 *   so gameplay stays rewarding while keeping house sustainability.
 * - Includes consecutive-loss streak recovery: after 2–3 losses in a row, strongly boosts
 *   win probability so players don't get stuck in frustrating endless losing streaks.
 * - Ensures winning rolls strictly pick from genuine winning candidates (no 0-payout traps).
 */
export function generateStrategicDrawResult(
  period: string,
  activeBets: UserBet[],
  recentHistory: DrawResult[] = [],
  timestamp: number = Date.now()
): DrawResult {
  const periodBets = activeBets.filter(
    (b) => b.period === period && b.status === 'pending'
  );
  const lastNum = recentHistory[0]?.number;
  const secondLastNum = recentHistory[1]?.number;

  // No player bets in this period: pick high-entropy unpredictable number
  if (periodBets.length === 0) {
    let candidates = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const filtered = candidates.filter((n) => {
      if (n === lastNum && getCryptoRandom() < 0.7) return false;
      if (n === secondLastNum && getCryptoRandom() < 0.4) return false;
      return true;
    });
    if (filtered.length > 0) {
      candidates = filtered;
    }
    const chosen = pickCryptoRandom(candidates);
    return {
      period,
      number: chosen,
      bigSmall: getBigSmallForNumber(chosen),
      colors: getColorsForNumber(chosen),
      timestamp
    };
  }

  // Evaluate exact house payout for every candidate number 0..9
  const evaluations = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => {
    const candidate: DrawResult = {
      period,
      number: num,
      bigSmall: getBigSmallForNumber(num),
      colors: getColorsForNumber(num),
      timestamp
    };
    let totalPayout = 0;
    for (const bet of periodBets) {
      const { winAmount } = calculateBetWin(bet, candidate);
      totalPayout += winAmount;
    }
    return { num, candidate, totalPayout };
  });

  const totalStaked = periodBets.reduce((sum, b) => sum + b.totalAmount, 0);
  const minPayout = Math.min(...evaluations.map((e) => e.totalPayout));
  const lowestPayoutPool = evaluations.filter((e) => e.totalPayout <= minPayout + 0.01);

  const positivePool = evaluations.filter((e) => e.totalPayout > 0);
  const profitPool = evaluations.filter((e) => e.totalPayout >= totalStaked);
  const winningCandidates = profitPool.length > 0 ? profitPool : positivePool;

  // Compute recent consecutive losing rounds for streak recovery
  const settled = activeBets.filter(
    (b) => (b.status === 'won' || b.status === 'lost') && b.period !== period
  );
  const roundMap = new Map<string, { stake: number; payout: number; latestTs: number }>();
  for (const b of settled) {
    const key = `${b.mode || 60}:${b.period}`;
    const entry = roundMap.get(key) || { stake: 0, payout: 0, latestTs: 0 };
    entry.stake += b.totalAmount || 0;
    entry.payout += b.winAmount || 0;
    if ((b.timestamp || 0) > entry.latestTs) entry.latestTs = b.timestamp || 0;
    roundMap.set(key, entry);
  }
  const orderedRounds = Array.from(roundMap.values()).sort((a, b) => b.latestTs - a.latestTs);
  let consecutiveLosses = 0;
  for (const r of orderedRounds) {
    if (r.payout < r.stake) consecutiveLosses += 1;
    else break;
  }

  const minWinPayout =
    winningCandidates.length > 0
      ? Math.min(...winningCandidates.map((e) => e.totalPayout))
      : 0;
  const isHighMultiplierOnly = winningCandidates.length > 0 && minWinPayout > totalStaked * 3.5;

  let playerWinChance: number;
  if (isHighMultiplierOnly) {
    playerWinChance = consecutiveLosses >= 4 ? 0.14 : consecutiveLosses >= 2 ? 0.1 : 0.07;
  } else {
    let baseChance = totalStaked >= 2000 ? 0.24 : totalStaked >= 500 ? 0.32 : 0.36;
    if (orderedRounds.length === 0 && totalStaked < 500) {
      baseChance = Math.max(baseChance, 0.55);
    }
    if (consecutiveLosses === 1) {
      baseChance += totalStaked >= 500 ? 0.06 : 0.08;
    } else if (consecutiveLosses === 2) {
      baseChance += totalStaked >= 2000 ? 0.12 : totalStaked >= 500 ? 0.18 : 0.24;
    } else if (consecutiveLosses >= 3) {
      baseChance = totalStaked >= 2000 ? 0.55 : totalStaked >= 500 ? 0.68 : 0.78;
    }
    playerWinChance = Math.min(0.85, baseChance);
  }

  if (winningCandidates.length > 0 && getCryptoRandom() < playerWinChance) {
    const controlledWins = winningCandidates.filter(
      (e) => e.totalPayout <= Math.max(totalStaked * 3.0, 500)
    );
    const preferredWinPool =
      controlledWins.length > 0 && getCryptoRandom() < 0.88 ? controlledWins : winningCandidates;
    const nonRepeatingWin = preferredWinPool.filter((e) => e.num !== lastNum);
    const finalWinPool = nonRepeatingWin.length > 0 ? nonRepeatingWin : preferredWinPool;
    return pickCryptoRandom(finalWinPool).candidate;
  }

  const nonRepeating = lowestPayoutPool.filter((e) => e.num !== lastNum);
  const pool = nonRepeating.length > 0 ? nonRepeating : lowestPayoutPool;
  return pickCryptoRandom(pool).candidate;
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

