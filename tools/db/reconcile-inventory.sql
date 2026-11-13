-- tools/db/reconcile-inventory.sql: doi soat ton kho CHI DOC cho KPI K3 "khong ban vuot ton".
-- Moi kiem tra la mot bat bien ma ma nguon bao dam; chu thich tro toi tep:dong giu bat bien do,
-- tinh tu apps/api/src/modules/ neu khong ghi khac, tai develop af438f2.
-- Cach chay va cach doc ket qua: docs/features/inventory/README.md, muc "Doi soat ton kho (K3)".
--   psql -X -v ON_ERROR_STOP=1 [-v so_cai=tuong_doi] -f tools/db/reconcile-inventory.sql
-- Ma thoat: 0 = khong vi pham; 3 = co vi pham (khoi DO cuoi) hoac loi SQL.
-- Khong ghi CSDL: transaction READ ONLY; doi_soat.* chi la bien cau hinh cua transaction nay.

\set ON_ERROR_STOP on

-- so_cai=tuyet_doi (mac dinh): ton phai bang tong StockMovement. so_cai=tuong_doi: chap nhan so du
-- dau ky nap ngoai so (staging chep bang inventory, test:load tao inventory thang). Mac dinh chat
-- de quen co thi bao thua, khong bao thieu.
\if :{?so_cai}
\else
\set so_cai tuyet_doi
\endif

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL doi_soat.so_cai = :'so_cai';
DO $$
BEGIN
  IF current_setting('doi_soat.so_cai') NOT IN ('tuyet_doi', 'tuong_doi') THEN
    RAISE EXCEPTION 'so_cai phai la tuyet_doi hoac tuong_doi, nhan "%".',
      current_setting('doi_soat.so_cai');
  END IF;
END $$;

-- Tinh moi kiem tra mot lan tren cung snapshot. Ket qua (so vi pham, toi da 20 dong mau) nam o
-- doi_soat.ket_qua de bang tom tat, bang chi tiet va khoi DO cuoi dung chung, khong chep dieu kien.
WITH
-- Don da qua diem commit. Chi commit dua don toi CONFIRMED (checkout/settlement.service.ts:99-100)
-- va PROCESSING tu PENDING_CONFIRMATION (checkout/order-admin.service.ts:39-43); PROCESSING con lai
-- di tu CONFIRMED (order-admin.service.ts:51-53); SHIPPED, DELIVERED chi sau PROCESSING
-- (orders/orders.service.ts:48-49). Lich su ghi cung transaction voi moi buoc (orders.service.ts:203,
-- :222) nen don huy hay hoan sau commit van nhan ra; xet them trang thai cho dong thieu lich su.
don_da_chot AS (
  SELECT o.id
  FROM orders o
  WHERE o.status IN ('CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED')
     OR EXISTS (SELECT 1 FROM order_status_history h
                WHERE h.order_id = o.id
                  AND h.status IN ('CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'))
),
so_cai AS (
  SELECT product_variant_id, sum(quantity_delta) AS tong
  FROM stock_movements
  GROUP BY product_variant_id
),

-- a) Ton vat ly khong am. CHECK inventory_quantity_on_hand_nonnegative_ck chan o tang CSDL
--    (apps/api/prisma/migrations/20260924184146_ht02_final_baseline/migration.sql:1192-1194); commit
--    chi tru khi du ton (inventory/inventory-operations.ts:40-44); kiem ke chi nhan 0..1e6
--    (inventory/stock-count.ts:38). Kiem lai de bat CSDL bi mat rang buoc.
a_ton_am AS (
  SELECT pv.sku AS khoa, jsonb_build_object('sku', pv.sku, 'ton', i.quantity_on_hand) AS chi_tiet
  FROM inventory i
  JOIN product_variants pv ON pv.id = i.product_variant_id
  WHERE i.quantity_on_hand < 0
),

