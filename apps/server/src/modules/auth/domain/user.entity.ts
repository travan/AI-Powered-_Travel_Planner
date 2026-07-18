export type AuthProvider = "local" | "google";

export type User = {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  provider: AuthProvider;
  createdAt: string;
};

export type ApiUser = {
  id: string;
  email: string;
  user_metadata: {
    full_name: string | null;
    avatar_url: string | null;
  };
};

export function toApiUser(user: User): ApiUser {
  return {
    id: user.id,
    email: user.email,
    user_metadata: {
      full_name: user.fullName,
      avatar_url: user.avatarUrl,
    },
  };
}
