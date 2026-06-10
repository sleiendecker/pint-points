import { Link, Route, Routes, useLocation } from "react-router-dom";
import { AppShell, Button, Container, Group, Title } from "@mantine/core";
import Dashboard from "./pages/Dashboard";
import Points from "./pages/Points";
import Activities from "./pages/Activities";
import Settings from "./pages/Settings";

const tabs = [
  { to: "/", label: "Dashboard" },
  { to: "/activities", label: "Activities" },
  { to: "/points", label: "Points" },
  { to: "/settings", label: "Settings" },
];

export default function App() {
  const { pathname } = useLocation();

  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Container size="sm" h="100%">
          <Group h="100%" gap="xl">
            <Title
              order={3}
              component={Link}
              to="/"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              🍺 pintpoints
            </Title>
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
