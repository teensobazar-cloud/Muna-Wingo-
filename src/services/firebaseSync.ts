import { User, signInWithPopup, signOut } from 'firebase/auth';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { ADMIN_EMAIL, OperationType, auth, db, googleProvider, handleFirestoreError } from '../firebase';
import {
  BetCategory,
  DrawResult,
  ForcedOutcomeSpec,
  GameTimeOption,
  PaymentTransaction,
  RegisteredUser,
  UserBet,
} from '../types/game';
import { getBigSmallForNumber, getColorsForNumber } from '../utils/gameRules';

const VALID_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

export function sanitizeFirestoreId(raw: string, fallbackPrefix = 'ID'): string {
  const cleaned = String(raw || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  if (cleaned.length >= 1 && VALID_ID_REGEX.test(cleaned)) {
    return cleaned;
  }
  return `${fallbackPrefix}_${Date.now()}`;
}

function clampString(val: unknown, maxLen: number, fallback = ''): string {
  const s = String(val ?? fallback).trim();
  return s.slice(0, maxLen) || fallback.slice(0, maxLen);
}

function clampNumber(val: unknown, min: number, max: number, fallback = min): number {
  const n = Number(val);
  if (Number.isNaN(n) || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n * 100) / 100));
}

function normalizePhoneForSchema(raw: unknown, seed = ''): string {
  const stripped = String(raw || '').replace(/[^\d+]/g, '').slice(0, 24);
  if (stripped.length >= 7) return stripped;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return `03${String(hash).padStart(9, '0').slice(0, 9)}`;
}

function tsToMillis(val: unknown, fallback = Date.now()): number {
  if (val instanceof Timestamp) return val.toMillis();
  if (val && typeof (val as { toMillis?: () => number }).toMillis === 'function') {
    return (val as { toMillis: () => number }).toMillis();
  }
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  return fallback;
}

export function isVerifiedGoogleAdmin(user: User | null | undefined): boolean {
  return Boolean(
    user &&
      user.emailVerified === true &&
      user.email &&
      user.email.toLowerCase() === ADMIN_EMAIL
  );
}

export async function signInWithGoogleFirebase(): Promise<{
  firebaseUser: User;
  isAdminEmail: boolean;
}> {
  const cred = await signInWithPopup(auth, googleProvider);
  const firebaseUser = cred.user;
  return {
    firebaseUser,
    isAdminEmail: isVerifiedGoogleAdmin(firebaseUser),
  };
}

export async function signOutFirebase(): Promise<void> {
  try {
    await signOut(auth);
  } catch {
    // ignore signOut errors
  }
}

