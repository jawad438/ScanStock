import React, { useState } from 'react';
import { auth } from '../firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { VALID_TOKENS } from '../constants/tokens';
import { isTokenUsed, createSupermarketFile, getSupermarketData } from '../services/githubService';
import { motion, AnimatePresence } from 'motion/react';
import { LogIn, UserPlus, Key, Mail, Lock, Loader2, AlertCircle, Eye, EyeOff, Settings, Sun, Moon, Globe } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

import { Language, Theme } from '../types';
import { translations } from '../translations';

interface AuthProps {
  onAuthSuccess: (email: string) => void;
  language: Language;
  setLanguage: (l: Language) => void;
  theme: 'light' | 'dark';
  setTheme: (t: 'light' | 'dark') => void;
}

export default function Auth({ onAuthSuccess, language, setLanguage, theme, setTheme }: AuthProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [isResetMode, setIsResetMode] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const t = translations[language];

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !token) {
      setError("Please enter both your email and registration token.");
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // 1. Verify token matches the one on GitHub for this email
      const data = await getSupermarketData(email);
      if (!data) {
        throw new Error("No account found with this email.");
      }

      if (data.token !== token) {
        throw new Error("The provided token does not match this account.");
      }

      // 2. Token is verified, send the reset email
      await sendPasswordResetEmail(auth, email);
      setSuccess("Token verified! A password reset link has been sent to your email.");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to initiate password reset.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // IMMUNITY BYPASS: benghidajawad@gmail.com
      if (email === 'benghidajawad@gmail.com' && token === 'xrpbvpdk65244523') {
        onAuthSuccess(email);
        return;
      }

      if (isLogin) {
        // Sign In Logic
        try {
          await signInWithEmailAndPassword(auth, email, password);
        } catch (signInErr: any) {
          if (signInErr.code === 'auth/wrong-password' || signInErr.code === 'auth/invalid-credential') {
            throw new Error("Invalid email or password.");
          } else if (signInErr.code === 'auth/user-not-found') {
            throw new Error("No account found with this email.");
          }
          throw signInErr;
        }
        
        // Verify token matches the one on GitHub
        const data = await getSupermarketData(email);
        if (!data) {
          if (!token) {
            await signOut(auth);
            throw new Error("Account found but database is missing. Please enter your registration token to restore access.");
          }
          
          if (!VALID_TOKENS.includes(token)) {
            await signOut(auth);
            throw new Error("Invalid token provided.");
          }
          
          const used = await isTokenUsed(token);
          if (used) {
            try {
              await createSupermarketFile(email, token);
            } catch (e) {
              await signOut(auth);
              throw new Error("This token is already linked to another account.");
            }
          } else {
            await createSupermarketFile(email, token);
          }
        } else if (data.token !== token) {
          await signOut(auth);
          throw new Error("The provided token does not match this account.");
        }
        
        onAuthSuccess(email);
      } else {
        // Sign Up Logic
        if (!token) {
          throw new Error("Registration token is required.");
        }

        if (!VALID_TOKENS.includes(token)) {
          throw new Error("Invalid token provided.");
        }

        const used = await isTokenUsed(token);
        if (used) {
          throw new Error("This token has already been used.");
        }

        await createSupermarketFile(email, token);
        
        try {
          await createUserWithEmailAndPassword(auth, email, password);
        } catch (fbErr: any) {
          throw fbErr;
        }
        
        onAuthSuccess(email);
      }
    } catch (err: any) {
      console.error(err);
      let message = err.message || "An error occurred.";
      if (err.code === 'auth/email-already-in-use') {
        message = "This email is already registered. Please use the Sign In tab.";
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      dir={t.dir}
      className={cn(
        "min-h-screen w-full flex flex-col md:flex-row transition-colors duration-500",
        theme === 'dark' ? "bg-[#050404] text-white" : "bg-white text-[#050404]"
      )}
    >
      {/* Settings Button */}
      <button 
        onClick={() => setShowSettings(true)}
        className={cn(
          "fixed top-6 z-50 p-3 rounded-2xl backdrop-blur-md border transition-all shadow-xl",
          t.dir === 'rtl' ? "left-6" : "right-6",
          theme === 'dark' ? "bg-white/5 border-white/10 hover:bg-white/10" : "bg-black/5 border-black/10 hover:bg-black/10"
        )}
      >
        <Settings className="w-6 h-6" />
      </button>

      {/* Visual Side (Hidden on small screens) */}
      <div className="hidden md:flex md:w-1/2 bg-emerald-500 relative overflow-hidden items-center justify-center p-12">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent opacity-50" />
          <div className="grid grid-cols-8 gap-4 p-8">
            {Array.from({ length: 64 }).map((_, i) => (
              <div key={i} className="aspect-square border border-white/20 rounded-lg" />
            ))}
          </div>
        </div>
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative z-10 text-center"
        >
          <div className="w-32 h-32 bg-white rounded-[2.5rem] flex items-center justify-center shadow-2xl mx-auto mb-8">
            <svg viewBox="0 0 100 100" className="w-16 h-16 fill-emerald-500">
              <path d="M30 30h5v40h-5zM40 30h2v40h-2zM47 30h8v40h-8zM60 30h2v40h-2zM67 30h3v40h-3zM75 30h5v40h-5z" />
            </svg>
          </div>
          <h2 className="text-5xl font-black uppercase tracking-tighter text-white mb-4">
            {t.supermarketManagerPro}
          </h2>
          <p className="text-emerald-100 text-lg font-medium max-w-md mx-auto">
            {t.ultimateSystem}
          </p>
        </motion.div>
      </div>

      {/* Form Side */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12">
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="w-full max-w-md"
        >
          <div className="md:hidden flex flex-col items-center mb-12">
            <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-xl shadow-emerald-500/20 mb-4">
              <LogIn className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-black uppercase tracking-tighter">
              {t.supermarketManager}
            </h1>
          </div>

          <div className="mb-12">
            <h1 className="text-4xl font-black uppercase tracking-tighter mb-2">
              {isResetMode ? t.resetPassword : (isLogin ? t.welcomeBack : t.getStarted)}
            </h1>
            <p className="text-stone-500 font-medium">
              {isResetMode ? t.signInWithEmail : (isLogin ? t.signInToDashboard : t.createAccount)}
            </p>
          </div>

          {!isResetMode && (
            <div className={cn(
              "flex p-1 rounded-2xl mb-8 border",
              theme === 'dark' ? "bg-[#0a0a0a] border-white/5" : "bg-stone-100 border-stone-200"
            )}>
              <button 
                onClick={() => setIsLogin(true)}
                className={cn(
                  "flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all",
                  isLogin 
                    ? (theme === 'dark' ? "bg-white text-[#050404] shadow-lg" : "bg-[#050404] text-white shadow-md") 
                    : "text-stone-500"
                )}
              >
                {t.signIn}
              </button>
              <button 
                onClick={() => setIsLogin(false)}
                className={cn(
                  "flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all",
                  !isLogin 
                    ? (theme === 'dark' ? "bg-white text-[#050404] shadow-lg" : "bg-[#050404] text-white shadow-md") 
                    : "text-stone-500"
                )}
              >
                {t.signUp}
              </button>
            </div>
          )}

          <form onSubmit={isResetMode ? handleResetPassword : handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-stone-400 uppercase ml-1">{t.emailAddress}</label>
              <input 
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={cn(
                  "w-full px-6 py-4 rounded-2xl font-bold outline-none focus:ring-2 ring-emerald-500 border transition-all",
                  theme === 'dark' 
                    ? "bg-[#0a0a0a] text-white border-white/10 placeholder:text-stone-700" 
                    : "bg-stone-50 text-[#050404] border-stone-200 placeholder:text-stone-300"
                )}
                placeholder={t.emailPlaceholder}
              />
            </div>

            {!isResetMode && (
              <div className="space-y-2">
                <label className="text-[10px] font-black text-stone-400 uppercase ml-1">{t.password}</label>
                <div className="relative">
                  <input 
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={cn(
                      "w-full px-6 py-4 rounded-2xl font-bold outline-none focus:ring-2 ring-emerald-500 border transition-all",
                      theme === 'dark' 
                        ? "bg-[#0a0a0a] text-white border-white/10 placeholder:text-stone-700" 
                        : "bg-stone-50 text-[#050404] border-stone-200 placeholder:text-stone-300"
                    )}
                    placeholder={t.passwordPlaceholder}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className={cn(
                      "absolute top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 transition-colors",
                      t.dir === 'rtl' ? "left-4" : "right-4"
                    )}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-[10px] font-black text-stone-400 uppercase ml-1">
                {isLogin ? t.accessToken : t.registrationToken}
              </label>
              <input 
                type="text"
                required
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className={cn(
                  "w-full px-6 py-4 rounded-2xl font-bold outline-none focus:ring-2 ring-emerald-500 border transition-all",
                  theme === 'dark' 
                    ? "bg-[#0a0a0a] text-white border-white/10 placeholder:text-stone-700" 
                    : "bg-stone-50 text-[#050404] border-stone-200 placeholder:text-stone-300"
                )}
                placeholder={t.tokenPlaceholder}
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-500 text-xs font-bold">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <p>{error}</p>
              </div>
            )}

            {success && (
              <div className="flex items-center gap-2 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-500 text-xs font-bold">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <p>{success}</p>
              </div>
            )}

            <div className="space-y-3">
              <button 
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-emerald-500 text-white rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20 disabled:opacity-50 flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (isResetMode ? <Key className="w-5 h-5" /> : (isLogin ? <LogIn className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />))}
                {isResetMode ? t.resetPassword : (isLogin ? t.signIn : t.signUp)}
              </button>

              <button 
                type="button"
                onClick={() => {
                  setIsResetMode(!isResetMode);
                  setError(null);
                  setSuccess(null);
                }}
                className="w-full text-stone-400 text-[10px] font-black uppercase tracking-widest hover:text-emerald-500 transition-colors py-2"
              >
                {isResetMode ? t.backToLogin : t.forgotPassword}
              </button>
            </div>
          </form>
        </motion.div>
      </div>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className={cn(
                "relative w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl border",
                theme === 'dark' ? "bg-[#050404] border-white/10" : "bg-white border-stone-200"
              )}
            >
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-black uppercase tracking-tighter">{t.preferences}</h3>
                <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-xl transition-colors">
                  <Settings className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-8">
                {/* Theme Toggle */}
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-stone-400 uppercase ml-1">{t.displayMode}</label>
                  <div className="flex bg-stone-100 dark:bg-stone-950 p-1 rounded-2xl border border-stone-200 dark:border-stone-800">
                    <button 
                      onClick={() => setTheme('light')}
                      className={cn(
                        "flex-1 py-3 rounded-xl flex items-center justify-center gap-2 font-bold text-xs transition-all",
                        theme === 'light' ? "bg-white text-stone-900 shadow-md" : "text-stone-500"
                      )}
                    >
                      <Sun className="w-4 h-4" /> {t.light}
                    </button>
                    <button 
                      onClick={() => setTheme('dark')}
                      className={cn(
                        "flex-1 py-3 rounded-xl flex items-center justify-center gap-2 font-bold text-xs transition-all",
                        theme === 'dark' ? "bg-stone-800 text-white shadow-md" : "text-stone-500"
                      )}
                    >
                      <Moon className="w-4 h-4" /> {t.dark}
                    </button>
                  </div>
                </div>

                {/* Language Selector */}
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-stone-400 uppercase ml-1">{t.language}</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'en', label: 'English' },
                      { id: 'fr', label: 'Français' },
                      { id: 'ar', label: 'العربية' }
                    ].map((lang) => (
                      <button
                        key={lang.id}
                        onClick={() => setLanguage(lang.id as any)}
                        className={cn(
                          "py-3 rounded-xl font-bold text-[10px] uppercase tracking-widest border-2 transition-all",
                          language === lang.id 
                            ? "border-emerald-500 bg-emerald-500/10 text-emerald-500" 
                            : "border-transparent bg-stone-100 dark:bg-stone-950 text-stone-500"
                        )}
                      >
                        {lang.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button 
                onClick={() => setShowSettings(false)}
                className="w-full mt-10 py-4 bg-emerald-500 text-white rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20"
              >
                {t.saveChanges}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
