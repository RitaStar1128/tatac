import { Clock3, Smartphone } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SyncPairingQrModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pairingUrl: string;
  expiresAt: string;
}

export function SyncPairingQrModal({
  open,
  onOpenChange,
  pairingUrl,
  expiresAt,
}: SyncPairingQrModalProps) {
  const { language } = useLanguage();
  const labels =
    language === "ja"
      ? {
          title: "スマホを追加",
          description: "同じ Wi-Fi で読み取ってください。スマホに同期設定をコピーして、最初の同期まで実行します。",
          expires: "有効期限",
          pairingUrl: "ペアリング URL",
          close: "閉じる",
        }
      : {
          title: "Add Phone",
          description: "Scan this on the same Wi-Fi. The phone will copy the sync settings and run the first sync.",
          expires: "Expires",
          pairingUrl: "Pairing URL",
          close: "Close",
        };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md rounded-none border-2 border-foreground p-0"
        showCloseButton={false}
      >
        <DialogHeader className="border-b-2 border-border px-6 py-5">
          <DialogTitle className="flex items-center gap-2 text-xl font-black uppercase tracking-tight">
            <Smartphone className="h-5 w-5" />
            {labels.title}
          </DialogTitle>
          <DialogDescription className="mt-2 text-sm">
            {labels.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 px-6 py-6">
          <div className="flex justify-center">
            <div className="border-2 border-foreground bg-white p-4">
              <QRCodeSVG value={pairingUrl} size={192} />
            </div>
          </div>

          <div className="flex items-center gap-2 border border-border px-3 py-3 text-sm">
            <Clock3 className="h-4 w-4" />
            <span>
              {labels.expires}: {new Date(expiresAt).toLocaleString()}
            </span>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
              {labels.pairingUrl}
            </div>
            <div
              data-testid="pairing-url"
              className="break-all border border-dashed border-border px-3 py-3 font-mono text-xs"
            >
              {pairingUrl}
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="rounded-none border-2 border-foreground font-bold uppercase tracking-[0.18em]"
            >
              {labels.close}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
