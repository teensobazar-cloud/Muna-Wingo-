import React, { useState, useEffect } from 'react';
import { X, Check, AlertCircle, Lock } from 'lucide-react';
import { BetCategory } from '../types/game';
import { soundManager } from '../utils/audio';
import { getEstimatedReturnAndProfit } from '../utils/gameRules';

interface BetModalProps {
  isOpen: boolean;
  onClose: () => void;
  category: BetCategory | null;
  selection: string | number | null;
  userBalance: number;
  initialMultiplier: number;
  isLocked?: boolean;
  onConfirmBet: (contractMoney: number, quantity: number, multiplier: number) => void;
  onOpenDeposit: () => void;
  language: 'ur' | 'en';
}

export const BetModal: React.FC<BetModalProps> = ({
  isOpen,
  onClose,
  category,
  selection,
  userBalance,
  initialMultiplier,
  isLocked = false,
  onConfirmBet,
  onOpenDeposit,
  language
}) => {
  const [contractMoney, setContractMoney] = useState<number>(1);
  const [customContractText, setCustomContractText] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [quantityText, setQuantityText] = useState<string>('1');
  const [multiplier, setMultiplier] = useState<number>(initialMultiplier || 1);
  const [agreed, setAgreed] = useState<boolean>(true);

  // Sync multiplier & reset inputs cleanly each time modal opens
  useEffect(() => {
    if (isOpen) {
      setMultiplier(initialMultiplier || 1);
      setQuantity(1);
      setQuantityText('1');
      setCustomContractText('');
      setContractMoney(1);
    }
  }, [isOpen, initialMultiplier]);

  // If time hits last 5 seconds while bet drawer is open, auto close as requested!
  useEffect(() => {
    if (isOpen && isLocked) {
      onClose();
    }
  }, [isOpen, isLocked, onClose]);

  if (!isOpen || category === null || selection === null) return null;

  const totalAmount = contractMoney * quantity * multiplier;
  const isInsufficient = totalAmount > userBalance;
  const { totalReturn: estReturn, netProfit: estProfit } = getEstimatedReturnAndProfit(
    category,
    selection,
    totalAmount
  );

  // Contract options: Min Rs 1, unlimited max: 1, 5, 10, 50, 100, 500, 1000, 5000, 10000
  const contractOptions = [1, 5, 10, 50, 100, 500, 1000, 5000, 10000];
  const multiplierOptions = [1, 5, 10, 20, 50, 100];

  const getHeaderDetails = () => {
    if (category === 'color') {
      if (selection === 'green') {
        return {
          title: language === 'ur' ? 'سبز منتخب کریں' : 'Select Green',
          bg: 'bg-[#18b660]',
          rate: '2X'
        };
      }
      if (selection === 'violet') {
        return {
          title: language === 'ur' ? 'جامنی منتخب کریں' : 'Select Violet',
          bg: 'bg-[#9c27b0]',
          rate: '4.5X'
        };
      }
      return {
        title: language === 'ur' ? 'سرخ منتخب کریں' : 'Select Red',
        bg: 'bg-[#ea384c]',
        rate: '2X'
      };
    }
    if (category === 'bigSmall') {
      if (selection === 'Big') {
        return {
          title: language === 'ur' ? 'بڑا (Big 5-9)' : 'Select Big',
          bg: 'bg-[#f5a623]',
          rate: '2X'
        };
      }
      return {
        title: language === 'ur' ? 'چھوٹا (Small 0-4)' : 'Select Small',
        bg: 'bg-[#5dade2]',
        rate: '2X'
      };
    }
    return {
      title: language === 'ur' ? `نمبر ${selection} منتخب کریں` : `Select Number ${selection}`,
      bg: 'bg-[#ea384c]',
      rate: '9X'
    };
  };

  const header = getHeaderDetails();

  const handleConfirm = () => {
    if (!agreed || isLocked || totalAmount < 1) return;
    if (isInsufficient) {
      onOpenDeposit();
      return;
    }
    soundManager.playCash();
    onConfirmBet(contractMoney, quantity, multiplier);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4">
      {/* Drawer Card */}
      <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-200">
        {/* Modal Header */}
        <div className={`${header.bg} text-white px-5 py-4 flex items-center justify-between`}>
          <div>
            <h3 className="text-lg font-bold tracking-tight">{header.title}</h3>
            <span className="text-xs text-white/80 font-medium">
              {language === 'ur' ? `ممکنہ منافع: ${header.rate}` : `Estimated Payout: ${header.rate}`}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-white/20 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Balance notification */}
          <div className="flex items-center justify-between text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-200">
            <span className="text-slate-600 font-medium">
              {language === 'ur' ? 'دستیاب بیلنس:' : 'Available Balance:'}
            </span>
            <span className="font-bold text-slate-900 font-digital text-sm">
              Rs {userBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>

          {/* Locked in last 5 seconds alert */}
          {isLocked && (
            <div className="flex items-center gap-2 p-2.5 bg-rose-50 text-rose-700 rounded-xl border border-rose-200 text-xs">
              <Lock className="w-4 h-4 shrink-0" />
              <span className="font-bold">
                {language === 'ur'
                  ? 'آخری 5 سیکنڈ میں بیٹ بند ہو چکی ہے! اگلے راؤنڈ کا انتظار کریں۔'
                  : 'Betting is locked for the final 5 seconds!'}
              </span>
            </div>
          )}

          {/* Balance error */}
          {isInsufficient && (
            <div className="flex items-center gap-2 p-2.5 bg-red-50 text-red-700 rounded-xl border border-red-200 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>
                {language === 'ur'
                  ? 'بیلنس کم ہے! براہ کرم ایزی پیسہ یا جیز کیش سے ڈپازٹ کریں۔'
                  : 'Insufficient balance! Please deposit via EasyPaisa or JazzCash.'}
              </span>
            </div>
          )}

          {/* Contract Money */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700">
                {language === 'ur' ? 'رقم منتخب کریں (کم سے کم 1 روپیہ - لامحدود):' : 'Contract Money (PKR):'}
              </label>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  Min: Rs 1
                </span>
                <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                  {language === 'ur' ? 'Max: لامحدود' : 'Max: Unlimited'}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
              {contractOptions.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    soundManager.playClick();
                    setContractMoney(opt);
                    setCustomContractText('');
                  }}
                  className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    contractMoney === opt && !customContractText
                      ? `${header.bg} text-white shadow-sm scale-102`
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Rs {opt}
                </button>
              ))}
            </div>

            {/* Optional Custom PKR Input */}
            <div className="mt-2">
              <input
                type="text"
                inputMode="numeric"
                value={customContractText}
                onChange={(e) => {
                  const digits = e.target.value.replace(/[^0-9]/g, '');
                  setCustomContractText(digits);
                  if (digits && Number(digits) >= 1) {
                    setContractMoney(Number(digits));
                  } else if (!digits) {
                    setContractMoney(1);
                  }
                }}
                placeholder={
                  language === 'ur'
                    ? 'یا اپنی مرضی کی رقم لکھیں (کم از کم 1 روپیہ)'
                    : 'Or type custom amount (Min Rs 1)'
                }
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-slate-50/70 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold text-slate-900 placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* Quantity / Manual Bet Amount Selector: - [editable input] + */}
          <div className="flex items-center justify-between pt-1 gap-2">
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-slate-700">
                {language === 'ur' ? 'تعداد / مینول رقم درج کریں:' : 'Quantity / Manual Amount:'}
              </span>
              <span className="text-[10px] text-slate-400">
                {language === 'ur' ? 'یہاں خود ٹائپ بھی کر سکتے ہیں' : 'Tap box to type any number'}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  soundManager.playClick();
                  const next = Math.max(1, quantity - 1);
                  setQuantity(next);
                  setQuantityText(String(next));
                }}
                className="w-9 h-9 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 active:scale-95 font-bold flex items-center justify-center text-base cursor-pointer transition-all"
              >
                -
              </button>
              <input
                type="text"
                inputMode="numeric"
                aria-label={language === 'ur' ? 'تعداد یا مینول رقم' : 'Quantity or manual amount'}
                value={quantityText}
                onChange={(e) => {
                  const digits = e.target.value.replace(/[^0-9]/g, '');
                  setQuantityText(digits);
                  if (digits && Number(digits) >= 1) {
                    setQuantity(Number(digits));
                  }
                }}
                onBlur={() => {
                  const parsed = parseInt(quantityText, 10);
                  if (!parsed || parsed < 1) {
                    setQuantity(1);
                    setQuantityText('1');
                  } else {
                    setQuantity(parsed);
                    setQuantityText(String(parsed));
                  }
                }}
                className="w-20 h-9 text-center font-bold text-sm font-digital text-slate-900 bg-white border-2 border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 tabular-nums"
              />
              <button
                type="button"
                onClick={() => {
                  soundManager.playClick();
                  const next = quantity + 1;
                  setQuantity(next);
                  setQuantityText(String(next));
                }}
                className="w-9 h-9 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 active:scale-95 font-bold flex items-center justify-center text-base cursor-pointer transition-all"
              >
                +
              </button>
            </div>
          </div>

          {/* Multiplier Options (X1, X5, X10, X20, X50, X100) */}
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1.5">
              {language === 'ur' ? 'ملٹی پلائر (Multiplier):' : 'Multiplier:'}
            </label>
            <div className="grid grid-cols-6 gap-1.5">
              {multiplierOptions.map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    soundManager.playClick();
                    setMultiplier(m);
                  }}
                  className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    multiplier === m
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  X{m}
                </button>
              ))}
            </div>
          </div>

          {/* Pre-sale Rules agreement */}
          <div
            onClick={() => setAgreed(!agreed)}
            className="flex items-center gap-2 cursor-pointer pt-1"
          >
            <div
              className={`w-4 h-4 rounded border flex items-center justify-center ${
                agreed ? 'bg-red-500 border-red-500 text-white' : 'border-slate-300'
              }`}
            >
              {agreed && <Check className="w-3 h-3 stroke-[3]" />}
            </div>
            <span className="text-[11px] text-slate-600">
              {language === 'ur' ? 'میں نے پیشگی قوانین و ضوابط تسلیم کیے ہیں' : 'I agree to the PRE-SALE RULES'}
            </span>
          </div>

          {/* Live Payout & Profit Breakdown */}
          <div className="bg-emerald-50/90 border border-emerald-200 rounded-xl px-3 py-2 flex items-center justify-between text-xs">
            <div className="flex flex-col">
              <span className="text-[11px] font-bold text-emerald-900">
                {language === 'ur' ? 'جیتنے پر کل واپسی:' : 'Win Return (Stake + Profit):'}
              </span>
              <span className="text-[10px] text-emerald-700 font-medium">
                {language === 'ur'
                  ? `آپ کی رقم Rs ${totalAmount.toLocaleString()} + منافع Rs ${estProfit.toLocaleString()}`
                  : `Stake Rs ${totalAmount.toLocaleString()} + Profit Rs ${estProfit.toLocaleString()}`}
              </span>
            </div>
            <span className="font-digital font-black text-base text-emerald-700 tabular-nums">
              Rs {estReturn.toLocaleString()}
            </span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-50 transition-colors cursor-pointer"
            >
              {language === 'ur' ? 'منسوخ کریں' : 'Cancel'}
            </button>

            {isInsufficient ? (
              <button
                onClick={onOpenDeposit}
                className="flex-2 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>{language === 'ur' ? 'ایزی پیسہ / جیز کیش ڈپازٹ کریں' : 'Deposit Now (EasyPaisa/JazzCash)'}</span>
              </button>
            ) : (
              <button
                disabled={!agreed || isLocked || totalAmount < 1}
                onClick={handleConfirm}
                className={`flex-2 py-3 rounded-xl ${header.bg} hover:brightness-110 active:scale-98 text-white font-bold text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer`}
              >
                {isLocked ? (
                  <span>{language === 'ur' ? 'بیٹ کلوز ہو چکی ہے' : 'Betting Closed'}</span>
                ) : (
                  <span>
                    {language === 'ur'
                      ? `رقم Rs ${totalAmount.toLocaleString()} تصدیق کریں`
                      : `Total amount Rs ${totalAmount.toLocaleString()} Confirm`}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
