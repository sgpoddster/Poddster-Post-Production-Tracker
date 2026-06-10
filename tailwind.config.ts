import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Arial', 'Helvetica Neue', 'Helvetica', 'sans-serif'],
      },
      colors: {
        brand: {
          red:       '#ff003c',
          'red-dim': '#cc0030',
          // These four use CSS variables so they flip with the theme
          black:     'var(--page-bg)',
          surface:   'var(--surface)',
          'surface2':'var(--surface2)',
          dim:       'var(--color-dim)',
          white:     '#ffffff',
        },
        // Theme-aware neutral — switches between white (dark mode) and
        // near-black (light mode). Supports Tailwind's opacity modifier
        // syntax, e.g. text-th/60, border-th/25, bg-th/[0.04].
        th: 'rgb(var(--th-rgb) / <alpha-value>)',
      },
    },
  },
  plugins: [],
}

export default config
