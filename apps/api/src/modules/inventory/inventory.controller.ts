import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { InventoryTxType } from '@prisma/client';
import { CurrentUser, IdempotencyKey, RequireAnyPermission, RequirePermissions } from '../../common/decorators';
import { pageArgs, toPage } from '../../common/dto/pagination.dto';
import { AuthUser } from '../../common/request-context';
import {
  AdjustmentDto,
  CreateStockCountDto,
  IssueDto,
  ManualReservationDto,
  MovementQueryDto,
  ReceiptDto,
  RecordCountDto,
  ReleaseDto,
  ReservationQueryDto,
  ReverseDto,
  StockCountQueryDto,
  StockQueryDto,
  TransferDto,
} from './inventory.dto';
import { InventoryService } from './inventory.service';

const IDEMPOTENCY = { name: 'Idempotency-Key', required: false, description: 'Repeat-safe key; replays return the original result' };

@ApiTags('inventory')
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('stock')
  @RequireAnyPermission('inventory.view', 'product.view')
  stock(@Query() q: StockQueryDto) {
    return this.inventory.stockSummary(q);
  }

  @Get('stock/:itemId/balances')
  @RequireAnyPermission('inventory.view', 'product.view')
  balances(@Param('itemId') itemId: string) {
    return this.inventory.itemBalances(itemId);
  }

  @Get('movements')
  @RequirePermissions('inventory.view')
  async movements(@Query() q: MovementQueryDto) {
    const { rows, total } = await this.inventory.movements({ ...q, from: q.from ? new Date(q.from) : undefined, to: q.to ? new Date(q.to) : undefined, ...pageArgs(q) });
    return toPage(rows, total, q);
  }

  @Get('transactions')
  @RequirePermissions('inventory.view')
  async transactions(@Query() q: MovementQueryDto) {
    const { rows, total } = await this.inventory.transactions({ ...q, from: q.from ? new Date(q.from) : undefined, to: q.to ? new Date(q.to) : undefined, ...pageArgs(q) });
    return toPage(rows, total, q);
  }

  @Get('transactions/:id')
  @RequirePermissions('inventory.view')
  transaction(@Param('id') id: string) {
    return this.inventory.getTransaction(id);
  }

  @Post('receipts')
  @ApiHeader(IDEMPOTENCY)
  @RequirePermissions('inventory.receive')
  receive(@Body() dto: ReceiptDto, @CurrentUser() user: AuthUser, @IdempotencyKey() key?: string) {
    return this.inventory.receive({ ...dto, idempotencyKey: key, referenceType: 'MANUAL' }, user);
  }

  @Post('issues')
  @ApiHeader(IDEMPOTENCY)
  @RequirePermissions('inventory.issue')
  issue(@Body() dto: IssueDto, @CurrentUser() user: AuthUser, @IdempotencyKey() key?: string) {
    return this.inventory.issue({ ...dto, idempotencyKey: key, referenceType: 'MANUAL' }, user);
  }

  @Post('damage')
  @ApiHeader(IDEMPOTENCY)
  @RequirePermissions('inventory.damage')
  damage(@Body() dto: IssueDto, @CurrentUser() user: AuthUser, @IdempotencyKey() key?: string) {
    return this.inventory.issue({ ...dto, type: InventoryTxType.DAMAGE, idempotencyKey: key, referenceType: 'MANUAL' }, user);
  }

  @Post('returns')
  @ApiHeader(IDEMPOTENCY)
  @RequirePermissions('inventory.return')
  materialReturn(@Body() dto: ReceiptDto, @CurrentUser() user: AuthUser, @IdempotencyKey() key?: string) {
    return this.inventory.receive({ ...dto, type: InventoryTxType.RETURN, idempotencyKey: key, referenceType: 'MANUAL' }, user);
  }

  @Post('transfers')
  @ApiHeader(IDEMPOTENCY)
  @RequirePermissions('inventory.transfer')
  transfer(@Body() dto: TransferDto, @CurrentUser() user: AuthUser, @IdempotencyKey() key?: string) {
    return this.inventory.transfer({ ...dto, idempotencyKey: key, referenceType: 'MANUAL' }, user);
  }

  @Post('adjustments')
  @ApiHeader(IDEMPOTENCY)
  @RequirePermissions('inventory.adjust')
  adjust(@Body() dto: AdjustmentDto, @CurrentUser() user: AuthUser, @IdempotencyKey() key?: string) {
    return this.inventory.adjust({ ...dto, idempotencyKey: key }, user);
  }

  @Post('transactions/:id/reverse')
  @ApiHeader(IDEMPOTENCY)
  @RequirePermissions('inventory.reverse')
  reverse(@Param('id') id: string, @Body() dto: ReverseDto, @CurrentUser() user: AuthUser, @IdempotencyKey() key?: string) {
    return this.inventory.reverse(id, dto.reason, user, key);
  }

  @Get('reservations')
  @RequirePermissions('inventory.view')
  reservations(@Query() q: ReservationQueryDto) {
    return this.inventory.reservations(q);
  }

  @Post('reservations')
  @ApiHeader(IDEMPOTENCY)
  @RequirePermissions('inventory.reserve')
  reserve(@Body() dto: ManualReservationDto, @CurrentUser() user: AuthUser, @IdempotencyKey() key?: string) {
    return this.inventory.reserveManual({ ...dto, idempotencyKey: key }, user);
  }

  @Post('reservations/:id/release')
  @HttpCode(200)
  @RequirePermissions('inventory.reserve')
  release(@Param('id') id: string, @Body() dto: ReleaseDto, @CurrentUser() user: AuthUser) {
    return this.inventory.releaseReservation(id, user, dto.quantity);
  }

  @Get('stock-counts')
  @RequirePermissions('inventory.view')
  async stockCounts(@Query() q: StockCountQueryDto) {
    const { rows, total } = await this.inventory.stockCounts({ ...q, ...pageArgs(q) });
    return toPage(rows, total, q);
  }

  @Post('stock-counts')
  @RequirePermissions('inventory.count')
  createCount(@Body() dto: CreateStockCountDto, @CurrentUser() user: AuthUser) {
    return this.inventory.createStockCount(dto, user);
  }

  @Get('stock-counts/:id')
  @RequirePermissions('inventory.view')
  count(@Param('id') id: string) {
    return this.inventory.getStockCount(id);
  }

  @Post('stock-counts/:id/lines')
  @HttpCode(200)
  @RequirePermissions('inventory.count')
  recordCount(@Param('id') id: string, @Body() dto: RecordCountDto) {
    return this.inventory.recordCount(id, dto.lines);
  }

  @Post('stock-counts/:id/submit')
  @HttpCode(200)
  @RequirePermissions('inventory.count')
  submitCount(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.inventory.submitStockCount(id, user);
  }

  @Post('stock-counts/:id/cancel')
  @HttpCode(204)
  @RequirePermissions('inventory.count')
  cancelCount(@Param('id') id: string) {
    return this.inventory.cancelStockCount(id);
  }

  @Get('integrity')
  @RequirePermissions('inventory.adjust.approve')
  integrity() {
    return this.inventory.verifyLedger();
  }
}