-- b) Hold con hieu luc (chua release, expires_at > now) khong vuot ton, tuc ton kha dung >= 0.
--    reserve khoa bien the roi tu choi khi kha dung < so luong, bien the chua co dong ton coi nhu -1
--    (inventory/inventory.service.ts:20-30); kha dung = ton tru hold chua release va chua het han
--    (inventory.service.ts:88-104). commit tru ton va nha hold cung luong trong mot transaction
--    (inventory/inventory-operations.ts:39-57); kiem ke tu choi so nho hon luong dang giu
--    (inventory/stock-count.ts:84-113); restock chi cong (inventory.service.ts:63-67). App so han
--    bang gio Node, o day bang now() cua CSDL: hai dong ho lech thi sat moc het han co the bao nham.
b_giu_vuot_ton AS (
  SELECT pv.sku AS khoa,
         jsonb_build_object('sku', pv.sku, 'ton', i.quantity_on_hand, 'dang_giu', g.dang_giu) AS chi_tiet
  FROM (SELECT product_variant_id, sum(quantity) AS dang_giu
        FROM inventory_reservations
        WHERE released_at IS NULL AND expires_at > now()
        GROUP BY product_variant_id) g
  JOIN product_variants pv ON pv.id = g.product_variant_id
  LEFT JOIN inventory i ON i.product_variant_id = g.product_variant_id
  WHERE g.dang_giu > coalesce(i.quantity_on_hand, 0)
),

-- c1) Moi SALE khop mot dong don: co order_id, cung (don, bien the) voi order_items,
--     quantity_delta = -so luong, khong trung. commitStock ghi SALE -item.quantity cho tung dong
--     (inventory/inventory-operations.ts:39-53); dong lay tu order_items
--     (checkout/checkout.service.ts:354-359), goi o settlement.service.ts:96-99 va
--     order-admin.service.ts:38-39. Index unique (order_id, bien the, loai)
--     (apps/api/prisma/migrations/20261018090000_ph11_checkout_payment/migration.sql:24-25) khong
--     chan dong order_id NULL nen kiem rieng.
c1_sale_lech_dong_don AS (
  SELECT coalesce(o.order_code, '-') || ' ' || pv.sku AS khoa,
         jsonb_build_object('don', o.order_code, 'sku', pv.sku, 'sale', s.quantity_delta,
                            'so_luong_dong', oi.quantity, 'so_sale_cung_dong', s.so_dong) AS chi_tiet
  FROM (SELECT m.*, count(*) OVER (PARTITION BY m.order_id, m.product_variant_id) AS so_dong
        FROM stock_movements m
        WHERE m.movement_type = 'SALE') s
  JOIN product_variants pv ON pv.id = s.product_variant_id
  LEFT JOIN orders o ON o.id = s.order_id
  LEFT JOIN order_items oi
    ON oi.order_id = s.order_id AND oi.product_variant_id = s.product_variant_id
  WHERE s.order_id IS NULL OR oi.id IS NULL OR s.quantity_delta <> -oi.quantity OR s.so_dong > 1
),

-- c2) Don da qua commit, hoac da co SALE, phai co SALE cho moi dong: commitStock ghi du moi dong
--     hoac rollback ca transaction (inventory/inventory-operations.ts:39-53).
c2_don_da_chot_thieu_sale AS (
  SELECT o.order_code || ' ' || pv.sku AS khoa,
         jsonb_build_object('don', o.order_code, 'trang_thai', o.status, 'sku', pv.sku,
                            'so_luong_dong', oi.quantity) AS chi_tiet
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  JOIN product_variants pv ON pv.id = oi.product_variant_id
  WHERE (EXISTS (SELECT 1 FROM don_da_chot d WHERE d.id = oi.order_id)
         OR EXISTS (SELECT 1 FROM stock_movements m
                    WHERE m.order_id = oi.order_id AND m.movement_type = 'SALE'))
    AND NOT EXISTS (SELECT 1 FROM stock_movements m
                    WHERE m.order_id = oi.order_id
                      AND m.product_variant_id = oi.product_variant_id
                      AND m.movement_type = 'SALE')
),

