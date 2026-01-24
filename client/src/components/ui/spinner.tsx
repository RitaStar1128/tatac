import { Loader2Icon } from "lucide-react";

import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  const { t } = useLanguage();
  return (
    <Loader2Icon
      role="status"
      aria-label={t("loading")}
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner };
