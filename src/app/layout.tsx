import type { Metadata } from "next";
import { Instrument_Sans, Instrument_Serif } from "next/font/google";
import "./globals.css";

const serif = Instrument_Serif({ variable: "--font-serif", subsets: ["latin"], weight: "400" });
const sans = Instrument_Sans({ variable: "--font-sans", subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: "Onside",
  description: "Homework and review for IB Economics HL",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body>
        <div className="app">{children}</div>
      </body>
    </html>
  );
}