-- c3) Don chua toi commit khong co SALE: commit chi duoc goi o checkout/settlement.service.ts:99 va
--     checkout/order-admin.service.ts:39, ngay sau do chuyen CONFIRMED/PROCESSING cung transaction;
--     khong buoc nao quay ve PENDING_* (orders/orders.service.ts:40-54).
c3_don_chua_chot_co_sale AS (
  SELECT o.order_code || ' ' || pv.sku AS khoa,
         jsonb_build_object('don', o.order_code, 'trang_thai', o.status, 'sku', pv.sku,
                            'sale', m.quantity_delta) AS chi_tiet
  FROM stock_movements m
  JOIN orders o ON o.id = m.order_id
  JOIN product_variants pv ON pv.id = m.product_variant_id
  WHERE m.movement_type = 'SALE'
    AND NOT EXISTS (SELECT 1 FROM don_da_chot d WHERE d.id = m.order_id)
),

-- d1) Moi RETURN co SALE cung (don, bien the), cong lai dung luong da tru, mot lan. restock tu choi
--     don chua SALE hoac da RETURN, ghi +item.quantity cho tung dong
--     (inventory/inventory.service.ts:58-78; goi o checkout/checkout.service.ts:373,
--     checkout/order-admin.service.ts:96). Mot lan nho index unique nhu c1, tru order_id NULL.
d1_return_lech_sale AS (
  SELECT coalesce(o.order_code, '-') || ' ' || pv.sku AS khoa,
         jsonb_build_object('don', o.order_code, 'sku', pv.sku, 'return', r.quantity_delta,
                            'sale', s.tong_sale, 'so_return_cung_dong', r.so_dong) AS chi_tiet
  FROM (SELECT m.*, count(*) OVER (PARTITION BY m.order_id, m.product_variant_id) AS so_dong
        FROM stock_movements m
        WHERE m.movement_type = 'RETURN') r
  JOIN product_variants pv ON pv.id = r.product_variant_id
  LEFT JOIN orders o ON o.id = r.order_id
  LEFT JOIN LATERAL (SELECT sum(m.quantity_delta) AS tong_sale
                     FROM stock_movements m
                     WHERE m.movement_type = 'SALE'
                       AND m.order_id = r.order_id
                       AND m.product_variant_id = r.product_variant_id) s ON true
  WHERE r.order_id IS NULL OR s.tong_sale IS NULL OR r.quantity_delta <> -s.tong_sale
     OR r.so_dong > 1
),

-- d2) Don bi huy sau commit phai co RETURN cho moi SALE. Chi hai duong huy don da SALE, ca hai
--     restock truoc khi chuyen CANCELLED: cancelAndRefund tu CONFIRMED
--     (checkout/checkout.service.ts:283-284, :373-374) va deliveryFailed tu PROCESSING/SHIPPED
--     (checkout/order-admin.service.ts:94-104); cancel chi huy don PENDING_*
--     (checkout.service.ts:391-400). Hoan tien don da giao khong tra kho (ADR-038) nen chi xet don
--     tung CANCELLED.
d2_huy_sau_chot_thieu_return AS (
  SELECT o.order_code || ' ' || pv.sku AS khoa,
         jsonb_build_object('don', o.order_code, 'trang_thai', o.status, 'sku', pv.sku,
                            'sale', s.quantity_delta) AS chi_tiet
  FROM stock_movements s
  JOIN orders o ON o.id = s.order_id
  JOIN product_variants pv ON pv.id = s.product_variant_id
  WHERE s.movement_type = 'SALE'
    AND (o.status = 'CANCELLED'
         OR EXISTS (SELECT 1 FROM order_status_history h
                    WHERE h.order_id = o.id AND h.status = 'CANCELLED'))
    AND NOT EXISTS (SELECT 1 FROM stock_movements r
                    WHERE r.movement_type = 'RETURN'
                      AND r.order_id = s.order_id
                      AND r.product_variant_id = s.product_variant_id)
),

-- e) Don da roi PENDING_PAYMENT/PENDING_CONFIRMATION khong con hold chua release: moi loi ra deu nha
--    hold cung transaction voi buoc chuyen (commit: inventory/inventory-operations.ts:54-57; huy:
--    checkout/checkout.service.ts:403; tien ve khi hold khong hop le:
--    checkout/settlement.service.ts:103). Hold het han cua don con cho la binh thuong, worker huy
--    sau (settlement.service.ts:181-187), nen khong xet han o day.
e_hold_chua_nha AS (
  SELECT o.order_code || ' ' || pv.sku AS khoa,
         jsonb_build_object('don', o.order_code, 'trang_thai', o.status, 'sku', pv.sku,
                            'giu', r.quantity, 'het_han', r.expires_at) AS chi_tiet
  FROM inventory_reservations r
  JOIN orders o ON o.id = r.order_id
  JOIN product_variants pv ON pv.id = r.product_variant_id
  WHERE r.released_at IS NULL
    AND o.status NOT IN ('PENDING_PAYMENT', 'PENDING_CONFIRMATION')
),

