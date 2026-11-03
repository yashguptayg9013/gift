'use client';

import { PageHeader } from '@/components/ui/feedback';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives';
import { CategoriesSetup } from '@/components/inventory/setup-categories';
import { UnitsSetup } from '@/components/inventory/setup-units';
import { WarehousesSetup } from '@/components/inventory/setup-warehouses';

export default function InventorySetupPage() {
  return (
    <>
      <PageHeader title="Inventory setup" description="Warehouses, storage locations, item categories with their attributes, and units of measure." />
      <Tabs defaultValue="warehouses">
        <TabsList>
          <TabsTrigger value="warehouses">Warehouses &amp; locations</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="units">Units</TabsTrigger>
        </TabsList>
        <TabsContent value="warehouses">
          <WarehousesSetup />
        </TabsContent>
        <TabsContent value="categories">
          <CategoriesSetup />
        </TabsContent>
        <TabsContent value="units">
          <UnitsSetup />
        </TabsContent>
      </Tabs>
    </>
  );
}
