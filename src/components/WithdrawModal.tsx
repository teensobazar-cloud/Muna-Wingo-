import React, { useState, useEffect } from 'react';
import {
  X,
  Check,
  AlertCircle,
  ArrowUpRight,
  ShieldCheck,
  Wallet,
  History,
  Clock,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { PaymentTransaction, AppTheme } from '../types/game';
import { soundManager } from '../utils/audio';

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  userBalance: number;
  onWithdrawSuccess: (amount: number, transaction: PaymentTransaction) => void;
  transactions?: PaymentTransaction[];
  initialTab?: 'form' | 'history';
  language: 'ur' | 'en';
  theme?: AppTheme;
}

export const WithdrawModal: React.FC<WithdrawModalProps> = ({
  isOpen,
  onClose,
  userBalance,
  onWithdrawSuccess,
  transactions = [],
  initialTab = 'form',
  language,
  theme = 'blue'
}) => {
  const isBlue = theme === 'blue';
  const [activeTab, setActiveTab] = useState<'form' | 'history'>(initialTab);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'pending' | 'completed' | 'rejected'>('all');
  const [method, setMethod] = useState<'easypaisa' | 'jazzcash'>('easypaisa');
  const [accountTitle, setAccountTitle] = useState<string>('');
  const [accountNumber, setAccountNumber] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [successReceipt, setSuccessReceipt] = useState<PaymentTransaction | null>(null);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setFormError(null);
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const withdrawTransactions = transactions
    .filter((t) => t.type === 'withdraw')
    .sort((a, b) => b.timestamp - a.timestamp);
  const pendingCount = withdrawTransactions.filter((t) => t.status === 'pending').length;
  const approvedCount = withdrawTransactions.filter((t) => t.status === 'completed').length;
  const rejectedCount = withdrawTransactions.filter((t) => t.status === 'rejected').length;
  const filteredWithdrawals =
    historyFilter === 'all'
      ? withdrawTransactions
      : withdrawTransactions.filter((t) => t.status === historyFilter);

  const withdrawAmount = Number(amount) || 0;
  const minWithdraw = 500;
  const maxWithdraw = 50000;
  const isInsufficient = withdrawAmount > userBalance;
  const isBelowMin = withdrawAmount > 0 && withdrawAmount < minWithdraw;

  const quickWithdraws = [500, 1000, 2500, 5000];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!accountNumber || accountNumber.trim().length < 10) {
      setFormError('Please enter a valid phone number');
      return;
    }

    if (!accountTitle.trim()) {
      setFormError('Please enter the account title');
      return;
    }

    if (withdrawAmount < minWithdraw) {
      setFormError(`Minimum withdrawal is Rs ${minWithdraw}`);
      return;
    }

    if (withdrawAmount > userBalance) {
      setFormError('Insufficient balance');
      return;
    }

    setIsSubmitting(true);
    soundManager.playCash();

    const tx: PaymentTransaction = {
      id: `WTH-${Date.now()}`,
      type: 'withdraw',
      method,
      amount: withdrawAmount,
      accountNumber,
      accountTitle,
      trxId: `WTH${Math.floor(100000000 + Math.random() * 900000000)}`,
      status: 'pending',
      timestamp: Date.now(),
      note: `Pending Admin Verification for ${method === 'easypaisa' ? 'EasyPaisa' : 'JazzCash'}`
    };

    setTimeout(() => {
      setIsSubmitting(false);
      setSuccessReceipt(tx);
      onWithdrawSuccess(withdrawAmount, tx);
    }, 650);
  };

  const handleClose = () => {
    setSuccessReceipt(null);
    setFormError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs p-3">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-600 text-white px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold text-sm">
              <Wallet className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">
                {activeTab === 'history' ? 'Withdrawal History' : 'Withdrawal Funds'}
              </h3>
              <p className="text-[11px] text-amber-100">
                {activeTab === 'history'
                  ? 'Track Pending & Approved payouts'
                  : 'Fast Transfer to EasyPaisa / JazzCash'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                soundManager.playClick();
                setSuccessReceipt(null);
                setActiveTab((prev) => (prev === 'history' ? 'form' : 'history'));
              }}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
                activeTab === 'history'
                  ? 'bg-white text-slate-900 border-white shadow-sm'
                  : 'bg-white/15 hover:bg-white/25 text-white border-white/25'
              }`}
              title="Withdrawal History"
            >
              <History className="w-4 h-4" />
              <span>History</span>
              {pendingCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-slate-900 text-amber-300 text-[10px] font-black leading-tight">
                  {pendingCount}
                </span>
              )}
            </button>
            <button
              onClick={handleClose}
              className="p-1.5 rounded-full hover:bg-white/20 transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        {/* Sub-navigation bar between Withdraw Form & Withdrawal History */}
        <div className="px-4 pt-3 pb-1 bg-slate-50 border-b border-slate-200 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              soundManager.playClick();
              setActiveTab('form');
            }}
            className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'form'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>New Withdrawal</span>
          </button>
          <button
            type="button"
            onClick={() => {
              soundManager.playClick();
              setSuccessReceipt(null);
              setActiveTab('history');
            }}
            className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'history'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Withdraw History ({withdrawTransactions.length})</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-4 overflow-y-auto space-y-4">
          {activeTab === 'history' ? (
            /* WITHDRAWAL HISTORY LIST */
            <div className="space-y-3 animate-in fade-in">
              {/* Filter Pills */}
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { key: 'all', label: `All (${withdrawTransactions.length})` },
                  { key: 'pending', label: `Pending (${pendingCount})` },
                  { key: 'completed', label: `Approved (${approvedCount})` },
                  { key: 'rejected', label: `Rejected (${rejectedCount})` }
                ].map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => {
                      soundManager.playClick();
                      setHistoryFilter(f.key as typeof historyFilter);
                    }}
                    className={`py-1.5 px-1 rounded-xl text-[10px] font-bold transition-all cursor-pointer border ${
                      historyFilter === f.key
                        ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                        : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {filteredWithdrawals.length === 0 ? (
                <div className="py-10 text-center space-y-3 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="w-12 h-12 rounded-full bg-slate-200 text-slate-500 mx-auto flex items-center justify-center">
                    <History className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-700">No Withdrawal Records</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {historyFilter === 'all'
                        ? 'Your withdrawal requests will appear here with Pending or Approved status.'
                        : `No ${historyFilter === 'completed' ? 'approved' : historyFilter} withdrawals found.`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('form')}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 cursor-pointer"
                  >
                    Request Withdrawal
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredWithdrawals.map((tx) => {
                    const isPending = tx.status === 'pending';
                    const isApproved = tx.status === 'completed';
                    return (
                      <div
                        key={tx.id}
                        className={`rounded-2xl p-3 border text-xs space-y-2 shadow-xs ${
                          isPending
                            ? 'bg-amber-50/70 border-amber-300'
                            : isApproved
                            ? 'bg-emerald-50/60 border-emerald-200'
                            : 'bg-rose-50/60 border-rose-200'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-black text-slate-900 text-sm font-digital">
                              Rs {tx.amount.toLocaleString()}
                            </span>
                            <span
                              className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                                tx.method === 'jazzcash'
                                  ? 'bg-rose-100 text-rose-700'
                                  : 'bg-emerald-100 text-emerald-700'
                              }`}
                            >
                              {tx.method === 'jazzcash' ? 'JazzCash' : 'EasyPaisa'}
                            </span>
                          </div>

                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wide ${
                              isPending
                                ? 'bg-amber-500 text-white'
                                : isApproved
                                ? 'bg-emerald-600 text-white'
                                : 'bg-rose-600 text-white'
                            }`}
                          >
                            {isPending ? (
                              <>
                                <Clock className="w-3 h-3" />
                                <span>Pending</span>
                              </>
                            ) : isApproved ? (
                              <>
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Approved</span>
                              </>
                            ) : (
                              <>
                                <XCircle className="w-3 h-3" />
                                <span>Rejected</span>
                              </>
                            )}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-1.5 text-[11px] text-slate-600 bg-white/80 rounded-xl p-2 border border-slate-200/80">
                          <div>
                            <span className="text-slate-400 block text-[9px] uppercase font-bold">Account Title</span>
                            <span className="font-semibold text-slate-900">
                              {tx.accountTitle || 'Player'}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[9px] uppercase font-bold">Account Number</span>
                            <span className="font-mono font-semibold text-slate-800">
                              {tx.accountNumber || 'N/A'}
                            </span>
                          </div>
                          <div className="col-span-2 flex items-center justify-between pt-1 border-t border-slate-100 text-[10px] text-slate-500">
                            <span className="font-mono font-bold text-slate-700">
                              Ref: {tx.trxId || tx.id}
                            </span>
                            <span>{new Date(tx.timestamp).toLocaleString()}</span>
                          </div>
                        </div>
                        {tx.status === 'rejected' && (
                          <p className="text-[10px] font-semibold text-rose-700">
                            Amount refunded back to your game balance.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : successReceipt ? (
            /* Pending Admin Approval Receipt */
            <div className="py-4 text-center space-y-4 animate-in fade-in zoom-in-95">
              <div className="w-16 h-16 rounded-full bg-amber-100 text-amber-600 mx-auto flex items-center justify-center shadow-inner">
                <Clock className="w-9 h-9 stroke-[2.5]" />
              </div>

              <div>
                <h4 className="text-xl font-black text-slate-800">
                  Withdrawal Submitted! Pending Approval
                </h4>
                <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto leading-relaxed">
                  {`Your ${successReceipt.method === 'jazzcash' ? 'JazzCash' : 'EasyPaisa'} withdrawal request has been sent to the Admin Panel. Payout will be sent once approved by Admin.`}
                </p>
              </div>

              {/* Receipt Summary */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 text-xs text-left space-y-2 font-mono">
                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="text-slate-500">Method:</span>
                  <span className="font-bold uppercase text-slate-800">{successReceipt.method}</span>
                </div>
                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="text-slate-500">Requested Amount:</span>
                  <span className="font-bold text-orange-600 text-sm">
                    Rs {successReceipt.amount.toLocaleString()} PKR
                  </span>
                </div>
                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="text-slate-500">Account Title:</span>
                  <span className="font-bold text-slate-800">{successReceipt.accountTitle}</span>
                </div>
                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="text-slate-500">Account Number:</span>
                  <span className="font-bold text-slate-800">{successReceipt.accountNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Payout Status:</span>
                  <span className="text-amber-600 font-bold">PENDING ADMIN APPROVAL</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    soundManager.playClick();
                    setSuccessReceipt(null);
                    setAmount('');
                    setActiveTab('history');
                  }}
                  className="py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <History className="w-4 h-4" />
                  <span>Withdraw History</span>
                </button>
                <button
                  onClick={handleClose}
                  className={`py-3 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md transition-all cursor-pointer ${
                    isBlue
                      ? 'bg-blue-600 hover:bg-blue-700'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  Close &amp; Continue
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {formError && (
                <div className="flex items-center gap-2 p-2.5 bg-rose-50 text-rose-700 rounded-xl border border-rose-200 text-xs font-semibold">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Current Available Balance Banner */}
              <div className="bg-amber-50 rounded-2xl p-3 border border-amber-200 flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-amber-800 font-medium">
                    {language === 'ur' ? 'دستیاب گیم بیلنس:' : 'Available Withdrawable Balance:'}
                  </span>
                  <div className="text-lg font-black font-digital text-amber-900">
                    Rs {userBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAmount(String(Math.floor(userBalance)))}
                  className="px-2.5 py-1 bg-amber-600 text-white text-xs font-bold rounded-lg hover:bg-amber-700 active:scale-95 cursor-pointer"
                >
                  {language === 'ur' ? 'تمام بیلنس' : 'Max All'}
                </button>
              </div>

              {/* Method Selector: EasyPaisa vs JazzCash */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-2">
                  {language === 'ur' ? 'وڈرا کا طریقہ منتخب کریں:' : 'Select Payout Wallet:'}
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      soundManager.playClick();
                      setMethod('easypaisa');
                    }}
                    className={`py-3 px-3 rounded-2xl border-2 flex items-center justify-center gap-2 font-bold text-xs sm:text-sm transition-all cursor-pointer ${
                      method === 'easypaisa'
                        ? 'border-[#00a651] bg-emerald-50 text-[#00a651] shadow-xs'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <div className="w-5 h-5 rounded-full bg-[#00a651] text-white flex items-center justify-center text-[10px] font-black">
                      EP
                    </div>
                    <span>EasyPaisa</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      soundManager.playClick();
                      setMethod('jazzcash');
                    }}
                    className={`py-3 px-3 rounded-2xl border-2 flex items-center justify-center gap-2 font-bold text-xs sm:text-sm transition-all cursor-pointer ${
                      method === 'jazzcash'
                        ? 'border-[#ec1c24] bg-rose-50 text-[#ec1c24] shadow-xs'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <div className="w-5 h-5 rounded-full bg-[#ec1c24] text-white flex items-center justify-center text-[10px] font-black">
                      JC
                    </div>
                    <span>JazzCash</span>
                  </button>
                </div>
              </div>

              {/* Quick Amount Presets */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                  {language === 'ur' ? 'تیز رقم انتخاب (PKR):' : 'Quick Amount Presets:'}
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {quickWithdraws.map((q) => (
                    <button
                      type="button"
                      key={q}
                      onClick={() => {
                        soundManager.playClick();
                        setAmount(String(q));
                      }}
                      className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        withdrawAmount === q
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      Rs {q}
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount Input */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  {language === 'ur' ? 'وڈرا رقم درج کریں (کم از کم 500 روپے):' : 'Withdrawal Amount (Min Rs 500):'}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-xs text-slate-400">
                    PKR
                  </span>
                  <input
                    type="number"
                    required
                    placeholder="Enter amount"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full pl-12 pr-4 py-2.5 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500 font-bold font-digital"
                    min={minWithdraw}
                    max={maxWithdraw}
                  />
                </div>
                {isInsufficient && (
                  <span className="text-[11px] text-red-600 font-medium mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {language === 'ur' ? 'مطلوبہ رقم آپ کے بیلنس سے زیادہ ہے' : 'Amount exceeds available balance'}
                  </span>
                )}
                {isBelowMin && (
                  <span className="text-[11px] text-amber-700 font-medium mt-1 block">
                    {language === 'ur' ? `کم از کم وڈرا ${minWithdraw} روپے ہے` : `Minimum withdrawal is Rs ${minWithdraw}`}
                  </span>
                )}
              </div>

              {/* Beneficiary Details */}
              <div className="space-y-2.5 border-t border-slate-100 pt-2">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    {language === 'ur'
                      ? `اکاؤنٹ ہولڈر کا نام (جیسا کہ ${method === 'easypaisa' ? 'ایزی پیسہ' : 'جیز کیش'} میں ہے):`
                      : `Account Title (as on ${method}):`}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={language === 'ur' ? 'مثال: علی حسن' : 'e.g. Ali Hassan'}
                    value={accountTitle}
                    onChange={(e) => setAccountTitle(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    {language === 'ur'
                      ? `${method === 'easypaisa' ? 'ایزی پیسہ' : 'جیز کیش'} موبائل نمبر:`
                      : `${method} Mobile Number:`}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="03XXXXXXXXX"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                  />
                </div>
              </div>

              {/* Submit CTA */}
              <button
                type="submit"
                disabled={isSubmitting || isInsufficient || isBelowMin || !amount}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 active:scale-98 text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <span className="animate-pulse">
                    {language === 'ur' ? 'وڈرا پراسیس ہو رہا ہے...' : 'Processing Payout...'}
                  </span>
                ) : (
                  <>
                    <span>
                      {language === 'ur'
                        ? `Rs ${withdrawAmount ? withdrawAmount.toLocaleString() : '0'} وڈرا کروائیں`
                        : `Confirm Withdrawal Rs ${withdrawAmount ? withdrawAmount.toLocaleString() : '0'}`}
                    </span>
                    <ArrowUpRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-500 font-medium">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>
                  {language === 'ur'
                    ? 'وڈرا رقم ایڈمن پینل سے منظوری کے بعد آپ کے اکاؤنٹ میں بھیجی جائے گی'
                    : 'Withdrawals are processed after Admin Panel approval'}
                </span>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
