import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ItemType, LocationType, ProductStatus, UomDimension } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
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
import { CurrentUser, RequireAnyPermission, RequirePermissions } from '../../common/decorators';
import { PageQueryDto, orderBy, pageArgs, toPage } from '../../common/dto/pagination.dto';
import { AuthUser, hasPermission } from '../../common/request-context';
import { CatalogService } from './catalog.service';
import { Errors } from '../../common/errors';

class ConversionDto {
  @IsString() @MaxLength(10) uomCode: string;
  @Type(() => Number) @IsPositive() factorToBase: number;
}

export class ItemDto {
  @IsOptional() @IsEnum(ItemType) type?: ItemType;
  @IsOptional() @IsString() @MaxLength(40) code?: string;
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() @MaxLength(10) uomCode?: string;
  @IsOptional() @IsObject() attributes?: Record<string, unknown>;
  @IsOptional() @IsString() @MaxLength(4000) specifications?: string;
  @IsOptional() @IsString() @MaxLength(60) colour?: string;
  @IsOptional() @IsString() @MaxLength(100) dimensions?: string;
  @IsOptional() @IsString() productId?: string;
  @IsOptional() @IsString() @MaxLength(100) variantName?: string;
  @IsOptional() @IsString() routeId?: string;
  @IsOptional() @IsEnum(ProductStatus) status?: ProductStatus;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minStock?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) reorderLevel?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) reorderQty?: number;
  @IsOptional() @IsBoolean() trackBatches?: boolean;
  @IsOptional() @IsBoolean() requiresInspection?: boolean;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) standardCost?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) sellingPrice?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) taxRate?: number;
  @IsOptional() @IsString() @MaxLength(12) hsnCode?: string;
  @IsOptional() @IsString() defaultSupplierId?: string;
  @IsOptional() @IsString() defaultLocationId?: string;
  @IsOptional() @IsString() imageFileId?: string;
  @IsOptional() @IsString() @MaxLength(1000) remarks?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => ConversionDto) conversions?: ConversionDto[];
}

class ItemQueryDto extends PageQueryDto {
  @IsOptional() @IsEnum(ItemType) type?: ItemType;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() productId?: string;
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() includeInactive?: boolean;
}

class CategoryDto {
  @IsOptional() @IsEnum(ItemType) type?: ItemType;
  @IsOptional() @IsString() @MaxLength(40) code?: string;
  @IsString() @IsNotEmpty() @MaxLength(100) name: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(30) attributeSchema?: unknown[];
  @IsOptional() @IsString() defaultUomCode?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() parentId?: string;
}

class UomDto {
  @IsString() @MaxLength(10) code: string;
  @IsString() @MaxLength(40) name: string;
  @IsEnum(UomDimension) dimension: UomDimension;
  @Type(() => Number) @IsInt() @Min(0) @Max(6) precision: number;
}

class WarehouseDto {
  @IsOptional() @IsString() @MaxLength(20) code?: string;
  @IsString() @MaxLength(100) name: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() allowNegativeStock?: boolean;
}

class LocationDto {
  @IsOptional() @IsString() warehouseId?: string;
  @IsOptional() @IsString() @MaxLength(20) code?: string;
  @IsString() @MaxLength(100) name: string;
  @IsOptional() @IsEnum(LocationType) type?: LocationType;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

class ProductDto {
  @IsOptional() @IsString() @MaxLength(40) code?: string;
  @IsString() @MaxLength(200) name: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsString() @MaxLength(4000) manufacturingSpecs?: string;
  @IsOptional() @IsString() imageFileId?: string;
  @IsOptional() @IsEnum(ProductStatus) status?: ProductStatus;
  @IsOptional() @IsString() defaultRouteId?: string;
}

class ProductQueryDto extends PageQueryDto {
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsEnum(ProductStatus) status?: ProductStatus;
}

class VariantDto {
  @IsString() @MaxLength(100) variantName: string;
  @IsString() @MaxLength(40) code: string;
  @IsOptional() @IsString() @MaxLength(60) colour?: string;
  @IsOptional() @IsObject() attributes?: Record<string, unknown>;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) sellingPrice?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) taxRate?: number;
  @IsOptional() @IsString() @MaxLength(12) hsnCode?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minStock?: number;
}

class VariantsDto {
  @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => VariantDto) variants: VariantDto[];
}

