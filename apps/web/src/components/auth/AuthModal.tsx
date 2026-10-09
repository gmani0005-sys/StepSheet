import React, { useState } from 'react';
import { X, Lock, Mail, User as UserIcon, Sparkles } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');

  const { login, join, isLoading, error } = useAuthStore();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await join(email, password, fullName);
      }
      onClose();
    } catch {
      // error set in store
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden p-6 relative">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-100 p-1 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X size={18} />
        </button>

        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-emerald-500/20">
            <Lock className="text-white" size={24} />
          </div>
          <h2 className="text-lg font-bold text-slate-100">
            {isLogin ? 'Sign In to StepSheet' : 'Create StepSheet Account'}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {isLogin
              ? 'Access your saved datasets, pipelines, and export history'
              : 'Self-hostable no-code data workbench with formula steps'}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {!isLogin && (
            <div>
              <label className="text-[11px] font-medium text-slate-300 block mb-1">Full Name</label>
              <div className="relative">
                <UserIcon size={14} className="absolute left-3 top-3 text-slate-500" />
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Jane Doe"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
                />
              </div>
            </div>
          )}

          <div>
            <label className="text-[11px] font-medium text-slate-300 block mb-1">Email Address</label>
            <div className="relative">
              <Mail size={14} className="absolute left-3 top-3 text-slate-500" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="analyst@company.com"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-medium text-slate-300 block mb-1">Password</label>
            <div className="relative">
              <Lock size={14} className="absolute left-3 top-3 text-slate-500" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium text-xs rounded-lg transition-colors shadow-sm shadow-emerald-600/30 mt-2"
          >
            {isLoading
              ? 'Authenticating...'
              : isLogin
              ? 'Sign In'
              : 'Create Account (/join)'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => setIsLogin(!isLogin)}
            className="text-xs text-slate-400 hover:text-emerald-400 transition-colors"
          >
            {isLogin
              ? "Don't have an account? Sign up (/join)"
              : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
};
