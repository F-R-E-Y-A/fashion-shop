import { useQuery } from '@tanstack/react-query';
import { type CSSProperties, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { ApiError, formatPrice, pageTitle } from '@/core';
import { ErrorNote, SkeletonDetail } from '@/ui';

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
  const [chosenColor, setChosenColor] = useState<string | null>(null);
  const [chosenSize, setChosenSize] = useState<string | null>(null);
  const [activeImage, setActiveImage] = useState(0);
  const [failedImageUrls, setFailedImageUrls] = useState<Set<string>>(() => new Set());

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
  const color = colorChoices.some((c) => c.code === chosenColor)
    ? chosenColor
    : (colorChoices[0]?.code ?? null);
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
            onKeyDown={(event) => {
              if (gallery.length < 2) return;
              if (event.key === 'ArrowLeft') {
                event.preventDefault();
                setActiveImage((index) => (index - 1 + gallery.length) % gallery.length);
              } else if (event.key === 'ArrowRight') {
                event.preventDefault();
                setActiveImage((index) => (index + 1) % gallery.length);
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
                  onClick={() =>
                    setActiveImage((index) => (index - 1 + gallery.length) % gallery.length)
                  }
                >
                  ‹
                </button>
                <button
                  type="button"
                  className={`${styles.galleryArrow} ${styles.galleryNext}`}
                  aria-label="Ảnh tiếp theo"
                  onClick={() => setActiveImage((index) => (index + 1) % gallery.length)}
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
                        setChosenColor(item.code);
                        if (size && !nextSizes.has(size)) setChosenSize(null);
                        setActiveImage(0);
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
                  onClick={() => setChosenSize(code)}
                >
                  {code}
                </button>
              ))}
            </fieldset>
          )}
          <button className={styles.cart} type="button" disabled>
            Thêm vào giỏ
          </button>
          <small>Giỏ hàng sắp ra mắt.</small>
          {data.description && <p className={styles.description}>{data.description}</p>}
          {data.material && <p>Chất liệu: {data.material}</p>}
          {data.careInstructions && <p>Bảo quản: {data.careInstructions}</p>}
        </div>
      </article>
      {related.data && related.data.length > 0 && (
        <section className={styles.related}>
          <SectionHeader title="CÓ THỂ BẠN SẼ THÍCH" to={`/danh-muc/${data.categorySlug}`} />
          <ProductGrid products={related.data} showBrand />
        </section>
      )}
    </div>
  );
}
