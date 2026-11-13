import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ActionFeedback } from './ActionFeedback.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('ActionFeedback', () => {
  it('tự đóng thông báo success sau 5000ms và không giành focus', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();

    render(
      <div>
        <button type="button">Nút thao tác</button>
        <ActionFeedback
          noticeKey={1}
          sessionScope="actor-1:0"
          tone="success"
          message="Đã cập nhật thành công."
          onDismiss={onDismiss}
        />
      </div>,
    );

    const trigger = screen.getByRole('button', { name: 'Nút thao tác' });
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Đã cập nhật thành công.');
    expect(document.activeElement).toBe(trigger);

    act(() => {
      vi.advanceTimersByTime(4999);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('hai success liên tiếp cùng nội dung nhưng khác noticeKey vẫn tính là hai thông báo mới đủ 5000ms', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();

    const { rerender } = render(
      <ActionFeedback
        noticeKey={1}
        sessionScope="actor-1:0"
        tone="success"
        message="Đã cập nhật."
        onDismiss={onDismiss}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(4500);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    // Thông báo thứ hai giống hệt nội dung xuất hiện khi timer cũ chỉ còn 500ms
    rerender(
      <ActionFeedback
        noticeKey={2}
        sessionScope="actor-1:0"
        tone="success"
        message="Đã cập nhật."
        onDismiss={onDismiss}
      />,
    );

    // Qua 500ms (mốc 5000ms của thông báo cũ): timer cũ không được đóng thông báo mới
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    // Đủ 5000ms của thông báo mới (500 + 4500)
    act(() => {
      vi.advanceTimersByTime(4500);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('hover và focus là hai trạng thái pause độc lập và tiếp tục đúng thời gian còn lại', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();

    render(
      <ActionFeedback
        noticeKey={1}
        sessionScope="actor-1:0"
        tone="success"
        message="Đã lưu."
        onDismiss={onDismiss}
      />,
    );

    const status = screen.getByRole('status');
    const closeBtn = screen.getByRole('button', { name: 'Đóng thông báo' });

    // Chạy 2000ms -> còn lại 3000ms
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    // Hover vào banner, sau đó focus nút đóng (chồng cả hover lẫn focus)
    fireEvent.mouseEnter(status);
    fireEvent.focus(closeBtn);

    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    // Rời chuột nhưng vẫn còn focus -> vẫn pause
    fireEvent.mouseLeave(status);
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    // Blur ra ngoài banner -> tiếp tục đúng 3000ms còn lại (không reset về 5000ms)
    fireEvent.blur(closeBtn, { relatedTarget: document.body });
    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('đóng thủ công gọi onDismiss ngay và dọn timer', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();

    render(
      <ActionFeedback
        noticeKey={1}
        sessionScope="actor-1:0"
        tone="success"
        message="Thành công."
        onDismiss={onDismiss}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Đóng thông báo' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('dọn timer khi unmount hoặc đổi scope phiên', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();

    const { rerender, unmount } = render(
      <ActionFeedback
        noticeKey={1}
        sessionScope="actor-1:0"
        tone="success"
        message="Thành công."
        onDismiss={onDismiss}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(2500);
    });

    rerender(
      <ActionFeedback
        noticeKey={1}
        sessionScope="actor-1:1"
        tone="success"
        message="Thành công."
        onDismiss={onDismiss}
      />,
    );

    // Timer từ scope cũ không đóng ở mốc 5000ms tổng (cần đủ 5000ms cho scope mới)
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    unmount();
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('error và warning không tự đóng; warning có nút đối chiếu mặc định không có nút đóng', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const onRecheck = vi.fn();

    const { rerender } = render(
      <ActionFeedback
        noticeKey={1}
        sessionScope="actor-1:0"
        tone="error"
        message="Không thể lưu thay đổi."
        onDismiss={onDismiss}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Không thể lưu thay đổi.');
    expect(screen.getByRole('button', { name: 'Đóng thông báo' })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(30000);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    rerender(
      <ActionFeedback
        noticeKey={2}
        sessionScope="actor-1:0"
        tone="warning"
        message="Chưa rõ kết quả thao tác."
        onDismiss={onDismiss}
        action={{ label: 'Kiểm tra lại trạng thái', onClick: onRecheck }}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Chưa rõ kết quả thao tác.');
    expect(screen.getByRole('button', { name: 'Kiểm tra lại trạng thái' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Đóng thông báo' })).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(30000);
    });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('callback onDismiss đổi ở cùng noticeKey/sessionScope không khởi động lại timer và gọi callback mới nhất', () => {
    vi.useFakeTimers();
    const onDismiss1 = vi.fn();
    const onDismiss2 = vi.fn();

    const { rerender } = render(
      <ActionFeedback
        noticeKey={1}
        sessionScope="actor-1:0"
        tone="success"
        message="Đã cập nhật."
        onDismiss={onDismiss1}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    rerender(
      <ActionFeedback
        noticeKey={1}
        sessionScope="actor-1:0"
        tone="success"
        message="Đã cập nhật."
        onDismiss={onDismiss2}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(onDismiss1).not.toHaveBeenCalled();
    expect(onDismiss2).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDismiss1).not.toHaveBeenCalled();
    expect(onDismiss2).toHaveBeenCalledTimes(1);
  });

  it('callback onDismiss đổi khi đang pause: resume dùng đúng thời gian còn lại và gọi callback mới nhất', () => {
    vi.useFakeTimers();
    const onDismiss1 = vi.fn();
    const onDismiss2 = vi.fn();

    const { rerender } = render(
      <ActionFeedback
        noticeKey={1}
        sessionScope="actor-1:0"
        tone="success"
        message="Đã cập nhật."
        onDismiss={onDismiss1}
      />,
    );

    const status = screen.getByRole('status');

    // Chạy 2000ms -> còn lại 3000ms
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    fireEvent.mouseEnter(status);
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    // Callback đổi trong lúc đang pause
    rerender(
      <ActionFeedback
        noticeKey={1}
        sessionScope="actor-1:0"
        tone="success"
        message="Đã cập nhật."
        onDismiss={onDismiss2}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onDismiss1).not.toHaveBeenCalled();
    expect(onDismiss2).not.toHaveBeenCalled();

    // Resume phải tiếp tục đúng 3000ms còn lại
    fireEvent.mouseLeave(status);
    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(onDismiss1).not.toHaveBeenCalled();
    expect(onDismiss2).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDismiss1).not.toHaveBeenCalled();
    expect(onDismiss2).toHaveBeenCalledTimes(1);
  });
});
