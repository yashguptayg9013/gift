import { Body, Controller, Delete, Get, Global, HttpCode, Module, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { PurchaseOrderStatus, RequisitionStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CurrentUser, IdempotencyKey, RequireAnyPermission, RequirePermissions } from '../../common/decorators';
import { PageQueryDto, pageArgs, toPage } from '../../common/dto/pagination.dto';
import { AuthUser } from '../../common/request-context';
import { ProcurementService } from './procurement.service';

class ContactDto {
  @IsString() @IsNotEmpty() @MaxLength(120) name: string;
  @IsOptional() @IsString() @MaxLength(60) role?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
}

class SupplierDto {
  @IsOptional() @IsString() @MaxLength(20) code?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(120) contactPerson?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsString() @MaxLength(100) state?: string;
  @IsOptional() @IsString() @MaxLength(10) pincode?: string;
  @IsOptional() @IsString() @MaxLength(15) gstin?: string;
  @IsOptional() @IsString() @MaxLength(200) paymentTerms?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(365) leadTimeDays?: number;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => ContactDto) contacts?: ContactDto[];
}

class SupplierQueryDto extends PageQueryDto {
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() includeInactive?: boolean;
}

class SupplierItemDto {
  @IsString() itemId: string;
  @IsOptional() @IsString() @MaxLength(60) supplierSku?: string;
  @IsOptional() @IsString() @MaxLength(10) purchaseUomCode?: string;
  @IsOptional() @Type(() => Number) @IsPositive() conversionFactor?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) lastPrice?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) leadTimeDays?: number;
  @IsOptional() @Type(() => Number) @IsPositive() minOrderQty?: number;
  @IsOptional() @IsBoolean() isPreferred?: boolean;
}

class ReqLineDto {
  @IsString() itemId: string;
  @Type(() => Number) @IsPositive() quantity: number;
  @IsOptional() @IsString() suggestedSupplierId?: string;
  @IsOptional() @IsString() @MaxLength(300) remarks?: string;
}

class RequisitionDto {
  @IsOptional() @IsDateString() neededBy?: string;
  @IsOptional() @IsString() @MaxLength(1000) remarks?: string;
  @IsOptional() @IsBoolean() submit?: boolean;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => ReqLineDto) lines: ReqLineDto[];
}

class ReqQueryDto extends PageQueryDto {
  @IsOptional() @IsEnum(RequisitionStatus) status?: RequisitionStatus;
}

class ReqActionDto {
  @IsIn(['submit', 'approve', 'reject', 'cancel']) action: 'submit' | 'approve' | 'reject' | 'cancel';
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

class ConvertDto {
  @IsOptional() @IsObject() supplierByLine?: Record<string, string>;
  @IsOptional() @IsString() warehouseId?: string;
}

class PoLineDto {
  @IsString() itemId: string;
  @Type(() => Number) @IsPositive() quantity: number;
  @IsOptional() @IsString() @MaxLength(10) uomCode?: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) unitPrice: number;
  @IsOptional() @Type(() => Number) @Min(0) @Max(100) taxRate?: number;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsOptional() @IsDateString() expectedDate?: string;
}

class PoDto {
  @IsOptional() @IsString() supplierId?: string;
  @IsOptional() @IsDateString() expectedDate?: string;
  @IsOptional() @IsString() warehouseId?: string;
  @IsOptional() @IsString() @MaxLength(2000) terms?: string;
  @IsOptional() @IsString() @MaxLength(2000) remarks?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => PoLineDto) lines?: PoLineDto[];
}

class PoQueryDto extends PageQueryDto {
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : String(value).split(',')).filter(Boolean))
  @IsEnum(PurchaseOrderStatus, { each: true })
  status?: PurchaseOrderStatus[];
  @IsOptional() @IsString() supplierId?: string;
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() overdue?: boolean;
}

class DecisionDto {
  @IsIn(['approve', 'reject']) decision: 'approve' | 'reject';
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

class ReasonDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

class GrnLineDto {
  @IsOptional() @IsString() purchaseOrderLineId?: string;
  @IsOptional() @IsString() itemId?: string;
  @Type(() => Number) @IsPositive() quantity: number;
  @IsOptional() @IsString() @MaxLength(10) uomCode?: string;
  @IsOptional() @Type(() => Number) @Min(0) unitPrice?: number;
  @IsOptional() @IsString() @MaxLength(60) batchNumber?: string;
  @IsOptional() @IsString() locationId?: string;
}

class GrnDto {
  @IsOptional() @IsString() purchaseOrderId?: string;
  @IsOptional() @IsString() supplierId?: string;
  @IsOptional() @IsString() warehouseId?: string;
  @IsOptional() @IsString() @MaxLength(60) supplierInvoiceNo?: string;
  @IsOptional() @IsString() @MaxLength(60) supplierChallanNo?: string;
  @IsOptional() @IsString() @MaxLength(30) vehicleNo?: string;
  @IsOptional() @IsString() @MaxLength(1000) remarks?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => GrnLineDto) lines: GrnLineDto[];
}

