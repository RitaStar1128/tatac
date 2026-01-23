# TATAC 開発タスク

## 削除対象
- [ ] `client/src/contexts/CurrencyContext.tsx` (通貨機能は不要)
- [ ] `client/src/components/ExportModal.tsx` (エクスポート機能は仕様外)
- [ ] `client/src/components/HelpModal.tsx` (TATAC用に作り変えるため一旦削除または大幅改修)
- [ ] `client/src/components/SettingsModal.tsx` (TATAC用に作り変えるため一旦削除または大幅改修)

## 修正対象
- [ ] `client/src/pages/Home.tsx`
    - [ ] テンキーUIの削除
    - [ ] 金額入力ロジックの削除
    - [ ] カテゴリ選択の削除
    - [ ] フルスクリーンテキストエリアの実装
    - [ ] 自動保存ロジックの実装
- [ ] `client/src/pages/History.tsx`
    - [ ] 金額表示の削除
    - [ ] テキスト本文の表示
    - [ ] エクスポート機能の削除
- [ ] `client/src/contexts/LanguageContext.tsx`
    - [ ] TATAC用の文言に更新

## 新規作成
- [ ] `client/src/components/DescriptionModal.tsx` (仕様書に基づく説明モーダル)
- [ ] `client/src/components/SettingsModal.tsx` (言語・テーマ切り替えのみ)
