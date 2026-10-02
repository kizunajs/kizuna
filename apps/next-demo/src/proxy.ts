import { NextResponse, type NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

/**
 * Sends a visitor without a session to sign in before the content overview
 * renders. The page checks the session itself; this only saves the round trip.
 */
export function proxy(request: NextRequest): NextResponse {
    if (getSessionCookie(request) !== null) return NextResponse.next();
    const login = new URL('/login', request.url);
    login.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(login);
}

export const config = {
    matcher: ['/cms'],
};
