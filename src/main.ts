import "./styles.css";

const app = document.querySelector<HTMLDivElement>("#app");

if (app) {
  const shell = document.createElement("main");
  shell.className = "shell";

  const heading = document.createElement("h1");
  heading.textContent = "Graft";

  const subtitle = document.createElement("p");
  subtitle.textContent = "Lightweight hierarchical Markdown notes";

  shell.append(heading, subtitle);
  app.append(shell);
}
