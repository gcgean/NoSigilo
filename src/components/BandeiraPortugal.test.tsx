import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import BandeiraPortugal from './BandeiraPortugal';

describe('bandeirinha de Portugal', () => {
  it('aparece só para perfil de Portugal', () => {
    expect(render(<BandeiraPortugal state="PT" />).container.querySelector('svg[aria-label="Portugal"]')).not.toBeNull();
    expect(render(<BandeiraPortugal state=" pt " />).container.querySelector('svg')).not.toBeNull();
  });

  it('não aparece para o Brasil nem sem estado', () => {
    for (const state of ['SP', 'CE', 'RN', '', null, undefined]) {
      expect(render(<BandeiraPortugal state={state} />).container.innerHTML).toBe('');
    }
  });
});
