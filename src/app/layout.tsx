import type { Metadata } from "next";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { DeadlineNotifications } from "@/components/DeadlineNotifications";

export const metadata: Metadata = {
  title: {
    default: "Activity Board",
    template: "%s - Activity Board",
  },
  description: "A Trello-style team monitoring board.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ServiceWorkerRegister />
        <DeadlineNotifications />
        {children}
      </body>
    </html>
  );
}
