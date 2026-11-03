import { Body, Controller, Get, Injectable, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';
import { RequireAnyPermission, RequirePermissions } from '../../common/decorators';
import { Errors } from '../../common/errors';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

class StageDefinitionDto {
  @IsOptional() @IsString() @MaxLength(40) code?: string;
  @IsString() @IsNotEmpty() @MaxLength(100) name: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) defaultSequence?: number;
  @IsOptional() @IsBoolean() isQcStage?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class DepartmentDto {
  @IsOptional() @IsString() @MaxLength(20) code?: string;
  @IsString() @IsNotEmpty() @MaxLength(100) name: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class WorkstationDto {
  @IsOptional() @IsString() @MaxLength(20) code?: string;
  @IsString() @IsNotEmpty() @MaxLength(100) name: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsString() stageDefinitionId?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class RouteStepDto {
  @IsString() stageDefinitionId: string;
  @IsOptional() @IsString() workstationId?: string;
  @IsOptional() @IsString() @MaxLength(1000) instructions?: string;
}

class RouteDto {
  @IsOptional() @IsString() @MaxLength(30) code?: string;
  @IsString() @IsNotEmpty() @MaxLength(100) name: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => RouteStepDto) steps: RouteStepDto[];
}

/** Manufacturing master data: stages, departments, workstations, routes. */
@Injectable()
export class ManufacturingConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  stages(includeInactive = false) {
    return this.prisma.stageDefinition.findMany({ where: includeInactive ? {} : { isActive: true }, orderBy: [{ defaultSequence: 'asc' }, { name: 'asc' }] });
  }

  async upsertStage(id: string | null, dto: StageDefinitionDto) {
    if (id) {
      const before = await this.prisma.stageDefinition.findUniqueOrThrow({ where: { id } });
      const s = await this.prisma.stageDefinition.update({ where: { id }, data: { ...dto, code: undefined } });
      await this.audit.record({ action: 'stage_definition.updated', entityType: 'StageDefinition', entityId: id, before, after: s });
      return s;
    }
    if (!dto.code) throw Errors.validation('code is required');
    const s = await this.prisma.stageDefinition.create({ data: { ...dto, code: dto.code.toUpperCase().replace(/\s+/g, '_') } as never });
    await this.audit.record({ action: 'stage_definition.created', entityType: 'StageDefinition', entityId: s.id, after: s });
    return s;
  }

  departments() {
    return this.prisma.department.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { workers: true } } } });
  }

  async upsertDepartment(id: string | null, dto: DepartmentDto) {
    if (id) return this.prisma.department.update({ where: { id }, data: { name: dto.name, isActive: dto.isActive } });
    if (!dto.code) throw Errors.validation('code is required');
    const d = await this.prisma.department.create({ data: { code: dto.code.toUpperCase(), name: dto.name } });
    await this.audit.record({ action: 'department.created', entityType: 'Department', entityId: d.id, after: d });
    return d;
  }

  workstations() {
    return this.prisma.workstation.findMany({ orderBy: { code: 'asc' }, include: { department: { select: { id: true, name: true } }, stageDefinition: { select: { id: true, name: true } } } });
  }

  async upsertWorkstation(id: string | null, dto: WorkstationDto) {
    if (id) return this.prisma.workstation.update({ where: { id }, data: { ...dto, code: undefined } });
    if (!dto.code) throw Errors.validation('code is required');
    const w = await this.prisma.workstation.create({ data: { ...dto, code: dto.code.toUpperCase() } as never });
    await this.audit.record({ action: 'workstation.created', entityType: 'Workstation', entityId: w.id, after: w });
    return w;
  }

  routes() {
    return this.prisma.route.findMany({
      orderBy: { name: 'asc' },
      include: { steps: { orderBy: { sequence: 'asc' }, include: { stageDefinition: { select: { id: true, code: true, name: true, isQcStage: true } } } }, _count: { select: { items: true, products: true } } },
    });
  }

  async route(id: string) {
    const r = await this.prisma.route.findUnique({ where: { id }, include: { steps: { orderBy: { sequence: 'asc' }, include: { stageDefinition: true } } } });
    if (!r) throw Errors.notFound('Route', id);
    return r;
  }

  async upsertRoute(id: string | null, dto: RouteDto) {
    const stageIds = dto.steps.map((s) => s.stageDefinitionId);
    const stages = await this.prisma.stageDefinition.findMany({ where: { id: { in: stageIds } } });
    if (stages.length !== new Set(stageIds).size) throw Errors.validation('Unknown stage in route');
    if (new Set(stageIds).size !== stageIds.length) throw Errors.validation('A stage can appear only once in a route');
    const routeId = await this.prisma.$transaction(async (tx) => {
      let rid = id;
      if (id) {
        await tx.route.update({ where: { id }, data: { name: dto.name, description: dto.description, isActive: dto.isActive } });
        await tx.routeStep.deleteMany({ where: { routeId: id } });
      } else {
        if (!dto.code) throw Errors.validation('code is required');
        rid = (await tx.route.create({ data: { code: dto.code.toUpperCase(), name: dto.name, description: dto.description } })).id;
      }
      await tx.routeStep.createMany({ data: dto.steps.map((s, i) => ({ routeId: rid!, sequence: (i + 1) * 10, stageDefinitionId: s.stageDefinitionId, workstationId: s.workstationId, instructions: s.instructions })) });
      await this.audit.record({ action: id ? 'route.updated' : 'route.created', entityType: 'Route', entityId: rid!, after: dto }, tx);
      return rid!;
    });
    return this.route(routeId);
  }
}

