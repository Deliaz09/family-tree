/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { NodePhoto, NodeAvatar } from './TreeCanvas';

afterEach(cleanup);

const renderInSvg = (ui) => render(<svg>{ui}</svg>);

describe('NodePhoto — avatar placeholder în loc de imagine ruptă', () => {
  it('persoană fără poză (src null): apare avatarul, niciun <image>', () => {
    const { container } = renderInSvg(
      <NodePhoto src={null} x={0} y={0} size={144} gender="F" />
    );
    expect(container.querySelector('image')).toBeNull();
    expect(container.querySelector('circle')).not.toBeNull();
    expect(container.querySelector('path')).not.toBeNull();
  });

  it('poză cu adresă invalidă: la eroarea de încărcare cade pe avatar', () => {
    const { container } = renderInSvg(
      <NodePhoto src="http://invalid.example/lipsa.jpg" x={0} y={0} size={144} gender="M" />
    );
    const img = container.querySelector('image');
    expect(img, 'inițial încearcă imaginea reală').not.toBeNull();

    fireEvent.error(img);

    expect(container.querySelector('image'), 'după eroare nu mai există <image>').toBeNull();
    expect(container.querySelector('circle')).not.toBeNull();
    expect(container.querySelector('path')).not.toBeNull();
  });

  it('poză validă: rămâne <image>, fără avatar', () => {
    const { container } = renderInSvg(
      <NodePhoto src="http://ok.example/poza.jpg" x={0} y={0} size={144} gender="M" />
    );
    expect(container.querySelector('image')).not.toBeNull();
    expect(container.querySelector('circle')).toBeNull();
  });

  it('avatarul are culori INLINE diferite pe gen (export SVG self-contained)', () => {
    const fillOf = (gender) => {
      const { container } = renderInSvg(<NodeAvatar x={0} y={0} size={100} gender={gender} />);
      return container.querySelector('circle').getAttribute('fill');
    };
    const f = fillOf('F'), m = fillOf('M'), u = fillOf(null);
    expect(f).not.toBe(m);
    expect(m).not.toBe(u);
    expect(f).toMatch(/^#/);
  });
});
