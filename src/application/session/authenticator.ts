export interface SignInCredentials {
  readonly email: string;
  readonly password: string;
}

export type SignInResult =
  | { readonly kind: "signed-in"; readonly token: string; readonly expiresInSeconds: number }
  | { readonly kind: "rejected" }
  | { readonly kind: "unavailable" };

export interface Authenticator {
  signIn(credentials: SignInCredentials): Promise<SignInResult>;
}
