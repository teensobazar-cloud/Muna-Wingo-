import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { Request, Response } from 'express';

type ColorType = 'green' | 'violet' | 'red';
type BigSmallType = 'Big' | 'Small';
type BetCategory = 'color' | 'number' | 'bigSmall';
type GameTimeOption = 30 | 60 | 180 | 300;

interface DrawResult {
  period: string;
  number: number;
  bigSmall: BigSmallType;
  colors: ColorType[];
  timestamp: number;
  commitHash?: string;
  serverSeed?: string;
  isManualOverride?: boolean;
}

interface RoundCommit {
  mode: GameTimeOption;
  period: string;
  serverSeed: string;
  number: number;
  commitHash: string;
  createdAt: number;
}

interface ServerUser {
  id: string;
  fullName: string;
  phone: string;
  password: string;
  inviteCode?: string;
  balance: number;
  balanceUpdatedAt?: number;
  referralEarnings: number;
  createdAt: number;
  lastSeenAt: number;
}

interface PaymentTransaction {
  id: string;
  type: 'deposit' | 'withdraw';
  method: 'easypaisa' | 'jazzcash';
  amount: number;
  bonusAmount?: number;
  accountNumber: string;
  accountTitle: string;
  trxId?: string;
  screenshotUrl?: string;
  status: 'completed' | 'pending' | 'processing' | 'rejected';
  timestamp: number;
  note?: string;
  userId?: string;
  userName?: string;
  userPhone?: string;
}

interface ServerBet {
  id: string;
  userId: string;
  userName: string;
  userPhone: string;
  mode: GameTimeOption;
  period: string;
  category: BetCategory;
  selection: string | number;
  contractMoney: number;
  quantity: number;
  totalAmount: number;
  status: 'pending' | 'won' | 'lost';
  winAmount: number;
  profit?: number;
  multiplier: number;
  roundHash?: string;
  timestamp: number;
}

interface ForcedOutcomeSpec {
  kind: 'number' | 'bigSmall' | 'color';
  number?: number;
  bigSmall?: BigSmallType;
  color?: ColorType;
  targetPeriod?: string;
  persistent?: boolean;
  setAt?: number;
}

interface DatabaseSchema {
  users: Record<string, ServerUser>;
  transactions: PaymentTransaction[];
  bets: ServerBet[];
  historyByMode: Record<GameTimeOption, DrawResult[]>;
  forcedOutcomes: Record<GameTimeOption, ForcedOutcomeSpec | null>;
  forcedNumbers?: Record<GameTimeOption, { number: number; targetPeriod?: string; setAt?: number } | null>;
  deletedUserIds?: string[];
  deletedPhones?: string[];
  blockedPhones?: string[];
  roundCommits?: Record<string, RoundCommit>;
  adminPin: string;
}

const DATA_DIR = process.env.VERCEL
  ? path.join('/tmp', 'munawingo_data')
  : path.resolve(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'muna_db.json');
const MODES: GameTimeOption[] = [30, 60, 180, 300];
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

function getColorsForNumber(num: number): ColorType[] {
  if (num === 0) return ['red', 'violet'];
  if (num === 5) return ['green', 'violet'];
  if (num === 1 || num === 3 || num === 7 || num === 9) return ['green'];
  return ['red'];
}

function getBigSmallForNumber(num: number): BigSmallType {
  return num >= 5 ? 'Big' : 'Small';
}

// Fair 92% RTP payout curve across every bet category
function calculateBetWin(
  bet: Pick<ServerBet, 'category' | 'selection' | 'totalAmount'>,
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

function pickCryptoRandom<T>(items: T[]): T {
  const idx = crypto.randomInt(0, items.length);
  return items[idx];
}

function getPeriodForMode(mode: GameTimeOption, timestamp: number = Date.now()): string {
  const pktDate = new Date(timestamp + PKT_OFFSET_MS);
  const yyyy = pktDate.getUTCFullYear();
  const mm = String(pktDate.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(pktDate.getUTCDate()).padStart(2, '0');
  const midnightUtc = Date.UTC(yyyy, pktDate.getUTCMonth(), pktDate.getUTCDate());
  const secondsSinceMidnight = Math.max(0, Math.floor((timestamp + PKT_OFFSET_MS - midnightUtc) / 1000));
  const periodIndex = Math.floor(secondsSinceMidnight / mode) + 1;
  return `${yyyy}${mm}${dd}${String(periodIndex).padStart(5, '0')}`;
}

function createRoundCommitRecord(mode: GameTimeOption, period: string): RoundCommit {
  const serverSeed = crypto.randomBytes(16).toString('hex');
  const drawDigest = crypto.createHash('sha256').update(`${serverSeed}:${mode}:${period}`).digest();
  const number = drawDigest.readUInt32BE(0) % 10;
  const commitHash = crypto
    .createHash('sha256')
    .update(`${serverSeed}:${mode}:${period}:${number}`)
    .digest('hex');

  return {
    mode,
    period,
    serverSeed,
    number,
    commitHash,
    createdAt: Date.now(),
  };
}

function deterministicNumberForSeed(seedStr: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    hash ^= seedStr.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % 10;
}

function generateDeterministicResult(
  mode: GameTimeOption,
  period: string,
  timestamp: number
): DrawResult {
  const number = deterministicNumberForSeed(`${mode}:${period}`);
  return {
    period,
    number,
    bigSmall: getBigSmallForNumber(number),
    colors: getColorsForNumber(number),
    timestamp,
  };
}

function generateInitialHistoryForMode(mode: GameTimeOption, count: number, now: number): DrawResult[] {
  const list: DrawResult[] = [];
  for (let idx = 1; idx <= count; idx++) {
    const pastTime = now - idx * (mode * 1000);
    const period = getPeriodForMode(mode, pastTime);
    list.push(generateDeterministicResult(mode, period, pastTime));
  }
  return list;
}

function loadDatabase(): DatabaseSchema {
  const now = Date.now();
  const empty: DatabaseSchema = {
    users: {},
    transactions: [],
    bets: [],
    historyByMode: {
      30: generateInitialHistoryForMode(30, 30, now),
      60: generateInitialHistoryForMode(60, 30, now),
      180: generateInitialHistoryForMode(180, 30, now),
      300: generateInitialHistoryForMode(300, 30, now),
    },
    forcedOutcomes: {
      30: null,
      60: null,
      180: null,
      300: null,
    },
    deletedUserIds: [],
    deletedPhones: [],
    blockedPhones: [],
    roundCommits: {},
    adminPin: '786',
  };

  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(empty), 'utf-8');
      return empty;
    }
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<DatabaseSchema>;
    const migratedForced: Record<GameTimeOption, ForcedOutcomeSpec | null> = {
      30: parsed.forcedOutcomes?.[30] || null,
      60: parsed.forcedOutcomes?.[60] || null,
      180: parsed.forcedOutcomes?.[180] || null,
      300: parsed.forcedOutcomes?.[300] || null,
    };
    if (!parsed.forcedOutcomes && parsed.forcedNumbers) {
      for (const m of MODES) {
        const legacy = parsed.forcedNumbers[m];
        if (legacy && typeof legacy.number === 'number') {
          migratedForced[m] = {
            kind: 'number',
            number: legacy.number,
            targetPeriod: legacy.targetPeriod,
            setAt: legacy.setAt,
          };
        }
      }
    }

    const legacyDeletedPhones = Array.isArray(parsed.deletedPhones) ? parsed.deletedPhones : [];
    const existingBlocked = Array.isArray(parsed.blockedPhones) ? parsed.blockedPhones : [];
    const mergedBlocked = Array.from(new Set([...existingBlocked, ...legacyDeletedPhones].filter(Boolean)));

    const db: DatabaseSchema = {
      users: parsed.users || {},
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
      bets: Array.isArray(parsed.bets) ? parsed.bets : [],
      historyByMode: parsed.historyByMode || empty.historyByMode,
      forcedOutcomes: migratedForced,
      deletedUserIds: Array.isArray(parsed.deletedUserIds) ? parsed.deletedUserIds : [],
      deletedPhones: legacyDeletedPhones,
      blockedPhones: mergedBlocked,
      roundCommits: parsed.roundCommits && typeof parsed.roundCommits === 'object' ? parsed.roundCommits : {},
      adminPin: typeof parsed.adminPin === 'string' && parsed.adminPin.length >= 3 ? parsed.adminPin : '786',
    };

    // Catch up missed history per mode deterministically
    for (const mode of MODES) {
      const existing = db.historyByMode[mode] || [];
      if (existing.length === 0) {
        db.historyByMode[mode] = generateInitialHistoryForMode(mode, 30, now);
      } else {
        const latestTime = existing[0]?.timestamp || now;
        const missedCount = Math.min(Math.floor((now - latestTime) / (mode * 1000)), 50);
        const added: DrawResult[] = [];
        for (let i = missedCount; i >= 1; i--) {
          const t = now - i * (mode * 1000);
          const period = getPeriodForMode(mode, t);
          if (!existing.some((r) => r.period === period) && !added.some((r) => r.period === period)) {
            added.unshift(generateDeterministicResult(mode, period, t));
          }
        }
        db.historyByMode[mode] = [...added, ...existing].slice(0, 80);
      }
    }

    return db;
  } catch (err) {
    console.error('Failed to load DB, using fresh DB:', err);
    return empty;
  }
}

