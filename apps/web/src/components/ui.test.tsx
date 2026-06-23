import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Badge, Select, SelectOption, StatusBadge } from './ui';

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

function ControlledSelect({
  options,
  initial = '',
  onChange,
  placeholder,
  searchable,
}: {
  options: SelectOption[];
  initial?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  searchable?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <Select
      aria-label="Teste"
      value={value}
      onChange={(v) => { setValue(v); onChange?.(v); }}
      options={options}
      placeholder={placeholder}
      searchable={searchable}
    />
  );
}

const FRUITS: SelectOption[] = [
  { value: 'a', label: 'Abacaxi' },
  { value: 'b', label: 'Banana' },
  { value: 'c', label: 'Caju' },
];

describe('Select', () => {
  it('shows the placeholder when nothing is selected and opens on click', () => {
    render(<ControlledSelect options={FRUITS} placeholder="Selecione" />);
    const trigger = screen.getByRole('combobox', { name: 'Teste' });
    expect(trigger).toHaveTextContent('Selecione');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('selects an option, fires onChange, closes, and reflects the label', () => {
    const onChange = vi.fn();
    render(<ControlledSelect options={FRUITS} onChange={onChange} placeholder="Selecione" />);
    const trigger = screen.getByRole('combobox', { name: 'Teste' });

    fireEvent.click(trigger);
    fireEvent.mouseDown(screen.getByRole('option', { name: 'Banana' }));

    expect(onChange).toHaveBeenCalledWith('b');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger).toHaveTextContent('Banana');
  });

  it('selects with the keyboard (ArrowDown + Enter)', () => {
    const onChange = vi.fn();
    render(<ControlledSelect options={FRUITS} onChange={onChange} placeholder="Selecione" />);
    const trigger = screen.getByRole('combobox', { name: 'Teste' });

    fireEvent.keyDown(trigger, { key: 'ArrowDown' }); // opens, highlights first
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowDown' }); // -> second
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('filters options through the search box and shows an empty message', () => {
    render(<ControlledSelect options={FRUITS} searchable placeholder="Selecione" />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Teste' }));

    const search = screen.getByPlaceholderText('Buscar...');
    fireEvent.change(search, { target: { value: 'ban' } });
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option', { name: 'Banana' })).toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    expect(screen.getByText('Nenhum resultado')).toBeInTheDocument();
  });
});
