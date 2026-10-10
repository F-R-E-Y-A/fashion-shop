import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Empty, ErrorNote, Loading } from '@/ui';

import {
  type Address,
  addressKeys,
  createAddress,
  type CreateAddressInput,
  deleteAddress,
  listAddresses,
  updateAddress,
} from '../api/profile-address.api.js';
import { useAuth } from '../AuthProvider.js';
import { AddressForm } from '../components/AddressForm.js';
import styles from './AccountPages.module.css';

type Editor = { mode: 'create' } | { mode: 'edit'; address: Address } | null;

export function AddressPage() {
  const { authenticatedRequest, user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? '';
  const [editor, setEditor] = useState<Editor>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const addresses = useQuery({
    queryKey: addressKeys.list(userId),
    queryFn: () => listAddresses(authenticatedRequest),
    enabled: Boolean(userId),
  });

  const save = useMutation({
    mutationFn: async ({ data, address }: { data: CreateAddressInput; address?: Address }) => {
      if (!address) return createAddress(authenticatedRequest, data);
      return updateAddress(authenticatedRequest, address.id, {
        recipientName: data.recipientName,
        phone: data.phone,
        detailAddress: data.detailAddress,
        postalCode: data.postalCode,
        ...(data.administrativeAreaId !== address.administrativeAreaId
          ? { administrativeAreaId: data.administrativeAreaId }
          : {}),
      });
    },
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: addressKeys.list(userId) });
      setEditor(null);
      setNotice(variables.address ? 'Đã cập nhật địa chỉ.' : 'Đã thêm địa chỉ.');
    },
  });

  const setDefault = useMutation({
    mutationFn: (id: string) => updateAddress(authenticatedRequest, id, { isDefault: true }),
    onSuccess: () => setNotice('Đã đổi địa chỉ mặc định.'),
    onError: () => setActionError('Không thể đổi địa chỉ mặc định. Vui lòng thử lại.'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: addressKeys.list(userId) }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteAddress(authenticatedRequest, id),
    onSuccess: (_, id) => {
      setEditor((current) =>
        current?.mode === 'edit' && current.address.id === id ? null : current,
      );
      setNotice('Đã xóa địa chỉ.');
    },
    onError: () => setActionError('Không thể xóa địa chỉ. Vui lòng thử lại.'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: addressKeys.list(userId) }),
  });

  if (addresses.isPending) return <Loading label="Đang tải sổ địa chỉ…" />;
  if (addresses.isError) {
    return (
      <ErrorNote label="Không tải được sổ địa chỉ." onRetry={() => void addresses.refetch()} />
    );
  }

  return (
    <div>
      <div className={styles.sectionHeader}>
        <div>
          <h2>Sổ địa chỉ</h2>
          <p className={styles.hint}>Lưu thông tin người nhận và địa chỉ giao hàng của bạn.</p>
        </div>
        {!editor && (
          <button
            type="button"
            onClick={() => {
              setNotice(null);
              setActionError(null);
              setEditor({ mode: 'create' });
            }}
          >
            Thêm địa chỉ
          </button>
        )}
      </div>

      {notice && (
        <p className={styles.success} role="status">
          {notice}
        </p>
      )}
      {actionError && (
        <p className="state state--error" role="alert">
          {actionError}
        </p>
      )}

      {editor && (
        <AddressForm
          key={editor.mode === 'edit' ? editor.address.id : 'create'}
          address={editor.mode === 'edit' ? editor.address : undefined}
          isSaving={save.isPending}
          onCancel={() => setEditor(null)}
          onSave={(data) =>
            save
              .mutateAsync({
                data,
                address: editor.mode === 'edit' ? editor.address : undefined,
              })
              .then(() => undefined)
          }
        />
      )}

      {addresses.data?.length === 0 && <Empty label="Bạn chưa có địa chỉ nào." />}
      {addresses.data && addresses.data.length > 0 && (
        <div className={styles.addressList}>
          {addresses.data.map((address) => (
            <article className={styles.addressCard} key={address.id}>
              {address.isDefault && <span className={styles.badge}>Mặc định</span>}
              <h3>{address.recipientName}</h3>
              <p>{address.phone}</p>
              <p>{address.detailAddress}</p>
              <p>
                {address.administrativeArea.name}
                {address.administrativeArea.province
                  ? `, ${address.administrativeArea.province.name}`
                  : ''}
              </p>
              {address.postalCode && <p>Mã bưu chính: {address.postalCode}</p>}
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => {
                    setNotice(null);
                    setActionError(null);
                    setEditor({ mode: 'edit', address });
                  }}
                >
                  Sửa
                </button>
                {!address.isDefault && (
                  <button
                    type="button"
                    className={styles.secondary}
                    disabled={setDefault.isPending}
                    onClick={() => {
                      setNotice(null);
                      setActionError(null);
                      setDefault.mutate(address.id);
                    }}
                  >
                    Đặt mặc định
                  </button>
                )}
                <button
                  type="button"
                  className={styles.danger}
                  disabled={remove.isPending}
                  onClick={() => {
                    setNotice(null);
                    setActionError(null);
                    if (window.confirm('Bạn chắc chắn muốn xóa địa chỉ này?')) {
                      remove.mutate(address.id);
                    }
                  }}
                >
                  Xóa
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
