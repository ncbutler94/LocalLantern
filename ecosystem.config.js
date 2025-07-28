module.exports = {
  apps: [
    {
      name: "the-local-lantern-backend",
      script: "backend/src/index.js",
      watch: true,
      env: {
        NODE_ENV: "development"
      },
      env_production: {
        NODE_ENV: "production"
      }
    },
    {
      name: "the-local-lantern-frontend",
      script: "npm",
      args: "start",
      cwd: "frontend",
      watch: false,
      env: {
        NODE_ENV: "development"
      }
    }
  ]
};
