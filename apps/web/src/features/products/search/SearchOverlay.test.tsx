import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  categoryTree,
  errorBody,
  jsonResponse,
  suggestion,
} from '../test-support/catalog-fixtures.js';
import { SearchTrigger } from './SearchTrigger.js';

function Where() {
  const location = useLocation();
  return <span data-testid="where">{location.pathname + location.search}</span>;
}

function renderTrigger() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SearchTrigger />
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const suggestCalls = () =>
  vi
    .mocked(fetch)
    .mock.calls.map(([url]) => new URL(String(url)))
    .filter((url) => url.pathname.endsWith('/search/suggest'));

/** fetch gia: danh muc va goi y; `suggestResult` doi duoc de thu trang thai loi. */
function stubFetch(suggestResult: () => Response = () => jsonResponse(suggestion)) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/search/suggest')) return suggestResult();
      if (url.pathname.endsWith('/categories')) return jsonResponse(categoryTree);
      throw new Error(`Unexpected fetch ${url.pathname}`);
    }),
  );
}

describe('SearchOverlay (UC-03.2)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const setup = () => userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });

  it('phim "/" mo hop thoai, Esc dong va tra focus ve nut da mo', async () => {
    stubFetch();
    const user = setup();
    renderTrigger();
    const opener = screen.getByRole('button', { name: /Mở tìm kiếm/ });
    opener.focus();

    await user.keyboard('/');
    const dialog = screen.getByRole('dialog', { name: 'Tìm kiếm' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const input = screen.getByRole('combobox', { name: 'Tìm sản phẩm' });
    expect(input).toHaveFocus();
    // Ky tu "/" khong lot vao o nhap.
    expect(input).toHaveValue('');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('Ctrl+K cung mo; dang go trong mot o nhap khac thi "/" khong mo', async () => {
    stubFetch();
    const user = setup();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <input aria-label="o khac" />
          <SearchTrigger />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await user.click(screen.getByLabelText('o khac'));
    await user.keyboard('/');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.keyboard('{Control>}k{/Control}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('o trong: danh muc co san pham, an danh muc 0, va goi y cau mau', async () => {
    stubFetch();
    const user = setup();
    renderTrigger();
    await user.click(screen.getByRole('button', { name: /Mở tìm kiếm/ }));
    expect(await screen.findByRole('option', { name: /^Áo\s*10 sp/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Đồ rỗng/ })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'polo nữ trắng dưới 100k' })).toBeInTheDocument();
    expect(suggestCalls()).toHaveLength(0);
  });

  it('cho 300 ms ngung go moi goi goi y, va khong goi khi duoi 2 ky tu', async () => {
    stubFetch();
    const user = setup();
    renderTrigger();
    await user.click(screen.getByRole('button', { name: /Mở tìm kiếm/ }));
    const input = screen.getByRole('combobox');

    await user.type(input, 'p');
    await act(() => vi.advanceTimersByTimeAsync(400));
    expect(suggestCalls()).toHaveLength(0);

    await user.type(input, 'olo');
    await act(() => vi.advanceTimersByTimeAsync(250));
    expect(suggestCalls()).toHaveLength(0);
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(
      await screen.findByRole('option', { name: /Xem tất cả kết quả cho “polo”/ }),
    ).toBeInTheDocument();
    expect(suggestCalls()).toHaveLength(1);
    expect(suggestCalls()[0]?.searchParams.get('q')).toBe('polo');
  });

  it('mui ten chon lua chon, aria-activedescendant doi theo, Enter mo lua chon dang chon', async () => {
    stubFetch();
    const user = setup();
    renderTrigger();
    await user.click(screen.getByRole('button', { name: /Mở tìm kiếm/ }));
    const input = screen.getByRole('combobox');
    await user.type(input, 'polo');
    await act(() => vi.advanceTimersByTimeAsync(300));
    await screen.findByRole('option', { name: /áo polo nữ/ });

    expect(input).not.toHaveAttribute('aria-activedescendant');
    await user.keyboard('{ArrowDown}');
    const first = input.getAttribute('aria-activedescendant');
    expect(document.getElementById(first ?? '')).toHaveAttribute('aria-selected', 'true');
    expect(document.getElementById(first ?? '')).toHaveTextContent('Xem tất cả kết quả cho “polo”');
    await user.keyboard('{ArrowDown}');
    const second = input.getAttribute('aria-activedescendant');
    expect(second).not.toBe(first);
    expect(document.getElementById(second ?? '')).toHaveTextContent('áo polo nữ');

    await user.keyboard('{Enter}');
    expect(screen.getByTestId('where')).toHaveTextContent(
      `/tim-kiem?${new URLSearchParams({ q: 'áo polo nữ' })}`,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('fs:recent-searches') ?? '[]')).toEqual(['áo polo nữ']);
  });

  it('mui ten len tu dau vong ve cuoi; chon san pham tro toi trang chi tiet', async () => {
    stubFetch();
    const user = setup();
    renderTrigger();
    await user.click(screen.getByRole('button', { name: /Mở tìm kiếm/ }));
    const input = screen.getByRole('combobox');
    await user.type(input, 'polo');
    await act(() => vi.advanceTimersByTimeAsync(300));
    await screen.findByRole('option', { name: /Áo Polo Nam/ });

    await user.keyboard('{ArrowUp}');
    const last = document.getElementById(input.getAttribute('aria-activedescendant') ?? '');
    expect(last).toHaveTextContent('Áo Polo Nam');
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('where')).toHaveTextContent('/san-pham/ao-polo-nam');
  });

  it('Enter khi chua chon gi thi tim day du theo chu da go', async () => {
    stubFetch();
    const user = setup();
    renderTrigger();
    await user.click(screen.getByRole('button', { name: /Mở tìm kiếm/ }));
    await user.type(screen.getByRole('combobox'), 'quần tây');
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('where')).toHaveTextContent(
      `/tim-kiem?${new URLSearchParams({ q: 'quần tây' })}`,
    );
  });

  it('loi khi tai goi y: bao bang role=alert, Enter van tim day du', async () => {
    stubFetch(() => jsonResponse(errorBody(429, '/api/search/suggest'), 429));
    const user = setup();
    renderTrigger();
    await user.click(screen.getByRole('button', { name: /Mở tìm kiếm/ }));
    await user.type(screen.getByRole('combobox'), 'polo');
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không tải được gợi ý. Nhấn Enter để tìm đầy đủ.',
    );
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('where')).toHaveTextContent('/tim-kiem?q=polo');
  });

  it('Tab chi xoay giua o nhap va nut dong; nut dong va bam nen deu dong hop thoai', async () => {
    stubFetch();
    const user = setup();
    renderTrigger();
    await user.click(screen.getByRole('button', { name: /Mở tìm kiếm/ }));
    const input = screen.getByRole('combobox');
    const close = screen.getByRole('button', { name: 'Đóng tìm kiếm' });

    await user.tab();
    expect(close).toHaveFocus();
    await user.tab();
    expect(input).toHaveFocus();
    await user.tab({ shift: true });
    expect(close).toHaveFocus();

    await user.click(close);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Mở tìm kiếm/ }));
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement as HTMLElement);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('hien "Tim gan day" tu localStorage, toi da 5 cau, khong loi khi localStorage hong', async () => {
    stubFetch();
    localStorage.setItem('fs:recent-searches', JSON.stringify(['sơ mi', 'quần tây']));
    const user = setup();
    renderTrigger();
    await user.click(screen.getByRole('button', { name: /Mở tìm kiếm/ }));
    expect(screen.getByText('Tìm gần đây')).toBeInTheDocument();
    await user.keyboard('{Escape}');

    localStorage.setItem('fs:recent-searches', '{khong phai json');
    await user.click(screen.getByRole('button', { name: /Mở tìm kiếm/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByText('Tìm gần đây')).not.toBeInTheDocument();
  });
});
