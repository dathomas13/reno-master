import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from 'firebase/auth';
import { watchUser, ensureProfile } from '@/firebase/auth';
import { seedIfEmpty } from '@/data/seed';
import type { UserProfile } from '@/data/types';

interface AuthValue {
  user: User | null;
  profile: UserProfile | null;
  ready: boolean;
}

const AuthContext = createContext<AuthValue>({ user: null, profile: null, ready: false });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(
    () =>
      watchUser((nextUser) => {
        setUser(nextUser);
        setReady(true);
        if (!nextUser) {
          setProfile(null);
          return;
        }
        // both may fail offline; the app stays usable from the cache either way
        void ensureProfile(nextUser)
          .then(setProfile)
          .catch(() => undefined);
        void seedIfEmpty().catch(() => undefined);
      }),
    [],
  );

  return <AuthContext.Provider value={{ user, profile, ready }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  return useContext(AuthContext);
}
