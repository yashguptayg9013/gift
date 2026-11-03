import { Body, Controller, Delete, Get, HttpCode, Module, Param, Patch, Post, Put, Query, Res } from '@nestjs/common';
import { ApiHeader, ApiProduces, ApiTags } from '@nestjs/swagger';
import { DocStatus, InquiryStatus, QuotationStatus, SalesOrderStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import type { Response } from 'express';
import { CurrentUser, IdempotencyKey, RequirePermissions } from '../../common/decorators';
import { PageQueryDto, pageArgs, toPage } from '../../common/dto/pagination.dto';
import { serialize } from '../../common/decimal';
import { AuthUser } from '../../common/request-context';
import { SalesDocumentsService } from './sales-documents.service';
import { SalesService } from './sales.service';

class ContactDto {
  @IsString() @IsNotEmpty() @MaxLength(120) name: string;
  @IsOptional() @IsString() @MaxLength(60) role?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
}

class CustomerDto {
  @IsOptional() @IsString() @MaxLength(20) code?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) companyName?: string;
  @IsOptional() @IsString() @MaxLength(120) contactPerson?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(500) billingAddress?: string;
  @IsOptional() @IsString() @MaxLength(500) shippingAddress?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsString() @MaxLength(100) state?: string;
  @IsOptional() @IsString() @MaxLength(10) pincode?: string;
  @IsOptional() @IsString() @MaxLength(15) gstin?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() @MaxLength(200) paymentTerms?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => ContactDto) contacts?: ContactDto[];
}

class CustomerQueryDto extends PageQueryDto {
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() includeInactive?: boolean;
}

class CategoryDto {
  @IsOptional() @IsString() @MaxLength(20) code?: string;
  @IsString() @IsNotEmpty() @MaxLength(60) name: string;
}

class PriceDto {
  @IsString() itemId: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) unitPrice: number;
  @IsOptional() @Type(() => Number) @Min(0) minQty?: number;
  @IsOptional() @IsDateString() validFrom?: string;
  @IsOptional() @IsDateString() validTo?: string;
}

class LineDto {
  @IsString() itemId: string;
  @Type(() => Number) @IsPositive() quantity: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) unitPrice?: number;
  @IsOptional() @Type(() => Number) @Min(0) @Max(100) discountPct?: number;
  @IsOptional() @Type(() => Number) @Min(0) @Max(100) taxRate?: number;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsOptional() @IsString() @MaxLength(300) remarks?: string;
}

class InquiryLineDto {
  @IsOptional() @IsString() itemId?: string;
  @IsString() @IsNotEmpty() @MaxLength(300) description: string;
  @Type(() => Number) @IsPositive() quantity: number;
  @IsOptional() @Type(() => Number) @Min(0) targetPrice?: number;
}

class InquiryDto {
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() @MaxLength(60) source?: string;
  @IsOptional() @IsDateString() receivedAt?: string;
  @IsOptional() @IsString() @MaxLength(4000) requirements?: string;
  @IsOptional() @IsString() assignedToId?: string;
  @IsOptional() @IsEnum(InquiryStatus) status?: InquiryStatus;
  @IsOptional() @IsString() @MaxLength(500) lostReason?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => InquiryLineDto) lines?: InquiryLineDto[];
}

class InquiryQueryDto extends PageQueryDto {
  @IsOptional() @IsEnum(InquiryStatus) status?: InquiryStatus;
  @IsOptional() @IsString() customerId?: string;
}

class QuotationDto {
  @IsString() customerId: string;
  @IsOptional() @IsString() inquiryId?: string;
  @IsOptional() @IsDateString() validUntil?: string;
  @IsOptional() @IsString() @MaxLength(4000) terms?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => LineDto) lines: LineDto[];
}

class QuotationUpdateDto {
  @IsOptional() @IsDateString() validUntil?: string;
  @IsOptional() @IsString() @MaxLength(4000) terms?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => LineDto) lines?: LineDto[];
}

class QuotationQueryDto extends PageQueryDto {
  @IsOptional() @IsEnum(QuotationStatus) status?: QuotationStatus;
  @IsOptional() @IsString() customerId?: string;
}

