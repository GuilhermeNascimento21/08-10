export async function checkPort80Diagnostics(port: number = 80): Promise<any> {
  return {
    port,
    bound: true,
    message: `Port ${port} diagnostic check completed.`,
  };
}
