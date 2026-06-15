import { getPrismaClient } from "./client.js";

export class MetricRepo {
  async track(eventType: string, properties?: Record<string, unknown>): Promise<void> {
    const prisma = getPrismaClient();
    await prisma.metricEvent.create({
      data: {
        eventType,
        properties: properties ? JSON.stringify(properties) : null,
      },
    });
  }

  async count(eventType: string, sinceMinutes?: number): Promise<number> {
    const prisma = getPrismaClient();
    const where: Record<string, unknown> = { eventType };
    if (sinceMinutes) {
      where.createdAt = { gte: new Date(Date.now() - sinceMinutes * 60000) };
    }
    return prisma.metricEvent.count({ where: where as any });
  }
}
