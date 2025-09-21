/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Windows XP Luna Theme Colors
        'xp-blue': '#245EDC',
        'xp-light-blue': '#4B8EF1',
        'xp-lighter-blue': '#6BA3F5',
        'xp-panel': '#ECE9D8',
        'xp-border': '#ACA899',
        'xp-button-face': '#ECE9D8',
        'xp-button-shadow': '#D6D3CE',
        'xp-button-highlight': '#FFFFFF',
        'xp-green': '#73B574',
        'xp-dark-green': '#4E8B4F',
        'xp-orange': '#FF8000',
        'xp-msg-own': '#E6F3FF',
        'xp-msg-other': '#F0F8E6',
        'xp-msg-system': '#FFF8E6',
        'xp-online': '#008000',
        'xp-away': '#FF8000',
        'xp-offline': '#808080',
      },
      fontFamily: {
        'xp': ['Tahoma', 'Segoe UI', 'Arial', 'sans-serif'],
      },
      borderRadius: {
        'xp': '3px',
        'xp-window': '8px',
        'xp-tab': '6px',
      },
      boxShadow: {
        'xp': '2px 2px 8px rgba(0, 0, 0, 0.3)',
        'xp-light': '1px 1px 4px rgba(0, 0, 0, 0.2)',
      },
    },
  },
  plugins: [],
};
