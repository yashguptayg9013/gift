import { Body, Controller, Get, Global, HttpCode, Module, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, ValidateNested } from 'class-validator';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { PageQueryDto, pageArgs, toPage } from '../../common/dto/pagination.dto';
import { AuthUser } from '../../common/request-context';
import { AuditService } from '../audit/audit.service';
import { DeliveryService } from './delivery.service';
import { JOB_NAMES, JobName, JobsService } from './jobs.service';
import { NotificationsService } from './notifications.service';

class NotificationQueryDto extends PageQueryDto {
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() unreadOnly?: boolean;
}

class PreferenceDto {
  @IsString() type: string;
  @IsBoolean() inApp: boolean;
  @IsBoolean() email: boolean;
  @IsBoolean() whatsapp: boolean;
}

class PreferencesDto {
  @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => PreferenceDto) preferences: PreferenceDto[];
}

class RunJobParams {
  @IsIn(JOB_NAMES as unknown as string[]) name: JobName;
}

@ApiTags('notifications')
@Controller()
class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly jobs: JobsService,
    private readonly audit: AuditService,
  ) {}

  @Get('notifications')
  async list(@Query() q: NotificationQueryDto, @CurrentUser() user: AuthUser) {
    const { rows, total } = await this.notifications.list(user, { ...q, ...pageArgs(q) });
    return toPage(rows, total, q);
  }

  @Get('notifications/unread-count')
  unread(@CurrentUser() user: AuthUser) {
    return this.notifications.unreadCount(user);
  }

  @Post('notifications/read-all')
  @HttpCode(200)
  readAll(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user);
  }

  @Post('notifications/:id/read')
  @HttpCode(204)
  read(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.notifications.markRead(user, id);
  }

  @Get('notifications/preferences')
  prefs(@CurrentUser() user: AuthUser) {
    return this.notifications.preferences(user);
  }

  @Put('notifications/preferences')
  setPrefs(@Body() dto: PreferencesDto, @CurrentUser() user: AuthUser) {
    return this.notifications.setPreferences(user, dto.preferences);
  }

  @Get('admin/jobs')
  @RequirePermissions('admin.settings.manage')
  jobList() {
    return JOB_NAMES.map((name) => ({ name }));
  }

  @Post('admin/jobs/:name/run')
  @HttpCode(200)
  @RequirePermissions('admin.settings.manage')
  async runJob(@Param() p: RunJobParams) {
    const result = await this.jobs.run(p.name);
    await this.audit.record({ action: 'job.run_manual', entityType: 'Job', entityId: p.name, metadata: { result } });
    return { name: p.name, result };
  }
}

@Global()
@Module({ controllers: [NotificationsController], providers: [NotificationsService, DeliveryService, JobsService], exports: [NotificationsService, JobsService] })
export class NotificationsModule {}
