import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

// The `build:singlefile` script (see package.json) feeds this build's output
// into scripts/build_singlefile.py, which concatenates every emitted JS/CSS
// file into one inline <script type="module"> tag so StepSheet.html runs
// with no server and no separate asset files.
//
// By default Vite/Rollup still emits a *separate chunk* for anything reached
// only via a dynamic `import()` (e.g. the exceljs-backed .xlsx/.xlsx export
// code in localEngine.ts) and makes the main chunk `import` it by its own
// filename (`import{...}from"./exceljs.min-XXXX.js"`). That's fine for the
// normal dev/server build, where that file really exists next to index.html
// — but once build_singlefile.py inlines both chunks' *text* into a single
// script tag, that cross-chunk `import` statement still tries to fetch
// "./exceljs.min-XXXX.js" as a real file next to StepSheet.html, which
// doesn't exist. The module fails to load, nothing ever mounts, and the app
// is a blank white page.
//
// `inlineDynamicImports` makes Rollup fold every dynamically-imported module
// into the single entry chunk instead, so there is nothing left to import by
// filename — the `import('exceljs')` call still works (and is still only
// evaluated the first time an .xlsx file is read/written), it just resolves
// from code that's already in the one bundle rather than fetching it.
const isSinglefileBuild = process.env.npm_lifecycle_event === 'build:singlefile'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: isSinglefileBuild
    ? {
        cssCodeSplit: false,
        rollupOptions: {
          output: {
            inlineDynamicImports: true,
          },
        },
      }
    : undefined,
})
