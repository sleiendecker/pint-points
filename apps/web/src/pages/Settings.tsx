import { Fragment, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Divider,
  Group,
  Modal,
  NumberInput,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { MAX_TREATS } from "@pint-points/shared";
import type { Treat } from "@pint-points/shared";
import { api } from "../lib/api";

const toDateInput = (epoch: number) => new Date(epoch * 1000).toISOString().slice(0, 10);
// Parse as local midnight so "today" means your today, not UTC's
const toEpoch = (dateStr: string) => Math.floor(new Date(`${dateStr}T00:00:00`).getTime() / 1000);

export default function Settings() {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });

  // null = "user hasn't touched the field"; fall back to the saved value
  const [draftDate, setDraftDate] = useState<string | null>(null);

  const resync = useMutation({
    mutationFn: api.resync,
    onSuccess: () => queryClient.invalidateQueries(),
  });
  const recalculate = useMutation({
    mutationFn: api.recalculate,
    onSuccess: () => queryClient.invalidateQueries(),
  });

  if (me.isPending) return <Text c="dimmed">Loading…</Text>;
  if (me.isError) return <Text c="red">{me.error.message}</Text>;

  const savedDate = me.data.startDate ? toDateInput(me.data.startDate) : "";
  const date = draftDate ?? savedDate;

  const confirmResync = () =>
    modals.openConfirmModal({
      title: "Reset & re-sync?",
      centered: true,
      children: (
        <Text size="sm">
          This wipes all imported activities and their earned points, then re-imports from{" "}
          <b>{new Date(`${date}T00:00:00`).toLocaleDateString()}</b> using your current rules.
          Redemptions are kept; those beers were drunk.
        </Text>
      ),
      labels: { confirm: "Reset & re-sync", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => resync.mutate(toEpoch(date)),
    });

  const confirmRecalculate = async () => {
    const preview = await api.recalculatePreview();
    modals.openConfirmModal({
      title: "Recalculate history?",
      centered: true,
      children: (
        <Text size="sm">
          Every imported activity gets re-scored with your <b>current</b> rules. Your balance
          would go from <b>{preview.currentBalance}</b> to <b>{preview.newBalance}</b> points.
          Redemptions are untouched.
        </Text>
      ),
      labels: { confirm: "Recalculate", cancel: "Cancel" },
      onConfirm: () => recalculate.mutate(),
    });
  };

  return (
    <Stack gap="lg">
      <Title order={4}>Settings</Title>

      <Paper withBorder p="md">
        <Text fw={600}>Points start date</Text>
        <Text size="sm" c="dimmed" mt={4}>
          Activities before this date never earn points. Changing it resets your imported
          history and re-syncs from Strava.
        </Text>
        <Group align="flex-end" mt="sm">
          <TextInput
            type="date"
            label="Start date"
            value={date}
            onChange={(e) => setDraftDate(e.currentTarget.value)}
            w={180}
          />
          <Button
            color="red"
            variant="light"
            loading={resync.isPending}
            disabled={!date || !me.data.connected}
            onClick={confirmResync}
          >
            Reset & re-sync
          </Button>
        </Group>
        {!me.data.connected && (
          <Text size="xs" c="dimmed" mt="xs">
            Connect Strava first to use this.
          </Text>
        )}
        {resync.isSuccess && (
          <Text size="sm" c="teal.4" mt="sm">
            Re-imported {resync.data.newActivities}{" "}
            {resync.data.newActivities === 1 ? "activity" : "activities"} (+
            {resync.data.pointsEarned} pts)
          </Text>
        )}
        {resync.isError && (
          <Text size="sm" c="red" mt="sm">
            {resync.error.message}
          </Text>
        )}
      </Paper>

      <TreatsSection />

      <Paper withBorder p="md">
        <Text fw={600}>Recalculate history</Text>
        <Text size="sm" c="dimmed" mt={4}>
          Rule edits normally apply to future syncs only. This re-scores everything already
          imported using your current rules. It's the do-over button.
        </Text>
        <Button mt="sm" variant="default" loading={recalculate.isPending} onClick={confirmRecalculate}>
          Recalculate with current rules
        </Button>
        {recalculate.isSuccess && (
          <Text size="sm" c="teal.4" mt="sm">
            Done. New balance: {recalculate.data.balance} points
          </Text>
        )}
        {recalculate.isError && (
          <Text size="sm" c="red" mt="sm">
            {recalculate.error.message}
          </Text>
        )}
      </Paper>
    </Stack>
  );
}

