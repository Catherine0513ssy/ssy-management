module.exports = {
  apps: [{
    name: "ssy",
    script: "server.js",
    cwd: "/var/www/ssy",
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: "500M",
    env: {
      NODE_ENV: "production",
      PORT: 3000
    },
    error_file: "/var/www/ssy/logs/error.log",
    out_file: "/var/www/ssy/logs/out.log",
    log_date_format: "YYYY-MM-DD HH:mm:ss"
  }]
};
