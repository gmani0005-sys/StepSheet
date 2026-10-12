/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ['Aptos', 'Calibri', 'Carlito', '"Segoe UI"', 'Arial', 'sans-serif'],
        mono: ['Consolas', '"Cascadia Mono"', '"JetBrains Mono"', 'monospace'],
      },
      colors: {
        excel: {
          accent: 'var(--accent)',
          hover: 'var(--accent-hover)',
          soft: 'var(--accent-soft)',
          surface: 'var(--surface)',
          chrome: 'var(--chrome)',
          border: 'var(--chrome-border)',
          grid: 'var(--grid-line)',
          headerBg: 'var(--header-bg)',
          headerText: 'var(--header-text)',
          text: 'var(--text)',
          muted: 'var(--text-muted)',
          error: 'var(--error)',
          warn: 'var(--warn)',
          ok: 'var(--ok)',
        },
        brand: {
          50: '#E6F2EB',
          100: '#cce5d6',
          200: '#99cbad',
          500: '#217346',
          600: '#217346',
          700: '#185C37',
          800: '#124629',
        },
      },
    },
  },
  plugins: [],
}
