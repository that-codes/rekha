import net from "node:net";

export function isPortFree(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, host);
  });
}

export function nodeMajor(): number {
  return Number(process.versions.node.split(".")[0] ?? "0");
}
