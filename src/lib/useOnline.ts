"use client";

import { useCallback, useEffect, useState } from "react";
import { getPendingCount, isOnline, processQueue } from "@/lib/offline";

export function useOnline() {
  const [online, setOnline] = useState(isOnline());
  const [syncing, setSyncing] = useState(false);
  const [pending, setPending] = useState(0);

  const refreshPending = useCallback(async () => {
    try {
      setPending(await getPendingCount());
    } catch (_err) {
      setPending(0);
    }
  }, []);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      void processQueue((processed, total) => {
        if (processed === total) {
          setSyncing(false);
          void refreshPending();
        } else {
          setSyncing(true);
        }
      }).then(() => {
        setSyncing(false);
        void refreshPending();
      });
    };
    const onOffline = () => setOnline(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    // Initial pending count
    void refreshPending();

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [refreshPending]);

  return { online, syncing, pending, refreshPending };
}
