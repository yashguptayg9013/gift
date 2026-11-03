import { Body, Controller, Get, Global, HttpCode, Module, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InspectionStatus, InspectionType, QcCheckType, QcScope } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { PageQueryDto, pageArgs, toPage } from '../../common/dto/pagination.dto';
import { AuthUser } from '../../common/request-context';
import { QualityService } from './quality.service';

class DefectCategoryDto {
  @IsOptional() @IsString() @MaxLength(30) code?: string;
  @IsString() @IsNotEmpty() @MaxLength(100) name: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsEnum(QcScope) appliesTo?: QcScope;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class ChecklistItemDto {
  @IsString() @IsNotEmpty() @MaxLength(200) label: string;
  @IsOptional() @IsEnum(QcCheckType) type?: QcCheckType;
  @IsOptional() @Type(() => Number) @IsNumber() minValue?: number;
  @IsOptional() @Type(() => Number) @IsNumber() maxValue?: number;
  @IsOptional() @IsString() @MaxLength(10) unit?: string;
  @IsOptional() @IsBoolean() isRequired?: boolean;
}

class ChecklistDto {
  @IsString() @IsNotEmpty() @MaxLength(120) name: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsEnum(QcScope) appliesTo?: QcScope;
  @IsOptional() @IsString() itemId?: string;
  @IsOptional() @IsString() productId?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => ChecklistItemDto) items: ChecklistItemDto[];
}

class InspectionQueryDto extends PageQueryDto {
  @IsOptional() @IsEnum(InspectionStatus) status?: InspectionStatus;
  @IsOptional() @IsEnum(InspectionType) type?: InspectionType;
  @IsOptional() @IsString() itemId?: string;
  @IsOptional() @IsString() productionOrderId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

class CreateInspectionDto {
  @IsEnum(InspectionType) type: InspectionType;
  @IsString() itemId: string;
  @Type(() => Number) @IsPositive() quantity: number;
  @IsOptional() @IsString() productionOrderId?: string;
  @IsOptional() @IsString() inspectorId?: string;
  @IsOptional() @IsString() @MaxLength(1000) remarks?: string;
}

class ResultDto {
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

class CompleteDto {
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) quantityAccepted: number;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) quantityRejected: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) quantityRework?: number;
  @IsOptional() @IsString() @MaxLength(2000) remarks?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => ResultDto) results?: ResultDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => DefectDto) defects?: DefectDto[];
}

class AssignDto {
  @IsOptional() @IsString() inspectorId?: string;
}

class ReasonDto {
  @IsString() @IsNotEmpty() @MaxLength(500) reason: string;
}

class SummaryQueryDto {
  @IsDateString() from: string;
  @IsDateString() to: string;
  @IsOptional() @IsString() itemId?: string;
}

@ApiTags('quality')
@Controller('quality')
class QualityController {
  constructor(private readonly quality: QualityService) {}

  @Get('defect-categories')
  @RequirePermissions('quality.view')
  defects(@Query('includeInactive') inc?: string) {
    return this.quality.defectCategories(inc === 'true');
  }
  @Post('defect-categories')
  @RequirePermissions('quality.config.manage')
  createDefect(@Body() dto: DefectCategoryDto) {
    return this.quality.upsertDefectCategory(null, dto);
  }
  @Put('defect-categories/:id')
  @RequirePermissions('quality.config.manage')
  updateDefect(@Param('id') id: string, @Body() dto: DefectCategoryDto) {
    return this.quality.upsertDefectCategory(id, dto);
  }

  @Get('checklists')
  @RequirePermissions('quality.view')
  checklists() {
    return this.quality.checklists();
  }
  @Get('checklists/for-item/:itemId')
  @RequirePermissions('quality.view')
  checklistFor(@Param('itemId') itemId: string) {
    return this.quality.checklistFor(itemId);
  }
  @Post('checklists')
  @RequirePermissions('quality.config.manage')
  createChecklist(@Body() dto: ChecklistDto) {
    return this.quality.upsertChecklist(null, dto);
  }
  @Put('checklists/:id')
  @RequirePermissions('quality.config.manage')
  updateChecklist(@Param('id') id: string, @Body() dto: ChecklistDto) {
    return this.quality.upsertChecklist(id, dto);
  }

  @Get('inspections')
  @RequirePermissions('quality.view')
  async list(@Query() q: InspectionQueryDto) {
    const { rows, total } = await this.quality.list({ ...q, from: q.from ? new Date(q.from) : undefined, to: q.to ? new Date(q.to) : undefined, ...pageArgs(q) });
    return toPage(rows, total, q);
  }
  @Get('inspections/:id')
  @RequirePermissions('quality.view')
  get(@Param('id') id: string) {
    return this.quality.get(id);
  }
  @Post('inspections')
  @RequirePermissions('quality.inspect')
  create(@Body() dto: CreateInspectionDto, @CurrentUser() user: AuthUser) {
    return this.quality.createManual(dto, user);
  }
  @Put('inspections/:id/inspector')
  @RequirePermissions('quality.inspect')
  assign(@Param('id') id: string, @Body() dto: AssignDto) {
    return this.quality.assign(id, dto.inspectorId ?? null);
  }
  @Post('inspections/:id/start')
  @HttpCode(200)
  @RequirePermissions('quality.inspect')
  start(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.quality.start(id, user);
  }
  @Post('inspections/:id/complete')
  @HttpCode(200)
  @RequirePermissions('quality.inspect')
  complete(@Param('id') id: string, @Body() dto: CompleteDto, @CurrentUser() user: AuthUser) {
    return this.quality.complete(id, dto, user);
  }
  @Post('inspections/:id/cancel')
  @HttpCode(200)
  @RequirePermissions('quality.inspect')
  cancel(@Param('id') id: string, @Body() dto: ReasonDto) {
    return this.quality.cancel(id, dto.reason);
  }

  @Get('summary')
  @RequirePermissions('quality.view')
  summary(@Query() q: SummaryQueryDto) {
    return this.quality.summary({ from: new Date(q.from), to: new Date(q.to), itemId: q.itemId });
  }
}

@Global()
@Module({ controllers: [QualityController], providers: [QualityService], exports: [QualityService] })
export class QualityModule {}
