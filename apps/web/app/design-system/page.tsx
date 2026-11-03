'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Moon, Plus, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { STATUS_VOCABULARIES } from '@puja/shared';
import { useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { formatCurrency, formatDate, formatNumber, formatQty } from '@/lib/format';
import { Logo } from '@/components/shell/logo';
import { Button } from '@/components/ui/button';
import { AreaChartCard, BarChartCard } from '@/components/ui/charts';
import { Combobox } from '@/components/ui/combobox';
import { DataTable } from '@/components/ui/data-table';
import { type DateRange, DateRangePicker, presetRange } from '@/components/ui/date-range';
import { Badge, DescriptionList, EmptyState, ErrorState, FormError, LoadingRows, PageHeader, Section, Stat, StatusBadge, StockStatusBadge } from '@/components/ui/feedback';
import { Field, FormGrid } from '@/components/ui/form';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { ConfirmDialog, Dialog, DialogContent, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Popover, PopoverContent, PopoverTrigger, Sheet, SheetContent } from '@/components/ui/overlays';
import { Avatar, Checkbox, Kbd, Label, Select, Separator, Skeleton, Switch, Tabs, TabsContent, TabsList, TabsTrigger, Tooltip } from '@/components/ui/primitives';

/** Static showcase of every design-system component and state. Uses illustrative values only. */
interface Row {
  code: string;
  name: string;
  qty: number;
  status: string;
}
const SAMPLE_ROWS: Row[] = [
  { code: 'SAMPLE-01', name: 'Sample row A', qty: 120.5, status: 'OK' },
  { code: 'SAMPLE-02', name: 'Sample row B', qty: 8, status: 'LOW' },
  { code: 'SAMPLE-03', name: 'Sample row C', qty: 0, status: 'OUT' },
];
const cols: ColumnDef<Row, unknown>[] = [
  { accessorKey: 'code', header: 'Code', cell: ({ row }) => <span className="font-mono text-xs">{row.original.code}</span> },
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'qty', header: 'Quantity', meta: { numeric: true }, cell: ({ row }) => formatQty(row.original.qty, 'M') },
  { accessorKey: 'status', header: 'Status', cell: ({ row }) => <StockStatusBadge status={row.original.status} /> },
];
const CHART = Array.from({ length: 7 }, (_, i) => ({ d: `D${i + 1}`, a: [3, 5, 4, 7, 6, 8, 5][i], b: [1, 0, 2, 1, 0, 1, 2][i] }));

