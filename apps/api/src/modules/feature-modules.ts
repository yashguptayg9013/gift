import { AiModule } from './ai/ai.module';
import { ApprovalsModule } from './approvals/approvals.module';
import { CatalogModule } from './catalog/catalog.module';
import { InventoryModule } from './inventory/inventory.module';
import { ManufacturingModule } from './manufacturing/manufacturing.module';
import { ProcurementModule } from './procurement/procurement.module';
import { QualityModule } from './quality/quality.module';
import { ReportsModule } from './reports/reports.module';
import { SalesModule } from './sales/sales.module';
import { WorkforceModule } from './workforce/workforce.module';

/** Business modules registered in AppModule. Kept separate so the list is easy to scan. */
export const FEATURE_MODULES = [ApprovalsModule, CatalogModule, InventoryModule, ManufacturingModule, WorkforceModule, QualityModule, ProcurementModule, SalesModule, ReportsModule, AiModule];