class GrnQueryDto extends PageQueryDto {
  @IsOptional() @IsString() supplierId?: string;
  @IsOptional() @IsString() purchaseOrderId?: string;
}

class ReturnLineDto {
  @IsString() itemId: string;
  @Type(() => Number) @IsPositive() quantity: number;
  @IsString() locationId: string;
  @IsOptional() @IsString() batchId?: string;
  @IsOptional() @IsString() purchaseOrderLineId?: string;
}

class SupplierReturnDto {
  @IsString() supplierId: string;
  @IsOptional() @IsString() goodsReceiptId?: string;
  @IsOptional() @IsString() purchaseOrderId?: string;
  @IsString() @IsNotEmpty() @MaxLength(500) reason: string;
  @IsOptional() @IsString() @MaxLength(1000) remarks?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => ReturnLineDto) lines: ReturnLineDto[];
}

class FromRecommendationsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => ReqLineDto) lines: ReqLineDto[];
}

class OutstandingQueryDto {
  @IsOptional() @IsString() supplierId?: string;
  @IsOptional() @IsString() itemId?: string;
}

const IDEMPOTENCY = { name: 'Idempotency-Key', required: false };

@ApiTags('procurement')
@Controller('procurement')
class ProcurementController {
  constructor(private readonly svc: ProcurementService) {}

  @Get('suppliers')
  @RequireAnyPermission('procurement.view', 'inventory.view')
  async suppliers(@Query() q: SupplierQueryDto) {
    const { rows, total } = await this.svc.suppliers({ ...q, ...pageArgs(q) });
    return toPage(rows, total, q);
  }
  @Get('suppliers/:id')
  @RequirePermissions('procurement.view')
  supplier(@Param('id') id: string) {
    return this.svc.supplier(id);
  }
  @Post('suppliers')
  @RequirePermissions('procurement.supplier.manage')
  createSupplier(@Body() dto: SupplierDto, @CurrentUser() u: AuthUser) {
    return this.svc.upsertSupplier(null, dto, u);
  }
  @Patch('suppliers/:id')
  @RequirePermissions('procurement.supplier.manage')
  updateSupplier(@Param('id') id: string, @Body() dto: SupplierDto, @CurrentUser() u: AuthUser) {
    return this.svc.upsertSupplier(id, dto, u);
  }
  @Put('suppliers/:id/items')
  @RequirePermissions('procurement.supplier.manage')
  supplierItem(@Param('id') id: string, @Body() dto: SupplierItemDto) {
    return this.svc.upsertSupplierItem(id, dto);
  }
  @Delete('suppliers/:id/items/:itemId')
  @HttpCode(204)
  @RequirePermissions('procurement.supplier.manage')
  removeSupplierItem(@Param('id') id: string, @Param('itemId') itemId: string) {
    return this.svc.removeSupplierItem(id, itemId);
  }

  @Get('requisitions')
  @RequirePermissions('procurement.view')
  async requisitions(@Query() q: ReqQueryDto) {
    const { rows, total } = await this.svc.requisitions({ ...q, ...pageArgs(q) });
    return toPage(rows, total, q);
  }
  @Get('requisitions/:id')
  @RequirePermissions('procurement.view')
  requisition(@Param('id') id: string) {
    return this.svc.requisition(id);
  }
  @Post('requisitions')
  @RequirePermissions('procurement.requisition.manage')
  createRequisition(@Body() dto: RequisitionDto, @CurrentUser() u: AuthUser) {
    return this.svc.createRequisition(dto, u);
  }
  @Post('requisitions/:id/action')
  @HttpCode(200)
  @RequireAnyPermission('procurement.requisition.manage', 'procurement.requisition.approve')
  reqAction(@Param('id') id: string, @Body() dto: ReqActionDto, @CurrentUser() u: AuthUser) {
    return this.svc.decideRequisition(id, dto.action, u, dto.reason);
  }
  @Post('requisitions/:id/convert')
  @RequirePermissions('procurement.po.manage')
  convert(@Param('id') id: string, @Body() dto: ConvertDto, @CurrentUser() u: AuthUser) {
    return this.svc.convertRequisition(id, dto, u);
  }

