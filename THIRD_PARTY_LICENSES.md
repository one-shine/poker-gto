# サードパーティ ライセンス表記 (THIRD-PARTY NOTICES)

本アプリ (ポーカーGTO学習アプリ) は以下の第三者ソフトウェア・フォントを利用しています。
配布物に同梱されるのは下記の **実行時 (runtime) 依存** のみで、いずれも寛容なライセンス
(MIT / ISC / SIL OFL) です。AGPL など配布に制約のあるライセンスは含みません。

> 自社所有の同梱データ (ソルバー解・手作りレンジ) のライセンスは [docs/DATA_LICENSE.md](docs/DATA_LICENSE.md)
> を参照 (`self-generated` / `original`)。本ファイルは**外部由来**コンポーネントのみを扱います。

---

## 1. 実行時 (runtime) 依存パッケージ

| パッケージ | バージョン | ライセンス | 著作権 |
|-----------|-----------|-----------|--------|
| react | 19.2.6 | MIT | © Meta Platforms, Inc. and affiliates |
| react-dom | 19.2.6 | MIT | © Meta Platforms, Inc. and affiliates |
| framer-motion | 12.38.0 | MIT | © 2018 Framer B.V. |
| zustand | 5.0.13 | MIT | © 2019 Paul Henschel |
| idb | 8.0.3 | ISC | © 2016 Jake Archibald |

> ビルド時のみ使用する開発依存 (vite / typescript / eslint / vitest / tailwindcss / sharp 等) は
> 配布物に同梱されないため本表には含めません (すべて MIT/ISC/Apache-2.0/BSD の寛容ライセンス)。
> 完全な依存ツリーの自動棚卸しは配布時に `license-checker` 等で生成し本ファイルへ追補できます。

---

## 2. MIT License

下記パッケージに適用されます: **react, react-dom** (© Meta Platforms, Inc. and affiliates) /
**framer-motion** (© 2018 Framer B.V.) / **zustand** (© 2019 Paul Henschel)。

```
MIT License

Copyright (c) Meta Platforms, Inc. and affiliates.
Copyright (c) 2018 Framer B.V.
Copyright (c) 2019 Paul Henschel

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 3. ISC License

下記パッケージに適用されます: **idb** (© 2016 Jake Archibald)。

```
ISC License

Copyright (c) 2016, Jake Archibald <jaffathecake@gmail.com>

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
```

---

## 4. フォント (SIL Open Font License 1.1)

UI フォントは以下を **`@fontsource` でセルフホスト同梱**(配布物に woff2 をバンドル・CDN 読込なし)しています。フォント自体の出所は Google Fonts で、いずれも **SIL Open Font
License 1.1 (OFL-1.1)** で商用利用可です。

| フォント | ライセンス | 入手元 |
|---------|-----------|--------|
| Bricolage Grotesque | OFL-1.1 | Google Fonts |
| Hanken Grotesk | OFL-1.1 | Google Fonts |
| Zen Kaku Gothic New | OFL-1.1 | Google Fonts |
| JetBrains Mono | OFL-1.1 | Google Fonts |

- OFL-1.1 全文: <https://openfontlicense.org/> (各フォントの配布元 LICENSE も参照)。
- **セルフホスト済**(`@fontsource` 同梱)。各フォントの OFL ライセンスファイルを同梱し、Reserved Font
  Name を尊重する。Google Fonts CDN からの読込はなし=外部フォント送信なし (プライバシーは
  [docs/PRIVACY_POLICY.md](docs/PRIVACY_POLICY.md) を参照)。

---

*このファイルは公開・配布時に同梱すること。依存を追加・更新したら本表も更新する。*
