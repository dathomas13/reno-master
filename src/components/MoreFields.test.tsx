import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MoreFields } from './MoreFields';

afterEach(cleanup);

describe('MoreFields', () => {
  it('stays closed while nothing inside is filled in', () => {
    render(<MoreFields filled={0}><input aria-label="Notizen" /></MoreFields>);
    expect(screen.queryByLabelText('Notizen')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Weitere Angaben/ }));
    expect(screen.getByLabelText('Notizen')).toBeInTheDocument();
  });

  it('opens by itself when a value arrives later, so nothing filled in hides', () => {
    const { rerender } = render(<MoreFields filled={0}><input aria-label="Notizen" /></MoreFields>);
    rerender(<MoreFields filled={2}><input aria-label="Notizen" /></MoreFields>);
    expect(screen.getByLabelText('Notizen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /2 ausgefüllt/ })).toHaveAttribute('aria-expanded', 'true');
  });
});
