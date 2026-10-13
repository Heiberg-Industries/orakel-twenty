import { useState } from 'react';
import { Tag } from 'twenty-ui/primitives/data-display';
import { Button } from 'twenty-ui/primitives/input';

import type { OrakelCompanyCard } from 'src/widget/card-types';
import { AddPersonRow } from 'src/widget/ui/AddPerson';
import { styles } from 'src/widget/ui/styles';

// The People tab, ported from the HubSpot card's Intelligence tab: CEO, board chair and members,
// each with "+ Add"; active tenders; the tech stack. Orakel has already left out everyone who
// asked to be hidden.

const BOARD_PREVIEW = 4;

type PeopleTabProps = { companyId: string; intelligence: OrakelCompanyCard['intelligence'] };

const Person = ({ companyId, name, role }: { companyId: string; name: string; role?: string }) => (
  <AddPersonRow
    request={{ companyId, name }}
    label={
      <>
        {role && <span style={styles.label}>{role} </span>}
        {name}
      </>
    }
  />
);

export const PeopleTab = ({ companyId, intelligence }: PeopleTabProps) => {
  const [boardExpanded, setBoardExpanded] = useState(false);

  const { ceo, boardChair, activeTenders, latestTenderUrl, latestTenderTitle } = intelligence;
  const boardMembers = intelligence.boardMembers ?? [];
  const technologies = intelligence.technologies ?? [];
  const sameLeader = ceo !== null && ceo === boardChair;
  const visibleMembers = boardExpanded ? boardMembers : boardMembers.slice(0, BOARD_PREVIEW);
  const hiddenCount = boardMembers.length - BOARD_PREVIEW;
  const hasPeople = Boolean(ceo || boardChair || boardMembers.length > 0);

  return (
    <div style={{ ...styles.section, gap: 12 }}>
      <div style={styles.section}>
        <p style={styles.heading}>People</p>
        {!hasPeople && <p style={styles.muted}>Orakel lists no CEO or board for this company.</p>}
        {sameLeader ? (
          <Person companyId={companyId} name={ceo} role="CEO · Board chair" />
        ) : (
          <>
            {ceo && <Person companyId={companyId} name={ceo} role="CEO" />}
            {boardChair && <Person companyId={companyId} name={boardChair} role="Board chair" />}
          </>
        )}
        {boardMembers.length > 0 && (
          <>
            <p style={styles.label}>Board members</p>
            {visibleMembers.map((member) => (
              <Person key={member} companyId={companyId} name={member} />
            ))}
            {hiddenCount > 0 && (
              <div>
                <Button size="sm" variant="ghost" onClick={() => setBoardExpanded(!boardExpanded)}>
                  {boardExpanded ? 'Show less' : `Show ${hiddenCount} more`}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {activeTenders > 0 && (
        <div style={styles.section}>
          <p style={styles.heading}>Active tenders</p>
          <p style={styles.value}>
            {latestTenderUrl ? (
              <a href={latestTenderUrl} target="_blank" rel="noreferrer" style={styles.link}>
                {`${activeTenders} active · ${latestTenderTitle ?? 'view latest'}`}
              </a>
            ) : (
              `${activeTenders} active`
            )}
          </p>
        </div>
      )}

      {technologies.length > 0 && (
        <div style={styles.section}>
          <p style={styles.heading}>Tech stack</p>
          <p style={styles.muted}>Detected on the company's website.</p>
          <div style={styles.row}>
            {technologies.map((technology) => (
              <Tag key={technology} color="gray">
                {technology}
              </Tag>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
