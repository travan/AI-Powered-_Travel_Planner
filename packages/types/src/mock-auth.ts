export type MockAuthChangeEvent =
  | "INITIAL_SESSION"
  | "SIGNED_IN"
  | "SIGNED_OUT"
  | "PASSWORD_RECOVERY"
  | "USER_UPDATED";

export type MockAuthCallback = (
  event: MockAuthChangeEvent,
  session: MockSession | null
) => void;

export interface MockUser {
  id: string;
  email: string;
  user_metadata: Record<string, unknown>;
}

export interface MockSession {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  expires_in: number;
  expires_at: number;
  user: MockUser;
}

export interface StoredMockUser {
  id: string;
  email: string;
  password: string;
  user_metadata: Record<string, unknown>;
}

export interface MockAuthResponse {
  data: {
    user: MockUser | null;
    session: MockSession | null;
  };
  error: Error | null;
}

export interface MockSessionResponse {
  data: {
    session: MockSession | null;
  };
  error: Error | null;
}

export interface MockUserResponse {
  data: {
    user: MockUser | null;
  };
  error: Error | null;
}

export interface MockSubscription {
  unsubscribe: () => void;
}

export interface MockAuthClient {
  auth: {
    getSession: () => Promise<MockSessionResponse>;
    getUser: () => Promise<MockUserResponse>;
    signUp: (credentials: {
      email: string;
      password: string;
      options?: { data?: Record<string, unknown> };
    }) => Promise<MockAuthResponse>;
    signInWithPassword: (credentials: {
      email: string;
      password: string;
    }) => Promise<MockAuthResponse>;
    signInWithOAuth: (credentials: {
      provider: string;
      options?: { redirectTo?: string };
    }) => Promise<{ data: { provider: string; url: string | null }; error: Error | null }>;
    resetPasswordForEmail: (
      _email: string,
      _options?: { redirectTo?: string }
    ) => Promise<{ data: object; error: Error | null }>;
    resend: (_params: {
      type: string;
      email: string;
      options?: { emailRedirectTo?: string };
    }) => Promise<{ data: object; error: Error | null }>;
    updateUser: (attributes: {
      password?: string;
      data?: Record<string, unknown>;
    }) => Promise<MockUserResponse>;
    signOut: () => Promise<{ error: Error | null }>;
    onAuthStateChange: (callback: MockAuthCallback) => {
      data: { subscription: MockSubscription };
    };
  };
}