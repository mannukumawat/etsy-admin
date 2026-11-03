/** @type {import('tailwindcss').Config} */
// Central theme tokens for the admin panel. Palette mirrors the storefront brand
// (ivory / charcoal / burnt orange) but uses a sans-serif type scale for dense forms and tables.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ivory: {
          DEFAULT: '#FBF7F0',
          50: '#FDFBF7',
          100: '#FBF7F0',
          200: '#F4EDE2',
          300: '#EAE0D1',
        },
        sand: {
          100: '#F3ECE1',
          200: '#E7DDCF',
          300: '#D8CAB6',
          400: '#BFAE96',
        },
        ink: {
          DEFAULT: '#2B2724',
          soft: '#4A433D',
          muted: '#6B625A',
          faint: '#8C8279',
        },
        brand: {
          50: '#FDF4EE',
          100: '#FBE4D5',
          200: '#F5C6A8',
          300: '#EDA078',
          400: '#E2794A',
          500: '#D45F2A',
          600: '#C04A17',
          700: '#9F3C14',
          800: '#7F3217',
          900: '#682B16',
        },
        // Chart series (validated against white/ivory surfaces).
        chart: {
          1: '#C04A17',
          2: '#4C5A3D',
          3: '#3E5C8A',
          4: '#B08A2E',
          grid: '#E7DDCF',
        },
      },
      fontFamily: {
        sans: ['"Inter Variable"', '"Noto Sans Devanagari"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        brand: ['"Cormorant Garamond"', 'Georgia', 'serif'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      boxShadow: {
        card: '0 1px 2px rgba(43, 39, 36, 0.04), 0 1px 6px rgba(43, 39, 36, 0.04)',
        lift: '0 6px 24px rgba(43, 39, 36, 0.12)',
        drawer: '0 0 40px rgba(43, 39, 36, 0.18)',
      },
      maxWidth: {
        content: '84rem',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-in-right': { from: { transform: 'translateX(100%)' }, to: { transform: 'translateX(0)' } },
        'slide-in-left': { from: { transform: 'translateX(-100%)' }, to: { transform: 'translateX(0)' } },
        'pop-in': { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
        'slide-in-right': 'slide-in-right 200ms ease-out',
        'slide-in-left': 'slide-in-left 200ms ease-out',
        'pop-in': 'pop-in 160ms ease-out',
      },
    },
  },
  plugins: [],
};
