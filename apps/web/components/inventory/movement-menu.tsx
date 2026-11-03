'use client';

import type { Permission } from '@puja/shared';
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, ChevronDown, PackageX, SlidersHorizontal, Undo2 } from 'lucide-react';
import * as React from 'react';
import type { MovementKind } from '@/lib/api/inventory';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/overlays';
import { MOVEMENT_META, MovementSheet } from './movement-sheet';

const ENTRIES: { kind: MovementKind; perm: Permission; icon: React.ComponentType }[] = [
  { kind: 'receipt', perm: 'inventory.receive', icon: ArrowDownToLine },
  { kind: 'issue', perm: 'inventory.issue', icon: ArrowUpFromLine },
  { kind: 'transfer', perm: 'inventory.transfer', icon: ArrowLeftRight },
  { kind: 'adjustment', perm: 'inventory.adjust', icon: SlidersHorizontal },
  { kind: 'damage', perm: 'inventory.damage', icon: PackageX },
  { kind: 'return', perm: 'inventory.return', icon: Undo2 },
];

export function movementPermission(kind: MovementKind): Permission {
  return ENTRIES.find((e) => e.kind === kind)!.perm;
}

/**
 * "Record movement" dropdown + the drawer it opens. `initialKind` (from a quick-create
 * link such as /inventory?action=receipt) opens the drawer once; `onInitialHandled`
 * is called when that drawer closes so the caller can clear the URL parameter.
 */
export function MovementMenu({ defaultItemId, initialKind, onInitialHandled }: { defaultItemId?: string; initialKind?: MovementKind | null; onInitialHandled?: () => void }) {
  const { can } = useAuth();
  const allowed = ENTRIES.filter((e) => can(e.perm));
  const [kind, setKind] = React.useState<MovementKind | null>(null);
  const [handled, setHandled] = React.useState<MovementKind | null>(null);

  // Derive-state-during-render (React-sanctioned) instead of an effect.
  if (initialKind && initialKind !== handled && can(movementPermission(initialKind))) {
    setHandled(initialKind);
    setKind(initialKind);
  } else if (!initialKind && handled) {
    setHandled(null);
  }

  const close = () => {
    setKind(null);
    if (initialKind) onInitialHandled?.();
  };

  if (!allowed.length) return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="primary">
            Record movement <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-52">
          {allowed.map((e) => (
            <DropdownMenuItem key={e.kind} onSelect={() => setKind(e.kind)}>
              <e.icon /> {MOVEMENT_META[e.kind].title}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {kind && <MovementSheet kind={kind} open={!!kind} onOpenChange={(o) => !o && close()} defaultItemId={defaultItemId} />}
    </>
  );
}
