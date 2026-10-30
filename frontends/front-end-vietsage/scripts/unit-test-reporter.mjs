export default async function* report(events) {
  let summary;
  for await (const event of events) {
    if (event.type === "test:fail") {
      const error = event.data.details.error?.cause ?? event.data.details.error;
      yield `FAIL ${event.data.name}: ${String(error?.message).slice(0, 300)}\n`;
    }
    if (event.type === "test:stderr" && /(?:Error|ERROR|Cannot)/.test(event.data.message)) {
      yield event.data.message.slice(0, 800);
    }
    if (event.type === "test:summary") summary = event.data;
  }
  if (summary) yield `${JSON.stringify(summary.counts)} duration=${summary.duration_ms}ms\n`;
}
