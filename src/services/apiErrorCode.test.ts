import { ApiError, apiErrorCode } from './apiClient';

it('reads the code a route put at the top level', () => {
  expect(apiErrorCode(new ApiError('Create an account', 404, { code: 'ACCOUNT_NOT_FOUND' }))).toBe('ACCOUNT_NOT_FOUND');
});

it('reads the code FastAPI nested under detail', () => {
  // Anything the backend raises rather than builds arrives wrapped. Reading only the top
  // level missed every one: a request for verification went unnoticed so no code was ever
  // sent, and an OTP failure surfaced as apiClient's generic "Session expired".
  expect(apiErrorCode(new ApiError('Session expired. Please log in again.', 401, {
    detail: { code: 'OTP_REQUIRED', detail: 'Verify your mobile number to continue.' },
  }))).toBe('OTP_REQUIRED');
});

it('is empty for anything without one', () => {
  expect(apiErrorCode(new ApiError('Service unavailable', 503))).toBe('');
  expect(apiErrorCode(new ApiError('Network error', 0, undefined, true))).toBe('');
  expect(apiErrorCode(new Error('not from the api'))).toBe('');
  expect(apiErrorCode(null)).toBe('');
});
