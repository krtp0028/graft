import "./styles.css";
import { mountShell } from "./shell";

const app = document.querySelector<HTMLDivElement>("#app");

if (app) {
  mountShell(app);
}
