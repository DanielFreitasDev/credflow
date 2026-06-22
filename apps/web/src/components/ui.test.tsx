import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge, StatusBadge } from './ui';

describe('Badge', () => {
  it('renders its children', () => {
    render(<Badge>Olá</Badge>);
    expect(screen.getByText('Olá')).toBeInTheDocument();
  });
});

describe('StatusBadge', () => {
  it('uses the provided label for a known status', () => {
    render(<StatusBadge status="APPROVED" label="Aprovada" />);
    expect(screen.getByText('Aprovada')).toBeInTheDocument();
  });
  it('falls back to the raw status code when no label is given', () => {
    render(<StatusBadge status="MISTERY_STATUS" />);
    expect(screen.getByText('MISTERY_STATUS')).toBeInTheDocument();
  });
});
