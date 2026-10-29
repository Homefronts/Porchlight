import { AlertDialog } from "radix-ui";
import { Button } from "@/components/ui/button";
import { frostedOverlay, frostedSurface } from "@/components/ui/frosted";
import { cn } from "@/lib/utils";

/**
 * Asked before a look the text can't be read in becomes the app's look: the
 * way back to Settings is drawn in that look too. Radix focuses Cancel first.
 */
export function ConfirmUnreadable({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={cn("fixed inset-0 z-[100]", frostedOverlay)} />
        <AlertDialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-[100] w-[min(92vw,400px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border p-5 text-t1 shadow-2xl",
            frostedSurface,
          )}
        >
          <AlertDialog.Title className="text-[15px] font-semibold">
            Text may be hard to read with this look. Use it anyway?
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-1.5 text-[13px] text-t6">
            You can switch back in Settings, Appearance.
          </AlertDialog.Description>
          <div className="mt-4 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button size="sm" variant="outline">
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button size="sm" onClick={onConfirm}>
                Use it anyway
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
