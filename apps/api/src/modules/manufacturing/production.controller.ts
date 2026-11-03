import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { Priority, ProductionStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CurrentUser, IdempotencyKey, RequireAnyPermission, RequirePermissions } from '../../common/decorators';
import { PageQueryDto, pageArgs, toPage } from '../../common/dto/pagination.dto';
import { AuthUser } from '../../common/request-context';
import { ProductionService } from './production.service';

class CreateOrderDto {
  @IsString() itemId: string;
  @Type(() => Number) @IsPositive() quantity: number;
  @IsOptional() @IsEnum(Priority) priority?: Priority;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsDateString() plannedStart?: string;
  @IsOptional() @IsString() warehouseId?: string;
  @IsOptional() @IsString() outputLocationId?: string;
  @IsOptional() @IsString() @MaxLength(2000) remarks?: string;
  @IsOptional() @IsString() salesOrderLineId?: string;
  @IsOptional() @IsObject() parameters?: Record<string, number>;
}

class UpdateOrderDto {
  @IsOptional() @Type(() => Number) @IsPositive() quantity?: number;
  @IsOptional() @IsEnum(Priority) priority?: Priority;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsDateString() plannedStart?: string;
  @IsOptional() @IsString() @MaxLength(2000) remarks?: string;
  @IsOptional() @IsObject() parameters?: Record<string, number>;
}

class OrderQueryDto extends PageQueryDto {
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : String(value).split(',')).filter(Boolean))
  @IsEnum(ProductionStatus, { each: true })
  status?: ProductionStatus[];
  @IsOptional() @IsEnum(Priority) priority?: Priority;
  @IsOptional() @IsString() itemId?: string;
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() delayed?: boolean;
  @IsOptional() @IsDateString() dueFrom?: string;
  @IsOptional() @IsDateString() dueTo?: string;
}

class ChecklistResultDto {
  @IsString() checklistItemId: string;
  @IsOptional() @IsBoolean() passed?: boolean;
  @IsOptional() @Type(() => Number) @IsNumber() numericValue?: number;
  @IsOptional() @IsString() @MaxLength(500) textValue?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

class DefectDto {
  @IsString() defectCategoryId: string;
  @Type(() => Number) @IsPositive() quantity: number;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

class OutputDto {
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) qtyGood: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) qtyRejected?: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) qtyRework?: number;
  @IsOptional() @IsString() workerId?: string;
  @IsOptional() @IsString() defectCategoryId?: string;
  @IsOptional() @IsString() @MaxLength(1000) remarks?: string;
  @IsOptional() @IsDateString() startedAt?: string;
  @IsOptional() @IsDateString() endedAt?: string;
  @IsOptional() @IsString() checklistId?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => ChecklistResultDto) checklistResults?: ChecklistResultDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => DefectDto) defects?: DefectDto[];
}

class ReasonDto {
  @IsString() @IsNotEmpty() @MaxLength(1000) reason: string;
}

class OptionalReasonDto {
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

class AssignDto {
  @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) workerIds: string[];
}

class WorkstationDto {
  @IsOptional() @IsString() workstationId?: string | null;
}

class RemarkDto {
  @IsString() @IsNotEmpty() @MaxLength(2000) message: string;
  @IsOptional() @IsString() stageId?: string;
}

class MaterialQtyDto {
  @IsString() materialLineId: string;
  @Type(() => Number) @IsPositive() quantity: number;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @IsOptional() @IsString() stageId?: string;
  @IsOptional() @IsString() locationId?: string;
}

class SubstituteDto {
  @IsString() materialLineId: string;
  @IsString() alternativeMaterialId: string;
}

class TasksQueryDto {
  @IsOptional() @IsString() workerId?: string;
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() all?: boolean;
}

const IDEMPOTENCY = { name: 'Idempotency-Key', required: false };

@ApiTags('production')
@Controller('production')
export class ProductionController {
  constructor(private readonly production: ProductionService) {}

  @Get('orders')
  @RequirePermissions('production.view')
  async list(@Query() q: OrderQueryDto) {
    const { rows, total } = await this.production.list({ ...q, dueFrom: q.dueFrom ? new Date(q.dueFrom) : undefined, dueTo: q.dueTo ? new Date(q.dueTo) : undefined, ...pageArgs(q) });
    return toPage(rows, total, q);
  }

  @Get('tasks')
  @RequireAnyPermission('production.stage.update.own', 'production.stage.update.any')
  tasks(@Query() q: TasksQueryDto, @CurrentUser() user: AuthUser) {
    return this.production.tasks(user, q);
  }

  @Get('orders/:id')
  @RequirePermissions('production.view')
  get(@Param('id') id: string) {
    return this.production.get(id);
  }

  @Post('orders')
  @RequirePermissions('production.create')
  create(@Body() dto: CreateOrderDto, @CurrentUser() user: AuthUser) {
    return this.production.create(dto, user);
  }

  @Patch('orders/:id')
  @RequirePermissions('production.create')
  update(@Param('id') id: string, @Body() dto: UpdateOrderDto, @CurrentUser() user: AuthUser) {
    return this.production.update(id, dto, user);
  }

  @Post('orders/:id/release')
  @HttpCode(200)
  @RequirePermissions('production.release')
  release(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.production.release(id, user);
  }

  @Get('orders/:id/availability')
  @RequirePermissions('production.view')
  availability(@Param('id') id: string) {
    return this.production.availability(id);
  }