-- f) So bien dong giai thich ton. Ca ba duong doi ton trong ma deu ghi movement cung transaction:
--    commit SALE (inventory/inventory-operations.ts:40-52), restock RETURN
--    (inventory/inventory.service.ts:63-75), kiem ke ADJUSTMENT = sau - truoc
--    (inventory/stock-count.ts:123-137). Ton nap thang thi khong qua so: staging chep bang inventory
--    (docs/features/platform/staging.md:61-76), test:load (apps/api/test/load/checkout-hot-sku.load.ts:59-61).
--    lech = ton - tong movement = so du dau ky ngoai so. tuyet_doi: lech <> 0 la vi pham.
--    tuong_doi: chi lech < 0 (ton giam ma khong ghi so); ton tang ngoai so khong phan biet duoc voi
--    so du dau ky. Movement cua bien the khong co dong ton thi vi pham o ca hai che do.
f_so_cai_lech_ton AS (
  SELECT pv.sku AS khoa,
         jsonb_build_object('sku', pv.sku, 'ton', i.quantity_on_hand,
                            'tong_movement', coalesce(m.tong, 0),
                            'lech', i.quantity_on_hand - coalesce(m.tong, 0)) AS chi_tiet
  FROM inventory i
  FULL JOIN so_cai m ON m.product_variant_id = i.product_variant_id
  JOIN product_variants pv ON pv.id = coalesce(i.product_variant_id, m.product_variant_id)
  WHERE i.id IS NULL
     OR i.quantity_on_hand < coalesce(m.tong, 0)
     OR (current_setting('doi_soat.so_cai') = 'tuyet_doi' AND i.quantity_on_hand <> coalesce(m.tong, 0))
),

-- Kiem tra khong vi pham van ra mot dong NULL, de bang tom tat du ten va so 0.
mot AS (SELECT 1),
vi_pham AS (
            SELECT 1 AS thu_tu, 'a_ton_am' AS kiem_tra, v.khoa, v.chi_tiet
            FROM mot LEFT JOIN a_ton_am v ON true
  UNION ALL SELECT 2, 'b_giu_vuot_ton', v.khoa, v.chi_tiet
            FROM mot LEFT JOIN b_giu_vuot_ton v ON true
  UNION ALL SELECT 3, 'c1_sale_lech_dong_don', v.khoa, v.chi_tiet
            FROM mot LEFT JOIN c1_sale_lech_dong_don v ON true
  UNION ALL SELECT 4, 'c2_don_da_chot_thieu_sale', v.khoa, v.chi_tiet
            FROM mot LEFT JOIN c2_don_da_chot_thieu_sale v ON true
  UNION ALL SELECT 5, 'c3_don_chua_chot_co_sale', v.khoa, v.chi_tiet
            FROM mot LEFT JOIN c3_don_chua_chot_co_sale v ON true
  UNION ALL SELECT 6, 'd1_return_lech_sale', v.khoa, v.chi_tiet
            FROM mot LEFT JOIN d1_return_lech_sale v ON true
  UNION ALL SELECT 7, 'd2_huy_sau_chot_thieu_return', v.khoa, v.chi_tiet
            FROM mot LEFT JOIN d2_huy_sau_chot_thieu_return v ON true
  UNION ALL SELECT 8, 'e_hold_chua_nha', v.khoa, v.chi_tiet
            FROM mot LEFT JOIN e_hold_chua_nha v ON true
  UNION ALL SELECT 9, 'f_so_cai_lech_ton (' || current_setting('doi_soat.so_cai') || ')', v.khoa, v.chi_tiet
            FROM mot LEFT JOIN f_so_cai_lech_ton v ON true
),
tong_hop AS (
  SELECT d.thu_tu, d.kiem_tra, d.so_vi_pham, coalesce(m.mau, '[]'::jsonb) AS mau
  FROM (SELECT thu_tu, kiem_tra, count(khoa) AS so_vi_pham
        FROM vi_pham
        GROUP BY thu_tu, kiem_tra) d
  LEFT JOIN LATERAL (SELECT jsonb_agg(t.chi_tiet ORDER BY t.khoa) AS mau
                     FROM (SELECT v.khoa, v.chi_tiet
                           FROM vi_pham v
                           WHERE v.thu_tu = d.thu_tu AND v.khoa IS NOT NULL
                           ORDER BY v.khoa
                           LIMIT 20) t) m ON true
),
-- Chi de doc: bao nhieu bien the, bao nhieu don vi ton nam ngoai so (so du dau ky).
ngoai_so AS (
  SELECT count(*) AS bien_the, coalesce(sum(i.quantity_on_hand - coalesce(m.tong, 0)), 0) AS don_vi
  FROM inventory i
  LEFT JOIN so_cai m ON m.product_variant_id = i.product_variant_id
  WHERE i.quantity_on_hand <> coalesce(m.tong, 0)
)
SELECT set_config('doi_soat.ket_qua', jsonb_build_object(
         'kiem_tra', (SELECT jsonb_agg(jsonb_build_object('kiem_tra', kiem_tra,
                                                          'so_vi_pham', so_vi_pham,
                                                          'mau', mau) ORDER BY thu_tu)
                      FROM tong_hop),
         'tong', (SELECT count(*) FROM vi_pham WHERE khoa IS NOT NULL),
         'bien_the_ngoai_so', (SELECT bien_the FROM ngoai_so),
         'don_vi_ngoai_so', (SELECT don_vi FROM ngoai_so))::text, true) AS ket_qua
