# Mô hình dữ liệu và từ điển dữ liệu

Physical database specification chốt cho HT-02. Nguồn chân lý là ERD approved trong diagram-fashion-ecommerce/draft/database; Prisma hiện tại chỉ là mẫu.

## 1. Database conventions

- PostgreSQL 17; UUID PK default gen_random_uuid(); snake_case; UUID immutable, ON UPDATE NO ACTION.
- Timestamp dùng timestamptz. created_at và updated_at hiện hữu của mutable table là required; append-only/event/junction chỉ có created_at required.
- Money luôn decimal(12,2), không dùng Float hoặc Double.
- JSONB chỉ dùng cho flexible configuration, metadata, payload, raw data, hoặc approved snapshot.
- Historical transaction không phụ thuộc catalog/address mutable; Product và ProductVariant không hard-delete sau historical reference.
- Append-only: audit_logs, stock_movements, order_status_history, gateway evidence, outbox events. Reporting là derived/read-only.

## 2. Ownership / classification

| Owner | Physical tables |
|---|---:|
| TAI | 24 |
| DUY | 11 |
| BAO | 16 |

OPTIONAL: wishlists, recently_viewed. DESIGN_PROPOSAL: administrative_areas, shipping_zones, shipping_zone_areas, refund_items. DEFERRED_PHYSICAL_DESIGN: notifications, notification_preferences.

## 3. Enum dictionary

| Enum | Values | Default |
|---|---|---|
| user_status | PENDING_VERIFICATION, ACTIVE, LOCKED, DISABLED | PENDING_VERIFICATION |
| otp_purpose | EMAIL_VERIFICATION, PASSWORD_RESET, GUEST_RETURN_VERIFICATION | — |
| administrative_area_level | PROVINCE, COMMUNE | — |
| stock_movement_type | RECEIPT, SALE, RETURN, ADJUSTMENT | — |
| order_status | PENDING_CONFIRMATION, CONFIRMED, PROCESSING, SHIPPED, DELIVERED, CANCELLED, PARTIALLY_REFUNDED, REFUNDED | — |
| shipment_status | PENDING, IN_TRANSIT, DELIVERED, FAILED, RETURNED | PENDING |
| voucher_status, promotion_status | INACTIVE, ACTIVE | INACTIVE |
| discount_type | PERCENTAGE, FIXED_AMOUNT | — |
| payment_method | COD, ONLINE | — |
| payment_status | PENDING, PROCESSING, SUCCEEDED, FAILED, CANCELLED, EXPIRED | PENDING |
| payment_transaction_status | RECEIVED, PROCESSED, IGNORED, FAILED | — |
| job_status | PENDING, RUNNING, SUCCEEDED, FAILED, CANCELLED | PENDING |
| fit_feedback | TOO_SMALL, TRUE_TO_SIZE, TOO_LARGE | nullable |
| review_status | PENDING, APPROVED, REJECTED | PENDING |
| return_status | REQUESTED, APPROVED, REJECTED, RECEIVED, COMPLETED, CANCELLED | REQUESTED |
| return_item_resolution | REFUND, EXCHANGE | — |
| refund_status | PENDING, PROCESSING, SUCCEEDED, FAILED, CANCELLED | PENDING |
| candidate_status | PENDING_REVIEW, DUPLICATE, APPROVED, REJECTED, IMPORTED | PENDING_REVIEW |

## 4. Identity / Profile / Shipping

### users
Owner: TAI. Domain: Identity. Classification: Core. Purpose: account and authentication.

| Column | DB Type | Required | Key/Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id; email; password_hash; status | uuid; varchar; varchar; user_status | Yes | PK; UQ; —; — | UUID; —; —; PENDING_VERIFICATION | Identifier; login email; password hash; lifecycle |
| avatar_url; email_verified_at | varchar; timestamptz | No | — | NULL | Avatar; verification event |
| created_at; updated_at | timestamptz | Yes | — | CURRENT_TIMESTAMP | Audit timestamps |

Relationships: User N:M Role through user_roles; 1:N addresses/refresh tokens/reviews. Indexes: UQ(email). Lifecycle: access tokens are never persisted.

### roles, user_roles
Owner: TAI. Domain: Authorization. Classification: Core/JUNCTION. Purpose: role catalog and assignment.

