/**
 * Manual (non-generated) hook for retrying a failed analysis.
 * POST /api/analyses/:id/retry
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  MutationFunction,
  UseMutationOptions,
  UseMutationResult,
} from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";
import type { ErrorType } from "./custom-fetch";
import type { Analysis } from "./generated/api.schemas";
import { getGetAnalysisQueryKey, getListAnalysesQueryKey } from "./generated/api";

export const retryAnalysis = async (
  id: number,
  options?: Parameters<typeof customFetch>[1]
): Promise<Analysis> =>
  customFetch<Analysis>(`/api/analyses/${id}/retry`, {
    ...options,
    method: "POST",
  });

export const useRetryAnalysis = <TError = ErrorType<void>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof retryAnalysis>>,
      TError,
      { id: number },
      TContext
    >;
  }
): UseMutationResult<
  Awaited<ReturnType<typeof retryAnalysis>>,
  TError,
  { id: number },
  TContext
> => {
  const queryClient = useQueryClient();

  // Destructure user-supplied callbacks so we can compose them rather than
  // let them override the internal cache-invalidation logic.
  const { onSuccess: userOnSuccess, ...restMutationOptions } =
    options?.mutation ?? {};

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof retryAnalysis>>,
    { id: number }
  > = ({ id }) => retryAnalysis(id);

  return useMutation({
    mutationFn,
    // Always invalidate relevant queries first, then invoke the caller's handler.
    onSuccess: async (data, variables, onMutateResult, context) => {
      await queryClient.invalidateQueries({
        queryKey: getGetAnalysisQueryKey(variables.id),
      });
      await queryClient.invalidateQueries({
        queryKey: getListAnalysesQueryKey(),
      });
      await userOnSuccess?.(data, variables, onMutateResult, context);
    },
    ...restMutationOptions,
  });
};
