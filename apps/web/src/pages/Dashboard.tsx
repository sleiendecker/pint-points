import { Fragment, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Divider,
  Group,
  Modal,
  NumberInput,
  Paper,
  Select,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { api } from "../lib/api";

const PINT_COST = 10;

function timeAgo(epoch: number) {
  const s = Math.floor(Date.now() / 1000) - epoch;
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function Dashboard() {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  const ledger = useQuery({ queryKey: ["ledger"], queryFn: api.ledger });

  const sync = useMutation({
    mutationFn: api.sync,
    onSuccess: () => queryClient.invalidateQueries(),
  });

  const [showRedeem, setShowRedeem] = useState(false);
  const [historySize, setHistorySize] = useState("25");
  const [historyVisible, setHistoryVisible] = useState(25);

  if (me.isPending) return <Text c="dimmed">Loading…</Text>;
  if (me.isError) {
    return <Text c="red">Can't reach the API. Is it running? ({me.error.message})</Text>;
  }

  const balance = me.data.balance;
  const pints = Math.floor(balance / PINT_COST);

  return (
    <Stack gap="lg">
      {!me.data.connected && (
        <Paper withBorder p="md" style={{ borderColor: "var(--mantine-color-yellow-9)" }}>
          <Group justify="space-between">
            <div>
              <Text fw={600} c="yellow.4">
                Connect your Strava
              </Text>
              <Text size="sm" c="dimmed">
                Activities sync from Strava and earn points via your rules.
              </Text>
            </div>
            <Button component="a" href="/api/strava/connect" color="#fc4c02" c="white">
              Connect Strava
            </Button>
          </Group>
        </Paper>
      )}

      <Paper withBorder p="lg">
        <Text size="sm" fw={500} c="dimmed">
          Balance
        </Text>
        <Group align="baseline" gap="sm" mt={4}>
          <Text fz={48} fw={700} c="yellow.4" style={{ fontVariantNumeric: "tabular-nums" }}>
            {balance}
          </Text>
          <Text c="dimmed">
            points · {pints} {pints === 1 ? "pint" : "pints"} earned 🍺
          </Text>
        </Group>
        {me.data.startDate && (
          <Text size="xs" c="dimmed" mt={4}>
            Counting activities since{" "}
            {new Date(me.data.startDate * 1000).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </Text>
        )}
        <Group mt="md">
          <Button onClick={() => setShowRedeem(true)}>Redeem</Button>
          {me.data.connected && (
            <Button variant="default" loading={sync.isPending} onClick={() => sync.mutate()}>
              Sync Strava
            </Button>
          )}
          {me.data.lastSyncAt && (
            <Text size="xs" c="dimmed">
              Last synced {timeAgo(me.data.lastSyncAt)}
            </Text>
          )}
        </Group>
        {sync.isSuccess && (
          <Text size="sm" c="teal.4" mt="sm">
            Synced {sync.data.newActivities} new{" "}
            {sync.data.newActivities === 1 ? "activity" : "activities"} (+
            {sync.data.pointsEarned} pts)
          </Text>
        )}
        {sync.isError && (
          <Text size="sm" c="red" mt="sm">
            {sync.error.message}
          </Text>
        )}
      </Paper>

      <RedeemModal opened={showRedeem} onClose={() => setShowRedeem(false)} balance={balance} />

      <div>
        <Group justify="space-between" mb="xs">
          <Title order={5} c="dimmed" tt="uppercase">
            Points history
          </Title>
          {(ledger.data?.length ?? 0) > 25 && (
            <Select
              data={["25", "50", "100"]}
              value={historySize}
              onChange={(v) => {
                if (!v) return;
                setHistorySize(v);
                setHistoryVisible(Number(v));
              }}
              allowDeselect={false}
              w={80}
              size="xs"
            />
          )}
        </Group>
        {ledger.data?.length ? (
          <Paper withBorder>
            {ledger.data.slice(0, historyVisible).map((entry, i) => (
              <Fragment key={entry.id}>
                {i > 0 && <Divider />}
                <Group justify="space-between" px="md" py="sm">
                  <div>
                    <Text size="sm">{entry.description}</Text>
                    <Text size="xs" c="dimmed">
                      {new Date(entry.createdAt * 1000).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </Text>
                  </div>
                  <Badge variant="light" color={entry.type === "earn" ? "teal" : "yellow"}>
                    {entry.type === "earn" ? "+" : "−"}
                    {entry.points}
                  </Badge>
                </Group>
              </Fragment>
            ))}
            {ledger.data.length > historyVisible && (
              <>
                <Divider />
                <Group justify="center" py="xs">
                  <Button
                    variant="subtle"
                    color="gray"
                    size="compact-sm"
                    onClick={() => setHistoryVisible((v) => v + Number(historySize))}
                  >
                    Show more ({ledger.data.length - historyVisible} remaining)
                  </Button>
                </Group>
              </>
            )}
          </Paper>
        ) : (
          <Text size="sm" c="dimmed">
            Nothing yet. Sync some activities or run <code>pnpm --filter api seed</code> for
            demo data.
          </Text>
        )}
      </div>
    </Stack>
  );
}

function RedeemModal({
  opened,
  onClose,
  balance,
}: {
  opened: boolean;
  onClose: () => void;
  balance: number;
}) {
  const queryClient = useQueryClient();
  const treats = useQuery({ queryKey: ["treats"], queryFn: api.treats, enabled: opened });
  const [quantities, setQuantities] = useState<Record<number, number>>({});

  const redeem = useMutation({
    mutationFn: api.redeem,
    onSuccess: () => {
      queryClient.invalidateQueries();
      setQuantities({});
      onClose();
    },
  });

  const total =
    Math.round(
      (treats.data ?? []).reduce(
        (sum, t) => sum + t.pointCost * (quantities[t.id] ?? 0),
        0,
      ) * 10,
    ) / 10;
  const overBudget = total > balance;

  const close = () => {
    setQuantities({});
    redeem.reset();
    onClose();
  };

  return (
    <Modal opened={opened} onClose={close} title="Cash in your points" centered>
      <Stack>
        {treats.data?.map((treat) => (
          <Group key={treat.id} justify="space-between">
            <div>
              <Text size="sm">{treat.name}</Text>
              <Text size="xs" c="dimmed">
                {treat.pointCost} pts
              </Text>
            </div>
            <NumberInput
              value={quantities[treat.id] ?? 0}
              onChange={(v) =>
                setQuantities((q) => ({ ...q, [treat.id]: Math.max(0, Math.floor(Number(v) || 0)) }))
              }
              min={0}
              max={99}
              w={90}
            />
          </Group>
        ))}
        <Group justify="space-between">
          <Text size="sm" fw={600}>
            Total: {total} pts
          </Text>
          <Text size="sm" c={overBudget ? "red" : "dimmed"}>
            Balance: {balance}
          </Text>
        </Group>
        {redeem.isError && (
          <Text size="sm" c="red">
            {redeem.error.message}
          </Text>
        )}
        <Group justify="flex-end">
          <Button variant="subtle" color="gray" onClick={close}>
            Cancel
          </Button>
          <Button
            loading={redeem.isPending}
            disabled={total === 0 || overBudget}
            onClick={() =>
              redeem.mutate(
                Object.entries(quantities)
                  .filter(([, qty]) => qty > 0)
                  .map(([treatId, quantity]) => ({ treatId: Number(treatId), quantity })),
              )
            }
          >
            Cash in
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
