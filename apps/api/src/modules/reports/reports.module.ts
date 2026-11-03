import { Controller, Get, Global, Module, Param, Query, Res } from '@nestjs/common';
import { ApiProduces, ApiTags } from '@nestjs/swagger';
import { ItemType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import type { Response } from 'express';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { Errors } from '../../common/errors';
import { AuthUser, hasPermission } from '../../common/request-context';
import { AuditService } from '../audit/audit.service';
import { DashboardService } from './dashboard.service';
import { ReportsService } from './reports.service';

class RangeDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

class ReportQueryDto extends RangeDto {
  @IsOptional() @IsString() itemId?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsEnum(ItemType) itemType?: ItemType;
  @IsOptional() @IsString() supplierId?: string;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) limit?: number;
  @IsOptional() @IsIn(['json', 'csv', 'xlsx', 'pdf']) format?: 'json' | 'csv' | 'xlsx' | 'pdf';
}

function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

@ApiTags('reports')
@Controller()
class ReportsController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly reports: ReportsService,
    private readonly audit: AuditService,
  ) {}

  @Get('dashboard')
  @RequirePermissions('dashboard.view')
  get(@Query() q: RangeDto) {
    const to = q.to ? new Date(q.to) : new Date();
    const from = q.from ? new Date(q.from) : startOfMonth();
    if (from > to) throw Errors.validation('"from" must be before "to"');
    if (to.getTime() - from.getTime() > 400 * 86_400_000) throw Errors.validation('Date range is limited to 400 days');
    return this.dashboard.get(from, to);
  }

  @Get('reports')
  catalog(@CurrentUser() user: AuthUser) {
    return this.reports.catalog(user);
  }

  @Get('reports/:key')
  @ApiProduces('application/json', 'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/pdf')
  async run(@Param('key') key: string, @Query() q: ReportQueryDto, @CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    const result = await this.reports.run(key, { ...q, from: q.from ? new Date(q.from) : undefined, to: q.to ? new Date(q.to) : undefined }, user);
    const format = q.format ?? 'json';
    if (format === 'json') return result;
    if (!hasPermission(user, 'reports.export')) throw Errors.forbidden('Missing permission: reports.export');
    await this.audit.record({ action: 'report.exported', entityType: 'Report', entityId: key, metadata: { format, params: q, rows: result.rows.length } });
    const stamp = new Date().toISOString().slice(0, 10);
    const send = (buf: Buffer, type: string, ext: string) => {
      res.setHeader('Content-Type', type);
      res.setHeader('Content-Disposition', `attachment; filename="${key}-${stamp}.${ext}"`);
      res.setHeader('Cache-Control', 'private, no-store');
      res.end(buf);
    };
    if (format === 'csv') send(this.reports.toCsv(result), 'text/csv; charset=utf-8', 'csv');
    else if (format === 'xlsx') send(await this.reports.toXlsx(result), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx');
    else send(await this.reports.toPdf(result), 'application/pdf', 'pdf');
  }
}

@Global()
@Module({ controllers: [ReportsController], providers: [DashboardService, ReportsService], exports: [DashboardService, ReportsService] })
export class ReportsModule {}
