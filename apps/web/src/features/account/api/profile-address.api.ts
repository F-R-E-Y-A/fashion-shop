import { apiGet, type ApiRequestOptions, sessionQueryKeys } from '@/core';

/** Dung authenticatedRequest cua AuthProvider de giu co che refresh khi access token het han. */
export type AuthenticatedRequest = <T>(
  path: string,
  options?: Omit<ApiRequestOptions, 'accessToken'>,
) => Promise<T>;

export interface Profile {
  id: string;
  email: string;
  fullName: string | null;
  phone: string | null;
}

export interface UpdateProfileInput {
  fullName?: string;
  phone?: string;
}

export interface AdministrativeArea {
  id: string;
  code: string;
  name: string;
  level: 'PROVINCE' | 'COMMUNE';
  parentId: string | null;
}

export interface Address {
  id: string;
  recipientName: string;
  phone: string;
  administrativeAreaId: string;
  administrativeArea: {
    id: string;
    code: string;
    name: string;
    province: { id: string; code: string; name: string } | null;
  };
  detailAddress: string;
  postalCode: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAddressInput {
  recipientName: string;
  phone: string;
  administrativeAreaId: string;
  detailAddress: string;
  postalCode?: string | null;
  isDefault?: boolean;
}

export type UpdateAddressInput = Partial<CreateAddressInput>;

export const profileKeys = {
  all: sessionQueryKeys.scope('profile'),
  current: (userId: string) => [...profileKeys.all, userId] as const,
};

export const addressKeys = {
  all: sessionQueryKeys.scope('addresses'),
  list: (userId: string) => [...addressKeys.all, userId] as const,
};

export const areaKeys = {
  all: ['administrative-areas'] as const,
  provinces: () => [...areaKeys.all, 'provinces'] as const,
  communes: (provinceId: string) => [...areaKeys.all, 'communes', provinceId] as const,
};

export const getProfile = (request: AuthenticatedRequest): Promise<Profile> => request('/users/me');

export const updateProfile = (
  request: AuthenticatedRequest,
  data: UpdateProfileInput,
): Promise<Profile> => request('/users/me', { method: 'PATCH', body: data });

export const listAddresses = (request: AuthenticatedRequest): Promise<Address[]> =>
  request('/users/me/addresses');

export const createAddress = (
  request: AuthenticatedRequest,
  data: CreateAddressInput,
): Promise<Address> => request('/users/me/addresses', { method: 'POST', body: data });

export const updateAddress = (
  request: AuthenticatedRequest,
  id: string,
  data: UpdateAddressInput,
): Promise<Address> =>
  request(`/users/me/addresses/${encodeURIComponent(id)}`, { method: 'PATCH', body: data });

export const deleteAddress = (request: AuthenticatedRequest, id: string): Promise<void> =>
  request(`/users/me/addresses/${encodeURIComponent(id)}`, { method: 'DELETE' });

export const listAdministrativeAreas = (parentId?: string): Promise<AdministrativeArea[]> =>
  apiGet<AdministrativeArea[]>('/administrative-areas', parentId ? { parentId } : undefined);
