import { Global, Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { InventoryLedgerService } from './ledger.service';

@Global()
@Module({
  controllers: [InventoryController],
  providers: [InventoryLedgerService, InventoryService],
  exports: [InventoryLedgerService, InventoryService],
})
export class InventoryModule {}
