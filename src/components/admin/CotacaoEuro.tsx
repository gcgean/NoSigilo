import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import apiClient from '@/utils/apiClient';

/**
 * Cotação usada só para mostrar "≈ €" a quem é de Portugal (planos e tokens).
 * A cobrança continua em real: mudar aqui não muda o preço de ninguém.
 */
export default function CotacaoEuro() {
  const { toast } = useToast();
  const [valor, setValor] = useState('');
  const [salvo, setSalvo] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    apiClient.get('/admin/settings/cotacao-euro')
      .then(({ data }) => { setSalvo(data.cotacao); setValor(String(data.cotacao).replace('.', ',')); })
      .catch(() => undefined);
  }, []);

  const salvar = async () => {
    const numero = Number(valor.replace(',', '.'));
    if (!(numero > 1 && numero < 50)) {
      toast({ title: 'Digite a cotação em reais, por exemplo 6,20.', variant: 'destructive' });
      return;
    }
    setSalvando(true);
    try {
      const { data } = await apiClient.put('/admin/settings/cotacao-euro', { cotacao: numero });
      setSalvo(data.cotacao);
      toast({ title: 'Cotação salva', description: `€1 = R$ ${String(data.cotacao).replace('.', ',')}` });
    } catch {
      toast({ title: 'Não foi possível salvar a cotação.', variant: 'destructive' });
    } finally {
      setSalvando(false);
    }
  };

  const exemplo = salvo ? (2990 / salvo / 100).toFixed(2).replace('.', ',') : null;

  return (
    <Card className="mb-6 p-5 glass">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-semibold">🇵🇹 Cotação do euro (Portugal)</p>
          <p className="text-sm text-muted-foreground">
            Só para mostrar o valor aproximado em euro a quem é de Portugal. A cobrança continua em reais.
            {exemplo ? ` Hoje: R$ 29,90 aparece como ≈ €${exemplo}.` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <span className="text-sm text-muted-foreground">€1 = R$</span>
          <Input className="w-24" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
          <Button onClick={() => void salvar()} disabled={salvando}>Salvar</Button>
        </div>
      </div>
    </Card>
  );
}
