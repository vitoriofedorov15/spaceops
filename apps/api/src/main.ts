import { createApp } from './bootstrap';
createApp()
  .then((app) => app.listen(Number(process.env.PORT ?? 3001), '0.0.0.0'))
  .catch(() => {
    console.error('API startup failed. Check database connection and migrations.');
    process.exit(1);
  });
