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
          black:     '#0a0a0b',
          surface:   '#1e1e1f',
          'surface2':'#313132',
          dim:       '#535365',
          white:     '#ffffff',
        },
      },
    },
  },
  plugins: [],
}

export default config
