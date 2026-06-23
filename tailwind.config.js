/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ink:    '#0f1117',
        mist:   '#f4f6f9',
        slate:  '#64748b',
        brand:  '#4f46e5',
        emerge: '#10b981',
        warn:   '#f59e0b',
        danger: '#ef4444',
      },
    },
  },
  plugins: [],
}
