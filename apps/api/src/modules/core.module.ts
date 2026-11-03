import { Global, Module } from '@nestjs/common';
import { MailService } from '../infra/mail/mail.service';
import { AuditService } from './audit/audit.service';
import { SequenceService } from './settings/sequence.service';
import { SettingsService } from './settings/settings.service';

/** Cross-cutting services available to every module. */
@Global()
@Module({
  providers: [AuditService, MailService, SequenceService, SettingsService],
  exports: [AuditService, MailService, SequenceService, SettingsService],
})
export class CoreModule {}
