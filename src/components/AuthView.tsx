import React, { useState } from 'react';
import { Truck, ArrowRight, ShieldCheck, LogIn, LogOut } from 'lucide-react';
import { signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase.ts';
import { UserProfile } from '../types/logistics.ts';

interface AuthViewProps {
  currentUser: UserProfile;
  isFirebaseAuthenticated?: boolean;
  onAuthenticate: (profile: UserProfile, idToken?: string | null) => void;
}

const ROLES: UserProfile['role'][] = [
  'Logistics Dispatcher',
  'Fleet Operations Manager',
  'Logistics Business Owner',
  'Delivery Operations Coordinator',
];

export const AuthView: React.FC<AuthViewProps> = ({
  currentUser,
  isFirebaseAuthenticated = false,
  onAuthenticate,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState(currentUser.name);
  const [email, setEmail] = useState(currentUser.email);
  const [role, setRole] = useState<UserProfile['role']>(currentUser.role);
  const [facility, setFacility] = useState(currentUser.facility);
  const [password, setPassword] = useState('••••••••••••');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    setIsSigningIn(true);
    try {
      const credential = await signInWithPopup(auth, googleAuthProvider);
      const user = credential.user;
      const idToken = await user.getIdToken();

      const resolvedName = user.displayName || name.trim() || 'Elena Rostova';
      const resolvedEmail = user.email || email.trim() || 'e.rostova@logimind.io';

      setName(resolvedName);
      setEmail(resolvedEmail);

      onAuthenticate(
        {
          id: user.uid,
          name: resolvedName,
          email: resolvedEmail,
          role,
          facility: facility.trim() || 'Chicago Central Dispatch Hub',
        },
        idToken
      );
    } catch (err: any) {
      setAuthError(
        err.message || 'Google Sign-In failed. You can also use Operator Sign In below.'
      );
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleGoogleSignOut = async () => {
    setAuthError(null);
    try {
      await signOut(auth);
      onAuthenticate(
        {
          id: 'USR-0101',
          name: 'Elena Rostova',
          email: 'e.rostova@logimind.io',
          role: 'Logistics Dispatcher',
          facility: 'Chicago Central Dispatch Hub',
        },
        null
      );
    } catch (err: any) {
      setAuthError(err.message || 'Failed to sign out');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAuthenticate({
      id: currentUser.id || `USR-${Date.now().toString().slice(-4)}`,
      name: name.trim() || 'Elena Rostova',
      email: email.trim() || 'e.rostova@logimind.io',
      role,
      facility: facility.trim() || 'Chicago Central Dispatch Hub',
    });
  };

  return (
    <div className="max-w-4xl mx-auto py-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg overflow-hidden">
        {/* Left Operational Context Column */}
        <div className="lg:col-span-5 bg-[var(--bg-primary)] p-6 border-b lg:border-b-0 lg:border-r border-[var(--border-color)] flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded bg-[var(--accent-primary)]/15 border border-[var(--accent-primary)]/40 flex items-center justify-center text-[var(--accent-primary)]">
                <Truck className="w-4 h-4" />
              </div>
              <span className="text-base font-bold tracking-tight text-[var(--text-main)]">
                LogiMind AI
              </span>
            </div>

            <h2 className="text-xl font-bold text-[var(--text-main)] leading-snug">
              Optimize Every Route. Recover From Every Disruption.
            </h2>

            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Decision-support console for logistics dispatchers and fleet operations managers. Authenticate with Google SSO or switch operator role to approve disruption recovery plans and manage fleet assignments.
            </p>

            {/* Google Sign-In Action */}
            <div className="pt-2 space-y-2">
              {!isFirebaseAuthenticated ? (
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={isSigningIn}
                  className="w-full px-4 py-2.5 bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--accent-contrast)] font-semibold text-xs rounded-md flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <LogIn className="w-4 h-4" />
                  <span>
                    {isSigningIn ? 'Signing in with Google...' : 'Sign In with Google'}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleGoogleSignOut}
                  className="w-full px-4 py-2 bg-[var(--bg-secondary)] hover:bg-[var(--bg-elevated)] border border-[var(--border-color)] text-[var(--text-main)] font-medium text-xs rounded-md flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out of Google Account</span>
                </button>
              )}
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-[var(--border-subtle)] text-xs">
            <div className="text-[var(--text-secondary)] font-medium">
              Quick Operator Presets
            </div>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  setName('Elena Rostova');
                  setEmail('e.rostova@logimind.io');
                  setRole('Logistics Dispatcher');
                  setFacility('Chicago Central Dispatch Hub');
                }}
                className="w-full text-left p-2.5 rounded bg-[var(--bg-secondary)] border border-[var(--border-color)] hover:border-[var(--accent-primary)] transition-colors cursor-pointer"
              >
                <div className="font-semibold text-[var(--text-main)]">
                  Elena Rostova
                </div>
                <div className="text-[11px] text-[var(--text-secondary)]">
                  Primary User · Logistics Dispatcher
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setName('Marcus Vance');
                  setEmail('m.vance@logimind.io');
                  setRole('Fleet Operations Manager');
                  setFacility('O’Hare Freight Operations');
                }}
                className="w-full text-left p-2.5 rounded bg-[var(--bg-secondary)] border border-[var(--border-color)] hover:border-[var(--accent-primary)] transition-colors cursor-pointer"
              >
                <div className="font-semibold text-[var(--text-main)]">
                  Marcus Vance
                </div>
                <div className="text-[11px] text-[var(--text-secondary)]">
                  Primary User · Fleet Operations Manager
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Right Login / Registration Form */}
        <div className="lg:col-span-7 p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
            <div className="flex items-center gap-1 p-1 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-md">
              <button
                type="button"
                onClick={() => setMode('login')}
                className={`px-3.5 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer ${
                  mode === 'login'
                    ? 'bg-[var(--accent-primary)] text-[var(--accent-contrast)] font-semibold'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-main)]'
                }`}
              >
                Operator Sign In
              </button>
              <button
                type="button"
                onClick={() => setMode('register')}
                className={`px-3.5 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer ${
                  mode === 'register'
                    ? 'bg-[var(--accent-primary)] text-[var(--accent-contrast)] font-semibold'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-main)]'
                }`}
              >
                Register Account
              </button>
            </div>

            <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <ShieldCheck className="w-4 h-4" />
              {isFirebaseAuthenticated ? 'Google Verified' : 'Active Session'}
            </span>
          </div>

          {authError && (
            <div className="p-3 rounded bg-rose-500/15 border border-rose-500/40 text-xs text-rose-700 dark:text-rose-200">
              {authError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[var(--text-secondary)] mb-1">
                  Operator Full Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded text-[var(--text-main)]"
                />
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] mb-1">
                  Work Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded text-[var(--text-main)] font-mono"
                />
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] mb-1">
                  Operational Role
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserProfile['role'])}
                  className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded text-[var(--text-main)]"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] mb-1">
                  Assigned Logistics Hub
                </label>
                <input
                  type="text"
                  required
                  value={facility}
                  onChange={(e) => setFacility(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded text-[var(--text-main)]"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[var(--text-secondary)] mb-1">
                  Access Passkey
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded text-[var(--text-main)]"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-[var(--border-color)] flex items-center justify-between">
              <span className="text-[var(--text-secondary)]">
                Logged approvals will be attributed to <strong>{name}</strong> ({role}).
              </span>
              <button
                type="submit"
                className="px-4 py-2 bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--accent-contrast)] font-semibold rounded-md flex items-center gap-2 cursor-pointer"
              >
                <span>
                  {mode === 'login'
                    ? 'Sign In & Open Dashboard'
                    : 'Register & Continue'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
