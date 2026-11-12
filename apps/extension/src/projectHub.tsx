import { boot } from "./boot";
import { Dashboard } from "./components/Dashboard";
import { createContext } from "./data/context";
import { FIXTURE_PROJECT } from "./data/fixtureSource";

boot(async () => {
  const ctx = await createContext();
  const project = ctx.host.project ?? (ctx.source.mode === "fixture" ? FIXTURE_PROJECT : undefined);
  if (!project) throw new Error("This page must be opened from inside a project.");
  ctx.host.project = project;
  return <Dashboard ctx={ctx} scope={{ kind: "project", projectId: project.id }} />;
});
