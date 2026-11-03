import { Body, Controller, Get, Module, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AttendanceStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CurrentUser, RequireAnyPermission, RequirePermissions } from '../../common/decorators';
import { PageQueryDto, pageArgs, toPage } from '../../common/dto/pagination.dto';
import { AuthUser } from '../../common/request-context';
import { WorkforceService } from './workforce.service';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

class WorkerDto {
  @IsOptional() @IsString() @MaxLength(20) code?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsString() @MaxLength(60) jobRole?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) skills?: string[];
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @Matches(DATE) joinedOn?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

class WorkerQueryDto extends PageQueryDto {
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() includeInactive?: boolean;
}

class AttendanceEntryDto {
  @IsString() workerId: string;
  @IsEnum(AttendanceStatus) status: AttendanceStatus;
  @IsOptional() @IsDateString() checkIn?: string;
  @IsOptional() @IsDateString() checkOut?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(24) hoursWorked?: number;
  @IsOptional() @IsString() @MaxLength(300) remarks?: string;
}

class AttendanceDto {
  @Matches(DATE) date: string;
  @IsArray() @ArrayMaxSize(1000) @ValidateNested({ each: true }) @Type(() => AttendanceEntryDto) entries: AttendanceEntryDto[];
}

class AttendanceQueryDto {
  @IsOptional() @Matches(DATE) date?: string;
  @IsOptional() @Matches(DATE) from?: string;
  @IsOptional() @Matches(DATE) to?: string;
  @IsOptional() @IsString() workerId?: string;
}

class ProductivityQueryDto {
  @IsDateString() from: string;
  @IsDateString() to: string;
  @IsOptional() @IsString() workerId?: string;
  @IsOptional() @IsString() departmentId?: string;
}

@ApiTags('workforce')
@Controller('workforce')
class WorkforceController {
  constructor(private readonly workforce: WorkforceService) {}

  @Get('workers')
  @RequireAnyPermission('workforce.view', 'production.assign')
  async list(@Query() q: WorkerQueryDto) {
    const { rows, total } = await this.workforce.list({ ...q, ...pageArgs(q) });
    return toPage(rows, total, q);
  }

  @Get('workers/:id')
  @RequirePermissions('workforce.view')
  get(@Param('id') id: string) {
    return this.workforce.get(id);
  }

  @Post('workers')
  @RequirePermissions('workforce.manage')
  create(@Body() dto: WorkerDto, @CurrentUser() user: AuthUser) {
    return this.workforce.upsert(null, dto, user);
  }

  @Patch('workers/:id')
  @RequirePermissions('workforce.manage')
  update(@Param('id') id: string, @Body() dto: WorkerDto, @CurrentUser() user: AuthUser) {
    return this.workforce.upsert(id, { ...dto, code: undefined }, user);
  }

  @Get('workers/:id/daily')
  @RequirePermissions('workforce.view')
  daily(@Param('id') id: string, @Query() q: ProductivityQueryDto) {
    return this.workforce.workerDaily(id, new Date(q.from), new Date(q.to));
  }

  @Get('attendance')
  @RequireAnyPermission('workforce.view', 'workforce.attendance')
  attendance(@Query() q: AttendanceQueryDto) {
    return this.workforce.attendance(q);
  }

  @Get('attendance/day/:date')
  @RequireAnyPermission('workforce.view', 'workforce.attendance')
  daySheet(@Param('date') date: string) {
    return this.workforce.daySheet(date);
  }

  @Put('attendance')
  @RequirePermissions('workforce.attendance')
  record(@Body() dto: AttendanceDto, @CurrentUser() user: AuthUser) {
    return this.workforce.recordAttendance(dto.date, dto.entries, user);
  }

  @Get('productivity')
  @RequireAnyPermission('workforce.view', 'reports.manufacturing')
  productivity(@Query() q: ProductivityQueryDto) {
    return this.workforce.productivity({ ...q, from: new Date(q.from), to: new Date(q.to) });
  }
}

@Module({ controllers: [WorkforceController], providers: [WorkforceService], exports: [WorkforceService] })
export class WorkforceModule {}
