import katex from 'katex';
import 'katex/contrib/mhchem';
import { describe, expect, it } from 'vitest';

const render = (tex: string) =>
  katex.renderToString(tex, { throwOnError: true, strict: 'error' });

describe('chemistry with KaTeX mhchem', () => {
  it.each([
    '\\ce{2H2 + O2 -> 2H2O}',
    '\\ce{N2(g) + 3H2(g) <=> 2NH3(g)}',
    '\\ce{CH3COOH(aq) <=>> CH3COO^-(aq) + H+(aq)}',
    '\\ce{CaCO3(s) ->[\\Delta] CaO(s) + CO2(g) ^}',
    '\\ce{Ag+(aq) + Cl-(aq) -> AgCl(s) v}',
    '\\ce{SO4^2-}',
    '\\ce{^{235}_{92}U}',
    '\\pu{6.022e23 mol-1}',
    '\\pu{9.8 m s^-2}',
  ])('renders %s', (tex) => {
    const html = render(tex);
    expect(html).toContain('class="katex"');
    expect(html).not.toContain('katex-error');
  });

  it('draws equilibrium arrows, not literal characters', () => {
    const html = render('\\ce{A <=> B}');
    expect(html).toMatch(/⇌|rightleftharpoons|<svg/);
    expect(html.replace(/<annotation[\s\S]*?<\/annotation>/g, '')).not.toContain('&lt;=&gt;');
  });
});
