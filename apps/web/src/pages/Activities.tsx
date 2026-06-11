import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Anchor,
  Badge,
  Group,
  Pagination,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import type { Activity } from "@pint-points/shared";
import { api } from "../lib/api";

const METERS_PER_MILE = 1609.344;

const spaced = (s: string) => s.replace(/([a-z])([A-Z])/g, "$1 $2");

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

type SortField = "name" | "date" | "points";
type SortDir = "asc" | "desc";

const comparators: Record<SortField, (a: Activity, b: Activity) => number> = {
  name: (a, b) => a.name.localeCompare(b.name),
  date: (a, b) => a.startDate.localeCompare(b.startDate),
  points: (a, b) => a.pointsEarned - b.pointsEarned,
};

function SortableTh({
  label,
  field,
  sort,
  onSort,
  ta,
  visibleFrom,
}: {
  label: string;
  field: SortField;
  sort: { field: SortField; dir: SortDir };
  onSort: (field: SortField) => void;
  ta?: "right";
  visibleFrom?: string;
}) {
  const active = sort.field === field;
  return (
    <Table.Th
      ta={ta}
      w={field === "date" ? 120 : field === "points" ? 90 : undefined}
      visibleFrom={visibleFrom}
    >
      <UnstyledButton onClick={() => onSort(field)} fz="sm" fw={600}>
        {label} {active ? (sort.dir === "asc" ? "▲" : "▼") : ""}
      </UnstyledButton>
    </Table.Th>
  );
}

export default function Activities() {
  const activities = useQuery({ queryKey: ["activities"], queryFn: api.activities });

  const [sort, setSort] = useState<{ field: SortField; dir: SortDir }>({
    field: "date",
    dir: "desc",
  });
  const [pageSize, setPageSize] = useState("25");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sportFilter, setSportFilter] = useState<string | null>(null);

  const sportTypes = useMemo(() => {
    const types = [...new Set((activities.data ?? []).map((a) => a.sportType))].sort();
    return types.map((t) => ({ value: t, label: spaced(t) }));
  }, [activities.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (activities.data ?? []).filter((a) => {
      if (sportFilter && a.sportType !== sportFilter) return false;
      if (q && !a.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [activities.data, search, sportFilter]);

  const sorted = useMemo(() => {
    const list = [...filtered].sort(comparators[sort.field]);
    if (sort.dir === "desc") list.reverse();
    return list;
  }, [filtered, sort]);

  const onSort = (field: SortField) => {
    setPage(1);
    setSort((s) =>
      s.field === field
        ? { field, dir: s.dir === "asc" ? "desc" : "asc" }
        : { field, dir: field === "name" ? "asc" : "desc" },
    );
  };

  const onSearch = (val: string) => {
    setSearch(val);
    setPage(1);
  };

  const onSportFilter = (val: string | null) => {
    setSportFilter(val);
    setPage(1);
  };

  if (activities.isPending) return <Text c="dimmed">Loading…</Text>;
  if (activities.isError) return <Text c="red">{activities.error.message}</Text>;

  if (!(activities.data ?? []).length) {
    return (
      <Text size="sm" c="dimmed">
        No activities yet. Connect Strava and hit "Sync Strava" on the dashboard.
      </Text>
    );
  }

  const size = Number(pageSize);
  const totalPages = Math.ceil(sorted.length / size);
  const pageItems = sorted.slice((page - 1) * size, page * size);

  return (
    <Paper withBorder>
      <Stack gap="xs" px="md" py="sm">
        <Group gap="xs">
          <TextInput
            placeholder="Search activities…"
            value={search}
            onChange={(e) => onSearch(e.currentTarget.value)}
            size="xs"
            style={{ flex: 1 }}
          />
          <Select
            placeholder="All types"
            data={sportTypes}
            value={sportFilter}
            onChange={onSportFilter}
            clearable
            size="xs"
            w={{ base: 120, sm: 150 }}
          />
        </Group>
        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            {sorted.length === (activities.data ?? []).length
              ? `${sorted.length} activities`
              : `${sorted.length} of ${(activities.data ?? []).length}`}
          </Text>
          <Group gap="xs">
            <Select
              data={["25", "50", "100"]}
              value={pageSize}
              onChange={(v) => {
                if (!v) return;
                setPageSize(v);
                setPage(1);
              }}
              allowDeselect={false}
              w={70}
              size="xs"
            />
            {totalPages > 1 && (
              <Pagination total={totalPages} value={page} onChange={setPage} size="sm" />
            )}
          </Group>
        </Group>
      </Stack>
      <Table verticalSpacing="sm" horizontalSpacing="md">
        <Table.Thead>
          <Table.Tr>
            <SortableTh label="Activity" field="name" sort={sort} onSort={onSort} />
            <Table.Th hiddenFrom="sm">Date</Table.Th>
            <SortableTh label="Date" field="date" sort={sort} onSort={onSort} visibleFrom="sm" />
            <Table.Th visibleFrom="sm">Details</Table.Th>
            <SortableTh label="Points" field="points" sort={sort} onSort={onSort} ta="right" />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {pageItems.length ? (
            pageItems.map((a) => (
              <Table.Tr key={a.id}>
                <Table.Td>
                  <Anchor
                    href={`https://www.strava.com/activities/${a.id}`}
                    target="_blank"
                    rel="noopener"
                    size="sm"
                    fw={500}
                    c="inherit"
                    underline="hover"
                  >
                    {a.name} ↗
                  </Anchor>
                  <Text size="xs" c="dimmed">
                    {spaced(a.sportType)}
                  </Text>
                </Table.Td>
                <Table.Td hiddenFrom="sm">
                  <Text size="sm" c="dimmed" style={{ whiteSpace: "nowrap" }}>
                    {new Date(a.startDate).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </Text>
                </Table.Td>
                <Table.Td visibleFrom="sm">
                  <Text size="sm" c="dimmed" style={{ whiteSpace: "nowrap" }}>
                    {new Date(a.startDate).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </Text>
                </Table.Td>
                <Table.Td visibleFrom="sm">
                  <Text size="sm" c="dimmed">
                    {[
                      a.distanceMeters > 0 &&
                        `${(a.distanceMeters / METERS_PER_MILE).toFixed(1)} mi`,
                      a.movingTimeSeconds > 0 && formatDuration(a.movingTimeSeconds),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                </Table.Td>
                <Table.Td ta="right">
                  <Badge variant="light" color={a.pointsEarned > 0 ? "teal" : "gray"}>
                    +{a.pointsEarned}
                  </Badge>
                </Table.Td>
              </Table.Tr>
            ))
          ) : (
            <Table.Tr>
              <Table.Td colSpan={4}>
                <Text size="sm" c="dimmed" ta="center" py="md">
                  No activities match your filters.
                </Text>
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>
    </Paper>
  );
}
