import { Clock3, Smartphone } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-none border-2 border-foreground p-0" showCloseButton={false}>
        <DialogHeader className="border-b-2 border-border px-6 py-5">
          <DialogTitle className="flex items-center gap-2 text-xl font-black uppercase tracking-tight">
            <Smartphone className="h-5 w-5" />
            Add Phone
          </DialogTitle>
          <DialogDescription className="mt-2 text-sm">
            同じWi-FiでこのQRを読み取ってください。1回だけ使えます。
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
            <span>有効期限: {new Date(expiresAt).toLocaleString()}</span>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Pairing URL</div>
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
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