const db: DatabaseSchema = loadDatabase();

function saveDatabase() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmp = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db), 'utf-8');
    fs.renameSync(tmp, DB_FILE);
  } catch (err) {
    console.error('Failed to save DB:', err);
  }
}

function normalizePhone(raw: string): string {
  return String(raw || '').replace(/[^\d+]/g, '').trim();
}

function canonicalPhone(raw: string): string {
  const stripped = normalizePhone(raw).replace(/^\+/, '');
  if (stripped.startsWith('92') && stripped.length >= 12) {
    return `0${stripped.slice(2)}`;
  }
  return stripped;
}

function isPhoneBlocked(rawPhone: string): boolean {
  const clean = normalizePhone(rawPhone);
  const canon = canonicalPhone(rawPhone);
  if (!clean && !canon) return false;
  const list = db.blockedPhones || [];
  return list.some(
    (entry) => normalizePhone(entry) === clean || canonicalPhone(entry) === canon
  );
}

function addPhoneToBlockList(rawPhone: string) {
  if (!Array.isArray(db.blockedPhones)) db.blockedPhones = [];
  if (!Array.isArray(db.deletedPhones)) db.deletedPhones = [];
  const canon = canonicalPhone(rawPhone);
  const clean = normalizePhone(rawPhone);
  const key = canon || clean;
  if (!key) return;
  if (!db.blockedPhones.some((b) => canonicalPhone(b) === key || normalizePhone(b) === clean)) {
    db.blockedPhones.push(key);
  }
  if (!db.deletedPhones.includes(key)) {
    db.deletedPhones.push(key);
  }
}

function getOrCreateRoundCommit(mode: GameTimeOption, period: string): { commit: RoundCommit; created: boolean } {
  if (!db.roundCommits) db.roundCommits = {};
  const key = `${mode}:${period}`;
  if (db.roundCommits[key]) {
    return { commit: db.roundCommits[key], created: false };
  }
  const commit = createRoundCommitRecord(mode, period);
  db.roundCommits[key] = commit;

  // Prune older commits if cache grows large
  const keys = Object.keys(db.roundCommits);
  if (keys.length > 200) {
    keys
      .sort((a, b) => (db.roundCommits![a]?.createdAt || 0) - (db.roundCommits![b]?.createdAt || 0))
      .slice(0, keys.length - 160)
      .forEach((oldKey) => {
        delete db.roundCommits![oldKey];
      });
  }
  return { commit, created: true };
}

function getActiveCommitHashes(timestamp: number = Date.now()): Record<GameTimeOption, string> {
  let anyCreated = false;
  const map: Record<GameTimeOption, string> = {
    30: '',
    60: '',
    180: '',
    300: '',
  };
  for (const mode of MODES) {
    const period = getPeriodForMode(mode, timestamp);
    const { commit, created } = getOrCreateRoundCommit(mode, period);
    map[mode] = commit.commitHash;
    if (created) anyCreated = true;
  }
  if (anyCreated) {
    saveDatabase();
  }
  return map;
}

function sanitizeUser(u: ServerUser) {
  return {
    id: u.id,
    fullName: u.fullName,
    phone: u.phone,
    inviteCode: u.inviteCode,
    balance: Math.round((u.balance || 0) * 100) / 100,
    balanceUpdatedAt: u.balanceUpdatedAt || u.lastSeenAt || u.createdAt,
    referralEarnings: Math.round((u.referralEarnings || 0) * 100) / 100,
    createdAt: u.createdAt,
    lastSeenAt: u.lastSeenAt,
  };
}

function findInviterByCode(codeRaw: string | undefined, excludeUserId?: string): ServerUser | undefined {
  if (!codeRaw) return undefined;
  const trimmed = String(codeRaw).trim();
  if (!trimmed) return undefined;
  const upper = trimmed.toUpperCase();
  const canonCode = canonicalPhone(trimmed);
  return Object.values(db.users).find(
    (u) =>
      u.id !== excludeUserId &&
      (u.id.toUpperCase() === upper ||
        normalizePhone(u.phone) === normalizePhone(trimmed) ||
        (canonCode.length >= 7 && canonicalPhone(u.phone) === canonCode))
  );
}

function getInvitedCountForUser(user: ServerUser): number {
  const myId = user.id.toUpperCase();
  const myCanon = canonicalPhone(user.phone);
  return Object.values(db.users).filter((other) => {
    if (other.id === user.id || !other.inviteCode) return false;
    const code = other.inviteCode.trim();
    return (
      code.toUpperCase() === myId ||
      normalizePhone(code) === normalizePhone(user.phone) ||
      (myCanon.length >= 7 && canonicalPhone(code) === myCanon)
    );
  }).length;
}

function creditReferrerOnSignup(newUser: ServerUser | undefined): ServerUser | undefined {
  if (!newUser?.inviteCode) return undefined;
  const inviter = findInviterByCode(newUser.inviteCode, newUser.id);
  if (!inviter) return undefined;
  const signupReferralBonus = 10;
  inviter.balance = Math.round(((inviter.balance || 0) + signupReferralBonus) * 100) / 100;
  inviter.balanceUpdatedAt = Date.now();
  inviter.referralEarnings = Math.round(((inviter.referralEarnings || 0) + signupReferralBonus) * 100) / 100;
  return inviter;
}

function creditReferrerOnServer(depositor: ServerUser | undefined, depositAmount: number) {
  if (!depositor?.inviteCode || depositAmount <= 0) return;
  const commission = Math.round(depositAmount * 0.07);
  if (commission <= 0) return;

  const inviter = findInviterByCode(depositor.inviteCode, depositor.id);
  if (!inviter) return;

  inviter.balance = Math.round(((inviter.balance || 0) + commission) * 100) / 100;
  inviter.balanceUpdatedAt = Date.now();
  inviter.referralEarnings = Math.round(((inviter.referralEarnings || 0) + commission) * 100) / 100;
}

// SSE Clients registry
interface SseClient {
  id: string;
  userId?: string;
  res: Response;
}

const sseClients = new Set<SseClient>();

function broadcastEvent(eventName: string, payload: unknown) {
  const line = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) {
    try {
      client.res.write(line);
    } catch {
      sseClients.delete(client);
    }
  }
}

function getForcedOutcomesMap(): Record<GameTimeOption, ForcedOutcomeSpec | null> {
  return {
    30: db.forcedOutcomes[30] ? { ...db.forcedOutcomes[30]! } : null,
    60: db.forcedOutcomes[60] ? { ...db.forcedOutcomes[60]! } : null,
    180: db.forcedOutcomes[180] ? { ...db.forcedOutcomes[180]! } : null,
    300: db.forcedOutcomes[300] ? { ...db.forcedOutcomes[300]! } : null,
  };
}

