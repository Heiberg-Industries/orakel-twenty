import { useEffect, useState } from 'react';
import { Loader } from 'twenty-ui/primitives/feedback';

import type { OwnershipData, OwnershipGroupNode, ShareholderRow } from 'src/widget/card-types';
import { styles } from 'src/widget/ui/styles';
import { errorMessage, requestOwnership } from 'src/widget/ui/widget-api';

type OwnershipTabProps = { companyId: string };
type LoadState = { status: 'loading' } | { status: 'loaded'; data: OwnershipData } | { status: 'failed'; message: string };

const latestShareholders = (rows: ShareholderRow[], years: number[]) => {
  const latestYear = years.length > 0 ? Math.max(...years) : null;
  return latestYear === null ? rows : rows.filter((row) => row.year === latestYear);
};

const groupMembers = (root: OwnershipGroupNode) => {
  const members: { node: OwnershipGroupNode; depth: number }[] = [];
  const visit = (node: OwnershipGroupNode, depth: number) => {
    if (node.name.trim() !== '') members.push({ node, depth });
    node.children.forEach((child) => visit(child, depth + 1));
  };
  visit(root, 0);
  return members;
};

const Shareholders = ({ data, error }: { data: OwnershipData['shareholders']; error: string | null }) => {
  const rows = data ? latestShareholders(data.data, data.availableYears) : [];

  return (
    <section style={styles.section}>
      <p style={styles.heading}>Shareholders</p>
      {error ? (
        <p style={styles.error}>{error}</p>
      ) : rows.length === 0 ? (
        <p style={styles.muted}>No shareholder data available.</p>
      ) : (
        <ul style={styles.plainList}>
          {rows.map((row, index) => (
            <li key={`${row.shareholderOrgNumber ?? row.shareholderName ?? 'shareholder'}-${index}`} style={styles.ownershipRow}>
              <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                {row.shareholderName?.trim() || row.shareholderOrgNumber || 'Unknown shareholder'}
              </span>
              <span style={{ whiteSpace: 'nowrap' }}>{`${row.ownershipPct.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

const Group = ({ data, error }: { data: OwnershipData['group']; error: string | null }) => {
  const members = data ? groupMembers(data.root) : [];
  const isNotInGroup = Boolean(data && data.totalMembers <= 1 && members.length <= 1);

  return (
    <section style={styles.section}>
      <p style={styles.heading}>Corporate group</p>
      {error ? (
        <p style={styles.error}>{error}</p>
      ) : isNotInGroup ? (
        <p style={styles.muted}>Not part of a corporate group.</p>
      ) : (
        <ul style={styles.plainList}>
          {members.map(({ node, depth }) => (
            <li key={node.orgNumber} style={{ ...styles.ownershipRow, paddingLeft: depth * 16 }}>
              <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{node.name}</span>
              <span style={{ ...styles.muted, whiteSpace: 'nowrap' }}>{node.orgNumber}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export const OwnershipTab = ({ companyId }: OwnershipTabProps) => {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    void requestOwnership(companyId)
      .then((data) => {
        if (active) setLoad({ status: 'loaded', data });
      })
      .catch((error: unknown) => {
        if (active) setLoad({ status: 'failed', message: errorMessage(error, 'Could not load ownership data.') });
      });
    return () => {
      active = false;
    };
  }, [companyId]);

  if (load.status === 'loading') {
    return (
      <div style={styles.row}>
        <Loader />
        <span style={styles.muted}>Loading ownership data…</span>
      </div>
    );
  }
  if (load.status === 'failed') {
    return <p style={styles.error}>{load.message}</p>;
  }

  return (
    <div style={{ ...styles.section, gap: 16 }}>
      <Shareholders data={load.data.shareholders} error={load.data.shareholdersError} />
      <Group data={load.data.group} error={load.data.groupError} />
    </div>
  );
};
