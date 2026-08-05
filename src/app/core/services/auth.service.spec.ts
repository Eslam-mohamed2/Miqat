import { AuthService } from './auth.service';

/**
 * extractTokens/decodeToken touch no injected dependency, so the instance is
 * built off the prototype and the constructor is skipped - no TestBed needed.
 */
function makeService(): AuthService {
  return Object.create(AuthService.prototype) as AuthService;
}

/** base64url-encode UTF-8 the way a real JWT issuer does. */
function b64url(obj: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function jwt(payload: unknown): string {
  return `${b64url({ alg: 'HS256' })}.${b64url(payload)}.sig`;
}

describe('AuthService.extractTokens', () => {
  let svc: AuthService;
  const TOKEN = jwt({ nameid: '42' });

  beforeEach(() => { svc = makeService(); });

  it('reads tokens out of the ApiResponse envelope', () => {
    const body = JSON.stringify({
      success: true, message: null, errors: null,
      data: { accessToken: TOKEN, refreshToken: 'r1' }
    });
    expect(svc.extractTokens(body)).toEqual({ accessToken: TOKEN, refreshToken: 'r1' });
  });

  it('accepts the `token` alias inside the envelope', () => {
    const body = JSON.stringify({ success: true, message: null, errors: null, data: { token: TOKEN } });
    expect(svc.extractTokens(body)?.accessToken).toBe(TOKEN);
  });

  it('accepts a bare JWT string as the envelope payload', () => {
    const body = JSON.stringify({ success: true, message: null, errors: null, data: TOKEN });
    expect(svc.extractTokens(body)?.accessToken).toBe(TOKEN);
  });

  it('still reads an unwrapped JSON body', () => {
    const body = JSON.stringify({ accessToken: TOKEN, refreshToken: 'r2' });
    expect(svc.extractTokens(body)).toEqual({ accessToken: TOKEN, refreshToken: 'r2' });
  });

  it('accepts a raw JWT string response', () => {
    expect(svc.extractTokens(TOKEN)).toEqual({ accessToken: TOKEN });
  });

  // Regression: a JSON body containing a JWT has dots in it. Testing for a token
  // before parsing matched the entire body and stored it as the access token,
  // which sent `Bearer {"success":true,...}` on every subsequent request.
  it('never stores a JSON body as the access token', () => {
    const body = JSON.stringify({ success: true, message: null, errors: null, data: { accessToken: TOKEN } });
    expect(svc.extractTokens(body)?.accessToken).toBe(TOKEN);
    expect(svc.extractTokens(body)?.accessToken).not.toContain('{');
  });

  it('returns null when the response carries no token', () => {
    expect(svc.extractTokens('Success')).toBeNull();
    expect(svc.extractTokens('Password reset email sent')).toBeNull();
    expect(svc.extractTokens('')).toBeNull();
    expect(svc.extractTokens(null)).toBeNull();
    expect(svc.extractTokens(undefined)).toBeNull();
    expect(svc.extractTokens(JSON.stringify({ success: false, message: 'bad creds', data: null, errors: null }))).toBeNull();
    expect(svc.extractTokens(JSON.stringify({ foo: 'bar' }))).toBeNull();
  });
});

describe('AuthService JWT decoding', () => {
  let svc: AuthService;
  beforeEach(() => { svc = makeService(); });

  it('decodes an ASCII payload', () => {
    const payload = { nameid: '42', email: 'a@b.com', name: 'Eslam' };
    expect(svc.decodeToken(jwt(payload))).toEqual(payload);
  });

  // Bare atob() mangles multi-byte UTF-8.
  it('decodes a multi-byte UTF-8 payload', () => {
    const payload = { nameid: '7', name: 'إسلام محمد' };
    expect(svc.decodeToken(jwt(payload))).toEqual(payload);
  });

  // Bare atob() throws on the base64url alphabet ('-' and '_').
  it('decodes a payload whose segment contains base64url characters', () => {
    const payload = { nameid: 'a?b>c~d', note: '???>>>~~~' };
    expect(b64url(payload)).toMatch(/[-_]/);
    expect(svc.decodeToken(jwt(payload))).toEqual(payload);
  });

  it('reads the user id from the nameid claim', () => {
    const token = jwt({ nameid: 'user-99' });
    spyOn(svc, 'getToken').and.returnValue(token);
    expect(svc.getCurrentUserId()).toBe('user-99');
  });

  it('detects expiry from the exp claim', () => {
    const past = Math.floor(Date.now() / 1000) - 3600;
    const future = Math.floor(Date.now() / 1000) + 3600;
    expect(svc.isTokenExpired(jwt({ exp: past }))).toBe(true);
    expect(svc.isTokenExpired(jwt({ exp: future }))).toBe(false);
    expect(svc.isTokenExpired(jwt({ nameid: '1' }))).toBe(false);
  });

  it('returns null for malformed tokens instead of throwing', () => {
    expect(svc.decodeToken('not-a-jwt')).toBeNull();
    expect(svc.decodeToken('aaa.bbb')).toBeNull();
    expect(svc.decodeToken('')).toBeNull();
    expect(svc.decodeToken(null)).toBeNull();
  });
});