class StatusDto {
  @IsEnum(QuotationStatus) status: QuotationStatus;
}

class ConvertDto {
  @IsOptional() @IsDateString() requiredBy?: string;
  @IsOptional() @IsString() @MaxLength(60) customerPoNumber?: string;
  @IsOptional() @IsString() warehouseId?: string;
}

class OrderDto {
  @IsString() customerId: string;
  @IsOptional() @IsDateString() requiredBy?: string;
  @IsOptional() @IsString() @MaxLength(60) customerPoNumber?: string;
  @IsOptional() @IsString() warehouseId?: string;
  @IsOptional() @IsString() @MaxLength(2000) remarks?: string;
  @IsOptional() @IsBoolean() confirm?: boolean;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => LineDto) lines: LineDto[];
}

class OrderUpdateDto {
  @IsOptional() @IsDateString() requiredBy?: string;
  @IsOptional() @IsString() @MaxLength(60) customerPoNumber?: string;
  @IsOptional() @IsString() @MaxLength(2000) remarks?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => LineDto) lines?: LineDto[];
}

class OrderQueryDto extends PageQueryDto {
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : String(value).split(',')).filter(Boolean))
  @IsEnum(SalesOrderStatus, { each: true })
  status?: SalesOrderStatus[];
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

class ReasonDto {
  @IsString() @IsNotEmpty() @MaxLength(500) reason: string;
}

class PlanDto {
  @IsOptional() @IsArray() @IsString({ each: true }) lineIds?: string[];
  @IsOptional() @IsDateString() dueDate?: string;
}

class ChallanLineDto {
  @IsString() salesOrderLineId: string;
  @Type(() => Number) @IsPositive() quantity: number;
  @IsOptional() @IsString() locationId?: string;
  @IsOptional() @IsString() batchId?: string;
}

class ChallanDto {
  @IsString() salesOrderId: string;
  @IsOptional() @IsDateString() challanDate?: string;
  @IsOptional() @IsString() @MaxLength(30) vehicleNo?: string;
  @IsOptional() @IsString() @MaxLength(120) transporter?: string;
  @IsOptional() @IsString() @MaxLength(1000) remarks?: string;
  @IsOptional() @IsBoolean() post?: boolean;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => ChallanLineDto) lines: ChallanLineDto[];
}

class ChallanQueryDto extends PageQueryDto {
  @IsOptional() @IsString() salesOrderId?: string;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsEnum(DocStatus) status?: DocStatus;
}

class PriceQueryDto {
  @IsString() customerId: string;
  @IsString() itemId: string;
  @Type(() => Number) @IsPositive() quantity: number;
}

function sendPdf(res: Response, file: { filename: string; pdf: Buffer }, download: boolean) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${file.filename}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(file.pdf);
}

@ApiTags('sales')
@Controller()
class SalesController {
  constructor(
    private readonly sales: SalesService,
    private readonly docs: SalesDocumentsService,
  ) {}

