import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';

import { ErrorNote, Loading } from '@/ui';

import { getProfile, profileKeys, updateProfile } from '../api/profile-address.api.js';
import { useAuth } from '../AuthProvider.js';
import styles from './AccountPages.module.css';

const hasControlCharacter = /[\p{Cc}]/u;

export function ProfilePage() {
  const { authenticatedRequest, user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? '';
  const profile = useQuery({
    queryKey: profileKeys.current(userId),
    queryFn: () => getProfile(authenticatedRequest),
    enabled: Boolean(userId),
  });
  const [draft, setDraft] = useState<{ fullName: string; phone: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fullName = draft?.fullName ?? profile.data?.fullName ?? '';
  const phone = draft?.phone ?? profile.data?.phone ?? '';

  const save = useMutation({
    mutationFn: (data: { fullName?: string; phone?: string }) =>
      updateProfile(authenticatedRequest, data),
    onSuccess: (updated) => {
      queryClient.setQueryData(profileKeys.current(userId), updated);
      setDraft(null);
      setSuccess('Đã cập nhật hồ sơ.');
    },
  });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setSuccess(null);
    if (!profile.data) return;

    const name = fullName.trim();
    const number = phone.trim();
    const nameChanged = name !== (profile.data.fullName ?? '');
    const phoneChanged = number !== (profile.data.phone ?? '');
    if (nameChanged && (name.length < 1 || name.length > 100 || hasControlCharacter.test(name))) {
      setFormError('Họ tên phải có 1–100 ký tự và không chứa ký tự điều khiển.');
      return;
    }
    if (phoneChanged && !/^0\d{9}$/.test(number)) {
      setFormError('Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0.');
      return;
    }
    if (!nameChanged && !phoneChanged) {
      setSuccess('Không có thông tin nào thay đổi.');
      return;
    }

    try {
      await save.mutateAsync({
        ...(nameChanged ? { fullName: name } : {}),
        ...(phoneChanged ? { phone: number } : {}),
      });
    } catch {
      setFormError('Không thể cập nhật hồ sơ. Vui lòng kiểm tra dữ liệu và thử lại.');
    }
  }

  if (profile.isPending) return <Loading label="Đang tải hồ sơ…" />;
  if (profile.isError) {
    return <ErrorNote label="Không tải được hồ sơ." onRetry={() => void profile.refetch()} />;
  }
  if (!profile.data) return <ErrorNote label="Không tìm thấy hồ sơ." />;

  return (
    <div className={styles.panel}>
      <h2>Hồ sơ cá nhân</h2>
      <p className={styles.hint}>Email chỉ đọc. Bạn có thể cập nhật họ tên và số điện thoại.</p>
      <form className={styles.form} onSubmit={(event) => void onSubmit(event)}>
        <label>
          Email
          <input type="email" value={profile.data.email} readOnly aria-readonly="true" />
        </label>
        <label>
          Họ tên
          <input
            type="text"
            value={fullName}
            onChange={(event) => setDraft({ fullName: event.target.value, phone })}
            maxLength={100}
            autoComplete="name"
            placeholder="Chưa cập nhật"
          />
        </label>
        <label>
          Số điện thoại
          <input
            type="tel"
            value={phone}
            onChange={(event) => setDraft({ fullName, phone: event.target.value })}
            inputMode="numeric"
            maxLength={10}
            autoComplete="tel"
            placeholder="Chưa cập nhật"
          />
        </label>
        {formError && (
          <p className="state state--error" role="alert">
            {formError}
          </p>
        )}
        {success && (
          <p className={styles.success} role="status">
            {success}
          </p>
        )}
        <button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Đang lưu…' : 'Lưu thay đổi'}
        </button>
      </form>
    </div>
  );
}
