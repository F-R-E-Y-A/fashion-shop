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
import {
  availableSizes,
  colorsWithImages,
  findVariant,
  imagesForColor,
  isDefaultOnly,
} from '../lib/variants.js';
import styles from './ProductDetailPage.module.css';

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
    setSearchParams(next, { replace: true });
  };
  return (
    <div className={styles.container}>
      <title>{pageTitle(data.name)}</title>
      <Breadcrumb items={breadcrumb} />
      <article className={styles.detail}>
        <div className={styles.gallery}>
          <div
            className={styles.mainImage}
            tabIndex={gallery.length > 1 ? 0 : undefined}
            aria-label={gallery.length > 1 ? 'Thư viện ảnh sản phẩm' : undefined}
            onClick={() => {
              if (currentImage && !currentImageFailed) setLightboxOpen(true);
            }}
            onKeyDown={(event) => {
              if (gallery.length < 2) return;
              if (event.key === 'ArrowLeft') {
                event.preventDefault();
                setActiveImage((index) => (index - 1 + gallery.length) % gallery.length);
              } else if (event.key === 'ArrowRight') {
                event.preventDefault();
                setActiveImage((index) => (index + 1) % gallery.length);
              } else if (event.key === 'Enter' && currentImage && !currentImageFailed) {
                event.preventDefault();
                setLightboxOpen(true);
              }
            }}
          >
            {currentImage && !currentImageFailed ? (
              <img
                src={currentImage.url}
                alt={currentImage.alt ?? data.name}
                onError={() => {
                  setFailedImageUrls((failed) => new Set(failed).add(currentImage.url));
                }}
              />
            ) : (
              <p role="status" className={styles.imageFallback}>
                {currentImage
                  ? 'Ảnh này hiện không tải được.'
                  : 'Sản phẩm chưa có ảnh phù hợp với màu này.'}
              </p>
            )}
            {gallery.length > 1 && (
              <>
                <button
                  type="button"
                  className={`${styles.galleryArrow} ${styles.galleryPrevious}`}
                  aria-label="Ảnh trước"
                  onClick={(event) => {
                    event.stopPropagation();
                    setActiveImage((index) => (index - 1 + gallery.length) % gallery.length);
                  }}
                >
                  ‹
                </button>
                <button
                  type="button"
                  className={`${styles.galleryArrow} ${styles.galleryNext}`}
                  aria-label="Ảnh tiếp theo"
                  onClick={(event) => {
                    event.stopPropagation();
                    setActiveImage((index) => (index + 1) % gallery.length);
                  }}
                >
                  ›
                </button>
              </>
            )}
          </div>
          <div className={styles.thumbnails}>
            {gallery.map((image, index) => (
              <button
                type="button"
                key={`${image.url}-${index}`}
                aria-label={`Xem ảnh ${index + 1}`}
                aria-pressed={index === activeImage}
                onClick={() => setActiveImage(index)}
              >
                <img
                  src={image.url}
                  alt=""
                  onError={() => {
                    setFailedImageUrls((failed) => new Set(failed).add(image.url));
                  }}
                />
              </button>
            ))}
          </div>
        </div>
        <div className={styles.info}>
          {data.brandName && <p className={styles.eyebrow}>{data.brandName}</p>}
          <h1>{data.name}</h1>
          {data.ratingCount ? (
            <a
              className={styles.rating}
              href="#danh-gia"
              onClick={(event) => {
                // Cuon tai cho, khong day muc lich su: ScrollManager se keo trang ve dau khi URL doi.
                event.preventDefault();
                document.getElementById('danh-gia')?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              <RatingBadge average={data.ratingAverage} count={data.ratingCount} />
              <span>Xem đánh giá</span>
            </a>
          ) : null}
          <p className={styles.price}>
            {formatPrice(variant?.price ?? data.price)}
            {displayedListPrice && <s>{formatPrice(displayedListPrice)}</s>}
          </p>
          {variant && <p className={styles.sku}>Mã hàng: {variant.sku}</p>}
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
          {variant &&
            variant.availableQuantity !== null &&
            variant.availableQuantity !== undefined && (
              <p role="status">
                {variant.availableQuantity === 0
                  ? 'Hết hàng'
                  : `Còn ${variant.availableQuantity} sản phẩm`}
              </p>
            )}
          <AddToCartButton
            className={styles.cart}
            variantId={variant?.id}
            availableQuantity={variant?.availableQuantity}
          />
          {data.description && <p className={styles.description}>{data.description}</p>}
          {data.material && <p>Chất liệu: {data.material}</p>}
          {data.careInstructions && <p>Bảo quản: {data.careInstructions}</p>}
        </div>
      </article>
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
