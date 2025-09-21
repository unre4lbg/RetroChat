/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'win98-gray': '#C0C0C0',
        'win98-light-gray': '#DFDFDF',
        'win98-dark-gray': '#808080',
        'win98-blue': '#0A246A',
        'win98-light-blue': '#A6CAF0',
        'win98-desktop': '#008080',
        'icq-green': '#008000',
        'icq-blue': '#0000FF',
        'icq-orange': '#FF8000',
        'icq-msg-own': '#E6F3FF',
        'icq-msg-other': '#F0F8E6',
        'chat-message-bg': '#FFFEF7',
        'chat-bot-text': '#008000',
        'chat-moderator-text': '#0000FF',
        'chat-border': '#E0E0E0',
      },
      fontFamily: {
        'win98': ['Tahoma', 'MS Sans Serif', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
