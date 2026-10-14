import type { OwnershipGroupNode, ShareholderRow } from 'src/widget/card-types';

export const latestShareholders = (rows: ShareholderRow[], years: number[]) => {
  const latestYear = years.length > 0 ? Math.max(...years) : null;
  return latestYear === null ? rows : rows.filter((row) => row.year === latestYear);
};

export const groupMembers = (root: OwnershipGroupNode) => {
  const members: { node: OwnershipGroupNode; depth: number }[] = [];
  const visit = (node: OwnershipGroupNode, depth: number) => {
    if (node.name.trim() !== '') members.push({ node, depth });
    node.children.forEach((child) => visit(child, depth + 1));
  };
  visit(root, 0);
  return members;
};

export const isNotInGroup = (group: { root: OwnershipGroupNode; totalMembers: number }) =>
  group.totalMembers <= 1 && groupMembers(group.root).length <= 1;
