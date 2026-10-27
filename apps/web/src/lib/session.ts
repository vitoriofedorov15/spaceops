import { createContext, useContext } from 'react';
import { User } from './types';
export const UserContext = createContext<User | null>(null);
export function useUser() {
  const u = useContext(UserContext);
  if (!u) throw new Error('Missing session');
  return u;
}