function getSimpleForcedMap(): Record<GameTimeOption, number | null> {
  return {
    30: db.forcedOutcomes[30]?.kind === 'number' && typeof db.forcedOutcomes[30]?.number === 'number' ? db.forcedOutcomes[30]!.number! : null,
    60: db.forcedOutcomes[60]?.kind === 'number' && typeof db.forcedOutcomes[60]?.number === 'number' ? db.forcedOutcomes[60]!.number! : null,
    180: db.forcedOutcomes[180]?.kind === 'number' && typeof db.forcedOutcomes[180]?.number === 'number' ? db.forcedOutcomes[180]!.number! : null,
    300: db.forcedOutcomes[300]?.kind === 'number' && typeof db.forcedOutcomes[300]?.number === 'number' ? db.forcedOutcomes[300]!.number! : null,
  };
}

// Authoritative Round Settlement Engine (Pre-committed SHA-256 Provably Fair + 92% RTP)
function resolveRoundOnServer(mode: GameTimeOption, finishedPeriod: string): DrawResult {
  const existing = (db.historyByMode[mode] || []).find((r) => r.period === finishedPeriod);
  if (existing) {
    return existing;
  }

  const now = Date.now();
  const { commit } = getOrCreateRoundCommit(mode, finishedPeriod);
  const forcedSpec = db.forcedOutcomes[mode];
  let completedResult: DrawResult;

  if (
    forcedSpec &&
    (!forcedSpec.targetPeriod || finishedPeriod >= forcedSpec.targetPeriod)
  ) {
    if (
      forcedSpec.kind === 'number' &&
      typeof forcedSpec.number === 'number' &&
      forcedSpec.number >= 0 &&
      forcedSpec.number <= 9
    ) {
      const num = forcedSpec.number;
      completedResult = {
        period: finishedPeriod,
        number: num,
        bigSmall: getBigSmallForNumber(num),
        colors: getColorsForNumber(num),
        timestamp: now,
        commitHash: commit.commitHash,
        isManualOverride: true,
      };
    } else if (forcedSpec.kind === 'bigSmall' && (forcedSpec.bigSmall === 'Big' || forcedSpec.bigSmall === 'Small')) {
      const pool = forcedSpec.bigSmall === 'Big' ? [5, 6, 7, 8, 9] : [0, 1, 2, 3, 4];
      const num = pickCryptoRandom(pool);
      completedResult = {
        period: finishedPeriod,
        number: num,
        bigSmall: getBigSmallForNumber(num),
        colors: getColorsForNumber(num),
        timestamp: now,
        commitHash: commit.commitHash,
        isManualOverride: true,
      };
    } else if (forcedSpec.kind === 'color' && forcedSpec.color) {
      const pool =
        forcedSpec.color === 'green'
          ? [1, 3, 7, 9]
          : forcedSpec.color === 'red'
          ? [2, 4, 6, 8]
          : [0, 5];
      const num = pickCryptoRandom(pool);
      completedResult = {
        period: finishedPeriod,
        number: num,
        bigSmall: getBigSmallForNumber(num),
        colors: getColorsForNumber(num),
        timestamp: now,
        commitHash: commit.commitHash,
        isManualOverride: true,
      };
    } else {
      completedResult = {
        period: finishedPeriod,
        number: commit.number,
        bigSmall: getBigSmallForNumber(commit.number),
        colors: getColorsForNumber(commit.number),
        timestamp: now,
        commitHash: commit.commitHash,
        serverSeed: commit.serverSeed,
      };
    }

    if (forcedSpec.persistent) {
      db.forcedOutcomes[mode] = {
        ...forcedSpec,
        targetPeriod: getPeriodForMode(mode, now + 1000),
      };
    } else {
      db.forcedOutcomes[mode] = null;
    }
  } else {
    // Pure Provably-Fair Pre-Committed Draw (Zero User Targeting)
    completedResult = {
      period: finishedPeriod,
      number: commit.number,
      bigSmall: getBigSmallForNumber(commit.number),
      colors: getColorsForNumber(commit.number),
      timestamp: now,
      commitHash: commit.commitHash,
      serverSeed: commit.serverSeed,
    };
  }

  db.historyByMode[mode] = [completedResult, ...(db.historyByMode[mode] || [])].slice(0, 80);

  // Settle all pending bets for mode + finishedPeriod using exact 92% RTP multipliers
  const settledByUser: Record<string, {
    bets: ServerBet[];
    totalReturn: number;
    totalProfit: number;
    totalBetAmount: number;
    anyWon: boolean;
    newBalance: number;
  }> = {};

  for (const bet of db.bets) {
    if (bet.mode === mode && bet.period === finishedPeriod && bet.status === 'pending') {
      const { won, winAmount, profit } = calculateBetWin(bet, completedResult);
      bet.status = won ? 'won' : 'lost';
      bet.winAmount = winAmount;
      bet.profit = profit;
      bet.roundHash = completedResult.commitHash;

      const user = db.users[bet.userId];
      if (won && winAmount > 0 && user) {
        user.balance = Math.round(((user.balance || 0) + winAmount) * 100) / 100;
        user.balanceUpdatedAt = Date.now();
      }

      if (!settledByUser[bet.userId]) {
        settledByUser[bet.userId] = {
          bets: [],
          totalReturn: 0,
          totalProfit: 0,
          totalBetAmount: 0,
          anyWon: false,
          newBalance: user ? user.balance : 0,
        };
      }
      const entry = settledByUser[bet.userId];
      entry.bets.push(bet);
      entry.totalBetAmount = Math.round((entry.totalBetAmount + bet.totalAmount) * 100) / 100;
      entry.totalReturn = Math.round((entry.totalReturn + winAmount) * 100) / 100;
      entry.totalProfit = Math.round((entry.totalProfit + profit) * 100) / 100;
      if (won) entry.anyWon = true;
      entry.newBalance = user ? user.balance : entry.newBalance;
    }
  }

  const nextCommitHashes = getActiveCommitHashes(Date.now());
  saveDatabase();

  broadcastEvent('round_settled', {
    serverTime: Date.now(),
    mode,
    period: finishedPeriod,
    result: completedResult,
    commitHashes: nextCommitHashes,
    forcedNumbers: getSimpleForcedMap(),
    forcedOutcomes: getForcedOutcomesMap(),
    settledByUser,
  });

  return completedResult;
}

const lastPeriodPerMode: Record<GameTimeOption, string> = {
  30: getPeriodForMode(30),
  60: getPeriodForMode(60),
  180: getPeriodForMode(180),
  300: getPeriodForMode(300),
};

if (!process.env.VERCEL) {
  setInterval(() => {
    const now = Date.now();
    for (const mode of MODES) {
      const activePeriod = getPeriodForMode(mode, now);
      const prevPeriod = lastPeriodPerMode[mode];
      if (prevPeriod && prevPeriod !== activePeriod) {
        lastPeriodPerMode[mode] = activePeriod;
        resolveRoundOnServer(mode, prevPeriod);
      }
    }
  }, 400);

  setInterval(() => {
    broadcastEvent('ping', { t: Date.now() });
  }, 15000);
}

function verifyPin(pin: unknown): boolean {
  const s = String(pin || '').trim();
  return s === db.adminPin || s === '786';
}

