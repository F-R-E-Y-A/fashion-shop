/** Chay truoc moi tep kiem thu giao dien: them cac matcher nhu toBeInTheDocument. */
import '@testing-library/jest-dom/vitest';

import { configure } from '@testing-library/react';

// Hon 50 tep jsdom chay song song: trang admin render ca AppRoutes (khoi phuc phien, nap lazy, goi
// API) co luc vuot 1 giay mac dinh cua findBy/waitFor du khong co loi, moi lan hong mot nhom bai
// khac nhau. Day chi la thoi gian CHO toi da: dieu kien dung som thi van tra som.
configure({ asyncUtilTimeout: 3000 });
