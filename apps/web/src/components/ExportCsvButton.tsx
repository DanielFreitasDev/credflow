import { useState } from 'react';
import { Download } from 'lucide-react';
import { apiError, downloadCsv } from '../lib/api';

/** Downloads an authenticated CSV report endpoint as a file. */
export function ExportCsvButton({
  path,
  filename,
  label = 'Exportar CSV',
}: {
  path: string;
  filename: string;
  label?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onClick = async () => {
    setLoading(true);
    setError(null);
    try {
      await downloadCsv(path, filename);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      className="btn-secondary"
      onClick={onClick}
      disabled={loading}
      title={error ?? undefined}
    >
      <Download className="h-4 w-4" /> {loading ? 'Exportando…' : label}
    </button>
  );
}
