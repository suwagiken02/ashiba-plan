/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          bg: '#1a1a18',
          surface: '#2c2c2a',
          border: '#3d3d3a',
        },
        canvas: '#f5f4f0',
        accent: '#378ADD',
        success: '#4caf50',
        warning: '#ff9800',
        building: '#3d3d3a',
        handrail: '#185FA5',
        post: '#2c2c2a',
        'anti-400': '#F59E0B',
        'anti-250': '#FCD34D',
        dimension: '#888780',
        obstacle: {
          ecocute: '#B5D4F4',
          aircon: '#C0DD97',
          baywindow: '#FAC775',
          carport: '#CECBF6',
          sunroom: '#F5C4B3',
          custom: '#D3D1C7',
        },
      },
    },
  },
  plugins: [],
};
