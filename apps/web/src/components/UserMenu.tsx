import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Avatar,
  Group,
  Menu,
  Text,
  UnstyledButton,
  useMantineColorScheme,
} from "@mantine/core";
import { api } from "../lib/api";

export function UserMenu() {
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const dark = colorScheme === "dark";

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
          <Menu.Label>Not connected</Menu.Label>
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
      </Menu.Dropdown>
    </Menu>
  );
}