function TreatsSection() {
  const queryClient = useQueryClient();
  const treats = useQuery({ queryKey: ["treats"], queryFn: api.treats });

  const [name, setName] = useState("");
  const [cost, setCost] = useState<number | string>(10);
  const [editing, setEditing] = useState<Treat | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["treats"] });
  const createTreat = useMutation({
    mutationFn: api.createTreat,
    onSuccess: () => {
      setName("");
      invalidate();
    },
  });
  const deleteTreat = useMutation({ mutationFn: api.deleteTreat, onSuccess: invalidate });

  const confirmDelete = (treat: Treat) =>
    modals.openConfirmModal({
      title: "Remove treat?",
      centered: true,
      children: (
        <Text size="sm">
          <b>{treat.name}</b> ({treat.pointCost} pts) disappears from the redeem menu. Past
          redemptions keep their history.
        </Text>
      ),
      labels: { confirm: "Remove", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => deleteTreat.mutate(treat.id),
    });

  const count = treats.data?.length ?? 0;

  return (
    <Paper withBorder p="md">
      <Text fw={600}>Treats</Text>
      <Text size="sm" c="dimmed" mt={4}>
        Your reward menu: what points can be cashed in for, and the price of each. Max{" "}
        {MAX_TREATS}; keep it curated.
      </Text>
      {treats.data?.length ? (
        <Paper withBorder mt="sm">
          {treats.data.map((treat, i) => (
            <Fragment key={treat.id}>
              {i > 0 && <Divider />}
              <Group justify="space-between" px="md" py="sm">
                <Text size="sm">
                  <Text span fw={600}>
                    {treat.name}
                  </Text>{" "}
                  <Text span c="dimmed">
                    · {treat.pointCost} pts
                  </Text>
                </Text>
                <Group gap="xs">
                  <Button size="compact-xs" variant="subtle" onClick={() => setEditing(treat)}>
                    Edit
                  </Button>
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    color="red"
                    disabled={count <= 1}
                    onClick={() => confirmDelete(treat)}
                  >
                    Remove
                  </Button>
                </Group>
              </Group>
            </Fragment>
          ))}
        </Paper>
      ) : null}
      {count < MAX_TREATS && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createTreat.mutate({ name, pointCost: Number(cost) });
          }}
        >
          <Group align="flex-end" mt="sm">
            <TextInput
              label="Treat"
              placeholder="🍔 Burger"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              w={180}
            />
            <NumberInput label="Points" min={0.5} step={0.5} w={90} value={cost} onChange={setCost} />
            <Button
              type="submit"
              loading={createTreat.isPending}
              disabled={!name.trim() || !(Number(cost) > 0)}
            >
              Add treat
            </Button>
          </Group>
        </form>
      )}
      {(createTreat.isError || deleteTreat.isError) && (
        <Text size="sm" c="red" mt="sm">
          {createTreat.error?.message ?? deleteTreat.error?.message}
        </Text>
      )}
      <EditTreatModal treat={editing} onClose={() => setEditing(null)} />
    </Paper>
  );
}

function EditTreatModal({ treat, onClose }: { treat: Treat | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [cost, setCost] = useState<number | string>(10);
  // Render-time state reset, keyed by which treat is open (see Rules.tsx)
  const [initializedFor, setInitializedFor] = useState<number | null>(null);

  if (treat && initializedFor !== treat.id) {
    setInitializedFor(treat.id);
    setName(treat.name);
    setCost(treat.pointCost);
  }

  const updateTreat = useMutation({
    mutationFn: (input: { name: string; pointCost: number }) => api.updateTreat(treat!.id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treats"] });
      onClose();
    },
  });

  const close = () => {
    setInitializedFor(null);
    updateTreat.reset();
    onClose();
  };

  return (
    <Modal opened={treat !== null} onClose={close} title="Edit treat" centered>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          updateTreat.mutate({ name, pointCost: Number(cost) });
        }}
      >
        <Stack>
          <TextInput
            label="Treat"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            data-autofocus
          />
          <NumberInput label="Points" min={0.5} step={0.5} value={cost} onChange={setCost} />
          {updateTreat.isError && (
            <Text size="sm" c="red">
              {updateTreat.error.message}
            </Text>
          )}
          <Group justify="flex-end">
            <Button variant="subtle" color="gray" onClick={close}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={updateTreat.isPending}
              disabled={!name.trim() || !(Number(cost) > 0)}
            >
              Save
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
