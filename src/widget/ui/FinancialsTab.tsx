import { useState } from 'react';
import { Button } from 'twenty-ui/primitives/input';

import type { OrakelCompanyCard } from 'src/widget/card-types';
import { currencyFor, financialColumns, formatMillions } from 'src/widget/format';
import { styles } from 'src/widget/ui/styles';
import { errorMessage, requestFinancialHistory } from 'src/widget/ui/widget-api';

type FinancialsTabProps = {
  companyId: string;
  card: OrakelCompanyCard;
  onHistoryLoaded: () => void;
};

const FULL_HISTORY_YEARS = 5;

export const FinancialsTab = ({ companyId, card, onHistoryLoaded }: FinancialsTabProps) => {
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const rows = card.financials;
  if (rows.length === 0) {
    return <p style={styles.muted}>No financial data available for this company.</p>;
  }

  const columns = financialColumns(rows);
  const currency = currencyFor(card.overview.country);
  // Orakel reads annual-report PDFs for Norwegian companies only.
  const canLoadHistory = card.overview.country === 'NO' && card.pdfYearCount < FULL_HISTORY_YEARS;

  const loadHistory = async () => {
    setLoadingHistory(true);
    setHistoryError(null);
    try {
      const result = await requestFinancialHistory(companyId);
      if (result.ok) {
        onHistoryLoaded();
      } else {
        setHistoryError(result.message);
      }
    } catch (error) {
      setHistoryError(errorMessage(error, 'Could not get the financial history for this company.'));
    } finally {
      setLoadingHistory(false);
    }
  };

  return (
    <div style={styles.section}>
      <p style={{ ...styles.muted, fontStyle: 'italic' }}>
        {currency ? `All figures in millions ${currency}` : 'All figures in millions'}
      </p>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={{ ...styles.th, textAlign: 'left' }}>Year</th>
            {columns.map((column) => (
              <th key={column.key} style={styles.th}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.year}>
              <td style={{ ...styles.td, textAlign: 'left' }}>{row.year}</td>
              {columns.map((column) => (
                <td key={column.key} style={styles.td}>
                  {formatMillions(row[column.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {canLoadHistory && (
        <div style={styles.section}>
          <div style={styles.row}>
            <Button size="sm" variant="outline" loading={loadingHistory} disabled={loadingHistory} onClick={loadHistory}>
              {loadingHistory ? 'Getting 5-year history…' : 'Get 5-year history'}
            </Button>
            {loadingHistory && <span style={styles.muted}>This can take up to a minute.</span>}
          </div>
          {historyError && <p style={styles.error}>{historyError}</p>}
        </div>
      )}
    </div>
  );
};
