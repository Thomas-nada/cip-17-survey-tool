/**
 * CIP-30 Cardano Wallet Hook
 *
 * Detects available CIP-30 browser wallets (Nami, Eternl, Lace, Flint, etc.),
 * handles connection/disconnection, and provides the wallet API for tx signing.
 */
import { useState, useEffect, useCallback, useRef } from 'react';

// ─── CIP-30 Types ───────────────────────────────────────────────────
export interface CIP30WalletAPI {
  getChangeAddress(): Promise<string>;
  getUtxos(): Promise<string[] | undefined>;
  signTx(tx: string, partialSign?: boolean): Promise<string>;
  submitTx(tx: string): Promise<string>;
  getUsedAddresses(): Promise<string[]>;
  getNetworkId(): Promise<number>;
  getBalance(): Promise<string>;
}

export interface DetectedWallet {
  id: string;         // key in window.cardano (e.g. 'nami', 'eternl')
  name: string;       // human-readable name
  icon: string;       // base64 or URL icon
  apiVersion: string;
}

export interface WalletState {
  /** Wallets detected in the browser */
  availableWallets: DetectedWallet[];
  /** Currently connected wallet info */
  connectedWallet: DetectedWallet | null;
  /** CIP-30 wallet API instance (after enable()) */
  walletApi: CIP30WalletAPI | null;
  /** Connected address (bech32) — may be hex from CIP-30, converted later */
  address: string | null;
  /** Network ID: 0 = testnet, 1 = mainnet */
  networkId: number | null;
  /** Loading state while connecting */
  connecting: boolean;
  /** Error message if connection fails */
  error: string | null;
}

// Known wallet IDs to look for in window.cardano
const KNOWN_WALLETS = [
  'nami',
  'eternl',
  'lace',
  'flint',
  'typhon',
  'gerowallet',
  'nufi',
  'begin',
  'vespr',
  'yoroi',
] as const;

// We access window.cardano dynamically — Mesh SDK already declares a `Cardano` type
// on the Window interface. We use a helper to safely access wallet providers.
function getCardanoProviders(): Record<string, {
  name: string;
  icon: string;
  apiVersion: string;
  enable(): Promise<CIP30WalletAPI>;
  isEnabled(): Promise<boolean>;
}> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cardano = (window as any).cardano;
  if (!cardano || typeof cardano !== 'object') return {};
  return cardano;
}

export function useCardanoWallet() {
  const [state, setState] = useState<WalletState>({
    availableWallets: [],
    connectedWallet: null,
    walletApi: null,
    address: null,
    networkId: null,
    connecting: false,
    error: null,
  });

  // Ref to hold walletApi for stable callbacks
  const walletApiRef = useRef<CIP30WalletAPI | null>(null);

  // Detect available wallets on mount
  useEffect(() => {
    const detect = () => {
      const cardano = getCardanoProviders();
      if (Object.keys(cardano).length === 0) return;

      const detected: DetectedWallet[] = [];
      for (const id of KNOWN_WALLETS) {
        const provider = cardano[id];
        if (provider && typeof provider.enable === 'function') {
          detected.push({
            id,
            name: provider.name || id,
            icon: provider.icon || '',
            apiVersion: provider.apiVersion || '0',
          });
        }
      }

      // Also detect any unknown wallets
      for (const key of Object.keys(cardano)) {
        if (KNOWN_WALLETS.includes(key as (typeof KNOWN_WALLETS)[number])) continue;
        const provider = cardano[key];
        if (
          provider &&
          typeof provider === 'object' &&
          typeof provider.enable === 'function' &&
          typeof provider.name === 'string'
        ) {
          detected.push({
            id: key,
            name: provider.name,
            icon: provider.icon || '',
            apiVersion: provider.apiVersion || '0',
          });
        }
      }

      setState((prev) => ({ ...prev, availableWallets: detected }));
    };

    // Some wallets inject after DOM load — retry a few times
    detect();
    const t1 = setTimeout(detect, 500);
    const t2 = setTimeout(detect, 1500);
    const t3 = setTimeout(detect, 3000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  // Connect to a specific wallet
  const connect = useCallback(async (walletId: string) => {
    setState((prev) => ({ ...prev, connecting: true, error: null }));

    try {
      const cardano = getCardanoProviders();
      const provider = cardano[walletId];
      if (!provider) {
        throw new Error(`Wallet "${walletId}" not found. Please install it.`);
      }

      // CIP-30 enable() — prompts user to authorize
      const api = await provider.enable();
      walletApiRef.current = api;

      // Get the change address (hex-encoded)
      const addressHex = await api.getChangeAddress();

      // Get network ID
      const networkId = await api.getNetworkId();

      const walletInfo: DetectedWallet = {
        id: walletId,
        name: provider.name || walletId,
        icon: provider.icon || '',
        apiVersion: provider.apiVersion || '0',
      };

      setState((prev) => ({
        ...prev,
        connectedWallet: walletInfo,
        walletApi: api,
        address: addressHex,
        networkId,
        connecting: false,
        error: null,
      }));

      return api;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect wallet';
      setState((prev) => ({
        ...prev,
        connectedWallet: null,
        walletApi: null,
        address: null,
        networkId: null,
        connecting: false,
        error: message,
      }));
      walletApiRef.current = null;
      throw err;
    }
  }, []);

  // Disconnect wallet
  const disconnect = useCallback(() => {
    walletApiRef.current = null;
    setState((prev) => ({
      ...prev,
      connectedWallet: null,
      walletApi: null,
      address: null,
      networkId: null,
      error: null,
    }));
  }, []);

  // Getter function for current wallet API (used by TestnetBlockchain)
  const getWalletApi = useCallback((): CIP30WalletAPI | null => {
    return walletApiRef.current;
  }, []);

  return {
    ...state,
    connect,
    disconnect,
    getWalletApi,
  };
}
