/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        serif: ['Playfair Display', 'Georgia', 'serif'],
      },
      colors: {
        bg: '#F5F1EB',
        card: '#E8E3D9',
        border: '#D5D0C6',
        mid: '#777777',
        ink: '#111111',
        'tag-green': '#C8DDD4',
        'tag-green-text': '#2D5C4A',
        'tag-blue': '#C8D4E8',
        'tag-blue-text': '#2D3F5C',
        'tag-rose': '#E8D4D0',
        'tag-rose-text': '#5C2D2D',
        'tag-amber': '#E8E0C8',
        'tag-amber-text': '#5C4A2D',
      },
      borderRadius: {
        card: '20px',
        btn: '20px',
        pill: '9999px',
      },
    },
  },
  plugins: [],
}