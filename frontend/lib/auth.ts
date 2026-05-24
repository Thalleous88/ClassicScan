import { Platform } from 'react-native';
import { useSyncExternalStore } from 'react';
import * as SecureStore from 'expo-secure-store';

import type { AuthUser } from './types';

const TOKEN_KEY = 'classicscan_token';
const USER_KEY = 'classicscan_user';

type AuthState = {
  loaded: boolean;
  token: string | null;
  user: AuthUser | null;
};

let state: AuthState = { loaded: false, token: null, user: null };
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

async function readSecure(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function writeSecure(key: string, value: string | null): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return;
    try {
      if (value == null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    } catch {

    }
    return;
  }
  try {
    if (value == null) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, value);
  } catch {

  }
}

let bootstrapped: Promise<void> | null = null;

export function bootstrapAuth(): Promise<void> {
  if (bootstrapped) return bootstrapped;
  bootstrapped = (async () => {
    const [token, userRaw] = await Promise.all([
      readSecure(TOKEN_KEY),
      readSecure(USER_KEY),
    ]);
    let user: AuthUser | null = null;
    if (userRaw) {
      try {
        user = JSON.parse(userRaw) as AuthUser;
      } catch {
        user = null;
      }
    }
    state = { loaded: true, token, user };
    notify();
  })();
  return bootstrapped;
}

export async function getToken(): Promise<string | null> {
  if (!state.loaded) await bootstrapAuth();
  return state.token;
}

export async function setSession(token: string, user: AuthUser): Promise<void> {
  state = { loaded: true, token, user };
  await Promise.all([
    writeSecure(TOKEN_KEY, token),
    writeSecure(USER_KEY, JSON.stringify(user)),
  ]);
  notify();
}

export async function signOut(): Promise<void> {
  state = { loaded: true, token: null, user: null };
  await Promise.all([writeSecure(TOKEN_KEY, null), writeSecure(USER_KEY, null)]);
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  if (!bootstrapped) bootstrapAuth();
  return () => listeners.delete(listener);
}

function getSnapshot(): AuthState {
  return state;
}

export function useAuth(): AuthState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
