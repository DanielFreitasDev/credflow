import { useState } from 'react';
import { Download } from 'lucide-react';
import { apiError, downloadCsv } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';

/**
 * Downloads an authenticated CSV report endpoint as a file.
 * CSV export is restricted to ADMIN / MANAGER / AUDITOR on the backend, so the
 * button is hidden for other roles (ADMIN is covered by `hasRole`, which bypasses).
 */
export function ExportCsvButton({
  path,
  filename,
  label = 'Exportar CSV',
}: {
  path: string;
  filename: string;
  label?: string;
}) {
  const { hasRole } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  if (!hasRole('MANAGER', 'AUDITOR')) return null;

  const onClick = async () => {
    setLoading(true);
    try {
      await downloadCsv(path, filename);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <button type="button" className="btn-secondary" onClick={onClick} disabled={loading}>
      <Download className="h-4 w-4" /> {loading ? 'Exportando…' : label}
    </button>
  );
}