  @Get('orders')
  @RequirePermissions('procurement.view')
  async orders(@Query() q: PoQueryDto) {
    const { rows, total } = await this.svc.pos({ ...q, ...pageArgs(q) });
    return toPage(rows, total, q);
  }
  @Get('orders/outstanding')
  @RequireAnyPermission('procurement.view', 'inventory.view')
  outstanding(@Query() q: OutstandingQueryDto) {
    return this.svc.outstanding(q);
  }
  @Get('orders/:id')
  @RequirePermissions('procurement.view')
  order(@Param('id') id: string) {
    return this.svc.po(id);
  }
  @Post('orders')
  @RequirePermissions('procurement.po.manage')
  createPo(@Body() dto: PoDto, @CurrentUser() u: AuthUser) {
    return this.svc.createPo(dto, u);
  }
  @Patch('orders/:id')
  @RequirePermissions('procurement.po.manage')
  updatePo(@Param('id') id: string, @Body() dto: PoDto, @CurrentUser() u: AuthUser) {
    return this.svc.updatePo(id, dto, u);
  }
  @Post('orders/:id/submit')
  @HttpCode(200)
  @RequirePermissions('procurement.po.manage')
  submit(@Param('id') id: string, @CurrentUser() u: AuthUser) {
    return this.svc.submitPo(id, u);
  }
  @Post('orders/:id/decision')
  @HttpCode(200)
  @RequirePermissions('procurement.po.approve')
  decide(@Param('id') id: string, @Body() dto: DecisionDto, @CurrentUser() u: AuthUser) {
    return this.svc.approvePo(id, dto.decision, u, dto.note);
  }
  @Post('orders/:id/cancel')
  @HttpCode(200)
  @RequirePermissions('procurement.po.manage')
  cancel(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() u: AuthUser) {
    return this.svc.cancelPo(id, dto.reason ?? '', u);
  }
  @Post('orders/:id/close')
  @HttpCode(200)
  @RequirePermissions('procurement.po.manage')
  close(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() u: AuthUser) {
    return this.svc.closePo(id, dto.reason, u);
  }

  @Get('receipts')
  @RequireAnyPermission('procurement.view', 'inventory.view')
  async receipts(@Query() q: GrnQueryDto) {
    const { rows, total } = await this.svc.grns({ ...q, ...pageArgs(q) });
    return toPage(rows, total, q);
  }
  @Get('receipts/:id')
  @RequireAnyPermission('procurement.view', 'inventory.view')
  receipt(@Param('id') id: string) {
    return this.svc.grn(id);
  }
  @Post('receipts')
  @ApiHeader(IDEMPOTENCY)
  @RequirePermissions('procurement.grn.manage')
  receive(@Body() dto: GrnDto, @CurrentUser() u: AuthUser, @IdempotencyKey() key?: string) {
    return this.svc.receive({ ...dto, idempotencyKey: key }, u);
  }

  @Get('returns')
  @RequirePermissions('procurement.view')
  async returns(@Query() q: GrnQueryDto) {
    const { rows, total } = await this.svc.supplierReturns({ ...q, ...pageArgs(q) });
    return toPage(rows, total, q);
  }
  @Post('returns')
  @ApiHeader(IDEMPOTENCY)
  @RequirePermissions('procurement.return.manage')
  supplierReturn(@Body() dto: SupplierReturnDto, @CurrentUser() u: AuthUser, @IdempotencyKey() key?: string) {
    return this.svc.supplierReturn({ ...dto, idempotencyKey: key }, u);
  }

  @Get('reorder-recommendations')
  @RequireAnyPermission('procurement.view', 'inventory.view')
  recommendations(@Query('includeAll') includeAll?: string, @Query('warehouseId') warehouseId?: string) {
    return this.svc.reorderRecommendations({ includeAll: includeAll === 'true', warehouseId });
  }
  @Post('reorder-recommendations/requisition')
  @RequirePermissions('procurement.requisition.manage')
  fromRecommendations(@Body() dto: FromRecommendationsDto, @CurrentUser() u: AuthUser) {
    return this.svc.requisitionFromRecommendations(dto.lines, u);
  }
}

@Global()
@Module({ controllers: [ProcurementController], providers: [ProcurementService], exports: [ProcurementService] })
export class ProcurementModule {}
