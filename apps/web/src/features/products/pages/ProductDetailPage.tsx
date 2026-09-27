import { useQuery } from '@tanstack/react-query';
import { type CSSProperties, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { ApiError, formatPrice } from '@/core';
import { ErrorNote, SkeletonDetail } from '@/ui';

import { getProductDetail, getRelatedProducts, productKeys } from '../api/index.js';
import { Breadcrumb } from '../components/Breadcrumb.js';
import { ProductGrid } from '../components/ProductGrid.js';
import { SectionHeader } from '../components/SectionHeader.js';
import { availableSizes, findVariant, imagesForColor, isDefaultOnly } from '../lib/variants.js';
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
  const color = data.colors.some((c) => c.code === chosenColor)
    ? chosenColor
    : (data.colors[0]?.code ?? null);
  const sizes = [...new Set(data.variants.map((v) => v.sizeCode))];
  const sizesForColor = availableSizes(data.variants, color);
  const hideColor = isDefaultOnly(
    data.colors.map((c) => c.code),
    'mac-dinh',
  );
  const hideSize = isDefaultOnly(sizes, 'FREE');
  const size = chosenSize && sizesForColor.has(chosenSize) ? chosenSize : hideSize ? 'FREE' : null;
  const variant = findVariant(data.variants, color, size);
  const gallery = imagesForColor(data.images, color);
  const currentImage = gallery[activeImage] ?? gallery[0];
  const displayedListPrice = variant ? variant.listPrice : data.listPrice;
  const breadcrumb = [
    { name: 'Trang chủ', to: '/' },
    ...data.breadcrumb.map((item) => ({ name: item.name, to: `/danh-muc/${item.slug}` })),
    { name: data.name },
  ];
  return (
    <div className={styles.container}>
      <Breadcrumb items={breadcrumb} />
      <article className={styles.detail}>
        <div className={styles.gallery}>
          <div className={styles.mainImage}>
            {currentImage && <img src={currentImage.url} alt={currentImage.alt ?? data.name} />}
          </div>
          <div className={styles.thumbnails}>
            {gallery.slice(0, 4).map((image, index) => (
              <button
                type="button"
                key={`${image.url}-${index}`}
                aria-label={`Xem ảnh ${index + 1}`}
                aria-pressed={index === activeImage}
                onClick={() => setActiveImage(index)}
              >
                <img src={image.url} alt="" />
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
              {data.colors.map((item) => (
                <button
                  type="button"
                  key={item.code}
                  aria-label={item.name}
                  aria-pressed={color === item.code}
                  style={{ '--swatch': item.hex ?? 'var(--surface)' } as CSSProperties}
                  onClick={() => {
                    const nextSizes = availableSizes(data.variants, item.code);
                    setChosenColor(item.code);
                    if (size && !nextSizes.has(size)) setChosenSize(null);
                    setActiveImage(0);
                  }}
                >
                  <span className={styles.swatch} />
                </button>
              ))}
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
          {data.description && <p>{data.description}</p>}
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
