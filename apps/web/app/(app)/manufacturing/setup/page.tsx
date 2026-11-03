'use client';

import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/ui/feedback';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives';
import { DepartmentsSetup, RoutesSetup, StagesSetup, WorkstationsSetup } from '@/components/manufacturing/setup';

export default function ManufacturingSetupPage() {
  const { can } = useAuth();
  return (
    <>
      <PageHeader title="Manufacturing setup" description="Stages, routes, workstations and departments. These are configuration, not business records — change them as your shop floor changes." />
      <Tabs defaultValue="routes">
        <TabsList>
          <TabsTrigger value="routes">Routes</TabsTrigger>
          <TabsTrigger value="stages">Stages</TabsTrigger>
          <TabsTrigger value="workstations">Workstations</TabsTrigger>
          <TabsTrigger value="departments">Departments</TabsTrigger>
        </TabsList>
        <TabsContent value="routes">
          <RoutesSetup />
        </TabsContent>
        <TabsContent value="stages">
          <StagesSetup />
        </TabsContent>
        <TabsContent value="workstations">
          <WorkstationsSetup />
        </TabsContent>
        <TabsContent value="departments">
          <DepartmentsSetup canManage={can(['production.config.manage', 'workforce.manage'], 'any')} />
        </TabsContent>
      </Tabs>
    </>
  );
}