export async function ensureAdminDocument(firebaseUser: User): Promise<void> {
  if (!isVerifiedGoogleAdmin(firebaseUser)) return;
  const uid = sanitizeFirestoreId(firebaseUser.uid, 'ADM');
  const adminPath = `admins/${uid}`;
  try {
    const adminRef = doc(db, 'admins', uid);
    const snap = await getDocFromServer(adminRef);
    if (!snap.exists()) {
      await setDoc(adminRef, {
        uid,
        email: clampString(firebaseUser.email, 160, ADMIN_EMAIL),
        createdAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, adminPath);
  }
}

export async function ensureFirebaseUserDocuments(
  firebaseUser: User,
  opts?: { fullName?: string; phone?: string; inviteCode?: string }
): Promise<{
  user: RegisteredUser;
  balance: number;
  referralEarnings: number;
  isNewUser: boolean;
}> {
  const uid = sanitizeFirestoreId(firebaseUser.uid, 'USR');
  const userPath = `users/${uid}`;
  const privatePath = `users/${uid}/private/info`;

  let existingUserDoc: Record<string, unknown> | null = null;
  try {
    const snap = await getDocFromServer(doc(db, 'users', uid));
    if (snap.exists()) {
      existingUserDoc = snap.data();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, userPath);
  }

  let existingPrivateDoc: Record<string, unknown> | null = null;
  try {
    const privSnap = await getDocFromServer(doc(db, 'users', uid, 'private', 'info'));
    if (privSnap.exists()) {
      existingPrivateDoc = privSnap.data();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, privatePath);
  }

  const isNewUser = !existingUserDoc;
  const safeName = clampString(
    opts?.fullName || (existingUserDoc?.fullName as string) || firebaseUser.displayName || 'Player',
    80,
    'Player'
  );
  const safeInvite = opts?.inviteCode ? clampString(opts.inviteCode, 64) : '';

  let privatePhone = normalizePhoneForSchema(opts?.phone || firebaseUser.phoneNumber, uid);
  let privateEmail = firebaseUser.email ? clampString(firebaseUser.email, 160) : '';

  if (existingPrivateDoc) {
    if (typeof existingPrivateDoc.phone === 'string' && existingPrivateDoc.phone.length >= 7) {
      privatePhone = existingPrivateDoc.phone;
    }
    if (!privateEmail && typeof existingPrivateDoc.email === 'string') {
      privateEmail = existingPrivateDoc.email;
    }
  }

  if (!existingUserDoc && !existingPrivateDoc) {
    const createPayload: Record<string, unknown> = {
      uid,
      fullName: safeName,
      balance: 10,
      referralEarnings: 0,
      role: 'player',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (safeInvite) {
      createPayload.inviteCode = safeInvite;
    }
    const privPayload: Record<string, unknown> = {
      uid,
      phone: privatePhone,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (privateEmail) {
      privPayload.email = privateEmail;
    }

    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'users', uid), createPayload);
      batch.set(doc(db, 'users', uid, 'private', 'info'), privPayload);
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, privatePath);
    }
  } else {
    if (!existingUserDoc) {
      const createPayload: Record<string, unknown> = {
        uid,
        fullName: safeName,
        balance: 10,
        referralEarnings: 0,
        role: 'player',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (safeInvite) {
        createPayload.inviteCode = safeInvite;
      }
      try {
        await setDoc(doc(db, 'users', uid), createPayload);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, userPath);
      }
    }

    if (!existingPrivateDoc) {
      const privPayload: Record<string, unknown> = {
        uid,
        phone: privatePhone,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (privateEmail) {
        privPayload.email = privateEmail;
      }
      try {
        await setDoc(doc(db, 'users', uid, 'private', 'info'), privPayload);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, privatePath);
      }
    }
  }

  if (isVerifiedGoogleAdmin(firebaseUser)) {
    await ensureAdminDocument(firebaseUser);
  }

  const balance = existingUserDoc ? clampNumber(existingUserDoc.balance, 0, 100000000, 10) : 10;
  const referralEarnings = existingUserDoc
    ? clampNumber(existingUserDoc.referralEarnings, 0, 100000000, 0)
    : 0;
  const createdAt = existingUserDoc ? tsToMillis(existingUserDoc.createdAt) : Date.now();

  return {
    user: {
      id: uid,
      fullName: safeName,
      phone: privatePhone,
      email: privateEmail || undefined,
      authProvider: 'google',
      inviteCode: (existingUserDoc?.inviteCode as string | undefined) || safeInvite || undefined,
      balance,
      referralEarnings,
      createdAt,
      lastSeenAt: Date.now(),
    },
    balance,
    referralEarnings,
    isNewUser,
  };
}

