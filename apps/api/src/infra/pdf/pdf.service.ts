import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';

export interface PdfColumn {
  key: string;
  label: string;
  width: number; // relative weight
  align?: 'left' | 'right' | 'center';
}

export interface PdfDocSpec {
  title: string;
  company: { name: string; lines: string[] };
  meta: [string, string][];
  party?: { heading: string; lines: string[] };
  secondParty?: { heading: string; lines: string[] };
  columns: PdfColumn[];
  rows: Record<string, string>[];
  totals?: [string, string][];
  notes?: { heading: string; text: string }[];
  footer?: string;
  signatureLabel?: string;
  landscape?: boolean;
}

const INK = '#111827';
const MUTED = '#6B7280';
const RULE = '#E5E7EB';

/**
 * Minimal, dependency-light PDF renderer (pdfkit, built-in Helvetica).
 * Currency is printed as "INR" because the standard fonts lack the rupee glyph.
 */
@Injectable()
export class PdfService {
  render(spec: PdfDocSpec): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', layout: spec.landscape ? 'landscape' : 'portrait', margin: 40, info: { Title: spec.title, Creator: 'PUJA OS' } });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const left = doc.page.margins.left;
      const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

      // Header
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(14).text(spec.company.name || 'Company name not configured', left, 40, { width: width * 0.6 });
      doc.font('Helvetica').fontSize(8.5).fillColor(MUTED);
      for (const l of spec.company.lines.filter(Boolean)) doc.text(l, { width: width * 0.6 });
      doc.font('Helvetica-Bold').fontSize(16).fillColor(INK).text(spec.title.toUpperCase(), left + width * 0.6, 40, { width: width * 0.4, align: 'right' });
      let y = 62;
      doc.fontSize(8.5);
      for (const [k, v] of spec.meta) {
        doc.font('Helvetica').fillColor(MUTED).text(k, left + width * 0.6, y, { width: width * 0.2, align: 'right' });
        doc.font('Helvetica-Bold').fillColor(INK).text(v || '—', left + width * 0.8, y, { width: width * 0.2, align: 'right' });
        y += 12;
      }
      y = Math.max(doc.y, y) + 12;
      doc.moveTo(left, y).lineTo(left + width, y).strokeColor(RULE).stroke();
      y += 10;

      // Parties
      const parties = [spec.party, spec.secondParty].filter(Boolean) as { heading: string; lines: string[] }[];
      if (parties.length) {
        const colW = width / parties.length;
        let maxY = y;
        parties.forEach((p, i) => {
          doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED).text(p.heading.toUpperCase(), left + i * colW, y, { width: colW - 10 });
          doc.font('Helvetica').fontSize(9).fillColor(INK);
          for (const l of p.lines.filter(Boolean)) doc.text(l, { width: colW - 10 });
          maxY = Math.max(maxY, doc.y);
        });
        y = maxY + 14;
      }

      // Table
      const totalWeight = spec.columns.reduce((s, c) => s + c.width, 0);
      const cols = spec.columns.map((c) => ({ ...c, px: (c.width / totalWeight) * width }));
      const drawHeader = () => {
        doc.rect(left, y, width, 18).fill('#F3F4F6');
        let x = left;
        doc.font('Helvetica-Bold').fontSize(8).fillColor(INK);
        for (const c of cols) {
          doc.text(c.label, x + 4, y + 5, { width: c.px - 8, align: c.align ?? 'left' });
          x += c.px;
        }
        y += 20;
      };
      drawHeader();
      doc.font('Helvetica').fontSize(8.5);
      for (const row of spec.rows) {
        const h = Math.max(...cols.map((c) => doc.heightOfString(row[c.key] ?? '', { width: c.px - 8 }))) + 8;
        if (y + h > doc.page.height - doc.page.margins.bottom - 60) {
          doc.addPage();
          y = doc.page.margins.top;
          drawHeader();
          doc.font('Helvetica').fontSize(8.5);
        }
        let x = left;
        doc.fillColor(INK);
        for (const c of cols) {
          doc.text(row[c.key] ?? '', x + 4, y + 4, { width: c.px - 8, align: c.align ?? 'left' });
          x += c.px;
        }
        y += h;
        doc.moveTo(left, y).lineTo(left + width, y).strokeColor(RULE).stroke();
      }
      if (!spec.rows.length) {
        doc.fillColor(MUTED).text('No rows', left, y + 6);
        y += 20;
      }

      // Totals
      if (spec.totals?.length) {
        y += 8;
        for (const [k, v] of spec.totals) {
          const bold = k.toLowerCase().startsWith('total') || k.toLowerCase().startsWith('grand');
          doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 10 : 9).fillColor(INK);
          doc.text(k, left + width * 0.55, y, { width: width * 0.25, align: 'right' });
          doc.text(v, left + width * 0.8, y, { width: width * 0.2, align: 'right' });
          y += bold ? 16 : 13;
        }
      }

      // Notes
      doc.x = left;
      doc.y = y + 10;
      for (const n of spec.notes ?? []) {
        if (!n.text?.trim()) continue;
        doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED).text(n.heading.toUpperCase(), left, doc.y, { width });
        doc.font('Helvetica').fontSize(8.5).fillColor(INK).text(n.text, { width });
        doc.moveDown(0.6);
      }

      if (spec.signatureLabel) {
        const sy = Math.max(doc.y + 30, doc.page.height - doc.page.margins.bottom - 70);
        doc.font('Helvetica').fontSize(8.5).fillColor(INK).text(`For ${spec.company.name || ''}`, left + width * 0.6, sy, { width: width * 0.4, align: 'right' });
        doc.moveTo(left + width * 0.7, sy + 40).lineTo(left + width, sy + 40).strokeColor(INK).stroke();
        doc.fillColor(MUTED).text(spec.signatureLabel, left + width * 0.6, sy + 44, { width: width * 0.4, align: 'right' });
      }
      if (spec.footer) {
        doc.fontSize(7).fillColor(MUTED).text(spec.footer, left, doc.page.height - doc.page.margins.bottom - 10, { width, align: 'center' });
      }
      doc.end();
    });
  }
}

export const inr = (v: number | string | null | undefined) =>
  v === null || v === undefined ? '—' : `INR ${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const num = (v: number | string | null | undefined, dp = 2) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('en-IN', { maximumFractionDigits: dp }));
export const dt = (v: Date | string | null | undefined) => (v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '—');
