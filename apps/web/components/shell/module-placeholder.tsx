import { Cable } from 'lucide-react';
import { EmptyState, PageHeader, Section } from '@/components/ui/feedback';

/**
 * Placeholder for modules whose API is still being connected. Lists the
 * capabilities that will appear here so users know what to expect.
 */
export function ModulePlaceholder({ title, description, capabilities }: { title: string; description: string; capabilities: string[] }) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <Section>
        <EmptyState
          icon={Cable}
          title={`${title} is being connected`}
          description="This module's screens are wired up as soon as its API is available. No data is shown until then."
          action={
            <ul className="mx-auto grid max-w-md grid-cols-1 gap-1 text-left text-sm text-muted-foreground sm:grid-cols-2">
              {capabilities.map((c) => (
                <li key={c} className="flex items-center gap-2">
                  <span className="size-1 rounded-full bg-muted-foreground/60" aria-hidden />
                  {c}
                </li>
              ))}
            </ul>
          }
        />
      </Section>
    </>
  );
}