export async function syncPlayerBalanceToFirestore(uid: string, balance: number): Promise<void> {
  if (!auth.currentUser?.emailVerified) return;
  const safeUid = sanitizeFirestoreId(uid, 'USR');
  if (auth.currentUser.uid !== safeUid && !isVerifiedGoogleAdmin(auth.currentUser)) return;
  const path = `users/${safeUid}`;
  try {
    await updateDoc(doc(db, 'users', safeUid), {
      balance: clampNumber(balance, 0, 100000000, 0),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function adminUpsertUserToFirestore(user: RegisteredUser): Promise<void> {
  if (!isVerifiedGoogleAdmin(auth.currentUser)) return;
  const safeUid = sanitizeFirestoreId(user.id, 'USR');
  const userPath = `users/${safeUid}`;
  const privPath = `users/${safeUid}/private/info`;

  let snapData: Record<string, unknown> | null = null;
  let docExists = false;
  try {
    const snap = await getDocFromServer(doc(db, 'users', safeUid));
    docExists = snap.exists();
    snapData = docExists ? (snap.data() as Record<string, unknown>) : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, userPath);
  }

  let privExists = false;
  try {
    const privSnap = await getDocFromServer(doc(db, 'users', safeUid, 'private', 'info'));
    privExists = privSnap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, privPath);
  }

  const allowedUserKeys = new Set([
    'uid',
    'fullName',
    'balance',
    'referralEarnings',
    'inviteCode',
    'role',
    'createdAt',
    'updatedAt',
  ]);
  const hasValidExistingShape =
    docExists &&
    snapData !== null &&
    snapData.uid === safeUid &&
    snapData.role === 'player' &&
    snapData.createdAt instanceof Timestamp &&
    Object.keys(snapData).every((k) => allowedUserKeys.has(k));

  if (docExists && hasValidExistingShape) {
    try {
      await updateDoc(doc(db, 'users', safeUid), {
        fullName: clampString(user.fullName, 80, 'Player'),
        balance: clampNumber(user.balance ?? 0, 0, 100000000, 0),
        referralEarnings: clampNumber(user.referralEarnings ?? 0, 0, 100000000, 0),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, userPath);
    }

    if (!privExists) {
      try {
        const privPayload: Record<string, unknown> = {
          uid: safeUid,
          phone: normalizePhoneForSchema(user.phone, safeUid),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (user.email) {
          privPayload.email = clampString(user.email, 160);
        }
        await setDoc(doc(db, 'users', safeUid, 'private', 'info'), privPayload);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, privPath);
      }
    }
  } else {
    if (docExists) {
      try {
        await deleteDoc(doc(db, 'users', safeUid));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, userPath);
      }
    }
    const payload: Record<string, unknown> = {
      uid: safeUid,
      fullName: clampString(user.fullName, 80, 'Player'),
      balance: clampNumber(user.balance ?? 10, 0, 100000000, 10),
      referralEarnings: clampNumber(user.referralEarnings ?? 0, 0, 100000000, 0),
      role: 'player',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    const cleanInvite = user.inviteCode ? clampString(user.inviteCode, 64, '') : '';
    if (cleanInvite) {
      payload.inviteCode = cleanInvite;
    }

    try {
      if (!privExists) {
        const privPayload: Record<string, unknown> = {
          uid: safeUid,
          phone: normalizePhoneForSchema(user.phone, safeUid),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (user.email) {
          privPayload.email = clampString(user.email, 160);
        }
        const batch = writeBatch(db);
        batch.set(doc(db, 'users', safeUid), payload);
        batch.set(doc(db, 'users', safeUid, 'private', 'info'), privPayload);
        await batch.commit();
      } else {
        await setDoc(doc(db, 'users', safeUid), payload);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, userPath);
    }
  }
}

export async function adminDeleteUserInFirestore(uid: string): Promise<void> {
  if (!isVerifiedGoogleAdmin(auth.currentUser)) return;
  const safeUid = sanitizeFirestoreId(uid, 'USR');
  try {
    await deleteDoc(doc(db, 'users', safeUid, 'private', 'info')).catch(() => {});
    await deleteDoc(doc(db, 'users', safeUid));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${safeUid}`);
  }
}

export async function blockPhoneInFirestore(phone: string): Promise<void> {
  if (!isVerifiedGoogleAdmin(auth.currentUser) || !auth.currentUser) return;
  const clean = normalizePhoneForSchema(phone, '');
  if (!clean || clean.length < 7) return;
  const phoneId = sanitizeFirestoreId(clean, 'PH');
  const path = `blocked_phones/${phoneId}`;
  try {
    const docRef = doc(db, 'blocked_phones', phoneId);
    const existingSnap = await getDocFromServer(docRef);
    if (existingSnap.exists()) {
      return;
    }
    await setDoc(docRef, {
      phoneId,
      phone: clean,
      blockedByUid: sanitizeFirestoreId(auth.currentUser.uid, 'ADM'),
      blockedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function unblockPhoneInFirestore(phone: string): Promise<void> {
  if (!isVerifiedGoogleAdmin(auth.currentUser)) return;
  const clean = normalizePhoneForSchema(phone, '');
  if (!clean) return;
  const phoneId = sanitizeFirestoreId(clean, 'PH');
  try {
    await deleteDoc(doc(db, 'blocked_phones', phoneId)).catch(() => {});
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `blocked_phones/${phoneId}`);
  }
}

export function subscribeBlockedPhonesFromFirestore(
  onUpdate: (phones: string[]) => void,
  onError?: (err: Error) => void
): () => void {
  return onSnapshot(
    query(collection(db, 'blocked_phones'), limit(250)),
    (snap) => {
      const phones = snap.docs
        .map((d) => String(d.data().phone || ''))
        .filter((p) => p.length >= 7);
      onUpdate(phones);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'blocked_phones');
      } catch (e) {
        onError?.(e as Error);
      }
    }
  );
}

export async function createTransactionInFirestore(
  tx: PaymentTransaction,
  ownerUid: string
): Promise<void> {
  if (!auth.currentUser?.emailVerified) return;
  const isAdmin = isVerifiedGoogleAdmin(auth.currentUser);
  const safeUid = sanitizeFirestoreId(ownerUid, 'USR');
  if (!isAdmin && auth.currentUser.uid !== safeUid) return;

  const safeTxId = sanitizeFirestoreId(tx.id, 'TX');
  const path = `transactions/${safeTxId}`;
  const acctNum = clampString(tx.accountNumber, 32, '03000000000');
  const paddedAcctNum = acctNum.length >= 5 ? acctNum : acctNum.padEnd(5, '0');

  const payload: Record<string, unknown> = {
    id: safeTxId,
    userId: safeUid,
    userName: clampString(tx.userName || tx.accountTitle || 'Player', 80, 'Player'),
    type: tx.type === 'withdraw' ? 'withdraw' : 'deposit',
    method: tx.method === 'jazzcash' ? 'jazzcash' : 'easypaisa',
    amount: clampNumber(tx.amount, 1, 10000000, 100),
    accountNumber: paddedAcctNum,
    accountTitle: clampString(tx.accountTitle || tx.userName || 'Player', 80, 'Player'),
    status: isAdmin ? tx.status : 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (typeof tx.bonusAmount === 'number' && tx.bonusAmount >= 0) {
    payload.bonusAmount = clampNumber(tx.bonusAmount, 0, 10000000, 0);
  }
  if (tx.trxId) {
    payload.trxId = clampString(tx.trxId, 64);
  }
  if (tx.note) {
    payload.note = clampString(tx.note, 200);
  }

  try {
    const txRef = doc(db, 'transactions', safeTxId);
    const existingSnap = await getDocFromServer(txRef);
    if (existingSnap.exists()) {
      return;
    }
    await setDoc(txRef, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function adminUpdateTransactionInFirestore(
  txId: string,
  updates: Partial<PaymentTransaction>
): Promise<void> {
  if (!isVerifiedGoogleAdmin(auth.currentUser)) return;
  const safeTxId = sanitizeFirestoreId(txId, 'TX');
  const path = `transactions/${safeTxId}`;
  const allowed: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };

  if (updates.status && ['pending', 'completed', 'rejected', 'processing'].includes(updates.status)) {
    allowed.status = updates.status;
  }
  if (typeof updates.amount === 'number' && updates.amount > 0) {
    allowed.amount = clampNumber(updates.amount, 1, 10000000, 100);
  }
  if (typeof updates.bonusAmount === 'number' && updates.bonusAmount >= 0) {
    allowed.bonusAmount = clampNumber(updates.bonusAmount, 0, 10000000, 0);
  }
  if (updates.method === 'easypaisa' || updates.method === 'jazzcash') {
    allowed.method = updates.method;
  }
  if (updates.accountNumber) {
    const raw = clampString(updates.accountNumber, 32, '03000');
    allowed.accountNumber = raw.length >= 5 ? raw : raw.padEnd(5, '0');
  }
  if (updates.accountTitle) {
    allowed.accountTitle = clampString(updates.accountTitle, 80, 'Player');
  }
  if (updates.trxId !== undefined) {
    allowed.trxId = clampString(updates.trxId, 64);
  }
  if (updates.note !== undefined) {
    allowed.note = clampString(updates.note, 200);
  }

  try {
    const snap = await getDoc(doc(db, 'transactions', safeTxId));
    if (snap.exists()) {
      await updateDoc(doc(db, 'transactions', safeTxId), allowed);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function adminDeleteTransactionInFirestore(txId: string): Promise<void> {
  if (!isVerifiedGoogleAdmin(auth.currentUser)) return;
  const safeTxId = sanitizeFirestoreId(txId, 'TX');
  const path = `transactions/${safeTxId}`;
  try {
    await deleteDoc(doc(db, 'transactions', safeTxId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function createBetInFirestore(bet: UserBet, ownerUid: string): Promise<void> {
  if (!auth.currentUser?.emailVerified) return;
  if (auth.currentUser.uid !== ownerUid) return;

  const safeBetId = sanitizeFirestoreId(bet.id, 'BET');
  const safeUid = sanitizeFirestoreId(ownerUid, 'USR');
  const safePeriod = sanitizeFirestoreId(bet.period, '2026010100001').slice(0, 32);
  const path = `bets/${safeBetId}`;

  const payload: Record<string, unknown> = {
    id: safeBetId,
    userId: safeUid,
    userName: clampString(bet.userName || 'Player', 80, 'Player'),
    mode: [30, 60, 180, 300].includes(Number(bet.mode)) ? Number(bet.mode) : 60,
    period: safePeriod.length >= 6 ? safePeriod : safePeriod.padEnd(6, '0'),
    category: (['color', 'number', 'bigSmall'].includes(bet.category)
      ? bet.category
      : 'color') as BetCategory,
    selection: clampString(bet.selection, 32, 'green'),
    totalAmount: clampNumber(bet.totalAmount, 1, 10000000, 10),
    multiplier: clampNumber(bet.multiplier, 1, 10000, 1),
    status: 'pending',
    winAmount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (bet.roundHash) {
    payload.roundHash = clampString(bet.roundHash, 128);
  }

  try {
    const betRef = doc(db, 'bets', safeBetId);
    const existingSnap = await getDocFromServer(betRef);
    if (existingSnap.exists()) {
      return;
    }
    await setDoc(betRef, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function settleBetInFirestore(
  betId: string,
  status: 'won' | 'lost',
  winAmount: number,
  profit: number
): Promise<void> {
  if (!auth.currentUser?.emailVerified) return;
  const safeBetId = sanitizeFirestoreId(betId, 'BET');
  const path = `bets/${safeBetId}`;
  try {
    const snap = await getDoc(doc(db, 'bets', safeBetId));
    if (!snap.exists()) return;
    const data = snap.data();
    if (data.status !== 'pending' && !isVerifiedGoogleAdmin(auth.currentUser)) return;
    await updateDoc(doc(db, 'bets', safeBetId), {
      status,
      winAmount: clampNumber(winAmount, 0, 100000000, 0),
      profit: clampNumber(profit, -10000000, 100000000, 0),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function syncGameModeOverrideToFirestore(
  mode: GameTimeOption,
  spec: ForcedOutcomeSpec | null
): Promise<void> {
  if (!isVerifiedGoogleAdmin(auth.currentUser) || !auth.currentUser) return;
  const safeModeId = String(mode);
  const path = `game_modes/${safeModeId}`;

  const payload: Record<string, unknown> = {
    mode,
    forcedKind: spec ? spec.kind : 'auto',
    updatedByUid: sanitizeFirestoreId(auth.currentUser.uid, 'ADM'),
    updatedAt: serverTimestamp(),
  };

  if (spec?.kind === 'number' && typeof spec.number === 'number') {
    payload.forcedNumber = Math.min(9, Math.max(0, Math.round(spec.number)));
  }
  if (spec?.kind === 'bigSmall' && (spec.bigSmall === 'Big' || spec.bigSmall === 'Small')) {
    payload.forcedBigSmall = spec.bigSmall;
  }
  if (spec?.kind === 'color' && (spec.color === 'green' || spec.color === 'violet' || spec.color === 'red')) {
    payload.forcedColor = spec.color;
  }
  if (spec?.targetPeriod) {
    payload.targetPeriod = clampString(spec.targetPeriod, 32);
  }

  try {
    await setDoc(doc(db, 'game_modes', safeModeId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function adminSyncDrawRecordToFirestore(
  mode: GameTimeOption,
  draw: DrawResult
): Promise<void> {
  if (!isVerifiedGoogleAdmin(auth.currentUser) || !auth.currentUser) return;
  const safeModeId = String(mode);
  const safePeriod = sanitizeFirestoreId(draw.period, '2026010100001').slice(0, 32);
  const modeRef = doc(db, 'game_modes', safeModeId);
  const drawPath = `game_modes/${safeModeId}/draws/${safePeriod}`;

  try {
    const modeSnap = await getDocFromServer(modeRef);
    if (!modeSnap.exists()) {
      await setDoc(modeRef, {
        mode,
        forcedKind: 'auto',
        updatedByUid: sanitizeFirestoreId(auth.currentUser.uid, 'ADM'),
        updatedAt: serverTimestamp(),
      });
    }
    const drawRef = doc(db, 'game_modes', safeModeId, 'draws', safePeriod);
    const drawSnap = await getDocFromServer(drawRef);
    if (!drawSnap.exists()) {
      const colors = draw.colors?.length ? draw.colors : getColorsForNumber(draw.number);
      const primaryColor = colors.includes('green') ? 'green' : 'red';
      const drawPayload: Record<string, unknown> = {
        period: safePeriod.length >= 6 ? safePeriod : safePeriod.padEnd(6, '0'),
        number: Math.min(9, Math.max(0, Math.round(draw.number))),
        bigSmall: draw.bigSmall || getBigSmallForNumber(draw.number),
        primaryColor,
        hasViolet: colors.includes('violet'),
        createdAt: serverTimestamp(),
      };
      if (draw.commitHash) {
        drawPayload.commitHash = clampString(draw.commitHash, 128);
      }
      if (draw.serverSeed) {
        drawPayload.serverSeed = clampString(draw.serverSeed, 128);
      }
      await setDoc(drawRef, drawPayload);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, drawPath);
  }
}

export function subscribePlayerFirestoreState(
  uid: string,
  callbacks: {
    onUserUpdate?: (data: {
      balance: number;
      referralEarnings: number;
      fullName?: string;
      updatedAt: number;
    }) => void;
    onTransactionsUpdate?: (txs: PaymentTransaction[]) => void;
    onBetsUpdate?: (bets: UserBet[]) => void;
    onUserDeleted?: () => void;
  },
  onError?: (err: Error) => void
): () => void {
  const safeUid = sanitizeFirestoreId(uid, 'USR');
  let sawExistingUserDoc = false;

  const unsubUser = onSnapshot(
    doc(db, 'users', safeUid),
    (snap) => {
      if (!snap.exists()) {
        if (sawExistingUserDoc || !snap.metadata.fromCache) {
          callbacks.onUserDeleted?.();
        }
        return;
      }
      sawExistingUserDoc = true;
      const d = snap.data();
      callbacks.onUserUpdate?.({
        balance: clampNumber(d.balance, 0, 100000000, 0),
        referralEarnings: clampNumber(d.referralEarnings, 0, 100000000, 0),
        fullName: typeof d.fullName === 'string' ? d.fullName : undefined,
        updatedAt: tsToMillis(d.updatedAt, 0),
      });
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, `users/${safeUid}`);
      } catch (e) {
        onError?.(e as Error);
      }
    }
  );

  const txQuery = query(
    collection(db, 'transactions'),
    where('userId', '==', safeUid),
    limit(100)
  );
  const unsubTx = onSnapshot(
    txQuery,
    (snap) => {
      const list: PaymentTransaction[] = snap.docs
        .map((d) => {
          const v = d.data();
          return {
            id: String(v.id || d.id),
            userId: String(v.userId || safeUid),
            userName: typeof v.userName === 'string' ? v.userName : undefined,
            type: (v.type === 'withdraw' ? 'withdraw' : 'deposit') as 'deposit' | 'withdraw',
            method: (v.method === 'jazzcash' ? 'jazzcash' : 'easypaisa') as 'easypaisa' | 'jazzcash',
            amount: Number(v.amount || 0),
            bonusAmount: typeof v.bonusAmount === 'number' ? v.bonusAmount : undefined,
            accountNumber: String(v.accountNumber || ''),
            accountTitle: String(v.accountTitle || ''),
            trxId: typeof v.trxId === 'string' ? v.trxId : undefined,
            status: (v.status || 'pending') as PaymentTransaction['status'],
            note: typeof v.note === 'string' ? v.note : undefined,
            timestamp: tsToMillis(v.createdAt),
          };
        })
        .sort((a, b) => b.timestamp - a.timestamp);
      callbacks.onTransactionsUpdate?.(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'transactions');
      } catch (e) {
        onError?.(e as Error);
      }
    }
  );

  const betsQuery = query(
    collection(db, 'bets'),
    where('userId', '==', safeUid),
    limit(100)
  );
  const unsubBets = onSnapshot(
    betsQuery,
    (snap) => {
      const list: UserBet[] = snap.docs
        .map((d) => {
          const v = d.data();
          return {
            id: String(v.id || d.id),
            userId: String(v.userId || safeUid),
            userName: typeof v.userName === 'string' ? v.userName : undefined,
            mode: ([30, 60, 180, 300].includes(Number(v.mode))
              ? Number(v.mode)
              : 60) as GameTimeOption,
            period: String(v.period || ''),
            category: (v.category || 'color') as BetCategory,
            selection: v.selection as string | number,
            contractMoney: Number(v.totalAmount || 0) / Math.max(1, Number(v.multiplier || 1)),
            quantity: 1,
            multiplier: Number(v.multiplier || 1),
            totalAmount: Number(v.totalAmount || 0),
            status: (v.status || 'pending') as UserBet['status'],
            winAmount: Number(v.winAmount || 0),
            profit: typeof v.profit === 'number' ? v.profit : undefined,
            roundHash: typeof v.roundHash === 'string' ? v.roundHash : undefined,
            timestamp: tsToMillis(v.createdAt),
          };
        })
        .sort((a, b) => b.timestamp - a.timestamp);
      callbacks.onBetsUpdate?.(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'bets');
      } catch (e) {
        onError?.(e as Error);
      }
    }
  );

  return () => {
    unsubUser();
    unsubTx();
    unsubBets();
  };
}

export function subscribeAdminFirestoreState(
  callbacks: {
    onUsersUpdate?: (users: RegisteredUser[]) => void;
    onTransactionsUpdate?: (txs: PaymentTransaction[]) => void;
    onBetsUpdate?: (bets: UserBet[]) => void;
  },
  onError?: (err: Error) => void
): () => void {
  const unsubUsers = onSnapshot(
    query(collection(db, 'users'), limit(200)),
    async (snap) => {
      const users: RegisteredUser[] = await Promise.all(
        snap.docs.map(async (d) => {
          const v = d.data();
          const uid = String(v.uid || d.id);
          let phone = '';
          let email = '';
          try {
            const privSnap = await getDoc(doc(db, 'users', uid, 'private', 'info'));
            if (privSnap.exists()) {
              const pData = privSnap.data();
              phone = String(pData.phone || '');
              email = typeof pData.email === 'string' ? pData.email : '';
            }
          } catch {
            // private info optional if not created yet
          }
          return {
            id: uid,
            fullName: String(v.fullName || 'Player'),
            phone: phone || uid,
            email: email || undefined,
            authProvider: email ? 'google' : undefined,
            inviteCode: typeof v.inviteCode === 'string' ? v.inviteCode : undefined,
            balance: Number(v.balance || 0),
            referralEarnings: Number(v.referralEarnings || 0),
            createdAt: tsToMillis(v.createdAt),
            lastSeenAt: tsToMillis(v.updatedAt),
          };
        })
      );
      users.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      callbacks.onUsersUpdate?.(users);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'users');
      } catch (e) {
        onError?.(e as Error);
      }
    }
  );

  const unsubTx = onSnapshot(
    query(collection(db, 'transactions'), limit(250)),
    (snap) => {
      const txs: PaymentTransaction[] = snap.docs
        .map((d) => {
          const v = d.data();
          return {
            id: String(v.id || d.id),
            userId: typeof v.userId === 'string' ? v.userId : undefined,
            userName: typeof v.userName === 'string' ? v.userName : undefined,
            type: (v.type === 'withdraw' ? 'withdraw' : 'deposit') as 'deposit' | 'withdraw',
            method: (v.method === 'jazzcash' ? 'jazzcash' : 'easypaisa') as 'easypaisa' | 'jazzcash',
            amount: Number(v.amount || 0),
            bonusAmount: typeof v.bonusAmount === 'number' ? v.bonusAmount : undefined,
            accountNumber: String(v.accountNumber || ''),
            accountTitle: String(v.accountTitle || ''),
            trxId: typeof v.trxId === 'string' ? v.trxId : undefined,
            status: (v.status || 'pending') as PaymentTransaction['status'],
            note: typeof v.note === 'string' ? v.note : undefined,
            timestamp: tsToMillis(v.createdAt),
          };
        })
        .sort((a, b) => b.timestamp - a.timestamp);
      callbacks.onTransactionsUpdate?.(txs);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'transactions');
      } catch (e) {
        onError?.(e as Error);
      }
    }
  );

  const unsubBets = onSnapshot(
    query(collection(db, 'bets'), limit(250)),
    (snap) => {
      const bets: UserBet[] = snap.docs
        .map((d) => {
          const v = d.data();
          return {
            id: String(v.id || d.id),
            userId: typeof v.userId === 'string' ? v.userId : undefined,
            userName: typeof v.userName === 'string' ? v.userName : undefined,
            mode: ([30, 60, 180, 300].includes(Number(v.mode))
              ? Number(v.mode)
              : 60) as GameTimeOption,
            period: String(v.period || ''),
            category: (v.category || 'color') as BetCategory,
            selection: v.selection as string | number,
            contractMoney: Number(v.totalAmount || 0) / Math.max(1, Number(v.multiplier || 1)),
            quantity: 1,
            multiplier: Number(v.multiplier || 1),
            totalAmount: Number(v.totalAmount || 0),
            status: (v.status || 'pending') as UserBet['status'],
            winAmount: Number(v.winAmount || 0),
            profit: typeof v.profit === 'number' ? v.profit : undefined,
            roundHash: typeof v.roundHash === 'string' ? v.roundHash : undefined,
            timestamp: tsToMillis(v.createdAt),
          };
        })
        .sort((a, b) => b.timestamp - a.timestamp);
      callbacks.onBetsUpdate?.(bets);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'bets');
      } catch (e) {
        onError?.(e as Error);
      }
    }
  );

  return () => {
    unsubUsers();
    unsubTx();
    unsubBets();
  };
}

export async function pushAdminSnapshotToFirestore(
  users: RegisteredUser[],
  transactions: PaymentTransaction[],
  deletedUserIds: string[] = []
): Promise<number> {
  if (!isVerifiedGoogleAdmin(auth.currentUser)) return 0;
  let synced = 0;

  const deletedSet = new Set(deletedUserIds.map((id) => sanitizeFirestoreId(id, 'USR')));

  // Remove any deleted users that may still exist in Firestore
  try {
    const existingUsersSnap = await getDocs(query(collection(db, 'users'), limit(200)));
    for (const uDoc of existingUsersSnap.docs) {
      if (deletedSet.has(uDoc.id)) {
        await adminDeleteUserInFirestore(uDoc.id).catch(() => {});
      }
    }
  } catch {
    // ignore listing issues
  }

  for (const u of users) {
    const safeUid = sanitizeFirestoreId(u.id, 'USR');
    if (deletedSet.has(safeUid)) continue;
    await adminUpsertUserToFirestore(u);
    synced += 1;
  }

  // Only push transactions that do not exist yet in Firestore so we never overwrite cloud updates
  const existingSnap = await getDocs(query(collection(db, 'transactions'), limit(250)));
  const existingIds = new Set(existingSnap.docs.map((d) => d.id));
  for (const tx of transactions) {
    const safeTxId = sanitizeFirestoreId(tx.id, 'TX');
    if (!existingIds.has(safeTxId) && tx.userId) {
      await createTransactionInFirestore(tx, tx.userId);
      synced += 1;
    }
  }

  return synced;
}
