import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class PageQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 25, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize = 25;

  @ApiPropertyOptional({ description: 'Free-text search' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ description: 'Sort field' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  sort?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
}

export interface Page<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; pageCount: number };
}

export function pageArgs(q: PageQueryDto) {
  return { skip: (q.page - 1) * q.pageSize, take: q.pageSize };
}

export function toPage<T>(data: T[], total: number, q: PageQueryDto): Page<T> {
  return { data, meta: { page: q.page, pageSize: q.pageSize, total, pageCount: Math.ceil(total / q.pageSize) } };
}

/** Build a safe orderBy from a whitelist. */
export function orderBy(q: PageQueryDto, allowed: string[], fallback: Record<string, 'asc' | 'desc'>) {
  if (q.sort && allowed.includes(q.sort)) return { [q.sort]: q.order ?? 'asc' };
  return fallback;
}
