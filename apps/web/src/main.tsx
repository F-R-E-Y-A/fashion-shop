import './styles.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { AppProviders, AppRoutes } from './app/index.js';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Khong tim thay phan tu #root trong index.html');
}

createRoot(container).render(
  <StrictMode>
    <AppProviders>
      <AppRoutes />
    </AppProviders>
  </StrictMode>,
);