@ApiTags('manufacturing-config')
@Controller('manufacturing')
export class ManufacturingConfigController {
  constructor(private readonly config: ManufacturingConfigService) {}

  @Get('stages')
  @RequireAnyPermission('production.view', 'bom.view')
  stages(@Query('includeInactive') inc?: string) {
    return this.config.stages(inc === 'true');
  }
  @Post('stages')
  @RequirePermissions('production.config.manage')
  createStage(@Body() dto: StageDefinitionDto) {
    return this.config.upsertStage(null, dto);
  }
  @Put('stages/:id')
  @RequirePermissions('production.config.manage')
  updateStage(@Param('id') id: string, @Body() dto: StageDefinitionDto) {
    return this.config.upsertStage(id, dto);
  }

  @Get('departments')
  @RequireAnyPermission('production.view', 'workforce.view')
  departments() {
    return this.config.departments();
  }
  @Post('departments')
  @RequireAnyPermission('production.config.manage', 'workforce.manage')
  createDepartment(@Body() dto: DepartmentDto) {
    return this.config.upsertDepartment(null, dto);
  }
  @Put('departments/:id')
  @RequireAnyPermission('production.config.manage', 'workforce.manage')
  updateDepartment(@Param('id') id: string, @Body() dto: DepartmentDto) {
    return this.config.upsertDepartment(id, dto);
  }

  @Get('workstations')
  @RequirePermissions('production.view')
  workstations() {
    return this.config.workstations();
  }
  @Post('workstations')
  @RequirePermissions('production.config.manage')
  createWorkstation(@Body() dto: WorkstationDto) {
    return this.config.upsertWorkstation(null, dto);
  }
  @Put('workstations/:id')
  @RequirePermissions('production.config.manage')
  updateWorkstation(@Param('id') id: string, @Body() dto: WorkstationDto) {
    return this.config.upsertWorkstation(id, dto);
  }

  @Get('routes')
  @RequireAnyPermission('production.view', 'product.view')
  routes() {
    return this.config.routes();
  }
  @Get('routes/:id')
  @RequireAnyPermission('production.view', 'product.view')
  route(@Param('id') id: string) {
    return this.config.route(id);
  }
  @Post('routes')
  @RequirePermissions('production.config.manage')
  createRoute(@Body() dto: RouteDto) {
    return this.config.upsertRoute(null, dto);
  }
  @Put('routes/:id')
  @RequirePermissions('production.config.manage')
  updateRoute(@Param('id') id: string, @Body() dto: RouteDto) {
    return this.config.upsertRoute(id, dto);
  }
}