  // customers
  @Get('customers')
  @RequirePermissions('sales.view')
  async customers(@Query() q: CustomerQueryDto) {
    const { rows, total } = await this.sales.customers({ ...q, ...pageArgs(q) });
    return toPage(rows, total, q);
  }
  @Get('customers/categories')
  @RequirePermissions('sales.view')
  categories() {
    return this.sales.customerCategories();
  }
  @Post('customers/categories')
  @RequirePermissions('sales.customer.manage')
  createCategory(@Body() dto: CategoryDto) {
    return this.sales.upsertCustomerCategory(null, dto);
  }
  @Put('customers/categories/:id')
  @RequirePermissions('sales.customer.manage')
  updateCategory(@Param('id') id: string, @Body() dto: CategoryDto) {
    return this.sales.upsertCustomerCategory(id, dto);
  }
  @Get('customers/:id')
  @RequirePermissions('sales.view')
  customer(@Param('id') id: string) {
    return this.sales.customer(id);
  }
  @Post('customers')
  @RequirePermissions('sales.customer.manage')
  createCustomer(@Body() dto: CustomerDto, @CurrentUser() u: AuthUser) {
    return this.sales.upsertCustomer(null, dto, u);
  }
  @Patch('customers/:id')
  @RequirePermissions('sales.customer.manage')
  updateCustomer(@Param('id') id: string, @Body() dto: CustomerDto, @CurrentUser() u: AuthUser) {
    return this.sales.upsertCustomer(id, dto, u);
  }
  @Post('customers/:id/prices')
  @RequirePermissions('sales.customer.manage')
  setPrice(@Param('id') id: string, @Body() dto: PriceDto, @CurrentUser() u: AuthUser) {
    return this.sales.setCustomerPrice(id, dto, u);
  }
  @Delete('customers/:id/prices/:priceId')
  @HttpCode(204)
  @RequirePermissions('sales.customer.manage')
  deletePrice(@Param('priceId') priceId: string) {
    return this.sales.deleteCustomerPrice(priceId);
  }
  @Get('sales/price')
  @RequirePermissions('sales.view')
  async price(@Query() q: PriceQueryDto) {
    return serialize(await this.sales.resolvePrice(q.customerId, q.itemId, q.quantity));
  }

  // inquiries
  @Get('sales/inquiries')
  @RequirePermissions('sales.view')
  async inquiries(@Query() q: InquiryQueryDto) {
    const { rows, total } = await this.sales.inquiries({ ...q, ...pageArgs(q) });
    return toPage(rows, total, q);
  }
  @Get('sales/inquiries/:id')
  @RequirePermissions('sales.view')
  inquiry(@Param('id') id: string) {
    return this.sales.inquiry(id);
  }
  @Post('sales/inquiries')
  @RequirePermissions('sales.inquiry.manage')
  createInquiry(@Body() dto: InquiryDto, @CurrentUser() u: AuthUser) {
    return this.sales.upsertInquiry(null, dto, u);
  }
  @Patch('sales/inquiries/:id')
  @RequirePermissions('sales.inquiry.manage')
  updateInquiry(@Param('id') id: string, @Body() dto: InquiryDto, @CurrentUser() u: AuthUser) {
    return this.sales.upsertInquiry(id, dto, u);
  }

  // quotations
  @Get('sales/quotations')
  @RequirePermissions('sales.view')
  async quotations(@Query() q: QuotationQueryDto) {
    const { rows, total } = await this.sales.quotations({ ...q, ...pageArgs(q) });
    return toPage(rows, total, q);
  }
  @Get('sales/quotations/:id')
  @RequirePermissions('sales.view')
  quotation(@Param('id') id: string) {
    return this.sales.quotation(id);
  }
  @Get('sales/quotations/:id/pdf')
  @ApiProduces('application/pdf')
  @RequirePermissions('sales.view')
  async quotationPdf(@Param('id') id: string, @Query('download') download: string, @Res() res: Response) {
    sendPdf(res, await this.docs.quotationPdf(id), download === 'true');
  }
  @Post('sales/quotations')
  @RequirePermissions('sales.quotation.manage')
  createQuotation(@Body() dto: QuotationDto, @CurrentUser() u: AuthUser) {
    return this.sales.createQuotation(dto, u);
  }
  @Patch('sales/quotations/:id')
  @RequirePermissions('sales.quotation.manage')
  updateQuotation(@Param('id') id: string, @Body() dto: QuotationUpdateDto) {
    return this.sales.updateQuotation(id, dto);
  }
  @Post('sales/quotations/:id/status')
  @HttpCode(200)
  @RequirePermissions('sales.quotation.manage')
  quotationStatus(@Param('id') id: string, @Body() dto: StatusDto) {
    return this.sales.setQuotationStatus(id, dto.status);
  }
  @Post('sales/quotations/:id/convert')
  @RequirePermissions('sales.order.manage')
  convert(@Param('id') id: string, @Body() dto: ConvertDto, @CurrentUser() u: AuthUser) {
    return this.sales.convertQuotation(id, dto, u);
  }

