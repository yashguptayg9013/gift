'use client';

import { useAuth } from '@/lib/auth';
import { ShopFloor } from '@/components/manufacturing/shop-floor';

/** Supervisors land on all open stages; workers on their own tasks. */
export default function ProductionPage() {
  const { can } = useAuth();
  return <ShopFloor defaultAll={can('production.stage.update.any')} />;
}
