import { Controller, Get, Global, Injectable, Logger, Module, Param, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Response } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { env } from '../../config/env';
import { CurrentUser } from '../../common/decorators';
import { Errors } from '../../common/errors';
import { AuthUser, hasPermission } from '../../common/request-context';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/** Allowed types are detected from file content (magic bytes), never from the client's claim. */
const SIGNATURES: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { mime: 'image/png', ext: 'png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/webp', ext: 'webp', test: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' },
  { mime: 'application/pdf', ext: 'pdf', test: (b) => b.subarray(0, 5).toString('ascii') === '%PDF-' },
];

/** Which permission may attach files to / read files of an entity type. */
const ENTITY_PERMS: Record<string, { write: string[]; read: string[] }> = {
  Product: { write: ['product.manage'], read: ['product.view', 'inventory.view', 'sales.view'] },
  Item: { write: ['product.manage', 'inventory.item.manage'], read: ['product.view', 'inventory.view', 'sales.view'] },
  PurchaseOrder: { write: ['procurement.po.manage'], read: ['procurement.view'] },
  GoodsReceipt: { write: ['procurement.grn.manage'], read: ['procurement.view'] },
  SalesOrder: { write: ['sales.order.manage'], read: ['sales.view'] },
  QualityInspection: { write: ['quality.inspect'], read: ['quality.view'] },
  ProductionOrder: { write: ['production.stage.update.any'], read: ['production.view'] },
};

export function sniff(buf: Buffer) {
  return SIGNATURES.find((s) => s.test(buf)) ?? null;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private s3: S3Client | null = null;

  private client() {
    const e = env();
    if (!this.s3) {
      this.s3 = new S3Client({
        region: e.S3_REGION,
        endpoint: e.S3_ENDPOINT,
        forcePathStyle: e.S3_FORCE_PATH_STYLE,
        credentials: e.S3_ACCESS_KEY_ID ? { accessKeyId: e.S3_ACCESS_KEY_ID, secretAccessKey: e.S3_SECRET_ACCESS_KEY ?? '' } : undefined,
      });
    }
    return this.s3;
  }

  private localPath(key: string) {
    const root = path.resolve(env().STORAGE_LOCAL_DIR);
    const p = path.resolve(root, key);
    if (!p.startsWith(root + path.sep)) throw Errors.validation('Invalid storage key');
    return p;
  }

  async put(key: string, body: Buffer, mime: string) {
    if (env().STORAGE_DRIVER === 's3') {
      await this.client().send(new PutObjectCommand({ Bucket: env().S3_BUCKET, Key: key, Body: body, ContentType: mime, ServerSideEncryption: 'AES256' }));
      return;
    }
    const p = this.localPath(key);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, body, { mode: 0o640 });
  }

  async get(key: string): Promise<Readable> {
    if (env().STORAGE_DRIVER === 's3') {
      const r = await this.client().send(new GetObjectCommand({ Bucket: env().S3_BUCKET, Key: key }));
      return r.Body as Readable;
    }
    return Readable.from(await fs.readFile(this.localPath(key)));
  }
}

@ApiTags('files')
@Controller('files')
class FilesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  @Post()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: env().UPLOAD_MAX_BYTES, files: 1 } }))
  async upload(@UploadedFile() file: Express.Multer.File | undefined, @Query('entityType') entityType: string, @Query('entityId') entityId: string | undefined, @CurrentUser() user: AuthUser) {
    const rule = ENTITY_PERMS[entityType];
    if (!rule) throw Errors.validation(`entityType must be one of ${Object.keys(ENTITY_PERMS).join(', ')}`);
    if (!rule.write.some((p) => hasPermission(user, p))) throw Errors.forbidden();
    if (!file?.buffer?.length) throw Errors.validation('No file uploaded');
    const kind = sniff(file.buffer);
    if (!kind) throw Errors.validation('Only PNG, JPEG, WebP images and PDF documents are accepted');
    const storageKey = `${entityType.toLowerCase()}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${kind.ext}`;
    await this.storage.put(storageKey, file.buffer, kind.mime);
    const safeName = path.basename(file.originalname).replace(/[^\w.\- ]+/g, '_').slice(0, 120) || `file.${kind.ext}`;
    const row = await this.prisma.fileObject.create({
      data: { storageKey, filename: safeName, mimeType: kind.mime, size: file.size, sha256: createHash('sha256').update(file.buffer).digest('hex'), entityType, entityId, uploadedById: user.id },
    });
    await this.audit.record({ action: 'file.uploaded', entityType: 'FileObject', entityId: row.id, metadata: { entityType, entityId, size: file.size, mime: kind.mime } });
    return { id: row.id, filename: row.filename, mimeType: row.mimeType, size: row.size, url: `/api/v1/files/${row.id}` };
  }

  @Get(':id')
  async download(@Param('id') id: string, @CurrentUser() user: AuthUser, @Res() res: Response) {
    const f = await this.prisma.fileObject.findUnique({ where: { id } });
    if (!f) throw Errors.notFound('File', id);
    const rule = f.entityType ? ENTITY_PERMS[f.entityType] : undefined;
    if (rule && !rule.read.some((p) => hasPermission(user, p))) throw Errors.forbidden();
    res.setHeader('Content-Type', f.mimeType);
    res.setHeader('Content-Length', String(f.size));
    res.setHeader('Content-Disposition', `${f.mimeType.startsWith('image/') ? 'inline' : 'attachment'}; filename="${f.filename}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    (await this.storage.get(f.storageKey)).pipe(res);
  }
}

@Global()
@Module({ controllers: [FilesController], providers: [StorageService], exports: [StorageService] })
export class FilesModule {}
