import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { X } from "lucide-react";

// UX_RATIONALE:
// - consistency: 他のモーダル（Settings, Export, PWA, Help）と構造・デザインを統一し、学習コストを下げる。
// - visual_hierarchy: Neo-Brutalismスタイル（太枠、影なし）を適用し、アプリ全体の一貫性を保つ。

interface ManusDialogProps {
  title?: string;
  logo?: string;
  open?: boolean;
  onLogin: () => void;
  onOpenChange?: (open: boolean) => void;
  onClose?: () => void;
}

export function ManusDialog({
  title,
  logo,
  open = false,
  onLogin,
  onOpenChange,
  onClose,
}: ManusDialogProps) {
  const [internalOpen, setInternalOpen] = useState(open);

  useEffect(() => {
    if (!onOpenChange) {
      setInternalOpen(open);
    }
  }, [open, onOpenChange]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (onOpenChange) {
      onOpenChange(nextOpen);
    } else {
      setInternalOpen(nextOpen);
    }

    if (!nextOpen) {
      onClose?.();
    }
  };

  return (
    <Dialog
      open={onOpenChange ? open : internalOpen}
      onOpenChange={handleOpenChange}
    >
      <DialogContent className="neo-border bg-background p-0 gap-0 max-w-sm w-[90vw] overflow-hidden border-2 border-black dark:border-white sm:rounded-none">
        <DialogHeader className="p-4 border-b-2 border-black dark:border-white bg-white dark:bg-black sticky top-0 z-10 flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-3">
            {logo && (
              <div className="bg-primary p-1 border-2 border-black dark:border-white">
                <img src={logo} alt="Dialog graphic" className="w-6 h-6 rounded-none" />
              </div>
            )}
            {title && (
              <DialogTitle className="text-2xl font-black uppercase tracking-tighter transform translate-y-[1px]">
                {title}
              </DialogTitle>
            )}
          </div>
          <DialogClose asChild>
            <button className="w-10 h-10 flex items-center justify-center bg-destructive text-destructive-foreground border-2 border-black dark:border-white hover:translate-y-[1px] hover:translate-x-[1px] transition-all active:bg-destructive/90">
              <X className="w-6 h-6" strokeWidth={4} />
            </button>
          </DialogClose>
        </DialogHeader>

        <div className="p-6 flex flex-col items-center gap-6">
          <DialogDescription className="text-base font-bold text-center text-muted-foreground">
            Please login with Manus to continue
          </DialogDescription>

          <DialogFooter className="w-full">
            <Button
              onClick={onLogin}
              className="w-full h-12 bg-primary text-primary-foreground border-2 border-black dark:border-white rounded-none font-black text-lg hover:translate-y-[1px] hover:translate-x-[1px] transition-all active:bg-primary/90"
            >
              LOGIN WITH MANUS
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
