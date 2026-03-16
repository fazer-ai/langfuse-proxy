import { Loader2 } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { api } from "@/client/lib/api";
import { getAssetUrl } from "@/client/lib/utils";

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (user: User) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data } = await api.api.auth.me.get();
        if (data?.user) {
          setUser(data.user);
        }
      } catch {
        // NOTE: User not authenticated
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = (loggedInUser: User) => {
    setUser(loggedInUser);
  };

  const logout = async () => {
    try {
      await api.api.auth.logout.post();
      setUser(null);
    } catch {
      console.error("Logout failed");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-bg-primary">
        <img
          src={getAssetUrl("/assets/logo.png")}
          alt="Logo"
          className="h-10"
        />
        <Loader2 className="h-6 w-6 animate-spin text-text-secondary" />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
