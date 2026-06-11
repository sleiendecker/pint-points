import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Avatar,
  Group,
  Menu,
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

  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["me"] }),
  });

  const disconnect = useMutation({
    mutationFn: api.disconnectStrava,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["me"] }),
  });

  const confirmDisconnect = () =>
    modals.openConfirmModal({
      title: "Disconnect Strava?",
      centered: true,
      children: (
        <Text size="sm">
          Syncing will stop. Your points history stays intact. You can reconnect any time from
          the dashboard.
        </Text>
      ),
      labels: { confirm: "Disconnect", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => disconnect.mutate(),
    });

  const name = me.data?.firstname;

  return (
    <Menu position="bottom-end" width={200}>
      <Menu.Target>
        <UnstyledButton aria-label="User menu">
          <Group gap="xs">
            <Avatar src={me.data?.profile} radius="xl" size={30} alt={name ?? "User"}>
              🍺
            </Avatar>
            {name && (
              <Text size="sm" fw={500} visibleFrom="xs">
                {name}
              </Text>
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
        <Menu.Item onClick={() => setColorScheme(dark ? "light" : "dark")}>
          {dark ? "Light mode" : "Dark mode"}
        </Menu.Item>
        <Menu.Divider />
        {me.data?.connected && (
          <Menu.Item color="orange" onClick={confirmDisconnect}>
            Disconnect Strava
          </Menu.Item>
        )}
        <Menu.Item color="red" onClick={() => logout.mutate()}>
          Log out
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
