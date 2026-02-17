/**
 * Application Context
 *
 * Provides:
 * - App mode (simulated / testnet)
 * - Blockchain service instance
 * - Survey state management
 * - Wallet connection state (testnet mode)
 */
import {
  createContext,
  useContext,
  useReducer,
  useMemo,
  useRef,
  useCallback,
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

// ─── Types ──────────────────────────────────────────────────────────
type AppMode = 'simulated' | 'testnet';

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
  | { type: 'CLEAR_STATE' };

interface AppContextValue {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
  blockchain: BlockchainService;
  state: SurveyState;
  dispatch: React.Dispatch<SurveyAction>;
  blockfrostApiKey: string;
  setBlockfrostApiKey: (key: string) => void;
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
      return { ...initialState };

    default:
      return state;
  }
}

// ─── Context ────────────────────────────────────────────────────────
const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [mode, setModeRaw] = React.useState<AppMode>('simulated');
  const [blockfrostApiKey, setBlockfrostApiKey] = React.useState('');
  const [state, dispatch] = useReducer(surveyReducer, initialState);

  // Keep simulated blockchain as singleton across re-renders
  const simulatedRef = useRef(new SimulatedBlockchain());

  const setMode = useCallback((newMode: AppMode) => {
    setModeRaw(newMode);
    dispatch({ type: 'CLEAR_STATE' });
  }, []);

  const blockchain = useMemo<BlockchainService>(() => {
    if (mode === 'simulated') {
      return simulatedRef.current;
    } else {
      const client = new BlockfrostClient(
        blockfrostApiKey || 'your-project-id',
        'preview'
      );
      return new TestnetBlockchain(client, () => null);
    }
  }, [mode, blockfrostApiKey]);

  const value = useMemo(
    () => ({
      mode,
      setMode,
      blockchain,
      state,
      dispatch,
      blockfrostApiKey,
      setBlockfrostApiKey,
    }),
    [mode, setMode, blockchain, state, blockfrostApiKey]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

// Need React import for useState
import React from 'react';
