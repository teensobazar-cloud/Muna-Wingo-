import React, { useState, useEffect } from 'react';
import {
  X,
  Copy,
  Check,
  ArrowRight,
  ShieldCheck,
  QrCode,
  ExternalLink,
  Building2,
  AlertCircle,
  Sparkles,
  History,
  Clock,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { PaymentTransaction, AppTheme } from '../types/game';
import { soundManager } from '../utils/audio';

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDepositSuccess: (amount: number, transaction: PaymentTransaction, autoCredited: boolean) => void;
  existingTrxIds?: string[];
  transactions?: PaymentTransaction[];
  initialTab?: 'form' | 'history';
  language: 'ur' | 'en';
  theme?: AppTheme;
}

export const DepositModal: React.FC<DepositModalProps> = ({
  isOpen,
  onClose,
  onDepositSuccess,
  existingTrxIds = [],
  transactions = [],
  initialTab = 'form',
  language,
  theme = 'blue'
}) => {
  const isBlue = theme === 'blue';
  const [activeTab, setActiveTab] = useState<'form' | 'history'>(initialTab);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'pending' | 'completed' | 'rejected'>('all');
  const [depositMode, setDepositMode] = useState<'qr' | 'manual'>('qr');
  const [amount, setAmount] = useState<number>(500);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [senderNumber, setSenderNumber] = useState<string>('');
  const [trxId, setTrxId] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<'number' | 'iban' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [successReceipt, setSuccessReceipt] = useState<{ tx: PaymentTransaction } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setFormError(null);
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const depositTransactions = transactions
    .filter((t) => t.type === 'deposit')
    .sort((a, b) => b.timestamp - a.timestamp);
  const pendingCount = depositTransactions.filter((t) => t.status === 'pending').length;
  const approvedCount = depositTransactions.filter((t) => t.status === 'completed').length;
  const rejectedCount = depositTransactions.filter((t) => t.status === 'rejected').length;
  const filteredDeposits =
    historyFilter === 'all'
      ? depositTransactions
      : depositTransactions.filter((t) => t.status === historyFilter);

  // Official bank account number details
  const officialAccount = {
    bankName: 'Raqami Islamic Digital Bank',
    accountNumber: '022028779426',
    iban: 'PK93RQMI0000022028779426',
    accountType: 'Assan Digital Current Account'
  };

  const quickAmounts = [100, 300, 500, 1000, 2500, 5000, 10000];

  const handleCopy = (text: string, field: 'number' | 'iban') => {
    soundManager.playClick();
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const currentAmount = customAmount ? Number(customAmount) : amount;
  const bonusAmount = currentAmount >= 500 ? Math.round(currentAmount * 0.2) : 0;
  const totalCredit = currentAmount + bonusAmount;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!currentAmount || currentAmount < 50) {
      setFormError('Minimum deposit is Rs 50');
      return;
    }

    if (!senderNumber || senderNumber.trim().length < 10) {
      setFormError('Please enter a valid mobile number');
      return;
    }

    const cleanTrx = trxId.trim().toUpperCase();
    if (!cleanTrx || cleanTrx.length < 8 || !/\d{6,}/.test(cleanTrx)) {
      setFormError('Please enter a valid TRX ID (at least 8 characters with digits)');
      return;
    }

    const isDuplicateTrx = existingTrxIds.some(
      (existing) => existing.trim().toUpperCase() === cleanTrx
    );
    if (isDuplicateTrx) {
      setFormError('This TRX ID has already been used. Please enter a new transaction TRX ID.');
      return;
    }

    setIsSubmitting(true);

    const tx: PaymentTransaction = {
      id: `DEP-${Date.now()}`,
      type: 'deposit',
      method: 'easypaisa',
      amount: currentAmount,
      bonusAmount,
      accountNumber: senderNumber.trim(),
      accountTitle: 'Player',
      trxId: cleanTrx,
      status: 'pending',
      timestamp: Date.now(),
      note:
        (depositMode === 'qr'
          ? 'QR Deposit (TRX ID Sent for Admin Approval)'
          : 'Bank Deposit (TRX ID Sent for Admin Approval)') +
        (bonusAmount > 0 ? ` + Rs ${bonusAmount.toLocaleString()} (20% Bonus)` : '')
    };

    setTimeout(() => {
      soundManager.playCash();
      setIsSubmitting(false);
      setSuccessReceipt({ tx });
      onDepositSuccess(totalCredit, tx, false);
    }, 550);
  };

  const handleClose = () => {
    setSuccessReceipt(null);
    setFormError(null);
    setTrxId('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-3">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div
          className={`text-white px-5 py-3.5 flex items-center justify-between transition-colors ${
            isBlue
              ? 'bg-gradient-to-r from-blue-700 to-indigo-800'
              : 'bg-gradient-to-r from-emerald-700 to-teal-800'
          }`}
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold text-sm">
              Rs
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">
                {activeTab === 'history' ? 'Deposit History' : 'Deposit Balance'}
              </h3>
              <p className="text-[11px] text-white/80">
                {activeTab === 'history'
                  ? 'Track Pending & Approved deposits'
                  : 'EasyPaisa / JazzCash / QR Transfer'}
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
              title="Deposit History"
            >
              <History className="w-4 h-4" />
              <span>History</span>
              {pendingCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black leading-tight">
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

        {/* Sub-navigation bar between Deposit Form & Deposit History */}
        <div className="px-4 pt-3 pb-1 bg-slate-50 border-b border-slate-200 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              soundManager.playClick();
              setActiveTab('form');
            }}
            className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'form'
                ? isBlue
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-emerald-600 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>New Deposit</span>
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
                ? isBlue
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-emerald-600 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Deposit History ({depositTransactions.length})</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 overflow-y-auto space-y-4">
          {activeTab === 'history' ? (
            /* DEPOSIT HISTORY LIST */
            <div className="space-y-3 animate-in fade-in">
              {/* Filter Pills */}
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { key: 'all', label: `All (${depositTransactions.length})` },
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

              {filteredDeposits.length === 0 ? (
                <div className="py-10 text-center space-y-3 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="w-12 h-12 rounded-full bg-slate-200 text-slate-500 mx-auto flex items-center justify-center">
                    <History className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-700">No Deposit Records</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {historyFilter === 'all'
                        ? 'Your submitted deposits will appear here with Pending or Approved status.'
                        : `No ${historyFilter === 'completed' ? 'approved' : historyFilter} deposits found.`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('form')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold text-white cursor-pointer ${
                      isBlue ? 'bg-blue-600 hover:bg-blue-700' : 'bg-emerald-600 hover:bg-emerald-700'
                    }`}
                  >
                    Make a Deposit
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredDeposits.map((tx) => {
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
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-black text-slate-900 text-sm font-digital">
                              Rs {tx.amount.toLocaleString()}
                            </span>
                            {Boolean(tx.bonusAmount && tx.bonusAmount > 0) && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                                +Rs {(tx.bonusAmount || 0).toLocaleString()} Bonus
                              </span>
                            )}
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
                            <span className="text-slate-400 block text-[9px] uppercase font-bold">TRX ID</span>
                            <span className="font-mono font-bold text-slate-900 break-all">
                              {tx.trxId || 'N/A'}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[9px] uppercase font-bold">Sender Number</span>
                            <span className="font-mono font-semibold text-slate-800">
                              {tx.accountNumber || 'N/A'}
                            </span>
                          </div>
                          <div className="col-span-2 flex items-center justify-between pt-1 border-t border-slate-100 text-[10px] text-slate-500">
                            <span className="uppercase font-bold text-slate-600">{tx.method}</span>
                            <span>{new Date(tx.timestamp).toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : successReceipt ? (
            /* Pending Admin Verification Receipt */
            <div className="py-4 text-center space-y-4 animate-in fade-in zoom-in-95">
              <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center shadow-inner bg-amber-100 text-amber-600">
                <Clock className="w-9 h-9 stroke-[2.5]" />
              </div>

              <div>
                <h4 className="text-xl font-black text-slate-800">
                  Deposit Submitted! Pending Approval
                </h4>
                <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto leading-relaxed">
                  Your TRX ID has been sent to the Admin Panel. Your balance will be credited once Admin approves it.
                </p>
              </div>

              {/* Receipt Box */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 text-xs text-left space-y-2 font-mono">
                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="text-slate-500">Status:</span>
                  <span className="font-bold uppercase text-amber-600">
                    PENDING ADMIN APPROVAL
                  </span>
                </div>
                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="text-slate-500">Deposit Amount:</span>
                  <span className="font-bold text-slate-800">
                    Rs {successReceipt.tx.amount.toLocaleString()} PKR
                  </span>
                </div>
                {Boolean(successReceipt.tx.bonusAmount && successReceipt.tx.bonusAmount > 0) && (
                  <div className="flex justify-between border-b border-slate-200 pb-2">
                    <span className="text-amber-700 font-semibold">20% Deposit Bonus:</span>
                    <span className="font-bold text-amber-600">
                      +Rs {(successReceipt.tx.bonusAmount || 0).toLocaleString()} PKR
                    </span>
                  </div>
                )}
                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="text-slate-500 font-bold">Total on Approval:</span>
                  <span className="font-black text-emerald-600 text-sm">
                    Rs {(successReceipt.tx.amount + (successReceipt.tx.bonusAmount || 0)).toLocaleString()} PKR
                  </span>
                </div>
                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="text-slate-500">TRX ID:</span>
                  <span className="font-bold text-slate-800">{successReceipt.tx.trxId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Sender Number:</span>
                  <span className="text-slate-800">{successReceipt.tx.accountNumber}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    soundManager.playClick();
                    setSuccessReceipt(null);
                    setTrxId('');
                    setActiveTab('history');
                  }}
                  className="py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <History className="w-4 h-4" />
                  <span>Deposit History</span>
                </button>
                <button
                  onClick={handleClose}
                  className={`py-3 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md transition-all cursor-pointer ${
                    isBlue
                      ? 'bg-blue-600 hover:bg-blue-700'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {formError && (
                <div className="flex items-center gap-2 p-2.5 bg-rose-50 text-rose-700 rounded-xl border border-rose-200 text-xs font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Toggle Between QR Code and Bank Account */}
              <div className="grid grid-cols-2 gap-1.5 bg-slate-100 rounded-2xl p-1 border border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    soundManager.playClick();
                    setDepositMode('qr');
                  }}
                  className={`py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    depositMode === 'qr'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <QrCode className="w-4 h-4 text-emerald-600" />
                  <span>{language === 'ur' ? 'کیو آر کوڈ (QR)' : 'QR Code'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    soundManager.playClick();
                    setDepositMode('manual');
                  }}
                  className={`py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    depositMode === 'manual'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Building2 className="w-4 h-4 text-blue-600" />
                  <span>{language === 'ur' ? 'بینک اکاؤنٹ' : 'Bank Account'}</span>
                </button>
              </div>

              {/* 1. QR Code Display Section */}
              {depositMode === 'qr' && (
                <div className="bg-gradient-to-b from-slate-50 to-white rounded-2xl p-3 border-2 border-emerald-500/30 text-center space-y-2.5 shadow-xs">
                  <div className="flex items-center justify-between text-xs px-1">
                    <span className="font-bold text-slate-800">
                      {language === 'ur' ? 'آفیشل کیو آر کوڈ (Official QR Code)' : 'Official QR Code'}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Live Verified
                    </span>
                  </div>

                  {/* QR Code Image Container */}
                  <div className="relative group mx-auto max-w-[240px] bg-white p-2 rounded-2xl shadow-md border border-slate-200">
                    <img
                      src="/assets/aistudio/IMG-20261111-WA0149_2_04dc891a.jpg"
                      alt="Deposit QR Code"
                      className="w-full h-auto rounded-xl object-contain"
                    />
                    <a
                      href="/assets/aistudio/IMG-20261111-WA0149_2_04dc891a.jpg"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="absolute bottom-3 right-3 bg-slate-900/80 hover:bg-slate-900 text-white p-1.5 rounded-lg text-[10px] flex items-center gap-1 shadow-md transition-all backdrop-blur-xs"
                      title="Open full image"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Zoom</span>
                    </a>
                  </div>

                  {/* Account Number Box */}
                  <div className="bg-emerald-50 rounded-xl p-2.5 border border-emerald-200/80 text-left text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 text-[11px] font-semibold">
                        {language === 'ur' ? 'اکاؤنٹ نمبر:' : 'Account Number:'}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-black text-slate-900 tracking-wider text-xs sm:text-sm">
                          {officialAccount.accountNumber}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(officialAccount.accountNumber, 'number')}
                          className="p-1 rounded-md bg-white border border-emerald-200 hover:bg-emerald-100 text-emerald-700 transition-colors cursor-pointer"
                          title="Copy Account Number"
                        >
                          {copiedField === 'number' ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-snug pt-0.5">
                      Transfer via this QR code or Account Number, then enter your TRX ID below.
                    </p>
                  </div>
                </div>
              )}

              {/* 2. Official Bank Account Details (Matching screenshot provided by user) */}
              {depositMode === 'manual' && (
                <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800">
                      {language === 'ur' ? 'بینک اکاؤنٹ کی تفصیلات (Account Info):' : 'Official Bank Account Details:'}
                    </span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                      Active & Verified
                    </span>
                  </div>

                  {/* Account Info Details Table */}
                  <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 text-xs overflow-hidden">
                    {/* Account Number with Copy */}
                    <div className="flex items-center justify-between p-2.5">
                      <span className="text-slate-500 font-medium">Account Number</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-900 tracking-wider text-sm">
                          {officialAccount.accountNumber}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(officialAccount.accountNumber, 'number')}
                          className="p-1 rounded hover:bg-slate-100 text-blue-600 transition-colors cursor-pointer"
                          title="Copy Account Number"
                        >
                          {copiedField === 'number' ? (
                            <Check className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* IBAN with Copy */}
                    <div className="flex items-center justify-between p-2.5">
                      <span className="text-slate-500 font-medium">IBAN</span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-slate-900 tracking-tight text-[11px] sm:text-xs">
                          {officialAccount.iban}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(officialAccount.iban, 'iban')}
                          className="p-1 rounded hover:bg-slate-100 text-blue-600 transition-colors cursor-pointer shrink-0"
                          title="Copy IBAN"
                        >
                          {copiedField === 'iban' ? (
                            <Check className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Bank Name */}
                    <div className="flex items-center justify-between p-2.5 bg-slate-50/60">
                      <span className="text-slate-500 font-medium">Bank Name</span>
                      <span className="font-bold text-emerald-700 font-sans">{officialAccount.bankName}</span>
                    </div>
                  </div>

                  {/* Transfer Guide for EasyPaisa / JazzCash */}
                  <div className="p-2.5 bg-blue-50/80 rounded-xl border border-blue-200/80 text-[11px] text-blue-900 leading-relaxed">
                    <p className="font-semibold">
                      {language === 'ur' ? '💡 ایزی پیسہ یا جیز کیش سے بھیجنے کا طریقہ:' : '💡 How to send from EasyPaisa or JazzCash:'}
                    </p>
                    <p className="text-[10px] text-blue-800 mt-0.5">
                      {language === 'ur'
                        ? '1. ایپ میں "Bank Transfer" کھولیں ➔ 2. "Raqami Islamic Digital Bank" منتخب کریں ➔ 3. اکاؤنٹ نمبر 022028779426 درج کریں اور رقم بھیجیں۔'
                        : '1. Open Bank Transfer in app ➔ 2. Select "Raqami Islamic Digital Bank" ➔ 3. Enter 022028779426 and send payment.'}
                    </p>
                  </div>
                </div>
              )}


              {/* Quick Amount Selector */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                  {language === 'ur' ? 'ڈپازٹ کی رقم (PKR):' : 'Select Deposit Amount (PKR):'}
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {quickAmounts.map((q) => {
                    const qBonus = q >= 500 ? Math.round(q * 0.2) : 0;
                    return (
                      <button
                        type="button"
                        key={q}
                        onClick={() => {
                          soundManager.playClick();
                          setAmount(q);
                          setCustomAmount('');
                        }}
                        className={`relative py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex flex-col items-center justify-center ${
                          currentAmount === q && !customAmount
                            ? isBlue
                              ? 'bg-blue-600 text-white shadow-xs scale-102'
                              : 'bg-emerald-600 text-white shadow-xs scale-102'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        <span>Rs {q}</span>
                        {qBonus > 0 && (
                          <span
                            className={`text-[9px] font-black leading-tight ${
                              currentAmount === q && !customAmount ? 'text-amber-200' : 'text-emerald-600'
                            }`}
                          >
                            +{qBonus} Bonus
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Custom amount */}
                <div className="mt-2">
                  <input
                    type="number"
                    placeholder={language === 'ur' ? 'یا اپنی مرضی کی رقم درج کریں' : 'Or enter custom amount (PKR)'}
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    className={`w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 font-medium ${
                      isBlue ? 'focus:ring-blue-500' : 'focus:ring-emerald-500'
                    }`}
                    min="50"
                  />
                </div>

                {/* 20% Deposit Bonus Breakdown Banner */}
                {currentAmount >= 500 ? (
                  <div className="mt-2.5 bg-gradient-to-r from-amber-50 via-yellow-50 to-emerald-50 border border-amber-300/80 rounded-xl p-2.5 space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-amber-800 flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                        <span>
                          {language === 'ur' ? '20% ڈپازٹ بونس شامل ہے!' : '20% Deposit Bonus Included!'}
                        </span>
                      </span>
                      <span className="font-black text-emerald-700 font-mono">
                        +Rs {bonusAmount.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-amber-200/70">
                      <span className="text-slate-600 font-medium">
                        {language === 'ur'
                          ? `Rs ${currentAmount.toLocaleString()} + Rs ${bonusAmount.toLocaleString()} بونس:`
                          : `Rs ${currentAmount.toLocaleString()} + Rs ${bonusAmount.toLocaleString()} Bonus:`}
                      </span>
                      <span className="font-black text-emerald-700 text-sm">
                        {language === 'ur'
                          ? `کل Rs ${totalCredit.toLocaleString()} ملیں گے`
                          : `Total Rs ${totalCredit.toLocaleString()}`}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 bg-amber-50/80 border border-amber-200 rounded-xl px-3 py-2 text-[11px] text-amber-900 font-medium flex items-center justify-between gap-2">
                    <span>
                      {language === 'ur'
                        ? '🎁 500 روپے یا زیادہ ڈپازٹ پر 20% بونس (500 پہ +100، 1000 پہ +200)!'
                        : '🎁 Deposit Rs 500+ to unlock 20% Bonus (Rs 500 → +100, Rs 1000 → +200)!'}
                    </span>
                  </div>
                )}
              </div>

              {/* Sender Details + TRX ID + Screenshot Upload for Auto-Detection */}
              <div className="space-y-2.5 pt-1 border-t border-slate-100">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    {language === 'ur'
                      ? 'آپ کا ایزی پیسہ / جیز کیش / موبائل نمبر:'
                      : 'Your Sender Mobile Number:'}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="03XXXXXXXXX"
                    value={senderNumber}
                    onChange={(e) => setSenderNumber(e.target.value)}
                    className={`w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 font-mono ${
                      isBlue ? 'focus:ring-blue-500' : 'focus:ring-emerald-500'
                    }`}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Transaction ID (TRX ID / TID): *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Enter 11-digit TRX ID (e.g. 12345678901)"
                    value={trxId}
                    onChange={(e) => setTrxId(e.target.value)}
                    className={`w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 font-mono uppercase ${
                      isBlue ? 'focus:ring-blue-500' : 'focus:ring-emerald-500'
                    }`}
                  />
                  <span className="text-[10px] text-slate-500 font-medium mt-1 block">
                    Your TRX ID will appear in the Admin Panel for verification &amp; approval.
                  </span>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 active:scale-98 text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <span className="animate-pulse">Submitting TRX ID...</span>
                ) : (
                  <>
                    <span>
                      {bonusAmount > 0
                        ? `Submit Deposit Rs ${currentAmount.toLocaleString()} + Rs ${bonusAmount.toLocaleString()} Bonus`
                        : `Submit Deposit Rs ${currentAmount.toLocaleString()}`}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-400">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>100% Secure &amp; Real Pakistani EasyPaisa, JazzCash, Raast &amp; Bank Transfer</span>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