| Table | Columns, constraints and meaning |
|---|---|
| roles | id uuid PK; code varchar UQ; name varchar; created_at/updated_at timestamptz required. Stable role catalog. |
| user_roles | user_id uuid PK/FK users; role_id uuid PK/FK roles; created_at timestamptz required. Composite PK prevents duplicate assignment. |

Relationships: User N:M Role through user_roles. Delete: user_roles cascades from User/Role.

### otp_codes, refresh_tokens, audit_logs
Owner: TAI. Domain: Identity/Audit. Classification: EPHEMERAL, EPHEMERAL, APPEND_ONLY.

| Table | Columns, constraints and meaning |
|---|---|
| otp_codes | id UUID PK; email varchar required; user_id UUID nullable FK users; purpose otp_purpose; code_hash; expires_at; attempt_count/send_count integer required default 0; consumed_at nullable; created_at/updated_at required. Hashed OTP only. |
| refresh_tokens | id UUID PK; user_id required FK; token_hash UQ; family_id; expires_at; revoked_at nullable; replaced_by_token_id nullable self FK; timestamps required. |
| audit_logs | id UUID PK; actor_user_id nullable FK SET NULL; action/entity_type/entity_id required; metadata JSONB nullable; created_at required. |

Indexes: refresh token hash UQ plus user_id, family_id, expires_at. Audit is append-only.

### administrative_areas, addresses, shipping_zones, shipping_zone_areas, shipping_rates
Owner: TAI. Domain: Address/Shipping. Classification: areas/zones/mapping DESIGN_PROPOSAL; address/rates Core.

| Table | Columns, constraints and meaning |
|---|---|
| administrative_areas | id PK; code UQ; name; level administrative_area_level; parent_id nullable self FK; is_active default true; timestamps required. Province to Commune only. |
| addresses | id PK; user_id FK; recipient_name; phone; administrative_area_id FK; detail_address; postal_code nullable; is_default default false; timestamps required. Area is Commune. |
| shipping_zones | id PK; code UQ; name; is_active default true; timestamps required. |
| shipping_zone_areas | shipping_zone_id plus administrative_area_id composite PK/FK; area additionally UQ; created_at required. |
| shipping_rates | id PK; shipping_zone_id FK; min/max weight grams nullable; fee decimal(12,2); is_active default true; timestamps required. |

Checks: shipping fee >= 0; lower weight >= 0; upper weight > lower. Address default uses partial UQ(user_id) where is_default true. Area maps to one Commune-level zone. Weight ranges/no overlap are application validation; base area rate is baseline.

## 5. Catalog / Discovery

### categories, products, product_variants, product_images
Owner: BAO. Domain: Catalog. Classification: Core.

| Table | Columns, constraints and meaning |
|---|---|
| categories | id UUID PK; name; slug UQ; timestamps required. |
| products | id PK; category_id FK; name; slug UQ; description nullable; attributes JSONB nullable; is_active default true; timestamps required. |
| product_variants | id PK; product_id FK; sku UQ; size/color nullable; price decimal(12,2); is_active default true; timestamps required. |
| product_images | id PK; product_id FK; url; sort_order required; timestamps required. |

Checks/indexes: price >= 0; product image sort_order >= 0 and UQ(product_id,sort_order); intended PostgreSQL 17 unique nulls not distinct(product_id,size,color). Product/Variant are deactivated, not hard-deleted, once referenced historically.

### homepage_sections, search_query_logs, search_configurations, wishlists, recently_viewed
Owner: BAO. Domain: Discovery. Classification: Core except OPTIONAL wishlist/recent view.

| Table | Columns, constraints and meaning |
|---|---|
| homepage_sections | id PK; section_type; display_order CHECK >=0; configuration JSONB nullable; is_active default true; timestamps required. |
| search_query_logs | id PK; user_id nullable FK SET NULL; query_text; result_count required CHECK >=0; created_at required. |
| search_configurations | id PK; configuration_key UQ; configuration_value JSONB; timestamps required. |
| wishlists | id PK; user_id/product_id required FKs CASCADE; created_at required; UQ(user_id,product_id). |
| recently_viewed | id PK; user_id/product_id required FKs CASCADE; viewed_at required; UQ(user_id,product_id). |

Indexes: search logs created_at and user_id/created_at. Repeat recent view updates viewed_at, not event history. JSONB/search indexes defer until measured.

## 6. Commerce / Inventory / Fulfillment

