import { Body, Controller, Get, Global, HttpCode, Module, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApprovalStatus, ApprovalType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators';
import { PageQueryDto, pageArgs, toPage } from '../../common/dto/pagination.dto';
import { AuthUser } from '../../common/request-context';
import { ApprovalsService } from './approvals.service';

class ApprovalQueryDto extends PageQueryDto {
  @IsOptional() @IsEnum(ApprovalStatus) status?: ApprovalStatus;
  @IsOptional() @IsEnum(ApprovalType) type?: ApprovalType;
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() mine?: boolean;
}

class DecisionDto {
  @IsIn(['approve', 'reject']) decision: 'approve' | 'reject';
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

@ApiTags('approvals')
@Controller('approvals')
class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get()
  async list(@Query() q: ApprovalQueryDto, @CurrentUser() user: AuthUser) {
    const { rows, total } = await this.approvals.list({ ...q, user, ...pageArgs(q) });
    return toPage(rows, total, q);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.approvals.get(id, user);
  }

  @Post(':id/decision')
  @HttpCode(200)
  decide(@Param('id') id: string, @Body() dto: DecisionDto, @CurrentUser() user: AuthUser) {
    return this.approvals.decide(id, dto.decision, user, dto.note);
  }

  @Post(':id/cancel')
  @HttpCode(204)
  cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.approvals.cancel(id, user);
  }
}

@Global()
@Module({ controllers: [ApprovalsController], providers: [ApprovalsService], exports: [ApprovalsService] })
export class ApprovalsModule {}
