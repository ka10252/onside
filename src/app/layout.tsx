import type { Metadata } from "next";
import { Instrument_Sans, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { StaleBar } from "@/components/StaleBar";

const serif = Instrument_Serif({ variable: "--font-serif", subsets: ["latin"], weight: "400" });
const sans = Instrument_Sans({ variable: "--font-sans", subsets: ["latin"], weight: ["400", "500", "600", "700"] });

// AI marking runs after a response is sent (next/server after()). 60 s is plenty for the batch
// call, and a page that goes wrong gives up quickly instead of hanging the browser for minutes.
export const maxDuration = 60;

export const metadata: Metadata = {
  title: "Onside",
  description: "Homework and review for IB Economics HL",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body>
        <StaleBar />
        <div className="app">{children}</div>
      </body>
    </html>
  );
}
