export interface AuthenticatedUser {
  id: string;
  email: string;
  roles: string[];
}

export interface AuthResponse {
  accessToken: string;
  user: AuthenticatedUser;
}

export interface Credentials {
  email: string;
  password: string;
}

export interface RegisterResponse {
  verificationRequired: true;
  email: string;
}

export interface VerifyEmailResponse {
  verified: true;
}

export interface ResendVerificationResponse {
  accepted: true;
}
