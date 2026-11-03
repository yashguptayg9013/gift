import { z } from 'zod';

/** Mirrors the API password policy (AuthService.PASSWORD_POLICY). */
export const passwordSchema = z
  .string()
  .min(10, 'At least 10 characters')
  .max(200)
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), 'Include at least one letter and one number');

export const PASSWORD_HINT = 'At least 10 characters including a letter and a number';
