import { useLayoutEffect, useRef, useState } from 'react';

type FieldErrors<T> = Partial<Record<keyof T, string>>;

export function useAuthForm<T extends Record<string, string>>(
  initialValues: T,
  validate: (values: T) => FieldErrors<T>,
) {
  const [values, setValues] = useState(initialValues);
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({});
  const [serverErrors, setServerErrorState] = useState<FieldErrors<T>>({});
  const submittedForm = useRef<HTMLFormElement | null>(null);
  const serverErrorToFocus = useRef<string | null>(null);
  // Lỗi API đến khi inputs đang disabled; chỉ focus sau khi React đã cập nhật DOM.
  useLayoutEffect(() => {
    const field = serverErrorToFocus.current;
    serverErrorToFocus.current = null;
    const input = field ? submittedForm.current?.elements.namedItem(field) : null;
    if (input instanceof HTMLElement) input.focus();
  }, [serverErrors]);
  const validationErrors = validate(values);
  const errors: FieldErrors<T> = {};
  for (const field of Object.keys(values) as (keyof T)[]) {
    errors[field] = serverErrors[field] ?? (touched[field] ? validationErrors[field] : undefined);
  }

  function setField(field: keyof T, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setServerErrorState((current) => ({ ...current, [field]: undefined }));
  }

  function resetField(field: keyof T, value = '') {
    setField(field, value);
    setTouched((current) => ({ ...current, [field]: false }));
  }

  function touch(field: keyof T) {
    setTouched((current) => ({ ...current, [field]: true }));
  }

  function setServerErrors(nextErrors: FieldErrors<T>) {
    serverErrorToFocus.current = Object.keys(nextErrors).find((key) => nextErrors[key]) ?? null;
    setServerErrorState(nextErrors);
  }

  function validateForSubmit(form: HTMLFormElement, fields = Object.keys(values) as (keyof T)[]) {
    submittedForm.current = form;
    setServerErrorState({});
    setTouched((current) => ({
      ...current,
      ...Object.fromEntries(fields.map((key) => [key, true])),
    }));
    const firstInvalid = fields.find((field) => validationErrors[field]);
    if (firstInvalid) {
      const input = form.elements.namedItem(String(firstInvalid));
      if (input instanceof HTMLElement) input.focus();
      return false;
    }
    return true;
  }

  return { values, errors, setField, resetField, touch, validateForSubmit, setServerErrors };
}