export default function DesignSystemPage() {
  const { resolvedTheme, setTheme } = useTheme();
  const [range, setRange] = useState<DateRange>(() => presetRange('month'));
  const [dialog, setDialog] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [sel, setSel] = useState('a');
  const [combo, setCombo] = useState<string | null>(null);
  const sampleError = new ApiError(422, { code: 'INSUFFICIENT_STOCK', message: 'Insufficient available stock: required 12, available 8', requestId: 'example-request-id' });

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-8 md:px-6">
      <div className="flex items-center justify-between">
        <Logo />
        <Button variant="ghost" size="icon" aria-label="Toggle theme" onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>
          {resolvedTheme === 'dark' ? <Sun /> : <Moon />}
        </Button>
      </div>
      <PageHeader title="Design system" description="Tokens, components and states used across PUJA OS." breadcrumbs={[{ label: 'PUJA OS' }, { label: 'Design system' }]} actions={<Button variant="primary"><Plus /> Primary action</Button>} />

      <Block title="Colour tokens">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {['background', 'card', 'muted', 'border', 'primary', 'accent', 'success', 'warning', 'danger', 'info', 'chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5', 'chart-6'].map((t) => (
            <div key={t} className="overflow-hidden rounded-md border">
              <div className="h-10" style={{ background: `var(--${t})` }} />
              <div className="px-2 py-1 font-mono text-[11px] text-muted-foreground">{t}</div>
            </div>
          ))}
        </div>
      </Block>

      <Block title="Typography">
        <div className="space-y-1">
          <p className="text-2xl font-semibold tracking-tight">24 / Page title</p>
          <p className="text-xl font-semibold">20 / Section title</p>
          <p className="text-lg">16 / Emphasis</p>
          <p className="text-base">14 / Body — default reading size for tables and forms.</p>
          <p className="text-sm text-muted-foreground">13 / Secondary text</p>
          <p className="text-xs text-muted-foreground">12 / Captions and labels</p>
          <p className="font-mono text-sm">Mono · MO/26-27/00042 · {formatNumber(1234567.891)} · {formatCurrency(98765.4)} · {formatDate(new Date())}</p>
        </div>
      </Block>

      <Block title="Buttons">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary">Primary</Button>
          <Button>Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="subtle">Subtle</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="danger-ghost">Danger ghost</Button>
          <Button variant="link">Link</Button>
          <Button loading>Loading</Button>
          <Button disabled>Disabled</Button>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
          <Button size="icon" aria-label="Add">
            <Plus />
          </Button>
        </div>
      </Block>

      <Block title="Inputs">
        <FormGrid cols={3}>
          <Field label="Text input" htmlFor="ds-1" hint="Helper text">
            <Input id="ds-1" placeholder="Placeholder" />
          </Field>
          <Field label="Invalid input" htmlFor="ds-2" error="This field is required" required>
            <Input id="ds-2" aria-invalid />
          </Field>
          <Field label="Disabled" htmlFor="ds-3">
            <Input id="ds-3" disabled value="Read only" />
          </Field>
          <Field label="Native select" htmlFor="ds-4">
            <NativeSelect id="ds-4">
              <option>Option A</option>
              <option>Option B</option>
            </NativeSelect>
          </Field>
          <Field label="Select" htmlFor="ds-5">
            <Select id="ds-5" value={sel} onValueChange={setSel} options={[{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }]} />
          </Field>
          <Field label="Combobox" htmlFor="ds-6">
            <Combobox id="ds-6" value={combo} onChange={(v) => setCombo(v)} options={[{ value: '1', label: 'First option', description: 'with description' }, { value: '2', label: 'Second option' }]} />
          </Field>
          <Field label="Textarea" htmlFor="ds-7" className="sm:col-span-2">
            <Textarea id="ds-7" />
          </Field>
          <div className="flex flex-col gap-3 pt-5">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox defaultChecked /> Checkbox
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch defaultChecked /> Switch
            </label>
            <Label>Label only</Label>
          </div>
        </FormGrid>
        <div className="mt-4">
          <DateRangePicker value={range} onChange={setRange} />
        </div>
      </Block>

      <Block title="Badges">
        <div className="flex flex-wrap gap-2">
          {(['neutral', 'info', 'success', 'warning', 'danger', 'accent'] as const).map((t) => (
            <Badge key={t} tone={t}>
              {t}
            </Badge>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.keys(STATUS_VOCABULARIES.ProductionStatus).map((s) => (
            <StatusBadge key={s} vocabulary="ProductionStatus" value={s} />
          ))}
        </div>
      </Block>

      <Block title="Overlays & navigation">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setDialog(true)}>Dialog</Button>
          <Button onClick={() => setSheet(true)}>Drawer</Button>
          <Button onClick={() => setConfirm(true)}>Confirm</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>Dropdown</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>Item one</DropdownMenuItem>
              <DropdownMenuItem destructive>Destructive</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Popover>
            <PopoverTrigger asChild>
              <Button>Popover</Button>
            </PopoverTrigger>
            <PopoverContent>Popover content</PopoverContent>
          </Popover>
          <Tooltip content="Tooltip text">
            <Button variant="ghost">Hover me</Button>
          </Tooltip>
          <Kbd>⌘K</Kbd>
          <Avatar name="Sample Person" />
        </div>
        <Tabs defaultValue="one" className="mt-4">
          <TabsList>
            <TabsTrigger value="one">First tab</TabsTrigger>
            <TabsTrigger value="two">Second tab</TabsTrigger>
          </TabsList>
          <TabsContent value="one">First tab content</TabsContent>
          <TabsContent value="two">Second tab content</TabsContent>
        </Tabs>
        <Dialog open={dialog} onOpenChange={setDialog}>
          <DialogContent title="Dialog title" description="Supporting description" footer={<Button variant="primary" onClick={() => setDialog(false)}>Done</Button>}>
            Dialog body
          </DialogContent>
        </Dialog>
        <Sheet open={sheet} onOpenChange={setSheet}>
          <SheetContent title="Drawer title" description="Side panel for forms and details">
            Drawer body
          </SheetContent>
        </Sheet>
        <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Delete this?" description="This cannot be undone." destructive confirmLabel="Delete" onConfirm={() => setConfirm(false)} />
      </Block>

      <Block title="KPI tiles & description list">
        <div className="grid grid-cols-2 divide-x rounded-lg border bg-card sm:grid-cols-4 [&>*]:border-border">
          <Stat label="Metric" value="1,204" hint="Supporting hint" />
          <Stat label="Warning metric" value="12" tone="warning" />
          <Stat label="Danger metric" value="3" tone="danger" />
          <Stat label="Loading" value="" loading />
        </div>
        <Section className="mt-4">
          <div className="p-4">
            <DescriptionList items={[{ label: 'Label', value: 'Value' }, { label: 'Empty', value: null }, { label: 'Long', value: 'A longer value that wraps across lines when space is limited.' }]} />
          </div>
        </Section>
      </Block>

      <Block title="Data table">
        <DataTable columns={cols} data={SAMPLE_ROWS} searchable exportName="sample" />
      </Block>

      <Block title="Charts">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Section title="Bar">
            <div className="p-3">
              <BarChartCard data={CHART} xKey="d" series={[{ key: 'a', label: 'Series A' }, { key: 'b', label: 'Series B', color: 4 }]} height={200} />
            </div>
          </Section>
          <Section title="Area">
            <div className="p-3">
              <AreaChartCard data={CHART} xKey="d" series={[{ key: 'a', label: 'Series A', color: 2 }]} height={200} />
            </div>
          </Section>
        </div>
      </Block>

      <Block title="States">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Section title="Loading">
            <LoadingRows rows={3} />
            <div className="space-y-2 p-3">
              <Skeleton className="h-4 w-1/2" />
            </div>
          </Section>
          <Section title="Empty">
            <EmptyState compact title="No records yet" description="Create the first record to get started." action={<Button size="sm">Create</Button>} />
          </Section>
          <Section title="Error">
            <ErrorState error={sampleError} onRetry={() => undefined} />
          </Section>
        </div>
        <div className="mt-4">
          <FormError error={sampleError} />
        </div>
      </Block>
      <Separator />
      <p className="text-xs text-muted-foreground">Values on this page are illustrative and not business data.</p>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">{title}</h2>
      {children}
    </section>
  );
}