@ApiTags('catalog')
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('uoms')
  uoms() {
    return this.catalog.uoms();
  }

  @Post('uoms')
  @RequirePermissions('inventory.item.manage')
  createUom(@Body() dto: UomDto) {
    return this.catalog.createUom(dto);
  }

  @Get('categories')
  categories(@Query('type') type?: ItemType) {
    return this.catalog.categories(type && Object.values(ItemType).includes(type) ? type : undefined);
  }

  @Post('categories')
  @RequireAnyPermission('inventory.item.manage', 'product.manage')
  createCategory(@Body() dto: CategoryDto) {
    return this.catalog.upsertCategory(null, dto);
  }

  @Put('categories/:id')
  @RequireAnyPermission('inventory.item.manage', 'product.manage')
  updateCategory(@Param('id') id: string, @Body() dto: CategoryDto) {
    return this.catalog.upsertCategory(id, dto);
  }

  @Get('warehouses')
  warehouses() {
    return this.catalog.warehouses();
  }

  @Post('warehouses')
  @RequirePermissions('inventory.location.manage')
  createWarehouse(@Body() dto: WarehouseDto) {
    return this.catalog.upsertWarehouse(null, dto);
  }

  @Put('warehouses/:id')
  @RequirePermissions('inventory.location.manage')
  updateWarehouse(@Param('id') id: string, @Body() dto: WarehouseDto) {
    return this.catalog.upsertWarehouse(id, dto);
  }

  @Post('locations')
  @RequirePermissions('inventory.location.manage')
  createLocation(@Body() dto: LocationDto) {
    return this.catalog.upsertLocation(null, dto);
  }

  @Put('locations/:id')
  @RequirePermissions('inventory.location.manage')
  updateLocation(@Param('id') id: string, @Body() dto: LocationDto) {
    return this.catalog.upsertLocation(id, dto);
  }

  @Get('items')
  @RequireAnyPermission('inventory.view', 'product.view', 'sales.view', 'procurement.view', 'bom.view')
  async items(@Query() q: ItemQueryDto) {
    const { rows, total } = await this.catalog.listItems({ ...q, ...pageArgs(q), orderBy: orderBy(q, ['code', 'name', 'createdAt', 'updatedAt'], { code: 'asc' }) });
    return toPage(rows, total, q);
  }

  @Get('items/:id')
  @RequireAnyPermission('inventory.view', 'product.view', 'sales.view', 'procurement.view', 'bom.view')
  item(@Param('id') id: string) {
    return this.catalog.getItem(id);
  }

  @Post('items')
  @RequireAnyPermission('inventory.item.manage', 'product.manage')
  createItem(@Body() dto: ItemDto, @CurrentUser() user: AuthUser) {
    if (dto.type === ItemType.PRODUCT && !hasPermission(user, 'product.manage')) return this.forbidden('product.manage');
    if (dto.type === ItemType.MATERIAL && !hasPermission(user, 'inventory.item.manage')) return this.forbidden('inventory.item.manage');
    return this.catalog.createItem(dto, user);
  }

  @Patch('items/:id')
  @RequireAnyPermission('inventory.item.manage', 'product.manage')
  async updateItem(@Param('id') id: string, @Body() dto: ItemDto, @CurrentUser() user: AuthUser) {
    const item = await this.catalog.getItem(id);
    const needed = item.type === ItemType.PRODUCT ? 'product.manage' : 'inventory.item.manage';
    if (!hasPermission(user, needed)) return this.forbidden(needed);
    return this.catalog.updateItem(id, { ...dto, type: undefined, code: undefined }, user);
  }

  private forbidden(p: string): never {
    throw Errors.forbidden(`Missing permission: ${p}`);
  }

  @Get('products')
  @RequireAnyPermission('product.view', 'inventory.view', 'sales.view')
  async products(@Query() q: ProductQueryDto) {
    const { rows, total } = await this.catalog.listProducts({ ...q, ...pageArgs(q) });
    return toPage(rows, total, q);
  }

  @Get('products/:id')
  @RequireAnyPermission('product.view', 'inventory.view', 'sales.view')
  product(@Param('id') id: string) {
    return this.catalog.getProduct(id);
  }

  @Post('products')
  @RequirePermissions('product.manage')
  createProduct(@Body() dto: ProductDto, @CurrentUser() user: AuthUser) {
    return this.catalog.upsertProduct(null, dto, user);
  }

  @Put('products/:id')
  @RequirePermissions('product.manage')
  updateProduct(@Param('id') id: string, @Body() dto: ProductDto, @CurrentUser() user: AuthUser) {
    return this.catalog.upsertProduct(id, dto, user);
  }

  @Post('products/:id/variants')
  @RequirePermissions('product.manage')
  variants(@Param('id') id: string, @Body() dto: VariantsDto, @CurrentUser() user: AuthUser) {
    return this.catalog.createVariants(id, dto.variants, user);
  }

  @Get('search')
  search(@Query('q') q: string, @CurrentUser() user: AuthUser) {
    return this.catalog.globalSearch(String(q ?? '').slice(0, 100), (p) => hasPermission(user, p));
  }
}
