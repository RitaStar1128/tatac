import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

export function ReloadPrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log("SW Registered: " + r);
    },
    onRegisterError(error) {
      console.log("SW registration error", error);
    },
  });

  const close = () => {
    setNeedRefresh(false);
  };

  return (
    <div className="fixed bottom-0 right-0 p-4 z-50 w-full md:w-auto md:max-w-sm">
      {needRefresh && (
        <div
          className="bg-primary text-primary-foreground p-4 rounded-lg shadow-lg border border-border flex flex-col gap-3 animate-in slide-in-from-bottom-5 fade-in duration-300"
          role="alert"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h3 className="font-semibold text-sm mb-1">Update Available</h3>
              <p className="text-xs opacity-90">
                A new version of TATAC is available. Update now to get the latest features and fixes.
              </p>
            </div>
            <button
              onClick={close}
              className="text-primary-foreground/80 hover:text-primary-foreground transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex justify-end gap-2 mt-1">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => updateServiceWorker(true)}
              className="w-full sm:w-auto font-medium"
            >
              Update Now
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
