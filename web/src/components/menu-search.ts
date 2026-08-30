export type MenuGroup<T> = {
  label: string | null;
  items: T[];
};

export function filterMenuGroups<T extends { label: string }>(
  groups: MenuGroup<T>[],
  query: string
): MenuGroup<T>[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  return groups
    .map((group) => ({
      ...group,
      items: normalizedQuery
        ? group.items.filter((item) =>
            item.label.toLocaleLowerCase().includes(normalizedQuery)
          )
        : group.items,
    }))
    .filter((group) => group.items.length > 0);
}
