import { useQuery } from '@tanstack/react-query';
import { type CSSProperties, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import { ApiError, formatPrice, pageTitle } from '@/core';
import { AddToCartButton } from '@/features/cart';
import { ProductReviews, RatingBadge } from '@/features/reviews';
import { ErrorNote, Lightbox, SkeletonDetail } from '@/ui';

import { getProductDetail, getRelatedProducts, productKeys } from '../api/index.js';
import { Breadcrumb } from '../components/Breadcrumb.js';
import { ProductGrid } from '../components/ProductGrid.js';
import { SectionHeader } from '../components/SectionHeader.js';
import { ArcGallery } from '../detail/ArcGallery.js';
import {
  availableSizes,
  colorsWithImages,
  findVariant,
  imagesForColor,
  isDefaultOnly,
} from '../lib/variants.js';
import styles from './ProductDetailPage.module.css';

/** Tran so luong khi bien the chua theo doi ton kho (availableQuantity null): chi la gioi han UI. */
const QUANTITY_CAP = 99;

/**
 * Do chieu cao breadcrumb (ten san pham dai thi xuong dong) va dat --crumb-h len trang: khung anh
 * desktop lay phan man hinh con lai duoi header (--header-h) va breadcrumb, khong doan hang so.
 * Ham o cap module nen ref on dinh: React goi mot lan khi gan, goi ham don tra ve khi go.
 */
function measureCrumbs(node: HTMLDivElement | null) {
  const page = node?.parentElement;
  if (!node || !page) return;
  const write = () => page.style.setProperty('--crumb-h', `${node.offsetHeight}px`);
  write();
  if (typeof ResizeObserver === 'undefined') return;
  const observer = new ResizeObserver(write);
  observer.observe(node);
  return () => observer.disconnect();
}

export function ProductDetailPage() {
  const { slug = '' } = useParams();
  /** Bien the nam tren URL (?color=&size=): mo tu ket qua loc se chon san mau do, refresh khong mat. */
  const [searchParams, setSearchParams] = useSearchParams();
  const product = useQuery({
    queryKey: productKeys.detail(slug),
    queryFn: () => getProductDetail(slug),
    enabled: Boolean(slug),
  });
  const related = useQuery({
    queryKey: productKeys.related(slug),
    queryFn: () => getRelatedProducts(slug, 4),
    enabled: Boolean(slug),
  });
  const [chosenColor, setChosenColor] = useState<string | null>(() => searchParams.get('color'));
  const [chosenSize, setChosenSize] = useState<string | null>(() => searchParams.get('size'));
  const [activeImage, setActiveImage] = useState(0);
  const [failedImageUrls, setFailedImageUrls] = useState<Set<string>>(() => new Set());
  const [isLightboxOpen, setLightboxOpen] = useState(false);
  const [chosenQuantity, setChosenQuantity] = useState(1);

  if (product.isPending)
    return (
      <div className={styles.container}>
        <SkeletonDetail />
      </div>
    );
  if (product.isError) {
    const missing = product.error instanceof ApiError && product.error.body.statusCode === 404;
    return (
      <div className={styles.container}>
        {missing ? (
          <>
            <h1>Không tìm thấy sản phẩm.</h1>
            <Link to="/">Về trang chủ</Link>
          </>
        ) : (
          <ErrorNote
            label="Không tải được chi tiết sản phẩm."
            onRetry={() => void product.refetch()}
          />
        )}
      </div>
    );
  }

  const data = product.data;
  const colorChoices = colorsWithImages(data.colors, data.images);
  const variantsForAvailableColors = data.variants.filter((variant) =>
    colorChoices.some((choice) => choice.code === variant.colorCode),
  );
  /**
   * Gia tri mau den tu URL co the la code chinh xac (den-than) hoac ca FAMILY mau (den) vi
   * bo loc o trang tim kiem dung gia tri family. Khop chinh xac truoc; khong thi tim mau dau
   * tien co cung family (tien to truoc dau gach) roi moi ve mau mac dinh.
   */
  const familyOf = (code: string) => code.split('-')[0];
  const resolveColor = (wanted: string | null): string | null => {
    if (!wanted) return colorChoices[0]?.code ?? null;
    if (colorChoices.some((choice) => choice.code === wanted)) return wanted;
    const byFamily = colorChoices.find((choice) => familyOf(choice.code) === wanted);
    return byFamily?.code ?? colorChoices[0]?.code ?? null;
  };
  const color = resolveColor(chosenColor);
  const sizes = [...new Set(variantsForAvailableColors.map((v) => v.sizeCode))];
  const sizesForColor = availableSizes(variantsForAvailableColors, color);
  const hideColor =
    colorChoices.length === 0 ||
    isDefaultOnly(
      colorChoices.map((c) => c.code),
      'mac-dinh',
    );
  const hideSize = sizes.length === 0 || isDefaultOnly(sizes, 'FREE');
  const size = chosenSize && sizesForColor.has(chosenSize) ? chosenSize : hideSize ? 'FREE' : null;
  const variant = findVariant(variantsForAvailableColors, color, size);
  const gallery = colorChoices.length > 0 ? imagesForColor(data.images, color) : data.images;
  const currentImage = gallery[activeImage] ?? gallery[0];
  const currentImageFailed = currentImage ? failedImageUrls.has(currentImage.url) : false;
  const displayedListPrice = variant ? variant.listPrice : data.listPrice;
  const stock = variant?.availableQuantity;
  const maxQuantity = typeof stock === 'number' ? Math.max(1, stock) : QUANTITY_CAP;
  // Doi sang bien the ton it hon thi so luong da chon tu ha theo, khong gui so luong qua ton.
  const quantity = Math.min(chosenQuantity, maxQuantity);
  const atMin = quantity <= 1;
  const atMax = quantity >= maxQuantity || stock === 0;
  const hasDetails = Boolean(data.description || data.material || data.careInstructions);
  const breadcrumb = [
    { name: 'Trang chủ', to: '/' },
    ...data.breadcrumb.map((item) => ({ name: item.name, to: `/danh-muc/${item.slug}` })),
    { name: data.name },
  ];
  /** Ghi bien the vua chon len URL (replace: khong doi duong dan cu trong lich su). */
  const writeVariantUrl = (nextColor: string | null, nextSize: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (!hideColor && nextColor) next.set('color', nextColor);
    else next.delete('color');
    if (!hideSize && nextSize) next.set('size', nextSize);
    else next.delete('size');
    setSearchParams(next, { replace: true, state: { keepScroll: true } });
  };
  return (
    <div className={styles.container}>
      <title>{pageTitle(data.name)}</title>
      <div ref={measureCrumbs} className={styles.crumbs}>
        <Breadcrumb items={breadcrumb} />
      </div>
      <article className={styles.detail}>
        <div className={styles.gallery}>
          <ArcGallery
            images={gallery.map((image) => ({ url: image.url, alt: image.alt ?? data.name }))}
            active={activeImage}
            onActiveChange={setActiveImage}
            failedUrls={failedImageUrls}
            onImageError={(url) => setFailedImageUrls((failed) => new Set(failed).add(url))}
            onOpen={() => setLightboxOpen(true)}
            resetKey={color ?? ''}
            colorName={
              hideColor ? null : (colorChoices.find((c) => c.code === color)?.name ?? null)
            }
            emptyLabel="Sản phẩm chưa có ảnh phù hợp với màu này."
          />
        </div>
        <div className={styles.info}>
          <div className={styles.head}>
            {data.brandName && <p className={styles.eyebrow}>{data.brandName}</p>}
            <h1>{data.name}</h1>
            {data.ratingCount ? (
              <a
                className={styles.rating}
                href="#danh-gia"
                onClick={(event) => {
                  // Cuon tai cho, khong day muc lich su: ScrollManager keo trang ve dau khi URL doi.
                  event.preventDefault();
                  document.getElementById('danh-gia')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                <RatingBadge average={data.ratingAverage} count={data.ratingCount} />
                <span>Xem đánh giá</span>
              </a>
            ) : null}
          </div>
          <div className={styles.priceRow}>
            <p className={styles.price}>
              {formatPrice(variant?.price ?? data.price)}
              {displayedListPrice && <s>{formatPrice(displayedListPrice)}</s>}
            </p>
            <p className={styles.sku}>
              {variant ? `Mã hàng: ${variant.sku}` : 'Chọn màu và cỡ để xem mã hàng'}
            </p>
          </div>
          {!hideColor && (
            <fieldset className={styles.choices}>
              <legend>Màu</legend>
              {colorChoices.map((item) =>
                (() => {
                  const colorImage = data.images.find((image) => image.colorCode === item.code);
                  return (
                    <button
                      type="button"
                      key={item.code}
                      aria-label={item.name}
                      aria-pressed={color === item.code}
                      onClick={() => {
                        const nextSizes = availableSizes(data.variants, item.code);
                        const keptSize = size && nextSizes.has(size) ? size : null;
                        setChosenColor(item.code);
                        setChosenSize(keptSize);
                        setActiveImage(0);
                        writeVariantUrl(item.code, keptSize);
                      }}
                    >
                      {colorImage ? (
                        <img className={styles.colorImage} src={colorImage.url} alt="" />
                      ) : item.hex ? (
                        <span
                          className={styles.swatch}
                          style={{ '--swatch': item.hex } as CSSProperties}
                        />
                      ) : null}
                      <span>{item.name}</span>
                    </button>
                  );
                })(),
              )}
            </fieldset>
          )}
          {!hideSize && (
            <fieldset className={styles.choices}>
              <legend>Cỡ</legend>
              {sizes.map((code) => (
                <button
                  type="button"
                  key={code}
                  disabled={!sizesForColor.has(code)}
                  aria-pressed={size === code}
                  onClick={() => {
                    setChosenSize(code);
                    writeVariantUrl(color, code);
                  }}
                >
                  {code}
                </button>
              ))}
            </fieldset>
          )}
          <div className={styles.buy}>
            {/* aria-disabled thay disabled: bam toi gioi han bang ban phim thi focus o lai nut,
                khong roi ve body. */}
            <div className={styles.quantity} role="group" aria-label="Số lượng">
              <button
                type="button"
                aria-label="Giảm số lượng"
                aria-disabled={atMin}
                onClick={() => {
                  if (!atMin) setChosenQuantity(quantity - 1);
                }}
              >
                −
              </button>
              <output aria-live="polite">{quantity}</output>
              <button
                type="button"
                aria-label="Tăng số lượng"
                aria-disabled={atMax}
                onClick={() => {
                  if (!atMax) setChosenQuantity(quantity + 1);
                }}
              >
                +
              </button>
            </div>
            <AddToCartButton
              className={styles.cart}
              variantId={variant?.id}
              availableQuantity={stock}
              quantity={quantity}
            />
          </div>
          {/* Giu cho san cho dong ton kho: chon bien the khong lam cot thong tin nhay. */}
          <div className={styles.stockSlot}>
            {variant && stock !== null && stock !== undefined && (
              <p role="status" className={styles.stock}>
                {stock === 0 ? 'Hết hàng' : `Còn ${stock} sản phẩm`}
              </p>
            )}
          </div>
          <details className={styles.policyDetails}>
            <summary>Hướng dẫn chọn cỡ &amp; chính sách đổi trả 15 ngày</summary>
            <p>
              Bảng cỡ tham khảo: XS (42–48 kg) · S (48–55 kg) · M (55–63 kg) · L (63–72 kg) · XL
              (72–82 kg); chọn tăng 1 cỡ nếu thích mặc rộng rãi.
            </p>
            <p>
              Miễn phí vận chuyển cho đơn từ 500.000 ₫. Hỗ trợ đổi/trả hàng trong vòng 15 ngày kể từ
              khi nhận nếu sản phẩm còn nguyên tem mác.
            </p>
          </details>
        </div>
      </article>
      {hasDetails && (
        <section className={styles.about} aria-labelledby="chi-tiet-san-pham">
          <h2 id="chi-tiet-san-pham">Chi tiết sản phẩm</h2>
          {data.description && <p className={styles.description}>{data.description}</p>}
          {data.material && <p>Chất liệu: {data.material}</p>}
          {data.careInstructions && <p>Bảo quản: {data.careInstructions}</p>}
        </section>
      )}
      <ProductReviews slug={slug} />
      {related.data && related.data.length > 0 && (
        <section className={styles.related}>
          <SectionHeader title="CÓ THỂ BẠN SẼ THÍCH" to={`/danh-muc/${data.categorySlug}`} />
          <ProductGrid products={related.data} showBrand />
        </section>
      )}
      {isLightboxOpen && currentImage && !currentImageFailed && (
        <Lightbox
          images={gallery.map((image) => ({ url: image.url, alt: image.alt ?? data.name }))}
          index={Math.min(activeImage, gallery.length - 1)}
          onClose={() => setLightboxOpen(false)}
          onNavigate={setActiveImage}
        />
      )}
    </div>
  );
}