  @Post('orders/:id/reserve')
  @HttpCode(200)
  @RequirePermissions('production.release')
  reserve(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.production.reserveMaterials(id, user);
  }

  @Post('orders/:id/release-reservations')
  @HttpCode(200)
  @RequirePermissions('production.release')
  releaseReservations(@Param('id') id: string, @Body() dto: OptionalReasonDto, @CurrentUser() user: AuthUser) {
    return this.production.releaseReservations(id, user, dto.reason);
  }

  @Post('orders/:id/substitute')
  @HttpCode(200)
  @RequirePermissions('production.release')
  substitute(@Param('id') id: string, @Body() dto: SubstituteDto, @CurrentUser() user: AuthUser) {
    return this.production.substitute(id, dto.materialLineId, dto.alternativeMaterialId, user);
  }

  @Post('orders/:id/issue-material')
  @ApiHeader(IDEMPOTENCY)
  @HttpCode(200)
  @RequirePermissions('production.material.issue')
  issue(@Param('id') id: string, @Body() dto: MaterialQtyDto, @CurrentUser() user: AuthUser, @IdempotencyKey() key?: string) {
    return this.production.consumeForLine(id, { ...dto, idempotencyKey: key }, user);
  }

  @Post('orders/:id/wastage')
  @ApiHeader(IDEMPOTENCY)
  @HttpCode(200)
  @RequireAnyPermission('production.material.issue', 'production.stage.update.any')
  wastage(@Param('id') id: string, @Body() dto: MaterialQtyDto, @CurrentUser() user: AuthUser, @IdempotencyKey() key?: string) {
    return this.production.consumeForLine(id, { ...dto, wastage: true, idempotencyKey: key }, user);
  }

  @Post('orders/:id/return-material')
  @ApiHeader(IDEMPOTENCY)
  @HttpCode(200)
  @RequirePermissions('production.material.issue')
  returnMaterial(@Param('id') id: string, @Body() dto: MaterialQtyDto, @CurrentUser() user: AuthUser, @IdempotencyKey() key?: string) {
    return this.production.returnMaterial(id, { ...dto, idempotencyKey: key }, user);
  }

  @Post('orders/:id/remarks')
  @HttpCode(200)
  @RequireAnyPermission('production.stage.update.own', 'production.stage.update.any')
  remark(@Param('id') id: string, @Body() dto: RemarkDto, @CurrentUser() user: AuthUser) {
    return this.production.addRemark(id, dto.message, dto.stageId, user);
  }

  @Post('orders/:id/cancel')
  @HttpCode(200)
  @RequirePermissions('production.cancel')
  cancel(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() user: AuthUser) {
    return this.production.cancel(id, dto.reason, user);
  }

  @Post('orders/:id/close')
  @HttpCode(200)
  @RequirePermissions('production.release')
  close(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.production.close(id, user);
  }

  @Post('stages/:stageId/start')
  @HttpCode(200)
  @RequireAnyPermission('production.stage.update.own', 'production.stage.update.any')
  start(@Param('stageId') id: string, @CurrentUser() user: AuthUser) {
    return this.production.startStage(id, user);
  }

  @Post('stages/:stageId/pause')
  @HttpCode(200)
  @RequireAnyPermission('production.stage.update.own', 'production.stage.update.any')
  pause(@Param('stageId') id: string, @Body() dto: OptionalReasonDto, @CurrentUser() user: AuthUser) {
    return this.production.pauseStage(id, dto.reason, user);
  }

  @Post('stages/:stageId/output')
  @ApiHeader(IDEMPOTENCY)
  @RequireAnyPermission('production.stage.update.own', 'production.stage.update.any')
  output(@Param('stageId') id: string, @Body() dto: OutputDto, @CurrentUser() user: AuthUser, @IdempotencyKey() key?: string) {
    return this.production.recordOutput(id, { ...dto, idempotencyKey: key }, user);
  }

  @Post('stages/:stageId/complete')
  @HttpCode(200)
  @RequireAnyPermission('production.stage.update.own', 'production.stage.update.any')
  complete(@Param('stageId') id: string, @Body() dto: OptionalReasonDto, @CurrentUser() user: AuthUser) {
    return this.production.completeStage(id, dto.reason, user);
  }

  @Post('stages/:stageId/skip')
  @HttpCode(200)
  @RequirePermissions('production.stage.update.any')
  skip(@Param('stageId') id: string, @Body() dto: ReasonDto, @CurrentUser() user: AuthUser) {
    return this.production.skipStage(id, dto.reason, user);
  }

  @Put('stages/:stageId/workers')
  @RequirePermissions('production.assign')
  assign(@Param('stageId') id: string, @Body() dto: AssignDto, @CurrentUser() user: AuthUser) {
    return this.production.assignWorkers(id, dto.workerIds, user);
  }

  @Put('stages/:stageId/workstation')
  @RequirePermissions('production.assign')
  workstation(@Param('stageId') id: string, @Body() dto: WorkstationDto, @CurrentUser() user: AuthUser) {
    return this.production.setWorkstation(id, dto.workstationId ?? null, user);
  }

  @Post('outputs/:outputId/reverse')
  @HttpCode(200)
  @RequirePermissions('production.reverse')
  reverse(@Param('outputId') id: string, @Body() dto: ReasonDto, @CurrentUser() user: AuthUser) {
    return this.production.reverseOutput(id, dto.reason, user);
  }
}
