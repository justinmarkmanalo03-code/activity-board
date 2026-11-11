"use client";

import type { Metadata } from "next";
import { useEffect, useState } from "react";
import "./globals.css";
import { OfflineIndicator } from "@/components/OfflineIndicator";

export const metadata: Metadata = {
  title: {
    default: "Activity Board",
    template: "%s - Activity Board",
  },
  description: "A Trello-style team monitoring board.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [swRegistered, setSwRegistered] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => setSwRegistered(true))
        .catch(() => {});
    }
  }, []);

  return (
    <html lang="en">
      <body>
        {swRegistered && <OfflineIndicator />}
        {children}
      </body>
    </html>
  );
}
