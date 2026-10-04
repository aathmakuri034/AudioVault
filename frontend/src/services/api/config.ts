import * as SecureStore from 'expo-secure-store';
import { z } from 'zod';

import { getRepositories, SettingKeys } from '@/services/database/repositories';

import { ApiClient, type ApiConfig } from './client';

const API_KEY_STORE_KEY = 'audiovault.apiKey';

/**
 * Development defaults from frontend/.env (EXPO_PUBLIC_* values are embedded
 * in the JS bundle, so they are a convenience for local dev only). Values set
 * in Settings take precedence. The API key is kept in the iOS Keychain /
 * Android Keystore via expo-secure-store, never in SQLite.
 */
const ENV_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? '';
const ENV_API_KEY = process.env.EXPO_PUBLIC_API_KEY ?? '';

export async function getApiConfig(): Promise<ApiConfig> {
  const repos = await getRepositories();
  const storedUrl = await repos.settings.get(SettingKeys.apiBaseUrl, z.string());
  let storedKey: string | null = null;
  try {
    storedKey = await SecureStore.getItemAsync(API_KEY_STORE_KEY);
  } catch {
    storedKey = null;
  }
  return { baseUrl: storedUrl || ENV_BASE_URL, apiKey: storedKey || ENV_API_KEY };
}

export async function saveApiConfig(config: { baseUrl: string; apiKey?: string }) {
  const repos = await getRepositories();
  await repos.settings.set(SettingKeys.apiBaseUrl, config.baseUrl.trim());
  if (config.apiKey !== undefined) {
    if (config.apiKey.trim())
      await SecureStore.setItemAsync(API_KEY_STORE_KEY, config.apiKey.trim());
    else await SecureStore.deleteItemAsync(API_KEY_STORE_KEY);
  }
}

export async function hasStoredApiKey(): Promise<boolean> {
  try {
    return !!(await SecureStore.getItemAsync(API_KEY_STORE_KEY)) || !!ENV_API_KEY;
  } catch {
    return !!ENV_API_KEY;
  }
}

let client: ApiClient | null = null;

/** The app-wide API client; reads config on every request so Settings changes apply immediately. */
export function getApiClient(): ApiClient {
  client ??= new ApiClient({ getConfig: getApiConfig });
  return client;
}
