// PM2 配置：cd 到项目根目录后执行 pm2 start ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'exam199-study',
      script: './server/index.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3005,
        HOST: '127.0.0.1',
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      merge_logs: true,
      max_memory_restart: '400M',
    },
  ],
}
