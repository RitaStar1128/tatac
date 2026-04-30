import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, LoaderCircle, Smartphone, TriangleAlert } from "lucide-react";
import { useLocation } from "wouter";

import { Button } from "@/components/ui/button";
import { consumePairingFromLink } from "@/domains/sync/syncPairing";
import { decodeBase64Url } from "@shared/lib/base64url";

type PairingState =
  | { status: "loading" }
  | { status: "success"; sourceDeviceName: string; applied: number; pulled: number }
  | { status: "error"; reason: "already-used" | "expired" | "node-unreachable" | "invalid" | "unknown"; message: string };

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

function toFriendlyError(error: unknown): PairingState & { status: "error" } {
  const message = error instanceof Error ? error.message : "Unable to complete sync setup.";
  if (message.includes("already been used")) {
    return {
      status: "error",
      reason: "already-used",
      message: "このQRコードはすでに使われています。PC側で新しいQRを出してください。",
    };
  }
  if (message.includes("expired")) {
    return {
      status: "error",
      reason: "expired",
      message: "このQRコードは期限切れです。PC側で新しいQRを出してください。",
    };
  }
  if (message.includes("Failed to fetch")) {
    return {
      status: "error",
      reason: "node-unreachable",
      message: "同期ノードに接続できません。同じWi-Fiに接続してからもう一度試してください。",
    };
  }
  if (message.includes("invalid") || message.includes("incomplete")) {
    return {
      status: "error",
      reason: "invalid",
      message: "このQRコードを読み取れませんでした。もう一度やり直してください。",
    };
  }
  return {
    status: "error",
    reason: "unknown",
    message,
  };
}

export default function SyncPairPage() {
  const [, setLocation] = useLocation();
  const [state, setState] = useState<PairingState>({ status: "loading" });
  const redirectDelayMs = 2000;
  const actionLabel = useMemo(
    () => (state.status === "success" ? "履歴を見る" : "戻る"),
    [state.status],
  );

  useEffect(() => {
    let cancelled = false;
    let redirectTimer: ReturnType<typeof setTimeout> | null = null;

    const run = async () => {
      try {
        const params = parsePairingUrl();
        const result = await consumePairingFromLink(params);
        if (cancelled) return;

        setState({
          status: "success",
          sourceDeviceName: result.sourceDeviceName,
          applied: result.syncResult.applied,
          pulled: result.syncResult.pulled,
        });

        redirectTimer = setTimeout(() => {
          setLocation("/history");
        }, redirectDelayMs);
      } catch (error) {
        if (cancelled) return;
        setState(toFriendlyError(error));
      }
    };

    void run();

    return () => {
      cancelled = true;
      if (redirectTimer) {
        clearTimeout(redirectTimer);
      }
    };
  }, [setLocation]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <div className="w-full max-w-md border-2 border-foreground bg-card p-8">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center border-2 border-foreground bg-foreground text-background">
            <Smartphone className="h-5 w-5" />
          </span>
          <div>
            <div className="text-xs font-black uppercase tracking-[0.3em] text-muted-foreground">TATAC Sync</div>
            <h1 className="text-2xl font-black uppercase tracking-tight">Phone Pairing</h1>
          </div>
        </div>

        {state.status === "loading" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <LoaderCircle className="h-5 w-5 animate-spin" />
              <p className="text-sm">同期設定を受け取って、初回同期を実行しています。</p>
            </div>
          </div>
        )}

        {state.status === "success" && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 border border-border bg-muted/20 px-4 py-4">
              <CheckCircle2 className="mt-0.5 h-5 w-5" />
              <div className="text-sm">
                <p>{state.sourceDeviceName} から設定を受け取りました。</p>
                <p className="mt-1 text-muted-foreground">
                  {state.pulled}件を受信し、{state.applied}件を反映しました。
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">まもなく履歴画面へ移動します。</p>
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
