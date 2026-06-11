import { Fragment, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
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
import { modals } from "@mantine/modals";
import { METRIC_LABELS, SPORT_METRICS, SPORT_TYPES } from "@pint-points/shared";
import type { Metric, Rule, SportType } from "@pint-points/shared";
import { TreatsSection } from "../components/TreatsSection";
import { api } from "../lib/api";

const spaced = (s: string) => s.replace(/([a-z])([A-Z])/g, "$1 $2");


const metricOptionsFor = (sport: string) =>
  (SPORT_METRICS[sport as SportType] ?? []).map((m) => ({
    value: m,
    label: METRIC_LABELS[m].replace("per ", ""),
  }));
// Keep the selected metric legal when the sport changes
const clampMetric = (sport: string, metric: Metric): Metric => {
  const allowed = SPORT_METRICS[sport as SportType] ?? [];
  return allowed.includes(metric) ? metric : allowed[0];
};

const describeRule = (rule: Rule) =>
  `${spaced(rule.sportType)}: ${rule.pointsPerUnit} ${rule.pointsPerUnit === 1 ? "pt" : "pts"} ${METRIC_LABELS[rule.metric]}`;

export default function Points() {
  const queryClient = useQueryClient();
  const rules = useQuery({ queryKey: ["rules"], queryFn: api.rules });
  const sportStats = useQuery({ queryKey: ["sportStats"], queryFn: api.sportStats });

  const [sportType, setSportType] = useState<string>("Run");
  const [metric, setMetric] = useState<Metric>("miles");
  // number | string because NumberInput emits "" when cleared; Number()-ed on submit
  const [rate, setRate] = useState<number | string>(1);
  const [editing, setEditing] = useState<Rule | null>(null);

  // Sports that already have a rule — excluded from the add form dropdown.
  const ruledSports = new Set((rules.data ?? []).map((r) => r.sportType));

  // Top sport types from actual activity data, surfaced as a group in the dropdown.
  // Exclude sports that already have a rule.
  const topSports = (sportStats.data ?? [])
    .filter((s) => s.sportType in SPORT_METRICS && !ruledSports.has(s.sportType))
    .slice(0, 3)
    .map((s) => s.sportType);
  const restSports = SPORT_TYPES.filter((t) => !topSports.includes(t) && !ruledSports.has(t));
  const sportOptions = topSports.length > 0
    ? [
        { group: "Your activities", items: topSports.map((t) => ({ value: t, label: spaced(t) })) },
        { group: "All sports", items: restSports.map((t) => ({ value: t, label: spaced(t) })) },
      ]
    : restSports.map((t) => ({ value: t, label: spaced(t) }));

  const createRule = useMutation({
    mutationFn: api.createRule,
    onSuccess: (rule) => {
      queryClient.invalidateQueries({ queryKey: ["rules"] });
      // Advance to the next available sport so the form is ready for another rule.
      const nextSport = SPORT_TYPES.find(
        (t) => t in SPORT_METRICS && t !== rule.sportType && !ruledSports.has(t),
      );
      if (nextSport) {
        setSportType(nextSport);
        setMetric(clampMetric(nextSport, metric));
      }
    },
  });
  const recalculate = useMutation({
    mutationFn: api.recalculate,
    onSuccess: () => queryClient.invalidateQueries(),
  });

  // Sports you actually do that earn nothing and have no rule yet.
  const suggestions = (sportStats.data ?? []).filter(
    (s) => s.zeroPoints > 0 && s.sportType in SPORT_METRICS && !ruledSports.has(s.sportType),
  );
  // Activities with zero points for sports that DO have a rule — need a recalculate.
  const strandedCount = (sportStats.data ?? [])
    .filter((s) => s.zeroPoints > 0 && ruledSports.has(s.sportType))
    .reduce((sum, s) => sum + s.zeroPoints, 0);

  const confirmRecalculate = async () => {
    const preview = await api.recalculatePreview();
    modals.openConfirmModal({
      title: "Recalculate history?",
      centered: true,
      children: (
        <Text size="sm">
          Every imported activity gets re-scored with your <b>current</b> rules. Your balance
          would go from <b>{preview.currentBalance}</b> to <b>{preview.newBalance}</b> points.
        </Text>
      ),
      labels: { confirm: "Recalculate", cancel: "Cancel" },
      onConfirm: () => recalculate.mutate(),
    });
  };
  const deleteRule = useMutation({
    mutationFn: api.deleteRule,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["rules"] }),
  });

  const confirmDelete = (rule: Rule) =>
    modals.openConfirmModal({
      title: "Remove rule?",
      centered: true,
      children: (
        <Text size="sm">
          Future syncs will stop earning points for <b>{describeRule(rule)}</b>. Points already
          earned are unaffected.
        </Text>
      ),
      labels: { confirm: "Remove", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => deleteRule.mutate(rule.id),
    });

  return (
    <Stack gap="lg">
      <div>
        <Title order={4}>Earning rules</Title>
        <Text size="sm" c="dimmed" mt={4}>
          Each rule converts an activity metric into points. Changes only apply to activities
          synced afterwards.
        </Text>
      </div>

      {suggestions.length > 0 && (
        <Group gap="xs">
          <Text size="sm" c="dimmed">
            Earning nothing right now:
          </Text>
          {suggestions.map((s) => {
            const staged = sportType === s.sportType;
            return (
              <Button
                key={s.sportType}
                size="compact-xs"
                variant={staged ? "filled" : "light"}
                color="yellow"
                onClick={() => {
                  setSportType(s.sportType);
                  setMetric(clampMetric(s.sportType, metric));
                }}
              >
                {spaced(s.sportType)} ({s.zeroPoints})
              </Button>
            );
          })}
        </Group>
      )}

      <Paper withBorder p="md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createRule.mutate({ sportType, metric, pointsPerUnit: Number(rate) });
          }}
        >
          <Group align="flex-end" wrap="wrap">
            <Select
              label="Activity"
              data={sportOptions}
              value={sportType}
              onChange={(v) => {
                if (!v) return;
                setSportType(v);
                setMetric(clampMetric(v, metric));
              }}
              allowDeselect={false}
              w={{ base: "100%", sm: 180 }}
            />
            <NumberInput label="Points" min={0.1} step={0.1} w={90} value={rate} onChange={setRate} />
            <Select
              label="Per"
              data={metricOptionsFor(sportType)}
              value={metric}
              onChange={(v) => v && setMetric(v as Metric)}
              allowDeselect={false}
              w={{ base: "auto", sm: 150 }}
              style={{ flex: 1 }}
            />
            <Button type="submit" loading={createRule.isPending} disabled={!(Number(rate) > 0)}>
              Add rule
            </Button>
          </Group>
          {createRule.isError && (
            <Text size="sm" c="red" mt="sm">
              {createRule.error.message}
            </Text>
          )}
        </form>
        {strandedCount > 0 && (
          <Group gap="xs" mt="sm">
            <Text size="sm" c="yellow.4">
              {strandedCount} past {strandedCount === 1 ? "activity" : "activities"} could earn
              points under your current rules.
            </Text>
            <Button
              size="compact-xs"
              variant="light"
              loading={recalculate.isPending}
              onClick={confirmRecalculate}
            >
              Recalculate
            </Button>
          </Group>
        )}
      </Paper>

      {rules.data?.length ? (
        <Paper withBorder>
          {rules.data.map((rule, i) => (
            <Fragment key={rule.id}>
              {i > 0 && <Divider />}
              <Group justify="space-between" px="md" py="sm">
                <Text size="sm">
                  <Text span fw={600}>
                    {spaced(rule.sportType)}
                  </Text>{" "}
                  <Text span c="dimmed">
                    · {rule.pointsPerUnit} {rule.pointsPerUnit === 1 ? "pt" : "pts"}{" "}
                    {METRIC_LABELS[rule.metric]}
                  </Text>
                </Text>
                <Group gap="xs">
                  <Button size="compact-xs" variant="subtle" onClick={() => setEditing(rule)}>
                    Edit
                  </Button>
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    color="red"
                    onClick={() => confirmDelete(rule)}
                  >
                    Remove
                  </Button>
                </Group>
              </Group>
            </Fragment>
          ))}
        </Paper>
      ) : (
        <Text size="sm" c="dimmed">
          No rules yet. Without rules, synced activities earn 0 points.
        </Text>
      )}

      <EditRuleModal rule={editing} onClose={() => setEditing(null)} />

      <Divider my="sm" />

      <TreatsSection />
    </Stack>
  );
}

