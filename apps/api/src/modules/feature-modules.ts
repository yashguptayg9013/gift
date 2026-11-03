import { ApprovalsModule } from './approvals/approvals.module';
import { CatalogModule } from './catalog/catalog.module';
import { InventoryModule } from './inventory/inventory.module';

/** Business modules registered in AppModule. Kept separate so the list is easy to scan. */
export const FEATURE_MODULES = [ApprovalsModule, CatalogModule, InventoryModule];
