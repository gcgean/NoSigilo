import { describe, expect, it } from 'vitest';
import { calcularRecuos } from './Stories';

const base = { innerHeight: 800, vvHeight: 800, vvOffsetTop: 0, vvScale: 1, digitando: false, piso: 0 };

describe('recuos do story no iPhone (23/11/2026)', () => {
  it('barra do Safari cobrindo embaixo: empurra o rodapé só o tamanho da barra', () => {
    expect(calcularRecuos({ ...base, vvHeight: 720 })).toEqual({ baixo: 80, topo: 0, cobre: true });
  });

  it('tela ampliada com pinça não vira faixa preta', () => {
    expect(calcularRecuos({ ...base, vvHeight: 500, vvScale: 1.6 })).toEqual({ baixo: 0, topo: 0, cobre: false });
  });

  it('medida velha de teclado sem campo focado fica limitada à barra', () => {
    expect(calcularRecuos({ ...base, vvHeight: 450 }).baixo).toBe(120);
  });

  it('teclado aberto de verdade continua respeitado', () => {
    expect(calcularRecuos({ ...base, vvHeight: 450, vvOffsetTop: 50, digitando: true })).toEqual({ baixo: 300, topo: 50, cobre: true });
  });
});
