"use client";

import { useEffect, useState } from "react";
import { OfflineIndicator } from "@/components/OfflineIndicator";

/**
 * Registers the service worker and shows the offline indicator once it is
 * active. Lives in its own client component so the root layout can stay a
 * server component and keep exporting `metadata`.
 */
export function ServiceWorkerRegister() {
  const [swRegistered, setSwRegistered] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => setSwRegistered(true))
        .catch(() => {});
    }
  }, []);

  return swRegistered ? <OfflineIndicator /> : null;
}
