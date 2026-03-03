'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type QueryResourceOptions = {
  enabled?: boolean;
};

export function useQueryResource<T>(fetcher: () => Promise<T>, options?: QueryResourceOptions) {
  const enabled = options?.enabled ?? true;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);

  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  const refetch = useCallback(async () => {
    if (!enabled) return;
    try {
      setLoading(true);
      setError(null);
      const response = await fetcherRef.current();
      setData(response);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    void refetch();
  }, [enabled, refetch]);

  return {
    data,
    loading,
    error,
    refetch
  };
}
