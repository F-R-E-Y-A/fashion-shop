import { Link } from 'react-router-dom';

import { layout } from '@/ui';

import { MATERIALS, searchLink } from './home-content.js';
import styles from './MaterialStory.module.css';
import { useSearchCards } from './useSearchCards.js';

/** Cau chuyen chat lieu tren nen anh chien dich. Moi dong la mot cau tim; so san pham do bo tim kiem dem. */
export function MaterialStory() {
  const { cards, isPending, allFailed } = useSearchCards(
    MATERIALS.map((m) => m.q),
    1,
  );
  if (allFailed) return null;
  return (
    <section className={styles.materials} aria-labelledby="home-mat-title">
      <img
        className={styles.background}
        src="/images/home/campaign.webp"
        alt=""
        width={2172}
        height={724}
        loading="lazy"
      />
      <div className={`${layout.container} ${styles.inner}`}>
        <p className={`${layout.eyebrow} ${styles.eyebrow}`}>Câu chuyện chất liệu</p>
        <h2 id="home-mat-title">Chạm vào trước khi mặc.</h2>
        <ul className={styles.list} aria-busy={isPending}>
          {MATERIALS.map((material, index) => (
            <li key={material.name}>
              <Link to={searchLink(material.q)}>
                <b>{material.name}</b>
                <span>{material.line}</span>
                <em>{isPending ? '…' : `${cards[index]?.total ?? 0} sản phẩm →`}</em>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