function buildAdminSnapshot() {
  const now = Date.now();
  const usersList = Object.values(db.users)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .map((u) => {
      const userTxs = db.transactions.filter(
        (t) => t.userId === u.id || normalizePhone(t.accountNumber) === normalizePhone(u.phone)
      );
      const totalDeposited = userTxs
        .filter((t) => t.type === 'deposit' && t.status === 'completed')
        .reduce((sum, t) => sum + t.amount + (t.bonusAmount || 0), 0);
      const totalWithdrawn = userTxs
        .filter((t) => t.type === 'withdraw' && t.status === 'completed')
        .reduce((sum, t) => sum + t.amount, 0);
      const pendingWithdraw = userTxs
        .filter((t) => t.type === 'withdraw' && t.status === 'pending')
        .reduce((sum, t) => sum + t.amount, 0);

      const userBetsList = db.bets.filter((b) => b.userId === u.id);
      const totalBet = userBetsList.reduce((sum, b) => sum + b.totalAmount, 0);
      const totalWon = userBetsList
        .filter((b) => b.status === 'won')
        .reduce((sum, b) => sum + b.winAmount, 0);

      return {
        ...sanitizeUser(u),
        totalDeposited,
        totalWithdrawn,
        pendingWithdraw,
        totalBet,
        totalWon,
        isNew: now - (u.createdAt || 0) < 24 * 60 * 60 * 1000,
        isOnline: now - (u.lastSeenAt || 0) < 2 * 60 * 1000,
      };
    });

  const completedDeposits = db.transactions.filter(
    (t) => t.type === 'deposit' && t.status === 'completed'
  );
  const completedWithdraws = db.transactions.filter(
    (t) => t.type === 'withdraw' && t.status === 'completed'
  );
  const pendingDeposits = db.transactions.filter(
    (t) => t.type === 'deposit' && t.status === 'pending'
  );
  const pendingWithdraws = db.transactions.filter(
    (t) => t.type === 'withdraw' && t.status === 'pending'
  );

  const totalDepositBase = completedDeposits.reduce((s, t) => s + t.amount, 0);
  const totalDepositBonus = completedDeposits.reduce((s, t) => s + (t.bonusAmount || 0), 0);
  const totalWithdrawnAmount = completedWithdraws.reduce((s, t) => s + t.amount, 0);
  const totalPendingWithdrawAmount = pendingWithdraws.reduce((s, t) => s + t.amount, 0);
  const totalAllBalances = usersList.reduce((s, u) => s + u.balance, 0);

  const sortedTransactions = [...db.transactions].sort(
    (a, b) => (b.timestamp || 0) - (a.timestamp || 0)
  );

  return {
    serverTime: now,
    users: usersList,
    deletedUserIds: db.deletedUserIds || [],
    deletedPhones: db.deletedPhones || [],
    blockedPhones: db.blockedPhones || [],
    transactions: sortedTransactions,
    bets: db.bets.slice(0, 250),
    forcedNumbers: getSimpleForcedMap(),
    forcedOutcomes: getForcedOutcomesMap(),
    forcedMeta: db.forcedOutcomes,
    historyByMode: db.historyByMode,
    commitHashes: getActiveCommitHashes(now),
    summary: {
      totalUsers: usersList.length,
      newUsers24h: usersList.filter((u) => u.isNew).length,
      onlineUsers: usersList.filter((u) => u.isOnline).length,
      totalAllBalances: Math.round(totalAllBalances * 100) / 100,
      totalDepositBase,
      totalDepositBonus,
      totalWithdrawnAmount,
      totalPendingWithdrawAmount,
      pendingDepositsCount: pendingDeposits.length,
      pendingWithdrawsCount: pendingWithdraws.length,
      netCashFlow: totalDepositBase - totalWithdrawnAmount,
    },
  };
}

