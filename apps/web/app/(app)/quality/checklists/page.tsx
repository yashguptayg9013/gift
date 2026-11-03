'use client';

import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { loadItemOptions, useCategories, useProducts } from '@/lib/api/catalog';
import { useApiMutation } from '@/lib/api/hooks';
import { qualityApi, qualityKeys, useChecklists, type Checklist, type QcCheckType, type QcScope } from '@/lib/api/quality';
import { useAuth } from '@/lib/auth';
import { humanize } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { AsyncCombobox } from '@/components/ui/combobox';
import { Badge, EmptyState, ErrorState, FormError, LoadingRows, PageHeader } from '@/components/ui/feedback';
import { Field, FormGrid } from '@/components/ui/form';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/overlays';
import { Checkbox, Label } from '@/components/ui/primitives';

export default function ChecklistsPage() {
  const { can } = useAuth();
  const q = useChecklists();
  const products = useProducts({ pageSize: 200 });
  const cats = useCategories();
  const [edit, setEdit] = useState<Checklist | 'new' | null>(null);
  const manage = can('quality.config.manage');
  const scopeLabel = (c: Checklist) => {
    if (c.itemId) return 'Specific item';
    if (c.productId) return `Product: ${products.data?.data.find((p) => p.id === c.productId)?.name ?? '…'}`;
    if (c.categoryId) return `Category: ${cats.data?.find((x) => x.id === c.categoryId)?.name ?? '…'}`;
    return 'Generic';
  };
  return (
    <>
      <PageHeader
        title="QC checklists"
        description="The most specific active checklist is used: item → product → category → generic. Applies to receipt inspections (materials) and QC stages (products)."
        actions={
          manage && (
            <Button variant="primary" onClick={() => setEdit('new')}>
              <Plus /> Checklist
            </Button>
          )
        }
      />
      {q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data ? (
        <LoadingRows rows={4} />
      ) : q.data.length === 0 ? (
        <EmptyState title="No checklists yet" description="Create checklists so inspectors record the same checks every time." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {q.data.map((c) => (
            <div key={c.id} className="rounded-lg border bg-card p-4">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium">
                    {c.name} {!c.isActive && <Badge>Inactive</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {humanize(c.appliesTo)} · {scopeLabel(c)}
                  </div>
                </div>
                {manage && (
                  <Button size="icon-sm" variant="ghost" aria-label={`Edit ${c.name}`} onClick={() => setEdit(c)}>
                    <Pencil />
                  </Button>
                )}
              </div>
              <ol className="list-decimal space-y-0.5 pl-5 text-sm">
                {c.items.map((i) => (
                  <li key={i.id}>
                    {i.label}{' '}
                    <span className="text-xs text-muted-foreground">
                      {i.type === 'NUMERIC' ? `(${i.minValue ?? '−∞'}–${i.maxValue ?? '∞'} ${i.unit ?? ''})` : i.type === 'TEXT' ? '(text)' : ''}
                      {!i.isRequired && ' optional'}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
      {edit && <ChecklistDialog checklist={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

interface EditItem {
  label: string;
  type: QcCheckType;
  minValue: string;
  maxValue: string;
  unit: string;
  isRequired: boolean;
}

function ChecklistDialog({ checklist, onClose }: { checklist: Checklist | null; onClose: () => void }) {
  const products = useProducts({ pageSize: 200 });
  const cats = useCategories();
  const [name, setName] = useState(checklist?.name ?? '');
  const [description, setDescription] = useState(checklist?.description ?? '');
  const [appliesTo, setAppliesTo] = useState<QcScope>(checklist?.appliesTo ?? 'PRODUCT');
  const [scope, setScope] = useState<'generic' | 'item' | 'product' | 'category'>(checklist?.itemId ? 'item' : checklist?.productId ? 'product' : checklist?.categoryId ? 'category' : 'generic');
  const [itemId, setItemId] = useState<string | null>(checklist?.itemId ?? null);
  const [productId, setProductId] = useState(checklist?.productId ?? '');
  const [categoryId, setCategoryId] = useState(checklist?.categoryId ?? '');
  const [active, setActive] = useState(checklist?.isActive ?? true);
  const [items, setItems] = useState<EditItem[]>(
    checklist?.items.map((i) => ({ label: i.label, type: i.type, minValue: i.minValue?.toString() ?? '', maxValue: i.maxValue?.toString() ?? '', unit: i.unit ?? '', isRequired: i.isRequired })) ?? [{ label: '', type: 'PASS_FAIL', minValue: '', maxValue: '', unit: '', isRequired: true }],
  );
  const save = useApiMutation(
    () =>
      qualityApi.saveChecklist(checklist?.id ?? null, {
        name,
        description: description || undefined,
        appliesTo,
        isActive: active,
        itemId: scope === 'item' ? (itemId ?? undefined) : undefined,
        productId: scope === 'product' ? productId || undefined : undefined,
        categoryId: scope === 'category' ? categoryId || undefined : undefined,
        items: items
          .filter((i) => i.label.trim())
          .map((i) => ({ label: i.label.trim(), type: i.type, minValue: i.type === 'NUMERIC' && i.minValue ? Number(i.minValue) : undefined, maxValue: i.type === 'NUMERIC' && i.maxValue ? Number(i.maxValue) : undefined, unit: i.unit || undefined, isRequired: i.isRequired })),
      }),
    { invalidate: [qualityKeys.all], success: 'Checklist saved', silentError: true, onSuccess: onClose },
  );
  const upd = (i: number, p: Partial<EditItem>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const move = (i: number, d: -1 | 1) =>
    setItems((xs) => {
      const n = [...xs];
      const [x] = n.splice(i, 1);
      n.splice(i + d, 0, x);
      return n;
    });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        size="xl"
        title={checklist ? `Edit ${checklist.name}` : 'New checklist'}
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!name.trim() || !items.some((i) => i.label.trim())} loading={save.isPending} onClick={() => save.mutate(undefined)}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormGrid>
            <Field label="Name" htmlFor="cl-name" required>
              <Input id="cl-name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Applies to" htmlFor="cl-applies">
              <NativeSelect id="cl-applies" value={appliesTo} onChange={(e) => setAppliesTo(e.target.value as QcScope)}>
                <option value="PRODUCT">Products (QC stages)</option>
                <option value="MATERIAL">Materials (receipt inspection)</option>
                <option value="BOTH">Both</option>
              </NativeSelect>
            </Field>
            <Field label="Scope" htmlFor="cl-scope">
              <NativeSelect id="cl-scope" value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
                <option value="generic">Generic</option>
                <option value="category">Category</option>
                <option value="product">Product (all variants)</option>
                <option value="item">Specific item</option>
              </NativeSelect>
            </Field>
            {scope === 'item' && (
              <Field label="Item" htmlFor="cl-item">
                <AsyncCombobox id="cl-item" value={itemId} onChange={(v) => setItemId(v)} queryKey={['checklist-item-options']} load={(s) => loadItemOptions(s)} />
              </Field>
            )}
            {scope === 'product' && (
              <Field label="Product" htmlFor="cl-product">
                <NativeSelect id="cl-product" value={productId} onChange={(e) => setProductId(e.target.value)}>
                  <option value="">Select…</option>
                  {(products.data?.data ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            )}
            {scope === 'category' && (
              <Field label="Category" htmlFor="cl-cat">
                <NativeSelect id="cl-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  <option value="">Select…</option>
                  {(cats.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({humanize(c.type)})
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            )}
          </FormGrid>
          <Field label="Description" htmlFor="cl-desc">
            <Textarea id="cl-desc" rows={1} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <div className="space-y-2">
            <p className="text-sm font-medium">Checks</p>
            <div className="divide-y rounded-md border">
              {items.map((it, i) => (
                <div key={i} className="grid grid-cols-1 gap-2 p-2 md:grid-cols-[2fr_1fr_0.7fr_0.7fr_0.6fr_auto] md:items-center">
                  <Input aria-label="Check label" placeholder="e.g. Stitching straight, no loose threads" value={it.label} onChange={(e) => upd(i, { label: e.target.value })} />
                  <NativeSelect aria-label="Check type" value={it.type} onChange={(e) => upd(i, { type: e.target.value as QcCheckType })}>
                    <option value="PASS_FAIL">Pass / fail</option>
                    <option value="NUMERIC">Measurement</option>
                    <option value="TEXT">Text</option>
                  </NativeSelect>
                  <Input aria-label="Minimum" placeholder="min" type="number" step="any" disabled={it.type !== 'NUMERIC'} value={it.minValue} onChange={(e) => upd(i, { minValue: e.target.value })} />
                  <Input aria-label="Maximum" placeholder="max" type="number" step="any" disabled={it.type !== 'NUMERIC'} value={it.maxValue} onChange={(e) => upd(i, { maxValue: e.target.value })} />
                  <Input aria-label="Unit" placeholder="unit" disabled={it.type !== 'NUMERIC'} value={it.unit} onChange={(e) => upd(i, { unit: e.target.value })} />
                  <div className="flex items-center gap-1">
                    <Checkbox id={`req-${i}`} checked={it.isRequired} onCheckedChange={(c) => upd(i, { isRequired: c === true })} />
                    <Label htmlFor={`req-${i}`} className="mr-1 text-xs font-normal">Req.</Label>
                    <Button size="icon-sm" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                      <ArrowUp />
                    </Button>
                    <Button size="icon-sm" variant="ghost" aria-label="Move down" disabled={i === items.length - 1} onClick={() => move(i, 1)}>
                      <ArrowDown />
                    </Button>
                    <Button size="icon-sm" variant="ghost" aria-label="Remove check" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}>
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <Button size="sm" variant="ghost" onClick={() => setItems((xs) => [...xs, { label: '', type: 'PASS_FAIL', minValue: '', maxValue: '', unit: '', isRequired: true }])}>
              <Plus /> Add check
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="cl-active" checked={active} onCheckedChange={(c) => setActive(c === true)} />
            <Label htmlFor="cl-active" className="font-normal">Active</Label>
          </div>
          <FormError error={save.error} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
