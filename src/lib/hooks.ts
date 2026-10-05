import { useEffect, useReducer } from 'preact/hooks';
import { subscribe } from './store';

/** Re-render the component whenever any record in the store changes. */
export function useStore() {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const off = subscribe(() => bump(undefined));
    return () => void off();
  }, []);
}
