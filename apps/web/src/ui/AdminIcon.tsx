import type { SVGProps } from 'react';

type Name = 'overview' | 'users' | 'orders' | 'menu' | 'close' | 'filter';
const paths: Record<Name, string> = {
  overview: 'm3 10 9-7 9 7v11H3V10 M9 21v-8h6v8',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87',
  orders: 'm12 3 9 5-9 5-9-5 9-5 M3 8v9l9 5 9-5V8 M12 13v9',
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
    </svg>
  );
}
