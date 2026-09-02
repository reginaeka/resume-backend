import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient, type User } from '@supabase/supabase-js';

export const ADMIN_SESSION_COOKIE = 'regina_resume_admin_session';
export const ADMIN_SESSION_MAX_AGE_SECONDS = 6 * 60 * 60;

type AdminSessionPayload = {
  sub: string;
  email: string;
  iat: number;
  exp: number;
};

export class AdminAuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function getSessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('Missing or invalid ADMIN_SESSION_SECRET');
  }
  return secret;
}

function sign(value: string) {
  return createHmac('sha256', getSessionSecret()).update(value).digest('base64url');
}

function readCookie(request: Request, name: string) {
  const header = request.headers.get('cookie') || '';
  const match = header.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function decodeSession(request: Request): AdminSessionPayload {
  const token = readCookie(request, ADMIN_SESSION_COOKIE);
  if (!token) throw new AdminAuthError(401, 'Admin session expired. Please sign in again.');

  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) throw new AdminAuthError(401, 'Invalid admin session.');

  const expected = sign(encodedPayload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    throw new AdminAuthError(401, 'Invalid admin session.');
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as AdminSessionPayload;
    if (!payload.sub || !payload.email || !payload.iat || !payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) {
      throw new AdminAuthError(401, 'Admin session expired. Please sign in again.');
    }
    return payload;
  } catch (error) {
    if (error instanceof AdminAuthError) throw error;
    throw new AdminAuthError(401, 'Invalid admin session.');
  }
}

export function createAdminSession(user: User) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload: AdminSessionPayload = {
    sub: user.id,
    email: user.email || '',
    iat: issuedAt,
    exp: issuedAt + ADMIN_SESSION_MAX_AGE_SECONDS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return {
    token: `${encodedPayload}.${sign(encodedPayload)}`,
    expiresAt: new Date(payload.exp * 1000).toISOString(),
  };
}

export function getAdminSessionExpiry(request: Request) {
  return new Date(decodeSession(request).exp * 1000).toISOString();
}

export async function requireAuthorizedAdmin(request: Request): Promise<User> {
  const authorization = request.headers.get('authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
  if (!token) throw new AdminAuthError(401, 'Authentication required');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('Missing Supabase public environment variables');

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.email) throw new AdminAuthError(401, 'Invalid or expired Supabase session');

  const allowlist = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (!allowlist.includes(data.user.email.toLowerCase())) {
    throw new AdminAuthError(403, 'This account is not an authorized administrator');
  }

  return data.user;
}

export async function requireAdmin(request: Request): Promise<User> {
  const user = await requireAuthorizedAdmin(request);
  const adminSession = decodeSession(request);

  if (adminSession.sub !== user.id || adminSession.email.toLowerCase() !== user.email?.toLowerCase()) {
    throw new AdminAuthError(401, 'Invalid admin session.');
  }

  return user;
}
