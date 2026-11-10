-- PH3 Admin.1: danh muc vai la du lieu tham chieu ma ung dung can moi luc chay (dang ky can CUSTOMER,
-- API quan tri can ADMIN), nen nap bang migration: moi moi truong co ngay sau `prisma migrate deploy`,
-- khong phu thuoc seed (production khong chay seed). Xem docs/features/auth/LOG.md (ADR-018).
--
-- Chi them, khong sua ban ghi da co: ON CONFLICT theo ma duy nhat (roles_code_key) nen chay tren CSDL
-- da co CUSTOMER tu seed cu cung an toan, va khong ghi de ten vai ai do da doi.
-- Ma phai khop RoleCode (apps/api/src/modules/auth/role-code.ts); role-code.spec.ts kiem dieu nay.
INSERT INTO "roles" ("code", "name")
VALUES
    ('CUSTOMER', 'Customer'),
    ('ADMIN', 'Administrator')
ON CONFLICT ("code") DO NOTHING;
