export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Generic mail-sending boundary. Deliberately knows nothing about auth, OTP, or any other
 * business feature: it only knows how to deliver a message. Business modules compose the
 * subject/body and inject this abstraction, never a concrete transport (e.g. nodemailer) directly.
 */
export abstract class MailService {
  abstract send(message: MailMessage): Promise<void>;
}
