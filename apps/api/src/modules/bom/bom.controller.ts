import { Body, Controller, Get, Module, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConsumptionMode } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
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
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { PageQueryDto, pageArgs, toPage } from '../../common/dto/pagination.dto';
import { serialize } from '../../common/decimal';
import { AuthUser } from '../../common/request-context';
import { BomService } from './bom.service';

class AlternativeDto {
  @IsString() materialId: string;
  @IsOptional() @Type(() => Number) @IsPositive() conversionFactor?: number;
  @IsOptional() @Type(() => Number) @Min(1) priority?: number;
  @IsOptional() @IsString() @MaxLength(200) notes?: string;
}

class BomLineDto {
  @IsString() materialId: string;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 6 }) @Min(0) quantity?: number;
  @IsOptional() @IsString() @MaxLength(500) quantityFormula?: string;
  @IsOptional() @IsString() @MaxLength(10) uomCode?: string;
  @IsOptional() @Type(() => Number) @Min(0) @Max(100) wastagePercent?: number;
  @IsOptional() @IsString() stageDefinitionId?: string;
  @IsOptional() @IsEnum(ConsumptionMode) consumptionMode?: ConsumptionMode;
  @IsOptional() @IsString() @MaxLength(1000) specifications?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
  @IsOptional() @IsBoolean() isOptional?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => AlternativeDto) alternatives?: AlternativeDto[];
}

class VersionDto {
  @IsOptional() @Type(() => Number) @IsPositive() outputQuantity?: number;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => BomLineDto) lines: BomLineDto[];
}

class CreateBomDto extends VersionDto {
  @IsString() itemId: string;
  @IsOptional() @IsString() @MaxLength(200) name?: string;
}

class NewVersionDto {
  @IsOptional() @IsString() copyFromVersionId?: string;
  @IsOptional() @Type(() => Number) @IsPositive() outputQuantity?: number;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => BomLineDto) lines?: BomLineDto[];
}

class SubstitutionDto {
  @IsString() fromMaterialId: string;
  @IsString() toMaterialId: string;
}

class DuplicateDto {
  @IsOptional() @IsString() targetItemId?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => SubstitutionDto) substitutions?: SubstitutionDto[];
}

class RequirementsDto {
  @Type(() => Number) @IsPositive() quantity: number;
  @IsOptional() @IsString() warehouseId?: string;
  @IsOptional() @IsObject() parameters?: Record<string, number>;
}

@ApiTags('bom')
@Controller('boms')
export class BomController {
  constructor(private readonly boms: BomService) {}

  @Get()
  @RequirePermissions('bom.view')
  async list(@Query() q: PageQueryDto) {
    const { rows, total } = await this.boms.list({ ...q, ...pageArgs(q) });
    return toPage(rows, total, q);
  }

  @Get('by-item/:itemId')
  @RequirePermissions('bom.view')
  byItem(@Param('itemId') itemId: string) {
    return this.boms.getByItem(itemId);
  }

  @Get('compare')
  @RequirePermissions('bom.view')
  compare(@Query('a') a: string, @Query('b') b: string) {
    return this.boms.compare(a, b);
  }

  @Get('versions/:versionId')
  @RequirePermissions('bom.view')
  async version(@Param('versionId') id: string) {
    return serialize(await this.boms.getVersion(id));
  }

  @Get(':id')
  @RequirePermissions('bom.view')
  get(@Param('id') id: string) {
    return this.boms.get(id);
  }

  @Post()
  @RequirePermissions('bom.manage')
  create(@Body() dto: CreateBomDto, @CurrentUser() user: AuthUser) {
    return this.boms.create(dto, user);
  }

  @Post(':id/versions')
  @RequirePermissions('bom.manage')
  newVersion(@Param('id') id: string, @Body() dto: NewVersionDto, @CurrentUser() user: AuthUser) {
    return this.boms.createVersion(id, dto, user);
  }

  @Put('versions/:versionId')
  @RequirePermissions('bom.manage')
  updateDraft(@Param('versionId') id: string, @Body() dto: VersionDto) {
    return this.boms.updateDraft(id, dto);
  }

  @Post('versions/:versionId/activate')
  @RequirePermissions('bom.activate')
  activate(@Param('versionId') id: string, @CurrentUser() user: AuthUser) {
    return this.boms.activate(id, user);
  }

  @Post('versions/:versionId/archive')
  @RequirePermissions('bom.activate')
  archive(@Param('versionId') id: string) {
    return this.boms.archive(id);
  }

  @Post('versions/:versionId/duplicate')
  @RequirePermissions('bom.manage')
  duplicate(@Param('versionId') id: string, @Body() dto: DuplicateDto, @CurrentUser() user: AuthUser) {
    return this.boms.duplicate(id, dto, user);
  }

  @Post('versions/:versionId/requirements')
  @RequirePermissions('bom.view')
  async requirements(@Param('versionId') id: string, @Body() dto: RequirementsDto) {
    return serialize(await this.boms.computeRequirements(id, dto.quantity, { warehouseId: dto.warehouseId, parameters: dto.parameters }));
  }
}

@Module({ controllers: [BomController], providers: [BomService], exports: [BomService] })
export class BomModule {}
