import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { flushSync } from "react-dom";
import { Link } from "react-router-dom";
import {
  Avatar,
  Group,
  Menu,
  Skeleton,
  Text,
  UnstyledButton,
  useMantineColorScheme,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { api } from "../lib/api";

export function UserMenu() {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const dark = colorScheme === "dark";

  // Cross-fade the whole page during the scheme switch via the View
  // Transitions API: the browser snapshots the old page and fades it into
  // the new one as a single animation, so text and surfaces all fade
  // together with nothing to clean up afterwards.
  const toggleScheme = () => {
    const next = dark ? "light" : "dark";
    if (document.startViewTransition) {
      document.startViewTransition(() => flushSync(() => setColorScheme(next)));
    } else {
      setColorScheme(next);
    }
  };

  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: () => queryClient.clear(),
  });

  const confirmLogout = () =>
    modals.openConfirmModal({
      title: "Log out?",
      centered: true,
      children: (
        <Text size="sm">
          You'll need to reconnect via Strava to log back in. Your points history stays intact.
        </Text>
      ),
      labels: { confirm: "Log out", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => logout.mutate(),
    });

  const name = me.data?.firstname;

  return (
    <Menu position="bottom-end" width={200}>
      <Menu.Target>
        <UnstyledButton aria-label="User menu">
          <Group gap="xs">
            <Avatar src={me.data?.connected ? me.data.profile : null} radius="xl" size={30} alt={name ?? "User"} />
            {me.data?.connected ? (
              name && (
                <Text size="sm" fw={500} visibleFrom="xs">
                  {name}
                </Text>
              )
            ) : (
              <Skeleton height={12} width={56} radius="xl" visibleFrom="xs" />
            )}
          </Group>
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        {me.data?.connected ? (
          <Menu.Label>Connected via Strava</Menu.Label>
        ) : (
          <Menu.Label>Strava not connected</Menu.Label>
        )}
        {me.data?.stravaAthleteId != null && (
          <Menu.Item
            component="a"
            href={`https://www.strava.com/athletes/${me.data.stravaAthleteId}`}
            target="_blank"
            rel="noopener"
          >
            Strava profile ↗
          </Menu.Item>
        )}
        <Menu.Item component={Link} to="/settings">
          Settings
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item onClick={toggleScheme}>
          {dark ? "Light mode" : "Dark mode"}
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item color="red" onClick={confirmLogout}>
          Log out
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
