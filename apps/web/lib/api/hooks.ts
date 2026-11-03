'use client';

import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { toast } from 'sonner';
import { errorMessage } from './client';

/**
 * Mutation helper: toasts on success/error and invalidates related query keys.
 * Pass `silentError` when the form renders the error inline (e.g. FormError).
 */
export function useApiMutation<TVars, TResult>(
  fn: (vars: TVars) => Promise<TResult>,
  opts: {
    invalidate?: QueryKey[];
    success?: string | ((r: TResult) => string | null);
    silentError?: boolean;
    onSuccess?: (r: TResult, vars: TVars) => void;
  } = {},
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (r, vars) => {
      await Promise.all((opts.invalidate ?? []).map((k) => qc.invalidateQueries({ queryKey: k })));
      const msg = typeof opts.success === 'function' ? opts.success(r) : opts.success;
      if (msg) toast.success(msg);
      opts.onSuccess?.(r, vars);
    },
    onError: (err) => {
      if (!opts.silentError) toast.error(errorMessage(err));
    },
  });
}
