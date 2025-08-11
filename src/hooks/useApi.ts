import { useState, useCallback } from 'react';
import type { ApiResponse } from '../types';

interface UseApiOptions {
  baseURL?: string;
  defaultHeaders?: Record<string, string>;
}

export const useApi = (token: string, options: UseApiOptions = {}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  const baseURL = options.baseURL || 'http://localhost:3001';

  const apiCall = useCallback(async <T = any>(
    url: string, 
    requestOptions: RequestInit = {}
  ): Promise<T> => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${baseURL}${url}`, {
        ...requestOptions,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          ...options.defaultHeaders,
          ...requestOptions.headers
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Something went wrong');
      }

      const data = await response.json();
      return data;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [token, baseURL, options.defaultHeaders]);

  const clearError = useCallback(() => setError(''), []);

  return {
    apiCall,
    loading,
    error,
    clearError
  };
};