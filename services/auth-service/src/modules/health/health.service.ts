import { Injectable } from "@nestjs/common";

export interface HealthResponse {
  status: "ok";
  service: string;
  uptimeSeconds: number;
  timestamp: string;
}

@Injectable()
export class HealthService {
  getHealth(): HealthResponse {
    return {
      status: "ok",
      service: "auth-service",
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