\gset

-- Boi canh: CSDL nao, moc thoi gian cua snapshot, che do so cai, ton nam ngoai so.
SELECT current_database() AS co_so_du_lieu,
       now() AS thoi_diem,
       current_setting('doi_soat.so_cai') AS so_cai,
       (current_setting('doi_soat.ket_qua')::jsonb ->> 'bien_the_ngoai_so')::int AS bien_the_ton_ngoai_so,
       (current_setting('doi_soat.ket_qua')::jsonb ->> 'don_vi_ngoai_so')::int AS don_vi_ton_ngoai_so;

-- Bang tom tat: moi kiem tra mot dong, TONG o cuoi.
SELECT kiem_tra, so_vi_pham
FROM (SELECT k.thu_tu, k.r ->> 'kiem_tra' AS kiem_tra, (k.r ->> 'so_vi_pham')::int AS so_vi_pham
      FROM jsonb_array_elements(current_setting('doi_soat.ket_qua')::jsonb -> 'kiem_tra')
           WITH ORDINALITY AS k(r, thu_tu)
      UNION ALL
      SELECT 1000, 'TONG', (current_setting('doi_soat.ket_qua')::jsonb ->> 'tong')::int) t
ORDER BY thu_tu;

-- Chi tiet: toi da 20 dong cho moi kiem tra co vi pham; khong vi pham thi 0 dong.
SELECT k.r ->> 'kiem_tra' AS kiem_tra, m.chi_tiet
FROM jsonb_array_elements(current_setting('doi_soat.ket_qua')::jsonb -> 'kiem_tra')
     WITH ORDINALITY AS k(r, thu_tu)
CROSS JOIN LATERAL jsonb_array_elements(k.r -> 'mau') WITH ORDINALITY AS m(chi_tiet, hang)
ORDER BY k.thu_tu, m.hang;

-- Co vi pham thi bao loi: psql -v ON_ERROR_STOP=1 dung tai day va thoat ma 3.
DO $$
DECLARE
  tong int := (current_setting('doi_soat.ket_qua')::jsonb ->> 'tong')::int;
BEGIN
  IF tong > 0 THEN
    RAISE EXCEPTION 'Doi soat ton kho: % vi pham (so_cai=%). Xem bang tom tat va chi tiet o tren.',
      tong, current_setting('doi_soat.so_cai');
  END IF;
  RAISE NOTICE 'Doi soat ton kho: 0 vi pham (so_cai=%).', current_setting('doi_soat.so_cai');
END $$;

COMMIT;
