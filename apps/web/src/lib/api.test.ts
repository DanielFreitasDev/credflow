import { describe, it, expect, beforeEach } from 'vitest';
import { AxiosError, type AxiosResponse } from 'axios';
import { tokenStore, apiError } from './api';

// Build a real AxiosError (so axios.isAxiosError is true) with a partial
// response body — no `any`, just a narrowing double-cast.
const axiosErrorWith = (data: unknown): AxiosError => {
  const err = new AxiosError('request failed');
  err.response = { data } as unknown as AxiosResponse;
  return err;
};

describe('tokenStore', () => {
  beforeEach(() => localStorage.clear());

  it('persists and reads the access/refresh pair', () => {
    tokenStore.set('access-1', 'refresh-1');
    expect(tokenStore.access).toBe('access-1');
    expect(tokenStore.refresh).toBe('refresh-1');
  });

  it('clears both tokens', () => {
    tokenStore.set('a', 'b');
    tokenStore.clear();
    expect(tokenStore.access).toBeNull();
    expect(tokenStore.refresh).toBeNull();
  });
});

describe('apiError', () => {
  it('joins an array of validation messages', () => {
    expect(
      apiError(axiosErrorWith({ message: ['campo A inválido', 'campo B inválido'] })),
    ).toBe('campo A inválido, campo B inválido');
  });
  it('returns a single string message', () => {
    expect(apiError(axiosErrorWith({ message: 'credenciais inválidas' }))).toBe(
      'credenciais inválidas',
    );
  });
  it('falls back to the Axios message when the body has none', () => {
    expect(apiError(axiosErrorWith({}))).toBe('request failed');
  });
  it('returns a generic message for non-Axios errors', () => {
    expect(apiError(new Error('boom'))).toBe('Erro inesperado');
  });
});
