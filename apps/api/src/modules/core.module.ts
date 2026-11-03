import { Global, Module } from '@nestjs/common';
import { MailService } from '../infra/mail/mail.service';
import { PdfService } from '../infra/pdf/pdf.service';
import { AuditService } from './audit/audit.service';
import { SequenceService } from './settings/sequence.service';
import { SettingsService } from './settings/settings.service';

/** Cross-cutting services available to every module. */
@Global()
@Module({
  providers: [AuditService, MailService, PdfService, SequenceService, SettingsService],
  exports: [AuditService, MailService, PdfService, SequenceService, SettingsService],
})
export class CoreModule {}
