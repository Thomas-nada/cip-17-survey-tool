/**
 * Application Context
 *
 * Provides:
 * - Network mode (mainnet / testnet)
 * - Blockchain service instance
 * - Survey state management
 * - Wallet connection state (CIP-30)
 */
import React, {
  createContext,
  useContext,
  useReducer,
  useMemo,
  useRef,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import { TestnetBlockchain } from '../services/TestnetBlockchain.ts';
import { BlockfrostClient } from '../services/BlockfrostClient.ts';
import type { BlockchainService } from '../services/BlockchainService.ts';
import type {
  StoredSurvey,
  StoredResponse,
  TallyResult,
} from '../types/survey.ts';
import {
  useCardanoWallet,
  type CIP30WalletAPI,
  type DetectedWallet,
} from '../hooks/useCardanoWallet.ts';

// ─── Types ──────────────────────────────────────────────────────────
export type AppMode = 'mainnet' | 'testnet';

interface SurveyState {
  surveys: StoredSurvey[];
  responses: Map<string, StoredResponse[]>;
  tallies: Map<string, TallyResult>;
  loading: boolean;
  error: string | null;
}

type SurveyAction =
  | { type: 'SURVEY_CREATED'; payload: StoredSurvey }
  | { type: 'RESPONSE_SUBMITTED'; payload: { surveyTxId: string; response: StoredResponse } }
  | { type: 'TALLY_COMPUTED'; payload: { surveyTxId: string; tally: TallyResult } }
  | { type: 'SURVEYS_LOADED'; payload: StoredSurvey[] }
  | { type: 'RESPONSES_LOADED'; payload: { surveyTxId: string; responses: StoredResponse[] } }
  | { type: 'RESPONSES_MERGED'; payload: { surveyTxId: string; responses: StoredResponse[] } }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'CLEAR_STATE' }
  | { type: 'BULK_LOAD'; payload: { surveys: StoredSurvey[]; responses: Map<string, StoredResponse[]> } };

interface AppContextValue {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
  blockchain: BlockchainService;
  /** BlockfrostClient instance for the active network */
  blockfrostClient: BlockfrostClient | null;
  backendHealth: {
    ok: boolean;
    mainnetKey: boolean;
    testnetKey: boolean;
    checkedAt: number | null;
  };
  state: SurveyState;
  dispatch: React.Dispatch<SurveyAction>;
  // Wallet state
  wallet: {
    availableWallets: DetectedWallet[];
    connectedWallet: DetectedWallet | null;
    walletApi: CIP30WalletAPI | null;
    address: string | null;
    networkId: number | null;
    connecting: boolean;
    error: string | null;
    connect: (walletId: string) => Promise<CIP30WalletAPI | undefined>;
    disconnect: () => void;
  };
}

// ─── Reducer ────────────────────────────────────────────────────────
const initialState: SurveyState = {
  surveys: [],
  responses: new Map(),
  tallies: new Map(),
  loading: false,
  error: null,
};

const APP_CACHE_TTL_MS = Number(import.meta.env.VITE_APP_CACHE_TTL_MS || 300_000);
const APP_CACHE_VERSION = 1;

type CachedSurveyState = {
  version: number;
  mode: AppMode;
  savedAt: number;
  surveys: StoredSurvey[];
  responses: Array<[string, StoredResponse[]]>;
};

function cacheKey(mode: AppMode): string {
  return `cip17_app_state_${mode}`;
}

function loadCachedState(mode: AppMode): SurveyState {
  if (typeof window === 'undefined' || !window.localStorage) return { ...initialState, responses: new Map(), tallies: new Map() };
  try {
    const raw = window.localStorage.getItem(cacheKey(mode));
    if (!raw) return { ...initialState, responses: new Map(), tallies: new Map() };
    const parsed = JSON.parse(raw) as CachedSurveyState;
    if (!parsed || parsed.version !== APP_CACHE_VERSION || parsed.mode !== mode) {
      return { ...initialState, responses: new Map(), tallies: new Map() };
    }
    if (Date.now() - parsed.savedAt > APP_CACHE_TTL_MS) {
      return { ...initialState, responses: new Map(), tallies: new Map() };
    }
    return {
      surveys: Array.isArray(parsed.surveys) ? parsed.surveys : [],
      responses: new Map(Array.isArray(parsed.responses) ? parsed.responses : []),
      tallies: new Map(),
      loading: false,
      error: null,
    };
  } catch {
    return { ...initialState, responses: new Map(), tallies: new Map() };
  }
}

