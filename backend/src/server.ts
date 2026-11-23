import app from './app';
import { env } from './config/env';
import { slackNotificationWorker } from './module/slack-module/slack-notification.worker';

const server = app.listen(env.PORT, () => {
  console.log(`server listening on port:${env.PORT}`);
  slackNotificationWorker.start();
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] received ${signal}, shutting down`);
  await slackNotificationWorker.stop();
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
