/** @type {import('tailwindcss').Config} */
// Warna netral (white, slate, sky) dipetakan ke variabel CSS agar tema gelap mengikuti sistem
// tanpa menulis varian dark: di setiap kelas (lihat src/styles/index.css).
const v = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;
const scale = (prefix) =>
  Object.fromEntries(['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'].map((k) => [k, v(`${prefix}-${k}`)]));

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        white: v('white'),
        slate: scale('slate'),
        sky: scale('sky'),
        // Warna permukaan ala Google Drive
        surface: v('surface'),
        'surface-hover': v('surface-hover'),
        selected: v('selected'),
        toolbar: v('toolbar'),
        // Selalu gelap / selalu putih (toast, header panel upload, teks di atas tombol berwarna)
        ink: '#0f172a',
        'on-accent': '#ffffff'
      }
    }
  },
  plugins: []
};
