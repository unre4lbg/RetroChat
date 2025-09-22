/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'win98-gray': '#D4D0C8',
        'win98-light-gray': '#F0F0F0',
        'win98-dark-gray': '#808080',
        'win98-blue': '#0A246A',
        'win98-light-blue': '#A6CAF0',
        'win98-desktop': '#245EDC',
      },
      fontFamily: {
        'win98': ['Tahoma', 'MS Sans Serif', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
