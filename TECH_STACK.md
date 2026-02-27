# 技術スタック — プラトー横断 Web システム v2

## 概要

「機械と詩のあいだ — 35のプラトー」のインタラクティブ読書体験システム。
プラトーネットワークの探索、ワードフィールドによるキーワード遷移、マルコフ連鎖による詩の自動生成を提供する。

## コア技術

| 技術            | バージョン | 用途                                       |
| --------------- | ---------- | ------------------------------------------ |
| **Vue 3**       | ^3.5       | Composition API ベースの UI フレームワーク |
| **TypeScript**  | ^5.7       | 型安全な開発                               |
| **Vite**        | ^6.1       | ビルドツール・HMR 開発サーバー             |
| **D3.js**       | ^7.9       | プラトーネットワークのフォースグラフ描画   |
| **kuromoji.js** | ^0.1       | 日本語形態素解析（ビルド時のみ）           |

## ビルドパイプライン

```
plateaus/*.md (35 Markdown files)
    │
    ├──→ node scripts/build-data.js
    │       │
    │       ├──→ src/data/plateaus.ts    (35 プラトーデータ)
    │       ├──→ src/data/keywords.ts    (300 キーワード)
    │       ├──→ src/data/markov.ts      (3,599 トークン遷移テーブル)
    │       └──→ src/data/tokenIndex.ts  (2,135 語の逆引きインデックス)
    │
    └──→ npx vite (dev) / vite build (prod)
            │
            └──→ dist/ (静的サイト, GitHub Pages デプロイ可能)
```

## プロジェクト構成

```
TuringMachine/
├── plateaus/              # ソースコンテンツ (35 Markdown, YAML frontmatter)
├── scripts/
│   └── build-data.js      # データ生成スクリプト (kuromoji + Markov)
├── src/
│   ├── main.ts            # エントリーポイント
│   ├── App.vue            # ルートコンポーネント (レイアウト + リサイズ)
│   ├── components/
│   │   ├── NetworkGraph.vue   # D3 フォースグラフ (プラトーネットワーク)
│   │   ├── TextPanel.vue      # テキスト表示 (§リンク + キーワード強調)
│   │   ├── WordField.vue      # ワードフィールド (タグクラウド + 詩生成)
│   │   ├── TrailBar.vue       # 読書軌跡バー
│   │   ├── SearchBox.vue      # 検索ボックス
│   │   ├── HoverPreview.vue   # ホバープレビュー (トランスクルージョン)
│   │   └── ClusterFilter.vue  # クラスタフィルター
│   ├── composables/
│   │   ├── usePlateaus.ts     # グローバル状態管理 (ナビゲーション + トレイル)
│   │   └── useMarkov.ts       # マルコフ連鎖テキスト生成
│   ├── data/                  # 自動生成データ (DO NOT EDIT)
│   │   ├── plateaus.ts
│   │   ├── keywords.ts
│   │   ├── markov.ts
│   │   └── tokenIndex.ts
│   ├── types/
│   │   └── plateau.ts         # TypeScript 型定義
│   └── styles/
│       └── main.css           # グローバルスタイル
├── package.json
├── tsconfig.json
├── vite.config.ts
└── TECH_STACK.md              # (このファイル)
```

## 主要機能

### 1. プラトーネットワーク

- D3 フォースグラフで 35 プラトーをノードとして配置
- §参照に基づくリンク描画（青紫線）、トレイルエッジ（オレンジ線）
- クラスタ別の色分け（7 クラスタ）
- ホバーでスニペットプレビュー

### 2. ワードフィールド (タグクラウド + 詩生成)

- 現在のプラトーから抽出した上位 40 キーワードをタグクラウド表示
- クリックでマルコフ連鎖による詩を自動生成（kuromoji 形態素解析ベース）
- 右クリックで関連プラトーパネル表示
- 生成詩の各トークンの確率バッジ表示
- ホバーでマルコフ分岐ツールチップ（代替候補の確率バー付き）
- クリックでトークンすり替え（連鎖的に次トークンの確率も更新）
- キーボード操作（↑↓Enter/Escape）
- ✏️ 編集モードで詩を手動書き換え
- 軌跡詩タブ（クリックしたキーワードが蓄積されて詩になる）

### 3. テキストパネル

- §参照リンク（クリックで遷移）
- キーワードマーカー強調（ワードフィールドからの遷移時）
- 前方・後方リンクのチップ表示

### 4. トレイル（読書軌跡）

- 訪問したプラトーを時系列で記録
- フッターにブレッドクラム表示

## データ生成の詳細

### build-data.js が行うこと

1. **YAML frontmatter パース** — plateaus/\*.md から id, title, cluster, linksTo 抽出
2. **キーワード抽出** — 【】マーカー + 漢字複合語 + 英語固有名詞
3. **バックリンク自動生成** — linksTo の逆引き
4. **マルコフ連鎖構築** (kuromoji)
   - 全テキストを文単位に分割
   - 各文を kuromoji で形態素解析
   - 内容語（名詞・動詞・形容詞・副詞）を保持、助詞は前の語に結合
   - ビグラム遷移テーブルを構築（トークン当たり上位 12 遷移を保持）
5. **トークンインデックス構築** (kuromoji)
   - 全プラトーの内容語を抽出
   - 語 → 出現プラトー ID のマッピングを生成
   - ストップワード・ひらがなのみの語を除外
   - 結果: 2,135 語がインデックスされる

## 開発コマンド

```bash
# 依存パッケージインストール
npm install

# データ生成 (plateaus/*.md → src/data/*.ts)
node scripts/build-data.js

# 開発サーバー起動
npm run dev

# プロダクションビルド
npm run build
```

## デプロイ

静的サイトとして `dist/` を GitHub Pages にデプロイ可能。
外部 API は一切使用しない（全処理がクライアントサイド）。
