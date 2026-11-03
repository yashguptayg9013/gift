import { Body, Controller, Delete, Get, Global, HttpCode, Module, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import Anthropic from '@anthropic-ai/sdk';
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { env } from '../../config/env';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { AuthUser } from '../../common/request-context';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AI_CLIENT, AiService } from './ai.service';
import { InsightsService } from './insights.service';

class SendDto {
  @IsOptional() @IsString() conversationId?: string;
  @IsString() @IsNotEmpty() @MaxLength(8000) message: string;
}

class TitleDto {
  @IsOptional() @IsString() @MaxLength(80) title?: string;
}

class SummaryQueryDto {
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) date?: string;
}

@ApiTags('ai')
@Controller('ai')
class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly insights: InsightsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('status')
  @RequirePermissions('ai.use')
  status(@CurrentUser() user: AuthUser) {
    return this.ai.status(user);
  }

  @Get('conversations')
  @RequirePermissions('ai.use')
  list(@CurrentUser() user: AuthUser) {
    return this.ai.conversations(user);
  }

  @Post('conversations')
  @RequirePermissions('ai.use')
  create(@Body() dto: TitleDto, @CurrentUser() user: AuthUser) {
    return this.ai.createConversation(user, dto.title);
  }

  @Get('conversations/:id')
  @RequirePermissions('ai.use')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.ai.conversation(id, user);
  }

  @Delete('conversations/:id')
  @HttpCode(204)
  @RequirePermissions('ai.use')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.ai.deleteConversation(id, user);
  }

  @Post('messages')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @RequirePermissions('ai.use')
  send(@Body() dto: SendDto, @CurrentUser() user: AuthUser) {
    return this.ai.send(dto.conversationId ?? null, dto.message, user);
  }

  // Deterministic insights (no model call) — also power the Copilot page panels.
  @Get('insights/anomalies')
  @RequirePermissions('inventory.view')
  anomalies() {
    return this.insights.inventoryAnomalies();
  }

  @Get('insights/bottlenecks')
  @RequirePermissions('production.view')
  bottlenecks() {
    return this.insights.productionBottlenecks();
  }

  @Get('insights/delayed-orders')
  @RequirePermissions('production.view')
  delayed() {
    return this.insights.delayedOrders();
  }

  @Get('summaries')
  @RequirePermissions('dashboard.view')
  summaries() {
    return this.prisma.aiSummary.findMany({ orderBy: { date: 'desc' }, take: 30 });
  }

  @Get('summary/today')
  @RequirePermissions('dashboard.view')
  async today(@Query() q: SummaryQueryDto) {
    const facts = await this.insights.dailySummary(q.date);
    return { facts, text: this.insights.templateSummary(facts) };
  }
}

@Global()
@Module({
  controllers: [AiController],
  providers: [
    { provide: AI_CLIENT, useFactory: () => (env().ANTHROPIC_API_KEY ? new Anthropic({ apiKey: env().ANTHROPIC_API_KEY, maxRetries: 3, timeout: 120_000 }) : null) },
    AiService,
    InsightsService,
  ],
  exports: [AiService, InsightsService],
})
export class AiModule {}
