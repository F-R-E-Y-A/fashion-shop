import type { SVGProps } from 'react';

type Name =
  | 'overview'
  | 'reports'
  | 'inventory'
  | 'categories'
  | 'products'
  | 'promotions'
  | 'vouchers'
  | 'users'
  | 'orders'
  | 'reviews'
  | 'returns'
  | 'menu'
  | 'close'
  | 'filter';

const paths: Record<Name, string> = {
  overview: 'm3 10 9-7 9 7v11H3V10 M9 21v-8h6v8',
  reports: 'M4 20V14 M10 20V7 M16 20v-9 M21 20v-5 M3 20h19',
  inventory: 'M3 7h18v13H3z M3 7l2-4h14l2 4 M10 12h4',
  categories: 'M3 4h7v7H3z M14 4h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  products: 'M12 3H5a2 2 0 0 0-2 2v7l9 9 9-9-9-9z',
  promotions: 'M19 5 5 19',
  vouchers:
    'M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1a2 2 0 0 0 0 4v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1a2 2 0 0 0 0-4V9z M13 7v10',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87',
  orders: 'm12 3 9 5-9 5-9-5 9-5 M3 8v9l9 5 9-5V8 M12 13v9',
  reviews: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9L12 3z',
  returns: 'M9 14 4 9l5-5 M4 9h10a6 6 0 0 1 0 12h-3',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  close: 'm6 6 12 12 M6 18 18 6',
  filter: 'M4 6h16 M7 12h10 M10 18h4',
};

/** Biểu tượng trang trí; tên truy cập nằm trên nút hoặc liên kết chứa nó. */
export function AdminIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: Name }) {
  return (
    <svg
      {...props}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} />
      {name === 'users' && <circle cx="9" cy="7" r="4" />}
      {name === 'products' && <circle cx="8" cy="8" r="1.5" />}
      {name === 'promotions' && (
        <>
          <circle cx="7.5" cy="7.5" r="2" />
          <circle cx="16.5" cy="16.5" r="2" />
        </>
      )}
    </svg>
  );
}
