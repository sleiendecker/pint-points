import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Container,
  Group,
  Input,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { api } from "../lib/api";

type Choice = "fresh" | "history";

export default function Onboarding() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [choice, setChoice] = useState<Choice | null>(null);
  const [date, setDate] = useState<string>("");

  const submit = useMutation({
    mutationFn: (startDate: number) => api.onboarding(startDate),
    onSuccess: () => {
      queryClient.invalidateQueries();
      navigate("/points");
    },
  });

  function handleContinue() {
    if (choice === "fresh") {
      submit.mutate(Math.floor(Date.now() / 1000));
    } else if (choice === "history" && date) {
      // Parse as local midnight to avoid off-by-one from UTC parsing.
      submit.mutate(Math.floor(new Date(`${date}T00:00:00`).getTime() / 1000));
    }
  }

  const canContinue = choice === "fresh" || (choice === "history" && date !== "");

  return (
    <Container size="xs" py={60}>
      <Stack gap="xl">
        <div>
          <Title order={2}>Welcome to pintpoints 🍺</Title>
          <Text c="dimmed" mt={4}>
            Your Strava is connected. When should we start counting activities?
          </Text>
        </div>

        <Stack gap="sm">
          <OptionCard
            selected={choice === "fresh"}
            onClick={() => setChoice("fresh")}
            title="Start fresh"
            description="Only count activities from today onwards."
          />
          <OptionCard
            selected={choice === "history"}
            onClick={() => setChoice("history")}
            title="Import past activities"
            description="Pick a date and we'll sync everything since then."
          />
        </Stack>

        {choice === "history" && (
          <Input.Wrapper label="Count activities from">
            <Input
              component="input"
              type="date"
              max={new Date().toISOString().split("T")[0]}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Input.Wrapper>
        )}

        {submit.isError && (
          <Text size="sm" c="red">
            {submit.error.message}
          </Text>
        )}

        <Group justify="flex-end">
          <Button
            disabled={!canContinue}
            loading={submit.isPending}
            onClick={handleContinue}
          >
            {submit.isPending ? "Syncing…" : "Let's go"}
          </Button>
        </Group>
      </Stack>
    </Container>
  );
}

function OptionCard({
  selected,
  onClick,
  title,
  description,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  description: string;
}) {
  return (
    <Paper
      withBorder
      p="md"
      onClick={onClick}
      style={{
        cursor: "pointer",
        borderColor: selected ? "var(--mantine-color-yellow-5)" : undefined,
        borderWidth: selected ? 2 : undefined,
      }}
    >
      <Text fw={600}>{title}</Text>
      <Text size="sm" c="dimmed">
        {description}
      </Text>
    </Paper>
  );
}
