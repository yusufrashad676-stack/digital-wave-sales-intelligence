import { useCallback, useEffect, useState } from 'react';
import { logout } from './api/auth';
import { clearSession, getAccessToken, onSessionExpired, onSessionUpdated, setSession } from './api/session';
import SignInPage from './components/SignInPage';
import Workspace from './components/Workspace';

type RouteName = 'dashboard' | 'login' | 'home';

function routeNameFor(pathname: string): RouteName {
  if (pathname === '/dashboard' || pathname.startsWith('/dashboard/')) {
    return 'dashboard';
  }
  if (pathname === '/login') {
    return 'login';
  }
  return 'home';
}

export default function App() {
  const [accessToken, setAccessToken] = useState<string | null>(() => getAccessToken());
  const [path, setPath] = useState<string>(() => window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((to: string) => {
    window.history.pushState(null, '', to);
    setPath(window.location.pathname);
  }, []);

  const replacePath = useCallback((to: string) => {
    window.history.replaceState(null, '', to);
    setPath(window.location.pathname);
  }, []);

  useEffect(() => {
    const onSessionUpdatedHandler = (token: string) => setAccessToken(token);
    const onSessionExpiredHandler = () => setAccessToken(null);
    const offSessionUpdated = onSessionUpdated(onSessionUpdatedHandler);
    const offSessionExpired = onSessionExpired(onSessionExpiredHandler);
    return () => {
      offSessionUpdated();
      offSessionExpired();
    };
  }, []);

  const route = routeNameFor(path);
  const authenticated = accessToken !== null;

  const redirectTarget =
    (route === 'dashboard' && !authenticated) || (route === 'home' && !authenticated)
      ? '/login?next=/dashboard'
      : (route === 'login' && authenticated) || (route === 'home' && authenticated)
        ? '/dashboard'
        : null;

  useEffect(() => {
    if (redirectTarget !== null) {
      replacePath(redirectTarget);
    }
  }, [redirectTarget, replacePath]);

  if (redirectTarget !== null) {
    return null;
  }

  async function handleAuthenticated(token: string, refreshToken: string) {
    setSession(token, refreshToken);
    setAccessToken(token);
    const next = new URLSearchParams(window.location.search).get('next');
    navigate(next !== null && next.startsWith('/') ? next : '/dashboard');
  }

  async function handleLogout() {
    try {
      await logout();
    } finally {
      clearSession();
      setAccessToken(null);
    }
  }

  if (route === 'login') {
    return <SignInPage onAuthenticated={(token, refreshToken) => void handleAuthenticated(token, refreshToken)} />;
  }

  return <Workspace accessToken={accessToken ?? ''} onLogout={() => void handleLogout()} />;
}
