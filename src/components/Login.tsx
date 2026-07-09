import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Mail, Users, ArrowRight, AlertCircle, Lock } from 'lucide-react';

interface LoginProps {
  onLoginSuccess: (token: string, user: { email: string; name: string }) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Authentication failed. Please verify your email.');
      }

      // Login success
      onLoginSuccess(data.token, data.user);
    } catch (err: any) {
      setError(err.message || 'Unable to connect to the authentication server.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = () => {
    // Conveniently pre-fill the user's authorized email
    setEmail('pushkarmishra244@gmail.com');
  };

  return (
    <div id="login-container" className="min-h-screen bg-[#030712] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background Decorative Mesh Gradients */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-900/10 rounded-full filter blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-10 right-1/4 w-96 h-96 bg-violet-950/10 rounded-full filter blur-3xl pointer-events-none"></div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md z-10">
        <div className="bg-[#0b101d]/90 backdrop-blur-md py-10 px-6 sm:px-10 border border-slate-800/80 rounded-[28px] shadow-2xl relative">
          
          {/* Logo Badge */}
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="w-14 h-14 bg-gradient-to-tr from-indigo-600 to-violet-500 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-600/20">
                <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-[#030712] border border-slate-800 rounded-full flex items-center justify-center">
                <Lock className="w-3.5 h-3.5 text-slate-400 stroke-[2]" />
              </div>
            </div>
          </div>

          {/* Titles */}
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold font-display text-slate-100 tracking-tight">
              NexusFlow Terminal
            </h2>
            <p className="mt-2 text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
              Outbound Email Marketing Console. Restricted access environment.
            </p>
          </div>

          {/* Restrict Notice */}
          <div className="bg-[#131b31]/80 border border-slate-800/80 rounded-2xl p-4 flex items-start gap-3 text-slate-300 text-xs mb-6 text-left">
            <Users className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              Access is strictly limited to <span className="font-semibold text-slate-100">Pushkar Mishra</span> and <span className="font-semibold text-slate-100">Ravi Ranjan</span>.
            </div>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            {error && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="p-3 bg-rose-950/40 border border-rose-900/60 rounded-xl text-rose-300 text-xs flex items-start gap-2.5"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                <span className="font-medium">{error}</span>
              </motion.div>
            )}

            <div>
              <label htmlFor="email" className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 text-left">
                Email Address
              </label>
              <div className="relative rounded-xl shadow-xs">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail className="h-4 w-4 text-slate-500" />
                </div>
                <input
                  id="email"
                  type="email"
                  required
                  placeholder="Enter your email address..."
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-11 pr-4 py-3.5 text-sm bg-[#070b13] border border-slate-800 rounded-xl placeholder-slate-600 text-slate-100 focus:outline-hidden focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all font-medium"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                id="btn-login"
                type="submit"
                disabled={loading}
                className="w-full flex justify-center items-center gap-2 py-3.5 px-4 rounded-xl text-sm font-bold text-white bg-[#3438b4] hover:bg-[#4045d1] focus:outline-hidden focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-600/15 transition-all active:scale-[0.98] cursor-pointer"
              >
                {loading ? (
                  <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : (
                  <>
                    Authenticate Access
                    <ArrowRight className="w-4 h-4 ml-0.5" />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <div className="w-full border-t border-slate-800"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-[#0b101d] px-2 text-slate-500 font-bold tracking-widest text-[9px]">OR</span>
            </div>
          </div>

          {/* Google Sign In Option */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            className="w-full flex items-center justify-center gap-2.5 py-3.5 px-4 bg-[#070b13] border border-slate-800 hover:bg-[#111827] text-slate-200 text-sm font-bold rounded-xl transition-all cursor-pointer active:scale-[0.98]"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#EA4335"
                d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.131-5.171 4.131-3.414 0-6.182-2.768-6.182-6.182s2.768-6.182 6.182-6.182c1.55 0 2.964.577 4.05 1.527l3.056-3.056C19.094 1.838 15.894 1 12.24 1 6.032 1 1 6.032 1 12.24s5.032 11.24 11.24 11.24c6.237 0 11.054-4.385 11.054-11.24 0-.746-.073-1.464-.19-1.955H12.24z"
              />
            </svg>
            Sign In with Google
          </button>

          {/* Footer */}
          <div className="text-center mt-8 pt-4 border-t border-slate-900">
            <p className="text-[10px] text-slate-500 leading-normal font-medium">
              Restricted console. Only pre-authorized workspace administrators have clearance.
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
