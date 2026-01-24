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
  languageJa: { ja: "日本語", en: "Japanese" },
  languageEn: { ja: "英語", en: "English" },
  theme: { ja: "テーマ", en: "THEME" },
  light: { ja: "ライト", en: "Light" },
  dark: { ja: "ダーク", en: "Dark" },
  system: { ja: "システム", en: "System" },
  about: { ja: "TATACについて", en: "ABOUT TATAC" },
  aboutPhilosophyTitle: { ja: "思想", en: "PHILOSOPHY" },
  aboutDesc: {
    ja: "TATACは、思考やタスク、感情の断片を「考える前に投げる」ための超短距離メモです。",
    en: "TATAC is an ultra-short-distance memo for dumping fragments of thoughts, tasks, or feelings before you overthink.",
  },
  aboutDescDetail: {
    ja: "開いた瞬間に書き始め、最短の操作で保存する設計です。整理や評価は後回しにして、まず頭の中を空にすることを目的にしています。",
    en: "Designed for immediate capture and fast saving. Clear your head first and organize later.",
  },
  aboutUsageTitle: { ja: "使い方", en: "HOW TO USE" },
  aboutPcBullet1: { ja: "Enterで改行", en: "Ctrl+Enter for new line" },
  aboutPcBullet2: { ja: "Ctrl+Enterで保存", en: "Press Enter twice to save" },
  aboutPcBullet3: { ja: "履歴で編集・削除", en: "Edit or delete in History" },
  aboutPcBullet4: { ja: "記録は端末内のローカル保存のみ", en: "Saved locally in this browser only" },
  aboutMobileBullet1: { ja: "Enterで改行", en: "Enter for new line" },
  aboutMobileBullet2: { ja: "保存ボタンで保存", en: "Tap Save to store" },
  aboutMobileBullet3: { ja: "履歴で編集・削除", en: "Edit or delete in History" },
  aboutMobileBullet4: { ja: "記録は端末内のローカル保存のみ", en: "Saved locally in this browser only" },
  edited: { ja: "編集済み", en: "Edited" },
  searchPlaceholder: { ja: "メモを検索…", en: "Search memos..." },
  noMatchingMemos: { ja: "一致するメモが見つかりません", en: "No matching memos found" },
  swipeToDelete: { ja: "スワイプして削除", en: "Swipe to delete" },
  undo: { ja: "元に戻す", en: "Undo" },
  copyFailed: { ja: "コピーに失敗しました", en: "Failed to copy" },
  pwaInstall: { ja: "アプリをインストール", en: "Install App" },
  pwaDesc: { ja: "ホーム画面に追加して、オフラインでも即座にアクセスできます。", en: "Add to home screen for instant offline access." },
  pwaMobileRecommendedTitle: { ja: "スマホでの利用を推奨", en: "Mobile Recommended" },
  pwaMobileRecommendedBody: {
    ja: "このアプリはスマートフォンでの利用に最適化されています。以下のQRコードを読み取ってアクセスしてください。",
    en: "This app is optimized for mobile use. Scan the QR code below to access on your phone.",
  },
  pwaAddToHomeTitle: { ja: "ホーム画面への追加", en: "Add to Home" },
  pwaHowToButton: { ja: "追加方法", en: "How to" },
  pwaTabIos: { ja: "iPhone (iOS)", en: "iPhone (iOS)" },
  pwaTabAndroid: { ja: "Android", en: "Android" },
  pwaIosStep1: { ja: "Safariでこのページを開きます。", en: "Open this page in Safari." },
  pwaIosStep2: { ja: "画面下部の「共有」ボタンをタップします。", en: "Tap the \"Share\" button at the bottom." },
  pwaIosStep3: { ja: "メニューをスクロールして「ホーム画面に追加」を選択します。", en: "Scroll down and select \"Add to Home Screen\"." },
  pwaIosStep4: { ja: "右上の「追加」をタップして完了です。", en: "Tap \"Add\" in the top right corner." },
  pwaAndroidStep1: { ja: "Chromeでこのページを開きます。", en: "Open this page in Chrome." },
  pwaAndroidStep2: { ja: "右上のメニューアイコン（︙）をタップします。", en: "Tap the menu icon (︙) in the top right." },
  pwaAndroidStep3: { ja: "「ホーム画面に追加」または「アプリをインストール」を選択します。", en: "Select \"Add to Home screen\" or \"Install app\"." },
  pwaAndroidStep4: { ja: "確認画面で「追加」をタップして完了です。", en: "Tap \"Add\" to confirm." },
  mobileQr: { ja: "モバイル用QR", en: "MOBILE QR" },
  mobileQrButton: { ja: "QRを表示", en: "Show QR" },
  save: { ja: "保存", en: "Save" },
  close: { ja: "閉じる", en: "Close" },
  exportData: { ja: "データエクスポート", en: "EXPORT DATA" },
  jsonLabel: { ja: "JSON", en: "JSON" },
  markdownLabel: { ja: "Markdown", en: "Markdown" },
  copy: { ja: "コピー", en: "COPY" },
  download: { ja: "ダウンロード", en: "DOWNLOAD" },
  copied: { ja: "コピーしました", en: "COPIED" },
  downloaded: { ja: "ダウンロードを開始しました", en: "DOWNLOAD STARTED" },
  showQr: { ja: "モバイル用QRを表示", en: "SHOW MOBILE QR" },
  newMemoPlaceholder: { ja: "新規メモ…", en: "New memo..." },
  editMode: { ja: "編集モード", en: "EDIT MODE" },
  notFoundTitle: { ja: "ページが見つかりません", en: "Page Not Found" },
  notFoundMessage1: { ja: "お探しのページは存在しません。", en: "Sorry, the page you are looking for doesn't exist." },
  notFoundMessage2: { ja: "移動または削除された可能性があります。", en: "It may have been moved or deleted." },
  goHome: { ja: "ホームへ", en: "Go Home" },
  errorUnexpected: { ja: "予期しないエラーが発生しました。", en: "An unexpected error occurred." },
  reloadPage: { ja: "ページを再読み込み", en: "Reload Page" },
  helpTitle: { ja: "サクキロについて", en: "ABOUT SAKUKIRO" },
  helpPhilosophyTitle: { ja: "アプリの思想", en: "PHILOSOPHY" },
  helpPhilosophyLead: {
    ja: "「サクキロ」は、その名の通り「サクッと支出記録」することを極限まで追求したアプリです。",
    en: "\"SAKUKIRO\" is designed for one purpose: to track expenses with lightning speed.",
  },
  helpPhilosophyBody: {
    ja: "アプリを開いた瞬間に記録が完了する体験を提供することで、「記録忘れ」という最大の課題を解決します。複雑な分析機能よりも、日々の入力の速さと心地よさを最優先に設計されています。",
    en: "By enabling instant recording the moment you open the app, we solve the biggest problem: forgetting to track. We prioritize speed and comfort over complex analytics.",
  },
  helpHowToTitle: { ja: "使い方", en: "HOW TO USE" },
  helpStep1Title: { ja: "金額を入力", en: "Enter Amount" },
  helpStep1Desc: { ja: "アプリを開いたらすぐにテンキーで金額を入力します。", en: "Type the amount immediately using the keypad." },
  helpStep2Title: { ja: "カテゴリを選択（任意）", en: "Select Category (Optional)" },
  helpStep2Desc: { ja: "必要であればカテゴリを選びます。デフォルトのままでもOK。", en: "Choose a category if needed. Default is fine too." },
  helpStep3Title: { ja: "確定ボタンをタップ", en: "Tap Confirm" },
  helpStep3Desc: { ja: "これだけで記録完了。すぐに次の入力ができます。", en: "Done. You are ready for the next entry instantly." },
  helpPrivacyTitle: { ja: "データについて", en: "DATA PRIVACY" },
  helpPrivacyBody: {
    ja: "入力されたデータは、お使いのブラウザ内にのみ保存されます。外部サーバーに送信されることはありません。",
    en: "Your data is stored only within your browser. It is never sent to external servers.",
  },
  manusLoginDescription: { ja: "続行するにはManusでログインしてください。", en: "Please login with Manus to continue." },
  manusLoginButton: { ja: "MANUSでログイン", en: "LOGIN WITH MANUS" },
  breadcrumbMore: { ja: "さらに表示", en: "More" },
  ariaBreadcrumb: { ja: "パンくずリスト", en: "Breadcrumb" },
  ariaPagination: { ja: "ページネーション", en: "Pagination" },
  carouselPrevious: { ja: "前のスライド", en: "Previous slide" },
  carouselNext: { ja: "次のスライド", en: "Next slide" },
  paginationPrevious: { ja: "前へ", en: "Previous" },
  paginationNext: { ja: "次へ", en: "Next" },
  paginationMore: { ja: "さらにページ", en: "More pages" },
  paginationPrevLabel: { ja: "前のページへ", en: "Go to previous page" },
  paginationNextLabel: { ja: "次のページへ", en: "Go to next page" },
  sidebarTitle: { ja: "サイドバー", en: "Sidebar" },
  sidebarDescription: { ja: "モバイルサイドバーを表示します。", en: "Displays the mobile sidebar." },
  sidebarToggle: { ja: "サイドバーを切り替え", en: "Toggle Sidebar" },
  loading: { ja: "読み込み中", en: "Loading" },
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
