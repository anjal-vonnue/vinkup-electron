import app from './app';
import { env } from './config/env';
import { startCheckpointDeadlineProcessor } from './module/checkpoint-module/checkpoint.deadline';

app.listen(env.PORT, () => {
  console.log(`server listening on port:${env.PORT}`);
  // Backend-owned deadline enforcement: finalises expired attempts even when no
  // trainee browser is open.
  startCheckpointDeadlineProcessor();
});
