/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#0f2340', mid: '#1a3a6b', light: '#e8edf4' },
        gold: { DEFAULT: '#b08d4a', light: '#e8d9b5', dark: '#7a5f28', accent: '#c4a55a' },
        ink:  { DEFAULT: '#0d1117', muted: '#4a5568', faint: '#9ca3af' },
        surface: { DEFAULT: '#f7f6f2', alt: '#edecea', card: '#ffffff' },
        primary: {
          50:'#e8edf4', 100:'#c8d4e5', 200:'#a0b4d1', 300:'#6e8fb8',
          400:'#4a72a3', 500:'#1a3a6b', 600:'#0f2340', 700:'#0b1c33',
          800:'#071426', 900:'#040d19',
        },
      },
      fontFamily: {
        sans:  ['"DM Sans"', 'system-ui', 'sans-serif'],
        serif: ['"DM Serif Display"', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};
