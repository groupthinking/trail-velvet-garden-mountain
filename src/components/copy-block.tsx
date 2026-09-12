import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CopyBlock({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-elevated p-3 pl-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">{label}</p>
        <Button type="button" variant="ghost" size="sm" onClick={copy} className="h-8 px-2">
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre
        className={
          mono
            ? "max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono text-[12.5px] leading-5 text-foreground"
            : "max-h-48 overflow-auto whitespace-pre-wrap text-sm leading-6 text-foreground"
        }
      >
        {value}
      </pre>
    </div>
  );
}
