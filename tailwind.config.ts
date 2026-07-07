import type { Config } from 'tailwindcss'
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        teal:      { deep: '#13A3AC', DEFAULT: '#0EA3B4', ink: '#0B7880', soft: '#E3F4F6' },
        brandgreen: { DEFAULT: '#3CAE68', bright: '#60B830', soft: '#EAF8EF' },
        ink:   '#0F1729',
        muted: '#5B6472',
        line:  '#E6EAEF',
        surface: '#FFFFFF',
        canvas:  '#F6F8FA',
        semamber: { DEFAULT: '#B45309', bg: '#FEF3C7', border: '#FCE8B2' },
        semred:   { DEFAULT: '#B91C1C', bg: '#FEF2F2', border: '#FBD0D0' },
        seminfo:  { DEFAULT: '#1D4ED8', bg: '#EFF4FF', border: '#CBDBFF' },
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(90deg, #13A3AC, #3CAE68)',
      },
      borderRadius: {
        card: '14px',
        control: '10px',
      },
      fontFamily: {
        sans: ['var(--font-jakarta)', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        focus: '0 0 0 3px rgba(14,163,180,.30)',
      },
    },
  },
  plugins: [],
}
export default config
