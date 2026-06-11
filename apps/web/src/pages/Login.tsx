import { useSearchParams } from "react-router-dom";
import { Alert, Button, Center, Stack, Text, Title } from "@mantine/core";

export default function Login() {
  const [params] = useSearchParams();
  const error = params.get("error");

  return (
    <Center h="100vh">
      <Stack align="center" gap="xl" maw={360} px="md">
        <div style={{ textAlign: "center" }}>
          <Title order={1} fz={48}>
            🍺
          </Title>
          <Title order={2} mt="xs">
            pint points
          </Title>
          <Text c="dimmed" mt="xs">
            Earn your beer. Connect Strava and let your workouts pay for your pints.
          </Text>
        </div>

        {error === "not_allowed" && (
          <Alert color="red" w="100%">
            This app is invite-only. Your Strava account isn't on the list.
          </Alert>
        )}
        {error === "strava_failed" && (
          <Alert color="red" w="100%">
            Something went wrong connecting to Strava. Try again.
          </Alert>
        )}

        <Button
          component="a"
          href="/api/strava/connect"
          size="lg"
          style={{ backgroundColor: "#fc4c02" }}
          c="white"
          fullWidth
        >
          Sign in with Strava
        </Button>
      </Stack>
    </Center>
  );
}
