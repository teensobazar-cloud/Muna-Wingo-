import React, { useState } from 'react';
import { Download, X, MoreVertical, Share } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { soundManager } from '../utils/audio';

interface PWAInstallButtonProps {
  language: 'ur' | 'en';
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ language, compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    soundManager.playClick();
    if (isInstallable) {
      const accepted = await install();
      if (!accepted) {
        setShowGuide(true);
      }
    } else {
      setShowGuide(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleInstallClick}
        className={
          compact
            ? 'p-1.5 rounded-lg bg-amber-400/20 hover:bg-amber-400/30 border border-amber-300/40 text-amber-200 flex items-center gap-1 text-[11px] font-bold cursor-pointer transition-colors shrink-0'
            : 'min-h-[36px] px-3 py-1.5 rounded-xl bg-amber-400/20 hover:bg-amber-400/30 border border-amber-300/40 text-xs font-bold text-amber-100 flex items-center gap-1.5 cursor-pointer transition-colors shrink-0'
        }
        title={language === 'ur' ? 'ایپ انسٹال کریں (بغیر براؤزر بار کے چلائیں)' : 'Install Muna WinGo App'}
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        {!compact && (
          <span>{language === 'ur' ? 'ایپ انسٹال کریں' : 'Install App'}</span>
        )}
      </button>

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white text-slate-900 p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <img
                  src="/muna-logo-512.png"
                  alt="Muna WinGo"
                  className="w-10 h-10 rounded-full object-contain shadow-sm shrink-0"
                />
                <div>
                  <h3 className="font-black text-sm text-slate-900">
                    {language === 'ur' ? 'Muna WinGo ایپ انسٹال کریں' : 'Install Muna WinGo App'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {language === 'ur' ? 'براؤزر بار ہٹائیں اور فل اسکرین چلائیں' : 'Hide Chrome URL bar & open full screen'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOS ? (
              <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200 text-xs text-slate-700 space-y-2 leading-relaxed">
                <p className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Share className="w-4 h-4 text-blue-600" />
                  <span>{language === 'ur' ? 'آئی فون (Safari) کا طریقہ:' : 'Steps for iPhone (Safari):'}</span>
                </p>
                <p>
                  {language === 'ur'
                    ? '1. نیچے Safari کے Share بٹن پر ٹیپ کریں۔\n2. نیچے اسکرول کر کے "Add to Home Screen" منتخب کریں اور Add دبائیں۔'
                    : '1. Tap the Share button in Safari toolbar.\n2. Scroll down and tap "Add to Home Screen".'}
                </p>
              </div>
            ) : (
              <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200 text-xs text-slate-700 space-y-2 leading-relaxed whitespace-pre-line">
                <p className="font-bold text-slate-900 flex items-center gap-1.5">
                  <MoreVertical className="w-4 h-4 text-blue-600" />
                  <span>{language === 'ur' ? 'کروم (Android Chrome) کا طریقہ:' : 'Steps for Android Chrome:'}</span>
                </p>
                <p>
                  {language === 'ur'
                    ? '1. اوپر دائیں کونے میں کروم کے 3 نقطوں (⋮) پر کلک کریں۔\n2. "Add to Home screen" یا "Install app" پر کلک کریں۔\n3. ہوم اسکرین سے Muna WinGo ایپ کھولیں — اوپر والا لنک بار مکمل غائب ہو جائے گا!'
                    : '1. Tap the 3 dots (⋮) at top-right of Chrome.\n2. Tap "Add to Home screen" or "Install app".\n3. Open Muna WinGo from your home screen — the Chrome URL bar disappears completely!'}
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs cursor-pointer transition-colors"
            >
              {language === 'ur' ? 'سمجھ آ گیا' : 'Got It'}
            </button>
          </div>
        </div>
      )}
    </>
  );
};
