export async function confirm(message: string): Promise<boolean> {
  process.stdout.write(`${message} [y/N] `);
  const response = await new Promise<string>((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.once("data", (chunk: string) => {
      process.stdin.pause();
      data += chunk;
      resolve(data.trim().toLowerCase());
    });
    process.stdin.resume();
  });
  return response === "y" || response === "yes";
}
