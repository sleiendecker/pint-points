import { useState } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import {
  AppShell,
  Box,
  Burger,
  Button,
  Container,
  Group,
  Menu,
  Title,
  Text,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "./lib/api";
import Dashboard from "./pages/Dashboard";
import Points from "./pages/Points";
import Activities from "./pages/Activities";
import Settings from "./pages/Settings";
import Login from "./pages/Login";
import Onboarding from "./pages/Onboarding";
import { UserMenu } from "./components/UserMenu";

const tabs = [
  { to: "/", label: "Dashboard" },
  { to: "/activities", label: "Activities" },
  { to: "/points", label: "Points" },
];

export default function App() {
  const { pathname } = useLocation();
  const [navOpened, setNavOpened] = useState(false);
  const me = useQuery({ queryKey: ["me"], queryFn: api.me, retry: false });

  // Unauthenticated: show login page (no app shell).
  if (me.error instanceof ApiError && me.error.status === 401) {
    return <Login />;
  }

  // New user hasn't completed onboarding yet.
  if (me.data?.startDate === null) {
    return <Onboarding />;
  }

  // API down or other error.
  if (me.isError) {
    return (
      <Container size="sm" py="xl">
        <Text c="red">Can't reach the API. Is it running? ({me.error.message})</Text>
      </Container>
    );
  }

  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Container size="sm" h="100%">
          {/* Desktop: single row */}
          <Group h="100%" justify="space-between" visibleFrom="sm">
            <Group gap="xl">
              <Link to="/" style={{ textDecoration: "none", color: "inherit" }}>
                <Title order={3}>🍺 pintpoints</Title>
              </Link>
              <Group gap="xs">
                {tabs.map((tab) => {
                  const active = pathname === tab.to;
                  return (
                    <Button
                      key={tab.to}
                      component={Link}
                      to={tab.to}
                      size="compact-sm"
                      variant={active ? "light" : "subtle"}
                      color={active ? "yellow" : "gray"}
                    >
                      {tab.label}
                    </Button>
                  );
                })}
              </Group>
            </Group>
            <UserMenu />
          </Group>
          {/* Mobile: burger nav, centered title, avatar */}
          <Group h="100%" justify="space-between" wrap="nowrap" hiddenFrom="sm">
            <Box w={44}>
              <Menu
                position="bottom-start"
                width={180}
                opened={navOpened}
                onChange={setNavOpened}
              >
                <Menu.Target>
                  <Burger
                    opened={navOpened}
                    size="sm"
                    aria-label="Navigation menu"
                  />
                </Menu.Target>
                <Menu.Dropdown>
                  {tabs.map((tab) => {
                    const active = pathname === tab.to;
                    return (
                      <Menu.Item
                        key={tab.to}
                        component={Link}
                        to={tab.to}
                        color={active ? "yellow" : undefined}
                        fw={active ? 600 : undefined}
                      >
                        {tab.label}
                      </Menu.Item>
                    );
                  })}
                </Menu.Dropdown>
              </Menu>
            </Box>
            <Link to="/" style={{ textDecoration: "none", color: "inherit" }}>
              <Title order={3}>🍺 pintpoints</Title>
            </Link>
            <Box w={44} style={{ display: "flex", justifyContent: "flex-end" }}>
              <UserMenu />
            </Box>
          </Group>
        </Container>
      </AppShell.Header>
      <AppShell.Main>
        <Container size="sm" py="lg">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/activities" element={<Activities />} />
            <Route path="/points" element={<Points />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}
