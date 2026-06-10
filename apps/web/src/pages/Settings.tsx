import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Group, Paper, Stack, Text, TextInput, Title } from "@mantine/core";
import { modals } from "@mantine/modals";
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
