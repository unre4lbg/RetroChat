import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Terminal, Zap, Users } from 'lucide-react';

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
    <div className="min-h-screen bg-win98-desktop flex items-center justify-center p-4 font-win98">
      <div className="w-full max-w-md">
        {/* Main Window */}
        <div className="win98-window">
          {/* Title Bar */}
          <div className="win98-titlebar flex items-center justify-between px-2 py-1">
            <div className="flex items-center">
              <Terminal className="h-4 w-4 mr-1" />
              <span>Retro Chat - Влизане</span>
            </div>
            <div className="flex">
              <button className="w-4 h-4 bg-win98-gray win98-button text-xs">_</button>
              <button className="w-4 h-4 bg-win98-gray win98-button text-xs ml-1">□</button>
              <button className="w-4 h-4 bg-win98-gray win98-button text-xs ml-1">×</button>
            </div>
          </div>

          {/* Window Content */}
          <div className="p-4">
            {/* Header */}
            <div className="text-center mb-4">
              <div className="flex items-center justify-center mb-2">
                <Terminal className="h-8 w-8 text-win98-blue mr-1" />
                <Zap className="h-6 w-6 text-icq-orange" />
              </div>
              <h1 className="text-lg font-bold text-win98-blue mb-1">
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
                className={`flex-1 py-1 px-2 text-xs font-bold mr-1 ${
                  isLogin
                    ? 'win98-inset bg-win98-light-gray'
                    : 'win98-button'
                }`}
              >
                Вход
              </button>
              <button
                onClick={() => setIsLogin(false)}
                className={`flex-1 py-1 px-2 text-xs font-bold ml-1 ${
                  !isLogin
                    ? 'win98-inset bg-win98-light-gray'
                    : 'win98-button'
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
                    className="w-full win98-input text-xs"
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
                  className="w-full win98-input text-xs"
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
                  className="w-full win98-input text-xs"
                  placeholder="Парола - минимум 8 символа"
                  required
                />
              </div>

              {error && (
                <div className="win98-inset bg-white p-2 text-xs text-red-600">
                  Error: {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full win98-button py-2 px-4 text-xs font-bold text-black disabled:opacity-50"
              >
                {loading ? 'Влизане, моля изчаайте...' : isLogin ? 'Вход' : 'Регистрация'}
              </button>
            </form>

            <div className="mt-3 pt-3 border-t border-win98-dark-gray">
              <button
                onClick={onAdminLogin}
                className="w-full win98-button py-2 px-4 text-xs font-bold text-black"
              >
                Админ Панел
              </button>
            </div>

            <div className="text-center mt-3 text-xs text-black">
              <p>Здравейте, това е тестово приложение за комуникация в споделено лоби. С времето ще надграждаме приложението, като ще добавяме различни функционалости. Ще се радвам да тествате и да споделите обратна връзка за открити бъгове, както и предложения за надграждане.</p>
              <div className="flex items-center justify-center mt-1">
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