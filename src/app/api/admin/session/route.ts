import { NextResponse } from 'next/server';
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  AdminAuthError,
  createAdminSession,
  getAdminSessionExpiry,
  requireAdmin,
  requireAuthorizedAdmin,
} from '@/lib/admin-auth';

function sessionCookie(value: string, maxAge: number) {
  return {
    name: ADMIN_SESSION_COOKIE,
    value,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/api/admin',
    maxAge,
  };
}

function errorResponse(error: unknown) {
  if (error instanceof AdminAuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error('Admin session error:', error);
  return NextResponse.json({ error: 'Unable to manage admin session' }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    const user = await requireAuthorizedAdmin(request);
    const session = createAdminSession(user);
    const response = NextResponse.json({ expiresAt: session.expiresAt }, { status: 201 });
    response.cookies.set(sessionCookie(session.token, ADMIN_SESSION_MAX_AGE_SECONDS));
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    return NextResponse.json({ expiresAt: getAdminSessionExpiry(request) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE() {
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set(sessionCookie('', 0));
  return response;
}
