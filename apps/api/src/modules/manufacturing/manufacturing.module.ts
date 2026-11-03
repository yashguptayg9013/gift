import { Global, Module } from '@nestjs/common';
import { BomModule } from '../bom/bom.controller';
import { ManufacturingConfigController, ManufacturingConfigService } from './config.service';
import { ProductionController } from './production.controller';
import { ProductionService } from './production.service';

@Global()
@Module({
  imports: [BomModule],
  controllers: [ManufacturingConfigController, ProductionController],
  providers: [ManufacturingConfigService, ProductionService],
  exports: [ProductionService, ManufacturingConfigService, BomModule],
})
export class ManufacturingModule {}