function persistState(mode: AppMode, state: SurveyState): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const payload: CachedSurveyState = {
      version: APP_CACHE_VERSION,
      mode,
      savedAt: Date.now(),
      surveys: state.surveys,
      responses: Array.from(state.responses.entries()),
    };
    window.localStorage.setItem(cacheKey(mode), JSON.stringify(payload));
  } catch {
    // Best-effort persistence only.
  }
}

function hasFreshCache(mode: AppMode): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try {
    const raw = window.localStorage.getItem(cacheKey(mode));
    if (!raw) return false;
    const parsed = JSON.parse(raw) as CachedSurveyState;
    if (!parsed || parsed.version !== APP_CACHE_VERSION || parsed.mode !== mode) return false;
    return Date.now() - parsed.savedAt <= APP_CACHE_TTL_MS;
  } catch {
    return false;
  }
}

function surveyReducer(state: SurveyState, action: SurveyAction): SurveyState {
  switch (action.type) {
    case 'SURVEY_CREATED':
      return {
        ...state,
        surveys: [action.payload, ...state.surveys],
        error: null,
      };

    case 'RESPONSE_SUBMITTED': {
      const newResponses = new Map(state.responses);
      const existing = newResponses.get(action.payload.surveyTxId) ?? [];
      newResponses.set(action.payload.surveyTxId, [
        ...existing,
        action.payload.response,
      ]);
      // Invalidate cached tally
      const newTallies = new Map(state.tallies);
      newTallies.delete(action.payload.surveyTxId);
      return { ...state, responses: newResponses, tallies: newTallies, error: null };
    }

    case 'TALLY_COMPUTED': {
      const newTallies = new Map(state.tallies);
      newTallies.set(action.payload.surveyTxId, action.payload.tally);
      return { ...state, tallies: newTallies };
    }

    case 'SURVEYS_LOADED':
      return { ...state, surveys: action.payload, error: null };

    case 'RESPONSES_LOADED': {
      const newResponses = new Map(state.responses);
      newResponses.set(
        action.payload.surveyTxId,
        action.payload.responses
      );
      return { ...state, responses: newResponses };
    }

    case 'RESPONSES_MERGED': {
      const newResponses = new Map(state.responses);
      const existing = newResponses.get(action.payload.surveyTxId) ?? [];
      const byTx = new Map<string, StoredResponse>();
      for (const resp of existing) byTx.set(resp.txId, resp);
      for (const resp of action.payload.responses) byTx.set(resp.txId, resp);
      const merged = Array.from(byTx.values()).sort((a, b) => {
        if (a.slot !== b.slot) return b.slot - a.slot;
        return b.txIndexInBlock - a.txIndexInBlock;
      });
      newResponses.set(action.payload.surveyTxId, merged);
      return { ...state, responses: newResponses };
    }

    case 'SET_LOADING':
      return { ...state, loading: action.payload };

    case 'SET_ERROR':
      return { ...state, error: action.payload };

    case 'CLEAR_STATE':
      return { ...initialState, responses: new Map(), tallies: new Map() };

    case 'BULK_LOAD':
      return {
        ...state,
        surveys: action.payload.surveys,
        responses: action.payload.responses,
        tallies: new Map(),
        loading: false,
        error: null,
      };

    default:
      return state;
  }
}

