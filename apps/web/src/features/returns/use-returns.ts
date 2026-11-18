import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { postExternalForm, shouldRetryRequest } from '@/core';
import { useAuth } from '@/features/account';

import {
  type ReturnEligibility,
  type ReturnInput,
  returnKeys,
  type ReturnPage,
  type ReturnRequest,
  type UploadTicket,
} from './returns.api.js';

/** Chi goi khi don da giao: don khac khong co gi de hoi, tranh goi thua. */
export function useReturnEligibility(orderId: string, enabled = true) {
  const { user, authenticatedRequest } = useAuth();
  return useQuery({
    queryKey: returnKeys.eligibility(user?.id ?? '', orderId),
    queryFn: ({ signal }) =>
      authenticatedRequest<ReturnEligibility>(`/orders/${orderId}/returns/eligibility`, {
        signal,
      }),
    enabled: enabled && Boolean(user) && Boolean(orderId),
    retry: shouldRetryRequest,
  });
}

/**
 * Gui xong thi lam moi dieu kien, danh sach va chi tiet. Lam moi ca khi loi: gui lai sau loi mang
 * ma lan dau da ghi thi may chu bao trung (RETURN_EXISTS), tai lai de nut doi thanh lien ket.
 */
export function useCreateReturn(orderId: string) {
  const { user, authenticatedRequest } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ReturnInput) =>
      authenticatedRequest<ReturnRequest>(`/orders/${orderId}/returns`, {
        method: 'POST',
        body: input,
      }),
    // Khong await: cho lam moi xong se go hop dang mo truoc khi callback cua mutate kip chay.
    onSettled: () => void client.invalidateQueries({ queryKey: returnKeys.mine(user?.id ?? '') }),
  });
}

export function useMyReturns(page: number) {
  const { user, authenticatedRequest } = useAuth();
  return useQuery({
    queryKey: returnKeys.list(user?.id ?? '', page),
    queryFn: ({ signal }) =>
      authenticatedRequest<ReturnPage>(`/returns?page=${page}&pageSize=10`, { signal }),
    enabled: Boolean(user),
    placeholderData: keepPreviousData,
    retry: shouldRetryRequest,
  });
}

export function useReturn(id: string) {
  const { user, authenticatedRequest } = useAuth();
  return useQuery({
    queryKey: returnKeys.detail(user?.id ?? '', id),
    queryFn: ({ signal }) => authenticatedRequest<ReturnRequest>(`/returns/${id}`, { signal }),
    enabled: Boolean(user) && Boolean(id),
    retry: shouldRetryRequest,
  });
}

/** Huy xong: lam moi ca dieu kien (gui lai duoc neu con han), danh sach va chi tiet. */
export function useCancelReturn() {
  const { user, authenticatedRequest } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      authenticatedRequest<ReturnRequest>(`/returns/${id}/cancel`, { method: 'POST' }),
    // Doi ngay ban da huy trong cache, dong thoi lam moi o onSettled: khong cho nhay lai trang thai cu.
    onSuccess: (cancelled) =>
      client.setQueryData(returnKeys.detail(user?.id ?? '', cancelled.id), cancelled),
    // Khong await: cho lam moi xong se go hop dang mo truoc khi callback cua mutate kip chay.
    onSettled: () => void client.invalidateQueries({ queryKey: returnKeys.mine(user?.id ?? '') }),
  });
}

export const PHOTO_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Mot phieu mot anh: xin phieu (muc dich `return`), kiem gioi han theo phieu, tai thang len kho,
 * tra khoa de gui kem yeu cau. Kho anh nam ngoai nen khong gui token cua cua hang.
 */
export function useUploadReturnPhoto() {
  const { authenticatedRequest } = useAuth();
  return useCallback(
    async (file: File, signal?: AbortSignal): Promise<string> => {
      const ticket = await authenticatedRequest<UploadTicket>('/uploads/tickets', {
        method: 'POST',
        body: { purpose: 'return' },
        signal,
      });
      if (file.size > ticket.maxBytes) {
        throw new Error(`Ảnh quá ${Math.round(ticket.maxBytes / 1024 / 1024)} MB.`);
      }
      const form = new FormData();
      for (const [name, value] of Object.entries(ticket.fields)) form.append(name, value);
      form.append('file', file);
      await postExternalForm<unknown>(ticket.uploadUrl, form, signal);
      return ticket.key;
    },
    [authenticatedRequest],
  );
}
