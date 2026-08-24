# --- BASE STAGE ---
FROM node:24-alpine AS base
WORKDIR /app
COPY package*.json ./

# --- DEPENDENCIES STAGE ---
FROM base AS dependencies
RUN npm ci

# --- BUILD STAGE ---
FROM dependencies AS build
COPY . .
RUN npm run build

# --- PRODUCTION DEPENDENCIES STAGE ---
FROM base AS prod-dependencies
RUN npm ci --omit=dev

# --- RUNNER STAGE (FOR STAGING & PRODUCTION) ---
FROM node:24-alpine AS runner
WORKDIR /app

# Run as a non-privileged user for security
USER node

# Copy only what is needed to run the app
COPY --from=prod-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./package.json

EXPOSE 3000

CMD ["node", "dist/main.js"]
