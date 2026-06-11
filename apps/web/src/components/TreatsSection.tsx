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

export function TreatsSection() {
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
    <Stack gap="lg">
      <div>
        <Title order={4}>Treats</Title>
        <Text size="sm" c="dimmed" mt={4}>
          Your reward menu: what points can be cashed in for, and the price of each. Max{" "}
          {MAX_TREATS}; keep it curated.
        </Text>
      </div>

      {count < MAX_TREATS && (
        <Paper withBorder p="md">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createTreat.mutate({ name, pointCost: Number(cost) });
            }}
          >
            <Group align="flex-end">
              <TextInput
                label="Treat"
                placeholder="Enter treat"
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                w={180}
              />
              <NumberInput
                label="Points"
                min={0.5}
                step={0.5}
                w={90}
                value={cost}
                onChange={setCost}
              />
              <Button
                type="submit"
                loading={createTreat.isPending}
                disabled={!name.trim() || !(Number(cost) > 0)}
              >
                Add treat
              </Button>
            </Group>
          </form>
          {(createTreat.isError || deleteTreat.isError) && (
            <Text size="sm" c="red" mt="sm">
              {createTreat.error?.message ?? deleteTreat.error?.message}
            </Text>
          )}
        </Paper>
      )}

      {treats.data?.length ? (
        <Paper withBorder>
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

      <EditTreatModal treat={editing} onClose={() => setEditing(null)} />
    </Stack>
  );
}

function EditTreatModal({ treat, onClose }: { treat: Treat | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [cost, setCost] = useState<number | string>(10);
  // Render-time state reset, keyed by which treat is open
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
