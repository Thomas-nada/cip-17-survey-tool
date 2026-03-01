export type DefaultResultsSort = 'leading' | 'name' | 'votes' | 'percentage';
export type CopyFormat = 'json_pretty' | 'json_minified' | 'cli_snippet';
export type ExplorerProvider = 'cardanoscan' | 'cexplorer';
export type FontScale = 'small' | 'medium' | 'large';

export interface UserPreferences {
  defaultResultsSort: DefaultResultsSort;
  confirmBeforeVoteSubmit: boolean;
  copyFormat: CopyFormat;
  explorerProvider: ExplorerProvider;
  fontScale: FontScale;
}

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  defaultResultsSort: 'leading',
  confirmBeforeVoteSubmit: false,
  copyFormat: 'json_pretty',
  explorerProvider: 'cardanoscan',
  fontScale: 'medium',
};

type PreferenceKey = keyof UserPreferences;

const PREFIX = 'cip17_pref_';
const ALL_KEYS: PreferenceKey[] = [
  'defaultResultsSort',
  'confirmBeforeVoteSubmit',
  'copyFormat',
  'explorerProvider',
  'fontScale',
];

function storageKey(key: PreferenceKey): string {
  return `${PREFIX}${key}`;
}

function parseBoolean(raw: string | null, fallback: boolean): boolean {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return fallback;
}

export function getUserPreferences(): UserPreferences {
  return {
    defaultResultsSort:
      (localStorage.getItem(storageKey('defaultResultsSort')) as DefaultResultsSort) ??
      DEFAULT_USER_PREFERENCES.defaultResultsSort,
    confirmBeforeVoteSubmit: parseBoolean(
      localStorage.getItem(storageKey('confirmBeforeVoteSubmit')),
      DEFAULT_USER_PREFERENCES.confirmBeforeVoteSubmit
    ),
    copyFormat:
      (localStorage.getItem(storageKey('copyFormat')) as CopyFormat) ??
      DEFAULT_USER_PREFERENCES.copyFormat,
    explorerProvider:
      (localStorage.getItem(storageKey('explorerProvider')) as ExplorerProvider) ??
      DEFAULT_USER_PREFERENCES.explorerProvider,
    fontScale:
      (localStorage.getItem(storageKey('fontScale')) as FontScale) ??
      DEFAULT_USER_PREFERENCES.fontScale,
  };
}

export function setUserPreference<K extends PreferenceKey>(key: K, value: UserPreferences[K]): void {
  localStorage.setItem(storageKey(key), String(value));
  window.dispatchEvent(
    new CustomEvent('cip17:preferences-changed', { detail: { key, value } })
  );
}

export function resetUserPreferences(): void {
  for (const key of ALL_KEYS) {
    localStorage.removeItem(storageKey(key));
  }
  window.dispatchEvent(new CustomEvent('cip17:preferences-changed', { detail: null }));
}

export function buildCopyContent(
  copyFormat: CopyFormat,
  jsonValue: unknown,
  cliSnippet?: string
): string {
  if (copyFormat === 'cli_snippet' && typeof cliSnippet === 'string' && cliSnippet.trim().length > 0) {
    return cliSnippet;
  }
  if (copyFormat === 'json_minified') {
    return JSON.stringify(jsonValue);
  }
  return JSON.stringify(jsonValue, null, 2);
}

export function clearLocalAppCache(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (k.startsWith('cip17_')) keysToRemove.push(k);
  }
  for (const k of keysToRemove) localStorage.removeItem(k);
  window.dispatchEvent(new CustomEvent('cip17:preferences-changed', { detail: null }));
}

