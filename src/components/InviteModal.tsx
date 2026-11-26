import React, { useState } from 'react';
import { X, Copy, Check, Share2, MessageCircle, Gift, Users, Sparkles } from 'lucide-react';
import { soundManager } from '../utils/audio';
import { AppTheme } from '../types/game';

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: 'ur' | 'en';
  theme?: AppTheme;
  referralCode?: string;
  earnedCommission?: number;
  invitedCount?: number;
}

export const InviteModal: React.FC<InviteModalProps> = ({
  isOpen,
  onClose,
  language,
  theme = 'blue',
  referralCode = 'MUNA888',
  earnedCommission = 0,
  invitedCount = 0
}) => {
  const isBlue = theme === 'blue';
  const [copied, setCopied] = useState<boolean>(false);
  const [codeCopied, setCodeCopied] = useState<boolean>(false);

  if (!isOpen) return null;

  const publicAppUrl = 'https://muna-wingo.vercel.app';
  const currentUrl = publicAppUrl;
  const activeCode = (referralCode || 'MUNA888').trim();
  const inviteLink = `${currentUrl}/?ref=${encodeURIComponent(activeCode)}`;

  const shareText =
    language === 'ur'
      ? `🎮 منا ونگو (Muna WinGo) آفیشل گیم میں شامل ہوں! نیا اکاؤنٹ بنانے پر Rs 10 سائن اپ بونس اور 500+ ڈپازٹ پر 20% اضافی بونس حاصل کریں! ایزی پیسہ اور جیز کیش فوری ڈپازٹ و وڈرا۔\nمیرا انوائٹ کوڈ: ${activeCode}\nجوائن لنک: ${inviteLink}`
      : `🎮 Join Muna WinGo! Get Rs 10 Sign-Up Bonus & 20% Deposit Bonus on Rs 500+ deposits! EasyPaisa & JazzCash supported.\nMy Invite Code: ${activeCode}\nJoin Link: ${inviteLink}`;

  const waShareHref = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;

  const handleCopyLink = () => {
    soundManager.playCash();
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyCode = () => {
    soundManager.playClick();
    navigator.clipboard.writeText(activeCode);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  const handleNativeShare = async () => {
    soundManager.playClick();
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Muna WinGo',
          text: shareText,
          url: inviteLink
        });
      } catch {
        // Share cancelled
      }
    } else {
      handleCopyLink();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-3 animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div
          className={`text-white px-5 py-4 flex items-center justify-between shrink-0 ${
            isBlue
              ? 'bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800'
              : 'bg-gradient-to-r from-emerald-700 via-teal-700 to-emerald-800'
          }`}
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-amber-300">
              <Gift className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">
                {language === 'ur' ? 'دوستوں کو انوائٹ کریں (Rs 10 + 7% کمیشن)' : 'Invite Friends (Rs 10 + 7% Commission)'}
              </h3>
              <p className="text-[11px] text-white/85">
                {language === 'ur'
                  ? 'ہر دوست کے سائن اپ پر Rs 10 اور ڈپازٹ پر 7% کمیشن کمائیں'
                  : 'Earn Rs 10 per signup + 7% commission on deposits'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-white/20 transition-colors cursor-pointer text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 space-y-3 text-center overflow-y-auto">
          {/* Logo & Bonus Highlight */}
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 rounded-full overflow-hidden shadow-lg border-2 border-white mb-2 ring-2 ring-amber-400/60">
              <img
                src="/muna-logo-512.png"
                alt="Muna WinGo"
                className="w-full h-full object-contain rounded-full"
              />
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 border border-amber-300 text-amber-900 text-xs font-black mb-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-600 fill-amber-400" />
              <span>
                {language === 'ur' ? 'Rs 10 بونس + 7% ریفرل کمیشن!' : 'Rs 10 Signup Bonus + 7% Commission!'}
              </span>
            </div>
            <p className="text-[11px] text-slate-600 mt-0.5 max-w-xs leading-snug">
              {language === 'ur'
                ? 'دوست کے جوائن کرتے ہی Rs 10 فوری بونس اور اس کے ہر ڈپازٹ پر 7% کمیشن آپ کے بیلنس میں شامل ہوگا!'
                : 'Get Rs 10 instantly when a friend signs up with your link, plus 7% on every deposit they make!'}
            </p>
          </div>

          {/* Referral Stats */}
          <div className="grid grid-cols-2 gap-2 text-left">
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-2.5">
              <div className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700">
                <Users className="w-3.5 h-3.5" />
                <span>{language === 'ur' ? 'انوائٹ شدہ دوست' : 'Invited Friends'}</span>
              </div>
              <div className="text-base font-black text-emerald-900 font-mono mt-0.5">
                {invitedCount}
              </div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-2.5">
              <div className="flex items-center gap-1 text-[10px] font-semibold text-amber-800">
                <Gift className="w-3.5 h-3.5" />
                <span>{language === 'ur' ? 'کل ریفرل کمائی' : 'Total Referral Earned'}</span>
              </div>
              <div className="text-base font-black text-amber-900 font-mono mt-0.5">
                Rs {earnedCommission.toLocaleString()}
              </div>
            </div>
          </div>

          {/* 7% Commission Examples Box */}
          <div className="bg-gradient-to-r from-slate-50 to-blue-50/70 rounded-2xl p-2.5 border border-slate-200 text-[11px]">
            <div className="font-bold text-slate-700 mb-1.5">
              {language === 'ur' ? 'انوائٹ بونس و 7% کمیشن مثال:' : 'Rs 10 Signup + 7% Deposit Commission:'}
            </div>
            <div className="grid grid-cols-3 gap-1.5 font-mono">
              <div className="bg-white rounded-xl py-1.5 px-1 border border-slate-200">
                <div className="text-[10px] text-slate-500">Rs 500</div>
                <div className="font-black text-emerald-600">+Rs 35</div>
              </div>
              <div className="bg-white rounded-xl py-1.5 px-1 border border-slate-200">
                <div className="text-[10px] text-slate-500">Rs 1,000</div>
                <div className="font-black text-emerald-600">+Rs 70</div>
              </div>
              <div className="bg-white rounded-xl py-1.5 px-1 border border-slate-200">
                <div className="text-[10px] text-slate-500">Rs 5,000</div>
                <div className="font-black text-emerald-600">+Rs 350</div>
              </div>
            </div>
          </div>

          {/* Referral Code Box */}
          <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-200 flex items-center justify-between">
            <div className="text-left pl-1">
              <span className="text-[10px] text-slate-400 block font-medium">
                {language === 'ur' ? 'آپ کا انوائٹ کوڈ' : 'Your Invite Code'}
              </span>
              <span className="text-sm font-black font-mono text-slate-800 tracking-wider">
                {activeCode}
              </span>
            </div>
            <button
              onClick={handleCopyCode}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                codeCopied
                  ? 'bg-emerald-600 text-white'
                  : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
            >
              {codeCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{codeCopied ? (language === 'ur' ? 'کاپی ہو گیا' : 'Copied') : (language === 'ur' ? 'کوڈ کاپی کریں' : 'Copy Code')}</span>
            </button>
          </div>

          {/* Share Link Box */}
          <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-200 text-left">
            <span className="text-[10px] text-slate-400 block font-medium mb-1 pl-1">
              {language === 'ur' ? 'آفیشل جوائن لنک (Share Link):' : 'Official Share Link:'}
            </span>
            <div className="flex items-center gap-1.5 bg-white p-1.5 rounded-xl border border-slate-200">
              <input
                type="text"
                readOnly
                value={inviteLink}
                className="w-full text-xs font-mono text-slate-600 bg-transparent px-1 focus:outline-none select-all truncate"
              />
              <button
                onClick={handleCopyLink}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 shrink-0 cursor-pointer ${
                  copied
                    ? 'bg-emerald-600 text-white'
                    : isBlue
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? (language === 'ur' ? 'کاپی ہو گیا' : 'Copied') : (language === 'ur' ? 'کاپی' : 'Copy')}</span>
              </button>
            </div>
          </div>

          {/* Social Share Buttons */}
          <div className="space-y-2 pt-1">
            <a
              href={waShareHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => soundManager.playClick()}
              className="w-full py-3 bg-[#25D366] hover:bg-[#20bd5a] active:scale-98 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <MessageCircle className="w-4 h-4 fill-white" />
              <span>{language === 'ur' ? 'واٹس ایپ پر شیئر کریں (WhatsApp Share)' : 'Share on WhatsApp'}</span>
            </a>

            <button
              onClick={handleNativeShare}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-900 active:scale-98 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Share2 className="w-4 h-4" />
              <span>{language === 'ur' ? 'مزید ایپس پر شیئر کریں (Share to Apps)' : 'Share via Other Apps'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
