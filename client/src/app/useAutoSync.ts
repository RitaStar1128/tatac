import { useEffect } from "react";

import { syncScheduler } from "@/domains/sync/syncScheduler";

export function useAutoSync(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) {
      syncScheduler.stop();
      return;
    }

    syncScheduler.start();
    return () => {
      syncScheduler.stop();
    };
  }, [enabled]);
}
