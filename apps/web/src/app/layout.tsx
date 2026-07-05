// Temporary root layout; replaced by the [locale] layout in feat/m0-i18n-shell.
import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
