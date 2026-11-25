export type ColorType = 'green' | 'violet' | 'red';
export type BigSmallType = 'Big' | 'Small';

export interface DrawResult {
  period: string;
  number: number;
  bigSmall: BigSmallType;
  colors: ColorType[];
  timestamp: number;
}

export type BetCategory = 'color' | 'number' | 'bigSmall';

export interface UserBet {
  id: string;
  userId?: string;
  userName?: string;
  userPhone?: string;
  mode?: GameTimeOption;
  period: string;
  category: BetCategory;
  selection: string | number; // 'green', 'violet', 'red', 0-9, 'Big', 'Small'
  contractMoney: number;
  quantity: number;
  totalAmount: number;
  status: 'pending' | 'won' | 'lost';
  winAmount: number;
  profit?: number;
  multiplier: number;
  timestamp: number;
}

export interface PaymentTransaction {
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

export interface UserProfile {
  id: string;
  phone: string;
  balance: number;
  vipLevel: number;
  totalWon: number;
  totalBet: number;
}

export interface RegisteredUser {
  id: string;
  fullName: string;
  phone: string;
  password?: string;
  inviteCode?: string;
  createdAt: number;
  lastSeenAt?: number;
  balance?: number;
  referralEarnings?: number;
  totalDeposited?: number;
  totalWithdrawn?: number;
  pendingWithdraw?: number;
  totalBet?: number;
  totalWon?: number;
  isNew?: boolean;
  isOnline?: boolean;
}

export interface AdminSummary {
  totalUsers: number;
  newUsers24h: number;
  onlineUsers: number;
  totalAllBalances: number;
  totalDepositBase: number;
  totalDepositBonus: number;
  totalWithdrawnAmount: number;
  totalPendingWithdrawAmount: number;
  pendingDepositsCount: number;
  pendingWithdrawsCount: number;
  netCashFlow: number;
}

export type GameTimeOption = 30 | 60 | 180 | 300; // 30s, 1min, 3min, 5min
export type AppTheme = 'blue' | 'green';

export type ForcedOutcomeKind = 'number' | 'bigSmall' | 'color';

export interface ForcedOutcomeSpec {
  kind: ForcedOutcomeKind;
  number?: number;
  bigSmall?: BigSmallType;
  color?: ColorType;
  targetPeriod?: string;
  persistent?: boolean;
  setAt?: number;
}

