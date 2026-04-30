import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, LoaderCircle, Smartphone, TriangleAlert } from "lucide-react";
import { useLocation } from "wouter";

import { Button } from "@/components/ui/button";
import {
  completePairingJoin,
  isPairingJoinBlockedError,
  preparePairingJoinFromLink,
  type PreparedPairingJoin,
  type PairingConsumeResult,
} from "@/domains/sync/syncPairing";
import { decodeBase64Url } from "@shared/lib/base64url";

type PairingState =
  | { status: "loading"; resetting: boolean }
  | { status: "success"; sourceDeviceName: string; applied: number; pulled: number }
  | {
      status: "blocked";
      summary: {
        noteCount: number;
        opCount: number;
      };
      sourceDeviceName: string;
    }
  | {
      status: "error";
      reason: "already-used" | "expired" | "node-unreachable" | "invalid" | "unknown";
      message: string;
    };

const textDecoder = new TextDecoder();

function parsePairingUrl(): { sessionId: string; syncNodeUrl: string; pairingKey: string } {
  const currentUrl = new URL(window.location.href);
  const sessionId = currentUrl.searchParams.get("sid")?.trim();
  const encodedNodeUrl = currentUrl.searchParams.get("node")?.trim();
  const fragment = currentUrl.hash.startsWith("#") ? currentUrl.hash.slice(1) : currentUrl.hash;
  const fragmentParams = new URLSearchParams(fragment);
  const pairingKey = fragmentParams.get("k")?.trim();

  if (!sessionId || !encodedNodeUrl || !pairingKey) {
    throw new Error("This QR code is incomplete.");
  }

  const syncNodeUrl = textDecoder.decode(decodeBase64Url(encodedNodeUrl));
  return {
    sessionId,
    syncNodeUrl,
    pairingKey,
  };
}

function toFriendlyError(error: unknown): Extract<PairingState, { status: "error" }> {
  const message = error instanceof Error ? error.message : "Unable to complete sync setup.";
  if (message.includes("already been used")) {
    return {
      status: "error",
      reason: "already-used",
      message: "This QR code has already been used. Generate a new one on the PC.",
    };
  }
  if (message.includes("expired")) {
    return {
      status: "error",
      reason: "expired",
      message: "This QR code has expired. Generate a new one on the PC.",
    };
  }
  if (message.includes("Failed to fetch")) {
    return {
      status: "error",
      reason: "node-unreachable",
      message: "The phone could not reach the sync node. Make sure both devices are on the same Wi-Fi.",
    };
  }
  if (message.includes("invalid") || message.includes("incomplete")) {
    return {
      status: "error",
      reason: "invalid",
      message: "This QR code is not valid for TATAC sync setup.",
    };
  }
  return {
    status: "error",
    reason: "unknown",
    message,
  };
}

function toSuccessState(result: PairingConsumeResult): Extract<PairingState, { status: "success" }> {
  return {
    status: "success",
    sourceDeviceName: result.sourceDeviceName,
    applied: result.syncResult.applied,
    pulled: result.syncResult.pulled,
  };
}

