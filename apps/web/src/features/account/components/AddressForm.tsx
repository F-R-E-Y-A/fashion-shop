import { useQuery } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';

import { ApiError } from '@/core';
import { ErrorNote, Loading } from '@/ui';

import {
  type Address,
  areaKeys,
  type CreateAddressInput,
  listAdministrativeAreas,
} from '../api/profile-address.api.js';
import styles from '../pages/AccountPages.module.css';

const hasControlCharacter = /[\p{Cc}]/u;

export function AddressForm({
  address,
  isSaving,
  onCancel,
  onSave,
}: {
  address?: Address;
  isSaving: boolean;
  onCancel: () => void;
  onSave: (data: CreateAddressInput) => Promise<void>;
}) {
  const [recipientName, setRecipientName] = useState(address?.recipientName ?? '');
  const [phone, setPhone] = useState(address?.phone ?? '');
  const [provinceId, setProvinceId] = useState(address?.administrativeArea.province?.id ?? '');
  const [communeId, setCommuneId] = useState(address?.administrativeAreaId ?? '');
  const [detailAddress, setDetailAddress] = useState(address?.detailAddress ?? '');
  const [postalCode, setPostalCode] = useState(address?.postalCode ?? '');
  const [isDefault, setIsDefault] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const provinces = useQuery({
    queryKey: areaKeys.provinces(),
    queryFn: () => listAdministrativeAreas(),
  });
  const communes = useQuery({
    queryKey: areaKeys.communes(provinceId),
    queryFn: () => listAdministrativeAreas(provinceId),
    enabled: Boolean(provinceId),
  });
  const unchangedArea = Boolean(address && communeId === address.administrativeAreaId);
  const savedProvince = address?.administrativeArea.province;
  const savedCommune = address?.administrativeArea;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const name = recipientName.trim();
    const number = phone.trim();
    const detail = detailAddress.trim();
    const postal = postalCode.trim();

    if (!name || name.length > 100 || hasControlCharacter.test(name)) {
      setFormError('Tên người nhận phải có 1–100 ký tự và không chứa ký tự điều khiển.');
      return;
    }
    if (!/^0\d{9}$/.test(number)) {
      setFormError('Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0.');
      return;
    }
    if (
      !provinceId ||
      !communeId ||
      (!unchangedArea && !communes.data?.some((area) => area.id === communeId))
    ) {
      setFormError('Vui lòng chọn tỉnh và xã giao hàng hợp lệ.');
      return;
    }
    if (!detail || detail.length > 255 || hasControlCharacter.test(detail)) {
      setFormError('Địa chỉ chi tiết phải có 1–255 ký tự và không chứa ký tự điều khiển.');
      return;
    }
    if (postal && !/^[A-Za-z0-9 -]{1,10}$/.test(postal)) {
      setFormError('Mã bưu chính tối đa 10 ký tự: chữ, số, dấu cách hoặc dấu gạch ngang.');
      return;
    }

    try {
      await onSave({
        recipientName: name,
        phone: number,
        administrativeAreaId: communeId,
        detailAddress: detail,
        postalCode: postal || null,
        ...(!address ? { isDefault } : {}),
      });
    } catch (error) {
      if (error instanceof ApiError && error.body.statusCode === 422) {
        setFormError('Xã đã chọn không còn hợp lệ. Vui lòng chọn lại tỉnh và xã.');
      } else {
        setFormError('Không thể lưu địa chỉ. Vui lòng kiểm tra dữ liệu và thử lại.');
      }
    }
  }

  return (
    <div className={styles.panel}>
      <h2>{address ? 'Sửa địa chỉ' : 'Thêm địa chỉ'}</h2>
      {provinces.isPending && <Loading label="Đang tải danh sách tỉnh…" />}
      {provinces.isError && (
        <ErrorNote
          label="Không tải được danh sách tỉnh."
          onRetry={() => void provinces.refetch()}
        />
      )}
      {provinces.data?.length === 0 && (
        <p className="state" role="status">
          Chưa có dữ liệu tỉnh/xã.{' '}
          {address ? 'Bạn vẫn có thể sửa các thông tin khác.' : 'Chưa thể tạo địa chỉ.'}
        </p>
      )}
      <form className={styles.form} onSubmit={(event) => void onSubmit(event)}>
        <div className={styles.formGrid}>
          <label>
            Tên người nhận
            <input
              value={recipientName}
              onChange={(event) => setRecipientName(event.target.value)}
              maxLength={100}
              autoComplete="name"
              required
            />
          </label>
          <label>
            Số điện thoại
            <input
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              inputMode="numeric"
              maxLength={10}
              autoComplete="tel"
              required
            />
          </label>
          <label>
            Tỉnh / thành phố
            <select
              value={provinceId}
              onChange={(event) => {
                setProvinceId(event.target.value);
                setCommuneId('');
              }}
              required
              disabled={provinces.isPending || provinces.isError || provinces.data?.length === 0}
            >
              <option value="">Chọn tỉnh / thành phố</option>
              {savedProvince && !provinces.data?.some((area) => area.id === savedProvince.id) && (
                <option value={savedProvince.id}>{savedProvince.name}</option>
              )}
              {provinces.data?.map((province) => (
                <option value={province.id} key={province.id}>
                  {province.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Xã / phường
            <select
              value={communeId}
              onChange={(event) => setCommuneId(event.target.value)}
              required
              disabled={
                !provinceId || communes.isPending || communes.isError || !communes.data?.length
              }
            >
              <option value="">{communes.isPending ? 'Đang tải xã…' : 'Chọn xã / phường'}</option>
              {savedCommune &&
                provinceId === savedProvince?.id &&
                !communes.data?.some((area) => area.id === savedCommune.id) && (
                  <option value={savedCommune.id}>{savedCommune.name}</option>
                )}
              {communes.data?.map((commune) => (
                <option value={commune.id} key={commune.id}>
                  {commune.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {provinceId && communes.isError && (
          <ErrorNote label="Không tải được danh sách xã." onRetry={() => void communes.refetch()} />
        )}
        {provinceId && communes.data?.length === 0 && !unchangedArea && (
          <p className="state">Tỉnh này chưa có xã giao hàng khả dụng.</p>
        )}
        <label>
          Địa chỉ chi tiết
          <input
            value={detailAddress}
            onChange={(event) => setDetailAddress(event.target.value)}
            maxLength={255}
            autoComplete="street-address"
            required
          />
        </label>
        <label>
          Mã bưu chính (không bắt buộc)
          <input
            value={postalCode}
            onChange={(event) => setPostalCode(event.target.value)}
            maxLength={10}
            autoComplete="postal-code"
          />
        </label>
        {!address && (
          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(event) => setIsDefault(event.target.checked)}
            />{' '}
            Đặt làm địa chỉ mặc định
          </label>
        )}
        {formError && (
          <p className="state state--error" role="alert">
            {formError}
          </p>
        )}
        <div className={styles.actions}>
          <button
            type="submit"
            disabled={
              isSaving || (!unchangedArea && (!provinces.data?.length || !communes.data?.length))
            }
          >
            {isSaving ? 'Đang lưu…' : 'Lưu địa chỉ'}
          </button>
          <button type="button" className={styles.secondary} onClick={onCancel} disabled={isSaving}>
            Hủy
          </button>
        </div>
      </form>
    </div>
  );
}
