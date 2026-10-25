import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  /** Shown on the confirm button while the action is in flight. */
  pendingLabel?: string;
  /** Styles the confirm button and puts the initial focus on Cancel. */
  destructive?: boolean;
  pending?: boolean;
  onConfirm: () => void;
}

/**
 * The one confirmation surface for actions that cannot be undone.
 *
 * It replaces `window.confirm`, which is unstyled, blocks the main thread inside
 * the browser's own modal, ignores the app's theme, focus ring and reduced-motion
 * rules, and cannot show that the request is still in flight — so a second click
 * on the page behind it was always possible. Cancel takes the initial focus, so
 * Enter on a dialog opened by accident does the safe thing.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pendingLabel,
  destructive = false,
  pending = false,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending} autoFocus>
            Cancel
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            onClick={onConfirm}
            loading={pending}
          >
            {pending ? (pendingLabel ?? 'Working…') : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
