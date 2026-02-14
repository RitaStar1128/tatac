# TATAC

Reflex Input Memo App for instant thought capture.

Live: https://tatac.vercel.app/

[English](#english) | [日本語](#日本語)

---

## English

### What is TATAC?
TATAC is a lightweight memo app for capturing thoughts quickly.
It focuses on low-friction input and local-first storage.

### Live Demo
https://tatac.vercel.app/

### Features
- Fast memo input on the home screen
- History with search, edit, and delete
- Export as JSON or Markdown
- PWA support (install + update prompt)
- Bilingual UI (English / Japanese)
- Theme switching (Light / Dark / System)

### Tech Stack
- React 19 + TypeScript + Vite
- Tailwind CSS 4 + Radix UI + shadcn/ui-style components
- Framer Motion
- vite-plugin-pwa + Workbox
- wouter
- Express (production static serving)

### Quick Start
Requirements:
- Node.js 20+
- pnpm

```bash
pnpm install
pnpm dev
```

App runs at: `http://localhost:3000`

### Scripts
- `pnpm dev` - start development server
- `pnpm build` - build frontend and server bundle
- `pnpm start` - start production server
- `pnpm preview` - preview built app
- `pnpm check` - run TypeScript checks
- `pnpm format` - format with Prettier

### Production Run Notes
- Default port: `3000` (override with `PORT`)
- `pnpm start` uses Unix-style env assignment. On Windows PowerShell, use:

```powershell
$env:NODE_ENV="production"
node dist/index.js
```

### Data & Privacy
- Memos are stored in browser `localStorage`.
- No cloud sync is implemented.
- Clearing browser data removes saved memos.

### Project Structure
- `client/` - frontend app
- `server/` - Express server for production
- `shared/` - shared constants

### License
MIT (see `package.json`).

---

## 日本語

### 概要
TATACは、思考を素早く記録するためのメモアプリです。
メモはブラウザの `localStorage` に保存されます。

### 公開URL
https://tatac.vercel.app/

### 主な機能
- 高速入力
- 履歴の検索・編集・削除
- JSON / Markdown エクスポート
- PWA対応
- 日本語 / English UI
- Light / Dark / System テーマ

### セットアップ
前提:
- Node.js 20以上
- pnpm

```bash
pnpm install
pnpm dev
```

起動先: `http://localhost:3000`

### スクリプト
- `pnpm dev` - 開発サーバー起動
- `pnpm build` - ビルド
- `pnpm start` - 本番サーバー起動
- `pnpm preview` - プレビュー
- `pnpm check` - TypeScript型チェック
- `pnpm format` - Prettier整形

### 本番実行メモ
- 既定ポートは `3000` （`PORT` で変更可）
- Windows PowerShellでは次を使用:

```powershell
$env:NODE_ENV="production"
node dist/index.js
```

### データとプライバシー
- メモはブラウザ内のみに保存されます。
- クラウド同期はありません。
- ブラウザデータ削除でメモも削除されます。

### ディレクトリ構成
- `client/` - フロントエンド
- `server/` - Expressサーバー
- `shared/` - 共有定数

### ライセンス
MIT（`package.json` 参照）.
