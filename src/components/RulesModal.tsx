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
                <h4 className="font-bold text-slate-900 text-sm">1. رنگوں کے انعامات (92% Fair RTP):</h4>
                <div className="space-y-1.5 pl-2">
                  <div className="flex items-start gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#18b660] shrink-0 mt-0.5" />
                    <div>
                      <strong>سبز (Green):</strong> اگر 1, 3, 7, 9 آئے تو 1.95X ملے گی۔ اگر 5 آئے تو (1.40X) ملے گی۔
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#ea384c] shrink-0 mt-0.5" />
                    <div>
                      <strong>سرخ (Red):</strong> اگر 2, 4, 6, 8 آئے تو 1.95X ملے گی۔ اگر 0 آئے تو (1.40X) ملے گی۔
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#9c27b0] shrink-0 mt-0.5" />
                    <div>
                      <strong>جامنی (Violet):</strong> اگر 0 یا 5 آئے تو 4.6X بھاری انعام ملے گا!
                    </div>
                  </div>
                </div>
              </div>

              {/* Number Rules */}
              <div className="space-y-2">
                <h4 className="font-bold text-slate-900 text-sm">2. مخصوص نمبرز (Numbers 0-9):</h4>
                <p className="pl-2">
                  اگر آپ کسی بھی ایک نمبر (0 سے 9) پر بیٹ لگاتے ہیں اور وہی نمبر نکل آتا ہے تو آپ کو رقم کا <strong>9.2 گنا (9.2X)</strong> منافع ملتا ہے!
                </p>
              </div>

              {/* Big & Small Rules */}
              <div className="space-y-2">
                <h4 className="font-bold text-slate-900 text-sm">3. بڑا اور چھوٹا (Big & Small):</h4>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>بڑا (Big):</strong> نمبر 5, 6, 7, 8, 9 (منافع: 1.84X)</li>
                  <li><strong>چھوٹا (Small):</strong> نمبر 0, 1, 2, 3, 4 (منافع: 1.84X)</li>
                </ul>
              </div>

              {/* EasyPaisa & JazzCash rules */}
              <div className="bg-emerald-50 p-3 rounded-2xl border border-emerald-200 text-emerald-950 space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>ڈپازٹ، وڈرا اور فیئر SHA-256 اصول:</span>
                </div>
                <p>
                  • نیا اکاؤنٹ بنانے پر <strong>10 روپے</strong> سائن اپ بونس ملتا ہے۔<br />
                  • ہر راؤنڈ کا نتیجہ بیٹ بند ہونے سے پہلے SHA-256 ہیش میں محفوظ ہوتا ہے (92% Fair RTP)۔<br />
                  • <strong>500 یا اس سے زیادہ ڈپازٹ پر 20% بونس</strong> ملتا ہے۔<br />
                  • دوستوں کو انوائٹ کرنے پر ان کے سائن اپ پہ <strong>Rs 10 فوری بونس</strong> اور ڈپازٹ کا <strong>7% کمیشن</strong> ملتا ہے۔<br />
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
                <h4 className="font-bold text-sm mb-1">What is Muna WinGo? (92% Fair RTP)</h4>
                <p>
                  Each round draws a uniform provably-fair number (0–9) pre-committed as a SHA-256 hash before betting closes (average ~4–5 wins out of 10 color/Big-Small bets). Betting locks during the final 5 seconds.
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-slate-900 text-sm">1. Color Payout Rules (92% Fair RTP):</h4>
                <div className="space-y-1.5 pl-2">
                  <div className="flex items-start gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#18b660] shrink-0 mt-0.5" />
                    <div>
                      <strong>Green:</strong> If 1, 3, 7, 9 appears → <strong>1.95X</strong> payout. If 5 appears → <strong>1.40X</strong> payout.
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#ea384c] shrink-0 mt-0.5" />
                    <div>
                      <strong>Red:</strong> If 2, 4, 6, 8 appears → <strong>1.95X</strong> payout. If 0 appears → <strong>1.40X</strong> payout.
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#9c27b0] shrink-0 mt-0.5" />
                    <div>
                      <strong>Violet:</strong> If 0 or 5 appears → <strong>4.6X</strong> multiplier!
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-slate-900 text-sm">2. Number Predictions (0-9):</h4>
                <p className="pl-2">
                  If the winning number matches your exact choice, receive a huge <strong>9.2X payout</strong>.
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-slate-900 text-sm">3. Big & Small:</h4>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Big:</strong> Numbers 5, 6, 7, 8, 9 (<strong>1.84X payout</strong>)</li>
                  <li><strong>Small:</strong> Numbers 0, 1, 2, 3, 4 (<strong>1.84X payout</strong>)</li>
                </ul>
              </div>

              <div className="bg-emerald-50 p-3 rounded-2xl border border-emerald-200 text-emerald-950 space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Provably Fair SHA-256, Deposits &amp; Bonuses:</span>
                </div>
                <p>
                  • Every round outcome is pre-committed in SHA-256 before betting closes and revealed on settlement.<br />
                  • Rs 10 Sign-Up Bonus on new accounts.<br />
                  • Min deposit: Rs 50 • <strong>20% Bonus</strong> on Rs 500+ deposits.<br />
                  • <strong>Rs 10 Invite Bonus</strong> per friend signup + <strong>7% Referral Commission</strong> on friend deposits.<br />
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
