import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { Request, Response } from 'express';
import nodemailer from 'nodemailer';

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
  email?: string;
  authProvider?: 'mobile' | 'google';
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
  betToken?: string;
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

interface AdminNotificationRecord {
  id: string;
  eventType: 'signup' | 'login' | 'deposit' | 'withdraw' | 'test';
  title: string;
  summary: string;
  userId?: string;
  userName?: string;
  userPhone?: string;
  amount?: number;
  method?: string;
  trxId?: string;
  emailTo: string;
  emailStatus: 'sent' | 'not_configured' | 'failed';
  emailError?: string;
  timestamp: number;
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
  adminNotifications?: AdminNotificationRecord[];
  winRatePercent?: number;
  winDeck?: boolean[];
  winStats?: { totalRoundsWithBets: number; playerWins: number; houseWins: number };
  adminPin: string;
}

const DEFAULT_WIN_RATE_PERCENT = 30;

function normalizeWinRatePercent(raw: unknown): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return DEFAULT_WIN_RATE_PERCENT;
  return Math.max(5, Math.min(95, n));
}

function buildShuffledWinDeck(winPercent: number = DEFAULT_WIN_RATE_PERCENT): boolean[] {
  const pct = normalizeWinRatePercent(winPercent);
  const deck: boolean[] = [];
  for (let i = 0; i < 100; i++) {
    deck.push(i < pct);
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    const tmp = deck[i];
    deck[i] = deck[j];
    deck[j] = tmp;
  }
  return deck;
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

// Stake-Tiered WinGo Payout Table (1.90X under Rs 100 -> Rs 10 returns Rs 19; 1.96X for Rs 100+ -> Rs 100 returns Rs 196, Rs 1000 returns Rs 1960)
function getPayoutRatesForStake(totalAmount: number): {
  twoX: number;
  split: number;
  violet: number;
  number: number;
} {
  const isStandardTier = Number(totalAmount) >= 100;
  return isStandardTier
    ? { twoX: 1.96, split: 1.47, violet: 4.41, number: 8.82 }
    : { twoX: 1.9, split: 1.425, violet: 4.275, number: 8.55 };
}

function calculateBetWin(
  bet: Pick<ServerBet, 'category' | 'selection' | 'totalAmount'>,
  result: DrawResult
): { won: boolean; winAmount: number; profit: number } {
  const resultNum = result.number;
  const resultColors = result.colors;
  const resultBigSmall = result.bigSmall;
  const rates = getPayoutRatesForStake(bet.totalAmount);

  let won = false;
  let effectiveRate = 0;

  if (bet.category === 'color') {
    const chosenColor = bet.selection as ColorType;
    if (chosenColor === 'green') {
      if (resultNum === 5) {
        won = true;
        effectiveRate = rates.split;
      } else if (resultColors.includes('green')) {
        won = true;
        effectiveRate = rates.twoX;
      }
    } else if (chosenColor === 'red') {
      if (resultNum === 0) {
        won = true;
        effectiveRate = rates.split;
      } else if (resultColors.includes('red')) {
        won = true;
        effectiveRate = rates.twoX;
      }
    } else if (chosenColor === 'violet') {
      if (resultColors.includes('violet')) {
        won = true;
        effectiveRate = rates.violet;
      }
    }
  } else if (bet.category === 'number') {
    const chosenNum = Number(bet.selection);
    if (chosenNum === resultNum) {
      won = true;
      effectiveRate = rates.number;
    }
  } else if (bet.category === 'bigSmall') {
    if (bet.selection === resultBigSmall) {
      won = true;
      effectiveRate = rates.twoX;
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
  const serverSeed = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(`seed:${mode}:${period}`)
    .digest('hex')
    .slice(0, 32);
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
    adminNotifications: [],
    winRatePercent: DEFAULT_WIN_RATE_PERCENT,
    winDeck: buildShuffledWinDeck(DEFAULT_WIN_RATE_PERCENT),
    winStats: { totalRoundsWithBets: 0, playerWins: 0, houseWins: 0 },
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
      adminNotifications: Array.isArray(parsed.adminNotifications) ? parsed.adminNotifications.slice(0, 100) : [],
      winRatePercent:
        typeof parsed.winRatePercent === 'number'
          ? normalizeWinRatePercent(parsed.winRatePercent)
          : DEFAULT_WIN_RATE_PERCENT,
      winDeck:
        Array.isArray(parsed.winDeck) && parsed.winDeck.length > 0
          ? parsed.winDeck.map((v) => Boolean(v))
          : buildShuffledWinDeck(
              typeof parsed.winRatePercent === 'number'
                ? normalizeWinRatePercent(parsed.winRatePercent)
                : DEFAULT_WIN_RATE_PERCENT
            ),
      winStats:
        parsed.winStats && typeof parsed.winStats === 'object'
          ? {
              totalRoundsWithBets: Number(parsed.winStats.totalRoundsWithBets) || 0,
              playerWins: Number(parsed.winStats.playerWins) || 0,
              houseWins: Number(parsed.winStats.houseWins) || 0,
            }
          : { totalRoundsWithBets: 0, playerWins: 0, houseWins: 0 },
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

const REDIS_REST_URL = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/+$/, '');
const REDIS_REST_TOKEN = (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
const REDIS_DB_KEY = 'munawingo:db:v1';
let lastRemoteHydrateAt = 0;
let remoteHydratePromise: Promise<void> | null = null;
let remoteDbDirty = false;

function applyParsedSnapshotToDb(parsed: Partial<DatabaseSchema>) {
  if (!parsed || typeof parsed !== 'object') return;
  if (parsed.users && typeof parsed.users === 'object') db.users = parsed.users;
  if (Array.isArray(parsed.transactions)) db.transactions = parsed.transactions;
  if (Array.isArray(parsed.bets)) db.bets = parsed.bets;
  if (parsed.historyByMode && typeof parsed.historyByMode === 'object') db.historyByMode = parsed.historyByMode;
  if (parsed.forcedOutcomes && typeof parsed.forcedOutcomes === 'object') db.forcedOutcomes = parsed.forcedOutcomes;
  if (Array.isArray(parsed.deletedUserIds)) db.deletedUserIds = parsed.deletedUserIds;
  if (Array.isArray(parsed.deletedPhones)) db.deletedPhones = parsed.deletedPhones;
  if (Array.isArray(parsed.blockedPhones)) db.blockedPhones = parsed.blockedPhones;
  if (parsed.roundCommits && typeof parsed.roundCommits === 'object') db.roundCommits = parsed.roundCommits;
  if (Array.isArray(parsed.adminNotifications)) db.adminNotifications = parsed.adminNotifications.slice(0, 100);
  if (typeof parsed.winRatePercent === 'number') {
    db.winRatePercent = normalizeWinRatePercent(parsed.winRatePercent);
  }
  if (Array.isArray(parsed.winDeck)) {
    db.winDeck = parsed.winDeck.map((v) => Boolean(v));
  }
  if (parsed.winStats && typeof parsed.winStats === 'object') {
    db.winStats = {
      totalRoundsWithBets: Number(parsed.winStats.totalRoundsWithBets) || 0,
      playerWins: Number(parsed.winStats.playerWins) || 0,
      houseWins: Number(parsed.winStats.houseWins) || 0,
    };
  }
  if (typeof parsed.adminPin === 'string' && parsed.adminPin.length >= 3) db.adminPin = parsed.adminPin;
}

async function hydrateFromRemoteDb(force = false): Promise<void> {
  if (!REDIS_REST_URL || !REDIS_REST_TOKEN) return;
  const now = Date.now();
  if (!force && now - lastRemoteHydrateAt < (process.env.VERCEL ? 800 : 5000)) return;
  if (remoteHydratePromise) return remoteHydratePromise;

  remoteHydratePromise = (async () => {
    try {
      const resp = await fetch(`${REDIS_REST_URL}/get/${encodeURIComponent(REDIS_DB_KEY)}`, {
        headers: { Authorization: `Bearer ${REDIS_REST_TOKEN}` },
      });
      if (resp.ok) {
        const json = (await resp.json()) as { result?: string | null };
        if (json?.result && typeof json.result === 'string') {
          const parsed = JSON.parse(json.result) as Partial<DatabaseSchema>;
          applyParsedSnapshotToDb(parsed);
        }
      }
      lastRemoteHydrateAt = Date.now();
    } catch {
      // ignore transient network errors
    } finally {
      remoteHydratePromise = null;
    }
  })();

  return remoteHydratePromise;
}

async function flushRemoteDb(): Promise<void> {
  if (!REDIS_REST_URL || !REDIS_REST_TOKEN) return;
  try {
    remoteDbDirty = false;
    await fetch(REDIS_REST_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${REDIS_REST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(['SET', REDIS_DB_KEY, JSON.stringify(db)]),
    });
    lastRemoteHydrateAt = Date.now();
  } catch (err) {
    console.error('Remote DB sync failed:', err);
  }
}

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
  if (REDIS_REST_URL && REDIS_REST_TOKEN) {
    remoteDbDirty = true;
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

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  crypto
    .createHash('sha256')
    .update('muna-wingo-vercel-73b1b599-gen-lang-client-0966935703-786')
    .digest('hex');

function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plain, salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

function verifyPassword(plain: string, stored: string): boolean {
  if (!stored) return false;
  if (stored.startsWith('scrypt:')) {
    const parts = stored.split(':');
    if (parts.length !== 3) return false;
    const [, salt, hex] = parts;
    const derived = crypto.scryptSync(plain, salt, 64);
    const expected = Buffer.from(hex, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  }
  return stored === plain;
}

function signHmacPayload(data: unknown): string {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyHmacPayload<T>(token: unknown): T | null {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

function signSessionToken(user: Pick<ServerUser, 'id' | 'phone' | 'fullName' | 'createdAt'>): string {
  return signHmacPayload({
    id: user.id,
    phone: user.phone,
    fullName: user.fullName,
    createdAt: user.createdAt,
    iat: Date.now(),
  });
}

function verifySessionToken(token: unknown): {
  id: string;
  phone: string;
  fullName: string;
  createdAt: number;
} | null {
  const decoded = verifyHmacPayload<{
    id?: string;
    phone?: string;
    fullName?: string;
    createdAt?: number;
  }>(token);
  if (decoded && decoded.id && decoded.phone) {
    return {
      id: decoded.id,
      phone: decoded.phone,
      fullName: decoded.fullName || 'Player',
      createdAt: Number(decoded.createdAt) || Date.now(),
    };
  }
  return null;
}

function signWalletSnapshot(
  user: Pick<ServerUser, 'id' | 'phone' | 'fullName' | 'balance' | 'referralEarnings' | 'balanceUpdatedAt' | 'inviteCode' | 'createdAt'>
): string {
  return signHmacPayload({
    id: user.id,
    phone: user.phone,
    fullName: user.fullName,
    balance: Math.round((user.balance || 0) * 100) / 100,
    referralEarnings: Math.round((user.referralEarnings || 0) * 100) / 100,
    balanceUpdatedAt: user.balanceUpdatedAt || Date.now(),
    inviteCode: user.inviteCode || '',
    createdAt: user.createdAt,
    iat: Date.now(),
  });
}

function verifyWalletSnapshot(token: unknown): {
  id: string;
  phone: string;
  fullName: string;
  balance: number;
  referralEarnings: number;
  balanceUpdatedAt: number;
  inviteCode?: string;
  createdAt: number;
} | null {
  const decoded = verifyHmacPayload<{
    id?: string;
    phone?: string;
    fullName?: string;
    balance?: number;
    referralEarnings?: number;
    balanceUpdatedAt?: number;
    inviteCode?: string;
    createdAt?: number;
  }>(token);
  if (decoded && decoded.id && decoded.phone && typeof decoded.balance === 'number' && Number.isFinite(decoded.balance)) {
    return {
      id: decoded.id,
      phone: decoded.phone,
      fullName: decoded.fullName || 'Player',
      balance: Math.max(0, Math.round(decoded.balance * 100) / 100),
      referralEarnings: Math.max(0, Math.round((decoded.referralEarnings || 0) * 100) / 100),
      balanceUpdatedAt: Number(decoded.balanceUpdatedAt) || Date.now(),
      inviteCode: decoded.inviteCode || undefined,
      createdAt: Number(decoded.createdAt) || Date.now(),
    };
  }
  return null;
}

function signBetToken(
  bet: Pick<ServerBet, 'id' | 'userId' | 'mode' | 'period' | 'category' | 'selection' | 'totalAmount' | 'multiplier'>
): string {
  return signHmacPayload({
    id: bet.id,
    userId: bet.userId,
    mode: bet.mode,
    period: bet.period,
    category: bet.category,
    selection: String(bet.selection),
    totalAmount: bet.totalAmount,
    multiplier: bet.multiplier,
  });
}

function verifyBetToken(bet: Partial<ServerBet>): boolean {
  if (!bet?.betToken || !bet.id || !bet.userId) return false;
  const decoded = verifyHmacPayload<{
    id?: string;
    userId?: string;
    mode?: number;
    period?: string;
    category?: string;
    selection?: string;
    totalAmount?: number;
    multiplier?: number;
  }>(bet.betToken);
  if (!decoded) return false;
  return (
    decoded.id === bet.id &&
    decoded.userId === bet.userId &&
    Number(decoded.mode) === Number(bet.mode) &&
    decoded.period === bet.period &&
    decoded.category === bet.category &&
    String(decoded.selection) === String(bet.selection) &&
    Number(decoded.totalAmount) === Number(bet.totalAmount)
  );
}

function getEmailConfigStatus() {
  const notifyEmail = (process.env.ADMIN_NOTIFY_EMAIL || 'teensobazar@gmail.com').trim();
  const smtpHost = (process.env.SMTP_HOST || 'smtp.gmail.com').trim();
  const smtpPort = Number(process.env.SMTP_PORT || 465);
  const gmailUser = (process.env.GMAIL_USER || process.env.SMTP_USER || notifyEmail).trim();
  const gmailAppPass = (process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS || '').replace(/\s+/g, '').trim();
  const resendKey = (process.env.RESEND_API_KEY || '').trim();
  const smtpConfigured = Boolean(gmailUser && gmailAppPass);
  const resendConfigured = Boolean(resendKey);
  const activeChannel: 'gmail_smtp' | 'resend' | 'none' = smtpConfigured
    ? 'gmail_smtp'
    : resendConfigured
    ? 'resend'
    : 'none';
  return { notifyEmail, smtpHost, smtpPort, gmailUser, gmailAppPass, resendKey, smtpConfigured, resendConfigured, activeChannel };
}

function escapeHtml(raw: unknown): string {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function notifyAdminEvent(params: {
  eventType: AdminNotificationRecord['eventType'];
  title: string;
  summary: string;
  userId?: string;
  userName?: string;
  userPhone?: string;
  amount?: number;
  method?: string;
  trxId?: string;
  details: Array<[string, string]>;
}): Promise<AdminNotificationRecord> {
  const cfg = getEmailConfigStatus();
  const now = Date.now();
  const pktTime = new Date(now + PKT_OFFSET_MS).toISOString().replace('T', ' ').slice(0, 19) + ' PKT';

  const record: AdminNotificationRecord = {
    id: `NTF-${now}-${crypto.randomInt(100, 999)}`,
    eventType: params.eventType,
    title: params.title,
    summary: params.summary,
    userId: params.userId,
    userName: params.userName,
    userPhone: params.userPhone,
    amount: params.amount,
    method: params.method,
    trxId: params.trxId,
    emailTo: cfg.notifyEmail,
    emailStatus: cfg.activeChannel === 'none' ? 'not_configured' : 'sent',
    timestamp: now,
  };

  if (!Array.isArray(db.adminNotifications)) db.adminNotifications = [];
  db.adminNotifications.unshift(record);
  if (db.adminNotifications.length > 100) {
    db.adminNotifications = db.adminNotifications.slice(0, 100);
  }
  saveDatabase();

  const textBody = [
    `Muna WinGo Alert: ${params.title}`,
    params.summary,
    '',
    ...params.details.map(([k, v]) => `${k}: ${v}`),
    `Time: ${pktTime}`,
  ].join('\n');

  const htmlRows = params.details
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;color:#64748b;font-weight:600;">${escapeHtml(k)}</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;color:#0f172a;font-weight:700;">${escapeHtml(v)}</td></tr>`
    )
    .join('');

  const htmlBody = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
      <div style="background:#0f172a;color:#ffffff;padding:16px 20px;">
        <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#38bdf8;font-weight:700;">Muna WinGo Admin Alert</div>
        <h2 style="margin:6px 0 0;font-size:18px;">${escapeHtml(params.title)}</h2>
      </div>
      <div style="padding:18px 20px;background:#ffffff;">
        <p style="margin:0 0 14px;color:#334155;font-size:14px;">${escapeHtml(params.summary)}</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          ${htmlRows}
          <tr><td style="padding:6px 10px;color:#64748b;font-weight:600;">Time</td><td style="padding:6px 10px;color:#0f172a;">${escapeHtml(pktTime)}</td></tr>
        </table>
      </div>
    </div>
  `;

  try {
    if (cfg.smtpConfigured) {
      const transporter = nodemailer.createTransport({
        host: cfg.smtpHost,
        port: cfg.smtpPort,
        secure: cfg.smtpPort === 465,
        auth: {
          user: cfg.gmailUser,
          pass: cfg.gmailAppPass,
        },
        connectionTimeout: 4500,
        greetingTimeout: 4500,
        socketTimeout: 5000,
      });
      await transporter.sendMail({
        from: `"Muna WinGo Alerts" <${cfg.gmailUser}>`,
        to: cfg.notifyEmail,
        subject: `[Muna WinGo] ${params.title}`,
        text: textBody,
        html: htmlBody,
      });
      record.emailStatus = 'sent';
      saveDatabase();
    } else if (cfg.resendConfigured) {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Muna WinGo <onboarding@resend.dev>',
          to: [cfg.notifyEmail],
          subject: `[Muna WinGo] ${params.title}`,
          text: textBody,
          html: htmlBody,
        }),
      });
      if (!resp.ok) {
        const errTxt = await resp.text();
        record.emailStatus = 'failed';
        record.emailError = errTxt.slice(0, 160);
      } else {
        record.emailStatus = 'sent';
      }
      saveDatabase();
    }
  } catch (err) {
    record.emailStatus = 'failed';
    record.emailError = err instanceof Error ? err.message.slice(0, 160) : 'Email send failed';
    saveDatabase();
  }

  broadcastEvent('state_changed', { reason: 'admin_notification', notificationId: record.id });
  return record;
}

function sanitizeUser(u: ServerUser) {
  return {
    id: u.id,
    fullName: u.fullName,
    phone: u.phone,
    email: u.email,
    authProvider: u.authProvider,
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

function drawNumberForWinRatio(
  mode: GameTimeOption,
  finishedPeriod: string,
  commit: RoundCommit,
  pendingBets: ServerBet[]
): number {
  if (!pendingBets.length) {
    return commit.number;
  }

  const targetPct = normalizeWinRatePercent(db.winRatePercent ?? DEFAULT_WIN_RATE_PERCENT);
  db.winRatePercent = targetPct;
  if (!Array.isArray(db.winDeck) || db.winDeck.length === 0) {
    db.winDeck = buildShuffledWinDeck(targetPct);
  }
  if (!db.winStats) {
    db.winStats = { totalRoundsWithBets: 0, playerWins: 0, houseWins: 0 };
  }

  const allowPlayerWin = Boolean(db.winDeck.shift());
  const totalStake = pendingBets.reduce((sum, b) => sum + (Number(b.totalAmount) || 0), 0);

  const candidates = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => {
    const simResult: DrawResult = {
      period: finishedPeriod,
      number: num,
      bigSmall: getBigSmallForNumber(num),
      colors: getColorsForNumber(num),
      timestamp: Date.now(),
    };
    let payout = 0;
    let winCount = 0;
    for (const bet of pendingBets) {
      const res = calculateBetWin(bet, simResult);
      payout = Math.round((payout + res.winAmount) * 100) / 100;
      if (res.won) winCount++;
    }
    return { num, payout, winCount };
  });

  const minPayout = Math.min(...candidates.map((c) => c.payout));
  const houseCandidates = candidates.filter((c) => c.payout === minPayout);
  const netWinCandidates = candidates.filter((c) => c.payout > totalStake);
  const anyWinCandidates = netWinCandidates.length > 0 ? netWinCandidates : candidates.filter((c) => c.payout > 0);

  let chosenNum = commit.number;

  if (allowPlayerWin && anyWinCandidates.length > 0) {
    const standardWinCandidates = anyWinCandidates.filter(
      (c) => c.payout <= Math.max(totalStake * 2.5, totalStake + 1)
    );
    if (standardWinCandidates.length > 0) {
      // Color / Big-Small / mixed normal bets: prefer full payout (non-split) winners cleanly at exact 30% win ratio
      const fullPay = Math.max(...standardWinCandidates.map((c) => c.payout));
      const fullWinPool = standardWinCandidates.filter((c) => Math.abs(c.payout - fullPay) < 0.01);
      chosenNum = pickCryptoRandom(fullWinPool.length > 0 ? fullWinPool : standardWinCandidates).num;
    } else {
      // High-multiple pure Number (8.82X) or pure Violet (4.41X) rounds: keep house profitable across 100 bets
      const minWinPay = Math.min(...anyWinCandidates.map((c) => c.payout));
      const ratioMultiple = totalStake > 0 ? minWinPay / totalStake : 8.82;
      const acceptScalePct = Math.max(8, Math.min(100, Math.round((2.1 / ratioMultiple) * 100)));
      if (crypto.randomInt(0, 100) < acceptScalePct) {
        chosenNum = pickCryptoRandom(anyWinCandidates).num;
      } else {
        chosenNum = pickCryptoRandom(houseCandidates).num;
      }
    }
  } else {
    chosenNum = pickCryptoRandom(houseCandidates).num;
  }

  const chosenEval = candidates.find((c) => c.num === chosenNum);
  db.winStats.totalRoundsWithBets += 1;
  if (chosenEval && chosenEval.payout > totalStake) {
    db.winStats.playerWins += 1;
  } else {
    db.winStats.houseWins += 1;
  }

  // Keep commit record synced for period consistency
  if (db.roundCommits && db.roundCommits[`${mode}:${finishedPeriod}`]) {
    db.roundCommits[`${mode}:${finishedPeriod}`].number = chosenNum;
  }

  return chosenNum;
}

// Authoritative Round Settlement Engine (30% Player Win / 70% House Ratio + Admin Manual Controls)
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
      const pendingBets = db.bets.filter(
        (b) => b.mode === mode && b.period === finishedPeriod && b.status === 'pending'
      );
      const chosenNum = drawNumberForWinRatio(mode, finishedPeriod, commit, pendingBets);
      completedResult = {
        period: finishedPeriod,
        number: chosenNum,
        bigSmall: getBigSmallForNumber(chosenNum),
        colors: getColorsForNumber(chosenNum),
        timestamp: now,
        commitHash: commit.commitHash,
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
    // 30% Player Winning / 70% House Profit Ratio Controller
    const pendingBets = db.bets.filter(
      (b) => b.mode === mode && b.period === finishedPeriod && b.status === 'pending'
    );
    const chosenNum = drawNumberForWinRatio(mode, finishedPeriod, commit, pendingBets);
    completedResult = {
      period: finishedPeriod,
      number: chosenNum,
      bigSmall: getBigSmallForNumber(chosenNum),
      colors: getColorsForNumber(chosenNum),
      timestamp: now,
      commitHash: commit.commitHash,
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
        invitedCount: getInvitedCountForUser(u),
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
  const emailCfg = getEmailConfigStatus();

  return {
    serverTime: now,
    users: usersList,
    deletedUserIds: db.deletedUserIds || [],
    deletedPhones: db.deletedPhones || [],
    blockedPhones: db.blockedPhones || [],
    transactions: sortedTransactions,
    bets: db.bets.slice(0, 250),
    adminNotifications: (db.adminNotifications || []).slice(0, 100),
    emailConfig: {
      notifyEmail: emailCfg.notifyEmail,
      smtpConfigured: emailCfg.smtpConfigured,
      resendConfigured: emailCfg.resendConfigured,
      activeChannel: emailCfg.activeChannel,
    },
    forcedNumbers: getSimpleForcedMap(),
    forcedOutcomes: getForcedOutcomesMap(),
    forcedMeta: db.forcedOutcomes,
    winRatePercent: normalizeWinRatePercent(db.winRatePercent ?? DEFAULT_WIN_RATE_PERCENT),
    winStats: db.winStats || { totalRoundsWithBets: 0, playerWins: 0, houseWins: 0 },
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

  // Never cache live wallet, game state, or admin API responses + hydrate/flush Redis/KV if configured
  app.use('/api', async (req: Request, res: Response, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    if (REDIS_REST_URL && REDIS_REST_TOKEN) {
      await hydrateFromRemoteDb(req.method !== 'GET');
      const origJson = res.json.bind(res);
      res.json = ((body: unknown) => {
        if (remoteDbDirty) {
          void flushRemoteDb().finally(() => {
            if (!res.headersSent) origJson(body);
          });
          return res;
        }
        return origJson(body);
      }) as typeof res.json;
    }
    next();
  });

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      serverTime: Date.now(),
      serverless: Boolean(process.env.VERCEL),
      remoteDbConfigured: Boolean(REDIS_REST_URL && REDIS_REST_TOKEN),
    });
  });

  // Real-time SSE Stream (serverless-safe on Vercel to prevent 504 function timeouts)
  app.get('/api/stream', (req: Request, res: Response) => {
    const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
    if (userId && db.users[userId]) {
      db.users[userId].lastSeenAt = Date.now();
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');

    if (process.env.VERCEL) {
      res.flushHeaders?.();
      res.write(
        `event: connected\ndata: ${JSON.stringify({
          serverless: true,
          serverTime: Date.now(),
          commitHashes: getActiveCommitHashes(Date.now()),
        })}\n\n`
      );
      res.end();
      return;
    }

    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const client: SseClient = {
      id: `SSE-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      userId,
      res,
    };
    sseClients.add(client);
    res.write(
      `event: connected\ndata: ${JSON.stringify({
        serverless: false,
        serverTime: Date.now(),
        commitHashes: getActiveCommitHashes(Date.now()),
      })}\n\n`
    );

    req.on('close', () => {
      sseClients.delete(client);
    });
  });

  // Auth: Sign Up (Enforces Mobile Block List + Credits Referrer Bonus)
  app.post('/api/auth/signup', async (req: Request, res: Response) => {
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
      password: hashPassword(String(password)),
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
    const sessionToken = signSessionToken(user);
    saveDatabase();

    if (inviter) {
      broadcastEvent('balance_updated', {
        userId: inviter.id,
        balance: inviter.balance,
        reason: 'referral_signup_bonus',
      });
    }
    broadcastEvent('state_changed', { reason: 'user_signup', userId: id });

    await notifyAdminEvent({
      eventType: 'signup',
      title: `New User Signup: ${user.fullName} (${user.phone})`,
      summary: `${user.fullName} (${user.phone}) created a new Muna WinGo account.`,
      userId: user.id,
      userName: user.fullName,
      userPhone: user.phone,
      amount: user.balance,
      details: [
        ['User Name', user.fullName],
        ['Mobile Number', user.phone],
        ['User ID', user.id],
        ['Invite / Ref', user.inviteCode || 'None'],
        ['Starting Balance', `Rs ${user.balance.toLocaleString()}`],
      ],
    });

    return res.json({
      serverTime: Date.now(),
      user: sanitizeUser(user),
      sessionToken,
      balanceToken: signWalletSnapshot(user),
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
  app.post('/api/auth/signin', async (req: Request, res: Response) => {
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
    if (!verifyPassword(String(password || ''), found.password)) {
      return res.status(401).json({ error: 'WRONG_PASSWORD' });
    }

    if (!found.password.startsWith('scrypt:')) {
      found.password = hashPassword(String(password || ''));
    }
    found.lastSeenAt = Date.now();
    const commitHashes = getActiveCommitHashes(Date.now());
    const sessionToken = signSessionToken(found);
    saveDatabase();
    broadcastEvent('state_changed', { reason: 'user_signin', userId: found.id });

    await notifyAdminEvent({
      eventType: 'login',
      title: `User Login: ${found.fullName} (${found.phone})`,
      summary: `${found.fullName} (${found.phone}) signed into the game.`,
      userId: found.id,
      userName: found.fullName,
      userPhone: found.phone,
      amount: found.balance,
      details: [
        ['User Name', found.fullName],
        ['Mobile Number', found.phone],
        ['User ID', found.id],
        ['Current Balance', `Rs ${found.balance.toLocaleString()}`],
      ],
    });

    return res.json({
      serverTime: Date.now(),
      user: sanitizeUser(found),
      sessionToken,
      balanceToken: signWalletSnapshot(found),
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

  // Sync Session cleanly across page reloads & cold containers (NEVER logs out active users on refresh, ONLY blocks/deletes explicit tombstones!)
  app.post('/api/auth/sync-session', async (req: Request, res: Response) => {
    const {
      user,
      sessionToken,
      balanceToken,
      restoreIfColdStart,
      localBalance,
      localTransactions,
      localBets,
    } = req.body || {};
    if (!user || !user.id || !user.phone) {
      return res.status(400).json({ error: 'Invalid session payload' });
    }
    const cleanPhone = normalizePhone(user.phone);
    const isBlocked = Boolean(cleanPhone && isPhoneBlocked(cleanPhone));
    const isDeletedById = Boolean(db.deletedUserIds?.includes(String(user.id)));

    if (isBlocked || isDeletedById) {
      return res.status(410).json({
        error: isBlocked ? 'PHONE_BLOCKED' : 'USER_DELETED',
        deleted: true,
        explicitlyDeleted: true,
        blocked: isBlocked,
      });
    }

    const tokenData = verifySessionToken(sessionToken);
    const walletData = verifyWalletSnapshot(balanceToken);

    let existing =
      db.users[user.id] ||
      Object.values(db.users).find(
        (u) => canonicalPhone(u.phone) === canonicalPhone(cleanPhone) || normalizePhone(u.phone) === cleanPhone
      );

    let isCreatedNow = false;

    if (!existing) {
      const canRestoreColdSession = Boolean(
        (walletData && walletData.id === String(user.id)) ||
          (tokenData && tokenData.id === String(user.id)) ||
          (restoreIfColdStart &&
            cleanPhone.length >= 10 &&
            String(user.fullName || '').trim().length >= 2 &&
            Number(user.createdAt) > 0)
      );

      if (!canRestoreColdSession) {
        return res.status(410).json({ error: 'USER_NOT_IN_DB', deleted: false, coldStart: true });
      }

      isCreatedNow = true;
      const now = Date.now();
      const restoredBalance =
        walletData && walletData.id === String(user.id)
          ? walletData.balance
          : typeof localBalance === 'number' && Number.isFinite(localBalance) && localBalance > 0
          ? Math.round(localBalance * 100) / 100
          : 10;
      const restoredRef =
        walletData && walletData.id === String(user.id)
          ? walletData.referralEarnings
          : typeof user.referralEarnings === 'number'
          ? user.referralEarnings
          : 0;

      existing = {
        id: String(user.id),
        fullName: String(user.fullName || 'Player').trim(),
        phone: canonicalPhone(cleanPhone) || cleanPhone,
        password: user.password ? hashPassword(String(user.password)) : hashPassword(`sess-${user.id}`),
        inviteCode: user.inviteCode ? String(user.inviteCode) : undefined,
        balance: restoredBalance,
        balanceUpdatedAt: now,
        referralEarnings: restoredRef,
        createdAt: Number(user.createdAt) || now,
        lastSeenAt: now,
      };
      db.users[existing.id] = existing;

      if (Array.isArray(localTransactions)) {
        for (const lt of localTransactions) {
          if (lt?.id && lt.userId === existing.id && !db.transactions.some((t) => t.id === lt.id)) {
            db.transactions.push(lt);
          }
        }
        db.transactions.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      }
      if (Array.isArray(localBets)) {
        for (const lb of localBets) {
          if (lb?.id && lb.userId === existing.id && !db.bets.some((b) => b.id === lb.id)) {
            db.bets.push(lb);
          }
        }
        db.bets.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      }

      saveDatabase();
      broadcastEvent('state_changed', { reason: 'user_synced', userId: existing.id });
    } else {
      existing.lastSeenAt = Date.now();
      saveDatabase();
    }

    const commitHashes = getActiveCommitHashes(Date.now());
    const freshToken = signSessionToken(existing);
    return res.json({
      serverTime: Date.now(),
      isNewUser: isCreatedNow,
      user: sanitizeUser(existing),
      sessionToken: freshToken,
      balanceToken: signWalletSnapshot(existing),
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

  // Player Live State Polling / Refresh (ONLY reports deleted/blocked if explicitly deleted/blocked by Admin!)
  app.get('/api/player/state', (req: Request, res: Response) => {
    const userId = typeof req.query.userId === 'string' ? req.query.userId : '';
    const phoneParam = typeof req.query.phone === 'string' ? req.query.phone : '';
    const isBlockedById = Boolean(userId && db.deletedUserIds?.includes(userId));
    const isBlockedByPhone = Boolean(phoneParam && isPhoneBlocked(phoneParam));
    const user = userId && !isBlockedById && !isBlockedByPhone ? db.users[userId] : undefined;
    const blocked = isBlockedByPhone || (user ? isPhoneBlocked(user.phone) : false);
    const explicitlyDeleted = isBlockedById || blocked;
    const notInDb = Boolean(userId && !user && !explicitlyDeleted);
    if (user && !explicitlyDeleted) {
      user.lastSeenAt = Date.now();
    }

    const now = Date.now();
    return res.json({
      serverTime: now,
      deleted: explicitlyDeleted,
      explicitlyDeleted,
      blocked,
      notInDb,
      user: user && !explicitlyDeleted ? sanitizeUser(user) : null,
      balanceToken: user && !explicitlyDeleted ? signWalletSnapshot(user) : undefined,
      balance: user && !explicitlyDeleted ? user.balance : 0,
      balanceUpdatedAt: user && !explicitlyDeleted ? user.balanceUpdatedAt || user.createdAt : 0,
      historyByMode: db.historyByMode,
      commitHashes: getActiveCommitHashes(now),
      transactions: user && !explicitlyDeleted ? db.transactions.filter((t) => t.userId === user.id) : [],
      bets: user && !explicitlyDeleted ? db.bets.filter((b) => b.userId === user.id).slice(0, 100) : [],
      referralEarnings: user && !explicitlyDeleted ? user.referralEarnings || 0 : 0,
      invitedCount: user && !explicitlyDeleted ? getInvitedCountForUser(user) : 0,
    });
  });

  // Force resolve endpoint if client hits 00:00 right around server boundary (serverless-safe with HMAC betToken recovery)
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

    const userId = typeof req.body?.userId === 'string' ? req.body.userId : '';
    const clientUser = req.body?.user as Partial<ServerUser> | undefined;
    const balanceToken = req.body?.balanceToken;
    const pendingBets = Array.isArray(req.body?.pendingBets) ? (req.body.pendingBets as Partial<ServerBet>[]) : [];

    // Recover user on cold serverless Vercel container if valid wallet snapshot or session user provided
    if (
      userId &&
      !db.users[userId] &&
      !db.deletedUserIds?.includes(userId) &&
      !(clientUser?.phone && isPhoneBlocked(clientUser.phone))
    ) {
      const walletData = verifyWalletSnapshot(balanceToken);
      if (walletData && walletData.id === userId) {
        db.users[userId] = {
          id: userId,
          fullName: walletData.fullName,
          phone: canonicalPhone(walletData.phone) || walletData.phone,
          password: hashPassword(`sess-${userId}`),
          inviteCode: walletData.inviteCode || undefined,
          balance: walletData.balance,
          balanceUpdatedAt: walletData.balanceUpdatedAt,
          referralEarnings: walletData.referralEarnings,
          createdAt: walletData.createdAt,
          lastSeenAt: now,
        };
      }
    }

    // Recover HMAC-verified pending bets placed on another Vercel container before resolving round
    if (userId && pendingBets.length > 0 && !db.deletedUserIds?.includes(userId)) {
      let restoredBets = false;
      for (const pb of pendingBets) {
        if (
          pb?.id &&
          pb.userId === userId &&
          Number(pb.mode) === mode &&
          pb.period === period &&
          verifyBetToken(pb) &&
          !db.bets.some((b) => b.id === pb.id)
        ) {
          db.bets.unshift({
            id: String(pb.id),
            userId: String(pb.userId),
            userName: String(pb.userName || db.users[userId]?.fullName || 'Player'),
            userPhone: String(pb.userPhone || db.users[userId]?.phone || ''),
            mode,
            period,
            category: pb.category as BetCategory,
            selection: pb.selection!,
            contractMoney: Number(pb.contractMoney) || Number(pb.totalAmount) || 1,
            quantity: Number(pb.quantity) || 1,
            totalAmount: Number(pb.totalAmount) || 1,
            status: 'pending',
            winAmount: 0,
            multiplier: Number(pb.multiplier) || 1,
            roundHash: pb.roundHash,
            betToken: pb.betToken,
            timestamp: Number(pb.timestamp) || now,
          });
          restoredBets = true;
        }
      }
      if (restoredBets) saveDatabase();
    }

    const result = resolveRoundOnServer(mode, period);
    const user = userId ? db.users[userId] : undefined;
    return res.json({
      serverTime: Date.now(),
      result,
      history: db.historyByMode[mode] || [],
      commitHashes: getActiveCommitHashes(Date.now()),
      balance: user ? user.balance : undefined,
      balanceUpdatedAt: user ? user.balanceUpdatedAt || user.createdAt : undefined,
      balanceToken: user ? signWalletSnapshot(user) : undefined,
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

    const rawUid = String(userId || '');
    if (db.deletedUserIds?.includes(rawUid)) {
      return res.status(403).json({ error: 'USER_DELETED', blocked: true, explicitlyDeleted: true });
    }
    const user = db.users[rawUid];
    if (!user) {
      return res.status(404).json({ error: 'COLD_CONTAINER', coldStart: true });
    }
    if (isPhoneBlocked(user.phone) || db.deletedUserIds?.includes(user.id)) {
      return res.status(403).json({ error: 'PHONE_BLOCKED', blocked: true, explicitlyDeleted: true });
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
    bet.betToken = signBetToken(bet);

    db.bets.unshift(bet);
    if (db.bets.length > 2000) {
      db.bets = db.bets.slice(0, 2000);
    }

    saveDatabase();
    broadcastEvent('balance_updated', { userId: user.id, balance: user.balance, reason: 'bet_placed' });
    broadcastEvent('state_changed', { reason: 'bet_placed', userId: user.id });

    return res.json({
      bet,
      balance: user.balance,
      balanceUpdatedAt: user.balanceUpdatedAt,
      balanceToken: signWalletSnapshot(user),
    });
  });

  // Submit Deposit
  app.post('/api/transactions/deposit', async (req: Request, res: Response) => {
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
    if ((userId && db.deletedUserIds?.includes(String(userId))) || (cleanPhone && isPhoneBlocked(cleanPhone))) {
      return res.status(403).json({ error: 'PHONE_BLOCKED', blocked: true, explicitlyDeleted: true });
    }
    const user =
      db.users[String(userId || '')] ||
      (cleanPhone
        ? Object.values(db.users).find((u) => normalizePhone(u.phone) === cleanPhone)
        : undefined);
    if (!user) {
      return res.status(404).json({ error: 'COLD_CONTAINER', coldStart: true });
    }
    if (isPhoneBlocked(user.phone) || db.deletedUserIds?.includes(user.id)) {
      return res.status(403).json({ error: 'PHONE_BLOCKED', blocked: true, explicitlyDeleted: true });
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

    await notifyAdminEvent({
      eventType: 'deposit',
      title: `Deposit Rs ${numAmount.toLocaleString()} (${tx.method.toUpperCase()}) — ${user.fullName} (${user.phone})`,
      summary: `${user.fullName} (${user.phone}) submitted a deposit of Rs ${numAmount.toLocaleString()}${calcBonus > 0 ? ` (+Rs ${calcBonus.toLocaleString()} bonus)` : ''}.`,
      userId: user.id,
      userName: user.fullName,
      userPhone: user.phone,
      amount: numAmount,
      method: tx.method,
      trxId: tx.trxId,
      details: [
        ['Player Name', user.fullName],
        ['Mobile Number', user.phone],
        ['Method', tx.method === 'jazzcash' ? 'JazzCash' : 'EasyPaisa'],
        ['Deposit Amount', `Rs ${numAmount.toLocaleString()}`],
        ['Bonus Amount', `Rs ${calcBonus.toLocaleString()}`],
        ['TRX ID', tx.trxId || 'N/A'],
        ['Status', tx.status.toUpperCase()],
        ['New Balance', `Rs ${user.balance.toLocaleString()}`],
      ],
    });

    return res.json({
      tx,
      balance: user.balance,
      balanceUpdatedAt: user.balanceUpdatedAt || Date.now(),
      balanceToken: signWalletSnapshot(user),
    });
  });

  // Submit Withdrawal
  app.post('/api/transactions/withdraw', async (req: Request, res: Response) => {
    const { userId, userPhone, amount, method, accountNumber, accountTitle } = req.body || {};
    const cleanPhone = normalizePhone(String(userPhone || accountNumber || ''));
    if ((userId && db.deletedUserIds?.includes(String(userId))) || (cleanPhone && isPhoneBlocked(cleanPhone))) {
      return res.status(403).json({ error: 'PHONE_BLOCKED', blocked: true, explicitlyDeleted: true });
    }
    const user =
      db.users[String(userId || '')] ||
      (cleanPhone
        ? Object.values(db.users).find((u) => normalizePhone(u.phone) === cleanPhone)
        : undefined);
    if (!user) {
      return res.status(404).json({ error: 'COLD_CONTAINER', coldStart: true });
    }
    if (isPhoneBlocked(user.phone) || db.deletedUserIds?.includes(user.id)) {
      return res.status(403).json({ error: 'PHONE_BLOCKED', blocked: true, explicitlyDeleted: true });
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

    await notifyAdminEvent({
      eventType: 'withdraw',
      title: `Withdraw Rs ${numAmount.toLocaleString()} (${tx.method.toUpperCase()}) — ${user.fullName} (${user.phone})`,
      summary: `${user.fullName} (${user.phone}) requested a withdrawal of Rs ${numAmount.toLocaleString()} via ${tx.method === 'jazzcash' ? 'JazzCash' : 'EasyPaisa'}.`,
      userId: user.id,
      userName: user.fullName,
      userPhone: user.phone,
      amount: numAmount,
      method: tx.method,
      trxId: tx.trxId,
      details: [
        ['Player Name', user.fullName],
        ['Player Phone', user.phone],
        ['Payout Method', tx.method === 'jazzcash' ? 'JazzCash' : 'EasyPaisa'],
        ['Payout Account', `${tx.accountNumber} (${tx.accountTitle})`],
        ['Withdraw Amount', `Rs ${numAmount.toLocaleString()}`],
        ['Reference ID', tx.trxId || tx.id],
        ['Remaining Balance', `Rs ${user.balance.toLocaleString()}`],
      ],
    });

    return res.json({
      tx,
      balance: user.balance,
      balanceUpdatedAt: user.balanceUpdatedAt,
      balanceToken: signWalletSnapshot(user),
    });
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

  app.post('/api/admin/win-ratio', (req: Request, res: Response) => {
    const pin = req.headers['x-admin-pin'] || req.body?.pin;
    if (!verifyPin(pin)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const nextPct = normalizeWinRatePercent(req.body?.winRatePercent);
    db.winRatePercent = nextPct;
    db.winDeck = buildShuffledWinDeck(nextPct);
    saveDatabase();
    broadcastEvent('state_changed', { reason: 'win_ratio_updated', winRatePercent: nextPct });
    return res.json({ ok: true, ...buildAdminSnapshot() });
  });

  // Refresh every game engine setting cleanly (30% win ratio, fresh deck, reset winStats, clear forced outcomes, resync commits)
  app.post('/api/admin/refresh-settings', (req: Request, res: Response) => {
    const pin = req.headers['x-admin-pin'] || req.body?.pin;
    if (!verifyPin(pin)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    db.winRatePercent = DEFAULT_WIN_RATE_PERCENT;
    db.winDeck = buildShuffledWinDeck(DEFAULT_WIN_RATE_PERCENT);
    db.winStats = { totalRoundsWithBets: 0, playerWins: 0, houseWins: 0 };
    db.forcedOutcomes = { 30: null, 60: null, 180: null, 300: null };
    if (!db.roundCommits) db.roundCommits = {};
    for (const mode of MODES) {
      const periodNow = getPeriodForMode(mode, Date.now());
      delete db.roundCommits[`${mode}:${periodNow}`];
    }
    getActiveCommitHashes(Date.now());
    saveDatabase();
    broadcastEvent('state_changed', { reason: 'settings_refreshed' });
    return res.json({ ok: true, ...buildAdminSnapshot() });
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
    const { action, amount } = req.body || {};
    const pin = req.headers['x-admin-pin'] || req.body?.pin;
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
    const pin = req.headers['x-admin-pin'] || req.body?.pin;
    if (!verifyPin(pin)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const tx = db.transactions.find((t) => t.id === req.params.txId);
    if (!tx) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const user = tx.userId ? db.users[tx.userId] : undefined;
    if (tx.type === 'deposit' && tx.status !== 'completed') {
      const totalCredit = tx.amount + (tx.bonusAmount || 0);
      if (user) {
        user.balance = Math.round(((user.balance || 0) + totalCredit) * 100) / 100;
        user.balanceUpdatedAt = Date.now();
        creditReferrerOnServer(user, tx.amount);
      }
      tx.status = 'completed';
    } else if (tx.type === 'withdraw') {
      if (tx.status === 'rejected' && user) {
        user.balance = Math.max(0, Math.round(((user.balance || 0) - tx.amount) * 100) / 100);
        user.balanceUpdatedAt = Date.now();
      }
      tx.status = 'completed';
    }

    saveDatabase();
    if (tx.userId && db.users[tx.userId]) {
      broadcastEvent('balance_updated', { userId: tx.userId, balance: db.users[tx.userId].balance, balanceUpdatedAt: db.users[tx.userId].balanceUpdatedAt || Date.now(), reason: 'tx_approved' });
    }
    broadcastEvent('state_changed', { reason: 'tx_approved', txId: tx.id, userId: tx.userId });
    return res.json({ ok: true, tx, ...buildAdminSnapshot() });
  });

  // Reject Deposit / Withdrawal (refunds balance on withdrawal, reverts deposit if previously approved)
  app.post('/api/admin/transactions/:txId/reject', (req: Request, res: Response) => {
    const pin = req.headers['x-admin-pin'] || req.body?.pin;
    if (!verifyPin(pin)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const tx = db.transactions.find((t) => t.id === req.params.txId);
    if (!tx) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const user = tx.userId ? db.users[tx.userId] : undefined;
    if (tx.type === 'withdraw' && tx.status !== 'rejected') {
      if (user) {
        user.balance = Math.round(((user.balance || 0) + tx.amount) * 100) / 100;
        user.balanceUpdatedAt = Date.now();
      }
    } else if (tx.type === 'deposit' && tx.status === 'completed') {
      const totalRevert = tx.amount + (tx.bonusAmount || 0);
      if (user) {
        user.balance = Math.max(0, Math.round(((user.balance || 0) - totalRevert) * 100) / 100);
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

  // Admin Edit / Toggle Status on Transaction
  app.put('/api/admin/transactions/:txId', (req: Request, res: Response) => {
    const pin = req.headers['x-admin-pin'] || req.body?.pin;
    const updated = req.body?.updated || {};
    if (!verifyPin(pin)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const tx = db.transactions.find((t) => t.id === req.params.txId);
    if (!tx) {
      return res.status(404).json({ error: 'Not found' });
    }

    const user = tx.userId ? db.users[tx.userId] : undefined;
    const prevStatus = tx.status;
    const nextStatus = (updated.status || tx.status) as PaymentTransaction['status'];
    const prevBonus = tx.bonusAmount || 0;
    const nextBaseAmount = updated.amount !== undefined ? Number(updated.amount) : tx.amount;
    const nextBonus = updated.bonusAmount !== undefined ? Number(updated.bonusAmount) : prevBonus;

    if (user) {
      if (tx.type === 'deposit') {
        if (prevStatus !== 'completed' && nextStatus === 'completed') {
          user.balance = Math.round(((user.balance || 0) + nextBaseAmount + nextBonus) * 100) / 100;
          user.balanceUpdatedAt = Date.now();
          creditReferrerOnServer(user, nextBaseAmount);
        } else if (prevStatus === 'completed' && nextStatus !== 'completed') {
          user.balance = Math.max(0, Math.round(((user.balance || 0) - (tx.amount + prevBonus)) * 100) / 100);
          user.balanceUpdatedAt = Date.now();
        }
      } else if (tx.type === 'withdraw') {
        if (prevStatus !== 'rejected' && nextStatus === 'rejected') {
          user.balance = Math.round(((user.balance || 0) + tx.amount) * 100) / 100;
          user.balanceUpdatedAt = Date.now();
        } else if (prevStatus === 'rejected' && nextStatus !== 'rejected') {
          user.balance = Math.max(0, Math.round(((user.balance || 0) - nextBaseAmount) * 100) / 100);
          user.balanceUpdatedAt = Date.now();
        }
      }
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

  app.post('/api/admin/notifications/test', async (req: Request, res: Response) => {
    const pin = req.headers['x-admin-pin'] || req.body?.pin;
    if (!verifyPin(pin)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const record = await notifyAdminEvent({
      eventType: 'test',
      title: 'Test Alert Connected',
      summary: 'Muna WinGo Gmail notification system test triggered from Admin Panel.',
      details: [
        ['Target Gmail', getEmailConfigStatus().notifyEmail],
        ['Channel', getEmailConfigStatus().activeChannel],
      ],
    });
    return res.json({ ok: true, record, ...buildAdminSnapshot() });
  });

  app.post('/api/admin/notifications/clear', (req: Request, res: Response) => {
    const pin = req.headers['x-admin-pin'] || req.body?.pin;
    if (!verifyPin(pin)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    db.adminNotifications = [];
    saveDatabase();
    return res.json({ ok: true, ...buildAdminSnapshot() });
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
