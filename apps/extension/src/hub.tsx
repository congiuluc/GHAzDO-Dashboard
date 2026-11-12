import { boot } from "./boot";
import { Dashboard } from "./components/Dashboard";
import { createContext } from "./data/context";

boot(async () => {
  const ctx = await createContext();
  return <Dashboard ctx={ctx} scope={{ kind: "organization" }} />;
});