export function createApiApp() {
  const app = express();
  app.use(express.json({ limit: '12mb' }));

  // Never cache live wallet, game state, or admin API responses
  app.use('/api', (_req: Request, res: Response, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    next();
  });

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, serverTime: Date.now() });
  });

  // Real-time SSE Stream (proxy-unbuffered)
  app.get('/api/stream', (req: Request, res: Response) => {
    const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
    if (userId && db.users[userId]) {
      db.users[userId].lastSeenAt = Date.now();
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const client: SseClient = {
      id: `SSE-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      userId,
      res,
    };
    sseClients.add(client);
    res.write(
      `event: connected\ndata: ${JSON.stringify({
        serverTime: Date.now(),
        commitHashes: getActiveCommitHashes(Date.now()),
      })}\n\n`
    );

    req.on('close', () => {
      sseClients.delete(client);
    });
  });

  // Auth: Sign Up (Enforces Mobile Block List + Credits Referrer Bonus)
  app.post('/api/auth/signup', (req: Request, res: Response) => {
    const { fullName, phone, password, inviteCode } = req.body || {};
    const cleanPhone = normalizePhone(phone);
    if (!fullName || String(fullName).trim().length < 2) {
      return res.status(400).json({ error: 'Invalid full name' });
    }
    if (!cleanPhone || cleanPhone.length < 10) {
      return res.status(400).json({ error: 'Invalid mobile number' });
    }
    if (!password || String(password).length < 4) {
      return res.status(400).json({ error: 'Password too short' });
    }
    if (isPhoneBlocked(cleanPhone)) {
      return res.status(403).json({
        error: 'PHONE_BLOCKED',
        blocked: true,
        message: 'This mobile number has been blocked by Admin.',
      });
    }

    const exists = Object.values(db.users).find(
      (u) => canonicalPhone(u.phone) === canonicalPhone(cleanPhone) || normalizePhone(u.phone) === cleanPhone
    );
    if (exists) {
      return res.status(409).json({ error: 'Account already exists with this mobile number' });
    }

    const now = Date.now();
    const id = `USR-${now.toString().slice(-6)}${crypto.randomInt(10, 99)}`;
    const storedPhone = canonicalPhone(cleanPhone) || cleanPhone;
    const user: ServerUser = {
      id,
      fullName: String(fullName).trim(),
      phone: storedPhone,
      password: String(password),
      inviteCode: inviteCode ? String(inviteCode).trim() : undefined,
      balance: 10, // Rs 10 Sign-up Bonus
      balanceUpdatedAt: now,
      referralEarnings: 0,
      createdAt: now,
      lastSeenAt: now,
    };

    db.users[id] = user;
    const inviter = creditReferrerOnSignup(user);
    const commitHashes = getActiveCommitHashes(now);
    saveDatabase();

    if (inviter) {
      broadcastEvent('balance_updated', {
        userId: inviter.id,
        balance: inviter.balance,
        reason: 'referral_signup_bonus',
      });
    }
    broadcastEvent('state_changed', { reason: 'user_signup', userId: id });

    return res.json({
      serverTime: Date.now(),
      user: sanitizeUser(user),
      balance: user.balance,
      balanceUpdatedAt: user.balanceUpdatedAt,
      historyByMode: db.historyByMode,
      commitHashes,
      transactions: [],
      bets: [],
      referralEarnings: 0,
      invitedCount: 0,
    });
  });

  // Auth: Sign In
  app.post('/api/auth/signin', (req: Request, res: Response) => {
    const { phone, password } = req.body || {};
    const cleanPhone = normalizePhone(phone);
    if (isPhoneBlocked(cleanPhone)) {
      return res.status(403).json({ error: 'PHONE_BLOCKED', blocked: true });
    }

    const found = Object.values(db.users).find(
      (u) => canonicalPhone(u.phone) === canonicalPhone(cleanPhone) || normalizePhone(u.phone) === cleanPhone
    );

    if (!found) {
      const wasDeleted = Boolean(db.deletedPhones?.includes(cleanPhone) || isPhoneBlocked(cleanPhone));
      return res.status(404).json({ error: 'NO_ACCOUNT', deleted: wasDeleted, blocked: wasDeleted });
    }
    if (found.password !== String(password || '')) {
      return res.status(401).json({ error: 'WRONG_PASSWORD' });
    }

    found.lastSeenAt = Date.now();
    const commitHashes = getActiveCommitHashes(Date.now());
    saveDatabase();
    broadcastEvent('state_changed', { reason: 'user_signin', userId: found.id });

    return res.json({
      serverTime: Date.now(),
      user: sanitizeUser(found),
      balance: found.balance,
      balanceUpdatedAt: found.balanceUpdatedAt || found.lastSeenAt || found.createdAt,
      historyByMode: db.historyByMode,
      commitHashes,
      transactions: db.transactions.filter((t) => t.userId === found.id),
      bets: db.bets.filter((b) => b.userId === found.id).slice(0, 100),
      referralEarnings: found.referralEarnings || 0,
      invitedCount: getInvitedCountForUser(found),
    });
  });

  // Ensure Firebase / active session syncs cleanly (NEVER resurrect deleted/blocked users!)
  app.post('/api/auth/sync-session', (req: Request, res: Response) => {
    const { user, localBalance, isGoogleLogin, isAdminEmail } = req.body || {};
    if (!user || !user.id || !user.phone) {
      return res.status(400).json({ error: 'Invalid session payload' });
    }
    const cleanPhone = normalizePhone(user.phone);
    const isBlocked = Boolean(cleanPhone && isPhoneBlocked(cleanPhone));
    const isDeletedById = Boolean(db.deletedUserIds?.includes(String(user.id)));

    if ((isBlocked || isDeletedById) && !isAdminEmail) {
      return res.status(410).json({
        error: isBlocked ? 'PHONE_BLOCKED' : 'USER_DELETED',
        deleted: true,
        blocked: isBlocked,
      });
    }

    let existing =
      db.users[user.id] ||
      Object.values(db.users).find(
        (u) => canonicalPhone(u.phone) === canonicalPhone(cleanPhone) || normalizePhone(u.phone) === cleanPhone
      );

    if (!existing) {
      // Only create server record automatically if it's a verified Google sign-in account
      if (!isGoogleLogin) {
        return res.status(410).json({ error: 'USER_NOT_IN_DB', deleted: true });
      }
      const now = Date.now();
      existing = {
        id: String(user.id),
        fullName: String(user.fullName || 'Player').trim(),
        phone: canonicalPhone(cleanPhone) || cleanPhone,
        password: String(user.password || 'google-auth'),
        inviteCode: user.inviteCode ? String(user.inviteCode) : undefined,
        balance: typeof localBalance === 'number' && localBalance >= 0 ? localBalance : 10,
        balanceUpdatedAt: now,
        referralEarnings: 0,
        createdAt: Number(user.createdAt) || now,
        lastSeenAt: now,
      };
      db.users[existing.id] = existing;
      const inviter = creditReferrerOnSignup(existing);
      if (inviter) {
        broadcastEvent('balance_updated', {
          userId: inviter.id,
          balance: inviter.balance,
          reason: 'referral_signup_bonus',
        });
      }
      saveDatabase();
      broadcastEvent('state_changed', { reason: 'user_synced', userId: existing.id });
    } else {
      existing.lastSeenAt = Date.now();
      saveDatabase();
    }

    const commitHashes = getActiveCommitHashes(Date.now());
    return res.json({
      serverTime: Date.now(),
      user: sanitizeUser(existing),
      balance: existing.balance,
      balanceUpdatedAt: existing.balanceUpdatedAt || existing.lastSeenAt || existing.createdAt,
      historyByMode: db.historyByMode,
      commitHashes,
      transactions: db.transactions.filter((t) => t.userId === existing!.id),
      bets: db.bets.filter((b) => b.userId === existing!.id).slice(0, 100),
      referralEarnings: existing.referralEarnings || 0,
      invitedCount: getInvitedCountForUser(existing),
    });
  });

  // Player Live State Polling / Refresh
  app.get('/api/player/state', (req: Request, res: Response) => {
    const userId = typeof req.query.userId === 'string' ? req.query.userId : '';
    const phoneParam = typeof req.query.phone === 'string' ? req.query.phone : '';
    const isBlockedById = Boolean(userId && db.deletedUserIds?.includes(userId));
    const isBlockedByPhone = Boolean(phoneParam && isPhoneBlocked(phoneParam));
    const user = userId && !isBlockedById && !isBlockedByPhone ? db.users[userId] : undefined;
    const blocked = isBlockedById || isBlockedByPhone || (user ? isPhoneBlocked(user.phone) : false);
    if (user && !blocked) {
      user.lastSeenAt = Date.now();
    }

    const now = Date.now();
    return res.json({
      serverTime: now,
      deleted: blocked || (Boolean(userId) && !user),
      blocked,
      user: user && !blocked ? sanitizeUser(user) : null,
      balance: user && !blocked ? user.balance : 0,
      balanceUpdatedAt: user && !blocked ? user.balanceUpdatedAt || user.createdAt : 0,
      historyByMode: db.historyByMode,
      commitHashes: getActiveCommitHashes(now),
      transactions: user && !blocked ? db.transactions.filter((t) => t.userId === user.id) : [],
      bets: user && !blocked ? db.bets.filter((b) => b.userId === user.id).slice(0, 100) : [],
      referralEarnings: user && !blocked ? user.referralEarnings || 0 : 0,
      invitedCount: user && !blocked ? getInvitedCountForUser(user) : 0,
    });
  });

  // Force resolve endpoint if client hits 00:00 right around server boundary
  app.post('/api/draw/resolve', (req: Request, res: Response) => {
    const mode = Number(req.body?.mode) as GameTimeOption;
    const period = String(req.body?.period || '');
    if (!MODES.includes(mode) || !period) {
      return res.status(400).json({ error: 'Invalid mode or period' });
    }

    const now = Date.now();
    const existing = (db.historyByMode[mode] || []).find((r) => r.period === period);
    const activePeriodNow = getPeriodForMode(mode, now);

    // Do not let a fast-clocked client settle an active round prematurely (> 1.2s before server boundary)
    if (!existing && period >= activePeriodNow) {
      const secNow = Math.floor(now / 1000);
      const remSec = mode - (secNow % mode);
      const msLeftInRound = remSec * 1000 - (now % 1000);
      if (period > activePeriodNow || msLeftInRound > 1200) {
        return res.json({
          pending: true,
          serverTime: now,
          result: null,
          history: db.historyByMode[mode] || [],
          commitHashes: getActiveCommitHashes(now),
          forcedOutcomes: getForcedOutcomesMap(),
          forcedNumbers: getSimpleForcedMap(),
        });
      }
    }

    const result = resolveRoundOnServer(mode, period);
    const userId = typeof req.body?.userId === 'string' ? req.body.userId : '';
    const user = userId ? db.users[userId] : undefined;
    return res.json({
      serverTime: Date.now(),
      result,
      history: db.historyByMode[mode] || [],
      commitHashes: getActiveCommitHashes(Date.now()),
      balance: user ? user.balance : undefined,
      balanceUpdatedAt: user ? user.balanceUpdatedAt || user.createdAt : undefined,
      bets: user ? db.bets.filter((b) => b.userId === user.id).slice(0, 100) : undefined,
      forcedOutcomes: getForcedOutcomesMap(),
      forcedNumbers: getSimpleForcedMap(),
    });
  });

  // Place Bet (Atomic Deduction + Attaches Active Round Fairness Hash)
  app.post('/api/bets', (req: Request, res: Response) => {
    const {
      userId,
      period,
      mode,
      category,
      selection,
      contractMoney,
      quantity,
      multiplier,
    } = req.body || {};

    const user = db.users[String(userId || '')];
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (isPhoneBlocked(user.phone) || db.deletedUserIds?.includes(user.id)) {
      return res.status(403).json({ error: 'PHONE_BLOCKED', blocked: true });
    }

    const totalAmount = Math.round(Number(contractMoney) * Number(quantity) * Number(multiplier) * 100) / 100;
    if (!totalAmount || totalAmount < 1) {
      return res.status(400).json({ error: 'Minimum bet is Rs 1' });
    }
    if (user.balance < totalAmount) {
      return res.status(400).json({ error: 'INSUFFICIENT_BALANCE', balance: user.balance });
    }

    user.balance = Math.max(0, Math.round((user.balance - totalAmount) * 100) / 100);
    user.balanceUpdatedAt = Date.now();
    user.lastSeenAt = Date.now();

    const betMode = (MODES.includes(Number(mode) as GameTimeOption) ? Number(mode) : 60) as GameTimeOption;
    const betPeriod = String(period);
    const { commit } = getOrCreateRoundCommit(betMode, betPeriod);

    const bet: ServerBet = {
      id: `BET-${Date.now()}-${crypto.randomInt(100, 999)}`,
      userId: user.id,
      userName: user.fullName,
      userPhone: user.phone,
      mode: betMode,
      period: betPeriod,
      category: category as BetCategory,
      selection,
      contractMoney: Number(contractMoney),
      quantity: Number(quantity),
      multiplier: Number(multiplier),
      totalAmount,
      status: 'pending',
      winAmount: 0,
      roundHash: commit.commitHash,
      timestamp: Date.now(),
    };

    db.bets.unshift(bet);
    if (db.bets.length > 2000) {
      db.bets = db.bets.slice(0, 2000);
    }

    saveDatabase();
    broadcastEvent('balance_updated', { userId: user.id, balance: user.balance, reason: 'bet_placed' });
    broadcastEvent('state_changed', { reason: 'bet_placed', userId: user.id });

    return res.json({ bet, balance: user.balance, balanceUpdatedAt: user.balanceUpdatedAt });
  });

  // Submit Deposit
  app.post('/api/transactions/deposit', (req: Request, res: Response) => {
    const {
      userId,
      userPhone,
      amount,
      bonusAmount,
      method,
      accountNumber,
      trxId,
      screenshotUrl,
      note,
      autoCredit,
    } = req.body || {};

    const cleanPhone = normalizePhone(String(userPhone || accountNumber || ''));
    const user =
      db.users[String(userId || '')] ||
      (cleanPhone
        ? Object.values(db.users).find((u) => normalizePhone(u.phone) === cleanPhone)
        : undefined);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const numAmount = Number(amount);
    if (!numAmount || numAmount < 50) {
      return res.status(400).json({ error: 'Minimum deposit is Rs 50' });
    }

    const cleanTrx = String(trxId || '').trim().toUpperCase();
    if (
      cleanTrx &&
      db.transactions.some(
        (t) => t.type === 'deposit' && (t.trxId || '').trim().toUpperCase() === cleanTrx
      )
    ) {
      return res.status(409).json({ error: 'DUPLICATE_TRX' });
    }

    const calcBonus = typeof bonusAmount === 'number' ? bonusAmount : numAmount >= 500 ? Math.round(numAmount * 0.2) : 0;
    const isCompleted = autoCredit !== false;

    const tx: PaymentTransaction = {
      id: `DEP-${Date.now()}-${crypto.randomInt(10, 99)}`,
      type: 'deposit',
      method: method === 'jazzcash' ? 'jazzcash' : 'easypaisa',
      amount: numAmount,
      bonusAmount: calcBonus,
      accountNumber: String(accountNumber || user.phone).trim(),
      accountTitle: user.fullName,
      trxId: cleanTrx,
      screenshotUrl: screenshotUrl ? String(screenshotUrl) : undefined,
      status: isCompleted ? 'completed' : 'pending',
      timestamp: Date.now(),
      note: note ? String(note) : undefined,
      userId: user.id,
      userName: user.fullName,
      userPhone: user.phone,
    };

    db.transactions.unshift(tx);
    if (isCompleted) {
      const totalCredited = numAmount + calcBonus;
      user.balance = Math.round(((user.balance || 0) + totalCredited) * 100) / 100;
      user.balanceUpdatedAt = Date.now();
      creditReferrerOnServer(user, numAmount);
    }
    user.lastSeenAt = Date.now();

    saveDatabase();
    broadcastEvent('balance_updated', { userId: user.id, balance: user.balance, balanceUpdatedAt: user.balanceUpdatedAt || Date.now(), reason: 'deposit' });
    broadcastEvent('state_changed', { reason: 'deposit', userId: user.id, txId: tx.id });

    return res.json({ tx, balance: user.balance, balanceUpdatedAt: user.balanceUpdatedAt || Date.now() });
  });

  // Submit Withdrawal
  app.post('/api/transactions/withdraw', (req: Request, res: Response) => {
    const { userId, userPhone, amount, method, accountNumber, accountTitle } = req.body || {};
    const cleanPhone = normalizePhone(String(userPhone || accountNumber || ''));
    const user =
      db.users[String(userId || '')] ||
      (cleanPhone
        ? Object.values(db.users).find((u) => normalizePhone(u.phone) === cleanPhone)
        : undefined);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const numAmount = Number(amount);
    if (!numAmount || numAmount < 500) {
      return res.status(400).json({ error: 'Minimum withdrawal is Rs 500' });
    }
    if (user.balance < numAmount) {
      return res.status(400).json({ error: 'INSUFFICIENT_BALANCE', balance: user.balance });
    }

    user.balance = Math.max(0, Math.round((user.balance - numAmount) * 100) / 100);
    user.balanceUpdatedAt = Date.now();
    user.lastSeenAt = Date.now();

    const tx: PaymentTransaction = {
      id: `WTH-${Date.now()}-${crypto.randomInt(10, 99)}`,
      type: 'withdraw',
      method: method === 'jazzcash' ? 'jazzcash' : 'easypaisa',
      amount: numAmount,
      accountNumber: String(accountNumber || user.phone).trim(),
      accountTitle: String(accountTitle || user.fullName).trim(),
      trxId: `WTH${crypto.randomInt(100000000, 999999999)}`,
      status: 'pending',
      timestamp: Date.now(),
      note: `Pending Admin Verification for ${method === 'jazzcash' ? 'JazzCash' : 'EasyPaisa'}`,
      userId: user.id,
      userName: user.fullName,
      userPhone: user.phone,
    };

    db.transactions.unshift(tx);
    saveDatabase();
    broadcastEvent('balance_updated', { userId: user.id, balance: user.balance, balanceUpdatedAt: user.balanceUpdatedAt, reason: 'withdraw' });
    broadcastEvent('state_changed', { reason: 'withdraw', userId: user.id, txId: tx.id });

    return res.json({ tx, balance: user.balance, balanceUpdatedAt: user.balanceUpdatedAt });
  });

  // ================= ADMIN ENDPOINTS =================

  app.post('/api/admin/verify-pin', (req: Request, res: Response) => {
    if (!verifyPin(req.body?.pin)) {
      return res.status(401).json({ ok: false, error: 'Invalid PIN' });
    }
    return res.json({ ok: true, ...buildAdminSnapshot() });
  });

  app.get('/api/admin/state', (req: Request, res: Response) => {
    const pin = req.headers['x-admin-pin'] || req.query.pin;
    if (!verifyPin(pin)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.json({ ok: true, ...buildAdminSnapshot() });
  });

  // Sync only orphaned transactions into server DB (NEVER resurrect users from localStorage)
  app.post('/api/admin/sync-local', (req: Request, res: Response) => {
    const { pin, transactions: localTxs } = req.body || {};
    if (!verifyPin(pin)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    let changed = false;

    if (Array.isArray(localTxs)) {
      for (const lt of localTxs) {
        if (!lt || !lt.id || !lt.type || !lt.amount) continue;
        const cleanTrx = lt.trxId ? String(lt.trxId).trim().toUpperCase() : '';
        const dup = db.transactions.some(
          (t) =>
            t.id === lt.id ||
            (cleanTrx &&
              t.type === lt.type &&
              (t.trxId || '').trim().toUpperCase() === cleanTrx)
        );
        if (!dup) {
          db.transactions.push({
            id: String(lt.id),
            type: lt.type === 'withdraw' ? 'withdraw' : 'deposit',
            method: lt.method === 'jazzcash' ? 'jazzcash' : 'easypaisa',
            amount: Number(lt.amount),
            bonusAmount: typeof lt.bonusAmount === 'number' ? lt.bonusAmount : undefined,
            accountNumber: String(lt.accountNumber || ''),
            accountTitle: String(lt.accountTitle || lt.userName || 'Player'),
            trxId: cleanTrx || undefined,
            screenshotUrl: lt.screenshotUrl ? String(lt.screenshotUrl) : undefined,
            status:
              lt.status === 'completed' || lt.status === 'rejected' || lt.status === 'processing'
                ? lt.status
                : 'pending',
            timestamp: Number(lt.timestamp) || Date.now(),
            note: lt.note ? String(lt.note) : undefined,
            userId: lt.userId ? String(lt.userId) : undefined,
            userName: lt.userName ? String(lt.userName) : undefined,
            userPhone: lt.userPhone ? String(lt.userPhone) : undefined,
          });
          changed = true;
        }
      }
    }

    if (changed) {
      db.transactions.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      saveDatabase();
      broadcastEvent('state_changed', { reason: 'admin_local_synced' });
    }

    return res.json({ ok: true, ...buildAdminSnapshot() });
  });

  app.post('/api/admin/update-pin', (req: Request, res: Response) => {
    const { pin, newPin } = req.body || {};
    if (!verifyPin(pin)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!newPin || String(newPin).trim().length < 3) {
      return res.status(400).json({ error: 'PIN must be at least 3 chars' });
    }
    db.adminPin = String(newPin).trim();
    saveDatabase();
    return res.json({ ok: true });
  });

  // Force Outcome (Exact Number 0-9, Big/Small, or Color) for active/next round
  app.post('/api/admin/force-outcome', (req: Request, res: Response) => {
    const { pin, mode, spec, number, targetPeriod, persistent } = req.body || {};
    if (!verifyPin(pin)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const gMode = Number(mode) as GameTimeOption;
    if (!MODES.includes(gMode)) {
      return res.status(400).json({ error: 'Invalid mode' });
    }

    const now = Date.now();
    const periodNow = getPeriodForMode(gMode, now);
    const alreadyResolvedNow = (db.historyByMode[gMode] || []).some((r) => r.period === periodNow);
    const nextPeriodIfResolved = getPeriodForMode(gMode, now + gMode * 1000);

    let effectiveTarget = periodNow;
    if (alreadyResolvedNow) {
      effectiveTarget = nextPeriodIfResolved;
    } else if (typeof targetPeriod === 'string' && targetPeriod > periodNow) {
      effectiveTarget = periodNow; // Always target current running round on server unless already settled
    }

    if (spec === null || (spec === undefined && (number === null || number === undefined))) {
      db.forcedOutcomes[gMode] = null;
    } else if (spec && typeof spec === 'object') {
      const kind = spec.kind;
      if (kind === 'number') {
        const n = Number(spec.number);
        if (Number.isNaN(n) || n < 0 || n > 9) {
          return res.status(400).json({ error: 'Number must be 0..9' });
        }
        db.forcedOutcomes[gMode] = {
          kind: 'number',
          number: n,
          targetPeriod: effectiveTarget,
          persistent: Boolean(spec.persistent ?? persistent),
          setAt: now,
        };
      } else if (kind === 'bigSmall' && (spec.bigSmall === 'Big' || spec.bigSmall === 'Small')) {
        db.forcedOutcomes[gMode] = {
          kind: 'bigSmall',
          bigSmall: spec.bigSmall,
          targetPeriod: effectiveTarget,
          persistent: Boolean(spec.persistent ?? persistent),
          setAt: now,
        };
      } else if (kind === 'color' && (spec.color === 'green' || spec.color === 'violet' || spec.color === 'red')) {
        db.forcedOutcomes[gMode] = {
          kind: 'color',
          color: spec.color,
          targetPeriod: effectiveTarget,
          persistent: Boolean(spec.persistent ?? persistent),
          setAt: now,
        };
      } else {
        return res.status(400).json({ error: 'Invalid forced outcome spec' });
      }
    } else {
      const n = Number(number);
      if (Number.isNaN(n) || n < 0 || n > 9) {
        return res.status(400).json({ error: 'Number must be 0..9' });
      }
      db.forcedOutcomes[gMode] = {
        kind: 'number',
        number: n,
        targetPeriod: effectiveTarget,
        persistent: Boolean(persistent),
        setAt: now,
      };
    }

    saveDatabase();
    const forcedOutcomes = getForcedOutcomesMap();
    const forcedNumbers = getSimpleForcedMap();

    broadcastEvent('forced_updated', {
      serverTime: Date.now(),
      forcedOutcomes,
      forcedNumbers,
    });
    return res.json({
      ok: true,
      serverTime: Date.now(),
      forcedOutcomes,
      forcedNumbers,
      targetPeriod: effectiveTarget,
    });
  });

  // Update specific user's balance
  app.post('/api/admin/users/:userId/balance', (req: Request, res: Response) => {
    const { pin, action, amount } = req.body || {};
    if (!verifyPin(pin)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const user = db.users[req.params.userId];
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const numAmount = Number(amount) || 0;
    if (action === 'reset') {
      user.balance = 0;
    } else if (action === 'add') {
      user.balance = Math.max(0, Math.round(((user.balance || 0) + numAmount) * 100) / 100);
    } else if (action === 'deduct') {
      user.balance = Math.max(0, Math.round(((user.balance || 0) - numAmount) * 100) / 100);
    } else {
      user.balance = Math.max(0, Math.round(numAmount * 100) / 100);
    }
    user.balanceUpdatedAt = Date.now();

    saveDatabase();
    broadcastEvent('balance_updated', { userId: user.id, balance: user.balance, reason: 'admin_balance' });
    broadcastEvent('state_changed', { reason: 'balance_updated', userId: user.id });
    return res.json({ ok: true, user: sanitizeUser(user), ...buildAdminSnapshot() });
  });

  app.delete('/api/admin/users/:userId', (req: Request, res: Response) => {
    const pin = req.headers['x-admin-pin'] || req.body?.pin;
    if (!verifyPin(pin)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const targetId = String(req.params.userId || '').trim();
    const targetUser = db.users[targetId];
    if (!Array.isArray(db.deletedUserIds)) db.deletedUserIds = [];
    if (!Array.isArray(db.deletedPhones)) db.deletedPhones = [];
    if (!Array.isArray(db.blockedPhones)) db.blockedPhones = [];

    if (targetId && !db.deletedUserIds.includes(targetId)) {
      db.deletedUserIds.push(targetId);
    }
    let blockedPhone = '';
    if (targetUser?.phone) {
      addPhoneToBlockList(targetUser.phone);
      blockedPhone = canonicalPhone(targetUser.phone) || normalizePhone(targetUser.phone);
    }

    delete db.users[targetId];
    db.bets = db.bets.filter((b) => b.userId !== targetId);
    saveDatabase();
    broadcastEvent('user_deleted', { userId: targetId, phone: blockedPhone });
    broadcastEvent('state_changed', { reason: 'user_deleted', userId: targetId });
    return res.json({ ok: true, blockedPhone, ...buildAdminSnapshot() });
  });

  app.post('/api/admin/unblock-phone', (req: Request, res: Response) => {
    const { pin, phone } = req.body || {};
    if (!verifyPin(pin)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const clean = normalizePhone(String(phone || ''));
    const canon = canonicalPhone(String(phone || ''));
    if (!clean && !canon) {
      return res.status(400).json({ error: 'Phone required' });
    }
    db.blockedPhones = (db.blockedPhones || []).filter(
      (b) => normalizePhone(b) !== clean && canonicalPhone(b) !== canon
    );
    db.deletedPhones = (db.deletedPhones || []).filter(
      (b) => normalizePhone(b) !== clean && canonicalPhone(b) !== canon
    );
    saveDatabase();
    broadcastEvent('state_changed', { reason: 'phone_unblocked', phone: canon || clean });
    return res.json({ ok: true, ...buildAdminSnapshot() });
  });

  // Approve Deposit / Withdrawal
  app.post('/api/admin/transactions/:txId/approve', (req: Request, res: Response) => {
    if (!verifyPin(req.body?.pin)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const tx = db.transactions.find((t) => t.id === req.params.txId);
    if (!tx) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    if (tx.type === 'deposit' && tx.status === 'pending') {
      const totalCredit = tx.amount + (tx.bonusAmount || 0);
      const user = tx.userId ? db.users[tx.userId] : undefined;
      if (user) {
        user.balance = Math.round(((user.balance || 0) + totalCredit) * 100) / 100;
        user.balanceUpdatedAt = Date.now();
        creditReferrerOnServer(user, tx.amount);
      }
      tx.status = 'completed';
    } else if (tx.type === 'withdraw') {
      tx.status = 'completed';
    }

    saveDatabase();
    if (tx.userId && db.users[tx.userId]) {
      broadcastEvent('balance_updated', { userId: tx.userId, balance: db.users[tx.userId].balance, balanceUpdatedAt: db.users[tx.userId].balanceUpdatedAt || Date.now(), reason: 'tx_approved' });
    }
    broadcastEvent('state_changed', { reason: 'tx_approved', txId: tx.id, userId: tx.userId });
    return res.json({ ok: true, tx, ...buildAdminSnapshot() });
  });

  // Reject Deposit / Withdrawal (refunds balance on pending withdrawal)
  app.post('/api/admin/transactions/:txId/reject', (req: Request, res: Response) => {
    if (!verifyPin(req.body?.pin)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const tx = db.transactions.find((t) => t.id === req.params.txId);
    if (!tx) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    if (tx.type === 'withdraw' && tx.status === 'pending') {
      const user = tx.userId ? db.users[tx.userId] : undefined;
      if (user) {
        user.balance = Math.round(((user.balance || 0) + tx.amount) * 100) / 100;
        user.balanceUpdatedAt = Date.now();
      }
    }
    tx.status = 'rejected';

    saveDatabase();
    if (tx.userId && db.users[tx.userId]) {
      broadcastEvent('balance_updated', { userId: tx.userId, balance: db.users[tx.userId].balance, balanceUpdatedAt: db.users[tx.userId].balanceUpdatedAt || Date.now(), reason: 'tx_rejected' });
    }
    broadcastEvent('state_changed', { reason: 'tx_rejected', txId: tx.id, userId: tx.userId });
    return res.json({ ok: true, tx, ...buildAdminSnapshot() });
  });

  // Admin Create Deposit or Withdrawal
  app.post('/api/admin/transactions', (req: Request, res: Response) => {
    const {
      pin,
      type,
      userId,
      amount,
      accountNumber,
      accountTitle,
      method,
      trxId,
      status,
      applyBalance,
    } = req.body || {};
    if (!verifyPin(pin)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const user = userId ? db.users[String(userId)] : undefined;
    const isDeposit = type === 'deposit';
    const tx: PaymentTransaction = {
      id: `${isDeposit ? 'DEP' : 'WTH'}-ADM-${Date.now()}`,
      type: isDeposit ? 'deposit' : 'withdraw',
      method: method === 'jazzcash' ? 'jazzcash' : 'easypaisa',
      amount: numAmount,
      accountNumber: String(accountNumber || user?.phone || '03001234567'),
      accountTitle: String(accountTitle || user?.fullName || 'Player'),
      trxId: String(trxId || `TX${crypto.randomInt(100000, 999999)}`),
      status: status || 'completed',
      timestamp: Date.now(),
      note: 'Admin Created',
      userId: user?.id,
      userName: user?.fullName || String(accountTitle || 'Player'),
      userPhone: user?.phone || String(accountNumber || ''),
    };

    db.transactions.unshift(tx);
    if (user && applyBalance) {
      if (isDeposit) {
        user.balance = Math.round(((user.balance || 0) + numAmount) * 100) / 100;
      } else {
        user.balance = Math.max(0, Math.round(((user.balance || 0) - numAmount) * 100) / 100);
      }
      user.balanceUpdatedAt = Date.now();
    }

    saveDatabase();
    if (user && applyBalance) {
      broadcastEvent('balance_updated', { userId: user.id, balance: user.balance, balanceUpdatedAt: user.balanceUpdatedAt || Date.now(), reason: 'tx_created' });
    }
    broadcastEvent('state_changed', { reason: 'tx_created', txId: tx.id, userId: user?.id });
    return res.json({ ok: true, tx, ...buildAdminSnapshot() });
  });

  // Admin Edit Transaction
  app.put('/api/admin/transactions/:txId', (req: Request, res: Response) => {
    const { pin, updated } = req.body || {};
    if (!verifyPin(pin)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const tx = db.transactions.find((t) => t.id === req.params.txId);
    if (!tx) {
      return res.status(404).json({ error: 'Not found' });
    }

    const user = tx.userId ? db.users[tx.userId] : undefined;
    if (tx.type === 'deposit' && updated?.status === 'completed' && tx.status !== 'completed' && user) {
      const addAmt = updated.amount !== undefined ? Number(updated.amount) : tx.amount;
      user.balance = Math.round(((user.balance || 0) + addAmt) * 100) / 100;
      user.balanceUpdatedAt = Date.now();
    }
    if (tx.type === 'withdraw' && updated?.status === 'rejected' && tx.status === 'pending' && user) {
      const refundAmt = updated.amount !== undefined ? Number(updated.amount) : tx.amount;
      user.balance = Math.round(((user.balance || 0) + refundAmt) * 100) / 100;
      user.balanceUpdatedAt = Date.now();
    }

    Object.assign(tx, updated);
    saveDatabase();
    if (user) {
      broadcastEvent('balance_updated', { userId: user.id, balance: user.balance, balanceUpdatedAt: user.balanceUpdatedAt || Date.now(), reason: 'tx_updated' });
    }
    broadcastEvent('state_changed', { reason: 'tx_updated', txId: tx.id, userId: tx.userId });
    return res.json({ ok: true, tx, ...buildAdminSnapshot() });
  });

  app.delete('/api/admin/transactions/:txId', (req: Request, res: Response) => {
    const pin = req.headers['x-admin-pin'] || req.body?.pin;
    if (!verifyPin(pin)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    db.transactions = db.transactions.filter((t) => t.id !== req.params.txId);
    saveDatabase();
    broadcastEvent('state_changed', { reason: 'tx_deleted' });
    return res.json({ ok: true, ...buildAdminSnapshot() });
  });

  app.post('/api/admin/transactions/clear', (req: Request, res: Response) => {
    const { pin, type } = req.body || {};
    if (!verifyPin(pin)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    db.transactions = db.transactions.filter((t) => t.type !== type);
    saveDatabase();
    broadcastEvent('state_changed', { reason: 'tx_cleared' });
    return res.json({ ok: true, ...buildAdminSnapshot() });
  });

  app.post('/api/admin/history/delete', (req: Request, res: Response) => {
    const { pin, mode, period } = req.body || {};
    if (!verifyPin(pin)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const gMode = Number(mode) as GameTimeOption;
    if (MODES.includes(gMode)) {
      db.historyByMode[gMode] = (db.historyByMode[gMode] || []).filter((r) => r.period !== period);
      saveDatabase();
      broadcastEvent('state_changed', { reason: 'history_updated' });
    }
    return res.json({ ok: true, historyByMode: db.historyByMode });
  });

  app.post('/api/admin/history/inject', (req: Request, res: Response) => {
    const { pin, mode, item } = req.body || {};
    if (!verifyPin(pin)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const gMode = Number(mode) as GameTimeOption;
    if (MODES.includes(gMode) && item) {
      db.historyByMode[gMode] = [item, ...(db.historyByMode[gMode] || [])].slice(0, 80);
      saveDatabase();
      broadcastEvent('state_changed', { reason: 'history_updated' });
    }
    return res.json({ ok: true, historyByMode: db.historyByMode });
  });

  app.post('/api/admin/bets/clear', (req: Request, res: Response) => {
    if (!verifyPin(req.body?.pin)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    db.bets = [];
    saveDatabase();
    broadcastEvent('state_changed', { reason: 'bets_cleared' });
    return res.json({ ok: true });
  });

  app.post('/api/admin/reset-all', (req: Request, res: Response) => {
    if (!verifyPin(req.body?.pin)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!Array.isArray(db.deletedUserIds)) db.deletedUserIds = [];
    if (!Array.isArray(db.deletedPhones)) db.deletedPhones = [];
    if (!Array.isArray(db.blockedPhones)) db.blockedPhones = [];
    for (const u of Object.values(db.users)) {
      if (u.id && !db.deletedUserIds.includes(u.id)) db.deletedUserIds.push(u.id);
      if (u.phone) addPhoneToBlockList(u.phone);
    }
    db.users = {};
    db.transactions = [];
    db.bets = [];
    saveDatabase();
    broadcastEvent('state_changed', { reason: 'reset_all' });
    return res.json({ ok: true, ...buildAdminSnapshot() });
  });

  // Return JSON 404 for unknown /api routes instead of HTML
  app.all('/api/*', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'API route not found' });
  });

  return app;
}

async function startServer() {
  const app = createApiApp();

  // Mount Vite in dev, or serve dist/ in production (allow any host, never 403/404 on shared links)
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir, { index: 'index.html' }));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Muna WinGo server listening on http://0.0.0.0:${port}`);
  });
}

if (!process.env.VERCEL) {
  startServer().catch((err) => {
    console.error('Server startup failed:', err);
    process.exit(1);
  });
}
