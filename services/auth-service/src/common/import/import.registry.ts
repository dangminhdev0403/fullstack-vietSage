import { Injectable } from "@nestjs/common";
import { ImportAdapter } from "./import.types";

@Injectable()
export class ImportRegistry {
  private readonly adapters = new Map<string, ImportAdapter>();

  register(adapter: ImportAdapter): void {
    if (this.adapters.has(adapter.type)) {
      throw new Error(`Import adapter already registered: ${adapter.type}`);
    }

    this.adapters.set(adapter.type, adapter);
  }

  get(type: string): ImportAdapter {
    const adapter = this.adapters.get(type);
    if (!adapter) {
      throw new Error(`Import adapter not registered: ${type}`);
    }

    return adapter;
  }

  list(): ImportAdapter[] {
    return Array.from(this.adapters.values());
  }
}
