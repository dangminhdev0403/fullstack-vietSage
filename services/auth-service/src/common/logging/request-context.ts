import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestLogContext {
  requestId: string;
  method?: string;
  url?: string;
  ip?: string;
  userAgent?: string;
  userId?: string;
  userEmail?: string;
  roleId?: string;
  guestSessionId?: string;
  guestStayId?: string;
  guestRoomId?: string;
}

const storage = new AsyncLocalStorage<RequestLogContext>();

export const RequestContext = {
  run<T>(context: RequestLogContext, callback: () => T): T {
    return storage.run(context, callback);
  },

  get(): RequestLogContext | undefined {
    return storage.getStore();
  },

  update(partial: Partial<RequestLogContext>): void {
    const current = storage.getStore();
    if (!current) {
      return;
    }

    Object.assign(current, partial);
  },
};
