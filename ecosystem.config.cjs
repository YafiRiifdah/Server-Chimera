module.exports = {
  apps: [
    {
      name: 'chimera',
      script: './server/src/index.js',
      cwd: __dirname,
      // Harus SATU proses mode fork: SQLite, sesi upload chunked, dan pembatas laju login
      // disimpan di memori/berkas proses ini. Cluster mode dengan >1 instance akan merusaknya.
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
