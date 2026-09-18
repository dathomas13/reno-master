import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { User } from 'firebase/auth';
import { watchUser, ensureProfile } from '@/firebase/auth';
import { seedIfEmpty } from '@/data/seed';
import { COL, type UserProfile } from '@/data/types';
import { watchDoc } from '@/firebase/db';

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
  const profileStop = useRef<(() => void) | null>(null);
  const profileRun = useRef(0);

  useEffect(
    () => {
      const stopAuth = watchUser((nextUser) => {
        profileRun.current += 1;
        const run = profileRun.current;
        profileStop.current?.();
        profileStop.current = null;
        setUser(nextUser);
        setReady(true);
        if (!nextUser) {
          setProfile(null);
          return;
        }
        profileStop.current = watchDoc<UserProfile>(
          COL.users,
          nextUser.uid,
          (row) => {
            if (profileRun.current === run) setProfile(row);
          },
          () => undefined,
        );
        // both may fail offline; the app stays usable from the cache either way
        void ensureProfile(nextUser)
          .then((nextProfile) => {
            if (profileRun.current === run) setProfile(nextProfile);
          })
          .catch(() => undefined);
        void seedIfEmpty().catch(() => undefined);
      });
      return () => {
        profileRun.current += 1;
        profileStop.current?.();
        profileStop.current = null;
        stopAuth();
      };
    },
    [],
  );

  return <AuthContext.Provider value={{ user, profile, ready }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  return useContext(AuthContext);
}
