import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InventoryTxType, ItemType, StockCountStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
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
  ValidateNested,
} from 'class-validator';
import { PageQueryDto } from '../../common/dto/pagination.dto';

export class QtyLineDto {
  @ApiProperty() @IsString() @IsNotEmpty() itemId: string;
  @ApiProperty({ description: 'Quantity in uomCode (defaults to item base unit)' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  quantity: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(10) uomCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() locationId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() batchId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) batchNumber?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) unitCost?: number;
}

class MovementBaseDto {
  @ApiProperty({ type: [QtyLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => QtyLineDto)
  lines: QtyLineDto[];

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) reason?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) remarks?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) referenceNumber?: string;
}

export class ReceiptDto extends MovementBaseDto {}
export class IssueDto extends MovementBaseDto {
  @ApiPropertyOptional() @IsOptional() @IsString() warehouseId?: string;
}
export class AdjustmentDto extends MovementBaseDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(300) declare reason: string;
}
export class TransferDto extends MovementBaseDto {
  @ApiProperty() @IsString() fromLocationId: string;
  @ApiProperty() @IsString() toLocationId: string;
}

export class ReverseDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(300) reason: string;
}

export class ManualReservationDto {
  @IsString() itemId: string;
  @Type(() => Number) @IsPositive() quantity: number;
  @IsOptional() @IsString() warehouseId?: string;
  @IsOptional() @IsString() @MaxLength(200) remarks?: string;
}

export class ReleaseDto {
  @IsOptional() @Type(() => Number) @IsPositive() quantity?: number;
}

export class StockQueryDto {
  @IsOptional() @IsEnum(ItemType) type?: ItemType;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsString() warehouseId?: string;
  @IsOptional() @IsString() productId?: string;
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() lowStockOnly?: boolean;
  @IsOptional() @Transform(({ value }) => (Array.isArray(value) ? value : String(value).split(',')).filter(Boolean)) @IsString({ each: true }) itemIds?: string[];
}

export class MovementQueryDto extends PageQueryDto {
  @IsOptional() @IsString() itemId?: string;
  @IsOptional() @IsString() locationId?: string;
  @IsOptional() @IsEnum(InventoryTxType) type?: InventoryTxType;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

export class ReservationQueryDto {
  @IsOptional() @IsString() itemId?: string;
  @IsOptional() @IsString() sourceType?: string;
  @IsOptional() @IsString() sourceId?: string;
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() openOnly?: boolean;
}

export class CreateStockCountDto {
  @IsString() warehouseId: string;
  @IsOptional() @IsString() locationId?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) @ArrayMaxSize(500) itemIds?: string[];
  @IsOptional() @IsString() @MaxLength(500) remarks?: string;
}

class CountLineDto {
  @IsString() lineId: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) countedQty: number;
  @IsOptional() @IsString() @MaxLength(200) remarks?: string;
}

export class RecordCountDto {
  @IsArray() @ArrayMaxSize(1000) @ValidateNested({ each: true }) @Type(() => CountLineDto) lines: CountLineDto[];
}

export class StockCountQueryDto extends PageQueryDto {
  @IsOptional() @IsEnum(StockCountStatus) status?: StockCountStatus;
}
