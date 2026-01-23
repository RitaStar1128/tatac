import React, { createContext, useContext, useState, useEffect } from "react";

type Language = "ja" | "en";

interface Translations {
  [key: string]: {
    ja: string;
    en: string;
  };
}

const translations: Translations = {
  history: { ja: "履歴", en: "HISTORY" },
  noRecords: { ja: "記録がありません", en: "NO RECORDS" },
  delete: { ja: "削除しました", en: "Deleted" },
  saved: { ja: "保存しました", en: "Saved" },
  settings: { ja: "設定", en: "SETTINGS" },
  language: { ja: "言語", en: "LANGUAGE" },
  theme: { ja: "テーマ", en: "THEME" },
  light: { ja: "ライト", en: "Light" },
  dark: { ja: "ダーク", en: "Dark" },
  system: { ja: "システム", en: "System" },
  about: { ja: "TATACについて", en: "ABOUT TATAC" },
  aboutDesc: {
    ja: "TATACは、思考やタスク、感情の断片を「考える前に投げる」ための超短距離メモです。",
    en: "TATAC is an ultra-short-distance memo for dumping fragments of thoughts, tasks, or feelings before you overthink.",
  },
  aboutDescDetail: {
    ja: "開いた瞬間に書き始め、最短の操作で保存する設計です。整理や評価は後回しにして、まず頭の中を空にすることを目的にしています。",
    en: "Designed for immediate capture and fast saving. Clear your head first and organize later.",
  },
  aboutUsageTitle: { ja: "使い方", en: "HOW TO USE" },
  aboutPcBullet1: { ja: "Ctrl+Enterで改行", en: "Ctrl+Enter for new line" },
  aboutPcBullet2: { ja: "Enterを2回で保存", en: "Press Enter twice to save" },
  aboutPcBullet3: { ja: "履歴で編集・削除", en: "Edit or delete in History" },
  aboutPcBullet4: { ja: "記録は端末内のローカル保存のみ", en: "Saved locally in this browser only" },
  aboutMobileBullet1: { ja: "Enterで改行", en: "Enter for new line" },
  aboutMobileBullet2: { ja: "保存ボタンで保存", en: "Tap Save to store" },
  aboutMobileBullet3: { ja: "履歴で編集・削除", en: "Edit or delete in History" },
  aboutMobileBullet4: { ja: "記録は端末内のローカル保存のみ", en: "Saved locally in this browser only" },
  swipeToDelete: { ja: "スワイプして削除", en: "Swipe to delete" },
  undo: { ja: "元に戻す", en: "Undo" },
  pwaInstall: { ja: "アプリをインストール", en: "Install App" },
  pwaDesc: { ja: "ホーム画面に追加して、オフラインでも即座にアクセスできます。", en: "Add to home screen for instant offline access." },
  mobileQr: { ja: "モバイル用QR", en: "MOBILE QR" },
  mobileQrButton: { ja: "QRを表示", en: "Show QR" },
  save: { ja: "保存", en: "Save" },
  close: { ja: "閉じる", en: "Close" },
  exportData: { ja: "データエクスポート", en: "EXPORT DATA" },
  copy: { ja: "コピー", en: "COPY" },
  download: { ja: "ダウンロード", en: "DOWNLOAD" },
  copied: { ja: "コピーしました", en: "COPIED" },
  downloaded: { ja: "ダウンロードを開始しました", en: "DOWNLOAD STARTED" },
  showQr: { ja: "モバイル用QRを表示", en: "SHOW MOBILE QR" },
  newMemoPlaceholder: { ja: "新規メモ…", en: "New memo..." },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (key: string) => string;
  formatDate: (isoString: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    // Check localStorage first
    const storedLang = localStorage.getItem("tatac_language") as Language;
    if (storedLang) return storedLang;
    
    // Fallback to browser language
    if (typeof navigator !== 'undefined') {
      // Check navigator.languages first (preferred languages list)
      if (navigator.languages && navigator.languages.length > 0) {
        const hasJa = navigator.languages.some(lang => lang.toLowerCase().startsWith('ja'));
        return hasJa ? "ja" : "en";
      }
      // Fallback to navigator.language
      return navigator.language.toLowerCase().startsWith("ja") ? "ja" : "en";
    }
    
    return "en"; // Default to English if no browser info available
  });

  const updateLanguage = (lang: Language) => {
    setLanguage(lang);
    localStorage.setItem("tatac_language", lang);
  };

  const toggleLanguage = () => {
    const newLang = language === "ja" ? "en" : "ja";
    updateLanguage(newLang);
  };

  const t = (key: string) => {
    return translations[key]?.[language] || key;
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    if (language === "ja") {
      return new Intl.DateTimeFormat("ja-JP", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
    } else {
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
    }
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage: updateLanguage, toggleLanguage, t, formatDate }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
