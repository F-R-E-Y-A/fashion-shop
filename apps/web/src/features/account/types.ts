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
