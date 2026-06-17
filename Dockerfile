# Use the official Bun image
FROM oven/bun:1.1-alpine AS base
WORKDIR /usr/src/app

# Copy package files
COPY package.json ./

# Install dependencies
RUN bun install

# Copy all source files
COPY . .

# Build React Dashboard
WORKDIR /usr/src/app/dashboard
RUN bun install
RUN bun run build

# Return to root
WORKDIR /usr/src/app

# Expose port 3000
EXPOSE 3000

# Start the server using Bun
CMD ["bun", "run", "index.js"]
