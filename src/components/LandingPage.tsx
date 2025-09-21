import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Terminal, Zap, Users, Minimize2, Maximize2 } from 'lucide-react';

interface LandingPageProps {
  onLogin: () => void;
  onAdminLogin: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onLogin, onAdminLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        
        if (data.user) {
          const { error: profileError } = await supabase
            .from('user_profiles')
            .insert({
              user_id: data.user.id,
              username: username,
            });
          if (profileError) throw profileError;
        }
      }
      onLogin();
    } catch (error: any) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen xp-login-bg font-xp">
      {/* Desktop Layout */}
      <div className="hidden md:flex items-center justify-center min-h-screen p-4">
        <div className="w-full max-w-md">
          {/* Main Window */}
          <div className="xp-welcome-panel xp-fade-in">
            {/* Title Bar */}
            <div className="xp-titlebar">
              <div className="flex items-center">
                <Terminal className="h-4 w-4 mr-2 xp-icon" />
                <span>Retro Chat - Влизане</span>
              </div>
              <div className="flex">
                <button className="xp-titlebar-button xp-minimize-btn">−</button>
                <button className="xp-titlebar-button xp-maximize-btn">□</button>
                <button className="xp-titlebar-button xp-close-btn">×</button>
              </div>
            </div>

            {/* Window Content */}
            <div className="p-4">
              {/* Header */}
              <div className="text-center mb-4">
                <div className="flex items-center justify-center mb-2">
                  <Terminal className="h-8 w-8 text-xp-blue mr-2 xp-icon" />
                  <Zap className="h-6 w-6 text-xp-orange xp-icon" />
                </div>
                <h1 className="text-lg font-bold text-xp-blue mb-1">
                  Retro Chat v1.0 (Beta)
                </h1>
                <p className="text-xs text-black">
                  Да се върнем назад във времето!
                </p>
              </div>

              {/* Tab Buttons */}
              <div className="flex mb-4">
                <button
                  onClick={() => setIsLogin(true)}
                  className={`flex-1 py-2 px-3 text-xs font-bold mr-1 ${
                    isLogin
                      ? 'xp-tab-active xp-tab'
                      : 'xp-tab'
                  }`}
                >
                  Вход
                </button>
                <button
                  onClick={() => setIsLogin(false)}
                  className={`flex-1 py-2 px-3 text-xs font-bold ml-1 ${
                    !isLogin
                      ? 'xp-tab-active xp-tab'
                      : 'xp-tab'
                  }`}
                >
                  Регистрация
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleAuth} className="space-y-3">
                {!isLogin && (
                  <div>
                    <label className="block text-black text-xs font-bold mb-1">
                      Потребителско име:
                    </label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full xp-input text-xs"
                      placeholder="Въведи потребителско име"
                      required={!isLogin}
                    />
                  </div>
                )}

                <div>
                  <label className="block text-black text-xs font-bold mb-1">
                    Имейл адрес:
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full xp-input text-xs"
                    placeholder="Въведи имейл адрес"
                    required
                  />
                </div>

                <div>
                  <label className="block text-black text-xs font-bold mb-1">
                    Парола:
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full xp-input text-xs"
                    placeholder="Парола - минимум 8 символа"
                    required
                  />
                </div>

                {error && (
                  <div className="xp-panel-inset p-2 text-xs text-red-600">
                    Error: {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full xp-button-blue py-2 px-4 text-xs font-bold disabled:opacity-50"
                >
                  {loading ? 'Влизане, моля изчакайте...' : isLogin ? 'Вход' : 'Регистрация'}
                </button>
              </form>

              <div className="mt-3 pt-3 border-t border-xp-border">
                <button
                  onClick={onAdminLogin}
                  className="w-full xp-button py-2 px-4 text-xs font-bold text-black"
                >
                  Админ Панел
                </button>
              </div>

              <div className="text-center mt-3 text-xs text-black">
                <p>Здравейте, това е тестово приложение за комуникация в споделено лоби. С времето ще надграждаме приложението, като ще добавяме различни функционалности. Ще се радвам да тествате и да споделите обратна връзка за открити бъгове, както и предложения за надграждане.</p>
                <div className="flex items-center justify-center mt-1">
                  <span>-- Тестова среда --</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Layout - Fullscreen */}
      <div className="md:hidden min-h-screen flex flex-col">
        {/* Main Window */}
        <div className="flex-1 bg-xp-panel xp-fade-in flex flex-col">
          {/* Title Bar */}
          <div className="xp-titlebar">
            <div className="flex items-center">
              <Terminal className="h-4 w-4 mr-2 xp-icon" />
              <span>Retro Chat - Влизане</span>
            </div>
            <div className="flex">
              <button className="w-5 h-4 xp-button text-xs mr-1">
                <Minimize2 className="h-2 w-2" />
              </button>
              <button className="w-5 h-4 xp-button text-xs mr-1">
                <Maximize2 className="h-2 w-2" />
              </button>
              <button className="xp-titlebar-button xp-close-btn">×</button>
            </div>
          </div>

          {/* Window Content */}
          <div className="flex-1 p-4 flex flex-col justify-center">
            {/* Header */}
            <div className="text-center mb-6">
              <div className="flex items-center justify-center mb-2">
                <Terminal className="h-12 w-12 text-xp-blue mr-2 xp-icon" />
                <Zap className="h-8 w-8 text-xp-orange xp-icon" />
              </div>
              <h1 className="text-xl font-bold text-xp-blue mb-2">
                Retro Chat v1.0 (Beta)
              </h1>
              <p className="text-sm text-black">
                Да се върнем назад във времето!
              </p>
            </div>

            {/* Tab Buttons */}
            <div className="flex mb-6">
              <button
                onClick={() => setIsLogin(true)}
                className={`flex-1 py-3 px-4 text-sm font-bold mr-1 ${
                  isLogin
                    ? 'xp-tab-active xp-tab'
                    : 'xp-tab'
                }`}
              >
                Вход
              </button>
              <button
                onClick={() => setIsLogin(false)}
                className={`flex-1 py-3 px-4 text-sm font-bold ml-1 ${
                  !isLogin
                    ? 'xp-tab-active xp-tab'
                    : 'xp-tab'
                }`}
              >
                Регистрация
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleAuth} className="space-y-4">
              {!isLogin && (
                <div>
                  <label className="block text-black text-sm font-bold mb-2">
                    Потребителско име:
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full xp-input text-sm py-2 px-3"
                    placeholder="Въведи потребителско име"
                    required={!isLogin}
                  />
                </div>
              )}

              <div>
                <label className="block text-black text-sm font-bold mb-2">
                  Имейл адрес:
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full xp-input text-sm py-2 px-3"
                  placeholder="Въведи имейл адрес"
                  required
                />
              </div>

              <div>
                <label className="block text-black text-sm font-bold mb-2">
                  Парола:
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full xp-input text-sm py-2 px-3"
                  placeholder="Парола - минимум 8 символа"
                  required
                />
              </div>

              {error && (
                <div className="xp-panel-inset p-3 text-sm text-red-600">
                  Error: {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full xp-button-blue py-3 px-4 text-sm font-bold disabled:opacity-50"
              >
                {loading ? 'Влизане, моля изчакайте...' : isLogin ? 'Вход' : 'Регистрация'}
              </button>
            </form>

            <div className="mt-4 pt-4 border-t border-xp-border">
              <button
                onClick={onAdminLogin}
                className="w-full xp-button py-3 px-4 text-sm font-bold text-black"
              >
                Админ Панел
              </button>
            </div>

            <div className="text-center mt-4 text-sm text-black">
              <p>Здравейте, това е тестово приложение за комуникация в споделено лоби. С времето ще надграждаме приложението, като ще добавяме различни функционалости. Ще се радвам да тествате и да споделите обратна връзка за открити бъгове, както и предложения за надграждане.</p>
              <div className="flex items-center justify-center mt-2">
                <span>-- Тестова среда --</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;