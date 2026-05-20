/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    fontFamily: {
      display: ['Helvetica Neue', 'Inter', 'Arial', 'system-ui', 'sans-serif'],
      body: ['Helvetica Neue', 'Inter', 'Arial', 'system-ui', 'sans-serif'],
    },
    extend: {
      colors: {
        brown: {
          100: '#000000',
          200: '#0A0A0A',
          300: '#1A1A1A',
          400: '#262626',
          500: '#3F3F3F',
          600: '#586366',
          700: '#FFFFFF',
          800: '#F8BBD0',
          900: '#F48FB1',
        },
        clay: {
          100: '#FFFFFF',
          300: '#94A3B8',
          500: '#3B82F6',
          700: '#2563EB',
          900: '#FFFFFF',
        },
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
};
