import { Injectable } from '@nestjs/common';
import { AttendanceStatus, Prisma } from '@prisma/client';
import { Decimal, serialize } from '../../common/decimal';
import { Errors } from '../../common/errors';
import { AuthUser } from '../../common/request-context';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export interface WorkerInput {
  code?: string;
  name?: string;
  phone?: string | null;
  departmentId?: string | null;
  jobRole?: string | null;
  skills?: string[];
  userId?: string | null;
  joinedOn?: string | null;
  isActive?: boolean;
  notes?: string | null;
}

export interface AttendanceInput {
  workerId: string;
  status: AttendanceStatus;
  checkIn?: string;
  checkOut?: string;
  hoursWorked?: number;
  remarks?: string;
}

/** Parse YYYY-MM-DD as a calendar date (UTC midnight) for @db.Date columns. */
export function calendarDate(s: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw Errors.validation('Date must be YYYY-MM-DD');
  return new Date(`${s}T00:00:00.000Z`);
}

@Injectable()
export class WorkforceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(q: { search?: string; departmentId?: string; includeInactive?: boolean; skip: number; take: number }) {
    const where: Prisma.WorkerWhereInput = {
      departmentId: q.departmentId,
      ...(q.includeInactive ? {} : { isActive: true }),
      ...(q.search ? { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { code: { contains: q.search, mode: 'insensitive' } }, { jobRole: { contains: q.search, mode: 'insensitive' } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.worker.findMany({
        where,
        skip: q.skip,
        take: q.take,
        orderBy: { name: 'asc' },
        include: { department: { select: { id: true, name: true } }, user: { select: { id: true, email: true } }, _count: { select: { assignments: true } } },
      }),
      this.prisma.worker.count({ where }),
    ]);
    return { rows, total };
  }

  async get(id: string) {
    const w = await this.prisma.worker.findUnique({
      where: { id },
      include: { department: true, user: { select: { id: true, email: true, name: true } } },
    });
    if (!w) throw Errors.notFound('Worker', id);
    const [openTasks, recentOutputs, attendance] = await Promise.all([
      this.prisma.productionOrderStage.findMany({
        where: { assignments: { some: { workerId: id } }, status: { in: ['PENDING', 'IN_PROGRESS', 'PAUSED'] }, productionOrder: { status: { in: ['RELEASED', 'MATERIALS_RESERVED', 'IN_PROGRESS'] } } },
        include: { stageDefinition: { select: { name: true } }, productionOrder: { select: { id: true, number: true, dueDate: true, item: { select: { code: true, name: true } } } } },
        take: 50,
      }),
      this.prisma.productionOutput.findMany({
        where: { workerId: id, reversedAt: null },
        orderBy: { recordedAt: 'desc' },
        take: 30,
        include: { stage: { select: { stageDefinition: { select: { name: true } } } }, productionOrder: { select: { id: true, number: true } } },
      }),
      this.prisma.attendance.findMany({ where: { workerId: id }, orderBy: { date: 'desc' }, take: 31 }),
    ]);
    return serialize({ ...w, openTasks, recentOutputs, attendance });
  }

  async upsert(id: string | null, dto: WorkerInput, actor: AuthUser) {
    if (dto.userId) {
      const linked = await this.prisma.worker.findFirst({ where: { userId: dto.userId, NOT: id ? { id } : undefined } });
      if (linked) throw Errors.conflict(`That user is already linked to worker ${linked.code}`);
    }
    if (dto.skills?.length) {
      const known = await this.prisma.stageDefinition.findMany({ where: { code: { in: dto.skills } }, select: { code: true } });
      const unknown = dto.skills.filter((s) => !known.some((k) => k.code === s));
      if (unknown.length) throw Errors.validation(`Unknown stage codes in skills: ${unknown.join(', ')}`);
    }
    const data = {
      name: dto.name?.trim(),
      phone: dto.phone,
      departmentId: dto.departmentId,
      jobRole: dto.jobRole,
      skills: dto.skills,
      userId: dto.userId,
      joinedOn: dto.joinedOn ? calendarDate(dto.joinedOn) : dto.joinedOn === null ? null : undefined,
      isActive: dto.isActive,
      notes: dto.notes,
    };
    if (id) {
      const before = await this.prisma.worker.findUniqueOrThrow({ where: { id } });
      const w = await this.prisma.worker.update({ where: { id }, data });
      await this.audit.record({ action: 'worker.updated', entityType: 'Worker', entityId: id, before, after: w, actorId: actor.id });
      if (before.userId !== w.userId) {
        // linking/unlinking changes what the user's principal can do on stages
        const ids = [before.userId, w.userId].filter((x): x is string => !!x);
        await this.prisma.user.updateMany({ where: { id: { in: ids } }, data: { permissionVersion: { increment: 1 } } });
      }
      return this.get(id);
    }
    if (!dto.code || !dto.name) throw Errors.validation('code and name are required');
    const w = await this.prisma.worker.create({ data: { ...data, code: dto.code.trim().toUpperCase(), name: dto.name.trim(), skills: dto.skills ?? [] } });
    if (w.userId) await this.prisma.user.update({ where: { id: w.userId }, data: { permissionVersion: { increment: 1 } } });
    await this.audit.record({ action: 'worker.created', entityType: 'Worker', entityId: w.id, after: w, actorId: actor.id });
    return this.get(w.id);
  }

  // ─── Attendance ──────────────────────────────────────────

  async attendance(q: { date?: string; from?: string; to?: string; workerId?: string }) {
    const where: Prisma.AttendanceWhereInput = {
      workerId: q.workerId,
      date: q.date ? calendarDate(q.date) : q.from || q.to ? { gte: q.from ? calendarDate(q.from) : undefined, lte: q.to ? calendarDate(q.to) : undefined } : undefined,
    };
    return serialize(await this.prisma.attendance.findMany({ where, orderBy: [{ date: 'desc' }, { worker: { name: 'asc' } }], include: { worker: { select: { id: true, code: true, name: true } } }, take: 2000 }));
  }

  /** Day sheet: every active worker with their attendance row (if recorded) for the date. */
  async daySheet(date: string) {
    const d = calendarDate(date);
    const [workers, rows] = await Promise.all([
      this.prisma.worker.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, include: { department: { select: { name: true } } } }),
      this.prisma.attendance.findMany({ where: { date: d } }),
    ]);
    return serialize(workers.map((w) => ({ worker: { id: w.id, code: w.code, name: w.name, department: w.department?.name ?? null }, attendance: rows.find((r) => r.workerId === w.id) ?? null })));
  }

  async recordAttendance(date: string, entries: AttendanceInput[], actor: AuthUser) {
    const d = calendarDate(date);
    if (d.getTime() > Date.now() + 86_400_000) throw Errors.validation('Attendance cannot be recorded for future dates');
    await this.prisma.$transaction(async (tx) => {
      for (const e of entries) {
        let hours = e.hoursWorked;
        if (hours === undefined && e.checkIn && e.checkOut) {
          const diff = (new Date(e.checkOut).getTime() - new Date(e.checkIn).getTime()) / 3_600_000;
          if (diff < 0) throw Errors.validation('Check-out must be after check-in');
          hours = Math.round(diff * 100) / 100;
        }
        const data = { status: e.status, checkIn: e.checkIn ? new Date(e.checkIn) : null, checkOut: e.checkOut ? new Date(e.checkOut) : null, hoursWorked: hours ?? null, remarks: e.remarks, recordedById: actor.id };
        await tx.attendance.upsert({ where: { workerId_date: { workerId: e.workerId, date: d } }, create: { workerId: e.workerId, date: d, ...data }, update: data });
      }
      await this.audit.record({ action: 'attendance.recorded', entityType: 'Attendance', entityId: date, summary: `${entries.length} worker(s) on ${date}`, after: entries, actorId: actor.id }, tx);
    });
    return this.daySheet(date);
  }

  // ─── Productivity (derived only from production records) ─────────

  async productivity(q: { from: Date; to: Date; workerId?: string; departmentId?: string }) {
    const outputs = await this.prisma.productionOutput.findMany({
      where: { reversedAt: null, recordedAt: { gte: q.from, lte: q.to }, workerId: q.workerId ? q.workerId : { not: null }, ...(q.departmentId ? { worker: { departmentId: q.departmentId } } : {}) },
      select: {
        id: true,
        workerId: true,
        qtyGood: true,
        qtyRejected: true,
        qtyRework: true,
        recordedAt: true,
        productionOrderId: true,
        stage: { select: { stageDefinition: { select: { code: true, name: true } } } },
      },
    });
    const workers = await this.prisma.worker.findMany({
      where: { id: { in: [...new Set(outputs.map((o) => o.workerId!))] } },
      include: { department: { select: { name: true } } },
    });
    const attendance = await this.prisma.attendance.findMany({
      where: { workerId: { in: workers.map((w) => w.id) }, date: { gte: startOfDayUtc(q.from), lte: q.to } },
    });
    const rows = workers.map((w) => {
      const mine = outputs.filter((o) => o.workerId === w.id);
      const good = mine.reduce((s, o) => s.plus(o.qtyGood), new Decimal(0));
      const rejected = mine.reduce((s, o) => s.plus(o.qtyRejected), new Decimal(0));
      const rework = mine.reduce((s, o) => s.plus(o.qtyRework), new Decimal(0));
      const att = attendance.filter((a) => a.workerId === w.id);
      const daysPresent = att.reduce((s, a) => s + (a.status === 'PRESENT' ? 1 : a.status === 'HALF_DAY' ? 0.5 : 0), 0);
      const hours = att.reduce((s, a) => s + Number(a.hoursWorked ?? 0), 0);
      const byStage = new Map<string, { stage: string; good: Decimal; rejected: Decimal; rework: Decimal; entries: number }>();
      for (const o of mine) {
        const k = o.stage.stageDefinition.code;
        const cur = byStage.get(k) ?? { stage: o.stage.stageDefinition.name, good: new Decimal(0), rejected: new Decimal(0), rework: new Decimal(0), entries: 0 };
        cur.good = cur.good.plus(o.qtyGood);
        cur.rejected = cur.rejected.plus(o.qtyRejected);
        cur.rework = cur.rework.plus(o.qtyRework);
        cur.entries++;
        byStage.set(k, cur);
      }
      const processed = good.plus(rejected);
      return {
        worker: { id: w.id, code: w.code, name: w.name, department: w.department?.name ?? null, jobRole: w.jobRole },
        entries: mine.length,
        orders: new Set(mine.map((o) => o.productionOrderId)).size,
        good: Number(good),
        rejected: Number(rejected),
        rework: Number(rework),
        rejectionRate: processed.gt(0) ? Number(rejected.div(processed).toDecimalPlaces(4)) : null,
        daysPresent,
        hoursRecorded: Math.round(hours * 100) / 100,
        goodPerDayPresent: daysPresent > 0 ? Number(good.div(daysPresent).toDecimalPlaces(2)) : null,
        byStage: [...byStage.values()].map((s) => ({ ...s, good: Number(s.good), rejected: Number(s.rejected), rework: Number(s.rework) })),
        sourceOutputIds: mine.map((o) => o.id),
      };
    });
    rows.sort((a, b) => b.good - a.good);
    return { from: q.from, to: q.to, basis: 'Production output entries (non-reversed) and attendance records', rows };
  }

  /** Daily good/rejected series for one worker. */
  async workerDaily(workerId: string, from: Date, to: Date) {
    const rows = await this.prisma.$queryRaw<{ day: Date; good: Decimal; rejected: Decimal; rework: Decimal; entries: bigint }[]>`
      SELECT date_trunc('day', "recordedAt" AT TIME ZONE 'Asia/Kolkata') AS "day",
             SUM("qtyGood") AS "good", SUM("qtyRejected") AS "rejected", SUM("qtyRework") AS "rework", COUNT(*) AS "entries"
      FROM "ProductionOutput"
      WHERE "workerId" = ${workerId} AND "reversedAt" IS NULL AND "recordedAt" BETWEEN ${from} AND ${to}
      GROUP BY 1 ORDER BY 1`;
    return rows.map((r) => ({ date: r.day.toISOString().slice(0, 10), good: Number(r.good), rejected: Number(r.rejected), rework: Number(r.rework), entries: Number(r.entries) }));
  }
}

function startOfDayUtc(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

