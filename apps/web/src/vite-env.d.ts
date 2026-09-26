/// <reference types="vite/client" />

/** Khai bao bien moi truong cua giao dien de go sai ten la bao loi luc kiem kieu. */
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