### inventory, stock_movements, inventory_reservations
Owner: DUY. Domain: Inventory. Classification: Core/APPEND_ONLY/EPHEMERAL.

| Table | Columns, constraints and meaning |
|---|---|
| inventory | id PK; product_variant_id FK/UQ; quantity_on_hand required CHECK >=0; timestamps required. Physical on-hand stock. |
| stock_movements | id PK; product_variant_id FK RESTRICT; movement_type; quantity_delta required CHECK not zero; created_at required. Physical receipt/sale/return/adjustment history. |
| inventory_reservations | id PK; product_variant_id/order_id required FKs; quantity >0; expires_at; released_at nullable; timestamps required; UQ(order_id,product_variant_id). |

Available = quantity_on_hand minus active reservations. Reservation/release never changes on-hand and expiry releases exactly once transactionally. Index reservations by expires_at and order_id.

### carts, cart_items, orders, order_items, order_status_history, shipments
Owner: DUY. Domain: Commerce/Fulfillment. Classification: Core.

| Table | Columns, constraints and meaning |
|---|---|
| carts | id PK; user_id FK/UQ CASCADE; timestamps required. One persistent authenticated cart. |
| cart_items | id PK; cart_id FK CASCADE; product_variant_id FK; quantity >0; is_selected default true; timestamps required; UQ(cart_id,product_variant_id). |
| orders | id PK; user_id nullable FK SET NULL; order_code UQ; customer_email; status order_status; shipping_rate_id nullable FK SET NULL; required delivery snapshot; required subtotal/discount/shipping/total decimal(12,2); timestamps required. |
| order_items | id PK; order_id/product_variant_id FKs RESTRICT; quantity >0; unit_price decimal >=0; required product_snapshot JSONB; timestamps required; UQ(order_id,product_variant_id). |
| order_status_history | id PK; order_id FK RESTRICT; status; actor_user_id nullable FK SET NULL; created_at required. Append-only. |
| shipments | id PK; order_id FK/UQ; tracking_number nullable; status default PENDING; timestamps required. |

Order invariants: subtotal=sum lines; discount <= subtotal; total=subtotal-discount+shipping. Snapshots preserve historical address/product display. One Order has zero/one Shipment. Index history(order_id,created_at).

## 7. Payment / Promotion

### vouchers, promotions, voucher_usages
Owner: BAO. Domain: Promotion. Classification: Core.

| Table | Columns, constraints and meaning |
|---|---|
| vouchers | id PK; code UQ; status default INACTIVE; discount type/value; optional max/min money, limits, dates; timestamps required. |
| promotions | id PK; name; discount type/value; optional max/min money and conditions JSONB; status default INACTIVE; optional dates; timestamps required. |
| voucher_usages | id PK; voucher_id/order_id required FKs RESTRICT; user_id nullable FK SET NULL; discount_amount decimal required >=0; created_at required; UQ(order_id). |

Discount values positive; money limits non-negative; dates valid. Voucher usage is immutable checkout contribution; automatic promotion may also contribute.

### payments, payment_transactions, outbox_events, jobs
Owner: BAO. Domain: Payment/Integration. Classification: Core.

| Table | Columns, constraints and meaning |
|---|---|
| payments | id PK; order_id FK RESTRICT; method; status default PENDING; amount decimal >0; timestamps required. |
| payment_transactions | id PK; payment_id FK RESTRICT; gateway; external_transaction_id; status; payload JSONB nullable; timestamps required; UQ(gateway,external_transaction_id). |
| outbox_events | id PK; event/aggregate/payload fields required; published_at nullable; created_at required. Polymorphic aggregate has no FK. |
| jobs | id PK; job_type; status default PENDING; payload nullable; scheduled_at nullable; timestamps required. |

Order 1:N Payment; Payment 1:N Refund; no split payment; one captured Payment per Order; partial refunds cannot exceed captured amount. Index payment transactions(payment_id,created_at), outbox(published_at,created_at), jobs(status,scheduled_at).

## 8. Review / Return / Refund

### reviews, review_media, returns, return_items, return_media, refunds, refund_items
Owner: TAI. Domain: After-sales. Classification: refund_items DESIGN_PROPOSAL; others Core.

