/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        /* Action + brand energy. Remapped from the old orange ramp so every
           existing `primary-*` usage re-skins to deep vermilion at once. */
        primary: {
          50: '#FFF4EF',
          100: '#FFE4D8',
          200: '#FCC4AF',
          300: '#F59C7C',
          400: '#EC7049',
          500: '#DF4C21',
          600: '#C33A14',
          700: '#9E2C10',
          800: '#7A2410',
          900: '#5F1F11',
          950: '#360F07',
        },
        /* Antique gold. Ornament and emphasis only — never a large field.
           accent-500 is ~3.2:1 on white: large text or decoration only.
           Use accent-600 or darker for small text on light surfaces. */
        accent: {
          50: '#FCF8EE',
          100: '#F7EDD5',
          200: '#EFDBAB',
          300: '#E2C177',
          400: '#D2A64F',
          500: '#BE8C36',
          600: '#9E7029',
          700: '#7C5622',
          800: '#634522',
          900: '#523A20',
        },
        /* Structural brand colour — headers, footers, deep surfaces. */
        maroon: {
          50: '#FDF3F3',
          100: '#FAE4E3',
          200: '#F3C8C6',
          300: '#E5A09D',
          400: '#D06F6B',
          500: '#B4453F',
          600: '#94251F',
          700: '#761713',
          800: '#571010',
          900: '#3A0B0C',
          950: '#220506',
        },
        saffron: {
          50: '#FFF9EC',
          100: '#FFF0CE',
          200: '#FFDE98',
          300: '#FCC65B',
          400: '#F7AE2C',
          500: '#EC9111',
          600: '#CE6C0B',
          700: '#A44C0D',
          800: '#853C12',
          900: '#6E3212',
        },
        /* Crimson — alerts, discounts, destructive actions. */
        vermilion: {
          50: '#FEF2F2',
          100: '#FDE3E3',
          200: '#FBCBCB',
          300: '#F7A6A6',
          400: '#EF7373',
          500: '#E14848',
          600: '#CB2A2A',
          700: '#AA1F1F',
          800: '#8C1E1E',
          900: '#751E1E',
        },
        /* Warm paper surfaces. */
        ivory: {
          50: '#FFFDF8',
          100: '#FDF9F0',
          200: '#F9F1E3',
          300: '#F2E6D2',
          400: '#E7D6BC',
          500: '#D8C2A2',
        },
        /* Warm charcoal — dark surfaces and body text. Never pure black. */
        ink: {
          50: '#F7F6F4',
          100: '#EDEAE6',
          200: '#D8D3CC',
          300: '#B5AEA4',
          400: '#8B8377',
          500: '#6B6459',
          600: '#544E45',
          700: '#433E37',
          800: '#2A2621',
          900: '#1A1714',
          950: '#100E0C',
        },
        /* Restrained emerald — success, verified, in-stock. */
        leaf: {
          50: '#F0F8F4',
          100: '#DBEEE3',
          200: '#BADCC9',
          300: '#8CC7A8',
          500: '#3E9A6B',
          600: '#2C7A53',
          700: '#245F42',
          800: '#1D4B35',
        },
        /* Legacy scale kept so pre-existing `dark-*` usages keep resolving. */
        dark: {
          50: '#F7F6F4',
          100: '#EDEAE6',
          200: '#D8D3CC',
          300: '#B5AEA4',
          400: '#8B8377',
          500: '#6B6459',
          600: '#544E45',
          700: '#433E37',
          800: '#2A2621',
          900: '#1A1714',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Playfair Display"', 'Georgia', 'Cambria', 'serif'],
      },
      borderRadius: {
        card: '18px',
        panel: '26px',
        hero: '34px',
      },
      boxShadow: {
        xs: '0 1px 2px rgba(58,11,12,0.06)',
        soft: '0 2px 8px rgba(58,11,12,0.07)',
        card: '0 8px 24px rgba(58,11,12,0.09)',
        lift: '0 18px 44px rgba(58,11,12,0.13)',
        deep: '0 32px 70px rgba(58,11,12,0.18)',
        ember: '0 10px 30px rgba(195,58,20,0.28)',
        gold: '0 8px 24px rgba(190,140,54,0.25)',
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'out-soft': 'cubic-bezier(0.22, 0.61, 0.36, 1)',
        'in-soft': 'cubic-bezier(0.55, 0.06, 0.68, 0.19)',
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      zIndex: {
        raised: '10',
        sticky: '20',
        nav: '30',
        overlay: '40',
        modal: '50',
        toast: '60',
      },
      maxWidth: {
        prose: '68ch',
      },
    },
  },
  plugins: [],
}