// ─── Context ────────────────────────────────────────────────────────
const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [mode, setModeRaw] = React.useState<AppMode>(() => {
    if (typeof window === 'undefined' || !window.localStorage) return 'mainnet';
    return (window.localStorage.getItem('cip17_mode') as AppMode) || 'mainnet';
  });
  const [backendHealth, setBackendHealth] = React.useState({
    ok: false,
    mainnetKey: false,
    testnetKey: false,
    checkedAt: null as number | null,
  });
  const [state, dispatch] = useReducer(surveyReducer, mode, loadCachedState);

  // CIP-30 wallet hook
  const {
    availableWallets,
    connectedWallet,
    walletApi,
    address,
    networkId,
    connecting,
    error: walletError,
    connect: walletConnect,
    disconnect: walletDisconnect,
  } = useCardanoWallet();

  // Keep blockchain ref so we can call setConnectedWallet on it
  const testnetRef = useRef<TestnetBlockchain | null>(null);

  const setMode = useCallback((newMode: AppMode) => {
    setModeRaw(newMode);
    localStorage.setItem('cip17_mode', newMode);
    const cached = loadCachedState(newMode);
    dispatch({
      type: 'BULK_LOAD',
      payload: { surveys: cached.surveys, responses: cached.responses },
    });
  }, []);

  const connect = useCallback(async (walletId: string) => {
    try {
      const api = await walletConnect(walletId);
      return api;
    } catch (err) {
      throw err;
    }
  }, [walletConnect]);

  // Disconnect wallet
  const disconnect = useCallback(() => {
    walletDisconnect();
    // Clear wallet name on blockchain service
    if (testnetRef.current) {
      testnetRef.current.setConnectedWallet(null);
    }
  }, [walletDisconnect]);

  // Keep a ref to the BlockfrostClient for eligibility checks
  const blockfrostClientRef = useRef<BlockfrostClient | null>(null);

  const blockchain = useMemo<BlockchainService>(() => {
    const network = mode === 'mainnet' ? 'mainnet' : 'preview';
    const client = new BlockfrostClient(
      '',
      network
    );
    blockfrostClientRef.current = client;
    const testnet = new TestnetBlockchain(client, () => null, mode);
    testnetRef.current = testnet;
    // If wallet is already connected, set its name
    if (connectedWallet) {
      testnet.setConnectedWallet(connectedWallet.id);
    }
    return testnet;
  }, [connectedWallet, mode]);

  // Sync wallet name to blockchain service when wallet changes
  useEffect(() => {
    if (testnetRef.current) {
      testnetRef.current.setConnectedWallet(connectedWallet?.id ?? null);
    }
  }, [connectedWallet]);

  // Poll backend health and key availability
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const health = await blockfrostClientRef.current?.getServiceHealth();
        if (cancelled || !health) return;
        setBackendHealth({
          ok: Boolean(health.ok),
          mainnetKey: Boolean(health.keys?.mainnet),
          testnetKey: Boolean(health.keys?.testnet),
          checkedAt: typeof health.ts === 'number' ? health.ts : Date.now(),
        });
      } catch {
        if (!cancelled) {
          setBackendHealth((prev) => ({ ...prev, ok: false, checkedAt: Date.now() }));
        }
      }
    };
    void run();
    const interval = window.setInterval(() => { void run(); }, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [mode, blockchain]);

  // Fetch surveys from backend index
  useEffect(() => {
    let cancelled = false;
    const freshCache = hasFreshCache(mode);
    if (!freshCache) {
      dispatch({ type: 'SET_LOADING', payload: true });
    }

    if (freshCache) {
      return () => { cancelled = true; };
    }

    blockchain.listSurveys().then(async (surveys) => {
      if (cancelled) return;
      // Also fetch responses for each survey
      const responses = new Map<string, StoredResponse[]>();
      for (const survey of surveys) {
        try {
          const resp = await blockchain.getResponses(survey.surveyTxId);
          if (cancelled) return;
          if (resp.length > 0) {
            responses.set(survey.surveyTxId, resp);
          }
        } catch {
          // Skip failed response fetches
        }
      }
      if (!cancelled) {
        dispatch({
          type: 'BULK_LOAD',
          payload: { surveys, responses },
        });
      }
    }).catch((err) => {
      if (!cancelled) {
        console.error('Failed to fetch surveys from Blockfrost:', err);
        dispatch({ type: 'SET_ERROR', payload: 'Failed to load surveys from Blockfrost' });
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    });

    return () => { cancelled = true; };
  }, [blockchain, mode]);

  // Persist surveys/responses for fast reloads.
  useEffect(() => {
    persistState(mode, state);
  }, [mode, state.surveys, state.responses]);

  const walletState = useMemo(() => ({
    availableWallets,
    connectedWallet,
    walletApi,
    address,
    networkId,
    connecting,
    error: walletError,
    connect,
    disconnect,
  }), [
    availableWallets, connectedWallet, walletApi,
    address, networkId, connecting, walletError,
    connect, disconnect,
  ]);

  const value = useMemo(
    () => ({
      mode,
      setMode,
      blockchain,
      blockfrostClient: blockfrostClientRef.current,
      backendHealth,
      state,
      dispatch,
      wallet: walletState,
    }),
    [mode, setMode, blockchain, backendHealth, state, walletState]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