| Table | Columns, constraints and meaning |
|---|---|
| reviews | id PK; user_id/product_id/order_item_id required FKs; order_item UQ; rating 1..5; content/fit/deleted_at nullable; moderation status default PENDING; timestamps required. |
| review_media | id PK; review_id FK CASCADE; url; sort_order required >=0; timestamps required; UQ(review_id,sort_order). |
| returns | id PK; user_id nullable FK SET NULL; order_id FK RESTRICT; status default REQUESTED; reason nullable; timestamps required. |
| return_items | id PK; return_id/order_item_id FKs RESTRICT; quantity >0; resolution REFUND/EXCHANGE; replacement variant nullable FK RESTRICT; timestamps required; UQ(return_id,order_item_id). |
| return_media | id PK; return_id FK CASCADE; url; timestamps required. |
| refunds | id PK; return_id/payment_id FKs RESTRICT; amount decimal >0; status default PENDING; idempotency key UQ; external ID/reason nullable; timestamps required. |
| refund_items | id PK; refund_id/return_item_id FKs RESTRICT; quantity >0; amount decimal >0; timestamps required; UQ(refund_id,return_item_id). |

Review must match purchaser/product and soft delete restores existing row. Guest Return uses order_code, customer_email snapshot and GUEST_RETURN_VERIFICATION OTP. Cumulative return/refund rules are application invariants. Indexes: reviews(product_id,moderation_status,created_at), reviews(user_id), returns(order_id/user_id/status+created_at), refund references, and media foreign keys.

## 9. Staging

### staging.raw_product_records, staging.normalized_product_candidates
Owner: TAI. Domain: Staging. Classification: STAGING.

| Table | Columns, constraints and meaning |
|---|---|
| raw_product_records | id PK; source/source_product_id/source_url; raw_payload JSONB; collected_at; timestamps all required; UQ(source,source_product_id). |
| normalized_product_candidates | id PK; raw_product_record_id FK/UQ; name; optional category_name/price/attributes/image_hash/imported_at; normalization_status default PENDING_REVIEW; timestamps required. |

Candidate price >=0. Normalize/deduplicate/approve before import. Index candidate status/import time. Cleanup requires an explicit retention policy.

## 10. Reporting

All tables are DERIVED / READ ONLY, rebuildable and have no transactional FK.

| Table | Columns, constraints and meaning |
|---|---|
| reporting.daily_revenue | report_date PK; order_count required >=0; revenue_amount decimal required >=0; refreshed_at required. One row/day. |
| reporting.top_selling_products | report_date/product_id composite PK; quantity_sold required >=0; revenue_amount decimal required >=0; refreshed_at required. One row/product/day. |
| reporting.orders_by_status | report_date/order_status composite PK; order_count required >=0; refreshed_at required. One row/status/day. |
| reporting.low_stock | product_variant_id PK; available_quantity required >=0; refreshed_at required. Current snapshot. |

## 11. Deferred physical design

### notifications
Owner: DUY. Classification: DEFERRED_PHYSICAL_DESIGN.

| Column | DB Type | Required | Key/Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | uuid | Yes | PK | gen_random_uuid() | Notification identifier |
| user_id | uuid | Yes | FK users | — | Recipient |

### notification_preferences
Owner: DUY. Classification: DEFERRED_PHYSICAL_DESIGN.

| Column | DB Type | Required | Key/Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | uuid | Yes | PK | gen_random_uuid() | Preference identifier |
| user_id | uuid | Yes | FK users | — | Owner |

No content, channel, read, retry, preference type, default, or index is approved. Neither table is in Prisma baseline.

## 12. Cross-domain invariants

- Order 1:N Payment; retry/method change creates Payment; at most one captured Payment; no split payment.
- Payment 1:N Refund; refund targets captured payment; partial total cannot exceed capture.
- OrderItem is the authoritative purchased line for Review and ReturnItem.
- Historical transaction never relies on mutable catalog/address data.
- Guest return is supported through order_code, customer email snapshot, and OTP verification.

## 13. Referential-action policy

Historical, financial and transactional parent deletion is RESTRICT. Optional historical actors/references use SET NULL. Owned ephemeral children/junctions use CASCADE. Exact actions are documented beside the affected tables.

## 14. Index strategy

Use all PK/UQ and explicit indexes above. Defer until measured: GIN products.attributes, promotion conditions JSONB, payload/metadata/snapshot JSONB, and additional search indexes. Do not over-index JSONB.
