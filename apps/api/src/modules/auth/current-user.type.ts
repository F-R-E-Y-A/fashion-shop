/**
 * Stable, safe representation of the authenticated principal shared with other modules.
 * It deliberately excludes persistence, credential, and session implementation details.
 */
export interface CurrentUserType {
  id: string;
  email: string;
  roles: string[];
}
