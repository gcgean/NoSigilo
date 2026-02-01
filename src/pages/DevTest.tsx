import { useState } from 'react';
import { Bug, Server, Wifi, WifiOff, RefreshCw, Check, X, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import apiClient from '@/utils/apiClient';

export default function DevTest() {
  const { user, isAuthenticated } = useAuth();
  const [apiUrl, setApiUrl] = useState(import.meta.env.VITE_API_URL || 'http://localhost:3000/api');
  const [testResults, setTestResults] = useState<Array<{ name: string; status: 'success' | 'error' | 'pending'; message?: string }>>([]);
  const [isRunning, setIsRunning] = useState(false);

  const runTests = async () => {
    setIsRunning(true);
    const results: typeof testResults = [];

    // Test 1: API connectivity
    try {
      await apiClient.get('/health');
      results.push({ name: 'API Health Check', status: 'success', message: 'API is responding' });
    } catch (error: any) {
      results.push({ name: 'API Health Check', status: 'error', message: error.message || 'Failed to connect' });
    }

    // Test 2: Auth state
    results.push({
      name: 'Auth State',
      status: isAuthenticated ? 'success' : 'error',
      message: isAuthenticated ? `Logged in as ${user?.email}` : 'Not authenticated',
    });

    // Test 3: LocalStorage
    try {
      localStorage.setItem('test-key', 'test-value');
      const value = localStorage.getItem('test-key');
      localStorage.removeItem('test-key');
      results.push({
        name: 'LocalStorage',
        status: value === 'test-value' ? 'success' : 'error',
        message: 'LocalStorage is working',
      });
    } catch {
      results.push({ name: 'LocalStorage', status: 'error', message: 'LocalStorage not available' });
    }

    // Test 4: Environment Variables
    const envVars = {
      VITE_API_URL: import.meta.env.VITE_API_URL,
      VITE_USE_MOCKS: import.meta.env.VITE_USE_MOCKS,
    };
    results.push({
      name: 'Environment Variables',
      status: 'success',
      message: `API: ${envVars.VITE_API_URL || 'default'}, Mocks: ${envVars.VITE_USE_MOCKS || 'false'}`,
    });

    setTestResults(results);
    setIsRunning(false);
  };

  const clearAllData = () => {
    if (confirm('Isso irá limpar todos os dados locais. Continuar?')) {
      localStorage.clear();
      sessionStorage.clear();
      window.location.reload();
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-xl bg-warning flex items-center justify-center">
          <Bug className="w-6 h-6 text-black" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Dev Test</h1>
          <p className="text-muted-foreground">Debug e testes de integração</p>
        </div>
        <Badge className="ml-auto bg-warning text-black">Ambiente de Desenvolvimento</Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* API Configuration */}
        <Card className="p-6 glass">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Server className="w-5 h-5" />
            Configuração da API
          </h3>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>API URL</Label>
              <Input
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="http://localhost:3000/api"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={runTests} disabled={isRunning} className="gap-2">
                <RefreshCw className={`w-4 h-4 ${isRunning ? 'animate-spin' : ''}`} />
                Rodar Testes
              </Button>
            </div>
          </div>
        </Card>

        {/* Current User */}
        <Card className="p-6 glass">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Database className="w-5 h-5" />
            Estado Atual
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Autenticado:</span>
              <Badge variant={isAuthenticated ? 'default' : 'secondary'}>
                {isAuthenticated ? 'Sim' : 'Não'}
              </Badge>
            </div>
            {user && (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">ID:</span>
                  <span className="font-mono">{user.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Nome:</span>
                  <span>{user.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email:</span>
                  <span>{user.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Admin:</span>
                  <Badge variant={user.isAdmin ? 'destructive' : 'secondary'}>
                    {user.isAdmin ? 'Sim' : 'Não'}
                  </Badge>
                </div>
              </>
            )}
          </div>
        </Card>

        {/* Test Results */}
        <Card className="p-6 glass md:col-span-2">
          <h3 className="font-semibold mb-4">Resultados dos Testes</h3>
          {testResults.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Clique em "Rodar Testes" para verificar as integrações
            </p>
          ) : (
            <div className="space-y-2">
              {testResults.map((result, idx) => (
                <div
                  key={idx}
                  className={`flex items-center justify-between p-3 rounded-lg ${
                    result.status === 'success'
                      ? 'bg-success/10 border border-success/30'
                      : result.status === 'error'
                      ? 'bg-destructive/10 border border-destructive/30'
                      : 'bg-secondary'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {result.status === 'success' ? (
                      <Check className="w-5 h-5 text-success" />
                    ) : result.status === 'error' ? (
                      <X className="w-5 h-5 text-destructive" />
                    ) : (
                      <RefreshCw className="w-5 h-5 animate-spin" />
                    )}
                    <span className="font-medium">{result.name}</span>
                  </div>
                  <span className="text-sm text-muted-foreground">{result.message}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Actions */}
        <Card className="p-6 glass md:col-span-2">
          <h3 className="font-semibold mb-4">Ações de Debug</h3>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => console.log('User:', user)}>
              Log User State
            </Button>
            <Button variant="outline" onClick={() => console.log('LocalStorage:', { ...localStorage })}>
              Log LocalStorage
            </Button>
            <Button variant="destructive" onClick={clearAllData}>
              Limpar Todos os Dados
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
