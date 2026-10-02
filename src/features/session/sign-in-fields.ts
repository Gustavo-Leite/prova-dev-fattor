export const signInFieldNames = { email: "email", password: "password" } as const;

export const maxEmailLength = 254;
export const maxPasswordLength = 256;

export const emailErrors = ["required", "invalid", "tooLong"] as const;
export const passwordErrors = ["required", "tooLong"] as const;

export type EmailError = (typeof emailErrors)[number];
export type PasswordError = (typeof passwordErrors)[number];

export interface SignInFieldErrors {
  readonly email?: EmailError;
  readonly password?: PasswordError;
}

export type SignInFormError = "rejected" | "unavailable";

export interface SignInFormState {
  readonly email: string;
  readonly fieldErrors?: SignInFieldErrors;
  readonly formError?: SignInFormError;
}
