import React from 'react';
import { X, BookOpen, ShieldCheck } from 'lucide-react';
import { AppTheme } from '../types/game';

interface RulesModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: 'ur' | 'en';
  theme?: AppTheme;
}

export const RulesModal: React.FC<RulesModalProps> = ({
  isOpen,
  onClose,
  language,
  theme = 'blue'
}) => {
  if (!isOpen) return null;

  const isBlue = theme === 'blue';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs p-3">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div
          className={`text-white px-5 py-3.5 flex items-center justify-between ${
            isBlue
              ? 'bg-gradient-to-r from-blue-700 to-indigo-800'
              : 'bg-gradient-to-r from-emerald-700 to-teal-800'
          }`}
        >
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-white" />
            <h3 className="font-bold text-base">
              {language === 'ur' ? 'منا ونگو - کھیلنے کا مکمل طریقہ' : 'Muna WinGo - How to Play Rules'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-white/20 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto space-y-4 text-xs text-slate-700 leading-relaxed">
          {/* Official Game Logo Banner */}
          <div className="flex justify-center py-1">
            <img
              src="/muna-logo-512.png"
              alt="Muna WinGo Official Logo"
              className="h-28 w-28 object-contain rounded-full shadow-md"
            />
          </div>

          {language === 'ur' ? (
            <>
              {/* Urdu Explanation */}
              <div
                className={`p-3 rounded-2xl border ${
                  isBlue
                    ? 'bg-blue-50 border-blue-200 text-blue-950'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-950'
                }`}
              >
                <h4 className="font-bold text-sm mb-1">منا ونگو (Muna WinGo) 1 منٹ لاٹری کیا ہے؟</h4>
                <p>
                  ہر 1 منٹ بعد ایک بے ترتیب نمبر (0 تا 9) اور رنگ کا اعلان ہوتا ہے۔ آخری 5 سیکنڈ میں بیٹ بند ہو جاتی ہے۔ درست پیشگوئی پر منافع فوراً آپ کے اکاؤنٹ میں شامل ہو جاتا ہے۔
                </p>
              </div>

              {/* Color Rules */}
              <div className="space-y-2">
                <h4 className="font-bold text-slate-900 text-sm">1. رنگوں کے انعامات (Color Rules):</h4>
                <div className="space-y-1.5 pl-2">
                  <div className="flex items-start gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#18b660] shrink-0 mt-0.5" />
                    <div>
                      <strong>سبز (Green):</strong> اگر 1, 3, 7, 9 آئے تو رقم دگنی (2X) ملے گی۔ اگر 5 آئے تو (1.5X) ملے گی۔
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#ea384c] shrink-0 mt-0.5" />
                    <div>
                      <strong>سرخ (Red):</strong> اگر 2, 4, 6, 8 آئے تو رقم دگنی (2X) ملے گی۔ اگر 0 آئے تو (1.5X) ملے گی۔
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#9c27b0] shrink-0 mt-0.5" />
                    <div>
                      <strong>جامنی (Violet):</strong> اگر 0 یا 5 آئے تو ساڑھے چار گنا (4.5X) بھاری انعام ملے گا!
                    </div>
                  </div>
                </div>
              </div>

              {/* Number Rules */}
              <div className="space-y-2">
                <h4 className="font-bold text-slate-900 text-sm">2. مخصوص نمبرز (Numbers 0-9):</h4>
                <p className="pl-2">
                  اگر آپ کسی بھی ایک نمبر (0 سے 9) پر بیٹ لگاتے ہیں اور وہی نمبر نکل آتا ہے تو آپ کو رقم کا <strong>9 گنا (9X)</strong> منافع ملتا ہے!
                </p>
              </div>

              {/* Big & Small Rules */}
              <div className="space-y-2">
                <h4 className="font-bold text-slate-900 text-sm">3. بڑا اور چھوٹا (Big & Small):</h4>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>بڑا (Big):</strong> نمبر 5, 6, 7, 8, 9 (منافع: 2X)</li>
                  <li><strong>چھوٹا (Small):</strong> نمبر 0, 1, 2, 3, 4 (منافع: 2X)</li>
                </ul>
              </div>

              {/* EasyPaisa & JazzCash rules */}
              <div className="bg-emerald-50 p-3 rounded-2xl border border-emerald-200 text-emerald-950 space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>ڈپازٹ، وڈرا اور بونس کے اصول:</span>
                </div>
                <p>
                  • نیا اکاؤنٹ بنانے پر <strong>10 روپے</strong> سائن اپ بونس ملتا ہے۔<br />
                  • ڈپازٹ کم از کم <strong>50 روپے</strong> ہے (سکرین شاٹ + TRX ID سے آٹو تصدیق)۔<br />
                  • <strong>500 یا اس سے زیادہ ڈپازٹ پر 20% بونس</strong> ملتا ہے (500 پہ +100، 1,000 پہ +200، اسی تناسب سے بڑھتا جائے گا)۔<br />
                  • دوستوں کو انوائٹ کرنے پر ان کے ڈپازٹ کا <strong>7% ریفرل کمیشن</strong> ملتا ہے۔<br />
                  • وڈرا کم از کم <strong>500 روپے</strong> ہے جو ایڈمن پینل سے منظوری کے بعد منتقل ہوتا ہے۔
                </p>
              </div>
            </>
          ) : (
            <>
              {/* English Explanation */}
              <div
                className={`p-3 rounded-2xl border ${
                  isBlue
                    ? 'bg-blue-50 border-blue-200 text-blue-950'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-950'
                }`}
              >
                <h4 className="font-bold text-sm mb-1">What is Muna WinGo 1-Minute?</h4>
                <p>
                  Every minute, a random winning number (0-9) and corresponding colors are drawn. Betting closes during the last 5 seconds of the countdown.
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-slate-900 text-sm">1. Color Payout Rules:</h4>
                <div className="space-y-1.5 pl-2">
                  <div className="flex items-start gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#18b660] shrink-0 mt-0.5" />
                    <div>
                      <strong>Green:</strong> If 1, 3, 7, 9 appears $\to$ 2X payout. If 5 appears $\to$ 1.5X payout.
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#ea384c] shrink-0 mt-0.5" />
                    <div>
                      <strong>Red:</strong> If 2, 4, 6, 8 appears $\to$ 2X payout. If 0 appears $\to$ 1.5X payout.
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#9c27b0] shrink-0 mt-0.5" />
                    <div>
                      <strong>Violet:</strong> If 0 or 5 appears $\to$ 4.5X mega multiplier!
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-slate-900 text-sm">2. Number Predictions (0-9):</h4>
                <p className="pl-2">
                  If the winning number matches your exact choice, receive a huge <strong>9X payout</strong>.
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-slate-900 text-sm">3. Big & Small:</h4>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Big:</strong> Numbers 5, 6, 7, 8, 9 (2X payout)</li>
                  <li><strong>Small:</strong> Numbers 0, 1, 2, 3, 4 (2X payout)</li>
                </ul>
              </div>

              <div className="bg-emerald-50 p-3 rounded-2xl border border-emerald-200 text-emerald-950 space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Deposits, Withdrawals &amp; Bonuses:</span>
                </div>
                <p>
                  • Rs 10 Sign-Up Bonus on new accounts.<br />
                  • Min deposit: Rs 50 (auto-credited with screenshot + TRX ID).<br />
                  • <strong>20% Deposit Bonus</strong> on Rs 500+ deposits (Rs 500 → +100, Rs 1,000 → +200).<br />
                  • <strong>7% Referral Commission</strong> on invited friends&apos; deposits.<br />
                  • Min withdrawal: Rs 500 (approved via Admin Panel).
                </p>
              </div>
            </>
          )}

          <button
            onClick={onClose}
            className={`w-full py-3 text-white font-bold rounded-xl shadow-md transition-colors cursor-pointer ${
              isBlue ? 'bg-blue-600 hover:bg-blue-700' : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {language === 'ur' ? 'سمجھ آگئی (Got it)' : 'Understood, Let\'s Play'}
          </button>
        </div>
      </div>
    </div>
  );
};
