import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  useId,
  useState,
} from 'react';

import { passwordRequirements } from '../auth-form.js';
import styles from './AuthForm.module.css';

interface AuthFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: ReactNode;
  action?: ReactNode;
}

export function AuthField({
  label,
  error,
  hint,
  action,
  id: suppliedId,
  className,
  ...input
}: AuthFieldProps) {
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  const describedBy =
    [input['aria-describedby'], hint ? `${id}-hint` : '', error ? `${id}-error` : '']
      .filter(Boolean)
      .join(' ') || undefined;
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <div className={styles.inputRow}>
        <input
          {...input}
          id={id}
          className={`${styles.input} ${action ? styles.withAction : ''} ${className ?? ''}`}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
        />
        {action}
      </div>
      {hint && (
        <div id={`${id}-hint`} className={styles.hint}>
          {hint}
        </div>
      )}
      <div className={styles.fieldFeedback}>
        {error && (
          <span id={`${id}-error`} role="alert">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}

export function PasswordField(props: Omit<AuthFieldProps, 'type' | 'action'>) {
  const [visible, setVisible] = useState(false);
  const generatedId = useId();
  const id = props.id ?? generatedId;
  return (
    <AuthField
      {...props}
      id={id}
      type={visible ? 'text' : 'password'}
      action={
        <button
          type="button"
          className={styles.toggle}
          aria-controls={id}
          aria-pressed={visible}
          aria-label={`${visible ? 'Ẩn' : 'Hiện'} ${props.label.toLowerCase()}`}
          disabled={props.disabled}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? 'Ẩn' : 'Hiện'}
        </button>
      }
    />
  );
}

export function PasswordRequirements({ password, id }: { password: string; id: string }) {
  return (
    <div id={id} className={styles.requirements}>
      <p>Mật khẩu cần đáp ứng:</p>
      <ul>
        {passwordRequirements(password).map(({ label, met }) => (
          <li key={label} data-met={met}>
            <span aria-hidden="true">{met ? '✓' : '○'}</span> {label}
            <span className="sr-only">{met ? ' — đã đáp ứng' : ' — chưa đáp ứng'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function OtpField({
  onValueChange,
  ...props
}: Omit<AuthFieldProps, 'type' | 'inputMode' | 'maxLength' | 'onChange' | 'onPaste'> & {
  onValueChange: (code: string) => void;
}) {
  const updateCode = (value: string) => onValueChange(value.replace(/\D/g, '').slice(0, 6));
  return (
    <AuthField
      {...props}
      type="text"
      inputMode="numeric"
      pattern="\d{6}"
      maxLength={6}
      autoComplete="one-time-code"
      className={styles.otp}
      onChange={(event) => updateCode(event.target.value)}
      onPaste={(event) => {
        event.preventDefault();
        updateCode(event.clipboardData.getData('text'));
      }}
    />
  );
}

interface SubmitButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  pending?: boolean;
  pendingLabel?: string;
}

export function AuthSubmitButton({
  pending = false,
  pendingLabel = 'Đang xử lý…',
  disabled,
  children,
  className,
  type = 'submit',
  ...props
}: SubmitButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={`${styles.primary} ${className ?? ''}`}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
    >
      <span className={styles.spinnerSlot} aria-hidden="true">
        {pending && <span className={styles.spinner} />}
      </span>
      <span aria-live="polite">{pending ? pendingLabel : children}</span>
      <span className={styles.spinnerSlot} aria-hidden="true" />
    </button>
  );
}

export function AuthNotice({
  message,
  kind = 'error',
  children,
}: {
  message: string | null;
  kind?: 'error' | 'status';
  children?: ReactNode;
}) {
  return (
    <div className={styles.noticeSlot}>
      {message && (
        <div
          className={`${styles.notice} ${kind === 'error' ? styles.errorNotice : ''}`}
          role={kind === 'error' ? 'alert' : 'status'}
        >
          <p>{message}</p>
          {children}
        </div>
      )}
    </div>
  );
}

export function ResendCode({
  pending,
  remainingSeconds,
  disabled,
  onResend,
}: {
  pending: boolean;
  remainingSeconds: number;
  disabled: boolean;
  onResend: () => void;
}) {
  const hintId = useId();
  return (
    <div className={styles.resend}>
      <p>Chưa nhận được mã? Kiểm tra thư rác hoặc gửi lại yêu cầu.</p>
      <button
        type="button"
        className={styles.secondary}
        disabled={disabled || pending || remainingSeconds > 0}
        aria-busy={pending || undefined}
        aria-describedby={hintId}
        onClick={onResend}
      >
        {pending
          ? 'Đang gửi yêu cầu…'
          : remainingSeconds > 0
            ? `Gửi lại sau ${remainingSeconds}s`
            : 'Gửi lại mã'}
      </button>
      <p id={hintId} className={styles.hint}>
        Có thể gửi lại sau 60 giây. Mã mới, nếu được tạo, sẽ thay thế mã cũ.
      </p>
    </div>
  );
}
