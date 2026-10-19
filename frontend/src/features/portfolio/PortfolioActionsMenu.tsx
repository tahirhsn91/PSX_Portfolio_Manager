import { Archive, ArchiveRestore, Copy, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Portfolio } from '@/types';

interface PortfolioActionsMenuProps {
  portfolio: Portfolio;
  onEdit: (portfolio: Portfolio) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
}

/**
 * The per-portfolio actions, shared by the grid card and the list row.
 *
 * It is always a sibling of the tile's link, never a child: no nested
 * interactive region, no `stopPropagation`, and the trigger stays visible on
 * touch screens where there is no hover. Every item is 44px tall.
 */
export function PortfolioActionsMenu({
  portfolio, onEdit, onDelete, onDuplicate, onArchive, onRestore,
}: PortfolioActionsMenuProps) {
  const isArchived = !!portfolio.archivedAt;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Actions for ${portfolio.name}`}>
          <MoreVertical aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem className="h-11" onClick={() => onEdit(portfolio)}>
          <Pencil aria-hidden="true" /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem className="h-11" onClick={() => onDuplicate(portfolio.id)}>
          <Copy aria-hidden="true" /> Duplicate
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {isArchived ? (
          <DropdownMenuItem className="h-11" onClick={() => onRestore(portfolio.id)}>
            <ArchiveRestore aria-hidden="true" /> Restore
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem className="h-11" onClick={() => onArchive(portfolio.id)}>
            <Archive aria-hidden="true" /> Archive
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          className="h-11 text-destructive focus:text-destructive"
          onClick={() => onDelete(portfolio.id)}
        >
          <Trash2 aria-hidden="true" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
