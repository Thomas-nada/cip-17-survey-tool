/**
 * Application Context
 *
 * Provides:
 * - App mode (simulated / testnet)
 * - Blockchain service instance
 * - Survey state management
 * - Wallet connection state (CIP-30)
 * - Auto-seeding of simulated blockchain with demo data
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
import { SimulatedBlockchain } from '../services/SimulatedBlockchain.ts';
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
export type AppMode = 'simulated' | 'testnet';

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
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'CLEAR_STATE' }
  | { type: 'BULK_LOAD'; payload: { surveys: StoredSurvey[]; responses: Map<string, StoredResponse[]> } };

interface AppContextValue {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
  blockchain: BlockchainService;
  /** BlockfrostClient instance (available when in testnet mode) */
  blockfrostClient: BlockfrostClient | null;
  state: SurveyState;
  dispatch: React.Dispatch<SurveyAction>;
  blockfrostApiKey: string;
  setBlockfrostApiKey: (key: string) => void;
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
  const [mode, setModeRaw] = React.useState<AppMode>(
    () => (localStorage.getItem('cip17_mode') as AppMode) || 'simulated'
  );
  const [blockfrostApiKey, setBlockfrostApiKeyRaw] = React.useState(
    () => localStorage.getItem('cip17_blockfrost_key') || ''
  );
  const setBlockfrostApiKey = React.useCallback((key: string) => {
    setBlockfrostApiKeyRaw(key);
    if (key) {
      localStorage.setItem('cip17_blockfrost_key', key);
    } else {
      localStorage.removeItem('cip17_blockfrost_key');
    }
  }, []);
  const [state, dispatch] = useReducer(surveyReducer, initialState);

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

  // Keep simulated blockchain as singleton across re-renders
  const simulatedRef = useRef(new SimulatedBlockchain());
  // Keep testnet blockchain ref so we can call setConnectedWallet on it
  const testnetRef = useRef<TestnetBlockchain | null>(null);

  // Auto-seed simulated blockchain on mount
  useEffect(() => {
    if (mode === 'simulated') {
      const seedResult = simulatedRef.current.seed();
      dispatch({
        type: 'BULK_LOAD',
        payload: {
          surveys: seedResult.surveys,
          responses: seedResult.responses,
        },
      });
    }
  }, []); // Only on mount

  const setMode = useCallback((newMode: AppMode) => {
    setModeRaw(newMode);
    localStorage.setItem('cip17_mode', newMode);
    if (newMode === 'simulated') {
      // Re-load seed data when switching back to simulated
      const seedResult = simulatedRef.current.seed();
      dispatch({
        type: 'BULK_LOAD',
        payload: {
          surveys: seedResult.surveys,
          responses: seedResult.responses,
        },
      });
    } else {
      dispatch({ type: 'CLEAR_STATE' });
    }
  }, []);

  // Connect wallet — auto-switch to testnet mode
  const connect = useCallback(async (walletId: string) => {
    try {
      const api = await walletConnect(walletId);
      // Auto-switch to testnet mode when wallet connects
      if (mode !== 'testnet') {
        setModeRaw('testnet');
        dispatch({ type: 'CLEAR_STATE' });
      }
      return api;
    } catch (err) {
      throw err;
    }
  }, [walletConnect, mode]);

  // Disconnect wallet
  const disconnect = useCallback(() => {
    walletDisconnect();
    // Clear wallet name on testnet blockchain
    if (testnetRef.current) {
      testnetRef.current.setConnectedWallet(null);
    }
  }, [walletDisconnect]);

  // Keep a ref to the BlockfrostClient for eligibility checks
  const blockfrostClientRef = useRef<BlockfrostClient | null>(null);

  const blockchain = useMemo<BlockchainService>(() => {
    if (mode === 'simulated') {
      blockfrostClientRef.current = null;
      return simulatedRef.current;
    } else {
      const client = new BlockfrostClient(
        blockfrostApiKey || 'your-project-id',
        'preview'
      );
      blockfrostClientRef.current = client;
      const testnet = new TestnetBlockchain(client, () => null);
      testnetRef.current = testnet;
      // If wallet is already connected, set its name
      if (connectedWallet) {
        testnet.setConnectedWallet(connectedWallet.id);
      }
      return testnet;
    }
  }, [mode, blockfrostApiKey, connectedWallet]);

  // Sync wallet name to testnet blockchain when wallet changes
  useEffect(() => {
    if (testnetRef.current) {
      testnetRef.current.setConnectedWallet(connectedWallet?.id ?? null);
    }
  }, [connectedWallet]);

  // Fetch surveys from Blockfrost when in testnet mode with a valid API key
  useEffect(() => {
    if (mode !== 'testnet' || !blockfrostApiKey) return;

    let cancelled = false;
    dispatch({ type: 'SET_LOADING', payload: true });

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
  }, [mode, blockfrostApiKey, blockchain]);

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
      state,
      dispatch,
      blockfrostApiKey,
      setBlockfrostApiKey,
      wallet: walletState,
    }),
    [mode, setMode, blockchain, state, blockfrostApiKey, walletState]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
