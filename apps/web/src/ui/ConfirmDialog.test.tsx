import { render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from './ConfirmDialog.js';

/**
 * Stub giong trinh duyet that: showModal/close doi `open` ngay, nhung su kien `close` duoc xep
 * hang roi moi ban (HTML spec "queue an element task"), khong ban dong bo nhu stub cu.
 */
beforeAll(() => {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & { showModal(): void };
  proto.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  proto.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    setTimeout(() => this.dispatchEvent(new Event('close')), 0);
  };
});
afterEach(() => vi.useRealTimers());

const props = {
  title: 'Chốt lệnh hoàn',
  subject: 'Đơn FR1',
  impacts: ['Không hoàn tác được.'],
  confirmLabel: 'Chốt',
  pendingLabel: 'Đang xử lý…',
  tone: 'primary' as const,
  pending: false,
  onConfirm: () => undefined,
};

describe('ConfirmDialog (ADR-039)', () => {
  it('mount moi voi open=true trong StrictMode: su kien close tre cua lan effect bi don khong dong hop', async () => {
    const onClose = vi.fn();
    render(
      <StrictMode>
        <ConfirmDialog open {...props} onClose={onClose} />
      </StrictMode>,
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toHaveAttribute('open');
  });

  it('trinh duyet tu dong hop (vd Esc lap lai) van bao cha', async () => {
    const onClose = vi.fn();
    render(<ConfirmDialog open {...props} onClose={onClose} />);
    (screen.getByRole('dialog') as HTMLDialogElement).close();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