  // orders
  @Get('sales/orders')
  @RequirePermissions('sales.view')
  async orders(@Query() q: OrderQueryDto) {
    const { rows, total } = await this.sales.orders({ ...q, from: q.from ? new Date(q.from) : undefined, to: q.to ? new Date(q.to) : undefined, ...pageArgs(q) });
    return toPage(rows, total, q);
  }
  @Get('sales/orders/:id')
  @RequirePermissions('sales.view')
  order(@Param('id') id: string) {
    return this.sales.order(id);
  }
  @Post('sales/orders')
  @RequirePermissions('sales.order.manage')
  createOrder(@Body() dto: OrderDto, @CurrentUser() u: AuthUser) {
    return this.sales.createOrder(dto, u);
  }
  @Patch('sales/orders/:id')
  @RequirePermissions('sales.order.manage')
  updateOrder(@Param('id') id: string, @Body() dto: OrderUpdateDto, @CurrentUser() u: AuthUser) {
    return this.sales.updateOrder(id, dto, u);
  }
  @Post('sales/orders/:id/confirm')
  @HttpCode(200)
  @RequirePermissions('sales.order.manage')
  confirm(@Param('id') id: string, @CurrentUser() u: AuthUser) {
    return this.sales.confirmOrder(id, u);
  }
  @Post('sales/orders/:id/reserve')
  @HttpCode(200)
  @RequirePermissions('sales.order.manage')
  reserve(@Param('id') id: string, @CurrentUser() u: AuthUser) {
    return this.sales.reserveStock(id, u);
  }
  @Post('sales/orders/:id/release')
  @HttpCode(200)
  @RequirePermissions('sales.order.manage')
  release(@Param('id') id: string, @CurrentUser() u: AuthUser) {
    return this.sales.releaseStock(id, u);
  }
  @Post('sales/orders/:id/plan-production')
  @RequirePermissions('sales.order.manage', 'production.create')
  plan(@Param('id') id: string, @Body() dto: PlanDto, @CurrentUser() u: AuthUser) {
    return this.sales.planProduction(id, dto, u);
  }
  @Post('sales/orders/:id/cancel')
  @HttpCode(200)
  @RequirePermissions('sales.order.cancel')
  cancel(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() u: AuthUser) {
    return this.sales.cancelOrder(id, dto.reason, u);
  }
  @Post('sales/orders/:id/close')
  @HttpCode(200)
  @RequirePermissions('sales.order.manage')
  close(@Param('id') id: string, @CurrentUser() u: AuthUser) {
    return this.sales.closeOrder(id, u);
  }

  // challans
  @Get('sales/challans')
  @RequirePermissions('sales.view')
  async challans(@Query() q: ChallanQueryDto) {
    const { rows, total } = await this.sales.challans({ ...q, ...pageArgs(q) });
    return toPage(rows, total, q);
  }
  @Get('sales/challans/:id')
  @RequirePermissions('sales.view')
  challan(@Param('id') id: string) {
    return this.sales.challan(id);
  }
  @Get('sales/challans/:id/pdf')
  @ApiProduces('application/pdf')
  @RequirePermissions('sales.view')
  async challanPdf(@Param('id') id: string, @Query('download') download: string, @Res() res: Response) {
    sendPdf(res, await this.docs.challanPdf(id), download === 'true');
  }
  @Post('sales/challans')
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @RequirePermissions('sales.challan.manage')
  createChallan(@Body() dto: ChallanDto, @CurrentUser() u: AuthUser, @IdempotencyKey() key?: string) {
    return this.sales.createChallan(dto, u, key);
  }
  @Post('sales/challans/:id/post')
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @HttpCode(200)
  @RequirePermissions('sales.challan.manage')
  postChallan(@Param('id') id: string, @CurrentUser() u: AuthUser, @IdempotencyKey() key?: string) {
    return this.sales.postChallan(id, u, key);
  }
  @Post('sales/challans/:id/cancel')
  @HttpCode(200)
  @RequirePermissions('sales.challan.manage')
  cancelChallan(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() u: AuthUser) {
    return this.sales.cancelChallan(id, dto.reason, u);
  }
}

@Module({ controllers: [SalesController], providers: [SalesService, SalesDocumentsService], exports: [SalesService] })
export class SalesModule {}