const sportOptions = SPORT_TYPES.map((t) => ({ value: t, label: spaced(t) }));

function EditRuleModal({ rule, onClose }: { rule: Rule | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [sportType, setSportType] = useState<string>("Run");
  const [metric, setMetric] = useState<Metric>("miles");
  const [rate, setRate] = useState<number | string>(1);
  // Track which rule the local state was initialized from; re-sync when a
  // different rule is opened. (Render-time state reset, per React docs.)
  const [initializedFor, setInitializedFor] = useState<number | null>(null);

  if (rule && initializedFor !== rule.id) {
    setInitializedFor(rule.id);
    setSportType(rule.sportType);
    setMetric(rule.metric);
    setRate(rule.pointsPerUnit);
  }

  const updateRule = useMutation({
    mutationFn: (input: { sportType: string; metric: Metric; pointsPerUnit: number }) =>
      api.updateRule(rule!.id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rules"] });
      onClose();
    },
  });

  const close = () => {
    setInitializedFor(null);
    updateRule.reset();
    onClose();
  };

  return (
    <Modal opened={rule !== null} onClose={close} title="Edit rule" centered>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          updateRule.mutate({ sportType, metric, pointsPerUnit: Number(rate) });
        }}
      >
        <Stack>
          <Select
            label="Activity"
            data={sportOptions}
            value={sportType}
            onChange={(v) => {
              if (!v) return;
              setSportType(v);
              setMetric(clampMetric(v, metric));
            }}
            allowDeselect={false}
          />
          <NumberInput label="Points" min={0.1} step={0.1} value={rate} onChange={setRate} />
          <Select
            label="Per"
            data={metricOptionsFor(sportType)}
            value={metric}
            onChange={(v) => v && setMetric(v as Metric)}
            allowDeselect={false}
          />
          <Text size="xs" c="dimmed">
            Changes apply to future syncs. Points already earned keep their value.
          </Text>
          {updateRule.isError && (
            <Text size="sm" c="red">
              {updateRule.error.message}
            </Text>
          )}
          <Group justify="flex-end">
            <Button variant="subtle" color="gray" onClick={close}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={updateRule.isPending}
              disabled={!(Number(rate) > 0)}
            >
              Save
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
