import { type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { layout } from '@/ui';

import styles from './HeroSearch.module.css';
import { HERO, HERO_HINTS, searchLink } from './home-content.js';

/** Hero toan khung voi o tim kiem bang cau noi tu nhien: diem nhan duy nhat cua trang chu. */
export function HeroSearch() {
  const navigate = useNavigate();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const typed = String(new FormData(event.currentTarget).get('q') ?? '').trim();
    // O trong thi tim theo cau goi y dang hien trong o.
    void navigate(searchLink(typed || HERO.placeholder));
  };

  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <img
        className={styles.image}
        src="/images/home/hero.webp"
        alt={HERO.imageAlt}
        width={HERO.width}
        height={HERO.height}
        fetchPriority="high"
      />
      <div className={styles.inner}>
        <p className={`${layout.eyebrow} ${styles.eyebrow}`}>{HERO.eyebrow}</p>
        <h1 id="hero-title" className={styles.title}>
          <span>Cứ nói điều</span>{' '}
          <span>
            bạn <em>muốn mặc.</em>
          </span>
        </h1>
        <p className={styles.sub}>{HERO.sub}</p>
        <form className={styles.form} role="search" onSubmit={submit}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="6.5" />
            <path d="M20 20l-4.2-4.2" />
          </svg>
          <label htmlFor="hero-q" className="sr-only">
            Tìm sản phẩm bằng câu nói tự nhiên
          </label>
          <input
            id="hero-q"
            name="q"
            type="search"
            autoComplete="off"
            maxLength={120}
            placeholder={HERO.placeholder}
          />
          <button type="submit">Tìm</button>
        </form>
        <ul className={styles.hints}>
          {HERO_HINTS.map((hint) => (
            <li key={hint}>
              <Link to={searchLink(hint)}>{hint}</Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
