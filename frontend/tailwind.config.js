/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#dbe7ff',
          500: '#2f6fed',
          600: '#1f5bd6',
          700: '#1a4bb4'
        },
        navy: {
          50: '#eef4fb',
          100: '#dbe8f7',
          200: '#b9d0ee',
          300: '#8aafe0',
          400: '#5583cd',
          500: '#2f63b6',
          600: '#1d4c9b',
          700: '#143b82',
          800: '#0f2d63',
          900: '#0a1f47',
          950: '#06132e'
        }
      }
    }
  },
  plugins: []
};
