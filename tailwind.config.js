/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#1d2126',
        panel: '#2a3038',
        panel2: '#333b45',
        line: '#3a424c',
        ink: '#e8e4da',
        muted: '#9aa3ad',
        accent: '#c9a86a',
        good: '#7fc98a',
        warn: '#e0b45f',
        bad: '#e07b6a',
      },
      fontFamily: {
        sans: ['"Segoe UI"', 'system-ui', '-apple-system', 'Roboto', 'sans-serif'],
      },
      spacing: {
        'safe-top': 'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
      },
    },
  },
  plugins: [],
};
