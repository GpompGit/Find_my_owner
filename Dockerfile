# Dockerfile — Quartier Bike ID
#
# Builds a production-ready container for the Express application.
# Uses a multi-stage build for smaller image size:
#   Stage 1 (builder): installs ALL dependencies (including devDependencies)
#   Stage 2 (production): copies only production dependencies + app code
#
# Base image: Node.js 18 Alpine Linux (~50MB vs ~350MB for full Debian)
# Alpine is a minimal Linux distro — perfect for containers.
#
# Build: docker build -t quartier-bike-id .
# Run:   docker run -p 8080:8080 --env-file .env quartier-bike-id

# ─── Stage 1: Build ─────────────────────────────────────────────────────────
# Install all dependencies (including dev) for any build steps.
# This stage is thrown away — only production deps make it to the final image.
FROM node:18-alpine AS builder

# Set the working directory inside the container.
# All subsequent commands run from this directory.
WORKDIR /app

# Copy package files FIRST (before app code).
# Docker caches each layer — if package.json hasn't changed,
# npm install is skipped on rebuild (saves minutes).
COPY package.json package-lock.json ./

# Install ALL dependencies (including devDependencies).
# This stage exists so we can run any build steps if needed later.
RUN npm ci

# ─── Stage 2: Production ────────────────────────────────────────────────────
# Start fresh from a clean Node.js Alpine image.
# Only production code and dependencies are copied here.
FROM node:18-alpine

# Add metadata labels for container registries.
LABEL maintainer="Guillermo Pomphile"
LABEL description="Quartier Bike ID — Community bicycle registration"
LABEL version="1.0.0"

# Set the working directory
WORKDIR /app

# Set Node.js to production mode.
# This disables debug features and optimises performance.
ENV NODE_ENV=production

# Copy package files and install ONLY production dependencies.
# --omit=dev skips devDependencies (mocha, chai, supertest).
# npm ci uses the lockfile for exact, reproducible installs.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy the application source code.
# We copy specific directories to avoid including unnecessary files
# (node_modules, .git, .env, etc. are excluded by .dockerignore).
COPY app.js cleanup.js ./
COPY routes/ ./routes/
COPY middleware/ ./middleware/
COPY views/ ./views/
COPY public/ ./public/
COPY locales/ ./locales/
COPY db/ ./db/
COPY utils/ ./utils/
COPY scripts/ ./scripts/

# Create the upload directories.
# These will be mounted as Docker volumes for persistence.
RUN mkdir -p uploads/photos uploads/qr

# Create a non-root user for security.
# Running as root inside a container is a security risk —
# if the app is compromised, the attacker has root access.
# The 'appuser' has no privileges beyond the /app directory.
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Set ownership of the app directory to the non-root user
RUN chown -R appuser:appgroup /app

# Switch to the non-root user
USER appuser

# Expose the port the app listens on.
# This is documentation — it doesn't actually open the port.
# The port is opened when running with -p 8080:8080.
EXPOSE 8080

# Health check — Docker uses this to monitor if the container is healthy.
# Every 30 seconds, it calls /deploy/status and checks for a 200 response.
# If 3 checks fail in a row, Docker marks the container as unhealthy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/deploy/status || exit 1

# Start the application.
# CMD is the default command when the container starts.
# Using ["node", "app.js"] (exec form) so signals are passed correctly
# and the process can shut down gracefully.
CMD ["node", "app.js"]
