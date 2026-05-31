/// <reference types="vite/client" />

// @fontsource-variable/* のバレル import は index.css に解決される副作用 import。
// vite/client の *.css 宣言は拡張子なしの bare specifier に当たらないため明示宣言する。
declare module '@fontsource-variable/hanken-grotesk'
declare module '@fontsource-variable/bricolage-grotesque'
declare module '@fontsource-variable/jetbrains-mono'

interface ImportMetaEnv {
  readonly VITE_SENTRY_DSN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
