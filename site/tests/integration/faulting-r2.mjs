import { WorkerEntrypoint } from "cloudflare:workers";

// Test-only R2 facade: uploads reach the real local bucket, while cleanup
// deletion fails inside workerd after the app's D1 write has failed.
export default class FaultingR2 extends WorkerEntrypoint {
  async put(key, value, options) {
    await this.env.STORAGE.put(key, value, options);
    return { key };
  }

  async delete() {
    throw new Error("injected R2 delete failure");
  }

  async list(options) {
    const page = await this.env.STORAGE.list(options);
    return {
      objects: page.objects.map(({ key, size, uploaded }) => ({ key, size, uploaded })),
      truncated: page.truncated,
      cursor: page.cursor,
    };
  }
}