export default function SyncPairPage() {
  const [, setLocation] = useLocation();
  const [state, setState] = useState<PairingState>({ status: "loading", resetting: false });
  const [preparedJoin, setPreparedJoin] = useState<PreparedPairingJoin | null>(null);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const redirectDelayMs = 2_000;
  const actionLabel = useMemo(
    () => (state.status === "success" ? "Open history" : "Back"),
    [state.status],
  );

  useEffect(() => {
    let cancelled = false;

    const startPairing = async () => {
      try {
        const params = parsePairingUrl();
        const prepared = await preparePairingJoinFromLink(params);
        if (cancelled) return;

        setPreparedJoin(prepared);

        try {
          const result = await completePairingJoin(prepared);
          if (cancelled) return;

          setState(toSuccessState(result));
          redirectTimerRef.current = setTimeout(() => {
            setLocation("/history");
          }, redirectDelayMs);
        } catch (error) {
          if (cancelled) return;
          if (isPairingJoinBlockedError(error)) {
            setState({
              status: "blocked",
              summary: {
                noteCount: error.summary.noteCount,
                opCount: error.summary.opCount,
              },
              sourceDeviceName: prepared.payload.sourceDeviceName,
            });
            return;
          }

          setState(toFriendlyError(error));
        }
      } catch (error) {
        if (cancelled) return;
        setState(toFriendlyError(error));
      }
    };

    void startPairing();

    return () => {
      cancelled = true;
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
    };
  }, [setLocation]);

  const handleResetAndJoin = async () => {
    if (!preparedJoin) {
      return;
    }

    setState({ status: "loading", resetting: true });

    try {
      const result = await completePairingJoin(preparedJoin, {
        allowDestructiveReset: true,
      });
      setState(toSuccessState(result));
      redirectTimerRef.current = setTimeout(() => {
        setLocation("/history");
      }, redirectDelayMs);
    } catch (error) {
      setState(toFriendlyError(error));
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <div className="w-full max-w-md border-2 border-foreground bg-card p-8">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center border-2 border-foreground bg-foreground text-background">
            <Smartphone className="h-5 w-5" />
          </span>
          <div>
            <div className="text-xs font-black uppercase tracking-[0.3em] text-muted-foreground">
              TATAC Sync
            </div>
            <h1 className="text-2xl font-black uppercase tracking-tight">Phone Pairing</h1>
          </div>
        </div>

        {state.status === "loading" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <LoaderCircle className="h-5 w-5 animate-spin" />
              <p className="text-sm">
                {state.resetting
                  ? "Clearing local notes and finishing sync setup..."
                  : "Completing sync setup and pulling notes..."}
              </p>
            </div>
          </div>
        )}

        {state.status === "success" && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 border border-border bg-muted/20 px-4 py-4">
              <CheckCircle2 className="mt-0.5 h-5 w-5" />
              <div className="text-sm">
                <p>Sync settings were copied from {state.sourceDeviceName}.</p>
                <p className="mt-1 text-muted-foreground">
                  Received {state.pulled} changes and applied {state.applied}.
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Redirecting to history...</p>
          </div>
        )}

        {state.status === "blocked" && (
          <div className="space-y-4">
            <div
              data-testid="pairing-error"
              data-pairing-error="non-empty-device"
              className="flex items-start gap-3 border border-destructive/40 bg-destructive/5 px-4 py-4"
            >
              <TriangleAlert className="mt-0.5 h-5 w-5 text-destructive" />
              <div className="space-y-2 text-sm">
                <p>This device already has local notes.</p>
                <p className="text-muted-foreground">
                  Joining {state.sourceDeviceName} would require replacing {state.summary.noteCount} notes
                  and {state.summary.opCount} local changes on this device.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                onClick={() => {
                  void handleResetAndJoin();
                }}
                className="rounded-none border-2 border-foreground bg-foreground font-bold uppercase tracking-[0.18em] text-background hover:bg-foreground/90"
              >
                Reset Local Data And Join
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setLocation("/sync-settings")}
                className="rounded-none border-2 border-foreground font-bold uppercase tracking-[0.18em]"
              >
                Keep Local Notes
              </Button>
            </div>
          </div>
        )}

        {state.status === "error" && (
          <div className="space-y-4">
            <div
              data-testid="pairing-error"
              data-pairing-error={state.reason}
              className="flex items-start gap-3 border border-destructive/40 bg-destructive/5 px-4 py-4"
            >
              <TriangleAlert className="mt-0.5 h-5 w-5 text-destructive" />
              <p className="text-sm">{state.message}</p>
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => setLocation(state.status === "success" ? "/history" : "/sync-settings")}
            className="rounded-none border-2 border-foreground font-bold uppercase tracking-[0.18em]"
          >
            {actionLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
