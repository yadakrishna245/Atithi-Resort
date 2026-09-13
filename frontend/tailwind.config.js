/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          900: '#134e4a',
        },
      },
      fontFamily: {
        // Noto covers every Indian script we support; the system stack is the
        // fast fallback so text renders before webfonts arrive on 3G.
        sans: ['Inter', 'Noto Sans', 'Noto Sans Devanagari', 'Noto Sans Tamil', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glass: '0 8px 32px 0 rgba(15, 23, 42, 0.16)',
        'glass-lg': '0 20px 60px -12px rgba(15, 23, 42, 0.35)',
        glow: '0 0 0 1px rgba(255,255,255,0.08), 0 8px 40px rgba(13, 148, 136, 0.35)',
      },
      backdropBlur: {
        xs: '2px',
      },
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
};
