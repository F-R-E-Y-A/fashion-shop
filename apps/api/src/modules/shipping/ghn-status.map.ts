import type { ShipmentStatus } from './dto/shipment.dto.js';

export interface GhnMappedStatus {
  status: ShipmentStatus;
  carrierStatus: string;
  defaultNote: string;
}

const GHN_STATUS_TABLE: Record<string, { status: ShipmentStatus; note: string }> = {
  ready_to_pick: {
    status: 'PENDING',
    note: 'GHN đã tiếp nhận đơn hàng, chờ tài xế đến lấy.',
  },
  picking: {
    status: 'IN_TRANSIT',
    note: 'Tài xế GHN đang đến shop lấy hàng.',
  },
  money_collect_picking: {
    status: 'IN_TRANSIT',
    note: 'Tài xế GHN đang lấy hàng và xử lý thu hộ.',
  },
  picked: {
    status: 'IN_TRANSIT',
    note: 'GHN đã lấy hàng từ shop.',
  },
  storing: {
    status: 'IN_TRANSIT',
    note: 'Hàng đang được lưu tại bưu cục GHN.',
  },
  sorting: {
    status: 'IN_TRANSIT',
    note: 'Hàng đang được phân loại tại kho trung chuyển GHN.',
  },
  transporting: {
    status: 'IN_TRANSIT',
    note: 'Hàng đang được luân chuyển giữa các kho GHN.',
  },
  delivering: {
    status: 'IN_TRANSIT',
    note: 'Shipper GHN đang giao hàng đến người nhận.',
  },
  money_collect_delivering: {
    status: 'IN_TRANSIT',
    note: 'Shipper GHN đang giao và thu hộ tiền hàng.',
  },
  delivered: {
    status: 'DELIVERED',
    note: 'GHN đã giao hàng thành công đến người nhận.',
  },
  delivery_fail: {
    status: 'FAILED',
    note: 'GHN giao hàng chưa thành công.',
  },
  waiting_to_return: {
    status: 'FAILED',
    note: 'Đơn hàng đang chờ hoàn về shop.',
  },
  return: {
    status: 'FAILED',
    note: 'GHN đã kích hoạt quy trình hoàn hàng.',
  },
  return_transporting: {
    status: 'FAILED',
    note: 'Hàng hoàn đang được luân chuyển về kho shop.',
  },
  return_sorting: {
    status: 'FAILED',
    note: 'Hàng hoàn đang được phân loại trả về shop.',
  },
  returning: {
    status: 'FAILED',
    note: 'Shipper GHN đang trả hàng hoàn về shop.',
  },
  return_fail: {
    status: 'FAILED',
    note: 'GHN trả hàng về shop chưa thành công.',
  },
  returned: {
    status: 'RETURNED',
    note: 'GHN đã hoàn trả hàng về tới kho shop.',
  },
  cancel: {
    status: 'RETURNED',
    note: 'Vận đơn đã bị hủy trên GHN.',
  },
  exception: {
    status: 'FAILED',
    note: 'Vận đơn gặp sự cố ngoại lệ trên GHN, cần shop đối soát.',
  },
  lost: {
    status: 'FAILED',
    note: 'GHN ghi nhận hàng bị thất lạc.',
  },
  damage: {
    status: 'FAILED',
    note: 'GHN ghi nhận hàng bị hư hỏng khi vận chuyển.',
  },
  scrap: {
    status: 'RETURNED',
    note: 'Vận đơn đã đóng trạng thái hủy/tiêu hủy trên GHN.',
  },
};

export function mapGhnStatus(rawStatus: string | undefined | null): GhnMappedStatus | null {
  if (!rawStatus) return null;
  const normalized = rawStatus.trim().toLowerCase();
  const entry = GHN_STATUS_TABLE[normalized];
  if (!entry) return null;
  return {
    status: entry.status,
    carrierStatus: normalized,
    defaultNote: entry.note,
  };
}
